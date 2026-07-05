import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PendingBillRow } from './PendingBillRow';
import { EntrySkeleton } from '@/components/entries/EntrySkeleton';
import type { PendingBill } from '@smp-cashbook/shared';

const RECENT_COUNT = 3;

export function RecentPendingBills({ bills, loading }: { bills: PendingBill[]; loading: boolean }) {
  const recent = useMemo(
    () => [...bills]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, RECENT_COUNT),
    [bills]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-medium text-slate-600">Recent Pending Bills</span>
        {!loading && bills.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            last {recent.length} of {bills.length}
          </span>
        )}
        <Link
          to="/pending-bills-list"
          className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          View full list →
        </Link>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 p-3">
          <EntrySkeleton rows={RECENT_COUNT} />
        </div>
      ) : recent.length === 0 ? (
        <div className="rounded-lg border border-slate-200 py-16 text-center text-sm text-slate-400">
          No pending bills yet — add your first one above.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm table-fixed">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[80px]" />
              <col className="w-[110px]" />
              <col className="w-[90px]" />
              <col className="w-[100px]" />
              <col className="w-[130px]" />
              <col className="w-[140px]" />
              <col className="w-[100px]" />
              <col className="w-[80px]" />
              <col />
              <col className="w-[90px]" />
              <col className="w-[110px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="py-2.5 pl-4 pr-1 text-xs font-medium text-slate-500 whitespace-nowrap">Sl No</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Date</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Bank</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Chq No/Cash</th>
                <th className="pl-2 pr-4 py-2.5 text-xs font-medium text-slate-500 text-right whitespace-nowrap">Amt</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Head Of Acct</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Firm Name</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Bill No</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Bill Date</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Particulars</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Status</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((bill, i) => (
                <PendingBillRow key={bill.id} bill={bill} slNo={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
