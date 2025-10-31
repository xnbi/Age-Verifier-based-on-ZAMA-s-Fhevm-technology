/**
 * 钱包兼容性工具函数
 * 根据 FHEVM_开发标准与解决方案手册 6节实现
 */

import { ethers } from 'ethers';

// 公共 RPC 列表（Fallback）
const FALLBACK_RPCS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.ankr.com/eth_sepolia',
  'https://eth-sepolia.public.blastapi.io'
];

const SEPOLIA_CHAIN_ID = 11155111;

/**
 * 检测钱包类型
 */
export function detectWalletType(): 'metamask' | 'okx' | 'other' | null {
  if (!window.ethereum) return null;
  
  if (window.ethereum.isMetaMask) {
    return 'metamask';
  }
  
  if ((window.ethereum as any).isOkxWallet) {
    return 'okx';
  }
  
  return 'other';
}

/**
 * 安全的合约调用（读操作）- 使用公共 RPC
 * 根据手册 6.4节：所有读操作使用公共 RPC
 */
export async function safeContractCall(
  contractAddress: string,
  abi: ethers.InterfaceAbi,
  functionName: string,
  args: any[] = []
): Promise<any> {
  const iface = new ethers.Interface(abi);
  const data = iface.encodeFunctionData(functionName, args);

  // 尝试公共 RPC（顺序尝试）
  for (const rpcUrl of FALLBACK_RPCS) {
    try {
      console.log(`🔁 尝试备用 RPC: ${rpcUrl}`);

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const result = await provider.call({
        to: contractAddress,
        data: data
      });

      const decoded = iface.decodeFunctionResult(functionName, result);
      console.log('✅ 公共 RPC 调用成功');
      return decoded[0];
    } catch (error: any) {
      console.warn(`❌ RPC 失败: ${rpcUrl}`, error.message);
      continue;
    }
  }

  throw new Error('所有 RPC 调用均失败');
}

/**
 * OKX 兼容的交易发送（手册 6.2节）
 * 使用 window.ethereum.request 低层 API
 */
export async function sendTransactionOKXCompatible(
  contractAddress: string,
  contractInterface: ethers.Interface,
  functionName: string,
  args: any[],
  signer: ethers.Signer
): Promise<string> {
  const walletType = detectWalletType();
  
  // 获取 from 地址
  const fromAddress = await signer.getAddress();
  
  // 编码交易数据
  const data = contractInterface.encodeFunctionData(functionName, args);

  // ✅ OKX 兼容方式：使用 window.ethereum.request
  if (walletType === 'okx' || walletType === 'other') {
    console.log('📤 使用 OKX 兼容方式发送交易...');
    
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: fromAddress,        // ⚠️ 必须显式指定
        to: contractAddress,      // 合约地址
        data: data,               // 编码后的函数调用
        value: '0x0'              // 交易金额（如果需要）
      }]
    });

    console.log('✅ Transaction sent (OKX mode):', txHash);
    return txHash as string;
  }

  // MetaMask 或其他钱包：使用常规方式
  const contract = new ethers.Contract(contractAddress, contractInterface, signer);
  const tx = await contract[functionName](...args);
  return tx.hash;
}

/**
 * 等待交易确认（使用公共 RPC 轮询）- 手册 6.3节
 * 不依赖钱包 provider 的 waitForTransaction
 */
export async function waitForTransactionWithPublicRpc(
  txHash: string,
  maxAttempts: number = 60
): Promise<ethers.TransactionReceipt> {
  console.log('⏳ 使用公共 RPC 等待交易确认...', txHash);

  // 使用第一个可用的公共 RPC
  let provider: ethers.JsonRpcProvider | null = null;
  for (const rpcUrl of FALLBACK_RPCS) {
    try {
      provider = new ethers.JsonRpcProvider(rpcUrl);
      await provider.getBlockNumber(); // 测试连接
      console.log(`✅ 使用 RPC: ${rpcUrl}`);
      break;
    } catch (error) {
      console.warn(`❌ RPC 不可用: ${rpcUrl}`);
      continue;
    }
  }

  if (!provider) {
    throw new Error('所有公共 RPC 均不可用');
  }

  // 手动轮询交易状态
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);

      if (receipt && receipt.blockNumber) {
        console.log('✅ Transaction confirmed!', {
          blockNumber: receipt.blockNumber,
          status: receipt.status === 1 ? 'success' : 'failed'
        });
        return receipt;
      }
    } catch (error: any) {
      console.warn(`⚠️ 轮询尝试 ${i + 1} 失败:`, error.message);
    }

    // 每 2 秒轮询一次
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(`交易确认超时（${maxAttempts} 次，共 ${(maxAttempts * 2) / 60}分钟）`);
}

/**
 * 创建读写分离的合约实例（手册 6.7节）
 */
export function createReadWriteContracts(
  contractAddress: string,
  abi: ethers.InterfaceAbi,
  walletProvider?: ethers.BrowserProvider
): {
  readContract: ethers.Contract;
  getWriteContract: () => Promise<ethers.Contract>;
} {
  // 读操作：使用公共 RPC
  const publicProvider = new ethers.JsonRpcProvider(FALLBACK_RPCS[0]);
  const readContract = new ethers.Contract(contractAddress, abi, publicProvider);

  // 写操作：使用钱包 signer
  const getWriteContract = async (): Promise<ethers.Contract> => {
    if (!walletProvider) {
      throw new Error('Wallet provider not available');
    }
    const signer = await walletProvider.getSigner();
    return new ethers.Contract(contractAddress, abi, signer);
  };

  return {
    readContract,
    getWriteContract
  };
}

/**
 * 检测钱包环境（手册 6.8节）
 */
export async function diagnoseWalletEnvironment(): Promise<{
  hasEthereum: boolean;
  isMetaMask: boolean;
  isOkxWallet: boolean;
  selectedAddress: string | null;
  chainId: string | null;
  networkCorrect: boolean;
}> {
  const result = {
    hasEthereum: !!window.ethereum,
    isMetaMask: !!window.ethereum?.isMetaMask,
    isOkxWallet: !!(window.ethereum as any)?.isOkxWallet,
    selectedAddress: window.ethereum?.selectedAddress || null,
    chainId: null as string | null,
    networkCorrect: false
  };

  if (window.ethereum) {
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      result.chainId = chainId as string;
      result.networkCorrect = chainId === `0x${SEPOLIA_CHAIN_ID.toString(16)}`;
    } catch (error) {
      console.warn('Failed to get chainId:', error);
    }
  }

  return result;
}

// 类型声明
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      isMetaMask?: boolean;
      selectedAddress?: string;
      on?: (event: string, callback: (args: any) => void) => void;
      removeListener?: (event: string, callback: (args: any) => void) => void;
    };
  }
}

export default {
  detectWalletType,
  safeContractCall,
  sendTransactionOKXCompatible,
  waitForTransactionWithPublicRpc,
  createReadWriteContracts,
  diagnoseWalletEnvironment
};

