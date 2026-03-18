import { memo, useMemo, useState, useCallback } from 'react';
import { EntryRow } from './EntryRow';
import { EntrySkeleton } from './EntrySkeleton';
import { EntryFilters, type FilterState } from './EntryFilters';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { apiDeleteEntry } from '@/api/entries';
import { exportListPDF, exportDatePDF, exportListExcel, exportDateExcel } from '@/utils/exportEntries';
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

// ── Bulk-select shared types ───────────────────────────────────────────────────

interface SelectProps {
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

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
function CompactTableHead({ sticky, selectMode }: { sticky?: boolean; selectMode?: boolean }) {
  return (
    <>
      <colgroup>
        {selectMode && <col className="w-[36px]" />}
        <col className="w-[90px]" />
        <col />
        <col className="w-[100px]" />
        <col className="w-[120px]" />
      </colgroup>
      <thead className={sticky ? `sticky ${THEAD_TOP} z-10` : undefined}>
        <tr className="border-b border-slate-100 bg-white">
          {selectMode && <th className="w-[36px]" />}
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
  allEntries,
  selectProps,
  onSelectAll,
}: {
  entries: Entry[];
  loading: boolean;
  allEntries: Entry[];
  selectProps: SelectProps;
  onSelectAll: (ids: string[]) => void;
}) {
  const { selectMode, selectedIds, onToggle } = selectProps;
  const allSelected = entries.length > 0 && entries.every(e => selectedIds.has(e.id));
  const someSelected = !allSelected && entries.some(e => selectedIds.has(e.id));

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
          {selectMode && <col className="w-[36px]" />}
          <col className="w-[90px]" />
          <col className="w-[76px]" />
          <col className="w-[200px]" />
          <col className="w-[100px]" />
          <col />
          <col className="w-[120px]" />
        </colgroup>
        <thead className={`sticky ${THEAD_TOP} z-10`}>
          <tr className="border-b border-slate-100 bg-white">
            {selectMode && (
              <th className="w-[36px] pl-3 pr-1 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={() => onSelectAll(entries.map(e => e.id))}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer
                    focus:ring-1 focus:ring-blue-400"
                  title={allSelected ? 'Deselect all' : 'Select all'}
                />
              </th>
            )}
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
            <EntryRow
              key={entry.id}
              entry={entry}
              compact={false}
              allEntries={allEntries}
              selectMode={selectMode}
              selected={selectedIds.has(entry.id)}
              onToggle={onToggle}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-100 bg-slate-50">
            <td
              colSpan={selectMode ? 6 : 5}
              className="py-2 pl-4 pr-2 text-xs font-medium text-slate-500 whitespace-nowrap"
            >
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
  allEntries = [],
  selectProps,
}: {
  entries: Entry[];
  type: 'Receipt' | 'Payment';
  loading: boolean;
  allEntries?: Entry[];
  selectProps: SelectProps;
}) {
  const { selectMode, selectedIds, onToggle } = selectProps;
  const isReceipt = type === 'Receipt';
  const total = useMemo(() => entries.reduce((s, e) => s + e.amount, 0), [entries]);
  const color = isReceipt ? 'green' : 'red';

  return (
    <div className="flex flex-col min-w-0">
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
        <div className={`border-x py-10 text-center text-sm
          ${isReceipt ? 'border-green-200' : 'border-red-200'} text-slate-400`}
        >
          No {type.toLowerCase()} entries
        </div>
      ) : (
        <div className={`border-x ${isReceipt ? 'border-green-200' : 'border-red-200'}`}>
          <table className="w-full text-left text-sm table-fixed">
            <CompactTableHead sticky selectMode={selectMode} />
            <tbody>
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  compact
                  allEntries={allEntries}
                  selectMode={selectMode}
                  selected={selectedIds.has(entry.id)}
                  onToggle={onToggle}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

function SplitTotalsCell({ entries, type }: { entries: Entry[]; type: 'Receipt' | 'Payment' }) {
  const isReceipt = type === 'Receipt';
  const color = isReceipt ? 'green' : 'red';
  const total = entries.reduce((s, e) => s + e.amount, 0);
  return (
    <div className={`rounded-b-lg border-x border-b overflow-hidden
      ${isReceipt ? 'border-green-200' : 'border-red-200'}`}
    >
      <div className="border-t border-slate-100 bg-slate-50 flex items-center justify-between px-4 py-2">
        <span className="text-xs font-medium text-slate-500">
          Total ({entries.length} {entries.length === 1 ? 'entry' : 'entries'})
        </span>
        <span className={`text-sm font-bold text-${color}-700`}>
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

// ── View 3: By Date ───────────────────────────────────────────────────────────

function DateGroupPanel({
  entries,
  type,
  allEntries = [],
  selectProps,
}: {
  entries: Entry[];
  type: 'Receipt' | 'Payment';
  allEntries?: Entry[];
  selectProps: SelectProps;
}) {
  const { selectMode, selectedIds, onToggle } = selectProps;
  const isReceipt = type === 'Receipt';
  const color = isReceipt ? 'green' : 'red';

  return (
    <div className="flex flex-col min-w-0">
      <div className={`flex items-center rounded-t-lg border-x border-t px-3 py-1.5
        ${isReceipt ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
      >
        <span className={`text-xs font-semibold uppercase tracking-wide text-${color}-700`}>
          {type}s
        </span>
      </div>

      <div className={`flex-1 border-x ${isReceipt ? 'border-green-200' : 'border-red-200'}`}>
        {entries.length > 0 ? (
          <table className="w-full text-left text-sm table-fixed">
            <CompactTableHead selectMode={selectMode} />
            <tbody>
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  compact
                  colorAmount={false}
                  allEntries={allEntries}
                  selectMode={selectMode}
                  selected={selectedIds.has(entry.id)}
                  onToggle={onToggle}
                />
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

// ── Head-of-account sort order within a date group ───────────────────────────

const RECEIPT_HEAD_ORDER: string[] = [
  'Adm Fee', 'Tution Fee', 'Rr Fee', 'Ass Fee', 'Sports Fee',
  'Mag Fee', 'Id Fee', 'Lib Fee', 'Lab Fee', 'Dvp Fee',
  'Swf Fee', 'Twf Fee', 'Nss Fee', 'Fine',
  'Govt Salary Grants', 'I Tax', 'P Tax', 'Lic', 'Gslic', 'Fbf',
];

const PAYMENT_HEAD_ORDER: string[] = [
  'Govt Salary Acct', 'I Tax', 'P Tax', 'Lic', 'Gslic', 'Fbf',
];

function headRank(order: string[], head: string): number {
  const idx = order.findIndex(h => h.toLowerCase() === head.toLowerCase());
  return idx === -1 ? order.length : idx;
}

const DateGroupedView = memo(function DateGroupedView({
  entries,
  loading,
  allEntries,
  selectProps,
}: {
  entries: Entry[];
  loading: boolean;
  allEntries: Entry[];
  selectProps: SelectProps;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      const list = map.get(entry.date);
      if (list) list.push(entry);
      else map.set(entry.date, [entry]);
    }
    return Array.from(map.entries());
  }, [entries]);

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
        const receipts = dateEntries
          .filter((e) => e.type === 'Receipt')
          .sort((a, b) => headRank(RECEIPT_HEAD_ORDER, a.headOfAccount) - headRank(RECEIPT_HEAD_ORDER, b.headOfAccount));
        const payments = dateEntries
          .filter((e) => e.type === 'Payment')
          .sort((a, b) => headRank(PAYMENT_HEAD_ORDER, a.headOfAccount) - headRank(PAYMENT_HEAD_ORDER, b.headOfAccount));
        const dayR = receipts.reduce((s, e) => s + e.amount, 0);
        const dayP = payments.reduce((s, e) => s + e.amount, 0);
        const receiptGrandTotal = openingBalance + dayR;
        const paymentGrandTotal = dayP + closingBalance;

        return (
          <div key={date} className="grid grid-cols-2 gap-x-4">

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

            <DateGroupPanel entries={receipts} type="Receipt" selectProps={selectProps} />
            <DateGroupPanel entries={payments} type="Payment" allEntries={allEntries} selectProps={selectProps} />

            <div className="rounded-b-lg border-x border-b border-green-200 overflow-hidden">
              <div className="border-t-2 border-green-300 bg-slate-50 flex items-center justify-between px-3 py-1.5">
                <span className="text-xs font-medium text-slate-500">
                  Total ({receipts.length} {receipts.length === 1 ? 'entry' : 'entries'})
                </span>
                <span className="text-xs font-bold text-green-700">
                  {formatCurrency(receiptGrandTotal)}
                </span>
              </div>
            </div>

            <div className="rounded-b-lg border-x border-b border-red-200 overflow-hidden">
              <div className="border-t-2 border-red-300 bg-slate-50">
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

// ── Bulk delete confirmation modal ────────────────────────────────────────────

function BulkDeleteModal({
  count,
  onConfirm,
  onCancel,
  deleting,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!deleting ? onCancel : undefined} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
            <svg className="h-4.5 w-4.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Delete {count} {count === 1 ? 'entry' : 'entries'}?
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              This will permanently delete{' '}
              <span className="font-medium text-slate-700">{count} selected {count === 1 ? 'entry' : 'entries'}</span>.
              {' '}This action <span className="font-medium text-red-600">cannot be undone</span>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="h-8 rounded-md border border-slate-200 bg-white px-4 text-xs font-medium
              text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="h-8 rounded-md bg-red-600 px-4 text-xs font-semibold text-white
              hover:bg-red-700 active:bg-red-800 disabled:opacity-60 transition-colors
              flex items-center gap-1.5"
          >
            {deleting && (
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EntryList ─────────────────────────────────────────────────────────────────

export function EntryList({ entries, loading, refreshing, error }: EntryListProps) {
  const [filters, setFilters] = useState<FilterState>(INIT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>('date');
  const { settings } = useSettings();
  const { addToast } = useToast();

  // ── Bulk select state ────────────────────────────────────────────────────
  const [selectMode, setSelectMode]     = useState(false);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleting, setDeleting]         = useState(false);

  const toggleSelectMode = () => {
    setSelectMode(v => !v);
    setSelectedIds(new Set());
  };

  const onToggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /** Called by the List-view select-all checkbox with all visible IDs */
  const onSelectAll = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const toDelete = entries.filter(e => selectedIds.has(e.id));
      await Promise.all(toDelete.map(e => apiDeleteEntry(e.id, e.financialYear, e.cashBookType)));
      addToast(
        `${toDelete.length} ${toDelete.length === 1 ? 'entry' : 'entries'} deleted`,
        'success',
      );
      setSelectedIds(new Set());
      setSelectMode(false);
      setConfirmOpen(false);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete entries', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const selectProps: SelectProps = { selectMode, selectedIds, onToggle };

  // ── Filters & derived state ──────────────────────────────────────────────
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
  const selectedCount = selectedIds.size;
  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selectedIds.has(e.id));

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
          <div className="flex-1 min-w-0">
            <EntryFilters
              filters={filters}
              onChange={setFilters}
              headOfAccountOptions={headOfAccountOptions}
            />
          </div>

          {/* Export buttons — only for list and date views, only when not in select mode */}
          {!selectMode && (viewMode === 'list' || viewMode === 'date') && (() => {
            const exportMeta = {
              financialYear: settings.activeFinancialYear,
              cashBookType:  settings.activeCashBookType,
              filters,
            };
            const onPDF  = () => viewMode === 'list'
              ? exportListPDF(filtered, exportMeta)
              : exportDatePDF(filtered, exportMeta);
            const onXLS  = () => viewMode === 'list'
              ? exportListExcel(filtered, exportMeta)
              : exportDateExcel(filtered, exportMeta);
            return (
              <>
                <button
                  type="button"
                  onClick={onPDF}
                  title="Export as PDF"
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
                    px-2.5 py-2 text-xs font-medium text-slate-600
                    hover:border-red-300 hover:text-red-600 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={onXLS}
                  title="Export as Excel"
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
                    px-2.5 py-2 text-xs font-medium text-slate-600
                    hover:border-green-300 hover:text-green-600 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Excel</span>
                </button>
              </>
            );
          })()}

          {/* Delete button — visible in select mode, before Cancel */}
          {selectMode && (
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setConfirmOpen(true)}
              title="Delete selected entries"
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-red-300 bg-red-50
                px-2.5 py-2 text-xs font-medium text-red-600
                hover:bg-red-100 hover:border-red-400
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Delete {selectedCount > 0 ? `(${selectedCount})` : ''}</span>
            </button>
          )}

          {/* Select / Cancel select button */}
          <button
            type="button"
            onClick={toggleSelectMode}
            title={selectMode ? 'Exit selection mode' : 'Select entries to bulk delete'}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-2
              text-xs font-medium transition-colors
              ${selectMode
                ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600'
              }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span>{selectMode ? 'Cancel' : 'Select'}</span>
          </button>

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

      {/* ── Bulk action bar (visible when select mode is on) ── */}
      {selectMode && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200
          bg-blue-50 px-4 py-2.5">
          <span className="text-xs font-medium text-blue-700">
            {selectedCount === 0
              ? 'Click rows to select'
              : `${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'} selected`}
          </span>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (allFilteredSelected) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(filtered.map(e => e.id)));
                }
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              {allFilteredSelected ? 'Deselect all' : `Select all (${filtered.length})`}
            </button>
          )}
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

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
        <ListView
          entries={filtered}
          loading={loading}
          allEntries={entries}
          selectProps={selectProps}
          onSelectAll={onSelectAll}
        />
      )}
      {viewMode === 'split' && (
        <div className="grid grid-cols-2 gap-x-4">
          <SplitTable entries={receipts} type="Receipt" loading={loading} selectProps={selectProps} />
          <SplitTable entries={payments} type="Payment" loading={loading} allEntries={entries} selectProps={selectProps} />
          {!loading && <SplitTotalsCell entries={receipts} type="Receipt" />}
          {!loading && <SplitTotalsCell entries={payments} type="Payment" />}
        </div>
      )}
      {viewMode === 'date' && (
        <DateGroupedView
          entries={filtered}
          loading={loading}
          allEntries={entries}
          selectProps={selectProps}
        />
      )}

      {/* ── Bulk delete confirmation modal ── */}
      {confirmOpen && (
        <BulkDeleteModal
          count={selectedCount}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmOpen(false)}
          deleting={deleting}
        />
      )}

    </div>
  );
}
