import apiClient from './client';
import type { ApiResponse } from '@smp-cashbook/shared';

// Map of accountKey → opening balance for a given financial year
export type BankOpeningBalancesMap = Record<string, number>;

export async function apiGetBankOpeningBalances(
  financialYear: string,
): Promise<BankOpeningBalancesMap> {
  const res = await apiClient.get<ApiResponse<BankOpeningBalancesMap>>(
    `/api/bank-balances?financialYear=${encodeURIComponent(financialYear)}`,
  );
  return res.data.data;
}

export async function apiSetBankOpeningBalance(
  financialYear: string,
  accountKey: string,
  balance: number,
): Promise<void> {
  await apiClient.post('/api/bank-balances', { financialYear, accountKey, balance });
}
