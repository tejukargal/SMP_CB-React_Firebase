import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { apiDeleteEntry, apiUpdateEntry } from '@/api/entries';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { toProperCase } from '@smp-cashbook/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { DateInput } from '@/components/ui/DateInput';
import { cn } from '@/utils/cn';
import type { Entry, EntryType } from '@smp-cashbook/shared';

interface EditForm {
  date: string;
  chequeNo: string;
  amount: string;
  headOfAccount: string;
  notes: string;
  type: EntryType;
}

interface EditErrors {
  date?: string;
  amount?: string;
  headOfAccount?: string;
}

function ViewField({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-medium text-slate-800 ${valueClass ?? ''}`}>{value || '—'}</span>
    </div>
  );
}

export function EntryDetailModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const { addToast } = useToast();

  // View vs edit mode
  const [editing, setEditing] = useState(false);

  // Edit form state — initialised from entry
  const [form, setForm] = useState<EditForm>({
    date: entry.date,
    chequeNo: entry.chequeNo,
    amount: String(entry.amount),
    headOfAccount: entry.headOfAccount,
    notes: entry.notes,
    type: entry.type,
  });
  const [editErrors, setEditErrors] = useState<EditErrors>({});
  const [saving, setSaving] = useState(false);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Live-preview type for header colour while editing
  const displayType = editing ? form.type : entry.type;
  const isReceipt = displayType === 'Receipt';

  const setField = (field: keyof EditForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const validateEdit = (): boolean => {
    const e: EditErrors = {};
    if (!form.date) e.date = 'Date is required';
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Amount must be a positive number';
    if (!form.headOfAccount.trim()) e.headOfAccount = 'Head of Account is required';
    setEditErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validateEdit()) return;
    setSaving(true);
    try {
      await apiUpdateEntry(entry.id, entry.financialYear, entry.cashBookType, {
        date: form.date,
        chequeNo: form.chequeNo.trim(),
        amount: Number(form.amount),
        headOfAccount: toProperCase(form.headOfAccount.trim()),
        notes: form.notes ? toProperCase(form.notes.trim()) : '',
        type: form.type,
      });
      addToast('Entry updated successfully', 'success');
      setEditing(false);
      onClose();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to update entry', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiDeleteEntry(entry.id, entry.financialYear, entry.cashBookType);
      addToast('Entry deleted', 'success');
      onClose();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to delete entry', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const cancelEdit = () => {
    setForm({
      date: entry.date,
      chequeNo: entry.chequeNo,
      amount: String(entry.amount),
      headOfAccount: entry.headOfAccount,
      notes: entry.notes,
      type: entry.type,
    });
    setEditErrors({});
    setEditing(false);
    setConfirmDelete(false);
  };

  // Close on Escape — cancel edit if in edit mode, close modal otherwise
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) cancelEdit(); else onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [editing, cancelEdit, onClose]);

  const TABS: EntryType[] = ['Receipt', 'Payment'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={editing ? undefined : onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-xl animate-slide-up flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className={`flex items-center justify-between rounded-t-xl px-5 py-4 ${
          isReceipt ? 'bg-green-50 border-b border-green-100' : 'bg-red-50 border-b border-red-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              isReceipt ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {displayType}
            </span>
            <span className={`text-lg font-bold ${isReceipt ? 'text-green-700' : 'text-red-700'}`}>
              {editing
                ? (Number(form.amount) > 0 ? formatCurrency(Number(form.amount)) : '—')
                : formatCurrency(entry.amount)}
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

          {/* ── Additional Details (always read-only) ── */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Additional Details
            </p>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-2.5 flex items-start gap-6">
              <ViewField label="Financial Year" value={entry.financialYear} />
              <ViewField label="Cash Book Type" value={entry.cashBookType}  />
              {entry.createdAt && (
                <ViewField
                  label="Created At"
                  value={new Date(entry.createdAt).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                  valueClass="text-xs text-slate-500 font-normal"
                />
              )}
              {entry.type === 'Payment' && entry.voucherNo && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-400">Vr No</span>
                  <span className="text-xs font-mono font-semibold text-amber-600">{entry.voucherNo}</span>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {editing ? (
            /* ── Edit mode: editable fields ── */
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Edit Transaction
              </p>
              <div className="space-y-3">
                {/* Type toggle */}
                <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
                  {TABS.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setField('type', tab)}
                      className={cn(
                        'flex-1 rounded-md py-1.5 text-sm font-medium transition-all',
                        form.type === tab
                          ? tab === 'Receipt'
                            ? 'bg-white text-green-700 shadow-sm ring-1 ring-slate-200'
                            : 'bg-white text-red-700 shadow-sm ring-1 ring-slate-200'
                          : 'text-slate-500 hover:text-slate-700'
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <DateInput
                    label="Date"
                    id="edit-date"
                    value={form.date}
                    onChange={(iso) => setField('date', iso)}
                    error={editErrors.date}
                  />
                  <Input
                    label="Cheque No"
                    id="edit-cheque"
                    type="text"
                    placeholder="Optional"
                    value={form.chequeNo}
                    onChange={(e) => setField('chequeNo', toProperCase(e.target.value))}
                  />
                </div>

                <Input
                  label="Amount (₹)"
                  id="edit-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setField('amount', e.target.value)}
                  error={editErrors.amount}
                />

                <Input
                  label="Head of Account"
                  id="edit-hoa"
                  type="text"
                  value={form.headOfAccount}
                  onChange={(e) => setField('headOfAccount', toProperCase(e.target.value))}
                  error={editErrors.headOfAccount}
                />

                <Textarea
                  label="Notes"
                  id="edit-notes"
                  placeholder="Optional remarks..."
                  value={form.notes}
                  onChange={(e) => setField('notes', toProperCase(e.target.value))}
                />
              </div>
            </div>
          ) : (
            /* ── View mode: transaction fields ── */
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Transaction
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <ViewField label="Date"      value={formatDate(entry.date)} />
                <ViewField label="Cheque No" value={entry.chequeNo} />
                <div className="col-span-2">
                  <ViewField label="Head of Account" value={entry.headOfAccount} />
                </div>
                {entry.notes && (
                  <div className="col-span-2">
                    <span className="text-xs text-slate-400">Notes</span>
                    <p className="mt-0.5 text-sm text-slate-700 leading-relaxed">{entry.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          {editing ? (
            /* Edit mode footer */
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
            /* View mode footer */
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
                  Delete entry
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
    </div>
  );
}
