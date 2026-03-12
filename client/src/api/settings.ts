import apiClient from './client';
import type { Settings, UpdateSettingsPayload, ApiResponse } from '@smp-cashbook/shared';

export async function apiGetSettings(): Promise<Settings> {
  const res = await apiClient.get<ApiResponse<Settings>>('/api/settings');
  return res.data.data;
}

export async function apiUpdateSettings(payload: UpdateSettingsPayload): Promise<Settings> {
  const res = await apiClient.post<ApiResponse<Settings>>('/api/settings', payload);
  return res.data.data;
}
