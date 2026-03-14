import { useState } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { apiCreateEntry } from '@/api/entries';
import { todayISO } from '@/utils/formatDate';
import { formatCurrency } from '@/utils/formatCurrency';
import { toProperCase } from '@smp-cashbook/shared';
import {
  RECEIPT_SALARY_HEADS,
  RECEIPT_LABELS,
} from '@/utils/salaryRegister';

const RH = RECEIPT_SALARY_HEADS as readonly string[];

// Deduction receipt heads (everything except the main grant)
const DEDUCTION_HEADS = RH.filter(h => h !== 'Govt Salary Grants');

const RECEIVABLE_HEAD = 'Salary Receivable';

// ── Note generation ───────────────────────────────────────────────────────────

const MONTH_EXPAND: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March',   apr: 'April',
  may: 'May',     jun: 'June',     jul: 'July',     aug: 'August',
  sep: 'September', oct: 'October', nov: 'November', dec: 'December',
};

/** Expands abbreviated month names, e.g. "Mar 26" → "March 26" */
function expandMonth(input: string): string {
  return input.replace(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/gi,
    m => MONTH_EXPAND[m.toLowerCase().slice(0, 3)] ?? m,
  );
}

const HEAD_NOTES: Record<string, (p: string) => string> = {
  'govt salary grants':  p => `Rcvd Staff Salary Grants For The Month Of ${p}`,
  'lic':                 p => `Staff Lic Deduction For ${p}`,
  'i tax':               p => `Staff I Tax Deduction For ${p}`,
  'p tax':               p => `Staff P Tax Deduction For ${p}`,
  'gslic':               p => `Staff Gslic Deduction For ${p}`,
  'fbf':                 p => `Staff Fbf Deduction For ${p}`,
  'govt salary acct':    p => `Disbursed Staff Salary For ${p}`,
  'salary receivable':   p => `Staff Salary Deductions Receivable For ${p}`,
};

function noteFor(head: string, period: string): string {
  const fn = HEAD_NOTES[head.toLowerCase()];
  return toProperCase(fn ? fn(period) : `${head} ${period}`);
}

// ─────────────────────────────────────────────────────────────────────────────

function emptyAmounts(heads: readonly string[]): Record<string, string> {
  return Object.fromEntries(heads.map(h => [h, '']));
}

export function SalaryEntrySection() {
  const { settings } = useSettings();
  const { addToast } = useToast();

  const [date,    setDate]    = useState(todayISO());
  const [cheque,  setCheque]  = useState('Neft');
  const [notes,   setNotes]   = useState('');
  const [receiptAmts, setReceiptAmts] = useState<Record<string, string>>(emptyAmounts(RH));
  const [salaryAcctAmt, setSalaryAcctAmt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Receivable = sum of all receipt deductions (auto, no separate input)
  const deductionsTotal = DEDUCTION_HEADS.reduce(
    (s, h) => s + (parseFloat(receiptAmts[h]) || 0), 0,
  );

  const totalR = RH.reduce((s, h) => s + (parseFloat(receiptAmts[h]) || 0), 0);
  const totalP = (parseFloat(salaryAcctAmt) || 0) + deductionsTotal;

  const reset = () => {
    setDate(todayISO());
    setCheque('Neft');
    setNotes('');
    setReceiptAmts(emptyAmounts(RH));
    setSalaryAcctAmt('');
  };

  const handleSubmit = async () => {
    if (!notes.trim()) {
      addToast('Please enter notes (e.g. "Salary March 25")', 'error');
      return;
    }
    if (!date) {
      addToast('Please select a date', 'error');
      return;
    }

    const period          = toProperCase(expandMonth(notes.trim()));
    const canonicalCheque = cheque.trim() || 'Neft';
    const fy     = settings.activeFinancialYear;
    const cbType = settings.activeCashBookType;

    type Payload = Parameters<typeof apiCreateEntry>[0];
    const entries: Payload[] = [];

    // Receipt entries — all non-zero heads
    for (const h of RH) {
      const amt = parseFloat(receiptAmts[h]);
      if (!isNaN(amt) && amt > 0) {
        entries.push({ date, chequeNo: canonicalCheque, amount: amt,
          headOfAccount: h, notes: noteFor(h, period),
          type: 'Receipt', financialYear: fy, cashBookType: cbType });
      }
    }

    // Payment: Govt Salary Acct
    const salaryAmt = parseFloat(salaryAcctAmt);
    if (!isNaN(salaryAmt) && salaryAmt > 0) {
      entries.push({ date, chequeNo: canonicalCheque, amount: salaryAmt,
        headOfAccount: 'Govt Salary Acct', notes: noteFor('Govt Salary Acct', period),
        type: 'Payment', financialYear: fy, cashBookType: cbType });
    }

    // Payment: Salary Deductions Receivable (auto-total of deductions)
    if (deductionsTotal > 0) {
      entries.push({ date, chequeNo: canonicalCheque, amount: deductionsTotal,
        headOfAccount: RECEIVABLE_HEAD, notes: noteFor(RECEIVABLE_HEAD, period),
        type: 'Payment', financialYear: fy, cashBookType: cbType });
    }

    if (entries.length === 0) {
      addToast('No amounts entered — nothing to save', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(entries.map(e => apiCreateEntry(e)));
      addToast(
        `${entries.length} salary ${entries.length === 1 ? 'entry' : 'entries'} saved`,
        'success',
      );
      reset();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to save entries', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="rounded-lg border border-slate-200 bg-white overflow-clip">

        {/* ── Shared fields ── */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Salary Month</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Mar 26"
              className="w-full h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs
                text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300
                placeholder:text-slate-300"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs
                text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Cheque / Mode</label>
            <input
              type="text"
              value={cheque}
              onChange={e => setCheque(e.target.value)}
              className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2.5 text-xs
                text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
        </div>

        {/* ── Two columns ── */}
        <div className="grid grid-cols-2 divide-x divide-slate-200">

          {/* Receipts */}
          <div className="flex flex-col">
            <div className="bg-green-50 border-b border-green-100 px-3 py-1.5">
              <span className="text-[11px] font-semibold text-green-700 uppercase tracking-wider">Receipts</span>
            </div>
            <div className="divide-y divide-slate-100">
              {RH.map(h => (
                <div key={h} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-xs text-slate-600 min-w-0 flex-1">{RECEIPT_LABELS[h]}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-slate-400">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={receiptAmts[h]}
                      onChange={e => setReceiptAmts(prev => ({ ...prev, [h]: e.target.value }))}
                      className="h-7 w-28 rounded border border-slate-200 bg-white px-2 text-xs text-right
                        text-slate-700 focus:outline-none focus:ring-1 focus:ring-green-300
                        placeholder:text-slate-300 tabular-nums"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-auto bg-green-50/60 border-t border-green-100 px-3 py-1.5 flex justify-between items-center">
              <span className="text-[11px] font-semibold text-green-700">Total</span>
              <span className="text-[11px] font-semibold text-green-700 tabular-nums">{formatCurrency(totalR)}</span>
            </div>
          </div>

          {/* Payments */}
          <div className="flex flex-col">
            <div className="bg-red-50 border-b border-red-100 px-3 py-1.5">
              <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wider">Payments</span>
            </div>

            <div className="divide-y divide-slate-100">

              {/* Govt Salary Acct — manual */}
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-xs text-slate-600 min-w-0 flex-1">Salary Acct</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-slate-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={salaryAcctAmt}
                    onChange={e => setSalaryAcctAmt(e.target.value)}
                    className="h-7 w-28 rounded border border-slate-200 bg-white px-2 text-xs text-right
                      text-slate-700 focus:outline-none focus:ring-1 focus:ring-red-300
                      placeholder:text-slate-300 tabular-nums"
                  />
                </div>
              </div>

              {/* Salary Deductions Receivable — auto-calculated */}
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50/60">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-600">Salary Receivable</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Auto · LIC + I Tax + P Tax + GSLIC + FBF
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-500 tabular-nums shrink-0">
                  {deductionsTotal > 0 ? formatCurrency(deductionsTotal) : '—'}
                </span>
              </div>

            </div>

            <div className="mt-auto bg-red-50/60 border-t border-red-100 px-3 py-1.5 flex justify-between items-center">
              <span className="text-[11px] font-semibold text-red-700">Total</span>
              <span className="text-[11px] font-semibold text-red-700 tabular-nums">{formatCurrency(totalP)}</span>
            </div>
          </div>

        </div>

        {/* ── Action bar ── */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400 truncate">
            {notes.trim()
              ? <>
                  <span className="font-medium text-slate-600">
                    {toProperCase(expandMonth(notes.trim()))}
                  </span>
                  {' · '}{date}{' · '}{cheque || 'Neft'}
                  <span className="ml-2 text-slate-300">·</span>
                  <span className="ml-2 italic">notes auto-generated per head</span>
                </>
              : 'Enter salary month above (e.g. Mar 26) to auto-generate notes'}
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={reset}
              disabled={submitting}
              className="h-8 rounded-md border border-dashed border-slate-300 bg-white px-4 text-xs
                font-medium text-slate-400 hover:border-slate-400 hover:text-slate-600
                disabled:opacity-50 transition-colors"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="h-8 rounded-md bg-blue-600 px-5 text-xs font-semibold text-white
                hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Saving…' : 'Save Salary Entries'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
