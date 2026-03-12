import { useState } from 'react';
import { cn } from '@/utils/cn';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { apiCreateEntry } from '@/api/entries';
import { toProperCase } from '@smp-cashbook/shared';
import { todayISO } from '@/utils/formatDate';
import type { EntryType, EntryFormData } from '@smp-cashbook/shared';

const EMPTY_FORM: EntryFormData = {
  date: todayISO(),
  chequeNo: '',
  amount: '',
  headOfAccount: '',
  notes: '',
  type: 'Receipt',
};

interface FormErrors {
  date?: string;
  amount?: string;
  headOfAccount?: string;
}

export function EntryForm() {
  const { settings } = useSettings();
  const { addToast } = useToast();
  const [form, setForm] = useState<EntryFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof EntryFormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.date) e.date = 'Date is required';
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Amount must be a positive number';
    if (!form.headOfAccount.trim()) e.headOfAccount = 'Head of Account is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await apiCreateEntry({
        date: form.date,
        chequeNo: form.chequeNo.trim(),
        amount: Number(form.amount),
        headOfAccount: toProperCase(form.headOfAccount.trim()),
        notes: form.notes ? toProperCase(form.notes.trim()) : '',
        type: form.type,
        financialYear: settings.activeFinancialYear,
        cashBookType: settings.activeCashBookType,
      });
      addToast(`${form.type} entry added successfully`, 'success');
      setForm({ ...EMPTY_FORM, type: form.type, date: todayISO() });
      setErrors({});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save entry';
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: EntryType[] = ['Receipt', 'Payment'];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Receipt / Payment toggle */}
      <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => set('type', tab)}
            className={cn(
              'flex-1 rounded-md py-1.5 text-sm font-medium transition-all',
              form.type === tab
                ? tab === 'Receipt'
                  ? 'bg-white text-green-700 shadow-sm ring-1 ring-slate-200'
                  : 'bg-white text-red-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Date"
          id="entry-date"
          type="date"
          value={form.date}
          onChange={(e) => set('date', e.target.value)}
          error={errors.date}
        />
        <Input
          label="Cheque No"
          id="entry-cheque"
          type="text"
          placeholder="Optional"
          value={form.chequeNo}
          onChange={(e) => set('chequeNo', e.target.value)}
        />
      </div>

      <Input
        label="Amount (₹)"
        id="entry-amount"
        type="number"
        min="0.01"
        step="0.01"
        placeholder="0.00"
        value={form.amount}
        onChange={(e) => set('amount', e.target.value)}
        error={errors.amount}
      />

      <Input
        label="Head of Account"
        id="entry-hoa"
        type="text"
        placeholder="E.g. Tuition Fee"
        value={form.headOfAccount}
        onChange={(e) => set('headOfAccount', toProperCase(e.target.value))}
        error={errors.headOfAccount}
      />

      <Textarea
        label="Notes"
        id="entry-notes"
        placeholder="Optional remarks..."
        value={form.notes}
        onChange={(e) => set('notes', toProperCase(e.target.value))}
      />

      <Button type="submit" loading={submitting} className="w-full">
        Add {form.type}
      </Button>
    </form>
  );
}
