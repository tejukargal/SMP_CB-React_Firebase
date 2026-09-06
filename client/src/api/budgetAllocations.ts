import apiClient from './client';
import type { BudgetAllocation, UpsertBudgetAllocationPayload, ApiResponse } from '@smp-cashbook/shared';

export async function apiUpsertBudgetAllocation(
  payload: UpsertBudgetAllocationPayload
): Promise<BudgetAllocation> {
  const res = await apiClient.post<ApiResponse<BudgetAllocation>>('/api/budget-allocations', payload);
  return res.data.data;
}

export async function apiGetBudgetAllocations(fy: string, type: string): Promise<BudgetAllocation[]> {
  const res = await apiClient.get<ApiResponse<BudgetAllocation[]>>('/api/budget-allocations', {
    params: { fy, type },
  });
  return res.data.data;
}

export async function apiDeleteBudgetAllocation(id: string, fy: string, type: string): Promise<void> {
  await apiClient.delete(`/api/budget-allocations/${id}`, { params: { fy, type } });
}
