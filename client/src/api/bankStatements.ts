import apiClient from './client';
import type { BankKey, BankStatementTxn, ImportBankStatementPayload } from '@smp-cashbook/shared';

export async function apiFetchBankStatements(
  financialYear: string,
  bankKey: BankKey,
): Promise<BankStatementTxn[]> {
  const res = await apiClient.get<{ data: BankStatementTxn[] }>(
    `/api/bank-statements?fy=${encodeURIComponent(financialYear)}&bank=${encodeURIComponent(bankKey)}`,
  );
  return res.data.data;
}

export async function apiImportBankStatements(
  payload: ImportBankStatementPayload,
): Promise<{ imported: number }> {
  const res = await apiClient.post<{ data: { imported: number } }>(
    '/api/bank-statements/import',
    payload,
  );
  return res.data.data;
}

export async function apiReconcileBankTransaction(
  fy: string,
  bank: BankKey,
  txnId: string,
  entryId: string,
): Promise<void> {
  await apiClient.patch('/api/bank-statements/reconcile', { fy, bank, txnId, entryId });
}

export async function apiSetOpeningBalance(
  fy: string,
  bank: BankKey,
  openingBalance: number,
): Promise<void> {
  await apiClient.patch('/api/bank-statements/opening-balance', { fy, bank, openingBalance });
}

export async function apiDeleteBankStatements(
  financialYear: string,
  bankKey: BankKey,
): Promise<{ deleted: number }> {
  const res = await apiClient.delete<{ data: { deleted: number } }>(
    `/api/bank-statements?fy=${encodeURIComponent(financialYear)}&bank=${encodeURIComponent(bankKey)}`,
  );
  return res.data.data;
}
