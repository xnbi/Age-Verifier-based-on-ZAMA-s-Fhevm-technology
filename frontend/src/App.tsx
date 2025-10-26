import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import AgeVerifierABI from './AgeVerifier.json';
import { FHEVMProvider, useFHEVM } from './contexts/FHEVMContext';

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
  const { fheStatus } = useFHEVM();
  
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

  // Check NFT Status
  const checkNFTStatus = async (address: string) => {
    if (!NFT_CONTRACT_ADDRESS || NFT_CONTRACT_ADDRESS === '0x') return;
    
    setLoadingNFT(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const nftContract = new ethers.Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, provider);
      
      const hasCredential = await nftContract.hasCredential(address);
      setHasNFT(hasCredential);
      
      if (hasCredential) {
        const tokenId = await nftContract.getTokenIdOf(address);
        setNFTTokenId(Number(tokenId));
        
        // Get NFT metadata
        try {
          const tokenURI = await nftContract.tokenURI(tokenId);
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
        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, AgeVerifierABI, provider);
        const result = await contract.isVerified(account);
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

  // Mock Verification
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
      const contract = new ethers.Contract(CONTRACT_ADDRESS, AgeVerifierABI, signer);

      const ageNum = Number(age);
      setStatus('📤 Sending transaction...');
      
      const tx = await contract.verifyAgeMock(ageNum);
      setStatus('⏳ Waiting for confirmation...');
      
      const receipt = await tx.wait();
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
                  onClick={handleVerifyMock}
                  disabled={loading || !age}
                  className={`w-full py-4 rounded-xl font-semibold shadow-lg transition-all duration-200 transform ${
                    loading || !age
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 hover:scale-[1.02]'
                  }`}
                >
                  {loading ? '🔄 Processing...' : '🎫 Verify Age & Mint NFT'}
                </button>

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
