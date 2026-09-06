import { useState } from 'react';
import { useBudgetExpenses } from '@/hooks/useBudgetExpenses';
import { useToast } from '@/context/ToastContext';
import { apiDeleteBudgetExpense } from '@/api/budgetExpenses';
import { formatCurrency } from '@/utils/formatCurrency';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { BudgetExpenseForm } from './BudgetExpenseForm';
import type { BudgetExpense, CashBookType } from '@smp-cashbook/shared';

export function BudgetExpenseList({
  financialYear,
  cashBookType,
}: {
  financialYear: string;
  cashBookType: CashBookType;
}) {
  const { expenses, loading } = useBudgetExpenses(financialYear, cashBookType);
  const { addToast } = useToast();
  const [editing, setEditing] = useState<BudgetExpense | null>(null);
  const [deleting, setDeleting] = useState<BudgetExpense | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await apiDeleteBudgetExpense(deleting.id, financialYear, cashBookType);
      addToast('Expense deleted', 'success');
      setDeleting(null);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to delete expense', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-1.5 animate-pulse">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-lg bg-slate-100" />)}
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
        No expenses recorded yet for {financialYear} · {cashBookType}.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        {expenses.map((exp) => (
          <div key={exp.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
            <span className="w-24 shrink-0 text-xs text-slate-500">{exp.date}</span>
            <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{exp.headName}</span>
            {exp.notes && <span className="hidden md:block flex-1 min-w-0 truncate text-xs text-slate-400">{exp.notes}</span>}
            {exp.linkedEntryId && <Badge variant="blue">Linked</Badge>}
            <span className="w-28 shrink-0 text-right text-sm font-semibold text-slate-800">{formatCurrency(exp.amount)}</span>
            <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setEditing(exp)}
                className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title="Edit"
              >
                Edit
              </button>
              <button
                onClick={() => setDeleting(exp)}
                className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Delete"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-base font-semibold text-slate-800">Edit Expense</h2>
            <BudgetExpenseForm
              financialYear={financialYear}
              cashBookType={cashBookType}
              expense={editing}
              onSaved={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          </div>
        </div>
      )}

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this expense?"
        description={deleting ? `${deleting.headName} · ${formatCurrency(deleting.amount)} on ${deleting.date}. This cannot be undone.` : undefined}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
    </>
  );
}
