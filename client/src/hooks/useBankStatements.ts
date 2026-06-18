import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/firebase';
import type { BankKey, BankStatementTxn } from '@smp-cashbook/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(doc: any): BankStatementTxn {
  const d = doc.data();
  return {
    id:                 doc.id,
    bankKey:            d.bankKey            ?? '',
    financialYear:      d.financialYear      ?? '',
    date:               d.date               ?? '',
    narration:          d.narration          ?? '',
    chequeNo:           d.chequeNo           ?? '',
    debit:              d.debit              ?? 0,
    credit:             d.credit             ?? 0,
    balance:            d.balance            ?? 0,
    seq:                d.seq                ?? 0,
    reconciledEntryId:  d.reconciledEntryId  ?? '',
    importedAt:         d.importedAt         ?? '',
    importedBy:         d.importedBy         ?? '',
  };
}

function sortTxns(txns: BankStatementTxn[]) {
  return [...txns].sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.seq - b.seq,
  );
}

export function useBankStatements(financialYear: string, bankKey: BankKey) {
  const [transactions, setTransactions]           = useState<BankStatementTxn[]>([]);
  const [openingBalanceOverride, setOpeningBalanceOverride] = useState<number | null>(null);
  const [loading, setLoading]                     = useState(true);
  const [error, setError]                         = useState<string | null>(null);
  const hasData = useRef(false);

  useEffect(() => {
    if (!financialYear || !bankKey) return;

    setError(null);
    if (!hasData.current) setLoading(true);

    // Listen to transactions sub-collection
    const col = collection(firestore, 'bankStatements', financialYear, bankKey);
    const q   = query(col, orderBy('date', 'asc'));
    const unsubTxns = onSnapshot(
      q,
      (snap) => {
        setTransactions(sortTxns(snap.docs.map(mapDoc)));
        setLoading(false);
        hasData.current = true;
      },
      (err) => { setError(err.message); setLoading(false); },
    );

    // Listen to parent doc for opening balance override
    const parentRef = doc(firestore, 'bankStatements', financialYear);
    const unsubMeta = onSnapshot(
      parentRef,
      (snap) => {
        if (snap.exists()) {
          const val = snap.data()?.[`${bankKey}_openingBalance`];
          setOpeningBalanceOverride(typeof val === 'number' ? val : null);
        } else {
          setOpeningBalanceOverride(null);
        }
      },
    );

    return () => { unsubTxns(); unsubMeta(); };
  }, [financialYear, bankKey]);

  return { transactions, openingBalanceOverride, loading, error };
}
