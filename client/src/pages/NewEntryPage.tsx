import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/utils/cn';
import { Input } from '@/components/ui/Input';
import { DateInput } from '@/components/ui/DateInput';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { apiCreateEntry } from '@/api/entries';
import { toProperCase } from '@smp-cashbook/shared';
import { todayISO, formatDate } from '@/utils/formatDate';
import { formatCurrency } from '@/utils/formatCurrency';
import { useEntries } from '@/hooks/useEntries';
import { EntryRow } from '@/components/entries/EntryRow';
import { EntrySkeleton } from '@/components/entries/EntrySkeleton';
import type { Entry, EntryType, EntryFormData } from '@smp-cashbook/shared';

// ── Autocomplete dropdown ──────────────────────────────────────────────────────

function SuggestDropdown({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (v: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <ul className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
      {suggestions.map((s) => (
        <li key={s}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 truncate transition-colors"
          >
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Date-grouped recent view ───────────────────────────────────────────────────

/** Compact table header shared by receipt and payment panels */
function CompactHead() {
  return (
    <>
      <colgroup>
        <col className="w-[90px]" />
        <col />
        <col className="w-[100px]" />
        <col className="w-[120px]" />
      </colgroup>
      <thead>
        <tr className="border-b border-slate-100 bg-white">
          <th className="py-2 pl-4 pr-2 text-xs font-medium text-slate-500 whitespace-nowrap">Date</th>
          <th className="px-2 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Head of Account</th>
          <th className="px-2 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">Cheque No</th>
          <th className="pl-2 pr-4 py-2 text-xs font-medium text-slate-500 text-right whitespace-nowrap">Amount</th>
        </tr>
      </thead>
    </>
  );
}

/** One receipt or payment panel for a single date group */
function DatePanel({ entries, type }: { entries: Entry[]; type: 'Receipt' | 'Payment' }) {
  const isReceipt = type === 'Receipt';
  return (
    <div className="flex flex-col min-w-0">
      {/* Coloured mini-header */}
      <div className={`flex items-center rounded-t-lg border-x border-t px-3 py-1.5
        ${isReceipt ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
      >
        <span className={`text-xs font-semibold uppercase tracking-wide
          ${isReceipt ? 'text-green-700' : 'text-red-700'}`}
        >
          {type}s
        </span>
      </div>
      {/* Rows — no bottom border (totals bar closes it) */}
      <div className={`flex-1 border-x ${isReceipt ? 'border-green-200' : 'border-red-200'}`}>
        {entries.length > 0 ? (
          <table className="w-full text-left text-sm table-fixed">
            <CompactHead />
            <tbody>
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} compact colorAmount={false} />
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

// ─────────────────────────────────────────────────────────────────────────────

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

const RECENT_DATE_COUNT = 5;

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

  // ── Date-grouped recent entries (all entries, sorted by date asc) ──────────

  const allSorted = useMemo(
    () => [...entries].sort((a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
    ),
    [entries]
  );

  // Last N distinct dates that have entries (returned in chronological order)
  const recentDates = useMemo(() => {
    const seen = new Set<string>();
    const dates: string[] = [];
    for (let i = allSorted.length - 1; i >= 0; i--) {
      const d = allSorted[i].date;
      if (!seen.has(d)) { seen.add(d); dates.unshift(d); }
      if (dates.length === RECENT_DATE_COUNT) break;
    }
    return dates;
  }, [allSorted]);

  // Running balance before the first recent date (from ALL entries)
  const openingBeforeRecent = useMemo(() => {
    if (recentDates.length === 0) return 0;
    const firstDate = recentDates[0];
    return allSorted
      .filter((e) => e.date < firstDate)
      .reduce((s, e) => s + (e.type === 'Receipt' ? e.amount : -e.amount), 0);
  }, [allSorted, recentDates]);

  // Per-date groups with opening/closing balances
  const recentGroups = useMemo(() => {
    const dateSet = new Set(recentDates);
    // bucket entries into their date
    const byDate = new Map<string, Entry[]>(recentDates.map((d) => [d, []]));
    for (const e of allSorted) {
      if (dateSet.has(e.date)) byDate.get(e.date)!.push(e);
    }
    let running = openingBeforeRecent;
    return recentDates.map((date) => {
      const dateEntries = byDate.get(date)!;
      const openingBalance = running;
      const dayR = dateEntries.filter((e) => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
      const dayP = dateEntries.filter((e) => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
      const closingBalance = openingBalance + dayR - dayP;
      running = closingBalance;
      return { date, dateEntries, openingBalance, closingBalance, dayR, dayP };
    });
  }, [allSorted, recentDates, openingBeforeRecent]);

  // ── Autocomplete data ──────────────────────────────────────────────────────

  const typeEntries = useMemo(
    () => [...entries]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((e) => e.type === form.type),
    [entries, form.type]
  );

  const hoaSuggestions = useMemo(() => {
    const q = form.headOfAccount.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of typeEntries) {
      if (!seen.has(e.headOfAccount) && e.headOfAccount.toLowerCase().includes(q)) {
        seen.add(e.headOfAccount);
        result.push(e.headOfAccount);
        if (result.length === 2) break;
      }
    }
    return result;
  }, [typeEntries, form.headOfAccount]);

  const getMostRecentNote = useCallback(
    (head: string) => typeEntries.find((e) => e.headOfAccount === head)?.notes ?? '',
    [typeEntries]
  );

  const notesSuggestions = useMemo(() => {
    const q = form.notes.trim().toLowerCase();
    if (!q) return [];
    const pool = form.headOfAccount.trim()
      ? typeEntries.filter((e) => e.headOfAccount === form.headOfAccount.trim())
      : typeEntries;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of pool) {
      if (e.notes && !seen.has(e.notes) && e.notes.toLowerCase().includes(q)) {
        seen.add(e.notes);
        result.push(e.notes);
        if (result.length === 2) break;
      }
    }
    return result;
  }, [typeEntries, form.notes, form.headOfAccount]);

  const [hoaOpen, setHoaOpen]     = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const selectHoa = (head: string) => {
    set('headOfAccount', head);
    set('notes', getMostRecentNote(head));
    setHoaOpen(false);
  };

  const selectNote = (note: string) => {
    set('notes', note);
    setNotesOpen(false);
  };

  // ──────────────────────────────────────────────────────────────────────────

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

        {/* Receipt / Payment toggle */}
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

        {/* Row 1: Date + Cheque No + Amount + Head of Account */}
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
          <div className="sm:col-span-1 relative">
            <Input
              label="Head of Account"
              id="entry-hoa"
              type="text"
              placeholder="E.g. Tuition Fee"
              value={form.headOfAccount}
              onChange={(e) => { set('headOfAccount', toProperCase(e.target.value)); setHoaOpen(true); }}
              onFocus={() => setHoaOpen(true)}
              onBlur={() => setHoaOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setHoaOpen(false); }}
              error={errors.headOfAccount}
              autoComplete="off"
            />
            {hoaOpen && <SuggestDropdown suggestions={hoaSuggestions} onSelect={selectHoa} />}
          </div>
        </div>

        {/* Notes + Submit */}
        <div className="flex gap-4 items-end">
          <div className="flex-1 relative">
            <Textarea
              label="Notes"
              id="entry-notes"
              placeholder="Optional remarks..."
              value={form.notes}
              onChange={(e) => { set('notes', toProperCase(e.target.value)); setNotesOpen(true); }}
              onFocus={() => setNotesOpen(true)}
              onBlur={() => setNotesOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setNotesOpen(false); }}
            />
            {notesOpen && <SuggestDropdown suggestions={notesSuggestions} onSelect={selectNote} />}
          </div>
          <div className="shrink-0 self-end flex flex-col gap-2">
            <Button
              type="submit"
              loading={submitting}
              className="h-[38px] px-8"
            >
              Add {form.type}
            </Button>
            <button
              type="button"
              onClick={() => { setForm({ ...EMPTY_FORM, type: form.type, date: todayISO() }); setErrors({}); }}
              className="h-[28px] rounded-md border border-slate-200 bg-white px-4 text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

      </form>

      {/* ── Recent Entries (by date) ── */}
      <div className="space-y-2">

        {/* Section header */}
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-slate-600">Recent Entries</span>
          {!loading && recentDates.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              last {recentDates.length} {recentDates.length === 1 ? 'date' : 'dates'}
            </span>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {settings.activeFinancialYear} · {settings.activeCashBookType}
          </span>
        </div>

        {/* Content */}
        {loading ? (
          <div className="rounded-lg border border-slate-200 p-3">
            <EntrySkeleton />
          </div>
        ) : recentDates.length === 0 ? (
          <div className="rounded-lg border border-slate-200 py-16 text-center text-sm text-slate-400">
            No entries yet — add your first one above.
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {recentGroups.map(({ date, dateEntries, openingBalance, closingBalance, dayR, dayP }) => {
              const receipts = dateEntries.filter((e) => e.type === 'Receipt');
              const payments = dateEntries.filter((e) => e.type === 'Payment');
              const receiptGrandTotal = openingBalance + dayR;
              const paymentGrandTotal = dayP + closingBalance;

              return (
                <div key={date} className="grid grid-cols-2 gap-x-4">

                  {/* Row 1: date bar + opening balance */}
                  <div className={`mb-2 flex items-center justify-between rounded-lg border px-3 py-1.5
                    ${openingBalance > 0
                      ? 'border-blue-100 bg-blue-50/60'
                      : 'border-slate-200 bg-slate-50'}`}
                  >
                    <span className={`text-xs font-semibold
                      ${openingBalance > 0 ? 'text-slate-700' : 'text-slate-600'}`}
                    >
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

                  {/* Row 2: receipt panel | payment panel */}
                  <DatePanel entries={receipts} type="Receipt" />
                  <DatePanel entries={payments} type="Payment" />

                  {/* Row 3: receipt totals | payment totals + closing balance */}
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
                          {formatCurrency(Math.abs(closingBalance))}{closingBalance < 0 ? ' (Dr)' : ''}
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
        )}

      </div>

    </div>
  );
}
