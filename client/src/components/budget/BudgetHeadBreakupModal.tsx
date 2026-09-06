import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { apiDeleteBudgetExpense } from '@/api/budgetExpenses';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { BudgetExpenseForm } from './BudgetExpenseForm';
import { StatusBadge } from './BudgetOverviewTab';
import { exportBudgetHeadBreakupPDF, exportBudgetHeadBreakupExcel } from '@/utils/exportBudgetReport';
import type { BudgetExpense, BudgetHeadSummary } from '@smp-cashbook/shared';

interface BudgetHeadBreakupModalProps {
  summary: BudgetHeadSummary;
  expenses: BudgetExpense[];
  showTypeColumn: boolean;
  financialYear: string;
  typeLabel: string;
  onClose: () => void;
}

export function BudgetHeadBreakupModal({
  summary,
  expenses,
  showTypeColumn,
  financialYear,
  typeLabel,
  onClose,
}: BudgetHeadBreakupModalProps) {
  const { addToast } = useToast();
  const [editing, setEditing] = useState<BudgetExpense | null>(null);
  const [deleting, setDeleting] = useState<BudgetExpense | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await apiDeleteBudgetExpense(deleting.id, financialYear, deleting.cashBookType);
      addToast('Expense deleted', 'success');
      setDeleting(null);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to delete expense', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{summary.headName}</h2>
            <p className="text-xs text-slate-500">{financialYear} · {typeLabel}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs">
          <div>
            <p className="text-slate-400">Allocated</p>
            <p className="font-semibold text-slate-700">{formatCurrency(summary.allocatedAmount)}</p>
          </div>
          <div>
            <p className="text-slate-400">Spent</p>
            <p className="font-semibold text-slate-700">{formatCurrency(summary.spentAmount)}</p>
          </div>
          <div>
            <p className="text-slate-400">Remaining</p>
            <p className={`font-semibold ${summary.remainingAmount < 0 ? 'text-red-600' : 'text-slate-700'}`}>
              {formatCurrency(summary.remainingAmount)}
            </p>
          </div>
          <div>
            <p className="text-slate-400">Status</p>
            <StatusBadge status={summary.status} allocatedAmount={summary.allocatedAmount} spentAmount={summary.spentAmount} />
          </div>
        </div>

        <div className="mt-4">
          {expenses.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              No expenses recorded under this head yet.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              {expenses.map((exp) => (
                <div key={exp.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
                  <span className="w-20 shrink-0 text-xs text-slate-500">{formatDate(exp.date)}</span>
                  <span className="flex-1 min-w-0 truncate text-xs text-slate-600">{exp.notes || '—'}</span>
                  {showTypeColumn && <Badge variant="neutral">{exp.cashBookType}</Badge>}
                  {exp.linkedEntryId && <Badge variant="blue">Linked</Badge>}
                  <span className="w-24 shrink-0 text-right text-sm font-semibold text-slate-800">{formatCurrency(exp.amount)}</span>
                  <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditing(exp)}
                      className="rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleting(exp)}
                      className="rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <span>Total</span>
                <span>{formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={expenses.length === 0}
            onClick={() => exportBudgetHeadBreakupPDF(summary, expenses, { financialYear, cashBookTypeLabel: typeLabel }, showTypeColumn)}
          >
            Export PDF
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={expenses.length === 0}
            onClick={() => exportBudgetHeadBreakupExcel(summary, expenses, { financialYear, cashBookTypeLabel: typeLabel }, showTypeColumn)}
          >
            Export Excel
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-base font-semibold text-slate-800">Edit Expense</h2>
            <BudgetExpenseForm
              financialYear={financialYear}
              cashBookType={editing.cashBookType}
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
        description={deleting ? `${deleting.notes || summary.headName} · ${formatCurrency(deleting.amount)} on ${formatDate(deleting.date)}. This cannot be undone.` : undefined}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
