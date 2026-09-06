import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/firebase';
import type { BudgetHead } from '@smp-cashbook/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(doc: any): BudgetHead {
  const data = doc.data();
  return {
    id:        doc.id,
    headName:  data.headName ?? '',
    isActive:  data.isActive ?? true,
    createdAt: data.createdAt?.toDate().toISOString() ?? '',
    updatedAt: data.updatedAt?.toDate().toISOString() ?? '',
  };
}

/** Flat, global Budget Heads master list — not scoped per financial year/cash book type. Read-only; writes go through apiUpsertBudgetHead/apiSetBudgetHeadActive. */
export function useBudgetHeads() {
  const [budgetHeads, setBudgetHeads] = useState<BudgetHead[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(firestore, 'budgetHeads'), orderBy('headName', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBudgetHeads(snap.docs.map(mapDoc));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { budgetHeads, loading, error };
}
