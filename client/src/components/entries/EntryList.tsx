import { memo, useMemo, useState } from 'react';
import { EntryRow } from './EntryRow';
import { EntrySkeleton } from './EntrySkeleton';
import { EntryFilters, type FilterState } from './EntryFilters';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import type { Entry } from '@smp-cashbook/shared';

interface EntryListProps {
  entries: Entry[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

const INIT_FILTERS: FilterState = {
  search: '',
  typeFilter: 'All',
  dateFrom: '',
  dateTo: '',
  headOfAccount: '',
};

// Sticky top offset = filter bar height (py-3 + ~30px content ≈ 54px)
const THEAD_TOP = 'top-[54px]';

// ── View mode ────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'split' | 'date';
const VIEWS: ViewMode[] = ['list', 'split', 'date'];

const VIEW_META: Record<ViewMode, { label: string; title: string; icon: React.ReactNode }> = {
  list: {
    label: 'List',
    title: 'List view — all entries in one table',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  split: {
    label: 'Split',
    title: 'Split view — Receipts | Payments side by side',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 3H4a1 1 0 00-1 1v16a1 1 0 001 1h5V3zm6 0h5a1 1 0 011 1v16a1 1 0 01-1 1h-5V3zm0 0v18M9 3v18" />
      </svg>
    ),
  },
  date: {
    label: 'By Date',
    title: 'Date view — entries grouped by date',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
};

// ── Shared table shell ────────────────────────────────────────────────────────

/** Colgroup + thead for the compact (no type badge) split/date panels */
function CompactTableHead({ sticky }: { sticky?: boolean }) {
  return (
    <>
      <colgroup>
        <col className="w-[90px]" />
        <col />
        <col className="w-[100px]" />
        <col className="w-[120px]" />
      </colgroup>
      <thead className={sticky ? `sticky ${THEAD_TOP} z-10` : undefined}>
        <tr className="border-b border-slate-100 bg-white">
          <th className="py-2 pl-4 pr-2 text-xs font-medium text-slate-500 whitespace-nowrap">Date</th>
          <th className="px-2 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Head of Account</th>
          <th className="px-2 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Cheque No</th>
          <th className="pl-2 pr-4 py-2 text-xs font-medium text-slate-500 text-right whitespace-nowrap">Amount</th>
        </tr>
      </thead>
    </>
  );
}

// ── View 1: List ─────────────────────────────────────────────────────────────

const ListView = memo(function ListView({
  entries,
  loading,
}: {
  entries: Entry[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 p-3">
        <EntrySkeleton />
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 py-16 text-center text-sm text-slate-400">
        No entries match the current filters.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 overflow-clip">
      <table className="w-full text-left text-sm table-fixed">
        <colgroup>
          <col className="w-[90px]" />
          <col className="w-[76px]" />
          <col className="w-[200px]" />
          <col className="w-[100px]" />
          <col />
          <col className="w-[120px]" />
        </colgroup>
        <thead className={`sticky ${THEAD_TOP} z-10`}>
          <tr className="border-b border-slate-100 bg-white">
            <th className="py-2 pl-4 pr-2 text-xs font-medium text-slate-500 whitespace-nowrap">Date</th>
            <th className="px-2 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Type</th>
            <th className="px-2 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Head of Account</th>
            <th className="px-2 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Cheque No</th>
            <th className="px-2 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Notes</th>
            <th className="pl-2 pr-4 py-2 text-xs font-medium text-slate-500 text-right whitespace-nowrap">Amount</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} compact={false} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-100 bg-slate-50">
            <td colSpan={5} className="py-2 pl-4 pr-2 text-xs font-medium text-slate-500 whitespace-nowrap">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </td>
            <td className="pl-2 pr-4 py-2 text-sm font-bold text-right whitespace-nowrap text-slate-700">
              {formatCurrency(entries.reduce((s, e) => s + (e.type === 'Receipt' ? e.amount : -e.amount), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
});

// ── View 2: Split ─────────────────────────────────────────────────────────────

const SplitTable = memo(function SplitTable({
  entries,
  type,
  loading,
}: {
  entries: Entry[];
  type: 'Receipt' | 'Payment';
  loading: boolean;
}) {
  const isReceipt = type === 'Receipt';
  const total = useMemo(() => entries.reduce((s, e) => s + e.amount, 0), [entries]);
  const color = isReceipt ? 'green' : 'red';

  return (
    <div className="flex flex-col min-w-0 flex-1">
      <div className={`flex items-center justify-between rounded-t-lg border-x border-t px-4 py-2.5
        ${isReceipt ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
      >
        <span className={`text-xs font-semibold uppercase tracking-wide text-${color}-700`}>
          {type}s
        </span>
        <span className={`text-sm font-bold text-${color}-700`}>
          {formatCurrency(total)}
        </span>
      </div>

      {loading ? (
        <div className="rounded-b-lg border border-slate-200 p-3">
          <EntrySkeleton />
        </div>
      ) : entries.length === 0 ? (
        <div className={`flex-1 rounded-b-lg border-x border-b py-10 text-center text-sm
          ${isReceipt ? 'border-green-200' : 'border-red-200'} text-slate-400`}
        >
          No {type.toLowerCase()} entries
        </div>
      ) : (
        <div className={`flex-1 rounded-b-lg border-x border-b
          ${isReceipt ? 'border-green-200' : 'border-red-200'}`}
        >
          <table className="w-full text-left text-sm table-fixed">
            <CompactTableHead sticky />
            <tbody>
              {entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} compact />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-100 bg-slate-50">
                <td colSpan={2} className="py-2 pl-4 pr-2 text-xs font-medium text-slate-500 whitespace-nowrap">
                  Total ({entries.length} {entries.length === 1 ? 'entry' : 'entries'})
                </td>
                <td />
                <td className={`pl-2 pr-4 py-2 text-sm font-bold text-right whitespace-nowrap text-${color}-700`}>
                  {formatCurrency(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
});

// ── View 3: By Date ───────────────────────────────────────────────────────────

/** One type-panel within a single date group (transactions only, no totals) */
function DateGroupPanel({
  entries,
  type,
}: {
  entries: Entry[];
  type: 'Receipt' | 'Payment';
}) {
  const isReceipt = type === 'Receipt';
  const color = isReceipt ? 'green' : 'red';

  return (
    <div className="flex flex-col min-w-0">
      {/* Coloured mini-header */}
      <div className={`flex items-center rounded-t-lg border-x border-t px-3 py-1.5
        ${isReceipt ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
      >
        <span className={`text-xs font-semibold uppercase tracking-wide text-${color}-700`}>
          {type}s
        </span>
      </div>

      {/* Transaction rows — no bottom border/rounding (totals bar provides those) */}
      <div className={`flex-1 border-x ${isReceipt ? 'border-green-200' : 'border-red-200'}`}>
        {entries.length > 0 ? (
          <table className="w-full text-left text-sm table-fixed">
            <CompactTableHead />
            <tbody>
              {entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} compact />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            No {type.toLowerCase()} entries
          </div>
        )}
      </div>
    </div>
  );
}

const DateGroupedView = memo(function DateGroupedView({
  entries,
  loading,
}: {
  entries: Entry[];
  loading: boolean;
}) {
  // Group entries by date, preserving Firestore's date-asc order
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      const list = map.get(entry.date);
      if (list) list.push(entry);
      else map.set(entry.date, [entry]);
    }
    return Array.from(map.entries());
  }, [entries]);

  // Compute opening & closing balance for each date group (running total)
  const groupsWithBalance = useMemo(() => {
    let running = 0;
    return groups.map(([date, dateEntries]) => {
      const openingBalance = running;
      const dayR = dateEntries.filter((e) => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
      const dayP = dateEntries.filter((e) => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
      const closingBalance = openingBalance + dayR - dayP;
      running = closingBalance;
      return { date, dateEntries, openingBalance, closingBalance };
    });
  }, [groups]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 p-3">
        <EntrySkeleton />
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 py-16 text-center text-sm text-slate-400">
        No entries match the current filters.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groupsWithBalance.map(({ date, dateEntries, openingBalance, closingBalance }) => {
        const receipts = dateEntries.filter((e) => e.type === 'Receipt');
        const payments = dateEntries.filter((e) => e.type === 'Payment');
        const dayR = receipts.reduce((s, e) => s + e.amount, 0);
        const dayP = payments.reduce((s, e) => s + e.amount, 0);
        const receiptGrandTotal = openingBalance + dayR;
        const paymentGrandTotal = dayP + closingBalance;

        return (
          /* CSS grid: one column-width calculation shared by all rows —
             the date bar is guaranteed to be pixel-perfect the same width
             as the receipt panel and receipt totals below it. */
          <div key={date} className="grid grid-cols-2 gap-x-4">

            {/* Row 1: date + opening balance bar | empty spacer */}
            <div className={`mb-2 flex items-center justify-between rounded-lg border px-3 py-1.5
              ${openingBalance > 0
                ? 'border-blue-100 bg-blue-50/60'
                : 'border-slate-200 bg-slate-50'}`}
            >
              <span className={`text-xs font-semibold ${openingBalance > 0 ? 'text-slate-700' : 'text-slate-600'}`}>
                {formatDate(date)}
              </span>
              {openingBalance !== 0 && (
                <span className="text-xs font-bold text-blue-600">
                  By Opening Bal &nbsp;
                  {formatCurrency(Math.abs(openingBalance))}{openingBalance < 0 ? ' (Dr)' : ''}
                </span>
              )}
            </div>
            <div className="mb-2" />

            {/* Row 2: receipt panel | payment panel */}
            <DateGroupPanel entries={receipts} type="Receipt" />
            <DateGroupPanel entries={payments} type="Payment" />

            {/* Row 3: receipt totals | payment totals — flush with panels above */}
            <div className="rounded-b-lg border-x border-b border-green-200 overflow-hidden">
              <div className="border-t-2 border-slate-200 bg-slate-50 flex items-center justify-between px-3 py-1.5">
                <span className="text-xs font-medium text-slate-500">
                  Total ({receipts.length} {receipts.length === 1 ? 'entry' : 'entries'})
                </span>
                <span className="text-xs font-bold text-green-700">
                  {formatCurrency(receiptGrandTotal)}
                </span>
              </div>
            </div>

            <div className="rounded-b-lg border-x border-b border-red-200 overflow-hidden">
              <div className="border-t-2 border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-xs font-medium text-slate-500">
                    Total ({payments.length} {payments.length === 1 ? 'entry' : 'entries'})
                  </span>
                  <span className="text-xs font-bold text-red-700">
                    {formatCurrency(dayP)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-xs font-semibold text-slate-600">Closing Balance</span>
                  <span className="text-xs font-bold text-orange-600">
                    {formatCurrency(Math.abs(closingBalance))}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-200">
                  <span />
                  <span className="text-xs font-bold text-red-700">
                    {formatCurrency(paymentGrandTotal)}
                  </span>
                </div>
              </div>
            </div>

          </div>
        );
      })}
    </div>
  );
});

// ── EntryList ─────────────────────────────────────────────────────────────────

export function EntryList({ entries, loading, refreshing, error }: EntryListProps) {
  const [filters, setFilters] = useState<FilterState>(INIT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  const cycleView = () =>
    setViewMode((v) => VIEWS[(VIEWS.indexOf(v) + 1) % VIEWS.length]);

  const nextView = VIEWS[(VIEWS.indexOf(viewMode) + 1) % VIEWS.length];

  const headOfAccountOptions = useMemo(() => {
    const set = new Set(entries.map((e) => e.headOfAccount).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filtered = useMemo(() => {
    let result = entries;
    if (filters.headOfAccount)
      result = result.filter((e) => e.headOfAccount === filters.headOfAccount);
    if (filters.dateFrom)
      result = result.filter((e) => e.date >= filters.dateFrom);
    if (filters.dateTo)
      result = result.filter((e) => e.date <= filters.dateTo);
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.headOfAccount.toLowerCase().includes(q) ||
          e.chequeNo.toLowerCase().includes(q) ||
          e.notes.toLowerCase().includes(q) ||
          e.date.includes(q) ||
          `${e.date.split('-')[2]}/${e.date.split('-')[1]}/${e.date.split('-')[0]}`.includes(q)
      );
    }
    return result;
  }, [entries, filters]);

  const receipts    = useMemo(() => filtered.filter((e) => e.type === 'Receipt'), [filtered]);
  const payments    = useMemo(() => filtered.filter((e) => e.type === 'Payment'), [filtered]);
  const totalR      = useMemo(() => receipts.reduce((s, e) => s + e.amount, 0), [receipts]);
  const totalP      = useMemo(() => payments.reduce((s, e) => s + e.amount, 0), [payments]);
  const netBalance  = totalR - totalP;

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load entries: {error}
      </div>
    );
  }

  const meta = VIEW_META[viewMode];

  return (
    <div className="flex flex-col gap-4">

      {/* ── Sticky filter bar ── */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
        {refreshing && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
            <div className="h-full animate-progress bg-blue-400" />
          </div>
        )}
        <div className="flex items-center gap-3">
          {/* Filters — take remaining space */}
          <div className="flex-1 min-w-0">
            <EntryFilters
              filters={filters}
              onChange={setFilters}
              headOfAccountOptions={headOfAccountOptions}
            />
          </div>

          {/* View toggle button */}
          <button
            type="button"
            onClick={cycleView}
            title={`Switch to ${VIEW_META[nextView].title}`}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
              px-2.5 py-2 text-xs font-medium text-slate-600
              hover:border-blue-300 hover:text-blue-600 transition-colors"
          >
            {meta.icon}
            <span>{meta.label}</span>
          </button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <span className="text-xs text-green-600">Total Receipts</span>
          <span className="text-sm font-semibold text-green-700">{formatCurrency(totalR)}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <span className="text-xs text-red-600">Total Payments</span>
          <span className="text-sm font-semibold text-red-700">{formatCurrency(totalP)}</span>
        </div>
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
          netBalance >= 0 ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'
        }`}>
          <span className={`text-xs ${netBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
            Net Balance
          </span>
          <span className={`text-sm font-semibold ${netBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            {formatCurrency(Math.abs(netBalance))}{netBalance < 0 && ' (Dr)'}
          </span>
        </div>
      </div>

      {/* ── Content — switches by viewMode ── */}
      {viewMode === 'list' && (
        <ListView entries={filtered} loading={loading} />
      )}
      {viewMode === 'split' && (
        <div className="flex gap-4 items-stretch">
          <SplitTable entries={receipts} type="Receipt" loading={loading} />
          <SplitTable entries={payments} type="Payment" loading={loading} />
        </div>
      )}
      {viewMode === 'date' && (
        <DateGroupedView entries={filtered} loading={loading} />
      )}

    </div>
  );
}
