import { useMemo, useState } from 'react';
import { useEntries } from '@/hooks/useEntries';
import { useSettings } from '@/context/SettingsContext';
import { formatCurrency } from '@/utils/formatCurrency';
import type { Entry } from '@smp-cashbook/shared';
import {
  isSalaryEntry,
  buildSalaryGroups,
  buildSalaryRows,
  monthLabel,
  exportSalaryRegisterPDF,
  exportSalaryRegisterExcel,
  type SalaryType,
} from '@/utils/salaryRegister';
import { EntrySkeleton } from '@/components/entries/EntrySkeleton';

// Canonical display order for deduction heads on both sides
const DEDUCTION_ORDER = ['i tax', 'p tax', 'lic', 'gslic', 'fbf'];
function deductionRank(e: Entry) {
  const idx = DEDUCTION_ORDER.indexOf(e.headOfAccount.toLowerCase());
  return idx === -1 ? 99 : idx;
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function EntryLine({ e, color, showCashBookBadge }: { e: Entry; color: 'green' | 'red'; showCashBookBadge?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-1.5 hover:bg-slate-50/60 transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-700 truncate">{e.headOfAccount}</span>
          {showCashBookBadge && (
            <span className={`inline-flex shrink-0 rounded px-1.5 py-0 text-[10px] font-semibold leading-4 ${
              e.cashBookType === 'Aided' ? 'bg-teal-50 text-teal-600' : 'bg-orange-50 text-orange-600'
            }`}>
              {e.cashBookType === 'Aided' ? 'Aided' : 'Un-Aided'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={`text-[11px] font-semibold tabular-nums ${
            color === 'green' ? 'text-green-600' : 'text-red-500'
          }`}>
            {fmtDate(e.date)}
          </span>
          {e.notes && (
            <span className="text-[11px] text-slate-500 truncate">{e.notes}</span>
          )}
        </div>
      </div>
      <span className={`text-xs font-semibold shrink-0 tabular-nums ${
        color === 'green' ? 'text-green-700' : 'text-red-700'
      }`}>
        {formatCurrency(e.amount)}
      </span>
    </div>
  );
}

const TYPE_BADGE: Record<SalaryType, { label: string; cls: string }> = {
  'Regular':       { label: 'Salary',        cls: 'bg-slate-100 text-slate-500' },
  'DA Arrears':    { label: 'DA Arrears',     cls: 'bg-amber-100 text-amber-700' },
  'EL Encashment': { label: 'EL Encashment',  cls: 'bg-purple-100 text-purple-700' },
};

const GRANT_LABEL: Record<SalaryType, string> = {
  'Regular':       'Salary Grant',
  'DA Arrears':    'DA Arrears Grant',
  'EL Encashment': 'EL Encashment Grant',
};

const DISBURSE_LABEL: Record<SalaryType, string> = {
  'Regular':       'Salary Disbursed',
  'DA Arrears':    'DA Arrears Disbursed',
  'EL Encashment': 'EL Encashment Disbursed',
};

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 py-1 bg-slate-50 border-y border-slate-100">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
    </div>
  );
}

function EmptySection() {
  return <div className="px-3 py-2 text-[10px] text-slate-300 italic">No entries</div>;
}

export function SalaryRegisterPage() {
  const { settings } = useSettings();
  const { entries, loading, refreshing } = useEntries(
    settings.activeFinancialYear,
    settings.activeCashBookType,
  );

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const salaryEntries = useMemo(
    () => entries.filter(isSalaryEntry),
    [entries],
  );

  const filtered = useMemo(() => {
    let r = salaryEntries;
    if (dateFrom) r = r.filter(e => e.date >= dateFrom);
    if (dateTo)   r = r.filter(e => e.date <= dateTo);
    return r;
  }, [salaryEntries, dateFrom, dateTo]);

  const groups = useMemo(() => buildSalaryGroups(filtered), [filtered]);
  const rows   = useMemo(() => buildSalaryRows(filtered),   [filtered]);  // for exports

  const grand = useMemo(() => {
    const totalR = groups.reduce((s, g) => s + g.totalR, 0);
    const totalP = groups.reduce((s, g) => s + g.totalP, 0);
    return { totalR, totalP, balance: totalR - totalP };
  }, [groups]);

  const meta = {
    financialYear: settings.activeFinancialYear,
    cashBookType:  settings.activeCashBookType,
    dateFrom:      dateFrom || undefined,
    dateTo:        dateTo   || undefined,
  };

  const hasFilters          = !!(dateFrom || dateTo);
  const showCashBookBadge   = settings.activeCashBookType === 'Both';

  return (
    <div className="flex flex-col gap-4 animate-fade-in pb-6">

      {/* ── Sticky filter / action bar ── */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
        {refreshing && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
            <div className="h-full animate-progress bg-blue-400" />
          </div>
        )}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">From</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs
                text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">To</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs
                text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300" />
          </div>
          {hasFilters && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors">
              Clear
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={() => exportSalaryRegisterPDF(rows, meta)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
              px-2.5 py-1.5 text-xs font-medium text-slate-600
              hover:border-red-300 hover:text-red-600 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            PDF
          </button>
          <button type="button" onClick={() => exportSalaryRegisterExcel(rows, meta)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
              px-2.5 py-1.5 text-xs font-medium text-slate-600
              hover:border-green-300 hover:text-green-600 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
            </svg>
            Excel
          </button>
        </div>
      </div>

      {/* ── Summary chips ── */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <span className="text-xs text-green-600">Total Receipts</span>
          <span className="text-sm font-semibold text-green-700">{formatCurrency(grand.totalR)}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <span className="text-xs text-red-600">Total Payments</span>
          <span className="text-sm font-semibold text-red-700">{formatCurrency(grand.totalP)}</span>
        </div>
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
          grand.balance >= 0 ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'
        }`}>
          <span className={`text-xs ${grand.balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Balance</span>
          <span className={`text-sm font-semibold ${grand.balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            {formatCurrency(Math.abs(grand.balance))}{grand.balance < 0 && ' (Dr)'}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-500">Salary Months</span>
          <span className="text-sm font-semibold text-slate-700">{groups.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-500">Entries</span>
          <span className="text-sm font-semibold text-slate-700">{filtered.length}</span>
        </div>
      </div>

      {/* ── Month cards ── */}
      {loading ? (
        <div className="rounded-lg border border-slate-200 p-4">
          <EntrySkeleton />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-slate-200 py-16 text-center text-sm text-slate-400">
          {salaryEntries.length === 0
            ? 'No salary entries found in the cash book.'
            : 'No entries match the current filters.'}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(group => {
            const bal = group.balance;

            // Split receipts: grant vs deductions credited
            const grantEntries      = group.receiptEntries.filter(e =>
              e.headOfAccount.toLowerCase() === 'govt salary grants');
            const deductionReceipts = group.receiptEntries
              .filter(e => e.headOfAccount.toLowerCase() !== 'govt salary grants')
              .sort((a, b) => deductionRank(a) - deductionRank(b));

            // Split payments: salary disbursed vs deductions paid
            const salaryDisbursed   = group.paymentEntries.filter(e =>
              e.headOfAccount.toLowerCase() === 'govt salary acct');
            const deductionPayments = group.paymentEntries
              .filter(e => e.headOfAccount.toLowerCase() !== 'govt salary acct')
              .sort((a, b) => deductionRank(a) - deductionRank(b));

            return (
              <div key={group.monthKey} className="rounded-lg border border-slate-200 overflow-clip">

                {/* ── Month header ── */}
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700 underline underline-offset-2">{monthLabel(group.monthKey)}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_BADGE[group.salaryType].cls}`}>
                      {TYPE_BADGE[group.salaryType].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-green-600">
                      Receipts: <span className="font-semibold">{formatCurrency(group.totalR)}</span>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-red-600">
                      Payments: <span className="font-semibold">{formatCurrency(group.totalP)}</span>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className={bal >= 0 ? 'text-blue-600' : 'text-orange-600'}>
                      Bal: <span className="font-semibold">
                        {formatCurrency(Math.abs(bal))}{bal < 0 && ' Dr'}
                      </span>
                    </span>
                  </div>
                </div>

                {/* ── Two columns ── */}
                <div className="grid grid-cols-2 divide-x divide-slate-200">

                  {/* ── Left: Receipts ── */}
                  <div className="flex flex-col">

                    {/* Column header */}
                    <div className="bg-green-50 border-b border-green-100 px-3 py-1.5">
                      <span className="text-[11px] font-semibold text-green-700 uppercase tracking-wider">Receipts</span>
                    </div>

                    {/* Grant section */}
                    <SectionLabel label={GRANT_LABEL[group.salaryType]} />
                    {grantEntries.length > 0
                      ? grantEntries.map(e => <EntryLine key={e.id} e={e} color="green" showCashBookBadge={showCashBookBadge} />)
                      : <EmptySection />}

                    {/* Deductions credited section */}
                    <SectionLabel label="Deductions Credited" />
                    {deductionReceipts.length > 0
                      ? deductionReceipts.map(e => <EntryLine key={e.id} e={e} color="green" showCashBookBadge={showCashBookBadge} />)
                      : <EmptySection />}

                    {/* Receipts total */}
                    <div className="mt-auto border-t border-green-100 bg-green-50/60 px-3 py-1.5 flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-green-700">Total Receipts</span>
                      <span className="text-[11px] font-semibold text-green-700 tabular-nums">{formatCurrency(group.totalR)}</span>
                    </div>
                  </div>

                  {/* ── Right: Payments ── */}
                  <div className="flex flex-col">

                    {/* Column header */}
                    <div className="bg-red-50 border-b border-red-100 px-3 py-1.5">
                      <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wider">Payments</span>
                    </div>

                    {/* Salary disbursed section */}
                    <SectionLabel label={DISBURSE_LABEL[group.salaryType]} />
                    {salaryDisbursed.length > 0
                      ? salaryDisbursed.map(e => <EntryLine key={e.id} e={e} color="red" showCashBookBadge={showCashBookBadge} />)
                      : <EmptySection />}

                    {/* Deductions paid section */}
                    <SectionLabel label="Deductions Paid" />
                    {deductionPayments.length > 0
                      ? deductionPayments.map(e => <EntryLine key={e.id} e={e} color="red" showCashBookBadge={showCashBookBadge} />)
                      : <EmptySection />}

                    {/* Payments total */}
                    <div className="mt-auto border-t border-red-100 bg-red-50/60 px-3 py-1.5 flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-red-700">Total Payments</span>
                      <span className="text-[11px] font-semibold text-red-700 tabular-nums">{formatCurrency(group.totalP)}</span>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
