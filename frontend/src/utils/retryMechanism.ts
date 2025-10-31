/**
 * 重试机制工具函数
 * 根据 FHEVM_开发标准与解决方案手册 2.4节和 10.4节实现
 */

import { ethers } from 'ethers';

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number; // 毫秒
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * 重试函数调用（带指数退避）
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 5000,
    onRetry
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt); // 指数退避
        console.warn(`⚠️ 尝试 ${attempt + 1}/${maxRetries + 1} 失败，${delay}ms 后重试:`, error.message);

        if (onRetry) {
          onRetry(attempt + 1, error);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * 检查并重试解密请求（合约调用）
 */
export async function checkAndRetryDecryption(
  contract: ethers.Contract,
  userAddress: string,
  onRetry?: (newRequestId: bigint) => void
): Promise<bigint | null> {
  try {
    // 获取用户的 requestId
    const requestId = await contract.userToRequestId(userAddress);

    if (requestId === 0n) {
      console.log('ℹ️ 没有待处理的解密请求');
      return null;
    }

    // 检查请求状态
    const status = await contract.getRequestStatus(requestId);
    
    if (status.processed) {
      console.log('✅ 请求已处理');
      return null;
    }

    if (status.expired && status.retryCount < 3) {
      console.log('⚠️ 请求已过期，尝试重试...');
      
      // 调用重试函数
      const tx = await contract.retryDecryption(requestId);
      const receipt = await tx.wait();
      
      // 从事件中获取新的 requestId
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed && parsed.name === 'DecryptionRetrying';
        } catch {
          return false;
        }
      });

      if (event) {
        const parsedEvent = contract.interface.parseLog({
          topics: event.topics || [],
          data: event.data || '0x'
        });
        const newRequestId = parsedEvent?.args[1]; // 第二个参数是新请求ID
        
        if (onRetry) {
          onRetry(newRequestId);
        }
        
        console.log('✅ 重试成功，新请求ID:', newRequestId.toString());
        return newRequestId;
      }
    }

    return requestId;
  } catch (error: any) {
    console.error('❌ 检查重试失败:', error);
    return null;
  }
}

/**
 * 带超时的函数调用
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(errorMessage || `操作超时（${timeoutMs}ms）`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * 等待条件满足（带超时）
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    onProgress?: (attempt: number) => void;
  } = {}
): Promise<void> {
  const {
    timeout = 120000, // 2分钟
    interval = 2000,  // 2秒
    onProgress
  } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeout) {
    attempt++;
    
    if (onProgress) {
      onProgress(attempt);
    }

    try {
      const result = await condition();
      if (result) {
        return;
      }
    } catch (error) {
      console.warn(`⚠️ 条件检查失败（尝试 ${attempt}）:`, error);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`等待条件超时（${timeout}ms，${attempt} 次尝试）`);
}

export default {
  retryWithBackoff,
  checkAndRetryDecryption,
  withTimeout,
  waitForCondition
};

