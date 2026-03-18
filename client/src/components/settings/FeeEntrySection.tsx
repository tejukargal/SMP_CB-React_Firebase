import { useState } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { apiCreateEntry } from '@/api/entries';
import { todayISO } from '@/utils/formatDate';
import { formatCurrency } from '@/utils/formatCurrency';
import { toProperCase } from '@smp-cashbook/shared';

// ── Fee heads in display order ─────────────────────────────────────────────────

const FEE_HEADS = [
  'Adm Fee',
  'Tution Fee',
  'RR Fee',
  'Ass Fee',
  'Sports Fee',
  'Mag Fee',
  'Id Fee',
  'Lib Fee',
  'Lab Fee',
  'Dvp Fee',
  'Swf Fee',
  'Twf Fee',
  'Nss Fee',
  'Fine Fee',
] as const;

// ── Notes transformation ───────────────────────────────────────────────────────

/** Receipt range pattern: "5890-5895" or "5890 - 5895" */
const RECEIPT_RANGE_RE = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/;

/**
 * If the user typed a receipt-number range (e.g. "5890-5895") transform it to
 * the canonical note.  Otherwise return the raw text unchanged.
 */
function buildNotes(raw: string): string {
  const m = RECEIPT_RANGE_RE.exec(raw.trim());
  if (m) {
    return `College Fee Collection, Rpt No From: ${m[1]} To: ${m[2]}`;
  }
  return raw.trim();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyAmounts(): Record<string, string> {
  return Object.fromEntries(FEE_HEADS.map(h => [h, '']));
}

// ── Row component ─────────────────────────────────────────────────────────────

function FeeRow({ head, value, onChange }: {
  head: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
      <span className="text-[11px] text-slate-600 min-w-0 flex-1 truncate">{head}</span>
      <div className="flex items-center gap-0.5 shrink-0">
        <span className="text-[10px] text-slate-400">₹</span>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="—"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-6 w-24 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-right
            text-slate-700 focus:outline-none focus:ring-1 focus:ring-green-300
            placeholder:text-slate-300 tabular-nums"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function FeeEntrySection() {
  const { settings } = useSettings();
  const { addToast } = useToast();

  const [date,       setDate]       = useState(todayISO());
  const [cheque,     setCheque]     = useState('Cash');
  const [notesRaw,   setNotesRaw]   = useState('');
  const [amounts,    setAmounts]    = useState<Record<string, string>>(emptyAmounts());
  const [submitting, setSubmitting] = useState(false);

  const total = FEE_HEADS.reduce((s, h) => s + (parseFloat(amounts[h]) || 0), 0);

  // Preview note as the user types
  const notesPreview = notesRaw.trim() ? buildNotes(notesRaw) : '';

  const reset = () => {
    setDate(todayISO());
    setCheque('Cash');
    setNotesRaw('');
    setAmounts(emptyAmounts());
  };

  const handleSubmit = async () => {
    if (!date) {
      addToast('Please select a date', 'error');
      return;
    }
    if (!notesRaw.trim()) {
      addToast('Please enter a receipt number or notes', 'error');
      return;
    }
    if (settings.activeCashBookType === 'Both') {
      addToast('Switch to Aided or Un-Aided to add fee entries', 'error');
      return;
    }

    const notes          = buildNotes(notesRaw);
    const canonicalCheque = cheque.trim();
    const fy             = settings.activeFinancialYear;
    const cbType         = settings.activeCashBookType;

    type Payload = Parameters<typeof apiCreateEntry>[0];
    const entries: Payload[] = [];

    for (const h of FEE_HEADS) {
      const amt = parseFloat(amounts[h]);
      if (!isNaN(amt) && amt > 0) {
        entries.push({
          date,
          chequeNo: canonicalCheque,
          amount: amt,
          headOfAccount: h,
          notes,
          type: 'Receipt',
          financialYear: fy,
          cashBookType: cbType,
        });
      }
    }

    if (entries.length === 0) {
      addToast('No amounts entered — nothing to save', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(entries.map(e => apiCreateEntry(e)));
      addToast(
        `${entries.length} fee ${entries.length === 1 ? 'entry' : 'entries'} saved`,
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
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Cheque No / Mode</label>
            <input
              type="text"
              value={cheque}
              onChange={e => setCheque(toProperCase(e.target.value))}
              placeholder="e.g. 123456 or Cash"
              className="h-8 w-36 rounded-md border border-slate-200 bg-white px-2.5 text-xs
                text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300
                placeholder:text-slate-300"
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Receipt No / Notes
              <span className="ml-1 text-slate-300 font-normal">(e.g. 5890-5895)</span>
            </label>
            <input
              type="text"
              value={notesRaw}
              onChange={e => setNotesRaw(e.target.value)}
              placeholder="e.g. 5890-5895 or custom notes"
              className="w-full h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs
                text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300
                placeholder:text-slate-300"
            />
            {notesPreview && notesPreview !== notesRaw.trim() && (
              <p className="mt-0.5 text-[10px] text-blue-500 truncate">
                Will save as: <span className="font-medium">{notesPreview}</span>
              </p>
            )}
          </div>
        </div>

        {/* ── Fee heads — two columns ── */}
        <div>
          <div className="bg-green-50 border-b border-green-100 px-3 py-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-green-700 uppercase tracking-wider">
              Fee Receipts
            </span>
            <span className="text-[10px] text-slate-400">₹ amount per head</span>
          </div>

          <div className="grid grid-cols-2 divide-x divide-slate-100">
            {/* Left column: first 7 heads */}
            <div className="divide-y divide-slate-100">
              {FEE_HEADS.slice(0, 7).map(h => (
                <FeeRow key={h} head={h} value={amounts[h]}
                  onChange={v => setAmounts(prev => ({ ...prev, [h]: v }))} />
              ))}
            </div>
            {/* Right column: remaining 7 heads */}
            <div className="divide-y divide-slate-100">
              {FEE_HEADS.slice(7).map(h => (
                <FeeRow key={h} head={h} value={amounts[h]}
                  onChange={v => setAmounts(prev => ({ ...prev, [h]: v }))} />
              ))}
            </div>
          </div>

          <div className="bg-green-50/60 border-t border-green-100 px-3 py-1.5 flex justify-between items-center">
            <span className="text-[11px] font-semibold text-green-700">Total</span>
            <span className="text-[11px] font-semibold text-green-700 tabular-nums">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        {/* ── Action bar ── */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400 truncate">
            {notesPreview
              ? <>
                  <span className="font-medium text-slate-600">{notesPreview}</span>
                  {' · '}{date}
                  {cheque && <>{' · '}{cheque}</>}
                </>
              : 'Enter receipt number or notes above'}
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
              className="h-8 rounded-md bg-green-600 px-5 text-xs font-semibold text-white
                hover:bg-green-700 active:bg-green-800 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Saving…' : 'Save Fee Entries'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
