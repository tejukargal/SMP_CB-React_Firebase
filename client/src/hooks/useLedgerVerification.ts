import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LedgerVerificationStatus } from '@smp-cashbook/shared';
import { apiGetLedgerVerification, apiSetLedgerVerificationStatus, type AllLedgerVerification } from '@/api/ledgerVerification';
import { useToast } from '@/context/ToastContext';

const NEXT_STATUS: Record<'none' | LedgerVerificationStatus, LedgerVerificationStatus | null> = {
  none: 'verified',
  verified: 'mismatch',
  mismatch: null,
};

export function useLedgerVerification(financialYear: string, cashBookType: string) {
  const [allData, setAllData] = useState<AllLedgerVerification>({});
  const { addToast } = useToast();

  useEffect(() => {
    apiGetLedgerVerification(financialYear)
      .then(setAllData)
      .catch(console.error);
  }, [financialYear]);

  const statusByEntryId: Partial<Record<string, LedgerVerificationStatus>> = useMemo(
    () => allData[cashBookType] ?? {},
    [allData, cashBookType],
  );

  const cycleStatus = useCallback(
    async (entryId: string) => {
      const current: LedgerVerificationStatus | 'none' = statusByEntryId[entryId] ?? 'none';
      const wasNone = current === 'none';
      const next = NEXT_STATUS[current];

      setAllData((prev) => {
        const cbData = { ...(prev[cashBookType] ?? {}) };
        if (next) {
          cbData[entryId] = next;
        } else {
          delete cbData[entryId];
        }
        return { ...prev, [cashBookType]: cbData };
      });

      try {
        await apiSetLedgerVerificationStatus(financialYear, cashBookType, entryId, next);
      } catch (err: unknown) {
        // Revert on failure
        setAllData((prev) => {
          const cbData = { ...(prev[cashBookType] ?? {}) };
          if (wasNone) {
            delete cbData[entryId];
          } else {
            cbData[entryId] = current as LedgerVerificationStatus;
          }
          return { ...prev, [cashBookType]: cbData };
        });
        addToast(err instanceof Error ? err.message : 'Failed to save verification status', 'error');
      }
    },
    [financialYear, cashBookType, statusByEntryId, addToast],
  );

  return { statusByEntryId, cycleStatus };
}
