import apiClient from './client';
import type { BudgetExpense, CreateBudgetExpensePayload, UpdateBudgetExpenseFields, ApiResponse } from '@smp-cashbook/shared';

export async function apiCreateBudgetExpense(payload: CreateBudgetExpensePayload): Promise<BudgetExpense> {
  const res = await apiClient.post<ApiResponse<BudgetExpense>>('/api/budget-expenses', payload);
  return res.data.data;
}

export async function apiGetBudgetExpenses(fy: string, type: string): Promise<BudgetExpense[]> {
  const res = await apiClient.get<ApiResponse<BudgetExpense[]>>('/api/budget-expenses', {
    params: { fy, type },
  });
  return res.data.data;
}

export async function apiUpdateBudgetExpense(
  id: string,
  fy: string,
  type: string,
  payload: UpdateBudgetExpenseFields
): Promise<BudgetExpense> {
  const res = await apiClient.patch<ApiResponse<BudgetExpense>>(`/api/budget-expenses/${id}`, payload, {
    params: { fy, type },
  });
  return res.data.data;
}

export async function apiDeleteBudgetExpense(id: string, fy: string, type: string): Promise<void> {
  await apiClient.delete(`/api/budget-expenses/${id}`, { params: { fy, type } });
}
