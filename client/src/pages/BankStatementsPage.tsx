import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSettings }            from '@/context/SettingsContext';
import { useToast }               from '@/context/ToastContext';
import { useAuth }                from '@/context/AuthContext';
import { useEntries }             from '@/hooks/useEntries';
import { useBankStatements }      from '@/hooks/useBankStatements';
import { formatDate }             from '@/utils/formatDate';
import { formatCurrency }         from '@/utils/formatCurrency';
import { parseBankStatement }     from '@/utils/parseBankStatementPdf';
import { parseBankStatementFile } from '@/utils/parseBankStatementFile';
import {
  exportImportedBankStatementPDF,
  exportImportedBankStatementExcel,
} from '@/utils/exportBankStatements';
import {
  apiImportBankStatements,
  apiDeleteBankStatements,
  apiReconcileBankTransaction,
  apiSetOpeningBalance,
} from '@/api/bankStatements';
import { EntrySkeleton }          from '@/components/entries/EntrySkeleton';
import type { BankKey, BankStatementTxn } from '@smp-cashbook/shared';
import type { ParsedBankRow }     from '@/utils/parseBankStatementFile';

// ── Bank account definitions (mirrors BankAccountsPage) ──────────────────────

const BANK_ACCOUNTS = [
  { key: 'sbi_ppl'        as BankKey, label: 'SBI PPL Account',            shortLabel: 'SBI PPL',         color: 'blue'   },
  { key: 'can_bank_pd'    as BankKey, label: 'Canara Bank PD Account',      shortLabel: 'Can Bank PD',     color: 'purple' },
  { key: 'can_bank_scholar' as BankKey, label: 'Canara Bank Scholar Account', shortLabel: 'Can Bank Scholar', color: 'indigo' },
] as const;

type BankColor = 'blue' | 'purple' | 'indigo';

const TAB_ACTIVE: Record<BankColor, string> = {
  blue:   'bg-blue-600   text-white border-blue-600',
  purple: 'bg-purple-600 text-white border-purple-600',
  indigo: 'bg-indigo-600 text-white border-indigo-600',
};
const TAB_INACTIVE: Record<BankColor, string> = {
  blue:   'bg-white text-slate-600 border-slate-200 hover:border-blue-300   hover:text-blue-600',
  purple: 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-600',
  indigo: 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600',
};
const THEAD_BG: Record<BankColor, string> = {
  blue: 'bg-blue-50', purple: 'bg-purple-50', indigo: 'bg-indigo-50',
};
const BORDER_COLOR: Record<BankColor, string> = {
  blue: 'border-blue-200', purple: 'border-purple-200', indigo: 'border-indigo-200',
};

function openingDateLabel(fy: string) {
  return `01 Apr ${fy.split('-')[0]}`;
}

// ── Import modal ──────────────────────────────────────────────────────────────

interface ImportModalProps {
  open:          boolean;
  onClose:       () => void;
  bankLabel:     string;
  bankKey:       BankKey;
  financialYear: string;
  existingTxns:  BankStatementTxn[];
  onImported:    () => void;
}

function txnFingerprint(row: { date: string; debit: number; credit: number; balance: number }) {
  return `${row.date}|${row.debit}|${row.credit}|${row.balance}`;
}

function ImportModal({
  open, onClose, bankLabel, bankKey, financialYear, existingTxns, onImported,
}: ImportModalProps) {
  const { addToast }   = useToast();
  const { user }       = useAuth();

  const [file, setFile]               = useState<File | null>(null);
  const [dragging, setDragging]       = useState(false);
  const [parsing, setParsing]         = useState(false);
  const [parsedRows, setParsedRows]   = useState<ParsedBankRow[] | null>(null);
  const [importing, setImporting]     = useState(false);
  const [overwriteOk, setOverwriteOk] = useState(false);

  const hasExisting = existingTxns.length > 0;
  const existingKeys = useMemo(
    () => new Set(existingTxns.map(txnFingerprint)),
    [existingTxns],
  );
  const newRows = useMemo(
    () => parsedRows?.filter(r => !existingKeys.has(txnFingerprint(r))) ?? [],
    [parsedRows, existingKeys],
  );
  const skippedCount = (parsedRows?.length ?? 0) - newRows.length;
  // All uploaded rows already exist in the DB
  const allAlreadyExist = hasExisting && !!parsedRows && newRows.length === 0;

  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setParsedRows(null); setOverwriteOk(false);
  };
  const handleClose = () => { reset(); onClose(); };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleParse(f: File) {
    setParsing(true);
    setOverwriteOk(false);
    try {
      let rows: ParsedBankRow[];
      if (f.name.toLowerCase().endsWith('.pdf')) {
        rows = await parseBankStatement(f);
      } else {
        const result = await parseBankStatementFile(f);
        rows = result.rows;
        if (result.errors.length > 0 && rows.length === 0) {
          addToast(`No valid rows parsed. Check file format.`, 'error');
          return;
        }
      }
      if (!rows.length) {
        addToast('No transactions found. Check the file format.', 'error');
        return;
      }
      setParsedRows(rows);
    } catch {
      addToast('Failed to parse file. Ensure it is a valid bank statement.', 'error');
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!parsedRows || !user) return;
    setImporting(true);
    // When the user explicitly overrides ("Proceed Anyway"), save all parsed rows.
    // Otherwise save only the rows that are genuinely new (not already in Firestore).
    const rowsToSave = allAlreadyExist && overwriteOk ? parsedRows : newRows;
    try {
      const result = await apiImportBankStatements({
        financialYear,
        bankKey,
        transactions: rowsToSave.map((r, i) => ({
          ...r,
          seq: i,
          bankKey,
          financialYear,
          reconciledEntryId: '',
        })),
      });
      addToast(`${result.imported} transaction${result.imported !== 1 ? 's' : ''} imported.`, 'success');
      reset();
      onImported();
      onClose();
    } catch {
      addToast('Failed to save transactions. Please try again.', 'error');
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  const dateRange = parsedRows && parsedRows.length > 0
    ? `${formatDate(parsedRows[0].date)} – ${formatDate(parsedRows[parsedRows.length - 1].date)}`
    : '';

  const totalDebit  = parsedRows?.reduce((s, r) => s + r.debit,  0) ?? 0;
  const totalCredit = parsedRows?.reduce((s, r) => s + r.credit, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ animation: 'modal-enter 0.22s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <h3 className="text-sm font-bold text-white">Import Bank Statement — {bankLabel}</h3>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors"
          >×</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">

          {/* Upload zone */}
          {!parsedRows && (
            <div>
              <div
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 px-6 cursor-pointer transition-colors ${
                  dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-300 hover:bg-slate-50'
                }`}
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                  e.preventDefault(); setDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) { setFile(f); }
                }}
              >
                <svg className="h-10 w-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {file ? (
                  <p className="text-sm font-semibold text-blue-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-600">Drop a bank statement file here</p>
                    <p className="text-xs text-slate-400 mt-1">PDF, CSV, XLS, or XLSX</p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.csv,.xls,.xlsx"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }}
                />
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <button onClick={handleClose}
                  className="rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => file && handleParse(file)}
                  disabled={!file || parsing}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {parsing && (
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  )}
                  {parsing ? 'Parsing…' : 'Parse Statement'}
                </button>
              </div>
            </div>
          )}

          {/* Preview section */}
          {parsedRows && (
            <>
              {/* All rows already exist → block + "Proceed Anyway" override */}
              {allAlreadyExist && !overwriteOk && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                  <svg className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800">
                      Transactions already exist for {bankLabel} in {financialYear}.
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      All {parsedRows!.length} rows in this file are already imported. To replace existing data, delete it first from the statement view.
                    </p>
                  </div>
                  <button
                    onClick={() => setOverwriteOk(true)}
                    className="shrink-0 rounded-md bg-amber-100 border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 transition-colors"
                  >
                    Proceed Anyway
                  </button>
                </div>
              )}
              {allAlreadyExist && overwriteOk && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2">
                  <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-semibold text-green-700">Overwrite confirmed — all {parsedRows!.length} rows will be re-added</span>
                </div>
              )}

              {/* Some new rows + some skipped → info banner, no confirmation needed */}
              {hasExisting && !allAlreadyExist && skippedCount > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <svg className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-blue-800">
                    <span className="font-semibold">{skippedCount} row{skippedCount !== 1 ? 's' : ''} already imported</span>
                    {' '}and will be skipped.{' '}
                    <span className="font-semibold">{newRows.length} new transaction{newRows.length !== 1 ? 's' : ''}</span>
                    {' '}will be added.
                  </p>
                </div>
              )}

              {/* Summary card */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">{parsedRows.length} transactions in file</span>
                  {dateRange && <span>{dateRange}</span>}
                  <span className="text-green-700 font-medium">Dr {formatCurrency(totalDebit)}</span>
                  <span className="text-red-700 font-medium">Cr {formatCurrency(totalCredit)}</span>
                </div>
                <button
                  onClick={reset}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Change file
                </button>
              </div>

              {/* Preview table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs table-fixed">
                    <colgroup>
                      <col className="w-[90px]"/>
                      <col/>
                      <col className="w-[110px]"/>
                      <col className="w-[90px]"/>
                      <col className="w-[90px]"/>
                      <col className="w-[100px]"/>
                    </colgroup>
                    <thead className="sticky top-0 bg-slate-100 z-[1]">
                      <tr>
                        {['Date','Narration','Cheque / Ref','Debit (Dr)','Credit (Cr)','Balance'].map(h => (
                          <th key={h} className="px-2 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap first:pl-3 last:pr-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-2 text-slate-600 whitespace-nowrap pl-3">{formatDate(row.date)}</td>
                          <td className="px-2 py-2 text-slate-700 truncate max-w-0">
                            <span className="block truncate" title={row.narration}>{row.narration || '—'}</span>
                          </td>
                          <td className="px-2 py-2 text-slate-500">{row.chequeNo || '—'}</td>
                          <td className="px-2 py-2 text-right font-medium">
                            {row.debit > 0
                              ? <span className="text-green-700">{formatCurrency(row.debit)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right font-medium">
                            {row.credit > 0
                              ? <span className="text-red-700">{formatCurrency(row.credit)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold text-slate-800 pr-3">
                            {formatCurrency(row.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {parsedRows && (
          <div className="border-t border-slate-100 px-5 py-3 flex justify-end gap-2 bg-slate-50/60 shrink-0">
            <button onClick={handleClose}
              className="rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={importing || (allAlreadyExist && !overwriteOk)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {importing && (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {importing
                ? 'Saving…'
                : allAlreadyExist && overwriteOk
                  ? `Re-add ${parsedRows.length} Transactions`
                  : `Save ${newRows.length > 0 ? newRows.length : parsedRows.length} Transaction${(newRows.length > 0 ? newRows.length : parsedRows.length) !== 1 ? 's' : ''}`
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reconciliation popover (match a bank row to a Cash Book entry) ────────────

interface ReconPopoverProps {
  txn:          BankStatementTxn;
  candidates:   import('@smp-cashbook/shared').Entry[];
  onMatch:      (entryId: string) => void;
  onClear:      () => void;
  onClose:      () => void;
}

function ReconPopover({ txn, candidates, onMatch, onClear, onClose }: ReconPopoverProps) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-recon-popover]')) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      data-recon-popover
      className="absolute right-0 top-full mt-1 z-30 w-72 rounded-xl border border-slate-200 bg-white shadow-xl"
      style={{ animation: 'content-enter 0.15s ease-out' }}
    >
      <div className="px-3 py-2 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-700">Match to Cash Book Entry</p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          {txn.debit > 0
            ? `Debit ${formatCurrency(txn.debit)} on ${formatDate(txn.date)}`
            : `Credit ${formatCurrency(txn.credit)} on ${formatDate(txn.date)}`}
        </p>
      </div>
      <div className="max-h-40 overflow-y-auto py-1">
        {candidates.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-400">No matching Cash Book entries found.</p>
        ) : (
          candidates.map(e => (
            <button
              key={e.id}
              onClick={() => onMatch(e.id)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors ${
                txn.reconciledEntryId === e.id ? 'bg-green-50 text-green-700 font-medium' : 'text-slate-700'
              }`}
            >
              <span className="font-medium">{formatDate(e.date)}</span>
              {' · '}
              {formatCurrency(e.amount)}
              {' · '}
              <span className="text-slate-500 truncate">{e.headOfAccount}</span>
            </button>
          ))
        )}
      </div>
      {txn.reconciledEntryId && (
        <div className="border-t border-slate-100 px-3 py-2">
          <button
            onClick={onClear}
            className="text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            Clear match
          </button>
        </div>
      )}
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteConfirmModal({
  open, bankLabel, count, onConfirm, onClose, loading,
}: {
  open: boolean; bankLabel: string; count: number;
  onConfirm: () => void; onClose: () => void; loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
        style={{ animation: 'modal-enter 0.2s ease-out' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Delete all statement data?</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {count} transaction{count !== 1 ? 's' : ''} from {bankLabel} will be permanently deleted.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="rounded-md bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
            {loading ? 'Deleting…' : 'Delete All'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function BankStatementsPage() {
  const { settings }                = useSettings();
  const { addToast }                = useToast();
  const [selectedKey, setSelectedKey] = useState<BankKey>('sbi_ppl');
  const [showImport, setShowImport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [reconcileMode, setReconcileMode] = useState(false);
  const [reconPopoverTxnId, setReconPopoverTxnId] = useState<string | null>(null);
  const [autoMatching, setAutoMatching]             = useState(false);
  const [editingOpeningBal, setEditingOpeningBal]   = useState(false);
  const [openingBalInput, setOpeningBalInput]       = useState('');
  const [savingOpeningBal, setSavingOpeningBal]     = useState(false);

  const bank = BANK_ACCOUNTS.find(b => b.key === selectedKey)!;
  const fy   = settings.activeFinancialYear;

  const { transactions, openingBalanceOverride, loading } = useBankStatements(fy, selectedKey);

  // Load Cash Book entries for reconciliation (all types)
  const { entries } = useEntries(fy, settings.activeCashBookType);

  // Bank entries = entries for this bank account only
  const bankHeads: Record<BankKey, string> = {
    sbi_ppl:          'Sbi Ppl',
    can_bank_pd:      'Can Bank Pd',
    can_bank_scholar: 'Can Bank Scholor',
  };
  const relevantEntries = useMemo(
    () => entries.filter(e => {
      const head = bankHeads[selectedKey].toLowerCase();
      const eHead = e.headOfAccount.toLowerCase();
      return eHead === head || eHead.includes(head) || head.includes(eHead);
    }),
    [entries, selectedKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const totalDebit  = useMemo(() => transactions.reduce((s, t) => s + t.debit,  0), [transactions]);
  const totalCredit = useMemo(() => transactions.reduce((s, t) => s + t.credit, 0), [transactions]);
  const matchedCount = useMemo(() => transactions.filter(t => t.reconciledEntryId).length, [transactions]);

  const computedOpeningBalance = useMemo(() => {
    if (!transactions.length) return 0;
    const first = transactions[0];
    return first.balance - first.credit + first.debit;
  }, [transactions]);
  const openingBalance = openingBalanceOverride ?? computedOpeningBalance;
  // Shift all imported balances by this delta when the opening balance is overridden
  const balanceDelta = openingBalance - computedOpeningBalance;

  const closingBalance = transactions.length
    ? transactions[transactions.length - 1].balance + balanceDelta
    : 0;

  // ── Export params ────────────────────────────────────────────────────────────
  const exportParams = useMemo(() => ({
    bankLabel:      bank.label,
    financialYear:  fy,
    openingBalance,
    openingDateStr: openingDateLabel(fy),
    transactions,
    totalDebit,
    totalCredit,
    closingBalance,
  }), [bank.label, fy, openingBalance, transactions, totalDebit, totalCredit, closingBalance]);

  // ── Auto-match ───────────────────────────────────────────────────────────────
  const handleAutoMatch = useCallback(async () => {
    const unmatched = transactions.filter(t => !t.reconciledEntryId);
    if (!unmatched.length) { addToast('All transactions already matched.', 'success'); return; }

    setAutoMatching(true);
    let matched = 0;

    for (const txn of unmatched) {
      // Bank debit (withdrawal) ↔ Cash Book Receipt (money from bank into cash book)
      // Bank credit (deposit)   ↔ Cash Book Payment (money paid out from cash book)
      const targetType = txn.debit > 0 ? 'Receipt' : 'Payment';
      const targetAmt  = txn.debit > 0 ? txn.debit : txn.credit;
      const txnDate    = new Date(txn.date).getTime();

      const candidate = relevantEntries.find(e => {
        if (e.type !== targetType) return false;
        if (Math.abs(e.amount - targetAmt) > 0.01) return false;
        const diff = Math.abs(new Date(e.date).getTime() - txnDate);
        return diff <= 3 * 86400000; // ±3 days
      });

      if (candidate) {
        try {
          await apiReconcileBankTransaction(fy, selectedKey, txn.id, candidate.id);
          matched++;
        } catch { /* continue */ }
      }
    }

    setAutoMatching(false);
    addToast(
      matched > 0
        ? `Auto-matched ${matched} transaction${matched !== 1 ? 's' : ''}.`
        : 'No automatic matches found.',
      matched > 0 ? 'success' : 'info',
    );
  }, [transactions, relevantEntries, fy, selectedKey, addToast]);

  // ── Manual reconcile ─────────────────────────────────────────────────────────
  const handleManualMatch = useCallback(async (txn: BankStatementTxn, entryId: string) => {
    try {
      await apiReconcileBankTransaction(fy, selectedKey, txn.id, entryId);
      setReconPopoverTxnId(null);
    } catch {
      addToast('Failed to save match.', 'error');
    }
  }, [fy, selectedKey, addToast]);

  const handleClearMatch = useCallback(async (txn: BankStatementTxn) => {
    try {
      await apiReconcileBankTransaction(fy, selectedKey, txn.id, '');
      setReconPopoverTxnId(null);
    } catch {
      addToast('Failed to clear match.', 'error');
    }
  }, [fy, selectedKey, addToast]);

  // ── Candidate entries for a given bank transaction ───────────────────────────
  function getCandidates(txn: BankStatementTxn) {
    const targetType = txn.debit > 0 ? 'Receipt' : 'Payment';
    const targetAmt  = txn.debit > 0 ? txn.debit : txn.credit;
    const txnDate    = new Date(txn.date).getTime();
    return relevantEntries.filter(e => {
      if (e.type !== targetType) return false;
      if (Math.abs(e.amount - targetAmt) > 0.01) return false;
      const diff = Math.abs(new Date(e.date).getTime() - txnDate);
      return diff <= 7 * 86400000; // ±7 days for manual browse
    });
  }

  // ── Opening balance edit ─────────────────────────────────────────────────────
  const startEditOpeningBal = () => {
    setOpeningBalInput(openingBalance.toFixed(2));
    setEditingOpeningBal(true);
  };
  const cancelEditOpeningBal = () => setEditingOpeningBal(false);
  const commitOpeningBal = async () => {
    const val = parseFloat(openingBalInput);
    if (isNaN(val)) { cancelEditOpeningBal(); return; }
    setSavingOpeningBal(true);
    try {
      await apiSetOpeningBalance(fy, selectedKey, val);
      setEditingOpeningBal(false);
    } catch {
      addToast('Failed to save opening balance.', 'error');
    } finally {
      setSavingOpeningBal(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const r = await apiDeleteBankStatements(fy, selectedKey);
      addToast(`Deleted ${r.deleted} transactions.`, 'success');
      setShowDelete(false);
    } catch {
      addToast('Failed to delete transactions.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const theadBg  = THEAD_BG[bank.color as BankColor];
  const borderCl = BORDER_COLOR[bank.color as BankColor];

  return (
    <div className="w-full pb-6" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 mb-0">
        <div className="flex items-center justify-between gap-4">

          {/* Bank tabs */}
          <div className="flex items-center gap-1.5">
            {BANK_ACCOUNTS.map(b => {
              const isActive = b.key === selectedKey;
              const cnt      = b.key === selectedKey ? transactions.length : undefined;
              return (
                <button
                  key={b.key}
                  onClick={() => { setSelectedKey(b.key); setReconPopoverTxnId(null); }}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium
                    transition-colors whitespace-nowrap
                    ${isActive
                      ? TAB_ACTIVE[b.color as BankColor]
                      : TAB_INACTIVE[b.color as BankColor]}`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  {b.shortLabel}
                  {cnt !== undefined && cnt > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>{cnt}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400 hidden sm:inline">{fy} · {settings.activeCashBookType}</span>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 border border-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import
            </button>
          </div>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <EntrySkeleton />
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && transactions.length === 0 && (
        <div className="mt-8 flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <svg className="h-7 w-7 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-700">No statement imported yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Import a bank statement PDF, CSV, or Excel file for {bank.label} to get started.
          </p>
          <button
            onClick={() => setShowImport(true)}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Import Statement
          </button>
        </div>
      )}

      {/* ── Statement view ── */}
      {!loading && transactions.length > 0 && (
        <div className={`rounded-b-xl border-x border-b ${borderCl}`}>

          {/* Statement toolbar */}
          <div className="sticky top-[54px] z-10 px-5 py-2.5 bg-white border-b border-slate-100
            flex items-center justify-between flex-wrap gap-3">

            <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
              {/* Closing balance chip */}
              <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${
                closingBalance >= 0 ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'
              }`}>
                <span className={closingBalance >= 0 ? 'text-blue-500' : 'text-orange-500'}>Closing Balance</span>
                <span className={`font-semibold ${closingBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                  {formatCurrency(Math.abs(closingBalance))}{closingBalance < 0 ? ' Dr' : ''}
                </span>
              </div>

              {/* Reconciliation stats */}
              {reconcileMode && (
                <div className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-1">
                  <svg className="h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-700 font-medium">{matchedCount}/{transactions.length} matched</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Reconcile toggle */}
              <button
                onClick={() => { setReconcileMode(m => !m); setReconPopoverTxnId(null); }}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium
                  transition-colors whitespace-nowrap ${
                  reconcileMode
                    ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-600'
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Reconcile
              </button>

              {/* Auto-match */}
              {reconcileMode && (
                <button
                  onClick={handleAutoMatch}
                  disabled={autoMatching}
                  className="flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {autoMatching
                    ? <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>}
                  Auto-match
                </button>
              )}

              {/* Export PDF */}
              <button
                onClick={() => exportImportedBankStatementPDF(exportParams)}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5
                  text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600
                  hover:bg-red-50 transition-colors whitespace-nowrap"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                PDF
              </button>

              {/* Export Excel */}
              <button
                onClick={() => exportImportedBankStatementExcel(exportParams)}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5
                  text-xs font-medium text-slate-600 hover:border-green-300 hover:text-green-700
                  hover:bg-green-50 transition-colors whitespace-nowrap"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 10h18M3 6h18M3 14h18M3 18h18" />
                </svg>
                Excel
              </button>

              {/* Delete */}
              <button
                onClick={() => setShowDelete(true)}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5
                  text-xs font-medium text-slate-400 hover:border-red-300 hover:text-red-500
                  hover:bg-red-50 transition-colors"
                title="Delete all imported data for this bank"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* Statement table */}
          <div className="bg-white">
            <table className="w-full text-left text-sm table-fixed">
              <colgroup>
                <col className="w-[100px]"/>
                <col/>
                <col className="w-[110px]"/>
                <col className="w-[130px]"/>
                <col className="w-[130px]"/>
                <col className="w-[130px]"/>
                {reconcileMode && <col className="w-[160px]"/>}
              </colgroup>

              <thead className="sticky top-[98px] z-[5]">
                <tr className={`border-b border-${bank.color}-100 ${theadBg}`}>
                  {['Date','Narration','Cheque / Ref','Debit (Dr)','Credit (Cr)','Balance'].map((h, i) => (
                    <th key={h} className={`py-2 text-xs font-semibold text-slate-600 whitespace-nowrap ${
                      i === 0 ? 'pl-5 pr-2' : i === 5 ? 'pl-2 pr-2' : 'px-2'
                    } ${i >= 3 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                  {reconcileMode && (
                    <th className="pl-2 pr-5 py-2 text-xs font-semibold text-teal-600 whitespace-nowrap">
                      Cash Book Match
                    </th>
                  )}
                </tr>

                {/* Opening balance row */}
                <tr className={`border-b-2 border-${bank.color}-100 bg-blue-50/60`}>
                  <td className="py-2 pl-5 pr-2 text-xs text-slate-500 whitespace-nowrap">
                    {openingDateLabel(fy)}
                  </td>
                  <td colSpan={2} className="px-2 py-2 text-xs font-semibold text-slate-600">Opening Balance</td>
                  <td className="px-2 py-2 text-xs font-semibold text-right text-slate-300">—</td>
                  <td className="px-2 py-2 text-xs font-semibold text-right text-blue-700">
                    {formatCurrency(openingBalance)}
                  </td>
                  <td className="pl-2 pr-2 py-2 text-xs font-semibold text-right text-blue-700">
                    {editingOpeningBal ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          value={openingBalInput}
                          onChange={e => setOpeningBalInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitOpeningBal();
                            if (e.key === 'Escape') cancelEditOpeningBal();
                          }}
                          onBlur={commitOpeningBal}
                          disabled={savingOpeningBal}
                          className="w-28 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-xs text-right font-semibold text-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-60"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={startEditOpeningBal}
                        className="group inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-blue-100 transition-colors"
                        title="Edit opening balance"
                      >
                        {formatCurrency(openingBalance)}
                        <svg className="h-3 w-3 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.828A2 2 0 019.999 14H8v-1.999a2 2 0 01.586-1.415z" />
                        </svg>
                      </button>
                    )}
                  </td>
                  {reconcileMode && <td className="pl-2 pr-5" />}
                </tr>
              </thead>

              <tbody>
                {transactions.map(txn => {
                  const isMatched = !!txn.reconciledEntryId;
                  const matchedEntry = isMatched
                    ? relevantEntries.find(e => e.id === txn.reconciledEntryId)
                    : null;
                  const isPopoverOpen = reconPopoverTxnId === txn.id;

                  return (
                    <tr
                      key={txn.id}
                      className={`border-b border-slate-100 transition-colors ${
                        reconcileMode && isMatched
                          ? 'bg-teal-50/40 hover:bg-teal-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 pl-5 pr-2 text-xs text-slate-600 whitespace-nowrap">
                        {formatDate(txn.date)}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-700 overflow-hidden max-w-0">
                        <span className="block truncate" title={txn.narration}>{txn.narration || '—'}</span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {txn.chequeNo || '—'}
                      </td>
                      <td className="px-2 py-2.5 text-xs font-medium text-right whitespace-nowrap">
                        {txn.debit > 0
                          ? <span className="text-green-700">{formatCurrency(txn.debit)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2.5 text-xs font-medium text-right whitespace-nowrap">
                        {txn.credit > 0
                          ? <span className="text-red-700">{formatCurrency(txn.credit)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`pl-2 pr-2 py-2.5 text-xs font-semibold text-right whitespace-nowrap ${
                        (txn.balance + balanceDelta) >= 0 ? 'text-slate-800' : 'text-orange-700'
                      }`}>
                        {formatCurrency(Math.abs(txn.balance + balanceDelta))}{(txn.balance + balanceDelta) < 0 ? ' Dr' : ''}
                      </td>

                      {reconcileMode && (
                        <td className="pl-2 pr-5 py-2.5">
                          <div className="relative">
                            <button
                              onClick={() => setReconPopoverTxnId(isPopoverOpen ? null : txn.id)}
                              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                                isMatched
                                  ? 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                              }`}
                              title={isMatched ? `Matched: ${matchedEntry?.headOfAccount}` : 'Click to match'}
                            >
                              {isMatched ? (
                                <>
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                  {matchedEntry ? formatDate(matchedEntry.date) : 'Matched'}
                                </>
                              ) : (
                                <>
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                                  </svg>
                                  Unmatched
                                </>
                              )}
                            </button>

                            {isPopoverOpen && (
                              <ReconPopover
                                txn={txn}
                                candidates={getCandidates(txn)}
                                onMatch={entryId => handleManualMatch(txn, entryId)}
                                onClear={() => handleClearMatch(txn)}
                                onClose={() => setReconPopoverTxnId(null)}
                              />
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={3} className="py-2.5 pl-5 pr-2 text-xs font-semibold text-slate-600 whitespace-nowrap">
                    {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-2 py-2.5 text-xs font-bold text-right text-green-700 whitespace-nowrap">
                    {formatCurrency(totalDebit)}
                  </td>
                  <td className="px-2 py-2.5 text-xs font-bold text-right text-red-700 whitespace-nowrap">
                    {formatCurrency(totalCredit)}
                  </td>
                  <td className={`pl-2 pr-2 py-2.5 text-xs font-bold text-right whitespace-nowrap ${
                    closingBalance >= 0 ? 'text-blue-700' : 'text-orange-700'
                  }`}>
                    {formatCurrency(Math.abs(closingBalance))}{closingBalance < 0 ? ' Dr' : ''}
                  </td>
                  {reconcileMode && (
                    <td className="pl-2 pr-5 py-2.5 text-xs font-semibold text-teal-700 whitespace-nowrap">
                      {matchedCount}/{transactions.length} matched
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Import modal ── */}
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        bankLabel={bank.label}
        bankKey={selectedKey}
        financialYear={fy}
        existingTxns={transactions}
        onImported={() => {}}
      />

      {/* ── Delete confirm ── */}
      <DeleteConfirmModal
        open={showDelete}
        bankLabel={bank.label}
        count={transactions.length}
        onConfirm={handleDelete}
        onClose={() => setShowDelete(false)}
        loading={deleting}
      />
    </div>
  );
}
