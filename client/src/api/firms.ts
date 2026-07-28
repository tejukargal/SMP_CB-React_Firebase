import apiClient from './client';
import type { Firm, UpsertFirmPayload, ApiResponse } from '@smp-cashbook/shared';

export async function apiUpsertFirm(payload: UpsertFirmPayload): Promise<Firm> {
  const res = await apiClient.post<ApiResponse<Firm>>('/api/firms', payload);
  return res.data.data;
}

export async function apiGetFirms(): Promise<Firm[]> {
  const res = await apiClient.get<ApiResponse<Firm[]>>('/api/firms');
  return res.data.data;
}

export async function apiDeleteFirm(id: string): Promise<void> {
  await apiClient.delete(`/api/firms/${id}`);
}
