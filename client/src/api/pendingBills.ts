import apiClient from './client';
import type { PendingBill, CreatePendingBillPayload, ApiResponse } from '@smp-cashbook/shared';

export async function apiCreatePendingBill(payload: CreatePendingBillPayload): Promise<PendingBill> {
  const res = await apiClient.post<ApiResponse<PendingBill>>('/api/pending-bills', payload);
  return res.data.data;
}

export async function apiGetPendingBills(fy: string, type: string): Promise<PendingBill[]> {
  const res = await apiClient.get<ApiResponse<PendingBill[]>>('/api/pending-bills', {
    params: { fy, type },
  });
  return res.data.data;
}

export interface UpdatePendingBillPayload {
  date?: string;
  bank?: string;
  chqNoOrCash?: string;
  amount?: number;
  headOfAccount?: string;
  firmName?: string;
  billNumber?: string;
  billDate?: string;
  particulars?: string;
  status?: string;
}

export async function apiUpdatePendingBill(
  id: string,
  fy: string,
  cashBookType: string,
  payload: UpdatePendingBillPayload
): Promise<PendingBill> {
  const res = await apiClient.patch<ApiResponse<PendingBill>>(`/api/pending-bills/${id}`, payload, {
    params: { fy, type: cashBookType },
  });
  return res.data.data;
}

export async function apiDeletePendingBill(
  id: string,
  fy: string,
  type: string
): Promise<void> {
  await apiClient.delete(`/api/pending-bills/${id}`, { params: { fy, type } });
}
