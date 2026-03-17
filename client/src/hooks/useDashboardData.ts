import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '@/firebase';
import type { Entry } from '@smp-cashbook/shared';

// ── Public types ───────────────────────────────────────────────────────────────
export interface FYStats {
  financialYear:   string;
  aidedReceipts:   number;
  aidedPayments:   number;
  unAidedReceipts: number;
  unAidedPayments: number;
  totalReceipts:   number;
  totalPayments:   number;
  entryCount:      number;
}

export interface LedgerTickerItem {
  head:         string;
  fy:           string;
  cashBookType: string;
  receipts:     number;
  payments:     number;
}

// ── Firestore doc → Entry ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEntry(doc: { id: string; data(): Record<string, any> }): Entry {
  const d = doc.data();
  return {
    id:            doc.id,
    date:          d.date          ?? '',
    chequeNo:      d.chequeNo      ?? '',
    amount:        d.amount        ?? 0,
    headOfAccount: d.headOfAccount ?? '',
    notes:         d.notes         ?? '',
    type:          d.type          ?? 'Receipt',
    financialYear: d.financialYear ?? '',
    cashBookType:  d.cashBookType  ?? 'Aided',
    createdAt:     d.createdAt     ?? '',
    voucherNo:     d.voucherNo,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useDashboardData(financialYears: string[]): {
  fyStats:     Map<string, FYStats>;
  tickerItems: LedgerTickerItem[];
  loading:     boolean;
} {
  const [fyStats,     setFyStats]     = useState<Map<string, FYStats>>(new Map());
  const [tickerItems, setTickerItems] = useState<LedgerTickerItem[]>([]);
  const [loading,     setLoading]     = useState(financialYears.length > 0);

  // Stringify to avoid re-fetching when a new array ref with same content is passed
  const key = financialYears.join('|');

  useEffect(() => {
    if (financialYears.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetchAll = async () => {
      const statsMap   = new Map<string, FYStats>();
      const allTicker: LedgerTickerItem[] = [];

      await Promise.all(
        financialYears.map(async fy => {
          const [aidedSnap, unAidedSnap] = await Promise.all([
            getDocs(collection(firestore, 'entries', fy, 'Aided')),
            getDocs(collection(firestore, 'entries', fy, 'Un-Aided')),
          ]);

          const aidedEntries   = aidedSnap.docs.map(toEntry);
          const unAidedEntries = unAidedSnap.docs.map(toEntry);

          const sum = (arr: Entry[], t: string) =>
            arr.filter(e => e.type === t).reduce((s, e) => s + e.amount, 0);

          const aR = sum(aidedEntries,   'Receipt');
          const aP = sum(aidedEntries,   'Payment');
          const uR = sum(unAidedEntries, 'Receipt');
          const uP = sum(unAidedEntries, 'Payment');

          statsMap.set(fy, {
            financialYear:   fy,
            aidedReceipts:   aR, aidedPayments:   aP,
            unAidedReceipts: uR, unAidedPayments: uP,
            totalReceipts:   aR + uR,
            totalPayments:   aP + uP,
            entryCount:      aidedEntries.length + unAidedEntries.length,
          });

          // Build ticker items: group by headOfAccount × cashBookType for this FY
          const addTicker = (entries: Entry[], cbt: string) => {
            const headMap = new Map<string, LedgerTickerItem>();
            for (const e of entries) {
              if (!e.headOfAccount) continue;
              const prev = headMap.get(e.headOfAccount) ??
                { head: e.headOfAccount, fy, cashBookType: cbt, receipts: 0, payments: 0 };
              if (e.type === 'Receipt') prev.receipts += e.amount;
              else                      prev.payments += e.amount;
              headMap.set(e.headOfAccount, prev);
            }
            for (const item of headMap.values()) {
              if (item.receipts > 0 || item.payments > 0) allTicker.push(item);
            }
          };

          addTicker(aidedEntries,   'Aided');
          addTicker(unAidedEntries, 'Un-Aided');
        }),
      );

      setFyStats(statsMap);
      setTickerItems(allTicker);
      setLoading(false);
    };

    fetchAll().catch(err => {
      console.error('[useDashboardData] fetch error:', err);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { fyStats, tickerItems, loading };
}
