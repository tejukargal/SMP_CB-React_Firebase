import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/firebase';
import type { BudgetExpense, CashBookType } from '@smp-cashbook/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(doc: any): BudgetExpense {
  const data = doc.data();
  return {
    id:            doc.id,
    date:          data.date ?? '',
    headId:        data.headId ?? '',
    headName:      data.headName ?? '',
    amount:        data.amount ?? 0,
    notes:         data.notes ?? '',
    financialYear: data.financialYear ?? '',
    cashBookType:  data.cashBookType,
    linkedEntryId: data.linkedEntryId as string | undefined,
    createdAt:     data.createdAt?.toDate().toISOString() ?? '',
  };
}

/** Expenses are always scoped to one concrete cash-book-type — never 'Both'. */
export function useBudgetExpenses(financialYear: string, cashBookType: CashBookType) {
  const [expenses, setExpenses] = useState<BudgetExpense[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!financialYear || !cashBookType) return;

    setLoading(true);
    setError(null);

    const col = collection(firestore, 'budgetExpenses', financialYear, cashBookType);
    const q   = query(col, orderBy('date', 'asc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setExpenses(snap.docs.map(mapDoc));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return unsub;
  }, [financialYear, cashBookType]);

  return { expenses, loading, error };
}
