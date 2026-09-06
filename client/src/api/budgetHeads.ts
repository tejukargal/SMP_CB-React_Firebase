import apiClient from './client';
import type { BudgetHead, UpsertBudgetHeadPayload, ApiResponse } from '@smp-cashbook/shared';

export async function apiUpsertBudgetHead(payload: UpsertBudgetHeadPayload): Promise<BudgetHead> {
  const res = await apiClient.post<ApiResponse<BudgetHead>>('/api/budget-heads', payload);
  return res.data.data;
}

export async function apiGetBudgetHeads(): Promise<BudgetHead[]> {
  const res = await apiClient.get<ApiResponse<BudgetHead[]>>('/api/budget-heads');
  return res.data.data;
}

export async function apiSetBudgetHeadActive(id: string, isActive: boolean): Promise<BudgetHead> {
  const res = await apiClient.patch<ApiResponse<BudgetHead>>(`/api/budget-heads/${id}/active`, { isActive });
  return res.data.data;
}
