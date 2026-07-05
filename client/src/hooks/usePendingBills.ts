import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/firebase';
import type { PendingBill, CashBookType } from '@smp-cashbook/shared';
import type { ActiveCashBookType } from '@smp-cashbook/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(doc: any, fallbackCashBookType: CashBookType, fallbackFY: string): PendingBill {
  const data = doc.data();
  return {
    id:            doc.id,
    date:          data.date          ?? '',
    bank:          data.bank          ?? '',
    chqNoOrCash:   data.chqNoOrCash   ?? '',
    amount:        data.amount        ?? 0,
    headOfAccount: data.headOfAccount ?? '',
    firmName:      data.firmName      ?? '',
    billNumber:    data.billNumber    ?? '',
    billDate:      data.billDate      ?? '',
    particulars:   data.particulars   ?? '',
    status:        data.status        ?? 'Pending',
    financialYear: data.financialYear ?? fallbackFY,
    cashBookType:  (data.cashBookType ?? fallbackCashBookType) as CashBookType,
    createdAt:     data.createdAt?.toDate().toISOString() ?? '',
    clearedAt:     data.clearedAt as string | undefined,
  };
}

export function usePendingBills(financialYear: string, cashBookType: ActiveCashBookType) {
  const [bills, setBills]         = useState<PendingBill[]>([]);
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
      const col = collection(firestore, 'pendingBills', financialYear, cashBookType);
      const q   = query(col, orderBy('date', 'asc'));

      const unsub = onSnapshot(
        q,
        (snap) => {
          const mapped = snap.docs.map((d) => mapDoc(d, cashBookType as CashBookType, financialYear));
          mapped.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.createdAt.localeCompare(b.createdAt);
          });
          setBills(mapped);
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

    // ── Both mode: subscribe to all 3 types, merge sorted by date ───────────
    const state = {
      aided:   { docs: [] as PendingBill[], ready: false },
      unaided: { docs: [] as PendingBill[], ready: false },
      wp:      { docs: [] as PendingBill[], ready: false },
    };

    const merge = () => {
      if (!state.aided.ready || !state.unaided.ready || !state.wp.ready) return;
      const merged = [...state.aided.docs, ...state.unaided.docs, ...state.wp.docs].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.createdAt.localeCompare(b.createdAt);
      });
      setBills(merged);
      setLoading(false);
      setRefreshing(false);
      hasData.current = true;
    };

    const qAided = query(
      collection(firestore, 'pendingBills', financialYear, 'Aided'),
      orderBy('date', 'asc'),
    );
    const qUnaided = query(
      collection(firestore, 'pendingBills', financialYear, 'Un-Aided'),
      orderBy('date', 'asc'),
    );
    const qWp = query(
      collection(firestore, 'pendingBills', financialYear, 'WP Un-Aided'),
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

    const unsubWp = onSnapshot(
      qWp,
      (snap) => {
        state.wp.docs  = snap.docs.map((d) => mapDoc(d, 'WP Un-Aided', financialYear));
        state.wp.ready = true;
        merge();
      },
      (err) => { setError(err.message); setLoading(false); setRefreshing(false); },
    );

    return () => { unsubAided(); unsubUnaided(); unsubWp(); };
  }, [financialYear, cashBookType]);

  return { bills, loading, refreshing, error };
}
