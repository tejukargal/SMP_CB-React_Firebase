import { useMemo, useState } from 'react';
import { cn } from '@/utils/cn';
import { Input } from '@/components/ui/Input';
import { DateInput } from '@/components/ui/DateInput';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { apiCreateEntry } from '@/api/entries';
import { toProperCase } from '@smp-cashbook/shared';
import { todayISO } from '@/utils/formatDate';
import { formatCurrency } from '@/utils/formatCurrency';
import { useEntries } from '@/hooks/useEntries';
import { EntryRow } from '@/components/entries/EntryRow';
import { EntrySkeleton } from '@/components/entries/EntrySkeleton';
import type { Entry, EntryType, EntryFormData } from '@smp-cashbook/shared';

function RecentSplitPanel({
  entries,
  type,
  total,
}: {
  entries: Entry[];
  type: 'Receipt' | 'Payment';
  total: number;
}) {
  const isReceipt = type === 'Receipt';
  const color = isReceipt ? 'green' : 'red';

  return (
    <div className="flex flex-col min-w-0 flex-1">
      {/* Coloured header */}
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

      {entries.length === 0 ? (
        <div className={`rounded-b-lg border-x border-b py-8 text-center text-sm
          ${isReceipt ? 'border-green-200' : 'border-red-200'} text-slate-400`}
        >
          No recent {type.toLowerCase()} entries
        </div>
      ) : (
        <div className={`rounded-b-lg border-x border-b
          ${isReceipt ? 'border-green-200' : 'border-red-200'}`}
        >
          <table className="w-full text-left text-sm table-fixed">
            <colgroup>
              <col className="w-[90px]" />
              <col />
              <col className="w-[100px]" />
              <col className="w-[120px]" />
              <col className="w-9" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="py-2 pl-4 pr-2 text-xs font-medium text-slate-500 whitespace-nowrap">Date</th>
                <th className="px-2 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Head of Account</th>
                <th className="px-2 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Cheque No</th>
                <th className="px-2 py-2 text-xs font-medium text-slate-500 text-right whitespace-nowrap">Amount</th>
                <th className="py-2 pl-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} compact />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

export function NewEntryPage() {
  const { settings } = useSettings();
  const { addToast } = useToast();
  const [form, setForm] = useState<EntryFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const { entries, loading } = useEntries(
    settings.activeFinancialYear,
    settings.activeCashBookType
  );

  // Last 10 entries by createdAt descending (covers newly created & edited)
  const recentEntries = useMemo(
    () =>
      [...entries]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10),
    [entries]
  );

  const recentReceipts  = useMemo(() => recentEntries.filter((e) => e.type === 'Receipt'), [recentEntries]);
  const recentPayments  = useMemo(() => recentEntries.filter((e) => e.type === 'Payment'), [recentEntries]);
  const totalR = useMemo(() => recentReceipts.reduce((s, e) => s + e.amount, 0), [recentReceipts]);
  const totalP = useMemo(() => recentPayments.reduce((s, e) => s + e.amount, 0), [recentPayments]);

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
      addToast(err instanceof Error ? err.message : 'Failed to save entry', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: EntryType[] = ['Receipt', 'Payment'];

  return (
    <div className="w-full pt-6 animate-fade-in space-y-6">

      {/* ── Entry form ── */}
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">

        {/* Receipt / Payment toggle — full width */}
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => set('type', tab)}
              className={cn(
                'flex-1 rounded-md py-2 text-sm font-medium transition-all',
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

        {/* Row 1: Date + Cheque No */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="sm:col-span-1">
            <DateInput
              label="Date"
              id="entry-date"
              value={form.date}
              onChange={(iso) => set('date', iso)}
              error={errors.date}
            />
          </div>
          <div className="sm:col-span-1">
            <Input
              label="Cheque No"
              id="entry-cheque"
              type="text"
              placeholder="Optional"
              value={form.chequeNo}
              onChange={(e) => set('chequeNo', e.target.value)}
            />
          </div>
          <div className="sm:col-span-1">
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
          </div>
          <div className="sm:col-span-1">
            <Input
              label="Head of Account"
              id="entry-hoa"
              type="text"
              placeholder="E.g. Tuition Fee"
              value={form.headOfAccount}
              onChange={(e) => set('headOfAccount', toProperCase(e.target.value))}
              error={errors.headOfAccount}
            />
          </div>
        </div>

        {/* Notes + Submit */}
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <Textarea
              label="Notes"
              id="entry-notes"
              placeholder="Optional remarks..."
              value={form.notes}
              onChange={(e) => set('notes', toProperCase(e.target.value))}
            />
          </div>
          <Button
            type="submit"
            loading={submitting}
            className="shrink-0 h-[74px] px-8 self-end"
          >
            Add {form.type}
          </Button>
        </div>

      </form>

      {/* ── Recent Entries ── */}
      <div className="space-y-2">
        {/* Section label */}
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-slate-600">Recent Entries</span>
          {!loading && recentEntries.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              last {recentEntries.length}
            </span>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {settings.activeFinancialYear} · {settings.activeCashBookType}
          </span>
        </div>

        {/* Split columns */}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <EntrySkeleton rows={5} />
          </div>
        ) : recentEntries.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400 shadow-sm">
            No entries yet — add your first one above.
          </div>
        ) : (
          <div className="flex gap-4 items-start">
            <RecentSplitPanel entries={recentReceipts} type="Receipt" total={totalR} />
            <RecentSplitPanel entries={recentPayments} type="Payment" total={totalP} />
          </div>
        )}
      </div>

    </div>
  );
}
