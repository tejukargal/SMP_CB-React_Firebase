import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/firebase';
import type { BudgetAllocation, CashBookType } from '@smp-cashbook/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(doc: any): BudgetAllocation {
  const data = doc.data();
  return {
    id:              doc.id,
    headId:          data.headId ?? doc.id,
    headName:        data.headName ?? '',
    allocatedAmount: data.allocatedAmount ?? 0,
    financialYear:   data.financialYear ?? '',
    cashBookType:    data.cashBookType,
    updatedAt:       data.updatedAt?.toDate().toISOString() ?? '',
  };
}

/** Allocations are always scoped to one concrete cash-book-type — never 'Both'. */
export function useBudgetAllocations(financialYear: string, cashBookType: CashBookType) {
  const [allocations, setAllocations] = useState<BudgetAllocation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    if (!financialYear || !cashBookType) return;

    setLoading(true);
    setError(null);

    const col = collection(firestore, 'budgetAllocations', financialYear, cashBookType);
    const q   = query(col, orderBy('headName', 'asc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setAllocations(snap.docs.map(mapDoc));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return unsub;
  }, [financialYear, cashBookType]);

  return { allocations, loading, error };
}
