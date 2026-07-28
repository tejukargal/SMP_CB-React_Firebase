import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/firebase';
import type { Firm } from '@smp-cashbook/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(doc: any): Firm {
  const data = doc.data();
  return {
    id:        doc.id,
    firmName:  data.firmName  ?? '',
    accountNo: data.accountNo ?? '',
    ifscCode:  data.ifscCode  ?? '',
    bankName:  data.bankName  ?? '',
    branch:    data.branch    ?? '',
    createdAt: data.createdAt?.toDate().toISOString() ?? '',
    updatedAt: data.updatedAt?.toDate().toISOString() ?? '',
  };
}

/** Flat, global Firm Directory — not scoped per financial year/cash book type, since a firm's bank account doesn't change with the FY. Read-only; writes go through apiUpsertFirm. */
export function useFirms() {
  const [firms, setFirms]     = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(firestore, 'firms'), orderBy('firmName', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setFirms(snap.docs.map(mapDoc));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { firms, loading, error };
}
