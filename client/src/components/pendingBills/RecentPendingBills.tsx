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
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="shrink-0 flex items-center gap-2">
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
        <div className="flex-1 min-h-0 rounded-lg border border-slate-200 p-3 overflow-y-auto">
          <EntrySkeleton rows={RECENT_COUNT} />
        </div>
      ) : recent.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center rounded-lg border border-slate-200 text-center text-sm text-slate-400">
          No pending bills yet — add your first one above.
        </div>
      ) : (
        <div className="flex-1 min-h-0 rounded-lg border border-slate-200 overflow-auto">
          <table className="w-full min-w-[820px] text-left text-sm table-fixed">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[80px]" />
              <col className="w-[100px]" />
              <col className="w-[130px]" />
              <col />
              <col className="w-[100px]" />
              <col className="w-[80px]" />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-white shadow-sm">
                <th className="py-2.5 pl-4 pr-1 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Sl No</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Date</th>
                <th className="pl-2 pr-4 py-2.5 text-xs font-medium text-slate-500 text-right whitespace-nowrap bg-white">Amt</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Head Of Acct</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Firm Name</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Bill No</th>
                <th className="px-2 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap bg-white">Bill Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((bill, i) => (
                <PendingBillRow key={bill.id} bill={bill} slNo={i + 1} compact />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
