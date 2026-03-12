import { useState, useEffect } from 'react';
import { SelectDropdown } from '@/components/ui/SelectDropdown';
import type { EntryType } from '@smp-cashbook/shared';

export interface FilterState {
  search: string;
  typeFilter: 'All' | EntryType;
  dateFrom: string;
  dateTo: string;
  headOfAccount: string;
}

interface EntryFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  headOfAccountOptions: string[];
}

const CLEAR: FilterState = {
  search: '',
  typeFilter: 'All',
  dateFrom: '',
  dateTo: '',
  headOfAccount: '',
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

const baseCls =
  'rounded-md border bg-white px-2.5 py-2 text-xs text-slate-700 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/20 ' +
  'placeholder:text-slate-400';

const validCls = `${baseCls} border-slate-200 focus:border-blue-500`;
const invalidCls = `${baseCls} border-red-300 focus:border-red-400 focus:ring-red-400/20`;

export function EntryFilters({ filters, onChange, headOfAccountOptions }: EntryFiltersProps) {
  const [rawFrom, setRawFrom] = useState('');
  const [rawTo, setRawTo] = useState('');

  // Sync raw inputs when filters are cleared externally
  useEffect(() => {
    if (!filters.dateFrom) setRawFrom('');
  }, [filters.dateFrom]);
  useEffect(() => {
    if (!filters.dateTo) setRawTo('');
  }, [filters.dateTo]);

  const set = (key: keyof FilterState, value: string) =>
    onChange({ ...filters, [key]: value });

  const handleDateChange = (
    raw: string,
    setRaw: (v: string) => void,
    key: 'dateFrom' | 'dateTo'
  ) => {
    setRaw(raw);
    const parsed = parseDateInput(raw);
    onChange({ ...filters, [key]: raw.trim() === '' ? '' : parsed });
  };

  const handleClear = () => {
    setRawFrom('');
    setRawTo('');
    onChange(CLEAR);
  };

  const fromInvalid = rawFrom.trim() !== '' && parseDateInput(rawFrom) === '';
  const toInvalid = rawTo.trim() !== '' && parseDateInput(rawTo) === '';

  const hasActive =
    filters.search.trim() ||
    filters.dateFrom ||
    filters.dateTo ||
    rawFrom.trim() ||
    rawTo.trim() ||
    filters.headOfAccount;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search — capped width */}
      <div className="relative w-44 shrink-0">
        <svg
          className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search…"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          className={`${validCls} w-full pl-7`}
        />
      </div>

      {/* Head of Account dropdown */}
      <SelectDropdown
        value={filters.headOfAccount}
        onChange={(v) => set('headOfAccount', v)}
        placeholder="All Accounts"
        options={[
          { value: '', label: 'All Accounts' },
          ...headOfAccountOptions.map((hoa) => ({ value: hoa, label: hoa })),
        ]}
      />

      {/* Date from */}
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={rawFrom}
        onChange={(e) => handleDateChange(e.target.value, setRawFrom, 'dateFrom')}
        title="From date (dd/mm/yy or dd/mm/yyyy)"
        className={`${fromInvalid ? invalidCls : validCls} w-28 shrink-0`}
      />
      <span className="text-xs text-slate-400 shrink-0">–</span>
      {/* Date to */}
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={rawTo}
        onChange={(e) => handleDateChange(e.target.value, setRawTo, 'dateTo')}
        title="To date (dd/mm/yy or dd/mm/yyyy)"
        className={`${toInvalid ? invalidCls : validCls} w-28 shrink-0`}
      />

      {/* Clear */}
      {hasActive && (
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 rounded-md px-2 py-2 text-xs text-slate-400 hover:bg-white hover:text-slate-600 transition-colors"
          title="Clear all filters"
        >
          Clear
        </button>
      )}
    </div>
  );
}
