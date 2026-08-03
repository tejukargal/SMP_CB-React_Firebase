import apiClient from './client';
import type { LedgerVerificationStatus } from '@smp-cashbook/shared';

// { [cashBookType]: { [entryId]: "verified" | "mismatch" } }
export type AllLedgerVerification = Record<string, Record<string, LedgerVerificationStatus>>;

export async function apiGetLedgerVerification(
  financialYear: string,
): Promise<AllLedgerVerification> {
  const res = await apiClient.get<{ data: AllLedgerVerification }>(
    `/api/ledger-verification?financialYear=${encodeURIComponent(financialYear)}`,
  );
  return res.data.data;
}

export async function apiSetLedgerVerificationStatus(
  financialYear: string,
  cashBookType: string,
  entryId: string,
  status: LedgerVerificationStatus | null,
): Promise<void> {
  await apiClient.post('/api/ledger-verification', { financialYear, cashBookType, entryId, status });
}
