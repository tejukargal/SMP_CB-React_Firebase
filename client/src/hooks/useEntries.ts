import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/firebase';
import type { Entry, CashBookType } from '@smp-cashbook/shared';

export function useEntries(financialYear: string, cashBookType: CashBookType) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  // true when switching FY/type but entries already exist (show stale data + spinner)
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasData = useRef(false);

  useEffect(() => {
    if (!financialYear || !cashBookType) return;

    setError(null);
    if (hasData.current) {
      // Already have data — refresh in background, keep existing rows visible
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const col = collection(firestore, 'entries', financialYear, cashBookType);
    const q = query(col, orderBy('date', 'asc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: Entry[] = snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            date: data.date ?? '',
            chequeNo: data.chequeNo ?? '',
            amount: data.amount ?? 0,
            headOfAccount: data.headOfAccount ?? '',
            notes: data.notes ?? '',
            type: data.type,
            financialYear: data.financialYear ?? financialYear,
            cashBookType: data.cashBookType ?? cashBookType,
            createdAt: data.createdAt?.toDate().toISOString() ?? '',
          };
        });
        setEntries(docs);
        setLoading(false);
        setRefreshing(false);
        hasData.current = true;
      },
      (err) => {
        setError(err.message);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return unsub;
  }, [financialYear, cashBookType]);

  return { entries, loading, refreshing, error };
}
