import { useMemo, useState } from 'react';
import { useEntries } from '@/hooks/useEntries';
import { useSettings } from '@/context/SettingsContext';
import { EntryDetailModal } from '@/components/entries/EntryDetailModal';
import { EntrySkeleton } from '@/components/entries/EntrySkeleton';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { exportLedgerPDF, exportLedgerExcel } from '@/utils/exportEntries';
import type { Entry } from '@smp-cashbook/shared';

// Sticky offsets:
//  - list view:   search bar ≈ 54px  → column headers at top-[54px]
//  - detail view: back bar  ≈ 54px  → panel headers  at top-[54px]
const STICKY_OFFSET = 'top-[54px]';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LedgerSummary { head: string; total: number; count: number }

// ── Ledger card ───────────────────────────────────────────────────────────────

function LedgerCard({
  head, total, count, type,
  compareMode, selectedForCompare,
  onClick,
}: {
  head: string; total: number; count: number;
  type: 'Receipt' | 'Payment';
  compareMode: boolean; selectedForCompare: boolean;
  onClick: () => void;
}) {
  const isReceipt = type === 'Receipt';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
        ${selectedForCompare
          ? isReceipt ? 'bg-green-50' : 'bg-red-50'
          : isReceipt ? 'bg-white hover:bg-green-50/50' : 'bg-white hover:bg-red-50/50'}`}
      style={{ minHeight: '60px' }}
    >
      {/* Checkbox — only in compare mode */}
      {compareMode && (
        <div className={`shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center transition-colors
          ${selectedForCompare
            ? isReceipt ? 'bg-green-500 border-green-500' : 'bg-red-500 border-red-500'
            : 'border-slate-300 bg-white'}`}
        >
          {selectedForCompare && (
            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )}

      <div className="flex flex-1 items-center justify-between min-w-0">
        <div className="flex flex-col gap-0.5 min-w-0 mr-3">
          <span className={`text-sm font-medium truncate
            ${selectedForCompare
              ? isReceipt ? 'text-green-800' : 'text-red-800'
              : 'text-slate-700'}`}
          >
            {head}
          </span>
          <span className="text-xs text-slate-400">
            {count} {count === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <span className={`text-sm font-bold shrink-0
          ${isReceipt ? 'text-green-600' : 'text-red-600'}`}
        >
          {formatCurrency(total)}
        </span>
      </div>
    </button>
  );
}

// ── Ledger list column ────────────────────────────────────────────────────────

function LedgerColumn({
  ledgers, type, compareMode, compareSelection, onSelect,
}: {
  ledgers: LedgerSummary[];
  type: 'Receipt' | 'Payment';
  compareMode: boolean;
  compareSelection: Set<string>;
  onSelect: (head: string) => void;
}) {
  const isReceipt = type === 'Receipt';
  const grandTotal = ledgers.reduce((s, l) => s + l.total, 0);

  return (
    <div className="flex flex-col">
      {/* Sticky column header */}
      <div className={`sticky top-0 z-10 flex items-center justify-between
        rounded-t-lg border-x border-t border-b px-3 py-1.5
        ${isReceipt ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
      >
        <span className={`text-xs font-semibold uppercase tracking-wide
          ${isReceipt ? 'text-green-700' : 'text-red-700'}`}
        >
          {type} Heads
        </span>
        <span className={`text-xs font-bold ${isReceipt ? 'text-green-700' : 'text-red-700'}`}>
          {formatCurrency(grandTotal)}
        </span>
      </div>

      {/* Cards */}
      <div className={`rounded-b-lg border-x border-b overflow-hidden
        ${isReceipt ? 'border-green-200' : 'border-red-200'}`}
      >
        {ledgers.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No {type.toLowerCase()} entries
          </div>
        ) : (
          <div className={`divide-y ${isReceipt ? 'divide-green-100' : 'divide-red-100'}`}>
            {ledgers.map(({ head, total, count }) => (
              <LedgerCard
                key={head}
                head={head} total={total} count={count} type={type}
                compareMode={compareMode}
                selectedForCompare={compareSelection.has(head)}
                onClick={() => onSelect(head)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ledger row — compact row + optional full-width notes sub-row ──────────────

function LedgerRow({ entry }: { entry: Entry }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const hasNotes = Boolean(entry.notes);

  return (
    <>
      <tr
        onClick={() => setDetailOpen(true)}
        className={`hover:bg-slate-50 cursor-pointer transition-colors
          ${hasNotes ? '' : 'border-b border-slate-100'}`}
      >
        <td className="py-2 pl-4 pr-2 text-xs text-slate-500 whitespace-nowrap">
          {formatDate(entry.date)}
        </td>
        <td className="px-2 py-2 text-xs text-slate-800 whitespace-nowrap overflow-hidden max-w-0">
          <span className="block truncate">{entry.headOfAccount}</span>
        </td>
        <td className="px-2 py-2 text-xs text-slate-400 whitespace-nowrap">
          {entry.chequeNo || '—'}
        </td>
        <td className="pl-2 pr-4 py-2 text-xs font-semibold text-right whitespace-nowrap">
          <span className={entry.type === 'Receipt' ? 'text-green-700' : 'text-red-700'}>
            {formatCurrency(entry.amount)}
          </span>
        </td>
      </tr>

      {hasNotes && (
        <tr
          onClick={() => setDetailOpen(true)}
          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
        >
          <td colSpan={4} className="pb-2 pt-0 pl-4 pr-4 overflow-hidden">
            <div
              className="truncate text-xs text-amber-700 italic"
              title={entry.notes}
            >
              {entry.notes}
            </div>
          </td>
        </tr>
      )}

      {detailOpen && (
        <EntryDetailModal entry={entry} onClose={() => setDetailOpen(false)} />
      )}
    </>
  );
}

// ── Transaction panel ─────────────────────────────────────────────────────────

function LedgerTransactionPanel({
  entries, type, sticky = false,
}: {
  entries: Entry[];
  type: 'Receipt' | 'Payment';
  sticky?: boolean;
}) {
  const isReceipt = type === 'Receipt';
  const color = isReceipt ? 'green' : 'red';

  return (
    <div className="flex flex-col">
      <div className={`flex items-center rounded-t-lg border-x border-t border-b px-3 py-1.5
        ${sticky ? `sticky ${STICKY_OFFSET} z-10` : ''}
        ${isReceipt ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
      >
        <span className={`text-xs font-semibold uppercase tracking-wide text-${color}-700`}>
          {type}s
        </span>
      </div>

      <div className={`border-x ${isReceipt ? 'border-green-200' : 'border-red-200'}`}>
        {entries.length > 0 ? (
          <table className="w-full text-left text-sm table-fixed">
            <colgroup>
              <col className="w-[76px]" />  {/* Date */}
              <col />                        {/* Head of Account — flexible */}
              <col className="w-[82px]" />  {/* Cheque No */}
              <col className="w-[110px]" /> {/* Amount */}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="py-2 pl-4 pr-2 text-[11px] font-medium text-slate-500 whitespace-nowrap">Date</th>
                <th className="px-2 py-2 text-[11px] font-medium text-slate-500 whitespace-nowrap">Head of Account</th>
                <th className="px-2 py-2 text-[11px] font-medium text-slate-500 whitespace-nowrap">Cheque No</th>
                <th className="pl-2 pr-4 py-2 text-[11px] font-medium text-slate-500 text-right whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => <LedgerRow key={e.id} entry={e} />)}
            </tbody>
          </table>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            No {type.toLowerCase()} entries for this head
          </div>
        )}
      </div>
    </div>
  );
}

// ── Totals cell (shared) ──────────────────────────────────────────────────────

function TotalsCell({ entries, type }: { entries: Entry[]; type: 'Receipt' | 'Payment' }) {
  const isReceipt = type === 'Receipt';
  const total = entries.reduce((s, e) => s + e.amount, 0);
  return (
    <div className={`rounded-b-lg border-x border-b overflow-hidden
      ${isReceipt ? 'border-green-200' : 'border-red-200'}`}
    >
      <div className="border-t-2 border-slate-200 bg-slate-50 flex items-center justify-between px-3 py-1.5">
        <span className="text-xs font-medium text-slate-500">
          Total ({entries.length} {entries.length === 1 ? 'entry' : 'entries'})
        </span>
        <span className={`text-xs font-bold ${isReceipt ? 'text-green-700' : 'text-red-700'}`}>
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

// ── Shared sticky back bar ────────────────────────────────────────────────────

function BackBar({ label, onBack, actions }: { label: string; onBack: () => void; actions?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-50 border-b border-slate-200 mb-4 flex items-center gap-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white
          px-2.5 py-1.5 text-xs font-medium text-slate-600
          hover:border-blue-300 hover:text-blue-600 transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Ledgers
      </button>
      <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{label}</span>
      {actions}
    </div>
  );
}

// ── Ledger detail view ────────────────────────────────────────────────────────

function LedgerDetail({
  head, receipts, payments, onBack,
}: {
  head: string; receipts: Entry[]; payments: Entry[]; onBack: () => void;
}) {
  const { settings } = useSettings();
  const { activeFinancialYear: fy, activeCashBookType: cbt } = settings;

  const exportActions = (
    <>
      <button
        type="button"
        onClick={() => exportLedgerPDF(head, receipts, payments, fy, cbt)}
        title="Export as PDF"
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
          px-2.5 py-1.5 text-xs font-medium text-slate-600
          hover:border-red-300 hover:text-red-600 transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        PDF
      </button>
      <button
        type="button"
        onClick={() => exportLedgerExcel(head, receipts, payments, fy, cbt)}
        title="Export as Excel"
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
          px-2.5 py-1.5 text-xs font-medium text-slate-600
          hover:border-green-300 hover:text-green-600 transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
        </svg>
        Excel
      </button>
    </>
  );

  return (
    <div className="flex flex-col animate-fade-in">
      <BackBar label={head} onBack={onBack} actions={exportActions} />
      <div className="grid grid-cols-2 gap-x-4">
        <LedgerTransactionPanel entries={receipts} type="Receipt" sticky />
        <LedgerTransactionPanel entries={payments} type="Payment" sticky />
        <TotalsCell entries={receipts} type="Receipt" />
        <TotalsCell entries={payments} type="Payment" />
      </div>
    </div>
  );
}

// ── Compare section (one per selected head) ───────────────────────────────────

function CompareSection({
  head, receipts, payments,
}: {
  head: string; receipts: Entry[]; payments: Entry[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 px-1">
        <div className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
        <span className="text-xs font-semibold text-slate-600">{head}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        <LedgerTransactionPanel entries={receipts} type="Receipt" sticky={false} />
        <LedgerTransactionPanel entries={payments} type="Payment" sticky={false} />
        <TotalsCell entries={receipts} type="Receipt" />
        <TotalsCell entries={payments} type="Payment" />
      </div>
    </div>
  );
}

// ── Paired section: one receipt-only head alongside one payment-only head ──────

function ComparePairedSection({
  receiptHead, receiptEntries,
  paymentHead, paymentEntries,
}: {
  receiptHead: string; receiptEntries: Entry[];
  paymentHead: string; paymentEntries: Entry[];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4">
      {/* Left: receipt ledger label + panel + total */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-600">{receiptHead}</span>
        </div>
        <LedgerTransactionPanel entries={receiptEntries} type="Receipt" sticky={false} />
        <TotalsCell entries={receiptEntries} type="Receipt" />
      </div>

      {/* Right: payment ledger label + panel + total */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-1">
          <div className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-600">{paymentHead}</span>
        </div>
        <LedgerTransactionPanel entries={paymentEntries} type="Payment" sticky={false} />
        <TotalsCell entries={paymentEntries} type="Payment" />
      </div>
    </div>
  );
}

// ── Compare view ──────────────────────────────────────────────────────────────

function LedgerCompare({
  heads, entries, onBack,
}: {
  heads: string[]; entries: Entry[]; onBack: () => void;
}) {
  const label = `Comparing ${heads.length} ledger${heads.length > 1 ? 's' : ''}`;

  // Categorise each selected head
  const headData = heads.map((head) => ({
    head,
    receipts: entries.filter((e) => e.type === 'Receipt' && e.headOfAccount === head),
    payments: entries.filter((e) => e.type === 'Payment' && e.headOfAccount === head),
  }));

  const receiptOnly = headData.filter((h) => h.receipts.length > 0 && h.payments.length === 0);
  const paymentOnly = headData.filter((h) => h.payments.length > 0 && h.receipts.length === 0);
  const mixed       = headData.filter((h) => h.receipts.length > 0 && h.payments.length > 0);
  const empty       = headData.filter((h) => h.receipts.length === 0 && h.payments.length === 0);

  // Pair receipt-only heads with payment-only heads (1-to-1, FIFO)
  const pairedCount = Math.min(receiptOnly.length, paymentOnly.length);
  const pairs        = Array.from({ length: pairedCount }, (_, i) => ({ r: receiptOnly[i], p: paymentOnly[i] }));
  const unpairedR    = receiptOnly.slice(pairedCount);
  const unpairedP    = paymentOnly.slice(pairedCount);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <BackBar label={label} onBack={onBack} />

      {/* Grand totals summary bar */}
      {heads.length > 1 && (() => {
        const selEntries = entries.filter((e) => heads.includes(e.headOfAccount));
        const totalR = selEntries.filter((e) => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
        const totalP = selEntries.filter((e) => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
        return (
          <div className="grid grid-cols-2 gap-x-4 -mt-2">
            <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50/60 px-3 py-2">
              <span className="text-xs text-green-700 font-medium">Combined Receipts</span>
              <span className="text-sm font-bold text-green-700">{formatCurrency(totalR)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/60 px-3 py-2">
              <span className="text-xs text-red-700 font-medium">Combined Payments</span>
              <span className="text-sm font-bold text-red-700">{formatCurrency(totalP)}</span>
            </div>
          </div>
        );
      })()}

      {/* Paired: one receipt-only + one payment-only side by side */}
      {pairs.map(({ r, p }) => (
        <ComparePairedSection
          key={`${r.head}+${p.head}`}
          receiptHead={r.head} receiptEntries={r.receipts}
          paymentHead={p.head} paymentEntries={p.payments}
        />
      ))}

      {/* Unpaired receipt-only heads (no counterpart payment-only to pair with) */}
      {unpairedR.map(({ head, receipts, payments }) => (
        <CompareSection key={head} head={head} receipts={receipts} payments={payments} />
      ))}

      {/* Unpaired payment-only heads */}
      {unpairedP.map(({ head, receipts, payments }) => (
        <CompareSection key={head} head={head} receipts={receipts} payments={payments} />
      ))}

      {/* Mixed heads (have both receipts and payments) */}
      {mixed.map(({ head, receipts, payments }) => (
        <CompareSection key={head} head={head} receipts={receipts} payments={payments} />
      ))}

      {/* Heads with no entries at all */}
      {empty.map(({ head, receipts, payments }) => (
        <CompareSection key={head} head={head} receipts={receipts} payments={payments} />
      ))}
    </div>
  );
}

// ── LedgersPage ───────────────────────────────────────────────────────────────

export function LedgersPage() {
  const { settings } = useSettings();
  const { entries, loading } = useEntries(
    settings.activeFinancialYear,
    settings.activeCashBookType
  );

  // View state
  const [detailHead, setDetailHead]     = useState<string | null>(null);
  const [inCompareView, setInCompareView] = useState(false);

  // List controls
  const [searchQuery, setSearchQuery]       = useState('');
  const [compareMode, setCompareMode]       = useState(false);
  const [compareSelection, setCompareSelection] = useState<Set<string>>(new Set());

  // Build ledger summaries
  const { receiptLedgers, paymentLedgers } = useMemo(() => {
    const rMap = new Map<string, { total: number; count: number }>();
    const pMap = new Map<string, { total: number; count: number }>();
    for (const entry of entries) {
      const map = entry.type === 'Receipt' ? rMap : pMap;
      const ex = map.get(entry.headOfAccount);
      if (ex) { ex.total += entry.amount; ex.count += 1; }
      else map.set(entry.headOfAccount, { total: entry.amount, count: 1 });
    }
    const sort = (m: Map<string, { total: number; count: number }>) =>
      Array.from(m.entries()).map(([head, d]) => ({ head, ...d }))
        .sort((a, b) => a.head.localeCompare(b.head));
    return { receiptLedgers: sort(rMap), paymentLedgers: sort(pMap) };
  }, [entries]);

  // Filter by search
  const q = searchQuery.toLowerCase().trim();
  const filteredReceipt = useMemo(
    () => q ? receiptLedgers.filter((l) => l.head.toLowerCase().includes(q)) : receiptLedgers,
    [receiptLedgers, q]
  );
  const filteredPayment = useMemo(
    () => q ? paymentLedgers.filter((l) => l.head.toLowerCase().includes(q)) : paymentLedgers,
    [paymentLedgers, q]
  );

  // Filtered transactions for detail
  const detailReceipts = useMemo(
    () => detailHead ? entries.filter((e) => e.type === 'Receipt' && e.headOfAccount === detailHead) : [],
    [entries, detailHead]
  );
  const detailPayments = useMemo(
    () => detailHead ? entries.filter((e) => e.type === 'Payment' && e.headOfAccount === detailHead) : [],
    [entries, detailHead]
  );

  // Handlers
  const handleCardClick = (head: string) => {
    if (compareMode) {
      setCompareSelection((prev) => {
        const next = new Set(prev);
        if (next.has(head)) next.delete(head); else next.add(head);
        return next;
      });
    } else {
      setDetailHead(head);
    }
  };

  const handleToggleCompare = () => {
    setCompareMode((v) => !v);
    if (compareMode) setCompareSelection(new Set());
  };

  const handleViewCompare = () => setInCompareView(true);

  const handleBackFromDetail = () => setDetailHead(null);

  const handleBackFromCompare = () => {
    setInCompareView(false);
    setCompareMode(false);
    setCompareSelection(new Set());
  };

  if (loading) {
    return (
      <div className="w-full animate-fade-in pb-6">
        <div className="rounded-lg border border-slate-200 p-3"><EntrySkeleton /></div>
      </div>
    );
  }

  // ── Detail view ──
  if (detailHead) {
    return (
      <div className="w-full pb-6">
        <LedgerDetail
          head={detailHead}
          receipts={detailReceipts}
          payments={detailPayments}
          onBack={handleBackFromDetail}
        />
      </div>
    );
  }

  // ── Compare view ──
  if (inCompareView && compareSelection.size > 0) {
    return (
      <div className="w-full pb-6">
        <LedgerCompare
          heads={Array.from(compareSelection)}
          entries={entries}
          onBack={handleBackFromCompare}
        />
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="w-full pb-6">
      {/* Sticky search + compare action bar */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 mb-4">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative w-48 shrink-0">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search heads…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-7 py-1.5 text-sm
                text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1
                focus:ring-blue-300 focus:border-blue-300 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Clear search button */}
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors"
            >
              Clear
            </button>
          )}

          {/* Compare mode toggle */}
          <button
            onClick={handleToggleCompare}
            title={compareMode ? 'Exit compare mode' : 'Select ledgers to compare'}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors
              ${compareMode
                ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600'}`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Compare{compareMode && compareSelection.size > 0 ? ` (${compareSelection.size})` : ''}
          </button>

          {/* View comparison CTA */}
          {compareMode && compareSelection.size >= 1 && (
            <button
              onClick={handleViewCompare}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-blue-300
                bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white
                hover:bg-blue-700 transition-colors"
            >
              View Comparison
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Ledger columns — grid ensures column headers at top-[54px] align */}
      <div className="animate-fade-in grid grid-cols-2 gap-x-4">
        <LedgerColumn
          ledgers={filteredReceipt}
          type="Receipt"
          compareMode={compareMode}
          compareSelection={compareSelection}
          onSelect={handleCardClick}
        />
        <LedgerColumn
          ledgers={filteredPayment}
          type="Payment"
          compareMode={compareMode}
          compareSelection={compareSelection}
          onSelect={handleCardClick}
        />
      </div>
    </div>
  );
}
