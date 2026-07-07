import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/firebase';
import type { ClearedBillBatch, CashBookType, PaymentLine } from '@smp-cashbook/shared';
import type { ActiveCashBookType } from '@smp-cashbook/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(doc: any, fallbackCashBookType: CashBookType, fallbackFY: string): ClearedBillBatch {
  const data = doc.data();
  const billIds = data.billIds ?? [];
  const totalAmount = data.totalAmount ?? 0;
  const paymentLines: PaymentLine[] = data.paymentLines
    ?? [{ mode: 'Cash', refNo: '', billIds, amount: totalAmount }];
  return {
    id:            doc.id,
    date:          data.date          ?? '',
    group:         data.group         ?? 'Cash',
    paymentLines,
    billIds,
    totalAmount,
    count:         data.count         ?? billIds.length,
    financialYear: data.financialYear ?? fallbackFY,
    cashBookType:  (data.cashBookType ?? fallbackCashBookType) as CashBookType,
    createdAt:     data.createdAt?.toDate().toISOString() ?? '',
  };
}

function sortBatches(batches: ClearedBillBatch[]): ClearedBillBatch[] {
  return [...batches].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function useClearedBillBatches(financialYear: string, cashBookType: ActiveCashBookType) {
  const [batches, setBatches] = useState<ClearedBillBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const hasData = useRef(false);

  useEffect(() => {
    if (!financialYear || !cashBookType) return;

    setError(null);
    if (!hasData.current) setLoading(true);

    if (cashBookType !== 'Both') {
      const col = collection(firestore, 'clearedBillBatches', financialYear, cashBookType);
      const q   = query(col, orderBy('date', 'desc'));

      const unsub = onSnapshot(
        q,
        (snap) => {
          const mapped = snap.docs.map((d) => mapDoc(d, cashBookType as CashBookType, financialYear));
          setBatches(sortBatches(mapped));
          setLoading(false);
          hasData.current = true;
        },
        (err) => { setError(err.message); setLoading(false); },
      );

      return unsub;
    }

    const state = {
      aided:   { docs: [] as ClearedBillBatch[], ready: false },
      unaided: { docs: [] as ClearedBillBatch[], ready: false },
      wp:      { docs: [] as ClearedBillBatch[], ready: false },
    };

    const merge = () => {
      if (!state.aided.ready || !state.unaided.ready || !state.wp.ready) return;
      setBatches(sortBatches([...state.aided.docs, ...state.unaided.docs, ...state.wp.docs]));
      setLoading(false);
      hasData.current = true;
    };

    const qAided = query(
      collection(firestore, 'clearedBillBatches', financialYear, 'Aided'),
      orderBy('date', 'desc'),
    );
    const qUnaided = query(
      collection(firestore, 'clearedBillBatches', financialYear, 'Un-Aided'),
      orderBy('date', 'desc'),
    );
    const qWp = query(
      collection(firestore, 'clearedBillBatches', financialYear, 'WP Un-Aided'),
      orderBy('date', 'desc'),
    );

    const unsubAided = onSnapshot(
      qAided,
      (snap) => {
        state.aided.docs  = snap.docs.map((d) => mapDoc(d, 'Aided', financialYear));
        state.aided.ready = true;
        merge();
      },
      (err) => { setError(err.message); setLoading(false); },
    );

    const unsubUnaided = onSnapshot(
      qUnaided,
      (snap) => {
        state.unaided.docs  = snap.docs.map((d) => mapDoc(d, 'Un-Aided', financialYear));
        state.unaided.ready = true;
        merge();
      },
      (err) => { setError(err.message); setLoading(false); },
    );

    const unsubWp = onSnapshot(
      qWp,
      (snap) => {
        state.wp.docs  = snap.docs.map((d) => mapDoc(d, 'WP Un-Aided', financialYear));
        state.wp.ready = true;
        merge();
      },
      (err) => { setError(err.message); setLoading(false); },
    );

    return () => { unsubAided(); unsubUnaided(); unsubWp(); };
  }, [financialYear, cashBookType]);

  return { batches, loading, error };
}
