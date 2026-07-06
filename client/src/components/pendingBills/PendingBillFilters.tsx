import { useState, useEffect, useTransition } from 'react';
import { SelectDropdown } from '@/components/ui/SelectDropdown';
import type { BillStatus } from '@smp-cashbook/shared';

export interface PendingBillFilterState {
  search: string;
  dateFrom: string;
  dateTo: string;
  bank: string;
  chqNoOrCash: string;
  headOfAccount: string;
  status: 'All' | BillStatus;
}

interface PendingBillFiltersProps {
  filters: PendingBillFilterState;
  onChange: (filters: PendingBillFilterState) => void;
  bankOptions: string[];
  chqNoOrCashOptions: string[];
  headOfAccountOptions: string[];
}

export const CLEAR_FILTERS: PendingBillFilterState = {
  search: '',
  dateFrom: '',
  dateTo: '',
  bank: '',
  chqNoOrCash: '',
  headOfAccount: '',
  status: 'Pending',
};

/** Parse dd/mm/yy or dd/mm/yyyy → YYYY-MM-DD. Returns '' if invalid. */
function parseDateInput(val: string): string {
  const m = val.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return '';
  const [, dd, mm, yy] = m;
  const year = yy.length === 2 ? `20${yy}` : yy;
  const month = mm.padStart(2, '0');
  const day = dd.padStart(2, '0');
  const d = new Date(`${year}-${month}-${day}`);
  if (isNaN(d.getTime())) return '';
  return `${year}-${month}-${day}`;
}

const dateBase =
  'h-9 w-28 shrink-0 rounded-lg border bg-white px-3 text-sm text-slate-700 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-400/30 placeholder:text-slate-400 transition-colors';
const dateValidCls   = `${dateBase} border-slate-300 focus:border-blue-400`;
const dateInvalidCls = `${dateBase} border-red-400 focus:border-red-400 focus:ring-red-400/20 bg-red-50/40`;

const selectTriggerCls = 'h-9 flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white shadow-sm px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-colors whitespace-nowrap';

export function PendingBillFilters({ filters, onChange, bankOptions, chqNoOrCashOptions, headOfAccountOptions }: PendingBillFiltersProps) {
  const [, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rawFrom, setRawFrom] = useState('');
  const [rawTo, setRawTo] = useState('');

  useEffect(() => { if (!filters.dateFrom) setRawFrom(''); }, [filters.dateFrom]);
  useEffect(() => { if (!filters.dateTo)   setRawTo('');   }, [filters.dateTo]);
  useEffect(() => { if (!filters.search)   setSearchInput(''); }, [filters.search]);

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    startTransition(() => onChange({ ...filters, search: val }));
  };

  const set = (key: keyof PendingBillFilterState, value: string) =>
    onChange({ ...filters, [key]: value });

  const handleDateChange = (
    raw: string,
    setRaw: (v: string) => void,
    key: 'dateFrom' | 'dateTo',
  ) => {
    setRaw(raw);
    const parsed = parseDateInput(raw);
    onChange({ ...filters, [key]: raw.trim() === '' ? '' : parsed });
  };

  const handleClear = () => {
    setRawFrom('');
    setRawTo('');
    setSearchInput('');
    onChange(CLEAR_FILTERS);
  };

  const fromInvalid = rawFrom.trim() !== '' && parseDateInput(rawFrom) === '';
  const toInvalid   = rawTo.trim()   !== '' && parseDateInput(rawTo)   === '';

  const hasActive =
    searchInput.trim() ||
    filters.dateFrom ||
    filters.dateTo ||
    rawFrom.trim() ||
    rawTo.trim() ||
    filters.bank ||
    filters.chqNoOrCash ||
    filters.headOfAccount ||
    filters.status !== 'Pending';

  return (
    <div className="flex items-center gap-2 flex-wrap">

      {/* ── Search pill ─────────────────────────────────────────────────── */}
      <div className="relative shrink-0 w-52">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400"
          fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Firm, bill no, particulars…"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={`h-9 w-full rounded-full border border-emerald-300 bg-white shadow-sm
            pl-10 text-sm font-medium text-gray-800
            placeholder:text-gray-400 placeholder:font-normal
            focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500
            transition-all duration-150 ${searchInput ? 'pr-9' : 'pr-4'}`}
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => handleSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center
              justify-center rounded-full bg-amber-400 hover:bg-amber-500 text-white
              transition-colors shrink-0"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div className="h-9 w-px bg-slate-200 shrink-0" />

      {/* ── Bank ─────────────────────────────────────────────────────────── */}
      <SelectDropdown
        value={filters.bank}
        onChange={(v) => set('bank', v)}
        placeholder="All Banks"
        options={[{ value: '', label: 'All Banks' }, ...bankOptions.map((b) => ({ value: b, label: b }))]}
        triggerCls={selectTriggerCls}
      />

      {/* ── Chq No / Cash ────────────────────────────────────────────────── */}
      <SelectDropdown
        value={filters.chqNoOrCash}
        onChange={(v) => set('chqNoOrCash', v)}
        placeholder="All Chq/Cash"
        options={[{ value: '', label: 'All Chq/Cash' }, ...chqNoOrCashOptions.map((c) => ({ value: c, label: c }))]}
        triggerCls={selectTriggerCls}
      />

      {/* ── Head of Account ──────────────────────────────────────────────── */}
      <SelectDropdown
        value={filters.headOfAccount}
        onChange={(v) => set('headOfAccount', v)}
        placeholder="All Accounts"
        options={[{ value: '', label: 'All Accounts' }, ...headOfAccountOptions.map((h) => ({ value: h, label: h }))]}
        triggerCls={selectTriggerCls}
      />

      {/* ── Status ───────────────────────────────────────────────────────── */}
      <SelectDropdown
        value={filters.status}
        onChange={(v) => set('status', v)}
        placeholder="Pending"
        options={[
          { value: 'Pending', label: 'Pending' },
          { value: 'Approved', label: 'Approved' },
          { value: 'Cleared', label: 'Cleared' },
          { value: 'All', label: 'All' },
        ]}
        triggerCls={selectTriggerCls}
      />

      {/* ── Date range (bill date) ───────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="text"
          inputMode="numeric"
          placeholder="From dd/mm/yy"
          value={rawFrom}
          onChange={(e) => handleDateChange(e.target.value, setRawFrom, 'dateFrom')}
          title="Bill date from (dd/mm/yy or dd/mm/yyyy)"
          className={fromInvalid ? dateInvalidCls : dateValidCls}
        />
        <span className="text-slate-300 shrink-0 select-none">—</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="To dd/mm/yy"
          value={rawTo}
          onChange={(e) => handleDateChange(e.target.value, setRawTo, 'dateTo')}
          title="Bill date to (dd/mm/yy or dd/mm/yyyy)"
          className={toInvalid ? dateInvalidCls : dateValidCls}
        />
      </div>

      {/* ── Clear all ────────────────────────────────────────────────────── */}
      {hasActive && (
        <button
          type="button"
          onClick={handleClear}
          title="Clear all filters"
          className="h-9 flex items-center gap-1 shrink-0 rounded-lg border border-slate-300
            bg-white px-3 text-xs font-medium text-slate-500 shadow-sm
            hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Clear
        </button>
      )}

    </div>
  );
}
