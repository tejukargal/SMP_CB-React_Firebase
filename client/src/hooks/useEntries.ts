import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/firebase';
import type { Entry, CashBookType } from '@smp-cashbook/shared';
import type { ActiveCashBookType } from '@smp-cashbook/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(doc: any, fallbackCashBookType: CashBookType, fallbackFY: string): Entry {
  const data = doc.data();
  return {
    id:            doc.id,
    date:          data.date          ?? '',
    chequeNo:      data.chequeNo      ?? '',
    amount:        data.amount        ?? 0,
    headOfAccount: data.headOfAccount ?? '',
    notes:         data.notes         ?? '',
    type:          data.type,
    financialYear: data.financialYear ?? fallbackFY,
    cashBookType:  (data.cashBookType ?? fallbackCashBookType) as CashBookType,
    createdAt:     data.createdAt?.toDate().toISOString() ?? '',
    voucherNo:     data.voucherNo as string | undefined,
  };
}

export function useEntries(financialYear: string, cashBookType: ActiveCashBookType) {
  const [entries, setEntries]     = useState<Entry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const hasData = useRef(false);

  useEffect(() => {
    if (!financialYear || !cashBookType) return;

    setError(null);
    if (hasData.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    // ── Single collection (Aided or Un-Aided) ─────────────────────────────────
    if (cashBookType !== 'Both') {
      const col = collection(firestore, 'entries', financialYear, cashBookType);
      const q   = query(col, orderBy('date', 'asc'));

      const unsub = onSnapshot(
        q,
        (snap) => {
          setEntries(snap.docs.map((d) => mapDoc(d, cashBookType as CashBookType, financialYear)));
          setLoading(false);
          setRefreshing(false);
          hasData.current = true;
        },
        (err) => {
          setError(err.message);
          setLoading(false);
          setRefreshing(false);
        },
      );

      return unsub;
    }

    // ── Both mode: subscribe to Aided + Un-Aided, merge sorted by date ────────
    // Using plain objects in the closure; they're recreated on each effect run.
    const state = {
      aided:   { docs: [] as Entry[], ready: false },
      unaided: { docs: [] as Entry[], ready: false },
    };

    const merge = () => {
      if (!state.aided.ready || !state.unaided.ready) return; // wait for both
      const merged = [...state.aided.docs, ...state.unaided.docs].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.createdAt.localeCompare(b.createdAt);
      });
      setEntries(merged);
      setLoading(false);
      setRefreshing(false);
      hasData.current = true;
    };

    const qAided = query(
      collection(firestore, 'entries', financialYear, 'Aided'),
      orderBy('date', 'asc'),
    );
    const qUnaided = query(
      collection(firestore, 'entries', financialYear, 'Un-Aided'),
      orderBy('date', 'asc'),
    );

    const unsubAided = onSnapshot(
      qAided,
      (snap) => {
        state.aided.docs  = snap.docs.map((d) => mapDoc(d, 'Aided', financialYear));
        state.aided.ready = true;
        merge();
      },
      (err) => { setError(err.message); setLoading(false); setRefreshing(false); },
    );

    const unsubUnaided = onSnapshot(
      qUnaided,
      (snap) => {
        state.unaided.docs  = snap.docs.map((d) => mapDoc(d, 'Un-Aided', financialYear));
        state.unaided.ready = true;
        merge();
      },
      (err) => { setError(err.message); setLoading(false); setRefreshing(false); },
    );

    return () => { unsubAided(); unsubUnaided(); };
  }, [financialYear, cashBookType]);

  return { entries, loading, refreshing, error };
}
