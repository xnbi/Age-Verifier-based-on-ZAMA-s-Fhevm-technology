/**
 * RelayerClient - Gateway 解密轮询客户端
 * 根据 FHEVM_开发标准与解决方案手册 3.3节实现
 */

const RELAYER_CONFIG = {
  sepolia: {
    url: 'https://gateway.sepolia.zama.ai/v1/public-decrypt',
    chainId: 11155111
  },
  local: {
    url: 'http://localhost:8545',
    chainId: 31337
  }
};

export interface PollProgress {
  current: number;
  total: number;
  percentage: number;
}

export interface PollOptions {
  maxAttempts?: number;      // 最大尝试次数，默认 60
  interval?: number;          // 轮询间隔（毫秒），默认 5000
  onProgress?: (progress: PollProgress) => void;
}

export class RelayerClient {
  private config: typeof RELAYER_CONFIG[keyof typeof RELAYER_CONFIG];

  constructor(network: 'sepolia' | 'local' = 'sepolia') {
    this.config = RELAYER_CONFIG[network];
  }

  /**
   * ✅ 核心功能：轮询 Gateway 解密结果
   * @param requestId Gateway 请求ID
   * @param contractAddress 合约地址
   * @param options 轮询选项
   * @returns 解密结果
   */
  async pollDecryption(
    requestId: bigint | string,
    contractAddress: string,
    options: PollOptions = {}
  ): Promise<{ success: boolean; data: any; attempts: number }> {
    const {
      maxAttempts = 60,      // 5分钟（60次 * 5秒）
      interval = 5000,       // 5秒一次
      onProgress = null
    } = options;

    // 转换 requestId 为十六进制字符串
    const requestIdHex = typeof requestId === 'bigint' 
      ? `0x${requestId.toString(16)}` 
      : requestId.startsWith('0x') 
        ? requestId 
        : `0x${requestId}`;

    console.log('🔐 开始轮询 Gateway 解密...', {
      requestId: requestIdHex,
      contractAddress,
      estimatedTime: `${(maxAttempts * interval) / 1000}秒`
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // 调用进度回调
        if (onProgress) {
          onProgress({
            current: attempt,
            total: maxAttempts,
            percentage: Math.round((attempt / maxAttempts) * 100)
          });
        }

        // 请求 Gateway
        const response = await fetch(this.config.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            handle: requestIdHex,
            contractAddress: contractAddress,
            chainId: this.config.chainId
          })
        });

        // 成功
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Gateway 解密完成（第 ${attempt} 次尝试）`);
          return { success: true, data, attempts: attempt };
        }

        // 404 表示还未准备好
        if (response.status === 404) {
          console.log(`⏳ 尝试 ${attempt}/${maxAttempts}... Gateway 尚未准备好`);
        } else {
          console.warn(`⚠️ Gateway 返回异常: ${response.status}`);
        }

      } catch (error: any) {
        console.warn(`⚠️ 轮询尝试 ${attempt} 失败:`, error.message);
      }

      // 等待下一次尝试（最后一次不需要等待）
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    throw new Error(`Gateway 解密超时（${maxAttempts} 次，共 ${(maxAttempts * interval) / 1000}秒）`);
  }

  /**
   * 检查 Gateway 健康状态
   */
  async checkHealth(): Promise<boolean> {
    try {
      const baseUrl = this.config.url.replace('/v1/public-decrypt', '');
      const response = await fetch(`${baseUrl}/public_key`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      console.warn('⚠️ Gateway 健康检查失败:', error);
      return false;
    }
  }
}

export default RelayerClient;

