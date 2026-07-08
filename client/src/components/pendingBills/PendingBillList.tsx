import { useMemo, useState, useCallback, useEffect } from 'react';
import { PendingBillRow } from './PendingBillRow';
import { ClearBillsModal } from './ClearBillsModal';
import { ClearedBatchesPanel } from './ClearedBatchesPanel';
import { EntrySkeleton } from '@/components/entries/EntrySkeleton';
import { PendingBillFilters, CLEAR_FILTERS, type PendingBillFilterState } from './PendingBillFilters';
import { formatCurrency } from '@/utils/formatCurrency';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { apiDeletePendingBill, apiUpdatePendingBill } from '@/api/pendingBills';
import { exportPendingBillsPDF, exportPendingBillsExcel } from '@/utils/exportPendingBills';
import type { PendingBill, BillStatus } from '@smp-cashbook/shared';

const TABS: BillStatus[] = ['Pending', 'Approved', 'Cleared'];

const TAB_ACTIVE_CLS: Record<BillStatus, string> = {
  Pending:  'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  Approved: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300',
  Cleared:  'bg-green-100 text-green-800 ring-1 ring-green-300',
};

const TAB_BADGE_CLS: Record<BillStatus, string> = {
  Pending:  'bg-amber-200/70 text-amber-800',
  Approved: 'bg-blue-200/70 text-blue-800',
  Cleared:  'bg-green-200/70 text-green-800',
};

const TOTAL_CHIP_BORDER_CLS: Record<BillStatus, string> = {
  Pending:  'border-amber-200 bg-amber-50',
  Approved: 'border-blue-200 bg-blue-50',
  Cleared:  'border-green-200 bg-green-50',
};

const TOTAL_CHIP_LABEL_CLS: Record<BillStatus, string> = {
  Pending:  'text-amber-600',
  Approved: 'text-blue-600',
  Cleared:  'text-green-600',
};

const TOTAL_CHIP_VALUE_CLS: Record<BillStatus, string> = {
  Pending:  'text-amber-700',
  Approved: 'text-blue-700',
  Cleared:  'text-green-700',
};

const STATUS_DATE_LABEL: Record<BillStatus, string> = {
  Pending:  'Bill Date',
  Approved: 'Approved At',
  Cleared:  'Cleared At',
};

interface PendingBillListProps {
  bills: PendingBill[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!deleting ? onCancel : undefined} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
            <svg className="h-4.5 w-4.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Delete {count} {count === 1 ? 'bill' : 'bills'}?
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              This will permanently delete{' '}
              <span className="font-medium text-slate-700">{count} selected {count === 1 ? 'bill' : 'bills'}</span>.
              {' '}This action <span className="font-medium text-red-600">cannot be undone</span>.
            </p>
          </div>
        </div>
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
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PendingBillList({ bills, loading, refreshing, error }: PendingBillListProps) {
  const [activeTab, setActiveTab] = useState<BillStatus>('Pending');
  const [filters, setFilters] = useState<PendingBillFilterState>(CLEAR_FILTERS);
  const { settings } = useSettings();
  const { addToast } = useToast();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [clearBills, setClearBills] = useState<PendingBill[] | null>(null);
  const [clearedView, setClearedView] = useState<'list' | 'batches'>('list');

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  };

  const handleTabChange = (tab: BillStatus) => {
    setActiveTab(tab);
    setSelectedIds(new Set());
    setSelectMode(false);
    setClearedView('list');
  };

  const tabCounts = useMemo(() => {
    const counts: Record<BillStatus, number> = { Pending: 0, Approved: 0, Cleared: 0 };
    bills.forEach((b) => { counts[b.status]++; });
    return counts;
  }, [bills]);

  const onToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const toDelete = bills.filter((b) => selectedIds.has(b.id));
      await Promise.all(toDelete.map((b) => apiDeletePendingBill(b.id, b.financialYear, b.cashBookType)));
      addToast(`${toDelete.length} ${toDelete.length === 1 ? 'bill' : 'bills'} deleted`, 'success');
      setSelectedIds(new Set());
      setSelectMode(false);
      setConfirmOpen(false);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete bills', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const selectedBills = useMemo(() => bills.filter((b) => selectedIds.has(b.id)), [bills, selectedIds]);
  const selectedPendingIds  = useMemo(() => selectedBills.filter((b) => b.status === 'Pending').map((b) => b.id), [selectedBills]);
  const selectedApprovedBills = useMemo(() => selectedBills.filter((b) => b.status === 'Approved'), [selectedBills]);

  const handleBulkApprove = async () => {
    setApproving(true);
    try {
      await Promise.all(selectedPendingIds.map((id) => {
        const bill = bills.find((b) => b.id === id)!;
        return apiUpdatePendingBill(id, bill.financialYear, bill.cashBookType, { status: 'Approved' });
      }));
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to approve bills', 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleCleared = () => {
    setClearBills(null);
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const tabBills = useMemo(() => bills.filter((b) => b.status === activeTab), [bills, activeTab]);

  const bankOptions = useMemo(() => {
    const set = new Set(tabBills.map((b) => b.bank).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tabBills]);

  const paymentModeOptions = useMemo(() => {
    const set = new Set(tabBills.map((b) => b.paymentMode).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tabBills]);

  const headOfAccountOptions = useMemo(() => {
    const set = new Set(tabBills.map((b) => b.headOfAccount).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tabBills]);

  const filtered = useMemo(() => {
    let result = tabBills;
    if (filters.bank) result = result.filter((b) => b.bank === filters.bank);
    if (filters.paymentMode) result = result.filter((b) => b.paymentMode === filters.paymentMode);
    if (filters.headOfAccount) result = result.filter((b) => b.headOfAccount === filters.headOfAccount);
    if (filters.dateFrom) result = result.filter((b) => b.billDate >= filters.dateFrom);
    if (filters.dateTo) result = result.filter((b) => b.billDate <= filters.dateTo);
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter((b) =>
        b.firmName.toLowerCase().includes(q) ||
        b.particulars.toLowerCase().includes(q) ||
        b.billNumber.toLowerCase().includes(q) ||
        b.bank.toLowerCase().includes(q) ||
        b.headOfAccount.toLowerCase().includes(q) ||
        String(b.amount).includes(q)
      );
    }
    return [...result].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  }, [tabBills, filters]);

  const [visibleCount, setVisibleCount] = useState(10);
  useEffect(() => { setVisibleCount(10); }, [filters, activeTab]);

  const paginated = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = filtered.length > visibleCount;

  const tabTotal = useMemo(() => filtered.reduce((s, b) => s + b.amount, 0), [filtered]);
  const grandTotal = useMemo(() => bills.reduce((s, b) => s + b.amount, 0), [bills]);
  const paginatedTotal = useMemo(() => paginated.reduce((s, b) => s + b.amount, 0), [paginated]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load pending bills: {error}
      </div>
    );
  }

  const selectedCount = selectedIds.size;
  const allFilteredSelected = filtered.length > 0 && filtered.every((b) => selectedIds.has(b.id));
  const exportMeta = { financialYear: settings.activeFinancialYear, cashBookType: settings.activeCashBookType, status: activeTab, filters };
  const showStatusDate = activeTab !== 'Pending';
  const showBankPayment = activeTab !== 'Approved';
  const stackBankPayment = activeTab === 'Cleared';
  const showActions = activeTab !== 'Cleared';
  const optimizeHeadOfAcct = activeTab === 'Approved';
  const showingBatches = activeTab === 'Cleared' && clearedView === 'batches';

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">

      {/* ── Tabs ── */}
      <div className="shrink-0 flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabChange(tab)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all
              ${activeTab === tab ? TAB_ACTIVE_CLS[tab] : 'text-slate-500 hover:text-slate-700'}`}
          >
            <span>{tab}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${activeTab === tab ? TAB_BADGE_CLS[tab] : 'bg-slate-200 text-slate-600'}`}>
              {tabCounts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* ── Filter bar (with Cleared tab's List / Batches toggle alongside it) ── */}
      <div className="shrink-0 flex items-center gap-2 py-1">
        {activeTab === 'Cleared' && (
          <div className="shrink-0 flex items-center gap-1 self-start rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(['list', 'batches'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setClearedView(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors
                  ${clearedView === v ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {v === 'list' ? 'List' : 'Batches'}
              </button>
            ))}
          </div>
        )}
        {!showingBatches && (
          <div className="relative flex-1 min-w-0">
            {refreshing && (
              <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
                <div className="h-full animate-progress bg-blue-400" />
              </div>
            )}
            <PendingBillFilters
              filters={filters}
              onChange={setFilters}
              bankOptions={bankOptions}
              paymentModeOptions={paymentModeOptions}
              headOfAccountOptions={headOfAccountOptions}
            />
          </div>
        )}
      </div>

      {showingBatches ? (
        <ClearedBatchesPanel
          bills={bills}
          financialYear={settings.activeFinancialYear}
          cashBookType={settings.activeCashBookType}
        />
      ) : (
        <>

      {/* ── Bulk action bar ── */}
      {/* Always mounted (visibility toggled, not unmounted) so entering/exiting select mode never shifts the table below it. */}
      <div className={`shrink-0 flex items-center gap-3 flex-wrap rounded-lg border px-4 py-2.5 transition-colors
          ${selectMode ? 'border-blue-200 bg-blue-50' : 'invisible border-transparent'}`}
        aria-hidden={!selectMode}
      >
          <span className="text-xs font-medium text-blue-700">
            {selectedCount === 0 ? 'Click rows to select' : `${selectedCount} ${selectedCount === 1 ? 'bill' : 'bills'} selected`}
          </span>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(allFilteredSelected ? new Set() : new Set(filtered.map((b) => b.id)))}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              {allFilteredSelected ? 'Deselect all' : `Select all (${filtered.length})`}
            </button>
          )}
          {selectedCount > 0 && (
            <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
              Clear
            </button>
          )}

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {selectedPendingIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkApprove}
                disabled={approving}
                className="h-8 flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-100
                  px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-200
                  disabled:opacity-50 transition-colors"
              >
                Approve Selected ({selectedPendingIds.length})
              </button>
            )}
            {selectedApprovedBills.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const types = new Set(selectedApprovedBills.map((b) => b.cashBookType));
                  if (types.size > 1) {
                    addToast('Select approved bills from a single cash book type to clear together', 'error');
                    return;
                  }
                  setClearBills(selectedApprovedBills);
                }}
                className="h-8 flex items-center gap-1.5 rounded-md border border-green-300 bg-green-100
                  px-2.5 text-xs font-medium text-green-700 hover:bg-green-200 transition-colors"
              >
                Mark Cleared ({selectedApprovedBills.length})
              </button>
            )}
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => exportPendingBillsPDF(selectedBills, exportMeta)}
              title="Export selected as PDF"
              className="h-8 flex items-center gap-1.5 rounded-md border border-slate-200 bg-white
                px-2.5 text-xs font-medium text-slate-600
                hover:border-red-300 hover:text-red-600
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Export Selected PDF
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => exportPendingBillsExcel(selectedBills, exportMeta)}
              title="Export selected as Excel"
              className="h-8 flex items-center gap-1.5 rounded-md border border-slate-200 bg-white
                px-2.5 text-xs font-medium text-slate-600
                hover:border-green-300 hover:text-green-600
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Export Selected Excel
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setConfirmOpen(true)}
              title="Delete selected bills"
              className="h-8 flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50
                px-2.5 text-xs font-medium text-red-600
                hover:bg-red-100 hover:border-red-400
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Delete {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          </div>
      </div>

      {/* ── Summary bar ── */}
      <div className="shrink-0 flex items-center gap-3 flex-wrap">
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${TOTAL_CHIP_BORDER_CLS[activeTab]}`}>
          <span className={`text-xs ${TOTAL_CHIP_LABEL_CLS[activeTab]}`}>{activeTab} Total</span>
          <span className={`text-sm font-semibold ${TOTAL_CHIP_VALUE_CLS[activeTab]}`}>{formatCurrency(tabTotal)}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-500">Grand Total (all)</span>
          <span className="text-sm font-semibold text-slate-700">{formatCurrency(grandTotal)}</span>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {!selectMode && (
            <>
              <button
                type="button"
                onClick={() => exportPendingBillsPDF(filtered, exportMeta)}
                title="Export as PDF"
                className="h-9 flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
                  px-2.5 text-xs font-medium text-slate-600
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
                onClick={() => exportPendingBillsExcel(filtered, exportMeta)}
                title="Export as Excel"
                className="h-9 flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
                  px-2.5 text-xs font-medium text-slate-600
                  hover:border-green-300 hover:text-green-600 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
                </svg>
                <span>Excel</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={toggleSelectMode}
            title={selectMode ? 'Exit selection mode' : 'Select bills to bulk act on'}
            className={`h-9 flex shrink-0 items-center gap-1.5 rounded-md border px-2.5
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
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex-1 min-h-0 rounded-lg border border-slate-200 p-3 overflow-y-auto">
          <EntrySkeleton />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center rounded-lg border border-slate-200 text-center text-sm text-slate-400">
          {bills.length === 0 ? 'No pending bills yet — add your first one above.' : 'No bills match the current filters.'}
        </div>
      ) : (
        <div className="flex-1 min-h-0 rounded-lg border border-slate-200 overflow-auto">
          <table className="w-full min-w-[1060px] text-left text-sm table-fixed">
            <colgroup>
              {selectMode && <col className="w-[36px]" />}
              <col className="w-[44px]" />
              <col className="w-[80px]" />
              {showBankPayment && !stackBankPayment && <col className="w-[110px]" />}
              {showBankPayment && !stackBankPayment && <col className="w-[90px]" />}
              {showBankPayment && stackBankPayment && <col className="w-[140px]" />}
              <col className="w-[100px]" />
              {optimizeHeadOfAcct ? <col className="w-[190px]" /> : <col className="w-[130px]" />}
              {optimizeHeadOfAcct ? <col className="w-[150px]" /> : <col />}
              <col className="w-[100px]" />
              <col className="w-[80px]" />
              {showStatusDate && <col className="w-[90px]" />}
              {showActions && <col className="w-[110px]" />}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-white shadow-sm">
                {selectMode && <th className="w-[36px] bg-white" />}
                <th className="py-2.5 pl-4 pr-1 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Sl No</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Date</th>
                {showBankPayment && !stackBankPayment && (
                  <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Bank</th>
                )}
                {showBankPayment && !stackBankPayment && (
                  <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Payment</th>
                )}
                {showBankPayment && stackBankPayment && (
                  <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Bank / Payment</th>
                )}
                <th className="pl-2 pr-4 py-2.5 text-xs font-medium text-slate-500 text-right whitespace-nowrap bg-white">Amt</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Head Of Acct</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Firm Name</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Bill No</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Bill Date</th>
                {showStatusDate && (
                  <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">{STATUS_DATE_LABEL[activeTab]}</th>
                )}
                {showActions && (
                  <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginated.map((bill, i) => (
                <PendingBillRow
                  key={bill.id}
                  bill={bill}
                  slNo={i + 1}
                  selectMode={selectMode}
                  selected={selectedIds.has(bill.id)}
                  onToggle={onToggle}
                  showStatusDate={showStatusDate}
                  showBankPayment={showBankPayment}
                  stackBankPayment={stackBankPayment}
                  showActions={showActions}
                />
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10">
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                {selectMode && <td className="bg-slate-50" />}
                <td colSpan={2 + (showBankPayment ? (stackBankPayment ? 1 : 2) : 0)} className="py-2.5 pl-4 pr-2 text-xs font-medium text-slate-500 whitespace-nowrap bg-slate-50">
                  Total ({paginated.length} of {filtered.length} {filtered.length === 1 ? 'bill' : 'bills'})
                </td>
                <td className="pl-2 pr-4 py-2.5 text-sm font-bold text-right whitespace-nowrap text-slate-800 bg-slate-50">
                  {formatCurrency(paginatedTotal)}
                </td>
                <td colSpan={4 + (showStatusDate ? 1 : 0) + (showActions ? 1 : 0)} className="bg-slate-50" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Load more ── */}
      {!loading && filtered.length > 0 && (
        <div className="shrink-0 flex flex-col items-center gap-2 py-2">
          {hasMore ? (
            <>
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + 100)}
                className="rounded-lg border border-slate-200 bg-white px-6 py-2 text-sm font-medium
                  text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
              >
                Load more ({Math.min(100, filtered.length - visibleCount)} more bills)
              </button>
              <p className="text-xs text-slate-400">
                Showing {paginated.length} of {filtered.length} bills
              </p>
            </>
          ) : (
            filtered.length > 10 && (
              <p className="text-xs text-slate-400">All {filtered.length} bills loaded</p>
            )
          )}
        </div>
      )}

        </>
      )}

      {confirmOpen && (
        <BulkDeleteModal
          count={selectedCount}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmOpen(false)}
          deleting={deleting}
        />
      )}

      {clearBills && (
        <ClearBillsModal
          bills={clearBills}
          financialYear={settings.activeFinancialYear}
          cashBookType={clearBills[0].cashBookType}
          onClose={() => setClearBills(null)}
          onCleared={handleCleared}
        />
      )}

    </div>
  );
}
