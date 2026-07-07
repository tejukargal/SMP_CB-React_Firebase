import { memo, useState } from 'react';
import { PendingBillDetailModal } from './PendingBillDetailModal';
import { ClearBillsModal } from './ClearBillsModal';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { formatPaymentMode } from '@/utils/formatPaymentMode';
import { useToast } from '@/context/ToastContext';
import { apiUpdatePendingBill } from '@/api/pendingBills';
import type { PendingBill } from '@smp-cashbook/shared';

interface PendingBillRowProps {
  bill: PendingBill;
  slNo: number;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
  showStatusDate?: boolean;
  /** Hides the Bank, Payment, and Actions columns — used by the compact "recent bills" preview */
  compact?: boolean;
}

export const PendingBillRow = memo(function PendingBillRow({
  bill,
  slNo,
  selectMode = false,
  selected = false,
  onToggle,
  showStatusDate = false,
  compact = false,
}: PendingBillRowProps) {
  const statusDate = bill.status === 'Approved' ? bill.approvedAt : bill.clearedAt;
  const [detailOpen, setDetailOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const { addToast } = useToast();
  const isPending  = bill.status === 'Pending';
  const isApproved = bill.status === 'Approved';

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setToggling(true);
    try {
      await apiUpdatePendingBill(bill.id, bill.financialYear, bill.cashBookType, { status: 'Approved' });
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to approve bill', 'error');
    } finally {
      setToggling(false);
    }
  };

  const handleReopen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setToggling(true);
    try {
      await apiUpdatePendingBill(bill.id, bill.financialYear, bill.cashBookType, { status: 'Pending' });
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to reopen bill', 'error');
    } finally {
      setToggling(false);
    }
  };

  const hasParticulars = !!bill.particulars;
  const rowInteraction = {
    onClick: selectMode ? () => onToggle?.(bill.id) : undefined,
    onDoubleClick: !selectMode ? () => setDetailOpen(true) : undefined,
  };
  const rowBg = selectMode
    ? selected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50'
    : 'hover:bg-slate-50';

  return (
    <>
      <tr
        {...rowInteraction}
        className={`transition-colors cursor-pointer align-top
          ${hasParticulars ? '' : 'border-b border-slate-100'} ${rowBg}`}
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
        {!compact && (
          <>
            <td className="px-2 py-3.5 text-sm text-slate-700 truncate">
              {bill.bank || '—'}
            </td>
            <td className="px-2 py-3.5 text-xs text-slate-500 whitespace-nowrap overflow-hidden">
              {formatPaymentMode(bill)}
            </td>
          </>
        )}
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
        {showStatusDate && (
          <td className="px-2 py-3.5 text-xs text-slate-600 whitespace-nowrap overflow-hidden">
            {statusDate ? formatDate(statusDate) : '—'}
          </td>
        )}
        {!compact && (
          <td className="px-2 py-3.5 whitespace-nowrap overflow-hidden">
            <div className="flex items-center gap-1.5">
              {isPending && (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={toggling}
                  className="rounded-md px-2.5 py-1 text-xs font-medium border transition-colors disabled:opacity-50
                    border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300"
                >
                  Approve
                </button>
              )}
              {isApproved && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setClearModalOpen(true); }}
                    disabled={toggling}
                    className="rounded-md px-2.5 py-1 text-xs font-medium border transition-colors disabled:opacity-50
                      border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300"
                  >
                    Mark Cleared
                  </button>
                  <button
                    type="button"
                    onClick={handleReopen}
                    disabled={toggling}
                    className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:text-amber-600 transition-colors disabled:opacity-50"
                    title="Revert to Pending"
                  >
                    Revert
                  </button>
                </>
              )}
            </div>
          </td>
        )}
      </tr>

      {hasParticulars && (
        <tr
          {...rowInteraction}
          className={`border-b border-slate-100 transition-colors cursor-pointer ${rowBg}`}
        >
          {selectMode && <td />}
          <td colSpan={4 + (compact ? 0 : 2)} />
          <td
            colSpan={3 + (showStatusDate ? 1 : 0) + (compact ? 0 : 1)}
            className="px-2 pb-2.5 pt-0 text-xs text-slate-400 truncate"
            title={bill.particulars}
          >
            {bill.particulars}
          </td>
        </tr>
      )}

      {detailOpen && (
        <PendingBillDetailModal bill={bill} onClose={() => setDetailOpen(false)} />
      )}
      {clearModalOpen && (
        <ClearBillsModal
          bills={[bill]}
          financialYear={bill.financialYear}
          cashBookType={bill.cashBookType}
          onClose={() => setClearModalOpen(false)}
          onCleared={() => setClearModalOpen(false)}
        />
      )}
    </>
  );
});
