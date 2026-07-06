import { useState } from 'react';
import { DateInput } from '@/components/ui/DateInput';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { apiCreateClearedBillBatch } from '@/api/clearedBillBatches';
import { formatCurrency } from '@/utils/formatCurrency';
import type { CashBookType } from '@smp-cashbook/shared';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface ClearBillsModalProps {
  billIds: string[];
  totalAmount: number;
  financialYear: string;
  cashBookType: CashBookType;
  onClose: () => void;
  onCleared: () => void;
}

export function ClearBillsModal({ billIds, totalAmount, financialYear, cashBookType, onClose, onCleared }: ClearBillsModalProps) {
  const { addToast } = useToast();
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const count = billIds.length;

  const handleConfirm = async () => {
    if (!date) return;
    setSaving(true);
    try {
      await apiCreateClearedBillBatch({ billIds, date, financialYear, cashBookType });
      onCleared();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to clear bills', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!saving ? onClose : undefined} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">
            <svg className="h-4.5 w-4.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Mark {count} {count === 1 ? 'bill' : 'bills'} as cleared?
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Total <span className="font-medium text-slate-700">{formatCurrency(totalAmount)}</span>.
              This will be saved as a cleared batch you can look back on.
            </p>
          </div>
        </div>

        <div className="px-5 pb-4">
          <DateInput
            label="Clearance Date"
            id="clear-bills-date"
            value={date}
            onChange={setDate}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-8 rounded-md border border-slate-200 bg-white px-4 text-xs font-medium
              text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <Button size="sm" onClick={handleConfirm} loading={saving} disabled={!date}>
            Confirm Clearance
          </Button>
        </div>
      </div>
    </div>
  );
}
