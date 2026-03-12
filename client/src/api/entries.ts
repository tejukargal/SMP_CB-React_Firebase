import apiClient from './client';
import type { Entry, CreateEntryPayload, ApiResponse } from '@smp-cashbook/shared';

export async function apiCreateEntry(payload: CreateEntryPayload): Promise<Entry> {
  const res = await apiClient.post<ApiResponse<Entry>>('/api/entries', payload);
  return res.data.data;
}

export async function apiGetEntries(fy: string, type: string): Promise<Entry[]> {
  const res = await apiClient.get<ApiResponse<Entry[]>>('/api/entries', {
    params: { fy, type },
  });
  return res.data.data;
}

export interface UpdateEntryPayload {
  date?: string;
  chequeNo?: string;
  amount?: number;
  headOfAccount?: string;
  notes?: string;
  type?: string;
}

export async function apiUpdateEntry(
  id: string,
  fy: string,
  cashBookType: string,
  payload: UpdateEntryPayload
): Promise<Entry> {
  const res = await apiClient.patch<ApiResponse<Entry>>(`/api/entries/${id}`, payload, {
    params: { fy, type: cashBookType },
  });
  return res.data.data;
}

export async function apiDeleteEntry(
  id: string,
  fy: string,
  type: string
): Promise<void> {
  await apiClient.delete(`/api/entries/${id}`, { params: { fy, type } });
}

export async function apiResetEntries(
  fy: string,
  cashBookType: string
): Promise<{ deleted: number }> {
  const res = await apiClient.delete<ApiResponse<{ deleted: number }>>('/api/entries/reset', {
    params: { fy, type: cashBookType },
  });
  return res.data.data;
}

export interface ImportResult {
  imported: number;
  failed: number;
}

export async function apiImportEntries(
  entries: CreateEntryPayload[]
): Promise<ImportResult> {
  const res = await apiClient.post<ApiResponse<ImportResult>>('/api/import', { entries });
  return res.data.data;
}
