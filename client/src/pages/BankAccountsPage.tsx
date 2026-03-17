import { useState, useEffect, useMemo, useCallback } from 'react';
import { useEntries } from '@/hooks/useEntries';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { apiGetBankOpeningBalances, apiSetBankOpeningBalance } from '@/api/bankBalances';
import { EntrySkeleton } from '@/components/entries/EntrySkeleton';
import { exportBankStatementPDF, exportBankStatementExcel } from '@/utils/exportEntries';
import type { Entry } from '@smp-cashbook/shared';

// ── Bank account definitions ──────────────────────────────────────────────────

const BANK_ACCOUNTS = [
  {
    key:          'sbi_ppl',
    label:        'SBI PPL Account',
    shortLabel:   'SBI PPL',
    headOfAccount: 'Sbi Ppl',
    color:        'blue',
  },
  {
    key:          'can_bank_pd',
    label:        'Canara Bank PD Account',
    shortLabel:   'Can Bank PD',
    headOfAccount: 'Can Bank Pd',
    color:        'purple',
  },
  {
    key:          'can_bank_scholar',
    label:        'Canara Bank Scholar Account',
    shortLabel:   'Can Bank Scholar',
    headOfAccount: 'Can Bank Scholor',
    color:        'indigo',
  },
] as const;

type BankKey = (typeof BANK_ACCOUNTS)[number]['key'];
type BankColor = (typeof BANK_ACCOUNTS)[number]['color'];

/** Case-insensitive fuzzy match — handles suffix/case variations. */
function matchesBankHead(entryHead: string, bankHead: string): boolean {
  const a = entryHead.toLowerCase().trim();
  const b = bankHead.toLowerCase().trim();
  return a === b || a.includes(b) || b.includes(a);
}

/** "01 Apr YYYY" for a financial year like "2025-26" */
function openingDateLabel(financialYear: string): string {
  return `01 Apr ${financialYear.split('-')[0]}`;
}

interface StatementRow {
  id:           string;
  date:         string;
  narration:    string;
  chequeNo:     string;
  cashBookType: import('@smp-cashbook/shared').CashBookType;
  debit:        number;   // Receipt → cash drawn FROM bank → balance ↓
  credit:       number;   // Payment → cash deposited TO bank → balance ↑
  balance:      number;   // running balance after this row
}

// ── Color maps ────────────────────────────────────────────────────────────────

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
const SECTION_BORDER: Record<BankColor, string> = {
  blue:   'border-blue-200',
  purple: 'border-purple-200',
  indigo: 'border-indigo-200',
};
const THEAD_BG: Record<BankColor, string> = {
  blue:   'bg-blue-50',
  purple: 'bg-purple-50',
  indigo: 'bg-indigo-50',
};
const THEAD_BORDER: Record<BankColor, string> = {
  blue:   'border-blue-100',
  purple: 'border-purple-100',
  indigo: 'border-indigo-100',
};

// ── Opening Balance Editor ────────────────────────────────────────────────────

function OpeningBalanceEditor({
  accountKey, financialYear, value: externalValue, onSaved,
}: {
  accountKey: BankKey;
  financialYear: string;
  value: number;
  onSaved: (balance: number) => void;
}) {
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [saving, setSaving] = useState(false);

  const openEdit = () => {
    setInputVal(externalValue === 0 ? '' : String(externalValue));
    setEditing(true);
  };
  const handleCancel = () => setEditing(false);

  const handleSave = async () => {
    const num = parseFloat(inputVal || '0');
    if (isNaN(num) || num < 0) { addToast('Enter a valid non-negative amount', 'error'); return; }
    setSaving(true);
    try {
      await apiSetBankOpeningBalance(financialYear, accountKey, num);
      onSaved(num);
      setEditing(false);
      addToast('Opening balance saved', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to save opening balance', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">Opening Balance as on {openingDateLabel(financialYear)}:</span>
        <span className="text-xs text-slate-400">₹</span>
        <input
          type="number" min="0" step="0.01" placeholder="0.00"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          autoFocus
          className="w-36 rounded-md border border-blue-300 px-2 py-1 text-sm font-medium
            text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={handleSave} disabled={saving}
          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white
            hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handleCancel} disabled={saving}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium
            text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">Opening Balance as on {openingDateLabel(financialYear)}:</span>
      <span className="text-sm font-semibold text-blue-700">{formatCurrency(externalValue)}</span>
      <button
        onClick={openEdit}
        className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5
          text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        Edit
      </button>
    </div>
  );
}

// ── Statement table ───────────────────────────────────────────────────────────

function StatementTable({
  bank, entries, financialYear, openingBalance, onOpeningBalanceChange, showCashBookBadge,
}: {
  bank: (typeof BANK_ACCOUNTS)[number];
  entries: Entry[];
  financialYear: string;
  openingBalance: number;
  onOpeningBalanceChange: (key: BankKey, bal: number) => void;
  showCashBookBadge: boolean;
}) {
  const bankEntries = useMemo(
    () =>
      entries
        .filter((e) => matchesBankHead(e.headOfAccount, bank.headOfAccount))
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          // Within same date: Credits (Payment) before Debits (Receipt),
          // and among Credits sort highest first — avoids interim negative balance.
          const aCredit = a.type === 'Payment' ? 1 : 0;
          const bCredit = b.type === 'Payment' ? 1 : 0;
          if (aCredit !== bCredit) return bCredit - aCredit;
          if (aCredit === 1) return b.amount - a.amount; // largest credit first
          return a.amount - b.amount;                    // smallest debit first
        }),
    [entries, bank.headOfAccount],
  );

  const rows: StatementRow[] = useMemo(() => {
    let running = openingBalance;
    return bankEntries.map((e) => {
      const debit  = e.type === 'Receipt' ? e.amount : 0;
      const credit = e.type === 'Payment' ? e.amount : 0;
      // Receipt = cash drawn FROM bank = Withdrawal = Debit → balance decreases
      // Payment = cash deposited TO bank = Deposit  = Credit → balance increases
      running = running + credit - debit;
      return {
        id:           e.id,
        date:         e.date,
        narration:    e.notes.trim() || '—',
        chequeNo:     e.chequeNo.trim() || '—',
        cashBookType: e.cashBookType,
        debit, credit, balance: running,
      };
    });
  }, [bankEntries, openingBalance]);

  const totalDebit     = useMemo(() => rows.reduce((s, r) => s + r.debit,  0), [rows]);
  const totalCredit    = useMemo(() => rows.reduce((s, r) => s + r.credit, 0), [rows]);
  const closingBalance = openingBalance + totalCredit - totalDebit;

  const exportParams = useMemo(() => ({
    bankLabel:      bank.label,
    financialYear,
    openingBalance,
    openingDateStr: openingDateLabel(financialYear),
    rows: rows.map(r => ({
      date: r.date, narration: r.narration, chequeNo: r.chequeNo,
      debit: r.debit, credit: r.credit, balance: r.balance,
    })),
    totalDebit,
    totalCredit,
    closingBalance,
  }), [bank.label, financialYear, openingBalance, rows, totalDebit, totalCredit, closingBalance]);

  const theadBg     = THEAD_BG[bank.color];
  const theadBorder = THEAD_BORDER[bank.color];

  return (
    // NOTE: no overflow-hidden here — it would create a new scroll container and break sticky children
    <div className={`rounded-b-xl border-x border-b ${SECTION_BORDER[bank.color]}`}>

      {/* Opening balance editor — sticky just below the tab bar (tab bar ≈ 54 px) */}
      <div className="sticky top-[54px] z-10 px-5 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <OpeningBalanceEditor
          accountKey={bank.key}
          financialYear={financialYear}
          value={openingBalance}
          onSaved={(bal) => onOpeningBalanceChange(bank.key, bal)}
        />
        {/* Right-side: closing balance + export buttons */}
        <div className="flex items-center gap-2">
          {/* Closing balance mini chip */}
          <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${
            closingBalance >= 0 ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'
          }`}>
            <span className={`text-xs ${closingBalance >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>
              Closing Balance
            </span>
            <span className={`text-xs font-semibold ${closingBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
              {formatCurrency(Math.abs(closingBalance))}{closingBalance < 0 ? ' Dr' : ''}
            </span>
          </div>

          {/* Export buttons */}
          <button
            onClick={() => exportBankStatementPDF(exportParams)}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1
              text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600
              hover:bg-red-50 transition-colors whitespace-nowrap"
            title="Export as PDF"
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            PDF
          </button>
          <button
            onClick={() => exportBankStatementExcel(exportParams)}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1
              text-xs font-medium text-slate-600 hover:border-green-300 hover:text-green-700
              hover:bg-green-50 transition-colors whitespace-nowrap"
            title="Export as Excel"
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 10h18M3 6h18M3 14h18M3 18h18" />
            </svg>
            Excel
          </button>
        </div>
      </div>

      {bankEntries.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400 bg-white">
          No transactions found for {bank.label}.
        </div>
      ) : (
        <div className="bg-white">
          <table className="w-full text-left text-sm table-fixed">
            <colgroup>
              <col className="w-[100px]" />
              <col />
              <col className="w-[120px]" />
              <col className="w-[148px]" />
              <col className="w-[148px]" />
              <col className="w-[148px]" />
            </colgroup>

            {/* Both rows sticky together — tab bar ≈54px + opening-balance bar ≈44px = 98px */}
            <thead className="sticky top-[98px] z-[5]">
              {/* Column headers */}
              <tr className={`border-b ${theadBorder} ${theadBg}`}>
                <th className="py-2 pl-5 pr-2 text-xs font-semibold text-slate-600 whitespace-nowrap">Date</th>
                <th className="px-2 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap">Narration</th>
                <th className="px-2 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap">Cheque No</th>
                <th className="px-2 py-2 text-xs font-semibold text-slate-600 text-right whitespace-nowrap">
                  Debit (Receipt)
                </th>
                <th className="px-2 py-2 text-xs font-semibold text-slate-600 text-right whitespace-nowrap">
                  Credit (Payment)
                </th>
                <th className="pl-2 pr-5 py-2 text-xs font-semibold text-slate-600 text-right whitespace-nowrap">
                  Balance
                </th>
              </tr>
              {/* Opening balance row — part of thead so it sticks with the headers */}
              <tr className={`border-b-2 ${theadBorder} bg-blue-50/60`}>
                <td className="py-2 pl-5 pr-2 text-xs text-slate-500 whitespace-nowrap">
                  {openingDateLabel(financialYear)}
                </td>
                <td colSpan={2} className="px-2 py-2 text-xs font-semibold text-slate-600">
                  Opening Balance
                </td>
                <td className="px-2 py-2 text-xs font-semibold text-right whitespace-nowrap text-slate-300">—</td>
                <td className="px-2 py-2 text-xs font-semibold text-right text-blue-700 whitespace-nowrap">
                  {formatCurrency(openingBalance)}
                </td>
                <td className="pl-2 pr-5 py-2 text-xs font-semibold text-right text-blue-700 whitespace-nowrap">
                  {formatCurrency(openingBalance)}
                </td>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 pl-5 pr-2 text-xs text-slate-600 whitespace-nowrap">
                    {formatDate(row.date)}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-slate-700 overflow-hidden max-w-0">
                    <span className="block truncate" title={row.narration}>{row.narration}</span>
                    {showCashBookBadge && (
                      <span className={`mt-0.5 inline-flex rounded px-1.5 py-0 text-[10px] font-semibold leading-4 ${
                        row.cashBookType === 'Aided'
                          ? 'bg-teal-50 text-teal-600'
                          : 'bg-orange-50 text-orange-600'
                      }`}>
                        {row.cashBookType === 'Aided' ? 'Aided' : 'Un-Aided'}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-slate-500 whitespace-nowrap">{row.chequeNo}</td>
                  <td className="px-2 py-2.5 text-xs font-medium text-right whitespace-nowrap">
                    {row.debit > 0
                      ? <span className="text-green-700">{formatCurrency(row.debit)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-xs font-medium text-right whitespace-nowrap">
                    {row.credit > 0
                      ? <span className="text-red-700">{formatCurrency(row.credit)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className={`pl-2 pr-5 py-2.5 text-xs font-semibold text-right whitespace-nowrap ${
                    row.balance >= 0 ? 'text-slate-800' : 'text-orange-700'
                  }`}>
                    {formatCurrency(Math.abs(row.balance))}{row.balance < 0 ? ' Dr' : ''}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={3} className="py-2.5 pl-5 pr-2 text-xs font-semibold text-slate-600 whitespace-nowrap">
                  {rows.length} transaction{rows.length !== 1 ? 's' : ''}
                </td>
                <td className="px-2 py-2.5 text-xs font-bold text-right text-green-700 whitespace-nowrap">
                  {formatCurrency(totalDebit)}
                </td>
                <td className="px-2 py-2.5 text-xs font-bold text-right text-red-700 whitespace-nowrap">
                  {formatCurrency(totalCredit)}
                </td>
                <td className={`pl-2 pr-5 py-2.5 text-xs font-bold text-right whitespace-nowrap ${
                  closingBalance >= 0 ? 'text-blue-700' : 'text-orange-700'
                }`}>
                  {formatCurrency(Math.abs(closingBalance))}{closingBalance < 0 ? ' Dr' : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── BankAccountsPage ──────────────────────────────────────────────────────────

export function BankAccountsPage() {
  const { settings } = useSettings();
  const { entries, loading: entriesLoading } = useEntries(
    settings.activeFinancialYear,
    settings.activeCashBookType,
  );

  const [selectedKey, setSelectedKey] = useState<BankKey>(BANK_ACCOUNTS[0].key);
  const [openingBalances, setOpeningBalances] = useState<Record<BankKey, number>>({
    sbi_ppl: 0, can_bank_pd: 0, can_bank_scholar: 0,
  });
  const [balancesLoading, setBalancesLoading] = useState(true);

  useEffect(() => {
    setBalancesLoading(true);
    apiGetBankOpeningBalances(settings.activeFinancialYear)
      .then((data) => setOpeningBalances((prev) => ({ ...prev, ...(data as Record<BankKey, number>) })))
      .catch(console.error)
      .finally(() => setBalancesLoading(false));
  }, [settings.activeFinancialYear]);

  const handleOpeningBalanceChange = useCallback(
    (key: BankKey, balance: number) => setOpeningBalances((prev) => ({ ...prev, [key]: balance })),
    [],
  );

  // Per-account transaction counts for tab badges
  const countByKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const bank of BANK_ACCOUNTS) {
      map[bank.key] = entries.filter((e) => matchesBankHead(e.headOfAccount, bank.headOfAccount)).length;
    }
    return map;
  }, [entries]);

  const selectedBank = BANK_ACCOUNTS.find((b) => b.key === selectedKey)!;

  if (entriesLoading || balancesLoading) {
    return (
      <div className="w-full animate-fade-in pb-6">
        <div className="rounded-lg border border-slate-200 p-3"><EntrySkeleton /></div>
      </div>
    );
  }

  return (
    <div className="w-full pb-6">

      {/* ── Sticky top bar: account tabs + context ── */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 mb-0">
        <div className="flex items-center justify-between gap-4">

          {/* Account selector tabs */}
          <div className="flex items-center gap-1.5">
            {BANK_ACCOUNTS.map((bank) => {
              const isActive = bank.key === selectedKey;
              return (
                <button
                  key={bank.key}
                  onClick={() => setSelectedKey(bank.key)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium
                    transition-colors whitespace-nowrap
                    ${isActive ? TAB_ACTIVE[bank.color] : TAB_INACTIVE[bank.color]}`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  {bank.shortLabel}
                  {countByKey[bank.key] > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {countByKey[bank.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* FY + cashBookType context */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
            <span className="font-medium text-slate-600">{settings.activeFinancialYear}</span>
            <span>·</span>
            <span>{settings.activeCashBookType}</span>
          </div>
        </div>
      </div>

      {/* ── Selected bank statement ── */}
      <StatementTable
        bank={selectedBank}
        entries={entries}
        financialYear={settings.activeFinancialYear}
        openingBalance={openingBalances[selectedKey] ?? 0}
        onOpeningBalanceChange={handleOpeningBalanceChange}
        showCashBookBadge={settings.activeCashBookType === 'Both'}
      />

    </div>
  );
}
