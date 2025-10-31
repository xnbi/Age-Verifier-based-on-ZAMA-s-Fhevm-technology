/**
 * useDecryption Hook - 完整的解密流程
 * 根据 FHEVM_开发标准与解决方案手册 3.4节实现
 */

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import RelayerClient, { PollProgress } from '../utils/relayerClient';

export interface DecryptionStatus {
  status: 'idle' | 'requesting' | 'polling' | 'waiting' | 'success' | 'failed';
  progress: number;
  error: string | null;
  result: any | null;
}

export function useDecryption(contract: ethers.Contract | null) {
  const [status, setStatus] = useState<DecryptionStatus['status']>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const relayerClient = new RelayerClient('sepolia');

  /**
   * 完整的解密流程（5个步骤）
   */
  const requestDecryption = useCallback(async (userAddress: string) => {
    if (!contract) {
      throw new Error('Contract not initialized');
    }

    try {
      setStatus('requesting');
      setProgress(0);
      setError(null);
      setResult(null);

      console.log('🎮 开始验证年龄解密流程...');

      // ===== Step 1: 从链上获取 requestId =====
      setProgress(10);
      console.log('📝 获取用户的解密请求ID...');

      // 从合约获取用户的 requestId（如果存在）
      let requestId: bigint | null = null;
      try {
        requestId = await contract.userToRequestId(userAddress);
        if (requestId === 0n) {
          throw new Error('No pending decryption request found');
        }
        console.log('🔑 找到解密请求ID:', requestId.toString());
      } catch (err: any) {
        throw new Error('用户还没有提交验证请求，请先调用 verifyAge 函数');
      }

      // ===== Step 2: 轮询 Gateway（关键步骤）=====
      setStatus('polling');
      setProgress(30);
      console.log('⏳ 开始轮询 Gateway...');

      await relayerClient.pollDecryption(
        requestId,
        contract.target as string,
        {
          onProgress: (pollProgress: PollProgress) => {
            const percentage = 30 + (pollProgress.percentage * 0.5);
            setProgress(Math.round(percentage));
          }
        }
      );

      console.log('✅ Gateway 解密完成');

      // ===== Step 3: 等待链上回调完成 =====
      setStatus('waiting');
      setProgress(85);
      console.log('⏳ 等待链上回调...');

      await waitForCallbackCompletion(userAddress, contract, (waitProgress) => {
        const percentage = 85 + (waitProgress * 0.15);
        setProgress(Math.round(percentage));
      });

      // ===== Step 4: 获取最终结果 =====
      setProgress(95);
      const isVerified = await contract.isVerified(userAddress);

      const decryptionResult = {
        userAddress,
        requestId: requestId.toString(),
        isVerified,
        status: 'completed'
      };

      setProgress(100);
      setStatus('success');
      setResult(decryptionResult);

      console.log('🎉 解密流程完成!', decryptionResult);

      return decryptionResult;

    } catch (err: any) {
      console.error('❌ 解密失败:', err);
      setStatus('failed');
      setError(err.message || 'Unknown error');
      throw err;
    }
  }, [contract]);

  /**
   * 等待链上回调完成
   */
  const waitForCallbackCompletion = async (
    userAddress: string,
    contract: ethers.Contract,
    onProgress: (progress: number) => void
  ) => {
    const MAX_WAIT = 120; // 2分钟
    const INTERVAL = 2000; // 2秒

    for (let i = 0; i < MAX_WAIT; i++) {
      onProgress(i / MAX_WAIT);

      try {
        const isVerified = await contract.isVerified(userAddress);
        const requestId = await contract.userToRequestId(userAddress);

        // 检查请求是否已处理
        if (requestId !== 0n) {
          const request = await contract.decryptionRequests(requestId);
          if (request.processed) {
            console.log('✅ 回调已在链上完成');
            return;
          }
        }

        // 如果已经验证，说明回调已完成
        if (isVerified !== undefined) {
          console.log('✅ 验证状态已更新');
          return;
        }
      } catch (err) {
        console.warn('⚠️ 检查状态时出错:', err);
      }

      await new Promise(resolve => setTimeout(resolve, INTERVAL));
    }

    throw new Error('等待回调超时 - 请检查合约状态或重试');
  };

  /**
   * 监听解密完成事件
   */
  const listenForDecryptionCompleted = useCallback(async (
    requestId: bigint,
    onComplete: (result: boolean) => void
  ) => {
    if (!contract) return;

    const filter = contract.filters.DecryptionCompleted(requestId);
    contract.once(filter, (requestIdArg, decryptedResult, event) => {
      console.log('🎉 收到 DecryptionCompleted 事件:', { requestIdArg, decryptedResult });
      onComplete(decryptedResult);
    });
  }, [contract]);

  return {
    requestDecryption,
    listenForDecryptionCompleted,
    status,
    progress,
    error,
    result
  };
}

