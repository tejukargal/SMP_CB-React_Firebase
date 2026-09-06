import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { useSettings } from '@/context/SettingsContext';
import { SelectDropdown } from '@/components/ui/SelectDropdown';
import { Button } from '@/components/ui/Button';
import { BudgetOverviewTab } from '@/components/budget/BudgetOverviewTab';
import { BudgetAllocationsTab } from '@/components/budget/BudgetAllocationsTab';
import { BudgetExpenseForm } from '@/components/budget/BudgetExpenseForm';
import { BudgetExpenseList } from '@/components/budget/BudgetExpenseList';
import { ManageBudgetHeadsTab } from '@/components/budget/ManageBudgetHeadsTab';
import type { CashBookType } from '@smp-cashbook/shared';

type Tab = 'overview' | 'allocations' | 'expenses' | 'heads';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'allocations', label: 'Allocations' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'heads', label: 'Manage Heads' },
];

const CONCRETE_OPTIONS = [
  { label: 'Aided', value: 'Aided' },
  { label: 'Un-Aided', value: 'Un-Aided' },
  { label: 'WP Un-Aided', value: 'WP Un-Aided' },
];

export function BudgetTrackerPage() {
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>('overview');
  const [manualViewType, setManualViewType] = useState<CashBookType | 'All'>('Aided');
  const [showAddExpense, setShowAddExpense] = useState(false);

  const isBoth = settings.activeCashBookType === 'Both';
  const viewType: CashBookType | 'All' = settings.activeCashBookType === 'Both' ? manualViewType : settings.activeCashBookType;
  const editType: CashBookType = viewType === 'All' ? 'Aided' : viewType;

  // Allocations/Expenses/Heads need one concrete type — fall back off "All" when leaving Overview.
  useEffect(() => {
    if (tab !== 'overview' && manualViewType === 'All') setManualViewType('Aided');
  }, [tab, manualViewType]);

  const selectorOptions = tab === 'overview' ? [...CONCRETE_OPTIONS, { label: 'All (combined)', value: 'All' }] : CONCRETE_OPTIONS;

  return (
    <div className="w-full pb-6 space-y-4" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                tab === t.id
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isBoth && (
            <SelectDropdown value={viewType} onChange={(v) => setManualViewType(v as CashBookType | 'All')} options={selectorOptions} />
          )}
          {tab === 'expenses' && (
            <Button size="sm" onClick={() => setShowAddExpense(true)}>+ Add Expense</Button>
          )}
        </div>
      </div>

      {tab === 'overview' && (
        <BudgetOverviewTab financialYear={settings.activeFinancialYear} viewType={viewType} />
      )}
      {tab === 'allocations' && (
        <BudgetAllocationsTab financialYear={settings.activeFinancialYear} cashBookType={editType} />
      )}
      {tab === 'expenses' && (
        <BudgetExpenseList financialYear={settings.activeFinancialYear} cashBookType={editType} />
      )}
      {tab === 'heads' && <ManageBudgetHeadsTab />}

      {showAddExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddExpense(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-base font-semibold text-slate-800">Add Expense</h2>
            <BudgetExpenseForm
              financialYear={settings.activeFinancialYear}
              cashBookType={editType}
              onSaved={() => setShowAddExpense(false)}
              onCancel={() => setShowAddExpense(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
