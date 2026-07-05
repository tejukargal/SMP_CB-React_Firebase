import { memo, useState } from 'react';
import { PendingBillDetailModal } from './PendingBillDetailModal';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { useToast } from '@/context/ToastContext';
import { apiUpdatePendingBill } from '@/api/pendingBills';
import type { PendingBill } from '@smp-cashbook/shared';

interface PendingBillRowProps {
  bill: PendingBill;
  slNo: number;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
}

export const PendingBillRow = memo(function PendingBillRow({
  bill,
  slNo,
  selectMode = false,
  selected = false,
  onToggle,
}: PendingBillRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const { addToast } = useToast();
  const isCleared = bill.status === 'Cleared';

  const handleToggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setToggling(true);
    try {
      const nextStatus = isCleared ? 'Pending' : 'Cleared';
      await apiUpdatePendingBill(bill.id, bill.financialYear, bill.cashBookType, { status: nextStatus });
      addToast(nextStatus === 'Cleared' ? 'Bill marked as cleared' : 'Bill reopened', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to update status', 'error');
    } finally {
      setToggling(false);
    }
  };

  return (
    <>
      <tr
        onClick={selectMode ? () => onToggle?.(bill.id) : undefined}
        onDoubleClick={!selectMode ? () => setDetailOpen(true) : undefined}
        className={`border-b border-slate-100 transition-colors cursor-pointer align-top
          ${selectMode
            ? selected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50'
            : 'hover:bg-slate-50'
          }`}
      >
        {selectMode && (
          <td className="pl-3 pr-1 py-3.5">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle?.(bill.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer
                focus:ring-1 focus:ring-blue-400"
            />
          </td>
        )}

        <td className="py-3.5 pl-4 pr-1 text-xs text-slate-400 whitespace-nowrap overflow-hidden">
          {slNo}
        </td>
        <td className="py-3.5 px-2 text-xs text-slate-600 whitespace-nowrap overflow-hidden">
          {formatDate(bill.date)}
        </td>
        <td className="px-2 py-3.5 text-sm text-slate-700 truncate">
          {bill.bank || '—'}
        </td>
        <td className="px-2 py-3.5 text-xs text-slate-500 whitespace-nowrap overflow-hidden">
          {bill.chqNoOrCash || '—'}
        </td>
        <td className="pl-2 pr-4 py-3.5 text-sm font-medium text-right whitespace-nowrap overflow-hidden text-slate-900">
          {formatCurrency(bill.amount)}
        </td>
        <td className="px-2 py-3.5 text-sm text-slate-800 truncate">
          {bill.headOfAccount}
        </td>
        <td className="px-2 py-3.5 text-sm text-slate-800 truncate">
          {bill.firmName}
        </td>
        <td className="px-2 py-3.5 text-xs text-slate-500 truncate">
          {bill.billNumber}
        </td>
        <td className="px-2 py-3.5 text-xs text-slate-600 whitespace-nowrap overflow-hidden">
          {formatDate(bill.billDate)}
        </td>
        <td className="px-2 py-3.5 text-xs text-slate-400 truncate" title={bill.particulars || undefined}>
          {bill.particulars || '—'}
        </td>
        <td className="px-2 py-3.5 whitespace-nowrap overflow-hidden">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            isCleared ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {bill.status}
          </span>
        </td>
        <td className="px-2 py-3.5 whitespace-nowrap overflow-hidden">
          <button
            type="button"
            onClick={handleToggleStatus}
            disabled={toggling}
            className={`rounded-md px-2.5 py-1 text-xs font-medium border transition-colors disabled:opacity-50 ${
              isCleared
                ? 'border-slate-200 bg-white text-slate-500 hover:border-amber-300 hover:text-amber-600'
                : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300'
            }`}
          >
            {isCleared ? 'Reopen' : 'Mark Cleared'}
          </button>
        </td>
      </tr>

      {detailOpen && (
        <PendingBillDetailModal bill={bill} onClose={() => setDetailOpen(false)} />
      )}
    </>
  );
});
