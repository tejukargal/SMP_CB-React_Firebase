import apiClient from './client';

// { [bankKey]: { [entryId]: "YYYY-MM-DD" } }
export type AllBankReconciliation = Record<string, Record<string, string>>;

export async function apiGetBankReconciliation(
  financialYear: string,
): Promise<AllBankReconciliation> {
  const res = await apiClient.get<{ data: AllBankReconciliation }>(
    `/api/bank-reconciliation?financialYear=${encodeURIComponent(financialYear)}`,
  );
  return res.data.data;
}

export async function apiSetBankReconciliationDate(
  financialYear: string,
  bankKey: string,
  entryId: string,
  bankDate: string | null,
): Promise<void> {
  await apiClient.post('/api/bank-reconciliation', { financialYear, bankKey, entryId, bankDate });
}
