import { useState } from 'react';
import { useClearedBillBatches } from '@/hooks/useClearedBillBatches';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import type { PendingBill } from '@smp-cashbook/shared';
import type { ActiveCashBookType } from '@smp-cashbook/shared';

interface ClearedBatchesModalProps {
  bills: PendingBill[];
  financialYear: string;
  cashBookType: ActiveCashBookType;
  onClose: () => void;
}

export function ClearedBatchesModal({ bills, financialYear, cashBookType, onClose }: ClearedBatchesModalProps) {
  const { batches, loading, error } = useClearedBillBatches(financialYear, cashBookType);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const billsById = new Map(bills.map((b) => [b.id, b]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl">

        <div className="flex items-center justify-between rounded-t-xl border-b border-slate-100 bg-slate-50 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-800">Cleared Bill Batches</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-red-500">Failed to load: {error}</p>
          ) : batches.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No cleared batches yet — bills marked cleared together will appear here.
            </p>
          ) : (
            <div className="space-y-2">
              {batches.map((batch) => {
                const expanded = expandedId === batch.id;
                return (
                  <div key={batch.id} className="rounded-lg border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : batch.id)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-sm font-semibold text-slate-700">{formatDate(batch.date)}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          {batch.count} {batch.count === 1 ? 'bill' : 'bills'}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-green-700">{formatCurrency(batch.totalAmount)}</span>
                    </button>

                    {expanded && (
                      <div className="border-t border-slate-100 bg-slate-50/60">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-500">
                              <th className="px-4 py-1.5 font-medium">Firm Name</th>
                              <th className="px-2 py-1.5 font-medium">Bill No</th>
                              <th className="px-2 py-1.5 font-medium text-right">Amount</th>
                              <th className="px-4 py-1.5 font-medium">Current Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {batch.billIds.map((id) => {
                              const bill = billsById.get(id);
                              return (
                                <tr key={id} className="border-t border-slate-100">
                                  <td className="px-4 py-1.5 text-slate-700">{bill?.firmName ?? '—'}</td>
                                  <td className="px-2 py-1.5 text-slate-500">{bill?.billNumber ?? '—'}</td>
                                  <td className="px-2 py-1.5 text-right font-medium text-slate-800">
                                    {bill ? formatCurrency(bill.amount) : '—'}
                                  </td>
                                  <td className="px-4 py-1.5 text-slate-500">{bill?.status ?? 'Deleted'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
