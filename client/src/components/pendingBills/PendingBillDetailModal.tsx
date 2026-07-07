import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { apiDeletePendingBill, apiUpdatePendingBill } from '@/api/pendingBills';
import { ClearBillsModal } from './ClearBillsModal';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { formatPaymentMode } from '@/utils/formatPaymentMode';
import { toProperCase } from '@smp-cashbook/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { DateInput } from '@/components/ui/DateInput';
import { SuggestDropdown } from '@/components/ui/SuggestDropdown';
import { usePendingBills } from '@/hooks/usePendingBills';
import type { PendingBill, PendingBillFormData } from '@smp-cashbook/shared';

interface EditErrors {
  date?: string;
  amount?: string;
  headOfAccount?: string;
  firmName?: string;
  billNumber?: string;
  billDate?: string;
}

function ViewField({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-medium text-slate-800 ${valueClass ?? ''}`}>{value || '—'}</span>
    </div>
  );
}

function toForm(bill: PendingBill): PendingBillFormData {
  return {
    date: bill.date,
    amount: String(bill.amount),
    headOfAccount: bill.headOfAccount,
    firmName: bill.firmName,
    billNumber: bill.billNumber,
    billDate: bill.billDate,
    particulars: bill.particulars,
    remarks: bill.remarks,
  };
}

export function PendingBillDetailModal({ bill, onClose }: { bill: PendingBill; onClose: () => void }) {
  const { addToast } = useToast();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PendingBillFormData>(() => toForm(bill));
  const [editErrors, setEditErrors] = useState<EditErrors>({});
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);

  const [hoaOpen, setHoaOpen] = useState(false);
  const [firmOpen, setFirmOpen] = useState(false);
  const [particularsOpen, setParticularsOpen] = useState(false);

  const { bills } = usePendingBills(bill.financialYear, bill.cashBookType);

  const buildSuggestions = (query: string, field: keyof PendingBill): string[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const b of bills) {
      const val = String(b[field] ?? '');
      if (val && !seen.has(val) && val.toLowerCase().includes(q)) {
        seen.add(val);
        result.push(val);
        if (result.length === 6) break;
      }
    }
    return result;
  };

  const hoaSuggestions         = useMemo(() => buildSuggestions(form.headOfAccount, 'headOfAccount'), [form.headOfAccount, bills]);
  const firmSuggestions        = useMemo(() => buildSuggestions(form.firmName, 'firmName'), [form.firmName, bills]);
  const particularsSuggestions = useMemo(() => buildSuggestions(form.particulars, 'particulars'), [form.particulars, bills]);

  const setField = (field: keyof PendingBillFormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const validateEdit = (): boolean => {
    const e: EditErrors = {};
    if (!form.date) e.date = 'Date is required';
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Amount must be a positive number';
    if (!form.headOfAccount.trim()) e.headOfAccount = 'Head of Account is required';
    if (!form.firmName.trim()) e.firmName = 'Firm Name is required';
    if (!form.billNumber.trim()) e.billNumber = 'Bill Number is required';
    if (!form.billDate) e.billDate = 'Bill Date is required';
    setEditErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validateEdit()) return;
    setSaving(true);
    try {
      await apiUpdatePendingBill(bill.id, bill.financialYear, bill.cashBookType, {
        date: form.date,
        amount: Number(form.amount),
        headOfAccount: toProperCase(form.headOfAccount.trim()),
        firmName: toProperCase(form.firmName.trim()),
        billNumber: form.billNumber.trim(),
        billDate: form.billDate,
        particulars: form.particulars ? toProperCase(form.particulars.trim()) : '',
        remarks: form.remarks.trim(),
      });
      addToast('Pending bill updated successfully', 'success');
      setEditing(false);
      onClose();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to update bill', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiDeletePendingBill(bill.id, bill.financialYear, bill.cashBookType);
      addToast('Pending bill deleted', 'success');
      onClose();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to delete bill', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleApprove = async () => {
    setTogglingStatus(true);
    try {
      await apiUpdatePendingBill(bill.id, bill.financialYear, bill.cashBookType, { status: 'Approved' });
      onClose();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to approve bill', 'error');
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleReopen = async () => {
    setTogglingStatus(true);
    try {
      await apiUpdatePendingBill(bill.id, bill.financialYear, bill.cashBookType, { status: 'Pending' });
      onClose();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to reopen bill', 'error');
    } finally {
      setTogglingStatus(false);
    }
  };

  const cancelEdit = () => {
    setForm(toForm(bill));
    setEditErrors({});
    setEditing(false);
    setConfirmDelete(false);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) cancelEdit(); else onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const isPending  = bill.status === 'Pending';
  const isApproved = bill.status === 'Approved';
  const isCleared  = bill.status === 'Cleared';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={editing ? undefined : onClose}
      />

      <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-xl animate-slide-up flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className={`flex items-center justify-between rounded-t-xl px-5 py-4 ${
          isCleared ? 'bg-green-50 border-b border-green-100'
            : isApproved ? 'bg-blue-50 border-b border-blue-100'
            : 'bg-amber-50 border-b border-amber-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              isCleared ? 'bg-green-100 text-green-700'
                : isApproved ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {bill.status}
            </span>
            <span className="text-lg font-bold text-slate-800">
              {editing
                ? (Number(form.amount) > 0 ? formatCurrency(Number(form.amount)) : '—')
                : formatCurrency(bill.amount)}
            </span>
          </div>
          <button
            onClick={editing ? cancelEdit : onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/60 hover:text-slate-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Additional Details
            </p>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-2.5 flex items-start gap-6 flex-wrap">
              <ViewField label="Financial Year" value={bill.financialYear} />
              <ViewField label="Cash Book Type" value={bill.cashBookType} />
              {bill.createdAt && (
                <ViewField
                  label="Created At"
                  value={new Date(bill.createdAt).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                  valueClass="text-xs text-slate-500 font-normal"
                />
              )}
              {bill.clearedAt && (
                <ViewField
                  label="Cleared At"
                  value={new Date(bill.clearedAt).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                  valueClass="text-xs text-green-600 font-normal"
                />
              )}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {editing ? (
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Edit Bill
              </p>
              <div className="space-y-3">
                <DateInput
                  label="Date"
                  id="edit-bill-date"
                  value={form.date}
                  onChange={(iso) => setField('date', iso)}
                  error={editErrors.date}
                />

                <Input
                  label="Amount (₹)"
                  id="edit-bill-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setField('amount', e.target.value)}
                  error={editErrors.amount}
                />

                <div className="relative">
                  <Input
                    label="Head of Account"
                    id="edit-bill-hoa"
                    type="text"
                    value={form.headOfAccount}
                    onChange={(e) => { setField('headOfAccount', toProperCase(e.target.value)); setHoaOpen(true); }}
                    onFocus={() => setHoaOpen(true)}
                    onBlur={() => setHoaOpen(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setHoaOpen(false); return; }
                      if (e.key === 'Tab' && hoaOpen && hoaSuggestions.length > 0) {
                        e.preventDefault(); setField('headOfAccount', hoaSuggestions[0]); setHoaOpen(false);
                      }
                    }}
                    error={editErrors.headOfAccount}
                    autoComplete="off"
                  />
                  {hoaOpen && <SuggestDropdown suggestions={hoaSuggestions} onSelect={(v) => { setField('headOfAccount', v); setHoaOpen(false); }} />}
                </div>

                <div className="relative">
                  <Input
                    label="Firm Name"
                    id="edit-bill-firm"
                    type="text"
                    value={form.firmName}
                    onChange={(e) => { setField('firmName', toProperCase(e.target.value)); setFirmOpen(true); }}
                    onFocus={() => setFirmOpen(true)}
                    onBlur={() => setFirmOpen(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setFirmOpen(false); return; }
                      if (e.key === 'Tab' && firmOpen && firmSuggestions.length > 0) {
                        e.preventDefault(); setField('firmName', firmSuggestions[0]); setFirmOpen(false);
                      }
                    }}
                    error={editErrors.firmName}
                    autoComplete="off"
                  />
                  {firmOpen && <SuggestDropdown suggestions={firmSuggestions} onSelect={(v) => { setField('firmName', v); setFirmOpen(false); }} />}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Bill Number"
                    id="edit-bill-number"
                    type="text"
                    value={form.billNumber}
                    onChange={(e) => setField('billNumber', e.target.value)}
                    error={editErrors.billNumber}
                  />
                  <DateInput
                    label="Bill Date"
                    id="edit-bill-billdate"
                    value={form.billDate}
                    onChange={(iso) => setField('billDate', iso)}
                    error={editErrors.billDate}
                  />
                </div>

                <div className="relative">
                  <Textarea
                    label="Particulars"
                    id="edit-bill-particulars"
                    value={form.particulars}
                    onChange={(e) => { setField('particulars', toProperCase(e.target.value)); setParticularsOpen(true); }}
                    onFocus={() => setParticularsOpen(true)}
                    onBlur={() => setParticularsOpen(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setParticularsOpen(false); return; }
                      if (e.key === 'Tab' && particularsOpen && particularsSuggestions.length > 0) {
                        e.preventDefault(); setField('particulars', particularsSuggestions[0]); setParticularsOpen(false);
                      }
                    }}
                  />
                  {particularsOpen && <SuggestDropdown suggestions={particularsSuggestions} onSelect={(v) => { setField('particulars', v); setParticularsOpen(false); }} />}
                </div>

                <Textarea
                  label="Remarks"
                  id="edit-bill-remarks"
                  value={form.remarks}
                  onChange={(e) => setField('remarks', e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Bill Details
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <ViewField label="Date" value={formatDate(bill.date)} />
                <ViewField label="Bank" value={bill.bank} />
                <ViewField label="Payment" value={formatPaymentMode(bill)} />
                <ViewField label="Head of Account" value={bill.headOfAccount} />
                <ViewField label="Firm Name" value={bill.firmName} />
                <ViewField label="Bill Number" value={bill.billNumber} />
                <ViewField label="Bill Date" value={formatDate(bill.billDate)} />
                {bill.particulars && (
                  <div className="col-span-2">
                    <span className="text-xs text-slate-400">Particulars</span>
                    <p className="mt-0.5 text-sm text-slate-700 leading-relaxed">{bill.particulars}</p>
                  </div>
                )}
                {bill.remarks && (
                  <div className="col-span-2">
                    <span className="text-xs text-slate-400">Remarks</span>
                    <p className="mt-0.5 text-sm text-slate-700 leading-relaxed">{bill.remarks}</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          {editing ? (
            <div className="flex items-center gap-2 w-full justify-between">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Delete permanently?</span>
                  <Button size="sm" variant="danger" onClick={handleDelete} loading={deleting}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Cancel
                  </Button>
                </div>
              )}
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={cancelEdit} disabled={saving}>
                  Discard
                </Button>
                <Button size="sm" onClick={handleSave} loading={saving}>
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full justify-between">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete bill
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Delete permanently?</span>
                  <Button size="sm" variant="danger" onClick={handleDelete} loading={deleting}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Cancel
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                {isPending && (
                  <Button size="sm" variant="primary" onClick={handleApprove} loading={togglingStatus}>
                    Approve
                  </Button>
                )}
                {isApproved && (
                  <>
                    <Button size="sm" variant="secondary" onClick={handleReopen} loading={togglingStatus}>
                      Revert
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => setClearModalOpen(true)}>
                      Mark Cleared
                    </Button>
                  </>
                )}
                <Button size="sm" variant="secondary" onClick={() => { setEditing(true); setConfirmDelete(false); }}>
                  Edit
                </Button>
                <Button size="sm" variant="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {clearModalOpen && (
        <ClearBillsModal
          bills={[bill]}
          financialYear={bill.financialYear}
          cashBookType={bill.cashBookType}
          onClose={() => setClearModalOpen(false)}
          onCleared={() => { setClearModalOpen(false); onClose(); }}
        />
      )}
    </div>
  );
}
