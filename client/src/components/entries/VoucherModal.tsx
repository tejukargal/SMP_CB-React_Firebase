import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { apiUpdateEntry } from '@/api/entries';
import { useToast } from '@/context/ToastContext';
import { formatDate } from '@/utils/formatDate';
import { formatCurrency } from '@/utils/formatCurrency';
import type { Entry } from '@smp-cashbook/shared';

// ── Voucher serial helpers ─────────────────────────────────────────────────────

/** "2025-26" → "25-26" */
function fyShort(fy: string): string {
  const m = fy.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1].slice(2)}-${m[2]}` : fy;
}

/** Find the next unused voucher serial for the given FY across all entries. */
export function nextVoucherNo(allEntries: Entry[], financialYear: string): string {
  const prefix = `${fyShort(financialYear)}_`;
  let max = 0;
  for (const e of allEntries) {
    if (!e.voucherNo?.startsWith(prefix)) continue;
    const n = parseInt(e.voucherNo.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  entry:      Entry;
  allEntries: Entry[];
  onClose:    () => void;
}

export function VoucherModal({ entry, allEntries, onClose }: Props) {
  const { addToast } = useToast();

  const suggested = nextVoucherNo(allEntries, entry.financialYear);
  const [value,   setValue]   = useState(entry.voucherNo ?? suggested);
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus + select on open; close on Escape
  useEffect(() => {
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await apiUpdateEntry(entry.id, entry.financialYear, entry.cashBookType, {
        voucherNo: trimmed,
      });
      addToast('Voucher number assigned', 'success');
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to assign voucher', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await apiUpdateEntry(entry.id, entry.financialYear, entry.cashBookType, {
        voucherNo: '',
      });
      addToast('Voucher number removed', 'success');
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to remove voucher', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-xl animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between rounded-t-xl border-b border-slate-100 bg-slate-50 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">Assign Voucher No</span>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Entry summary */}
        <div className="border-b border-slate-100 bg-red-50/40 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">{formatDate(entry.date)}</p>
              <p className="mt-0.5 text-sm font-medium text-slate-800 truncate">{entry.headOfAccount}</p>
              {entry.chequeNo && (
                <p className="mt-0.5 text-xs text-slate-400">Cheque: {entry.chequeNo}</p>
              )}
            </div>
            <span className="shrink-0 text-sm font-bold text-red-700">{formatCurrency(entry.amount)}</span>
          </div>
        </div>

        {/* Input */}
        <div className="px-4 py-4">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Voucher Number
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder={suggested}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-mono
              tracking-wide text-slate-800 placeholder:text-slate-300
              focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          />
          {entry.voucherNo && (
            <p className="mt-1.5 text-xs text-slate-400">
              Current:&nbsp;
              <span className="font-mono font-semibold text-amber-600">{entry.voucherNo}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            Next available:&nbsp;
            <span className="font-mono text-slate-500">{suggested}</span>
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <div>
            {entry.voucherNo && (
              <Button size="sm" variant="danger" onClick={handleRemove} loading={saving}>
                Remove
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={!value.trim()}
            >
              Assign
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
