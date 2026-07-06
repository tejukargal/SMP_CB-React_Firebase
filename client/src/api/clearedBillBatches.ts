import apiClient from './client';
import type { ClearedBillBatch, CreateClearedBillBatchPayload, ApiResponse } from '@smp-cashbook/shared';

export async function apiCreateClearedBillBatch(payload: CreateClearedBillBatchPayload): Promise<ClearedBillBatch> {
  const res = await apiClient.post<ApiResponse<ClearedBillBatch>>('/api/cleared-batches', payload);
  return res.data.data;
}

export async function apiGetClearedBillBatches(fy: string, type: string): Promise<ClearedBillBatch[]> {
  const res = await apiClient.get<ApiResponse<ClearedBillBatch[]>>('/api/cleared-batches', {
    params: { fy, type },
  });
  return res.data.data;
}
