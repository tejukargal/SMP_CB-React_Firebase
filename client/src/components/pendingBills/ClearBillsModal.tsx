import { useMemo, useState } from 'react';
import { DateInput } from '@/components/ui/DateInput';
import { Button } from '@/components/ui/Button';
import { SelectDropdown } from '@/components/ui/SelectDropdown';
import { SuggestDropdown } from '@/components/ui/SuggestDropdown';
import { useToast } from '@/context/ToastContext';
import { usePendingBills } from '@/hooks/usePendingBills';
import { apiCreateClearedBillBatch } from '@/api/clearedBillBatches';
import { formatCurrency } from '@/utils/formatCurrency';
import { PAYMENT_MODE_LABEL } from '@/utils/formatPaymentMode';
import { exportCashClearingListPDF, exportNonCashClearingListPDF } from '@/utils/exportClearingLists';
import { toProperCase } from '@smp-cashbook/shared';
import type { CashBookType, ClearingGroup, PaymentMode, PendingBill } from '@smp-cashbook/shared';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PAYMENT_MODES: PaymentMode[] = ['Cheque', 'AcctPayeeCheque', 'NEFT', 'Online'];

type RetainedField = 'mode' | 'bank' | 'refNo';

interface LineDraft {
  id: string;
  mode: PaymentMode;
  bank: string;
  refNo: string;
  billIds: string[];
  retained: Set<RetainedField>;
}

let lineSeq = 0;
function makeLine(seed?: { mode: PaymentMode; bank: string; refNo: string }): LineDraft {
  lineSeq += 1;
  return {
    id: `line-${lineSeq}-${Date.now()}`,
    mode: seed?.mode ?? 'Cheque',
    bank: seed?.bank ?? '',
    refNo: seed?.refNo ?? '',
    billIds: [],
    retained: seed ? new Set<RetainedField>(['mode', 'bank', 'refNo']) : new Set<RetainedField>(),
  };
}

/** Case-insensitive substring match over bank names of previously cleared bills, deduped and capped */
function buildBankSuggestions(query: string, allBills: PendingBill[]): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const b of allBills) {
    const val = b.bank;
    if (val && !seen.has(val) && val.toLowerCase().includes(q)) {
      seen.add(val);
      result.push(val);
      if (result.length === 6) return result;
    }
  }
  return result;
}

interface ClearBillsModalProps {
  bills: PendingBill[]; // Approved bills being cleared
  financialYear: string;
  cashBookType: CashBookType;
  onClose: () => void;
  onCleared: () => void;
}

export function ClearBillsModal({ bills, financialYear, cashBookType, onClose, onCleared }: ClearBillsModalProps) {
  const { addToast } = useToast();
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [groupByBill, setGroupByBill] = useState<Record<string, ClearingGroup>>(
    () => Object.fromEntries(bills.map((b) => [b.id, 'NonCash' as ClearingGroup]))
  );
  const [lines, setLines] = useState<LineDraft[]>([makeLine()]);
  const [bankSuggestOpenId, setBankSuggestOpenId] = useState<string | null>(null);

  const { bills: historicalBills } = usePendingBills(financialYear, cashBookType);

  const totalAmount = useMemo(() => bills.reduce((s, b) => s + b.amount, 0), [bills]);
  const cashBills = useMemo(() => bills.filter((b) => groupByBill[b.id] === 'Cash'), [bills, groupByBill]);
  const nonCashBills = useMemo(() => bills.filter((b) => groupByBill[b.id] !== 'Cash'), [bills, groupByBill]);
  const cashTotal = useMemo(() => cashBills.reduce((s, b) => s + b.amount, 0), [cashBills]);
  const nonCashTotal = useMemo(() => nonCashBills.reduce((s, b) => s + b.amount, 0), [nonCashBills]);

  const assignedLineIdByBill = useMemo(() => {
    const map = new Map<string, string>();
    lines.forEach((line) => line.billIds.forEach((id) => map.set(id, line.id)));
    return map;
  }, [lines]);

  const unassignedNonCash = useMemo(
    () => nonCashBills.filter((b) => !assignedLineIdByBill.has(b.id)),
    [nonCashBills, assignedLineIdByBill]
  );

  const setBillGroup = (id: string, g: ClearingGroup) => {
    setGroupByBill((prev) => ({ ...prev, [id]: g }));
    if (g === 'Cash') {
      setLines((prev) => prev.map((l) => ({ ...l, billIds: l.billIds.filter((bid) => bid !== id) })));
    }
  };

  const markAll = (g: ClearingGroup) => {
    setGroupByBill(Object.fromEntries(bills.map((b) => [b.id, g])));
    if (g === 'Cash') setLines((prev) => prev.map((l) => ({ ...l, billIds: [] })));
  };

  const addLine = () => setLines((prev) => {
    const first = prev[0];
    const seed = first ? { mode: first.mode, bank: first.bank, refNo: first.refNo } : undefined;
    return [...prev, makeLine(seed)];
  });
  const removeLine = (id: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  const updateLine = (id: string, patch: Partial<Pick<LineDraft, 'mode' | 'bank' | 'refNo' | 'billIds'>>) =>
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const retained = new Set(l.retained);
      (Object.keys(patch) as (keyof typeof patch)[]).forEach((key) => {
        if (key === 'mode' || key === 'bank' || key === 'refNo') retained.delete(key);
      });
      return { ...l, ...patch, retained };
    }));

  const assignBillToLine = (billId: string, lineId: string) => {
    setLines((prev) => prev.map((l) => {
      if (l.id === lineId) return { ...l, billIds: [...l.billIds, billId] };
      return { ...l, billIds: l.billIds.filter((id) => id !== billId) };
    }));
  };
  const unassignBill = (billId: string) => {
    setLines((prev) => prev.map((l) => ({ ...l, billIds: l.billIds.filter((id) => id !== billId) })));
  };

  const linesWithBills = lines.filter((l) => l.billIds.length > 0);
  const nonCashReady = nonCashBills.length === 0 ||
    (unassignedNonCash.length === 0 && linesWithBills.every((l) => l.refNo.trim() !== ''));

  const canConfirm = !!date && bills.length > 0 && (cashBills.length > 0 || nonCashBills.length > 0) && nonCashReady;

  const previewMeta = { financialYear, cashBookType, date };

  const lineAmount = (line: LineDraft) =>
    line.billIds.reduce((s, id) => s + (bills.find((b) => b.id === id)?.amount ?? 0), 0);

  const handlePrintCash = () => exportCashClearingListPDF(cashBills, previewMeta);
  const handlePrintNonCash = () => exportNonCashClearingListPDF(
    nonCashBills,
    linesWithBills.map((l) => ({ mode: l.mode, bank: l.bank.trim(), refNo: l.refNo.trim(), billIds: l.billIds, amount: lineAmount(l) })),
    previewMeta
  );

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    try {
      if (cashBills.length > 0) {
        await apiCreateClearedBillBatch({
          group: 'Cash',
          paymentLines: [{ mode: 'Cash', bank: '', refNo: '', billIds: cashBills.map((b) => b.id) }],
          date, financialYear, cashBookType,
        });
      }
      if (nonCashBills.length > 0) {
        await apiCreateClearedBillBatch({
          group: 'NonCash',
          paymentLines: linesWithBills.map((l) => ({ mode: l.mode, bank: l.bank.trim(), refNo: l.refNo.trim(), billIds: l.billIds })),
          date, financialYear, cashBookType,
        });
      }
      addToast('Bills cleared successfully', 'success');
      onCleared();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to clear bills', 'error');
    } finally {
      setSaving(false);
    }
  };

  const chipCls = (active: boolean, activeCls: string) =>
    `px-2.5 py-1 text-xs font-medium transition-colors ${active ? activeCls : 'text-slate-500 hover:bg-slate-50'}`;

  const retainedInputCls = 'border-amber-300 bg-amber-50 focus:border-amber-400 focus:ring-amber-400/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!saving ? onClose : undefined} />
      <div className="relative z-10 flex w-full max-w-3xl max-h-[90vh] flex-col rounded-xl border border-slate-200 bg-white shadow-xl">

        <div className="flex items-center justify-between rounded-t-xl border-b border-slate-100 bg-slate-50 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Clear {bills.length} {bills.length === 1 ? 'bill' : 'bills'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Total <span className="font-medium text-slate-700">{formatCurrency(totalAmount)}</span>
            </p>
          </div>
          <button
            onClick={!saving ? onClose : undefined}
            className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">

          {/* Step 1: Split */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50">
              <span className="text-xs font-semibold text-slate-600">1. Separate Cash from Non-Cash</span>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => markAll('Cash')} className="text-xs font-medium text-emerald-600 hover:underline">
                  Mark all Cash
                </button>
                <span className="text-slate-300">·</span>
                <button type="button" onClick={() => markAll('NonCash')} className="text-xs font-medium text-blue-600 hover:underline">
                  Mark all Non-Cash
                </button>
              </div>
            </div>
            <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {bills.map((b) => {
                const isCash = groupByBill[b.id] === 'Cash';
                return (
                  <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {b.firmName} <span className="font-normal text-slate-400">· {b.billNumber}</span>
                      </p>
                      <p className="text-xs text-slate-400">{formatCurrency(b.amount)}</p>
                    </div>
                    <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-200">
                      <button type="button" onClick={() => setBillGroup(b.id, 'Cash')}
                        className={chipCls(isCash, 'bg-emerald-100 text-emerald-700')}>
                        Cash
                      </button>
                      <button type="button" onClick={() => setBillGroup(b.id, 'NonCash')}
                        className={`border-l border-slate-200 ${chipCls(!isCash, 'bg-blue-100 text-blue-700')}`}>
                        Non-Cash
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs">
              <span className="font-medium text-emerald-700">Cash: {formatCurrency(cashTotal)} ({cashBills.length})</span>
              <span className="font-medium text-blue-700">Non-Cash: {formatCurrency(nonCashTotal)} ({nonCashBills.length})</span>
            </div>
          </div>

          {/* Step 2: Payment lines for non-cash bills */}
          {nonCashBills.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50">
                <span className="text-xs font-semibold text-slate-600">
                  2. Cheque / Acct Payee Chq / NEFT / Online references
                </span>
                {unassignedNonCash.length > 0 && (
                  <button type="button" onClick={addLine} className="text-xs font-medium text-blue-600 hover:underline">
                    + Add payment line
                  </button>
                )}
              </div>
              <div className="p-3 space-y-2.5">
                {lines.map((line) => {
                  const selectableBills = nonCashBills.filter(
                    (b) => line.billIds.includes(b.id) || !assignedLineIdByBill.has(b.id)
                  );
                  const bankSuggestions = buildBankSuggestions(line.bank, historicalBills);
                  return (
                  <div key={line.id} className="rounded-md border border-slate-200 p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <SelectDropdown
                        value={line.mode}
                        onChange={(v) => updateLine(line.id, { mode: v as PaymentMode })}
                        options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABEL[m] }))}
                        triggerCls={`h-9 flex items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs font-medium text-slate-700 shrink-0
                          ${line.retained.has('mode') ? retainedInputCls : 'border-slate-300'}`}
                      />
                      <div className="relative w-32 shrink-0">
                        <input
                          type="text"
                          placeholder="Bank"
                          value={line.bank}
                          onChange={(e) => updateLine(line.id, { bank: toProperCase(e.target.value) })}
                          onFocus={() => setBankSuggestOpenId(line.id)}
                          onBlur={() => setBankSuggestOpenId(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') { setBankSuggestOpenId(null); return; }
                            if (e.key === 'Tab' && bankSuggestOpenId === line.id && bankSuggestions.length > 0) {
                              e.preventDefault();
                              updateLine(line.id, { bank: bankSuggestions[0] });
                              setBankSuggestOpenId(null);
                            }
                          }}
                          autoComplete="off"
                          className={`h-9 w-full min-w-0 rounded-md border px-3 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400
                            ${line.retained.has('bank') ? retainedInputCls : 'border-slate-300'}`}
                        />
                        {bankSuggestOpenId === line.id && (
                          <SuggestDropdown
                            suggestions={bankSuggestions}
                            onSelect={(v) => { updateLine(line.id, { bank: v }); setBankSuggestOpenId(null); }}
                          />
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Reference No (Chq / NEFT / Txn no.)"
                        value={line.refNo}
                        onChange={(e) => updateLine(line.id, { refNo: e.target.value })}
                        className={`h-9 flex-1 min-w-0 rounded-md border px-3 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400
                          ${line.retained.has('refNo') ? retainedInputCls : 'border-slate-300'}`}
                      />
                      <span className="shrink-0 text-xs font-semibold text-slate-600">{formatCurrency(lineAmount(line))}</span>
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(line.id)} title="Remove line"
                          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectableBills.map((b) => {
                        const checked = line.billIds.includes(b.id);
                        return (
                          <label key={b.id}
                            className={`flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors
                              ${checked ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                          >
                            <input
                              type="checkbox"
                              className="h-3 w-3 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-400"
                              checked={checked}
                              onChange={() => (checked ? unassignBill(b.id) : assignBillToLine(b.id, line.id))}
                            />
                            {b.firmName} · {formatCurrency(b.amount)}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
              </div>
              {unassignedNonCash.length > 0 && (
                <p className="px-4 pb-3 text-xs text-amber-600">
                  {unassignedNonCash.length} non-cash {unassignedNonCash.length === 1 ? 'bill is' : 'bills are'} not yet assigned to a payment line.
                </p>
              )}
            </div>
          )}

          {/* Step 3: Print for attestation */}
          <div className="rounded-lg border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-2">
            <span className="mr-auto text-xs font-semibold text-slate-600">
              3. Print for Principal attestation
            </span>
            {cashBills.length > 0 && (
              <button type="button" onClick={handlePrintCash}
                className="h-8 flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50
                  px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                Print Cash List ({cashBills.length})
              </button>
            )}
            {nonCashBills.length > 0 && (
              <button type="button" onClick={handlePrintNonCash} disabled={!nonCashReady}
                title={!nonCashReady ? 'Assign every non-cash bill to a payment line with a reference number first' : undefined}
                className="h-8 flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50
                  px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Print Non-Cash List ({nonCashBills.length})
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Printing does not clear the bills — take the printed list(s) for Principal attestation and disbursement first,
            then come back and confirm clearance below once done.
          </p>

        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 shrink-0">
          <DateInput label="Clearance Date" id="clear-bills-date" value={date} onChange={setDate} />
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-8 rounded-md border border-slate-200 bg-white px-4 text-xs font-medium
                text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <Button size="sm" onClick={handleConfirm} loading={saving} disabled={!canConfirm}>
              Confirm Clearance
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
