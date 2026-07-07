import { Fragment, useState } from 'react';
import { useClearedBillBatches } from '@/hooks/useClearedBillBatches';
import { useToast } from '@/context/ToastContext';
import { apiDeleteClearedBillBatch } from '@/api/clearedBillBatches';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { PAYMENT_MODE_LABEL } from '@/utils/formatPaymentMode';
import { exportCashClearingListPDF, exportNonCashClearingListPDF } from '@/utils/exportClearingLists';
import type { PendingBill, ClearedBillBatch } from '@smp-cashbook/shared';
import type { ActiveCashBookType } from '@smp-cashbook/shared';

interface ClearedBatchesPanelProps {
  bills: PendingBill[];
  financialYear: string;
  cashBookType: ActiveCashBookType;
}

function DeleteBatchConfirm({
  batch,
  onConfirm,
  onCancel,
  deleting,
}: {
  batch: ClearedBillBatch;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!deleting ? onCancel : undefined} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
            <svg className="h-4.5 w-4.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Delete batch from {formatDate(batch.date)}?
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              This will remove the batch record and revert its{' '}
              <span className="font-medium text-slate-700">
                {batch.count} {batch.count === 1 ? 'bill' : 'bills'}
              </span>{' '}
              back to <span className="font-medium text-slate-700">Approved</span>. This action{' '}
              <span className="font-medium text-red-600">cannot be undone</span>.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="h-8 rounded-md border border-slate-200 bg-white px-4 text-xs font-medium
              text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="h-8 rounded-md bg-red-600 px-4 text-xs font-semibold text-white
              hover:bg-red-700 active:bg-red-800 disabled:opacity-60 transition-colors"
          >
            {deleting ? 'Deleting…' : 'Delete batch'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClearedBatchesPanel({ bills, financialYear, cashBookType }: ClearedBatchesPanelProps) {
  const { batches, loading, error } = useClearedBillBatches(financialYear, cashBookType);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<ClearedBillBatch | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { addToast } = useToast();
  const billsById = new Map(bills.map((b) => [b.id, b]));

  const handleDeleteBatch = async () => {
    if (!batchToDelete) return;
    setDeleting(true);
    try {
      await apiDeleteClearedBillBatch(batchToDelete.id, batchToDelete.financialYear, batchToDelete.cashBookType);
      addToast('Cleared batch deleted', 'success');
      setBatchToDelete(null);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to delete batch', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrintBatch = (batch: ClearedBillBatch) => {
    const batchBills = batch.billIds
      .map((id) => billsById.get(id))
      .filter((b): b is PendingBill => !!b);
    const meta = { financialYear: batch.financialYear, cashBookType: batch.cashBookType, date: batch.date };
    if (batch.group === 'Cash') {
      exportCashClearingListPDF(batchBills, meta);
    } else {
      exportNonCashClearingListPDF(batchBills, batch.paymentLines, meta);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-slate-200 p-3">
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
                <div className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : batch.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <svg className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-semibold text-slate-700">{formatDate(batch.date)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      batch.group === 'Cash' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {batch.group === 'Cash' ? 'Cash' : 'Non-Cash'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {batch.count} {batch.count === 1 ? 'bill' : 'bills'}
                    </span>
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-green-700">{formatCurrency(batch.totalAmount)}</span>
                    <button
                      type="button"
                      onClick={() => handlePrintBatch(batch)}
                      title={batch.group === 'Cash' ? 'Print Cash List' : 'Print Non-Cash List'}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.111 48.111 0 00-3.413-.387m-7.5 0V5.25A2.25 2.25 0 019 3h6a2.25 2.25 0 012.25 2.25v1.643M15 5.25a2.25 2.25 0 00-2.25-2.25h-1.5A2.25 2.25 0 009 5.25v1.643" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchToDelete(batch)}
                      title="Delete this batch"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60">
                    <table className="w-full text-left text-xs table-fixed">
                      <colgroup>
                        <col />
                        <col className="w-[140px]" />
                        <col className="w-[110px]" />
                        <col className="w-[110px]" />
                      </colgroup>
                      <thead>
                        <tr className="text-slate-500">
                          <th className="px-4 py-1.5 font-medium">Firm Name</th>
                          <th className="px-2 py-1.5 font-medium">Bill No</th>
                          <th className="px-2 py-1.5 font-medium text-right">Amount</th>
                          <th className="px-4 py-1.5 font-medium">Current Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batch.paymentLines.map((line, li) => (
                          <Fragment key={li}>
                            <tr className="border-t border-slate-200 bg-slate-100/70">
                              <td colSpan={2} className="px-4 py-1.5 font-medium text-slate-600 truncate">
                                {PAYMENT_MODE_LABEL[line.mode]}
                                {line.bank && <span className="font-normal text-slate-400"> · Bank: {line.bank}</span>}
                                {line.refNo && <span className="font-normal text-slate-400"> · Ref: {line.refNo}</span>}
                              </td>
                              <td className="px-2 py-1.5 text-right font-semibold text-slate-700">
                                {formatCurrency(line.amount)}
                              </td>
                              <td />
                            </tr>
                            {line.billIds.map((id) => {
                              const bill = billsById.get(id);
                              return (
                                <tr key={id} className="border-t border-slate-100">
                                  <td className="px-4 py-1.5 text-slate-700 truncate">{bill?.firmName ?? '—'}</td>
                                  <td className="px-2 py-1.5 text-slate-500 truncate">{bill?.billNumber ?? '—'}</td>
                                  <td className="px-2 py-1.5 text-right font-medium text-slate-800">
                                    {bill ? formatCurrency(bill.amount) : '—'}
                                  </td>
                                  <td className="px-4 py-1.5 text-slate-500">{bill?.status ?? 'Deleted'}</td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {batchToDelete && (
        <DeleteBatchConfirm
          batch={batchToDelete}
          onConfirm={handleDeleteBatch}
          onCancel={() => setBatchToDelete(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
