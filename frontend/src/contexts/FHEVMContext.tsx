import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

// Gateway 配置
const GATEWAY_URL = 'https://gateway.sepolia.zama.ai';

// Context 类型定义
interface FHEVMContextType {
  fhevmInstance: any;
  gatewayStatus: 'up' | 'down' | 'checking';
  fheStatus: 'up' | 'down' | 'checking'; // Alias for gatewayStatus
  initializeFHEVM: () => Promise<void>;
  isInitialized: boolean;
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

  // 初始化 FHEVM
  const initializeFHEVM = async () => {
    try {
      console.log('🔄 开始初始化 FHEVM...');
      
      // 检查 Gateway 状态
      const isUp = await checkGatewayHealth();
      setGatewayStatus(isUp ? 'up' : 'down');

      if (isUp) {
        console.log('🔐 创建 FHEVM 实例...');
        // TODO: Initialize FHEVM instance when needed
        // For now, just mark as initialized if gateway is up
        // const instance = await createInstance(config);
        setFhevmInstance(null); // Will be initialized when actually needed
        setIsInitialized(true);
        console.log('✅ Gateway is up, ready for FHE operations');
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

  // 定时轮询 Gateway 状态（60秒）
  useEffect(() => {
    // 立即初始化
    initializeFHEVM();

    // 定时检查
    const interval = setInterval(async () => {
      const isUp = await checkGatewayHealth();
      const newStatus = isUp ? 'up' : 'down';
      
      // 状态变化时重新初始化
      if (newStatus !== gatewayStatus) {
        console.log(`🔄 Gateway 状态变化: ${gatewayStatus} → ${newStatus}`);
        setGatewayStatus(newStatus);
        
        if (newStatus === 'up' && !fhevmInstance) {
          // Gateway 恢复，重新初始化
          await initializeFHEVM();
        } else if (newStatus === 'down') {
          // Gateway 离线，清除实例
          setFhevmInstance(null);
          setIsInitialized(false);
        }
      }
    }, 60000); // 60秒

    return () => clearInterval(interval);
  }, []);

  const value: FHEVMContextType = {
    fhevmInstance,
    gatewayStatus,
    fheStatus: gatewayStatus, // Alias for backward compatibility
    initializeFHEVM,
    isInitialized
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


