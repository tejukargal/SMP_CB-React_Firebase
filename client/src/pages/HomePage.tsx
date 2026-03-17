import { useMemo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '@/firebase';
import { useEntries } from '@/hooks/useEntries';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useDashboardData, type LedgerTickerItem } from '@/hooks/useDashboardData';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import type { Entry } from '@smp-cashbook/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function computeStats(entries: Entry[]) {
  const aided   = entries.filter(e => e.cashBookType === 'Aided');
  const unAided = entries.filter(e => e.cashBookType === 'Un-Aided');
  const sum = (arr: Entry[], t: string) =>
    arr.filter(e => e.type === t).reduce((s, e) => s + e.amount, 0);
  return {
    totalReceipts:   sum(entries, 'Receipt'),
    totalPayments:   sum(entries, 'Payment'),
    aidedReceipts:   sum(aided,   'Receipt'),
    aidedPayments:   sum(aided,   'Payment'),
    unAidedReceipts: sum(unAided, 'Receipt'),
    unAidedPayments: sum(unAided, 'Payment'),
    totalCount:  entries.length,
    aidedCount:  aided.length,
    unAidedCount: unAided.length,
  };
}

function buildTickerItems(entries: Entry[], fy: string): LedgerTickerItem[] {
  const map = new Map<string, LedgerTickerItem>();
  for (const e of entries) {
    if (!e.headOfAccount || e.amount === 0) continue;
    const key  = `${e.headOfAccount}|${e.cashBookType}`;
    const prev = map.get(key) ??
      { head: e.headOfAccount, fy, cashBookType: e.cashBookType, receipts: 0, payments: 0 };
    if (e.type === 'Receipt') prev.receipts += e.amount;
    else                      prev.payments += e.amount;
    map.set(key, prev);
  }
  return Array.from(map.values()).filter(i => i.receipts > 0 || i.payments > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Search types
// ─────────────────────────────────────────────────────────────────────────────
interface Amounts { receipts: number; payments: number; }
interface YearData {
  fy:       string;
  isActive: boolean;
  aided:    Amounts;
  unAided:  Amounts;
}
interface SearchGroup { head: string; years: YearData[]; }

function buildSearchResults(
  pool:     LedgerTickerItem[],
  query:    string,
  activeFY: string,
): SearchGroup[] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const matched = pool.filter(i => i.head.toLowerCase().includes(q));
  if (matched.length === 0) return [];

  // head → fy → YearData
  const byHead = new Map<string, Map<string, YearData>>();
  for (const item of matched) {
    if (!byHead.has(item.head)) byHead.set(item.head, new Map());
    const byFY = byHead.get(item.head)!;
    const existing = byFY.get(item.fy) ?? {
      fy: item.fy,
      isActive: item.fy === activeFY,
      aided:   { receipts: 0, payments: 0 },
      unAided: { receipts: 0, payments: 0 },
    };
    if (item.cashBookType === 'Aided') {
      existing.aided = { receipts: item.receipts, payments: item.payments };
    } else {
      existing.unAided = { receipts: item.receipts, payments: item.payments };
    }
    byFY.set(item.fy, existing);
  }

  const results: SearchGroup[] = [];
  for (const [head, byFY] of byHead) {
    const sortedYears = Array.from(byFY.values()).sort((a, b) => {
      if (a.isActive) return -1;
      if (b.isActive) return 1;
      return b.fy.localeCompare(a.fy);
    });
    results.push({ head, years: sortedYears });
  }
  return results.sort((a, b) => a.head.localeCompare(b.head));
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI atoms
// ─────────────────────────────────────────────────────────────────────────────
function PulseSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

function SectionHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h2>
      <div className="h-px flex-1 bg-slate-200" />
      {aside}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard stat cards
// ─────────────────────────────────────────────────────────────────────────────
const C_MAP = {
  green: { bg: 'bg-green-50',  border: 'border-green-100',  label: 'text-green-600', val: 'text-green-800' },
  red:   { bg: 'bg-red-50',    border: 'border-red-100',    label: 'text-red-500',   val: 'text-red-700'   },
  blue:  { bg: 'bg-blue-50',   border: 'border-blue-100',   label: 'text-blue-600',  val: 'text-blue-800'  },
  amber: { bg: 'bg-amber-50',  border: 'border-amber-100',  label: 'text-amber-600', val: 'text-amber-800' },
  slate: { bg: 'bg-slate-50',  border: 'border-slate-200',  label: 'text-slate-500', val: 'text-slate-800' },
} as const;

function StatCard({
  label, value, color, isCount = false,
}: {
  label: string; value: number; color: keyof typeof C_MAP; isCount?: boolean;
}) {
  const c = C_MAP[color];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} px-4 py-3`}>
      <p className={`text-[11px] font-medium ${c.label}`}>{label}</p>
      <p className={`mt-1 text-lg font-bold leading-tight tracking-tight ${c.val}`}>
        {isCount ? value.toLocaleString('en-IN') : formatCurrency(value)}
      </p>
    </div>
  );
}

const T_MAP = {
  teal:   { wrap: 'bg-teal-50/60 border-teal-100',     badge: 'bg-teal-100 text-teal-700'     },
  orange: { wrap: 'bg-orange-50/60 border-orange-100', badge: 'bg-orange-100 text-orange-700' },
} as const;

function TypeRow({
  label, receipts, payments, count, color,
}: {
  label: string; receipts: number; payments: number; count: number; color: keyof typeof T_MAP;
}) {
  const c   = T_MAP[color];
  const bal = receipts - payments;
  return (
    <div className={`rounded-xl border ${c.wrap} px-4 py-3`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.badge}`}>{label}</span>
        <span className="text-[11px] text-slate-400">{count.toLocaleString('en-IN')} entries</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] text-green-600 mb-0.5">Receipts</p>
          <p className="text-xs font-semibold text-green-700">{formatCurrency(receipts)}</p>
        </div>
        <div>
          <p className="text-[11px] text-red-500 mb-0.5">Payments</p>
          <p className="text-xs font-semibold text-red-600">{formatCurrency(payments)}</p>
        </div>
        <div>
          <p className="text-[11px] text-blue-600 mb-0.5">Balance</p>
          <p className={`text-xs font-semibold ${bal >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
            {formatCurrency(Math.abs(bal))}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docToEntry(doc: { id: string; data(): Record<string, any> }, cashBookType: string): Entry {
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
    cashBookType:  cashBookType    as 'Aided' | 'Un-Aided',
    createdAt:     d.createdAt     ?? '',
    voucherNo:     d.voucherNo,
  };
}

function LedgerDetailModal({
  head, fy, onClose,
}: { head: string; fy: string; onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [aidedSnap, unAidedSnap] = await Promise.all([
          getDocs(collection(firestore, 'entries', fy, 'Aided')),
          getDocs(collection(firestore, 'entries', fy, 'Un-Aided')),
        ]);
        if (cancelled) return;
        const all = [
          ...aidedSnap.docs.map(d => docToEntry(d, 'Aided')),
          ...unAidedSnap.docs.map(d => docToEntry(d, 'Un-Aided')),
        ]
          .filter(e => e.headOfAccount === head)
          .sort((a, b) => a.date.localeCompare(b.date));
        setEntries(all);
      } catch (err) {
        console.error('[LedgerDetailModal]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [head, fy]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const receipts = entries.filter(e => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
  const payments = entries.filter(e => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
  const balance  = receipts - payments;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-800">{head}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {fy}&nbsp;&middot;&nbsp;
              {loading ? 'Loading…' : `${entries.length} transaction${entries.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          >
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary strip */}
        {!loading && entries.length > 0 && (
          <div className="flex items-center gap-5 px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-xs">
            <span className="text-green-700">
              Receipts <span className="font-bold">{formatCurrency(receipts)}</span>
            </span>
            <span className="text-red-600">
              Payments <span className="font-bold">{formatCurrency(payments)}</span>
            </span>
            <span className={`font-bold ${balance >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>
              Balance {formatCurrency(Math.abs(balance))}
            </span>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col gap-2 p-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-9 rounded-lg animate-pulse bg-slate-100" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <svg className="h-7 w-7 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0120 9.414V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-slate-400">No transactions for this head in {fy}</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white border-b border-slate-100 shadow-sm">
                <tr>
                  <th className="py-2.5 pl-5 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Date</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Type</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Book</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Amount</th>
                  <th className="pl-3 pr-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cheque</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';
                  return (
                    <>
                      <tr key={e.id} className={`${rowBg} ${e.notes ? '' : 'border-b border-slate-50 last:border-0'}`}>
                        <td className="py-2 pl-5 pr-3 font-medium text-slate-700 whitespace-nowrap">{formatDate(e.date)}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            e.type === 'Receipt' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {e.type}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            e.cashBookType === 'Aided' ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {e.cashBookType}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${
                          e.type === 'Receipt' ? 'text-green-700' : 'text-red-600'
                        }`}>
                          {formatCurrency(e.amount)}
                        </td>
                        <td className="pl-3 pr-5 py-2 text-slate-500">{e.chequeNo || <span className="text-slate-300">—</span>}</td>
                      </tr>
                      {e.notes && (
                        <tr key={`${e.id}-notes`} className={`${rowBg} border-b border-slate-50 last:border-0`}>
                          <td colSpan={5} className="pl-5 pr-5 pb-2 pt-0">
                            <p className="text-[11px] text-slate-500 leading-relaxed whitespace-pre-wrap break-words">
                              {e.notes}
                            </p>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Search result — horizontal row table
// ─────────────────────────────────────────────────────────────────────────────
function YearRow({
  year, onDblClick,
}: { year: YearData; onDblClick: () => void }) {
  const { fy, isActive, aided, unAided } = year;
  const totalR = aided.receipts + unAided.receipts;
  const totalP = aided.payments + unAided.payments;
  const totalB = totalR - totalP;

  const fmt = (v: number) => v > 0 ? formatCurrency(v) : <span className="text-slate-200">—</span>;

  return (
    <tr
      onDoubleClick={onDblClick}
      className={`border-b border-slate-100 last:border-0 cursor-pointer select-none
        transition-colors hover:bg-blue-50/50
        ${isActive ? 'bg-blue-50/20' : ''}`}
      title="Double-click to view transactions"
    >
      {/* FY */}
      <td className="py-2 pl-4 pr-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-semibold ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>{fy}</span>
          {isActive && (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 leading-none">
              Active
            </span>
          )}
        </div>
      </td>
      {/* Aided */}
      <td className="px-2 py-2 text-right text-xs text-green-700 whitespace-nowrap">{fmt(aided.receipts)}</td>
      <td className="px-2 py-2 text-right text-xs text-red-600 whitespace-nowrap">{fmt(aided.payments)}</td>
      {/* Un-Aided */}
      <td className="px-2 py-2 text-right text-xs text-green-700 whitespace-nowrap">{fmt(unAided.receipts)}</td>
      <td className="px-2 py-2 text-right text-xs text-red-600 whitespace-nowrap">{fmt(unAided.payments)}</td>
      {/* Total */}
      <td className="px-2 py-2 text-right text-xs font-semibold text-green-700 whitespace-nowrap">{formatCurrency(totalR)}</td>
      <td className="px-2 py-2 text-right text-xs font-semibold text-red-600 whitespace-nowrap">{formatCurrency(totalP)}</td>
      <td className={`pl-2 pr-4 py-2 text-right text-xs font-bold whitespace-nowrap ${totalB >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>
        {formatCurrency(Math.abs(totalB))}
      </td>
    </tr>
  );
}

function SearchResultGroup({
  group, onOpenModal,
}: { group: SearchGroup; onOpenModal: (head: string, fy: string) => void }) {
  return (
    <div>
      {/* Head label */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-slate-700">{group.head}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          {group.years.length} yr{group.years.length !== 1 ? 's' : ''}
        </span>
        <div className="h-px flex-1 bg-slate-100" />
        <span className="text-[10px] italic text-slate-400">double-click row to view</span>
      </div>

      <div className="overflow-x-auto overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full min-w-[540px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="py-2 pl-4 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">FY</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-teal-500" colSpan={2}>Aided</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-orange-500" colSpan={2}>Un-Aided</th>
              <th className="pl-2 pr-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400" colSpan={3}>Total</th>
            </tr>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="py-1 pl-4 pr-3" />
              <th className="px-2 py-1 text-right text-[10px] font-medium text-green-500">R</th>
              <th className="px-2 py-1 text-right text-[10px] font-medium text-red-400">P</th>
              <th className="px-2 py-1 text-right text-[10px] font-medium text-green-500">R</th>
              <th className="px-2 py-1 text-right text-[10px] font-medium text-red-400">P</th>
              <th className="px-2 py-1 text-right text-[10px] font-medium text-green-500">R</th>
              <th className="px-2 py-1 text-right text-[10px] font-medium text-red-400">P</th>
              <th className="pl-2 pr-4 py-1 text-right text-[10px] font-medium text-blue-400">Bal</th>
            </tr>
          </thead>
          <tbody>
            {group.years.map(year => (
              <YearRow
                key={year.fy}
                year={year}
                onDblClick={() => onOpenModal(group.head, year.fy)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger ticker
// ─────────────────────────────────────────────────────────────────────────────
function TickerCard({ item }: { item: LedgerTickerItem }) {
  return (
    <div className="mx-1.5 my-2 flex items-center gap-2 rounded-lg border border-slate-200
      bg-white px-3.5 py-2 shadow-sm whitespace-nowrap">
      <span className="text-xs font-semibold text-slate-700">{item.head}</span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
        {item.fy}
      </span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        item.cashBookType === 'Aided' ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'
      }`}>
        {item.cashBookType}
      </span>
      {item.receipts > 0 && (
        <span className="text-xs font-medium text-green-600">R: {formatCurrency(item.receipts)}</span>
      )}
      {item.payments > 0 && (
        <span className="text-xs font-medium text-red-500">P: {formatCurrency(item.payments)}</span>
      )}
    </div>
  );
}

function LedgerTicker({ items }: { items: LedgerTickerItem[] }) {
  const [paused, setPaused] = useState(false);
  const duration = `${Math.max(40, items.length * 4)}s`;
  const doubled  = [...items, ...items];

  return (
    <>
      <style>{`
        @keyframes ledger-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div
        className="cursor-default overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        title="Hover to pause"
      >
        <div
          style={{
            display: 'flex', width: 'max-content',
            animation: `ledger-scroll ${duration} linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        >
          {doubled.map((item, i) => <TickerCard key={i} item={item} />)}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export function HomePage() {
  const { settings }                               = useSettings();
  const { user }                                   = useAuth();
  const { entries: aidedEntries,   loading: aL1 }  = useEntries(settings.activeFinancialYear, 'Aided');
  const { entries: unAidedEntries, loading: aL2 }  = useEntries(settings.activeFinancialYear, 'Un-Aided');
  const activeEntries = useMemo(
    () => [...aidedEntries, ...unAidedEntries],
    [aidedEntries, unAidedEntries],
  );
  const aL = aL1 || aL2;

  // ALL other financial years (not just 3)
  const otherFYs = useMemo(
    () => [...settings.financialYears]
      .filter(fy => fy !== settings.activeFinancialYear)
      .sort((a, b) => b.localeCompare(a)),
    [settings.financialYears, settings.activeFinancialYear],
  );

  const { fyStats: histStats, tickerItems: histTicker, loading: hL } =
    useDashboardData(otherFYs);

  const activeStats = useMemo(() => computeStats(activeEntries), [activeEntries]);

  // Combined pool used for both the ticker and search — all years
  const allTickerPool = useMemo(
    () => [
      ...buildTickerItems(activeEntries, settings.activeFinancialYear),
      ...histTicker,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEntries, histTicker, settings.activeFinancialYear],
  );

  // Ticker: Fisher-Yates shuffle once per pool-size change
  const [tickerItems, setTickerItems] = useState<LedgerTickerItem[]>([]);
  const poolSize = allTickerPool.length;
  const prevPoolSize = useRef(-1);
  useEffect(() => {
    if (poolSize === prevPoolSize.current) return;
    prevPoolSize.current = poolSize;
    const pool = [...allTickerPool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setTickerItems(pool);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolSize]);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const searchResults = useMemo(
    () => buildSearchResults(allTickerPool, searchQuery, settings.activeFinancialYear),
    [allTickerPool, searchQuery, settings.activeFinancialYear],
  );

  // Ledger detail modal
  const [modalLedger, setModalLedger] = useState<{ head: string; fy: string } | null>(null);

  const activeBal = activeStats.totalReceipts - activeStats.totalPayments;
  const userName  = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '';
  const allFYs    = [settings.activeFinancialYear, ...otherFYs];

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-8 pt-1">

      {/* ── Greeting ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {getGreeting()}{userName ? `, ${userName}` : ''}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {settings.activeFinancialYear}&nbsp;&middot;&nbsp;
            {settings.activeCashBookType === 'Both' ? 'Aided & Un-Aided' : settings.activeCashBookType}
          </p>
        </div>
        <Link
          to="/new-entry"
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2
            text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Entry
        </Link>
      </div>

      {/* ── Search bar ── */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder={`Search ledgers across ${allFYs.length} financial year${allFYs.length !== 1 ? 's' : ''}…`}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm
            text-slate-700 shadow-sm placeholder:text-slate-400
            focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center
              justify-center rounded-full bg-slate-200 hover:bg-slate-300 transition-colors"
            aria-label="Clear search"
          >
            <svg className="h-3 w-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SEARCH RESULTS — replaces dashboard when query is active
         ═══════════════════════════════════════════════════════════════════════ */}
      {searchResults !== null ? (
        <section className="flex flex-col gap-6">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(aL || hL) ? (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Loading some years…
                </span>
              ) : searchResults.length > 0 ? (
                <span className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{searchResults.length}</span>
                  {' '}ledger{searchResults.length !== 1 ? 's' : ''} matched across{' '}
                  <span className="font-semibold text-slate-700">{allFYs.length}</span> year{allFYs.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-xs text-slate-400">No ledgers matched "{searchQuery}"</span>
              )}
            </div>
          </div>

          {/* Results list */}
          {searchResults.length > 0 ? (
            <div className="flex flex-col gap-6">
              {searchResults.map(group => (
                <SearchResultGroup
                  key={group.head}
                  group={group}
                  onOpenModal={(head, fy) => setModalLedger({ head, fy })}
                />
              ))}
            </div>
          ) : !aL && !hL && (
            /* Empty state */
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed
              border-slate-200 py-16 text-center">
              <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm text-slate-400">
                No ledgers found for <span className="font-medium text-slate-600">"{searchQuery}"</span>
              </p>
              <p className="text-xs text-slate-400">Try a different head of account name</p>
            </div>
          )}
        </section>

      ) : (
        /* ═══════════════════════════════════════════════════════════════════
           NORMAL DASHBOARD — shown when search is empty
           ═══════════════════════════════════════════════════════════════════ */
        <>
          {/* ── Active FY ── */}
          <section>
            <SectionHead title={`${settings.activeFinancialYear} — Active`} />
            {aL ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[...Array(4)].map((_, i) => <PulseSkeleton key={i} className="h-20" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Total Receipts" value={activeStats.totalReceipts} color="green" />
                  <StatCard label="Total Payments" value={activeStats.totalPayments} color="red" />
                  <StatCard
                    label="Balance"
                    value={Math.abs(activeBal)}
                    color={activeBal >= 0 ? 'blue' : 'amber'}
                  />
                  <StatCard label="Entries" value={activeStats.totalCount} color="slate" isCount />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TypeRow
                    label="Aided" color="teal"
                    receipts={activeStats.aidedReceipts}
                    payments={activeStats.aidedPayments}
                    count={activeStats.aidedCount}
                  />
                  <TypeRow
                    label="Un-Aided" color="orange"
                    receipts={activeStats.unAidedReceipts}
                    payments={activeStats.unAidedPayments}
                    count={activeStats.unAidedCount}
                  />
                </div>
              </>
            )}
          </section>

          {/* ── Previous FYs ── */}
          {otherFYs.length > 0 && (
            <section>
              <SectionHead title="Previous Financial Years" />
              {hL ? (
                <div className="space-y-2">
                  {otherFYs.map(fy => <PulseSkeleton key={fy} className="h-11" />)}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="py-2.5 pl-4 pr-3 text-left   text-xs font-semibold text-slate-500">FY</th>
                        <th className="px-3    py-2.5 text-right text-xs font-semibold text-slate-500">Receipts</th>
                        <th className="px-3    py-2.5 text-right text-xs font-semibold text-slate-500">Payments</th>
                        <th className="px-3    py-2.5 text-right text-xs font-semibold text-slate-500">Balance</th>
                        <th className="pl-3 pr-4 py-2.5 text-right text-xs font-semibold text-slate-500">Entries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {otherFYs.map((fy, i) => {
                        const s   = histStats.get(fy);
                        const bal = (s?.totalReceipts ?? 0) - (s?.totalPayments ?? 0);
                        return (
                          <tr
                            key={fy}
                            className={`border-b border-slate-100 last:border-0 ${
                              i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                            }`}
                          >
                            <td className="py-2.5 pl-4 pr-3 text-xs font-semibold text-slate-700">{fy}</td>
                            <td className="px-3 py-2.5 text-right text-xs text-green-700">
                              {s ? formatCurrency(s.totalReceipts) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs text-red-600">
                              {s ? formatCurrency(s.totalPayments) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className={`px-3 py-2.5 text-right text-xs font-semibold ${
                              bal >= 0 ? 'text-blue-700' : 'text-amber-700'
                            }`}>
                              {s ? formatCurrency(Math.abs(bal)) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="pl-3 pr-4 py-2.5 text-right text-xs text-slate-500">
                              {s ? s.entryCount.toLocaleString('en-IN') : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ── Ledger Ticker ── */}
          {tickerItems.length > 0 && (
            <section>
              <SectionHead
                title="Ledger Activity"
                aside={<span className="text-xs italic text-slate-400">hover to pause</span>}
              />
              <LedgerTicker items={tickerItems} />
            </section>
          )}
        </>
      )}

      {/* ── Ledger Detail Modal ── */}
      {modalLedger && (
        <LedgerDetailModal
          head={modalLedger.head}
          fy={modalLedger.fy}
          onClose={() => setModalLedger(null)}
        />
      )}

    </div>
  );
}
