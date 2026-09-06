import { useMemo, useState } from 'react';
import { useBudgetHeads } from '@/hooks/useBudgetHeads';
import { useEntries } from '@/hooks/useEntries';
import { useToast } from '@/context/ToastContext';
import { apiCreateBudgetExpense, apiUpdateBudgetExpense } from '@/api/budgetExpenses';
import { toProperCase } from '@smp-cashbook/shared';
import { todayISO } from '@/utils/formatDate';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { DateInput } from '@/components/ui/DateInput';
import { SelectDropdown } from '@/components/ui/SelectDropdown';
import { Button } from '@/components/ui/Button';
import { LinkedEntryPicker } from './LinkedEntryPicker';
import type { BudgetExpense, CashBookType } from '@smp-cashbook/shared';

interface BudgetExpenseFormProps {
  financialYear: string;
  cashBookType: CashBookType;
  expense?: BudgetExpense; // present when editing
  onSaved: () => void;
  onCancel?: () => void;
}

interface FormErrors {
  date?: string;
  headId?: string;
  amount?: string;
}

export function BudgetExpenseForm({ financialYear, cashBookType, expense, onSaved, onCancel }: BudgetExpenseFormProps) {
  const { addToast } = useToast();
  const { budgetHeads } = useBudgetHeads();
  const { entries } = useEntries(financialYear, cashBookType);

  const [date, setDate] = useState(expense?.date ?? todayISO());
  const [headId, setHeadId] = useState(expense?.headId ?? '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [linkedEntryId, setLinkedEntryId] = useState(expense?.linkedEntryId ?? '');
  const [showLinkPicker, setShowLinkPicker] = useState(!!expense?.linkedEntryId);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const paymentEntries = useMemo(() => entries.filter((e) => e.type === 'Payment'), [entries]);
  const selectedEntry = useMemo(
    () => paymentEntries.find((e) => e.id === linkedEntryId) ?? null,
    [paymentEntries, linkedEntryId]
  );

  const headOptions = useMemo(
    () => budgetHeads.filter((h) => h.isActive || h.id === headId).map((h) => ({ label: h.headName, value: h.id })),
    [budgetHeads, headId]
  );

  const handleSelectLinkedEntry = (entry: (typeof paymentEntries)[number]) => {
    setLinkedEntryId(entry.id);
    // Auto-fill as a convenience starting point — still editable afterward.
    setDate(entry.date);
    setAmount(String(entry.amount));
    const match = budgetHeads.find((h) => h.headName.toLowerCase() === entry.headOfAccount.toLowerCase());
    if (match) setHeadId(match.id);
  };

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!date) e.date = 'Date is required';
    if (!headId) e.headId = 'Head of Account is required';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) e.amount = 'Amount must be a positive number';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (expense) {
        await apiUpdateBudgetExpense(expense.id, financialYear, cashBookType, {
          date,
          headId,
          amount: Number(amount),
          notes: notes ? toProperCase(notes.trim()) : '',
          linkedEntryId,
        });
        addToast('Expense updated', 'success');
      } else {
        await apiCreateBudgetExpense({
          date,
          headId,
          amount: Number(amount),
          notes: notes ? toProperCase(notes.trim()) : '',
          financialYear,
          cashBookType,
          linkedEntryId: linkedEntryId || undefined,
        });
        addToast('Expense added', 'success');
      }
      onSaved();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to save expense', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <DateInput label="Date" id="expense-date" value={date} onChange={setDate} error={errors.date} />
        <Input label="Amount (₹)" id="expense-amount" type="number" min="0.01" step="0.01" placeholder="0.00"
          value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Head of Account</label>
        <SelectDropdown
          value={headId}
          onChange={setHeadId}
          options={headOptions}
          placeholder="Select a budget head"
          className="w-full"
          triggerCls="flex w-full items-center justify-between gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        {errors.headId && <p className="text-xs text-red-600">{errors.headId}</p>}
      </div>

      <Textarea label="Notes" id="expense-notes" placeholder="Optional remarks..."
        value={notes} onChange={(e) => setNotes(toProperCase(e.target.value))} />

      <div className="flex flex-col gap-1">
        {showLinkPicker ? (
          <>
            <label className="text-xs font-medium text-slate-600">Linked Cash Book Entry (optional)</label>
            <LinkedEntryPicker
              entries={paymentEntries}
              selectedEntry={selectedEntry}
              onSelect={handleSelectLinkedEntry}
              onClear={() => setLinkedEntryId('')}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowLinkPicker(true)}
            className="self-start text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            + Link to an existing Payment entry
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" loading={submitting} className="flex-1">
          {expense ? 'Save Changes' : 'Add Expense'}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
