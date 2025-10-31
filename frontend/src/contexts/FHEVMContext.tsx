import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { createInstance } from '@fhevm/sdk';

// Gateway 配置
const GATEWAY_URL = 'https://gateway.sepolia.zama.ai';
const SEPOLIA_CHAIN_ID = 11155111;

// Context 类型定义
interface FHEVMContextType {
  fhevmInstance: any;
  gatewayStatus: 'up' | 'down' | 'checking';
  fheStatus: 'up' | 'down' | 'checking'; // Alias for gatewayStatus
  initializeFHEVM: (contractAddress: string, userAddress: string) => Promise<void>;
  isInitialized: boolean;
  encryptAge: (age: number, contractAddress: string, userAddress: string) => Promise<{ encrypted: any; proof: string } | null>;
}

// 创建 Context
const FHEVMContext = createContext<FHEVMContextType | null>(null);

// Provider 组件
export function FHEVMProvider({ children }: { children: ReactNode }) {
  const [fhevmInstance, setFhevmInstance] = useState<any>(null);
  const [gatewayStatus, setGatewayStatus] = useState<'up' | 'down' | 'checking'>('checking');
  const [isInitialized, setIsInitialized] = useState(false);

  // Gateway 健康检查
  const checkGatewayHealth = async (): Promise<boolean> => {
    try {
      const resp = await fetch(`${GATEWAY_URL}/public_key`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000) // 5秒超时
      });
      
      if (!resp.ok) {
        console.warn('⚠️ Gateway 返回错误:', resp.status);
        return false;
      }
      
      const text = await resp.text();
      
      // 验证公钥格式
      if (!text.startsWith('0x04') || text.length < 66) {
        console.warn('⚠️ Gateway 公钥格式无效');
        return false;
      }
      
      console.log('✅ Gateway 在线');
      return true;
    } catch (error) {
      console.warn('⚠️ Gateway 不可用:', error);
      return false;
    }
  };

  // 初始化 FHEVM 实例
  const initializeFHEVM = async (contractAddress: string, userAddress: string) => {
    try {
      console.log('🔄 开始初始化 FHEVM...', { contractAddress, userAddress });
      
      // 检查 Gateway 状态
      const isUp = await checkGatewayHealth();
      setGatewayStatus(isUp ? 'up' : 'down');

      if (isUp) {
        console.log('🔐 创建 FHEVM 实例...');
        
        try {
          // 获取 Gateway 公钥
          const publicKeyResponse = await fetch(`${GATEWAY_URL}/public_key`);
          const publicKey = await publicKeyResponse.text();
          
          if (!publicKey.startsWith('0x04')) {
            throw new Error('Invalid public key format');
          }
          
          // 创建 FHEVM 实例
          const instance = await createInstance({
            chainId: SEPOLIA_CHAIN_ID,
            publicKey: publicKey
          });
          
          setFhevmInstance(instance);
          setIsInitialized(true);
          console.log('✅ FHEVM 实例创建成功');
        } catch (error: any) {
          console.error('❌ FHEVM 实例创建失败:', error);
          setFhevmInstance(null);
          setIsInitialized(false);
          setGatewayStatus('down');
        }
      } else {
        console.log('⚠️ Gateway 离线，将使用 Mock 模式');
        setFhevmInstance(null);
        setIsInitialized(false);
      }
    } catch (error) {
      console.error('❌ FHEVM 初始化失败:', error);
      setGatewayStatus('down');
      setFhevmInstance(null);
      setIsInitialized(false);
    }
  };

  // 加密年龄
  const encryptAge = async (
    age: number,
    contractAddress: string,
    userAddress: string
  ): Promise<{ encrypted: any; proof: string } | null> => {
    try {
      // 如果没有实例，先初始化
      if (!fhevmInstance) {
        await initializeFHEVM(contractAddress, userAddress);
        // 等待一下让实例设置完成
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!fhevmInstance) {
        console.warn('⚠️ FHEVM 实例不可用，无法加密');
        return null;
      }

      console.log('🔐 加密年龄:', age);

      // 使用 FHEVM SDK 加密
      // 根据 @fhevm/sdk 的 API，使用 generateEncryptedInput
      // 注意：@fhevm/sdk 的 API 可能因版本而异，这里使用常见的模式
      let encryptedInput;
      
      // 尝试不同的 API 调用方式
      if (typeof fhevmInstance.generateEncryptedInput === 'function') {
        encryptedInput = fhevmInstance.generateEncryptedInput(contractAddress, userAddress);
      } else if (typeof fhevmInstance.createEncryptedInput === 'function') {
        encryptedInput = fhevmInstance.createEncryptedInput(contractAddress, userAddress);
      } else {
        throw new Error('FHEVM instance does not support encryption API');
      }

      // 加密年龄值（32位）
      encryptedInput.add32(age);
      const encrypted = encryptedInput.encrypt();

      console.log('✅ 年龄加密成功');

      return {
        encrypted: encrypted.handles[0], // externalEuint32 handle
        proof: encrypted.inputProof // 加密证明
      };
    } catch (error: any) {
      console.error('❌ 加密失败:', error);
      return null;
    }
  };

  // 定时轮询 Gateway 状态（60秒）
  useEffect(() => {
    // 只检查健康状态，不初始化实例（实例需要合约地址和用户地址）
    const checkStatus = async () => {
      const isUp = await checkGatewayHealth();
      setGatewayStatus(isUp ? 'up' : 'down');
      
      if (!isUp && fhevmInstance) {
        // Gateway 离线，清除实例
        setFhevmInstance(null);
        setIsInitialized(false);
      }
    };

    // 立即检查
    checkStatus();

    // 定时检查
    const interval = setInterval(checkStatus, 60000); // 60秒

    return () => clearInterval(interval);
  }, [fhevmInstance]);

  const value: FHEVMContextType = {
    fhevmInstance,
    gatewayStatus,
    fheStatus: gatewayStatus, // Alias for backward compatibility
    initializeFHEVM,
    isInitialized,
    encryptAge
  };

  return (
    <FHEVMContext.Provider value={value}>
      {children}
    </FHEVMContext.Provider>
  );
}

// 自定义 Hook
export function useFHEVM() {
  const context = useContext(FHEVMContext);
  if (!context) {
    throw new Error('useFHEVM 必须在 FHEVMProvider 内部使用');
  }
  return context;
}


