import { useMemo, useState } from 'react';
import { useBudgetHeads } from '@/hooks/useBudgetHeads';
import { useBudgetAllocations } from '@/hooks/useBudgetAllocations';
import { useToast } from '@/context/ToastContext';
import { apiUpsertBudgetAllocation } from '@/api/budgetAllocations';
import { formatCurrency } from '@/utils/formatCurrency';
import type { CashBookType } from '@smp-cashbook/shared';

interface AllocationRowProps {
  headId: string;
  headName: string;
  allocatedAmount: number;
  financialYear: string;
  cashBookType: CashBookType;
}

function AllocationRow({ headId, headName, allocatedAmount, financialYear, cashBookType }: AllocationRowProps) {
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [saving, setSaving] = useState(false);

  const openEdit = () => {
    setInputVal(allocatedAmount ? String(allocatedAmount) : '');
    setEditing(true);
  };

  const handleSave = async () => {
    const amount = Number(inputVal);
    if (inputVal.trim() === '' || isNaN(amount) || amount < 0) {
      addToast('Enter a non-negative amount', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiUpsertBudgetAllocation({ headId, allocatedAmount: amount, financialYear, cashBookType });
      setEditing(false);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to save allocation', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
      <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{headName}</span>
      {editing ? (
        <>
          <input
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-32 rounded-md border border-blue-300 px-2.5 py-1 text-sm text-right
              text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white
              hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="shrink-0 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium
              text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          onClick={openEdit}
          className="shrink-0 rounded-md border border-transparent px-3 py-1 text-sm font-medium
            text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors"
        >
          {formatCurrency(allocatedAmount)}
        </button>
      )}
    </div>
  );
}

export function BudgetAllocationsTab({
  financialYear,
  cashBookType,
}: {
  financialYear: string;
  cashBookType: CashBookType;
}) {
  const { budgetHeads, loading: headsLoading } = useBudgetHeads();
  const { allocations, loading: allocationsLoading } = useBudgetAllocations(financialYear, cashBookType);

  const rows = useMemo(() => {
    const byHeadId = new Map(allocations.map((a) => [a.headId, a]));
    return budgetHeads
      .filter((h) => h.isActive)
      .map((h) => ({
        headId: h.id,
        headName: h.headName,
        allocatedAmount: byHeadId.get(h.id)?.allocatedAmount ?? 0,
      }));
  }, [budgetHeads, allocations]);

  const totalAllocated = rows.reduce((sum, r) => sum + r.allocatedAmount, 0);
  const loading = headsLoading || allocationsLoading;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 flex items-center gap-2">
        <svg className="h-3.5 w-3.5 shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-blue-700">
          Allocations for <span className="font-semibold">{financialYear}</span> ·{' '}
          <span className="font-semibold">{cashBookType}</span>. Click an amount to edit it.
        </p>
      </div>

      {loading ? (
        <div className="space-y-1.5 animate-pulse">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded-lg bg-slate-100" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
          No active budget heads yet — add some in the Manage Heads tab.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            {rows.map((r) => (
              <AllocationRow
                key={r.headId}
                headId={r.headId}
                headName={r.headName}
                allocatedAmount={r.allocatedAmount}
                financialYear={financialYear}
                cashBookType={cashBookType}
              />
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-600">Total Allocated</span>
            <span className="text-sm font-bold text-slate-800">{formatCurrency(totalAllocated)}</span>
          </div>
        </>
      )}
    </div>
  );
}
