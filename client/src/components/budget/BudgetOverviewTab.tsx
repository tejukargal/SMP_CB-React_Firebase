import { useMemo, useState } from 'react';
import { useBudgetHeads } from '@/hooks/useBudgetHeads';
import { useBudgetAllocations } from '@/hooks/useBudgetAllocations';
import { useBudgetExpenses } from '@/hooks/useBudgetExpenses';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/utils/formatCurrency';
import { exportBudgetReportPDF, exportBudgetReportExcel } from '@/utils/exportBudgetReport';
import { BudgetHeadBreakupModal } from './BudgetHeadBreakupModal';
import type { CashBookType, BudgetHeadSummary, BudgetStatus } from '@smp-cashbook/shared';

const CONCRETE_TYPES: CashBookType[] = ['Aided', 'Un-Aided', 'WP Un-Aided'];

export function deriveStatus(allocatedAmount: number, spentAmount: number): { status: BudgetStatus; percentUsed: number } {
  if (allocatedAmount === 0) {
    return { status: spentAmount > 0 ? 'exceeded' : 'on-track', percentUsed: spentAmount > 0 ? 100 : 0 };
  }
  const percentUsed = (spentAmount / allocatedAmount) * 100;
  if (percentUsed >= 100) return { status: 'exceeded', percentUsed };
  if (percentUsed >= 80) return { status: 'near-limit', percentUsed };
  return { status: 'on-track', percentUsed };
}

export function StatusBadge({ status, allocatedAmount, spentAmount }: { status: BudgetStatus; allocatedAmount: number; spentAmount: number }) {
  if (status === 'exceeded') {
    if (allocatedAmount === 0) return <Badge variant="payment">No Budget Set</Badge>;
    return <Badge variant="payment">Exceeded +{formatCurrency(spentAmount - allocatedAmount)}</Badge>;
  }
  if (status === 'near-limit') return <Badge variant="warning">Near Limit</Badge>;
  return <Badge variant="receipt">On Track</Badge>;
}

export function BudgetOverviewTab({
  financialYear,
  viewType,
}: {
  financialYear: string;
  viewType: CashBookType | 'All';
}) {
  const { budgetHeads } = useBudgetHeads();
  const [search, setSearch] = useState('');
  const [selectedHeadId, setSelectedHeadId] = useState<string | null>(null);

  // Rules of Hooks: always subscribe to all 3 concrete types, combine per viewType below.
  const aidedAlloc = useBudgetAllocations(financialYear, 'Aided');
  const unAidedAlloc = useBudgetAllocations(financialYear, 'Un-Aided');
  const wpAlloc = useBudgetAllocations(financialYear, 'WP Un-Aided');
  const aidedExp = useBudgetExpenses(financialYear, 'Aided');
  const unAidedExp = useBudgetExpenses(financialYear, 'Un-Aided');
  const wpExp = useBudgetExpenses(financialYear, 'WP Un-Aided');

  const typesInScope: CashBookType[] = viewType === 'All' ? CONCRETE_TYPES : [viewType];
  const allocationsByType: Record<CashBookType, typeof aidedAlloc.allocations> = {
    Aided: aidedAlloc.allocations,
    'Un-Aided': unAidedAlloc.allocations,
    'WP Un-Aided': wpAlloc.allocations,
  };
  const expensesByType: Record<CashBookType, typeof aidedExp.expenses> = {
    Aided: aidedExp.expenses,
    'Un-Aided': unAidedExp.expenses,
    'WP Un-Aided': wpExp.expenses,
  };
  const loading =
    aidedAlloc.loading || unAidedAlloc.loading || wpAlloc.loading ||
    aidedExp.loading || unAidedExp.loading || wpExp.loading;

  const summaries = useMemo<BudgetHeadSummary[]>(() => {
    const headNameById = new Map(budgetHeads.map((h) => [h.id, h.headName]));
    const allocatedById = new Map<string, number>();
    const spentById = new Map<string, number>();

    for (const t of typesInScope) {
      for (const a of allocationsByType[t]) {
        allocatedById.set(a.headId, (allocatedById.get(a.headId) ?? 0) + a.allocatedAmount);
        if (!headNameById.has(a.headId)) headNameById.set(a.headId, a.headName);
      }
      for (const e of expensesByType[t]) {
        spentById.set(e.headId, (spentById.get(e.headId) ?? 0) + e.amount);
        if (!headNameById.has(e.headId)) headNameById.set(e.headId, e.headName);
      }
    }

    const headIds = new Set<string>([...allocatedById.keys(), ...spentById.keys()]);
    return Array.from(headIds)
      .map((headId) => {
        const allocatedAmount = allocatedById.get(headId) ?? 0;
        const spentAmount = spentById.get(headId) ?? 0;
        const { status, percentUsed } = deriveStatus(allocatedAmount, spentAmount);
        return {
          headId,
          headName: headNameById.get(headId) ?? headId,
          allocatedAmount,
          spentAmount,
          remainingAmount: allocatedAmount - spentAmount,
          percentUsed,
          status,
          financialYear,
          cashBookType: (viewType === 'All' ? 'Aided' : viewType) as CashBookType,
        };
      })
      .sort((a, b) => a.headName.localeCompare(b.headName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetHeads, financialYear, viewType, aidedAlloc.allocations, unAidedAlloc.allocations, wpAlloc.allocations, aidedExp.expenses, unAidedExp.expenses, wpExp.expenses]);

  const combinedExpenses = useMemo(
    () => typesInScope.flatMap((t) => expensesByType[t]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typesInScope, aidedExp.expenses, unAidedExp.expenses, wpExp.expenses]
  );

  const totalAllocated = summaries.reduce((sum, s) => sum + s.allocatedAmount, 0);
  const totalSpent = summaries.reduce((sum, s) => sum + s.spentAmount, 0);
  const exceededCount = summaries.filter((s) => s.status === 'exceeded').length;
  const typeLabel = viewType === 'All' ? 'All Cash Book Types' : viewType;

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? summaries.filter((s) => s.headName.toLowerCase().includes(q)) : summaries;
  }, [summaries, search]);
  const filteredTotalAllocated = filteredSummaries.reduce((sum, s) => sum + s.allocatedAmount, 0);
  const filteredTotalSpent = filteredSummaries.reduce((sum, s) => sum + s.spentAmount, 0);

  const selectedSummary = selectedHeadId ? summaries.find((s) => s.headId === selectedHeadId) ?? null : null;
  const selectedBreakup = useMemo(
    () =>
      selectedHeadId
        ? combinedExpenses.filter((e) => e.headId === selectedHeadId).sort((a, b) => a.date.localeCompare(b.date))
        : [],
    [combinedExpenses, selectedHeadId]
  );

  if (loading) {
    return (
      <div className="space-y-1.5 animate-pulse">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-lg bg-slate-100" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 px-4 py-3.5 shadow-md text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-0.5">Total Allocated</p>
          <p className="text-lg font-extrabold">{formatCurrency(totalAllocated)}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 px-4 py-3.5 shadow-md text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-0.5">Total Spent</p>
          <p className="text-lg font-extrabold">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-red-500 to-red-700 px-4 py-3.5 shadow-md text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-0.5">Heads Exceeded</p>
          <p className="text-lg font-extrabold">{exceededCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search heads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm
              text-slate-700 placeholder-slate-400 focus:border-blue-300 focus:outline-none
              focus:ring-1 focus:ring-blue-300"
          />
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-500">{financialYear} · {typeLabel}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={summaries.length === 0}
            onClick={() => exportBudgetReportPDF(summaries, { financialYear, cashBookTypeLabel: typeLabel })}
          >
            Export PDF
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={summaries.length === 0}
            onClick={() => exportBudgetReportExcel(summaries, { financialYear, cashBookTypeLabel: typeLabel })}
          >
            Export Excel
          </Button>
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
          No budget activity yet for {financialYear} · {typeLabel}.
        </div>
      ) : filteredSummaries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
          No heads match "{search}".
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <p className="bg-blue-50 px-4 py-1.5 text-[11px] text-blue-700">
            Double-click a head for its expense breakup.
          </p>
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.4fr] gap-2 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span>Head</span>
            <span className="text-right">Allocated</span>
            <span className="text-right">Spent</span>
            <span className="text-right">Remaining</span>
            <span className="text-right">Status</span>
          </div>
          {filteredSummaries.map((s) => (
            <div
              key={s.headId}
              onDoubleClick={() => setSelectedHeadId(s.headId)}
              className="cursor-pointer border-t border-slate-100 px-4 py-2.5 hover:bg-slate-50 transition-colors"
              title="Double-click for expense breakup"
            >
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.4fr] items-center gap-2">
                <span className="truncate text-sm text-slate-700">{s.headName}</span>
                <span className="text-right text-sm text-slate-700">{formatCurrency(s.allocatedAmount)}</span>
                <span className="text-right text-sm text-slate-700">{formatCurrency(s.spentAmount)}</span>
                <span className={`text-right text-sm font-medium ${s.remainingAmount < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                  {formatCurrency(s.remainingAmount)}
                </span>
                <span className="flex justify-end">
                  <StatusBadge status={s.status} allocatedAmount={s.allocatedAmount} spentAmount={s.spentAmount} />
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.status === 'exceeded' ? 'bg-red-400' : s.status === 'near-limit' ? 'bg-amber-400' : 'bg-green-400'}`}
                  style={{ width: `${Math.min(s.percentUsed, 100)}%` }}
                />
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1.4fr] gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">
            <span>Total</span>
            <span className="text-right">{formatCurrency(filteredTotalAllocated)}</span>
            <span className="text-right">{formatCurrency(filteredTotalSpent)}</span>
            <span className="text-right">{formatCurrency(filteredTotalAllocated - filteredTotalSpent)}</span>
            <span />
          </div>
        </div>
      )}

      {selectedSummary && (
        <BudgetHeadBreakupModal
          summary={selectedSummary}
          expenses={selectedBreakup}
          showTypeColumn={viewType === 'All'}
          financialYear={financialYear}
          typeLabel={typeLabel}
          onClose={() => setSelectedHeadId(null)}
        />
      )}
    </div>
  );
}
