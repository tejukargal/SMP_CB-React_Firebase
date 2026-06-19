import { useMemo, useState, useEffect, useRef, useTransition } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '@/firebase';
import { useEntries } from '@/hooks/useEntries';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useDashboardData, type LedgerTickerItem } from '@/hooks/useDashboardData';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { apiGetBankOpeningBalances } from '@/api/bankBalances';
import type { Entry } from '@smp-cashbook/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function getTodayLabel(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
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
    totalCount:   entries.length,
    aidedCount:   aided.length,
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
// Bank defs
// ─────────────────────────────────────────────────────────────────────────────
const BANK_HEADS = [
  { key: 'sbi_ppl',          headOfAccount: 'Sbi Ppl',          label: 'SBI PPL Account'             },
  { key: 'can_bank_pd',      headOfAccount: 'Can Bank Pd',       label: 'Canara Bank PD Account'      },
  { key: 'can_bank_scholar', headOfAccount: 'Can Bank Scholor',  label: 'Canara Bank Scholar Account' },
] as const;
function findBankDef(head: string) {
  return BANK_HEADS.find(b => b.headOfAccount.toLowerCase() === head.toLowerCase().trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Search types
// ─────────────────────────────────────────────────────────────────────────────
interface Amounts { receipts: number; payments: number; }
interface YearData { fy: string; isActive: boolean; aided: Amounts; unAided: Amounts; }
type MatchReason = 'head' | 'amount';
interface SearchGroup { head: string; years: YearData[]; matchedBy: MatchReason[]; }

// Amount guard: must be purely numeric and ≥ 4 digits; startsWith so "5000"
// matches ₹5000/₹50000 but not every entry that happens to contain a "5"
function canMatchAmount(q: string) { return /^\d{4,}$/.test(q); }

function buildSearchResults(
  pool: LedgerTickerItem[], entries: Entry[], query: string, activeFY: string,
): SearchGroup[] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const amountOk = canMatchAmount(q);

  // Collect matched head names, tracking WHY each matched
  const headReasons = new Map<string, Set<MatchReason>>();
  const addReason = (head: string, r: MatchReason) => {
    if (!headReasons.has(head)) headReasons.set(head, new Set());
    headReasons.get(head)!.add(r);
  };

  for (const item of pool) {
    if (item.head.toLowerCase().includes(q)) addReason(item.head, 'head');
  }
  if (amountOk) {
    for (const e of entries) {
      if (!e.headOfAccount) continue;
      if (String(Math.round(e.amount)).startsWith(q))
        addReason(e.headOfAccount, 'amount');
    }
  }
  if (headReasons.size === 0) return [];

  // Build FY-level groups from the ticker pool for matched heads (full totals)
  const byHead = new Map<string, Map<string, YearData>>();
  for (const item of pool) {
    if (!headReasons.has(item.head)) continue;
    if (!byHead.has(item.head)) byHead.set(item.head, new Map());
    const byFY = byHead.get(item.head)!;
    const ex = byFY.get(item.fy) ?? {
      fy: item.fy, isActive: item.fy === activeFY,
      aided: { receipts: 0, payments: 0 }, unAided: { receipts: 0, payments: 0 },
    };
    if (item.cashBookType === 'Aided') ex.aided = { receipts: item.receipts, payments: item.payments };
    else                               ex.unAided = { receipts: item.receipts, payments: item.payments };
    byFY.set(item.fy, ex);
  }
  const results: SearchGroup[] = [];
  for (const [head, byFY] of byHead) {
    const reasons = headReasons.get(head)!;
    const matchedBy: MatchReason[] = (['head', 'notes', 'amount'] as MatchReason[]).filter(r => reasons.has(r));
    results.push({
      head,
      matchedBy,
      years: Array.from(byFY.values()).sort((a, b) => {
        if (a.isActive) return -1; if (b.isActive) return 1;
        return b.fy.localeCompare(a.fy);
      }),
    });
  }
  return results.sort((a, b) => a.head.localeCompare(b.head));
}

// ─────────────────────────────────────────────────────────────────────────────
// Match-reason badges
// ─────────────────────────────────────────────────────────────────────────────
const MATCH_BADGE: Record<MatchReason, { label: string; cls: string }> = {
  head:   { label: 'Head of Account', cls: 'bg-blue-50 text-blue-600 border-blue-200'   },
  amount: { label: 'Amount',          cls: 'bg-amber-50 text-amber-600 border-amber-200' },
};
function MatchBadges({ reasons }: { reasons: MatchReason[] }) {
  return (
    <div className="flex items-center gap-1">
      {reasons.map(r => (
        <span key={r} className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${MATCH_BADGE[r].cls}`}>
          {MATCH_BADGE[r].label}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────
function PulseSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-100 ${className}`} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gradient KPI card  (reference-style: colored gradient bg, white text, icon)
// ─────────────────────────────────────────────────────────────────────────────
const KPI_ICONS = {
  receipts: (
    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-4-4m4 4l4-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" opacity={0.5} />
    </svg>
  ),
  payments: (
    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
    </svg>
  ),
  balance: (
    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  ),
  entries: (
    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
};

function GradientKpiCard({
  label, value, badge, gradient, icon, isCount = false,
}: {
  label: string; value: number; badge: string;
  gradient: string; icon: React.ReactNode; isCount?: boolean;
}) {
  return (
    <div className={`rounded-2xl px-4 py-3.5 ${gradient} shadow-md relative overflow-hidden`}>
      <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/10" />

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/25">
            {icon}
          </div>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white/85">
            {badge}
          </span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/65 mb-0.5">{label}</p>
        <p className="text-xl font-extrabold text-white leading-tight tracking-tight">
          {isCount ? value.toLocaleString('en-IN') : formatCurrency(value)}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Book breakdown card  (white card with colored accent top)
// ─────────────────────────────────────────────────────────────────────────────
function BookCard({
  label, receipts, payments, count, color,
}: { label: string; receipts: number; payments: number; count: number; color: 'teal' | 'orange' }) {
  const s = {
    teal:   { accent: 'bg-teal-500',   badge: 'bg-teal-50 text-teal-700 border border-teal-100',   bar: 'bg-teal-400'   },
    orange: { accent: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border border-orange-100', bar: 'bg-orange-400' },
  }[color];
  const bal  = receipts - payments;
  const rPct = (receipts + payments) > 0 ? Math.round((receipts / (receipts + payments)) * 100) : 50;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className={`h-0.5 w-full ${s.accent}`} />
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.badge}`}>{label}</span>
          <span className="text-[11px] text-slate-400">{count.toLocaleString('en-IN')} entries</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-2.5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Receipts</p>
            <p className="text-sm font-bold text-emerald-600">{formatCurrency(receipts)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Payments</p>
            <p className="text-sm font-bold text-rose-600">{formatCurrency(payments)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Balance</p>
            <p className={`text-sm font-bold ${bal >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
              {formatCurrency(Math.abs(bal))}
            </p>
          </div>
        </div>
        <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${rPct}%` }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] font-medium text-emerald-500">R {rPct}%</span>
          <span className="text-[9px] font-medium text-rose-400">P {100 - rPct}%</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card wrapper  (white card with header title)
// ─────────────────────────────────────────────────────────────────────────────
function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-700">{title}</h2>
        {aside}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Split-view modal on double-click
// ─────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docToEntry(doc: { id: string; data(): Record<string, any> }, cbt: string): Entry {
  const d = doc.data();
  return {
    id: doc.id, date: d.date ?? '', chequeNo: d.chequeNo ?? '',
    amount: d.amount ?? 0, headOfAccount: d.headOfAccount ?? '',
    notes: d.notes ?? '', type: d.type ?? 'Receipt',
    financialYear: d.financialYear ?? '', cashBookType: cbt as 'Aided' | 'Un-Aided',
    createdAt: d.createdAt ?? '', voucherNo: d.voucherNo,
  };
}

function SplitPanel({ entries, type }: { entries: Entry[]; type: 'Receipt' | 'Payment' }) {
  const isR  = type === 'Receipt';
  const total = entries.reduce((s, e) => s + e.amount, 0);
  return (
    <div className="flex flex-col">
      <div className={`flex items-center justify-between px-4 py-3 border border-b-0 rounded-t-xl
        ${isR ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
        <span className={`text-xs font-bold uppercase tracking-widest ${isR ? 'text-emerald-700' : 'text-rose-700'}`}>
          {type}s
        </span>
        <span className={`text-sm font-bold ${isR ? 'text-emerald-700' : 'text-rose-700'}`}>
          {formatCurrency(total)}
        </span>
      </div>
      {entries.length === 0 ? (
        <div className={`border border-t-0 rounded-b-xl py-10 text-center text-sm text-slate-400
          ${isR ? 'border-emerald-200' : 'border-rose-200'}`}>
          No {type.toLowerCase()} entries
        </div>
      ) : (
        <div className={`border border-t-0 rounded-b-xl overflow-hidden ${isR ? 'border-emerald-200' : 'border-rose-200'}`}>
          <table className="w-full text-left text-sm table-fixed">
            <colgroup><col className="w-[88px]" /><col /><col className="w-[88px]" /><col className="w-[108px]" /></colgroup>
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="py-2.5 pl-4 pr-2 text-xs font-semibold text-slate-400">Date</th>
                <th className="px-2 py-2.5 text-xs font-semibold text-slate-400">Head of Account</th>
                <th className="px-2 py-2.5 text-xs font-semibold text-slate-400">Cheque</th>
                <th className="pl-2 pr-4 py-2.5 text-xs font-semibold text-slate-400 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <>
                  <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors align-top">
                    <td className="py-2.5 pl-4 pr-2 text-xs text-slate-500 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-2 py-2.5 text-sm text-slate-700">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{e.headOfAccount}</span>
                        <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-semibold leading-4 ${
                          e.cashBookType === 'Aided' ? 'bg-teal-50 text-teal-600' : 'bg-orange-50 text-orange-600'
                        }`}>{e.cashBookType === 'Aided' ? 'A' : 'U'}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-slate-400 whitespace-nowrap">{e.chequeNo || '—'}</td>
                    <td className={`pl-2 pr-4 py-2.5 text-sm font-semibold text-right whitespace-nowrap ${isR ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {formatCurrency(e.amount)}
                    </td>
                  </tr>
                  {e.notes && (
                    <tr key={`${e.id}-n`} className="border-b border-slate-100 last:border-0">
                      <td colSpan={4} className="pl-4 pr-4 pb-2 pt-0">
                        <span className="text-[11px] text-violet-500 leading-snug">{e.notes}</span>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LedgerSplitModal({ head, fy, onClose }: { head: string; fy: string; onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [aSnap, uSnap] = await Promise.all([
          getDocs(collection(firestore, 'entries', fy, 'Aided')),
          getDocs(collection(firestore, 'entries', fy, 'Un-Aided')),
        ]);
        if (cancelled) return;
        const all = [
          ...aSnap.docs.map(d => docToEntry(d, 'Aided')),
          ...uSnap.docs.map(d => docToEntry(d, 'Un-Aided')),
        ].filter(e => e.headOfAccount === head).sort((a, b) => a.date.localeCompare(b.date));
        setEntries(all);
      } catch (err) { console.error(err); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [head, fy]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const receipts = entries.filter(e => e.type === 'Receipt');
  const payments = entries.filter(e => e.type === 'Payment');
  const totalR   = receipts.reduce((s, e) => s + e.amount, 0);
  const totalP   = payments.reduce((s, e) => s + e.amount, 0);
  const balance  = totalR - totalP;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">{head}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{fy} · {loading ? 'Loading…' : `${entries.length} transactions`}</p>
          </div>
          {!loading && entries.length > 0 && (
            <div className="flex items-center gap-5 text-xs mr-4">
              <span className="text-emerald-700">R <span className="font-bold">{formatCurrency(totalR)}</span></span>
              <span className="text-rose-600">P <span className="font-bold">{formatCurrency(totalP)}</span></span>
              <span className={`font-bold ${balance >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>
                Bal {formatCurrency(Math.abs(balance))}{balance < 0 ? ' Dr' : ''}
              </span>
            </div>
          )}
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded-xl animate-pulse bg-slate-100" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">No transactions for this head in {fy}</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <SplitPanel entries={receipts} type="Receipt" />
              <SplitPanel entries={payments} type="Payment" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Search result — year row
// ─────────────────────────────────────────────────────────────────────────────
function YearRow({ year, onDblClick }: { year: YearData; onDblClick: () => void }) {
  const { fy, isActive, aided, unAided } = year;
  const totalR = aided.receipts + unAided.receipts;
  const totalP = aided.payments + unAided.payments;
  const bal    = totalR - totalP;
  const fmt    = (v: number) => v > 0 ? formatCurrency(v) : <span className="text-slate-300">—</span>;
  return (
    <tr onDoubleClick={onDblClick}
      className={`border-b border-slate-100 last:border-0 cursor-pointer select-none
        transition-colors hover:bg-blue-50/60 ${isActive ? 'bg-blue-50/30' : ''}`}
      title="Double-click to view split transactions">
      <td className="py-3 pl-5 pr-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>{fy}</span>
          {isActive && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-600">Active</span>}
        </div>
      </td>
      <td className="px-3 py-3 text-right text-sm text-emerald-700 whitespace-nowrap">{fmt(aided.receipts)}</td>
      <td className="px-3 py-3 text-right text-sm text-rose-600   whitespace-nowrap">{fmt(aided.payments)}</td>
      <td className="px-3 py-3 text-right text-sm text-emerald-700 whitespace-nowrap">{fmt(unAided.receipts)}</td>
      <td className="px-3 py-3 text-right text-sm text-rose-600   whitespace-nowrap">{fmt(unAided.payments)}</td>
      <td className="px-3 py-3 text-right text-sm font-semibold text-emerald-700 whitespace-nowrap">{formatCurrency(totalR)}</td>
      <td className="px-3 py-3 text-right text-sm font-semibold text-rose-600   whitespace-nowrap">{formatCurrency(totalP)}</td>
      <td className={`pl-3 pr-5 py-3 text-right text-sm font-bold whitespace-nowrap ${bal >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>
        {formatCurrency(Math.abs(bal))}
      </td>
    </tr>
  );
}

function SearchResultGroup({ group, onOpenModal }: { group: SearchGroup; onOpenModal: (h: string, fy: string) => void }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-700">{group.head}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {group.years.length} yr{group.years.length !== 1 ? 's' : ''}
          </span>
          <MatchBadges reasons={group.matchedBy} />
        </div>
        <span className="text-[10px] italic text-slate-400 shrink-0 ml-3">double-click to view</span>
      </div>
      {/* Table — no extra wrapper padding so rows sit flush */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              <th className="py-2.5 pl-5 pr-3 text-left text-xs font-bold text-slate-400" rowSpan={2}>FY</th>
              <th className="px-3 py-2 text-center text-xs font-bold text-teal-600 border-l border-slate-100" colSpan={2}>Aided</th>
              <th className="px-3 py-2 text-center text-xs font-bold text-orange-500 border-l border-slate-100" colSpan={2}>Un-Aided</th>
              <th className="px-3 py-2 text-center text-xs font-bold text-slate-400 border-l border-slate-100" colSpan={3}>Total</th>
            </tr>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <th className="px-3 pb-2 pt-0.5 text-right text-[11px] font-semibold text-emerald-600 border-l border-slate-100">Receipts</th>
              <th className="px-3 pb-2 pt-0.5 text-right text-[11px] font-semibold text-rose-500">Payments</th>
              <th className="px-3 pb-2 pt-0.5 text-right text-[11px] font-semibold text-emerald-600 border-l border-slate-100">Receipts</th>
              <th className="px-3 pb-2 pt-0.5 text-right text-[11px] font-semibold text-rose-500">Payments</th>
              <th className="px-3 pb-2 pt-0.5 text-right text-[11px] font-semibold text-emerald-700 border-l border-slate-100">Receipts</th>
              <th className="px-3 pb-2 pt-0.5 text-right text-[11px] font-semibold text-rose-600">Payments</th>
              <th className="pl-3 pr-5 pb-2 pt-0.5 text-right text-[11px] font-semibold text-blue-600">Balance</th>
            </tr>
          </thead>
          <tbody>
            {group.years.map(year => (
              <YearRow key={year.fy} year={year} onDblClick={() => onOpenModal(group.head, year.fy)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BankSearchResult({ group, onOpenModal }: { group: SearchGroup; onOpenModal: (h: string, fy: string) => void }) {
  const bankDef = findBankDef(group.head)!;
  const fyKey   = group.years.map(y => y.fy).join('|');
  const [openingBals, setOpeningBals] = useState<Map<string, number>>(new Map());
  const [bLoading,    setBLoading]    = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBLoading(true);
    Promise.all(group.years.map(y =>
      apiGetBankOpeningBalances(y.fy).then(data => ({ fy: y.fy, val: (data[bankDef.key] ?? 0) as number })),
    )).then(rs => {
      if (cancelled) return;
      const map = new Map<string, number>();
      rs.forEach(({ fy, val }) => map.set(fy, val));
      setOpeningBals(map);
    }).catch(console.error).finally(() => { if (!cancelled) setBLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fyKey, bankDef.key]);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2 flex-wrap">
          <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <span className="text-sm font-bold text-slate-700">{group.head}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{bankDef.label}</span>
          <MatchBadges reasons={group.matchedBy} />
        </div>
        <span className="text-[10px] italic text-slate-400 shrink-0 ml-3">double-click to view</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <th className="py-2.5 pl-5 pr-3 text-left text-xs font-bold text-slate-400">FY</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-blue-500">Opening</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-emerald-600">Debit</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold text-rose-500">Credit</th>
              <th className="pl-3 pr-5 py-2.5 text-right text-xs font-bold text-slate-400">Closing</th>
            </tr>
          </thead>
          <tbody>
            {group.years.map(year => {
              const ob = openingBals.get(year.fy) ?? 0;
              const td = year.aided.receipts + year.unAided.receipts;
              const tc = year.aided.payments + year.unAided.payments;
              const cb = ob + tc - td;
              return (
                <tr key={year.fy} onDoubleClick={() => onOpenModal(group.head, year.fy)}
                  className={`border-b border-slate-100 last:border-0 cursor-pointer select-none
                    transition-colors hover:bg-blue-50/60 ${year.isActive ? 'bg-blue-50/30' : ''}`}>
                  <td className="py-3 pl-5 pr-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${year.isActive ? 'text-blue-700' : 'text-slate-700'}`}>{year.fy}</span>
                      {year.isActive && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-600">Active</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-medium text-blue-700 whitespace-nowrap">
                    {bLoading ? '…' : formatCurrency(ob)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-medium text-emerald-700 whitespace-nowrap">{formatCurrency(td)}</td>
                  <td className="px-3 py-3 text-right text-sm font-medium text-rose-600 whitespace-nowrap">{formatCurrency(tc)}</td>
                  <td className={`pl-3 pr-5 py-3 text-right text-sm font-bold whitespace-nowrap ${cb >= 0 ? 'text-slate-800' : 'text-orange-700'}`}>
                    {bLoading ? '…' : <>{formatCurrency(Math.abs(cb))}{cb < 0 ? ' Dr' : ''}</>}
                  </td>
                </tr>
              );
            })}
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
    <div className="mx-2 my-2.5 flex items-center gap-2.5 rounded-xl border border-slate-100
      bg-white px-4 py-2 shadow-sm whitespace-nowrap">
      <span className="text-xs font-semibold text-slate-700">{item.head}</span>
      <span className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{item.fy}</span>
      <span className={`rounded-lg px-1.5 py-0.5 text-[10px] font-semibold ${
        item.cashBookType === 'Aided' ? 'bg-teal-50 text-teal-600' : 'bg-orange-50 text-orange-600'
      }`}>{item.cashBookType}</span>
      {item.receipts > 0 && <span className="text-[11px] font-semibold text-emerald-600">R {formatCurrency(item.receipts)}</span>}
      {item.payments > 0 && <span className="text-[11px] font-semibold text-rose-500">P {formatCurrency(item.payments)}</span>}
    </div>
  );
}

function LedgerTicker({ items }: { items: LedgerTickerItem[] }) {
  const [paused, setPaused] = useState(false);
  const duration = `${Math.max(40, items.length * 4)}s`;
  const doubled  = [...items, ...items];
  return (
    <>
      <style>{`@keyframes ledger-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
      <div className="overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} title="Hover to pause">
        <div style={{ display: 'flex', width: 'max-content',
          animation: `ledger-scroll ${duration} linear infinite`,
          animationPlayState: paused ? 'paused' : 'running' }}>
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
  const { settings }                              = useSettings();
  const { user }                                  = useAuth();
  const { entries: aidedEntries,   loading: aL1 } = useEntries(settings.activeFinancialYear, 'Aided');
  const { entries: unAidedEntries, loading: aL2 } = useEntries(settings.activeFinancialYear, 'Un-Aided');
  const activeEntries = useMemo(() => [...aidedEntries, ...unAidedEntries], [aidedEntries, unAidedEntries]);
  const aL = aL1 || aL2;

  const otherFYs = useMemo(
    () => [...settings.financialYears]
      .filter(fy => fy !== settings.activeFinancialYear)
      .sort((a, b) => b.localeCompare(a)),
    [settings.financialYears, settings.activeFinancialYear],
  );

  const { fyStats: histStats, tickerItems: histTicker, allEntries: histEntries, loading: hL } = useDashboardData(otherFYs);
  const activeStats = useMemo(() => computeStats(activeEntries), [activeEntries]);

  const allTickerPool = useMemo(
    () => [...buildTickerItems(activeEntries, settings.activeFinancialYear), ...histTicker],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEntries, histTicker, settings.activeFinancialYear],
  );

  // All entries across every FY for notes/amount search
  const allEntriesPool = useMemo(
    () => [...activeEntries, ...histEntries],
    [activeEntries, histEntries],
  );

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

  // Search — mirrors EntryFilters exactly
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [, startTransition]           = useTransition();

  const handleSearch = (val: string) => {
    setSearchInput(val);
    startTransition(() => setSearchQuery(val));
  };

  const allFYs        = [settings.activeFinancialYear, ...otherFYs];
  const ledgerResults = useMemo(
    () => buildSearchResults(allTickerPool, allEntriesPool, searchQuery, settings.activeFinancialYear),
    [allTickerPool, allEntriesPool, searchQuery, settings.activeFinancialYear],
  );
  const isSearching = searchInput.trim().length > 0;

  // Top-3 head suggestions ranked by match frequency (mirrors EntryList pattern)
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    const amountOk = canMatchAmount(q);
    const counts = new Map<string, number>();
    for (const e of allEntriesPool) {
      if (!e.headOfAccount) continue;
      if (
        e.headOfAccount.toLowerCase().includes(q) ||
        (amountOk && String(Math.round(e.amount)).startsWith(q))
      ) counts.set(e.headOfAccount, (counts.get(e.headOfAccount) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => h);
  }, [allEntriesPool, searchQuery]);

  const [modalLedger, setModalLedger] = useState<{ head: string; fy: string } | null>(null);

  const activeBal = activeStats.totalReceipts - activeStats.totalPayments;
  const userName  = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '';

  return (
    <div className="flex flex-col pb-10">

      {/* ── Compact greeting row ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-3 pb-4">
        <div>
          <p className="text-[11px] font-medium text-slate-400 leading-tight">{getTodayLabel()}</p>
          <h1 className="text-base font-extrabold text-slate-800 leading-tight mt-0.5">
            {getGreeting()}{userName ? `, ${userName}` : ''}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
            {settings.activeFinancialYear}
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
            settings.activeCashBookType === 'Aided'
              ? 'border-teal-200 bg-teal-50 text-teal-700'
              : settings.activeCashBookType === 'Un-Aided'
                ? 'border-orange-200 bg-orange-50 text-orange-700'
                : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}>
            {settings.activeCashBookType === 'Both' ? 'Aided & Un-Aided' : settings.activeCashBookType}
          </span>
          <Link to="/new-entry"
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5
              text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Entry
          </Link>
        </div>
      </div>

      {/* ── Sticky search bar (mirrors transactions filter bar) ───────────────── */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-50/95 backdrop-blur-sm border-b-2 border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          {/* Search pill — w-52, exact match with EntryFilters */}
          <div className="relative w-52 shrink-0">
            <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400"
              fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Account or amount…"
              value={searchInput}
              onChange={e => handleSearch(e.target.value)}
              className={`h-9 w-full rounded-full border border-emerald-300 bg-white shadow-sm
                pl-10 text-sm font-medium text-slate-800
                placeholder:text-slate-400 placeholder:font-normal
                focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500
                transition-all duration-150 ${searchInput ? 'pr-9' : 'pr-4'}`}
            />
            {searchInput && (
              <button onClick={() => handleSearch('')} aria-label="Clear"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center
                  justify-center rounded-full bg-amber-400 hover:bg-amber-500 text-white transition-colors shrink-0">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {/* Suggestion pills — top-3 heads by match frequency, mirrors EntryList */}
          {searchSuggestions.length > 0 && (
            <>
              <div className="h-6 w-px shrink-0 bg-slate-200" />
              {searchSuggestions.map(head => (
                <button
                  key={head}
                  type="button"
                  onClick={() => handleSearch(head)}
                  className={`flex items-center rounded-lg border px-3 py-2 text-xs font-medium
                    whitespace-nowrap transition-colors ${
                      searchInput === head
                        ? 'border-blue-400 bg-blue-100 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                >
                  {head}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="pt-5">

        {/* Search results */}
        <div className={`flex flex-col gap-4 ${isSearching ? '' : 'hidden'}`}>
          <div className="flex items-center gap-2 h-[18px]">
            {(aL || hL) ? (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Loading…
              </span>
            ) : ledgerResults !== null && ledgerResults.length > 0 ? (
              <span className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{ledgerResults.length}</span>
                {' '}ledger{ledgerResults.length !== 1 ? 's' : ''} matched across{' '}
                <span className="font-semibold text-slate-700">{allFYs.length}</span> year{allFYs.length !== 1 ? 's' : ''}
              </span>
            ) : ledgerResults?.length === 0 && !aL && !hL ? (
              <span className="text-xs text-slate-400">No ledgers matched "{searchQuery}"</span>
            ) : null}
          </div>

          {ledgerResults !== null && ledgerResults.length > 0 && (
            <div className="flex flex-col gap-4">
              {ledgerResults.map(group =>
                findBankDef(group.head) ? (
                  <BankSearchResult key={group.head} group={group} onOpenModal={(h, fy) => setModalLedger({ head: h, fy })} />
                ) : (
                  <SearchResultGroup key={group.head} group={group} onOpenModal={(h, fy) => setModalLedger({ head: h, fy })} />
                ),
              )}
            </div>
          )}

          {ledgerResults?.length === 0 && !aL && !hL && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 py-14 text-center">
              <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm text-slate-400">No ledgers found for <span className="font-medium text-slate-600">"{searchQuery}"</span></p>
            </div>
          )}
        </div>

        {/* Dashboard */}
        <div className={`flex flex-col gap-6 ${!isSearching ? '' : 'hidden'}`}>

          {/* ── 4 gradient KPI cards ────────────────────────────────────────── */}
          {aL ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => <PulseSkeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <GradientKpiCard
                label="Total Receipts"
                value={activeStats.totalReceipts}
                badge={`${activeStats.totalCount} entries`}
                gradient="bg-gradient-to-br from-emerald-400 to-teal-600"
                icon={KPI_ICONS.receipts}
              />
              <GradientKpiCard
                label="Total Payments"
                value={activeStats.totalPayments}
                badge={`${settings.activeFinancialYear}`}
                gradient="bg-gradient-to-br from-violet-400 to-purple-600"
                icon={KPI_ICONS.payments}
              />
              <GradientKpiCard
                label={activeBal >= 0 ? 'Net Balance' : 'Deficit'}
                value={Math.abs(activeBal)}
                badge={activeBal >= 0 ? 'Cr' : 'Dr'}
                gradient={activeBal >= 0
                  ? 'bg-gradient-to-br from-sky-400 to-blue-600'
                  : 'bg-gradient-to-br from-amber-400 to-orange-500'}
                icon={KPI_ICONS.balance}
              />
              <GradientKpiCard
                label="Total Entries"
                value={activeStats.totalCount}
                badge={`${activeStats.aidedCount}A · ${activeStats.unAidedCount}U`}
                gradient="bg-gradient-to-br from-rose-400 to-pink-600"
                icon={KPI_ICONS.entries}
                isCount
              />
            </div>
          )}

          {/* ── Aided / Un-Aided breakdown ──────────────────────────────────── */}
          {aL ? (
            <div className="grid grid-cols-2 gap-4">
              <PulseSkeleton className="h-28" />
              <PulseSkeleton className="h-28" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <BookCard label="Aided" color="teal"
                receipts={activeStats.aidedReceipts} payments={activeStats.aidedPayments} count={activeStats.aidedCount} />
              <BookCard label="Un-Aided" color="orange"
                receipts={activeStats.unAidedReceipts} payments={activeStats.unAidedPayments} count={activeStats.unAidedCount} />
            </div>
          )}

          {/* ── FY History table ────────────────────────────────────────────── */}
          {otherFYs.length > 0 && (
            <Card title="Financial Year History">
              {hL ? (
                <div className="flex flex-col gap-2 p-4">
                  {otherFYs.map(fy => <PulseSkeleton key={fy} className="h-12" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <th className="py-3 pl-6 pr-3 text-left text-sm font-bold text-slate-500" rowSpan={2}>
                          Financial Year
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-teal-600 border-l border-slate-100" colSpan={2}>
                          Aided
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-orange-500 border-l border-slate-100" colSpan={2}>
                          Un-Aided
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-slate-500 border-l border-slate-100" colSpan={3}>
                          Combined
                        </th>
                        <th className="pl-3 pr-6 py-2.5 text-center text-xs font-bold text-slate-400 border-l border-slate-100" rowSpan={2}>
                          Entries
                        </th>
                      </tr>
                      <tr className="border-b border-slate-200 bg-slate-50/60">
                        <th className="px-3 pb-3 pt-1 text-right text-xs font-semibold text-emerald-600 border-l border-slate-100">Receipts</th>
                        <th className="px-3 pb-3 pt-1 text-right text-xs font-semibold text-rose-500">Payments</th>
                        <th className="px-3 pb-3 pt-1 text-right text-xs font-semibold text-emerald-600 border-l border-slate-100">Receipts</th>
                        <th className="px-3 pb-3 pt-1 text-right text-xs font-semibold text-rose-500">Payments</th>
                        <th className="px-3 pb-3 pt-1 text-right text-xs font-semibold text-emerald-700 border-l border-slate-100">Receipts</th>
                        <th className="px-3 pb-3 pt-1 text-right text-xs font-semibold text-rose-600">Payments</th>
                        <th className="px-3 pb-3 pt-1 text-right text-xs font-semibold text-blue-600">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {otherFYs.map((fy, i) => {
                        const s   = histStats.get(fy);
                        const bal = (s?.totalReceipts ?? 0) - (s?.totalPayments ?? 0);
                        const fmt = (v: number | undefined) =>
                          v !== undefined ? formatCurrency(v) : <span className="text-slate-300">—</span>;
                        return (
                          <tr key={fy} className={`border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/80 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                            <td className="py-4 pl-6 pr-3">
                              <span className="text-sm font-bold text-slate-700">{fy}</span>
                            </td>
                            <td className="px-3 py-4 text-right text-sm text-emerald-700 whitespace-nowrap border-l border-slate-100">{fmt(s?.aidedReceipts)}</td>
                            <td className="px-3 py-4 text-right text-sm text-rose-600   whitespace-nowrap">{fmt(s?.aidedPayments)}</td>
                            <td className="px-3 py-4 text-right text-sm text-emerald-700 whitespace-nowrap border-l border-slate-100">{fmt(s?.unAidedReceipts)}</td>
                            <td className="px-3 py-4 text-right text-sm text-rose-600   whitespace-nowrap">{fmt(s?.unAidedPayments)}</td>
                            <td className="px-3 py-4 text-right text-sm font-semibold text-emerald-700 whitespace-nowrap border-l border-slate-100">{fmt(s?.totalReceipts)}</td>
                            <td className="px-3 py-4 text-right text-sm font-semibold text-rose-600   whitespace-nowrap">{fmt(s?.totalPayments)}</td>
                            <td className={`px-3 py-4 text-right text-sm font-bold whitespace-nowrap ${bal >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                              {s ? (
                                <span className="flex items-center justify-end gap-1.5">
                                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${bal >= 0 ? 'bg-blue-400' : 'bg-amber-400'}`} />
                                  {formatCurrency(Math.abs(bal))}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="pl-3 pr-6 py-4 text-right text-sm text-slate-500 whitespace-nowrap border-l border-slate-100">
                              {s ? s.entryCount.toLocaleString('en-IN') : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* ── Ledger ticker ────────────────────────────────────────────────── */}
          {tickerItems.length > 0 && (
            <Card title="Ledger Activity" aside={<span className="text-[10px] italic text-slate-400">hover to pause</span>}>
              <LedgerTicker items={tickerItems} />
            </Card>
          )}
        </div>
      </div>

      {/* Split view modal */}
      {modalLedger && (
        <LedgerSplitModal head={modalLedger.head} fy={modalLedger.fy} onClose={() => setModalLedger(null)} />
      )}
    </div>
  );
}
