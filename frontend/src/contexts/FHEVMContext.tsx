import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { createEncryptedInput } from '@zama-fhe/relayer-sdk';

// Gateway 配置
const GATEWAY_URL = 'https://gateway.sepolia.zama.ai';
const SEPOLIA_CHAIN_ID = 11155111;

// Context 类型定义
interface FHEVMContextType {
  fhevmInstance: any;
  gatewayStatus: 'up' | 'down' | 'checking';
  fheStatus: 'up' | 'down' | 'checking'; // Alias for gatewayStatus
  initializeFHEVM: () => Promise<void>;
  isInitialized: boolean;
  encryptAge: (age: number, contractAddress: string, userAddress: string) => Promise<{ encrypted: any; proof: string } | null>;
}

// 创建 Context
const FHEVMContext = createContext<FHEVMContextType | null>(null);

// Provider 组件
export function FHEVMProvider({ children }: { children: ReactNode }) {
  // 注意：使用 @zama-fhe/relayer-sdk 后不再需要实例
  // 保留 fhevmInstance 仅为了向后兼容
  const [fhevmInstance] = useState<any>(null);
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

  // 初始化 FHEVM（简化版：@zama-fhe/relayer-sdk 不需要实例初始化）
  const initializeFHEVM = async () => {
    try {
      console.log('🔄 检查 Gateway 状态...');
      
      // 检查 Gateway 状态
      const isUp = await checkGatewayHealth();
      setGatewayStatus(isUp ? 'up' : 'down');

      if (isUp) {
        // ✅ @zama-fhe/relayer-sdk 不需要创建实例
        // createEncryptedInput 是直接导入的函数，可以直接使用
        setIsInitialized(true);
        console.log('✅ Gateway 在线，可以使用 FHE 加密');
      } else {
        console.log('⚠️ Gateway 离线，将使用 Mock 模式');
        setIsInitialized(false);
      }
    } catch (error) {
      console.error('❌ Gateway 状态检查失败:', error);
      setGatewayStatus('down');
      setIsInitialized(false);
    }
  };

  // 加密年龄（使用手册推荐的 @zama-fhe/relayer-sdk）
  const encryptAge = async (
    age: number,
    contractAddress: string,
    userAddress: string
  ): Promise<{ encrypted: any; proof: string } | null> => {
    try {
      console.log('🔐 加密年龄:', age, {
        contractAddress,
        userAddress
      });

      // ✅ 使用手册推荐的 API（手册 3.5.2节）
      // 步骤 1: 创建加密上下文
      const input = createEncryptedInput(
        contractAddress,  // 合约地址
        userAddress       // 签名者地址
      );

      // 步骤 2: 添加数据（32位无符号整数，年龄使用32位足够）
      input.add32(BigInt(age));

      // 步骤 3: 加密并生成证明
      const { handles, inputProof } = await input.encrypt();

      // 步骤 4: 验证结果
      if (!handles || handles.length === 0) {
        throw new Error('加密失败: handles 为空');
      }

      if (!inputProof) {
        throw new Error('加密失败: inputProof 为空');
      }

      console.log('✅ 年龄加密成功');

      return {
        encrypted: handles[0],  // einput（加密句柄）
        proof: inputProof        // bytes（证明/attestation）
      };
    } catch (error: any) {
      console.error('❌ 加密失败:', error);
      return null;
    }
  };

  // 定时轮询 Gateway 状态（60秒）
  useEffect(() => {
    // 立即初始化
    initializeFHEVM();

    // 定时检查
    const interval = setInterval(() => {
      initializeFHEVM();
    }, 60000); // 60秒

    return () => clearInterval(interval);
  }, []);

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


