import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import AgeVerifierABI from './AgeVerifier.json';
import { FHEVMProvider, useFHEVM } from './contexts/FHEVMContext';
import { useDecryption } from './hooks/useDecryption';
import {
  safeContractCall,
  sendTransactionOKXCompatible,
  waitForTransactionWithPublicRpc,
  createReadWriteContracts,
  detectWalletType
} from './utils/walletCompatibility';
import {
  retryWithBackoff,
  checkAndRetryDecryption,
  withTimeout,
  waitForCondition
} from './utils/retryMechanism';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x';
const NFT_CONTRACT_ADDRESS = import.meta.env.VITE_NFT_CONTRACT_ADDRESS || '0x';

// NFT Contract ABI (Simplified)
const NFT_ABI = [
  "function hasCredential(address) view returns (bool)",
  "function getTokenIdOf(address) view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
  "function balanceOf(address) view returns (uint256)"
];

function AppContent() {
  const { fheStatus, encryptAge } = useFHEVM();
  
  const [account, setAccount] = useState<string>('');
  const [age, setAge] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  // @ts-ignore - used in useEffect but TypeScript doesn't detect it
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  
  // NFT Status
  const [hasNFT, setHasNFT] = useState(false);
  const [nftTokenId, setNFTTokenId] = useState<number>(0);
  const [nftImageUrl, setNFTImageUrl] = useState('');
  const [loadingNFT, setLoadingNFT] = useState(false);

  // Contract instance
  const [contract, setContract] = useState<ethers.Contract | null>(null);

  // 解密 Hook（当 Gateway 在线时使用）
  const {
    requestDecryption,
    status: decryptionStatus,
    progress: decryptionProgress,
    error: decryptionError,
    result: decryptionResult
  } = useDecryption(contract);

  // 初始化合约实例
  useEffect(() => {
    if (account && window.ethereum && CONTRACT_ADDRESS && CONTRACT_ADDRESS !== '0x') {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, AgeVerifierABI, provider);
      setContract(contractInstance);
    }
  }, [account]);

  // Connect MetaMask
  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        setStatus('❌ Please install MetaMask');
        return;
      }

      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      setAccount(accounts[0]);
      setStatus('✅ Wallet Connected');
      
      // Check network
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== '0xaa36a7') {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }],
          });
        } catch (error: any) {
          if (error.code === 4902) {
            setStatus('⚠️ Please switch to Sepolia network manually');
          }
        }
      }
      
      // Check NFT status
      checkNFTStatus(accounts[0]);
    } catch (error: any) {
      console.error('Failed to connect wallet:', error);
      setStatus('❌ ' + error.message);
    }
  };

  // Convert IPFS URL to HTTP Gateway URL
  const ipfsToHttp = (ipfsUrl: string): string => {
    if (ipfsUrl.startsWith('ipfs://')) {
      const cid = ipfsUrl.replace('ipfs://', '');
      // Use multiple gateways for better reliability
      return `https://ipfs.io/ipfs/${cid}`;
      // Alternatives: 
      // return `https://gateway.pinata.cloud/ipfs/${cid}`;
      // return `https://cloudflare-ipfs.com/ipfs/${cid}`;
    }
    return ipfsUrl;
  };

  // Check NFT Status（使用公共 RPC 读取）
  const checkNFTStatus = async (address: string) => {
    if (!NFT_CONTRACT_ADDRESS || NFT_CONTRACT_ADDRESS === '0x') return;
    
    setLoadingNFT(true);
    try {
      // ✅ 使用公共 RPC 读取（手册 6.4节）
      const hasCredential = await safeContractCall(
        NFT_CONTRACT_ADDRESS,
        NFT_ABI,
        'hasCredential',
        [address]
      );
      setHasNFT(hasCredential);
      
      if (hasCredential) {
        // ✅ 使用公共 RPC 读取
        const tokenId = await safeContractCall(
          NFT_CONTRACT_ADDRESS,
          NFT_ABI,
          'getTokenIdOf',
          [address]
        );
        setNFTTokenId(Number(tokenId));
        
        // Get NFT metadata
        try {
          const tokenURI = await safeContractCall(
            NFT_CONTRACT_ADDRESS,
            NFT_ABI,
            'tokenURI',
            [tokenId]
          );
          if (tokenURI.startsWith('data:application/json;base64,')) {
            const base64Data = tokenURI.split(',')[1];
            const jsonData = atob(base64Data);
            const metadata = JSON.parse(jsonData);
            if (metadata.image) {
              // Convert IPFS URL to HTTP Gateway URL
              const httpUrl = ipfsToHttp(metadata.image);
              setNFTImageUrl(httpUrl);
              console.log('NFT Image URL:', httpUrl);
            }
          }
        } catch (err) {
          console.error('Failed to fetch NFT metadata:', err);
        }
      }
    } catch (error) {
      console.error('Failed to check NFT status:', error);
    } finally {
      setLoadingNFT(false);
    }
  };

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        setAccount(accounts[0] || '');
        if (!accounts[0]) {
          setStatus('Wallet disconnected');
          setHasNFT(false);
          setNFTTokenId(0);
          setNFTImageUrl('');
        } else {
          checkNFTStatus(accounts[0]);
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }
  }, []);

  // Fetch verification result
  useEffect(() => {
    const fetchVerificationResult = async () => {
      if (!account || !CONTRACT_ADDRESS || !window.ethereum) {
        setIsVerified(null);
        return;
      }
      try {
        // ✅ 使用公共 RPC 读取（手册 6.4节）
        const result = await safeContractCall(
          CONTRACT_ADDRESS,
          AgeVerifierABI,
          'isVerified',
          [account]
        );
        setIsVerified(result);
        if (result) {
          setStatus('✅ Verified! You are eligible.');
        } else {
          setStatus('❌ Not verified or underage.');
        }
      } catch (error) {
        console.error('Failed to fetch verification result:', error);
        setIsVerified(null);
      }
    };

    if (fheStatus !== 'checking' && account) {
      fetchVerificationResult();
    }
  }, [fheStatus, account]);

  // FHE Verification (真正的加密验证)
  const handleVerifyFHE = async () => {
    if (!account) {
      setStatus('❌ Please connect wallet first');
      return;
    }
    if (!age) {
      setStatus('❌ Please enter your age');
      return;
    }
    if (!contract) {
      setStatus('❌ Contract not initialized');
      return;
    }
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x') {
      setStatus('❌ Contract address not configured');
      return;
    }

    setLoading(true);
    setStatus('⏳ Encrypting age...');

    try {
      const ageNum = Number(age);
      if (isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
        throw new Error('Invalid age');
      }

      // 使用 FHEVM SDK 加密年龄
      setStatus('🔐 Encrypting age with FHE...');
      const encryptedData = await encryptAge(ageNum, CONTRACT_ADDRESS, account);

      if (!encryptedData) {
        throw new Error('Failed to encrypt age. Gateway may be offline.');
      }

      // 发送加密数据到合约（OKX 兼容方式）
      setStatus('📤 Sending encrypted age to contract...');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractInterface = new ethers.Interface(AgeVerifierABI);

      // ✅ 使用 OKX 兼容的交易发送方式（手册 6.2节）
      const walletType = detectWalletType();
      let txHash: string;

      if (walletType === 'okx' || walletType === 'other') {
        // OKX 或其他钱包：使用低层 API
        txHash = await sendTransactionOKXCompatible(
          CONTRACT_ADDRESS,
          contractInterface,
          'verifyAge',
          [encryptedData.encrypted, encryptedData.proof],
          signer
        );
      } else {
        // MetaMask：使用常规方式
        const contractWithSigner = new ethers.Contract(CONTRACT_ADDRESS, AgeVerifierABI, signer);
        const tx = await contractWithSigner.verifyAge(
          encryptedData.encrypted,
          encryptedData.proof
        );
        txHash = tx.hash;
      }

      setStatus('⏳ Waiting for transaction confirmation...');
      
      // ✅ 使用公共 RPC 轮询交易确认（手册 6.3节）
      const receipt = await waitForTransactionWithPublicRpc(txHash);
      console.log('Transaction receipt:', receipt);

      // 从事件中获取 requestId
      const contractInterface = new ethers.Interface(AgeVerifierABI);
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = contractInterface.parseLog(log);
          return parsed && parsed.name === 'DecryptionRequested';
        } catch {
          return false;
        }
      });

      if (event) {
        const parsedEvent = contractInterface.parseLog({
          topics: event.topics || [],
          data: event.data || '0x'
        });
        const requestId = parsedEvent?.args[0];
        console.log('🔑 Decryption Request ID:', requestId.toString());

        setStatus('⏳ Waiting for Gateway decryption...');
        
        // ✅ 等待解密完成（带重试机制和超时处理）
        try {
          await withTimeout(
            waitForCondition(
              async () => {
                // 检查验证状态
                const isVerified = await safeContractCall(
                  CONTRACT_ADDRESS,
                  AgeVerifierABI,
                  'isVerified',
                  [account]
                );
                
                if (isVerified !== undefined) {
                  setIsVerified(isVerified);
                  
                  if (isVerified) {
                    setStatus('✅ Verification successful! NFT credential minted!');
                    checkNFTStatus(account);
                  } else {
                    setStatus('❌ Age verification failed (under 18)');
                  }
                  
                  return true;
                }
                
                return false;
              },
              {
                timeout: 120000, // 2分钟
                interval: 5000, // 5秒
                onProgress: (attempt) => {
                  setStatus(`⏳ Waiting for decryption... (${attempt * 5}s)`);
                }
              }
            ),
            120000, // 2分钟超时
            'Gateway 解密超时，请稍后重试'
          );
        } catch (error: any) {
          console.warn('等待解密超时，检查是否需要重试:', error);
          
          // ✅ 检查并尝试重试
          if (contract) {
            const newRequestId = await checkAndRetryDecryption(
              contract,
              account,
              (newId) => {
                setStatus(`🔄 已重试解密请求，新请求ID: ${newId.toString()}`);
              }
            );
            
            if (newRequestId) {
              setStatus('🔄 解密重试已提交，请稍候...');
            } else {
              setStatus('⚠️ 解密超时。请稍后手动检查验证状态。');
            }
          }
        }
      } else {
        setStatus('⚠️ Verification submitted. Waiting for decryption...');
      }

    } catch (error: any) {
      console.error('FHE Verification failed:', error);
      setStatus('❌ FHE Verification failed: ' + (error.message || 'Unknown error'));
      
      // 如果加密失败，建议用户使用 Mock 模式
      if (error.message?.includes('encrypt') || error.message?.includes('Gateway')) {
        setStatus('⚠️ FHE encryption failed. Please try Mock mode or check Gateway status.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Mock Verification (Gateway 离线时使用)
  const handleVerifyMock = async () => {
    if (!account) {
      setStatus('❌ Please connect wallet first');
      return;
    }
    if (!age) {
      setStatus('❌ Please enter your age');
      return;
    }

    setLoading(true);
    setStatus('⏳ Verifying...');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractInterface = new ethers.Interface(AgeVerifierABI);

      const ageNum = Number(age);
      setStatus('📤 Sending transaction...');
      
      // ✅ 使用 OKX 兼容方式发送交易
      const walletType = detectWalletType();
      let txHash: string;

      if (walletType === 'okx' || walletType === 'other') {
        txHash = await sendTransactionOKXCompatible(
          CONTRACT_ADDRESS,
          contractInterface,
          'verifyAgeMock',
          [ageNum],
          signer
        );
      } else {
        const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, AgeVerifierABI, signer);
        const tx = await contractInstance.verifyAgeMock(ageNum);
        txHash = tx.hash;
      }

      setStatus('⏳ Waiting for confirmation...');
      
      // ✅ 使用公共 RPC 轮询交易确认
      const receipt = await waitForTransactionWithPublicRpc(txHash);
      console.log('Transaction receipt:', receipt);
      
      const result = ageNum >= 18;
      setIsVerified(result);
      
      if (result) {
        setStatus('✅ Verification successful! Minting NFT credential...');
        // Wait for NFT minting
        setTimeout(() => {
          checkNFTStatus(account);
          setStatus('🎉 Verification successful! NFT credential minted!');
        }, 2000);
      } else {
        setStatus('❌ Underage - Access denied');
      }
    } catch (error: any) {
      console.error('Verification failed:', error);
      setStatus('❌ Verification failed: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // 统一的验证函数（根据 Gateway 状态选择模式）
  const handleVerify = async () => {
    if (fheStatus === 'up' && contract) {
      // Gateway 在线，使用 FHE 模式
      await handleVerifyFHE();
    } else {
      // Gateway 离线，使用 Mock 模式
      await handleVerifyMock();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Gateway Status */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800/50 backdrop-blur rounded-full border border-gray-700">
            <span className={`w-3 h-3 rounded-full ${
              fheStatus === 'checking' ? 'bg-yellow-500 animate-pulse' :
              fheStatus === 'up' ? 'bg-green-500' :
              'bg-red-500'
            }`} />
            <span className="text-sm">
              {fheStatus === 'checking' ? '🔄 Checking Gateway...' :
               fheStatus === 'up' ? '🟢 FHE Gateway Online' :
               '🔴 FHE Gateway Offline (Mock Mode)'}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Verification Panel */}
          <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-gray-700">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              FHEVM Age Verifier
            </h1>
            <p className="text-gray-400 mb-6 text-sm">
              Age verification with FHEVM + NFT credential
            </p>

            {!account ? (
              <button
                onClick={connectWallet}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 py-4 rounded-xl font-semibold shadow-lg transition-all duration-200 transform hover:scale-[1.02]"
              >
                Connect MetaMask Wallet
              </button>
            ) : (
              <div className="space-y-4">
                {/* Account Info */}
                <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-1">Connected Account</p>
                  <p className="text-sm font-mono text-green-400">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </p>
                </div>

                {/* Age Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Enter Your Age
                  </label>
                  <input
                    type="number"
                    placeholder="e.g., 25"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    min="1"
                    max="120"
                    disabled={loading}
                  />
                </div>

                {/* Verify Button */}
                <button
                  onClick={handleVerify}
                  disabled={loading || !age}
                  className={`w-full py-4 rounded-xl font-semibold shadow-lg transition-all duration-200 transform ${
                    loading || !age
                      ? 'bg-gray-600 cursor-not-allowed'
                      : fheStatus === 'up'
                        ? 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 hover:scale-[1.02]'
                        : 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 hover:scale-[1.02]'
                  }`}
                >
                  {loading ? '🔄 Processing...' : 
                   fheStatus === 'up' ? '🔐 Verify Age (FHE Mode)' : 
                   '🎫 Verify Age (Mock Mode)'}
                </button>

                {/* Decryption Progress (当使用 FHE 模式时) */}
                {decryptionStatus === 'polling' && (
                  <div className="bg-blue-900/20 border border-blue-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-blue-400">解密进度</span>
                      <span className="text-sm text-blue-300">{decryptionProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${decryptionProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      {decryptionStatus === 'polling' && '⏳ 正在轮询 Gateway 解密...'}
                      {decryptionStatus === 'waiting' && '⏳ 等待链上回调完成...'}
                    </p>
                  </div>
                )}

                {/* Status Display */}
                {status && (
                  <div className={`p-4 rounded-xl border ${
                    status.includes('✅') || status.includes('🎉') ? 'bg-green-900/20 border-green-700 text-green-400' :
                    status.includes('❌') ? 'bg-red-900/20 border-red-700 text-red-400' :
                    'bg-blue-900/20 border-blue-700 text-blue-400'
                  }`}>
                    <p className="text-sm text-center font-medium">{status}</p>
                  </div>
                )}

                {/* Disconnect Wallet */}
                <button
                  onClick={() => {
                    setAccount('');
                    setStatus('');
                    setIsVerified(null);
                    setHasNFT(false);
                  }}
                  className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Disconnect Wallet
                </button>
              </div>
            )}
          </div>

          {/* Right: NFT Credential Display */}
          <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-gray-700">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="text-2xl">🎨</span>
              <span>Your NFT Credential</span>
            </h2>

            {!account ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🔒</div>
                <p className="text-gray-400">Please connect wallet first</p>
              </div>
            ) : loadingNFT ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4 animate-spin">⏳</div>
                <p className="text-gray-400">Loading...</p>
              </div>
            ) : hasNFT ? (
              <div className="space-y-4">
                {/* NFT Image */}
                {nftImageUrl && (
                  <div className="flex justify-center mx-auto">
                    <img 
                      src={nftImageUrl} 
                      alt="Age Credential NFT" 
                      className="max-w-xs rounded-xl border-2 border-purple-500 shadow-lg shadow-purple-500/50"
                      onError={(e) => {
                        console.error('Image load error:', e);
                        // Try alternative gateway if primary fails
                        const currentSrc = e.currentTarget.src;
                        if (currentSrc.includes('ipfs.io')) {
                          e.currentTarget.src = nftImageUrl.replace('ipfs.io', 'gateway.pinata.cloud');
                        }
                      }}
                    />
                  </div>
                )}

                {/* NFT Info */}
                <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 text-sm">Token ID</span>
                    <span className="font-mono text-purple-400">#{nftTokenId}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 text-sm">Status</span>
                    <span className="text-green-400">✅ Verified</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Type</span>
                    <span className="text-purple-400">Soulbound</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={`https://sepolia.etherscan.io/token/${NFT_CONTRACT_ADDRESS}?a=${nftTokenId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600 text-blue-400 py-3 rounded-xl text-center text-sm font-medium transition-all"
                  >
                    🔗 Etherscan
                  </a>
                  <button
                    onClick={() => checkNFTStatus(account)}
                    className="bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600 text-purple-400 py-3 rounded-xl text-sm font-medium transition-all"
                  >
                    🔄 Refresh
                  </button>
                </div>

                {/* NFT Features */}
                <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 rounded-xl p-4 border border-purple-700/50">
                  <p className="text-sm font-semibold mb-2 text-purple-300">✨ NFT Features</p>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>• 🔐 Age data FHE encrypted</li>
                    <li>• 🎨 On-chain SVG generation</li>
                    <li>• 👤 Soulbound, non-transferable</li>
                    <li>• ✅ ERC-721 standard compatible</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">📭</div>
                <p className="text-gray-400 mb-2">You don't have an NFT credential yet</p>
                <p className="text-sm text-gray-500">
                  Pass age verification to mint your exclusive NFT credential
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center space-y-2">
          <p className="text-xs text-gray-500">
            Verifier: <span className="font-mono">{CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}</span>
            {NFT_CONTRACT_ADDRESS && NFT_CONTRACT_ADDRESS !== '0x' && (
              <span className="ml-4">
                NFT: <span className="font-mono">{NFT_CONTRACT_ADDRESS.slice(0, 6)}...{NFT_CONTRACT_ADDRESS.slice(-4)}</span>
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500">Network: Sepolia Testnet | Technology: Zama FHEVM</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <FHEVMProvider>
      <AppContent />
    </FHEVMProvider>
  );
}

// TypeScript declarations
declare global {
  interface Window {
    ethereum?: any;
  }
}
