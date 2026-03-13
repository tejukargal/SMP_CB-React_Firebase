import { useMemo, useState } from 'react';
import { useEntries } from '@/hooks/useEntries';
import { useSettings } from '@/context/SettingsContext';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import {
  FEE_HEADS,
  canonicalFeeHead,
  buildFeeRows,
  exportFeeRegisterPDF,
  exportFeeRegisterExcel,
} from '@/utils/exportFeeRegister';
import { EntrySkeleton } from '@/components/entries/EntrySkeleton';

export function FeeRegisterPage() {
  const { settings } = useSettings();
  const { entries, loading, refreshing } = useEntries(
    settings.activeFinancialYear,
    settings.activeCashBookType,
  );

  const [search,       setSearch]       = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [visibleHeads, setVisibleHeads] = useState<Set<string>>(new Set(FEE_HEADS));

  // ── Fee receipt entries ────────────────────────────────────────────────────
  const feeEntries = useMemo(
    () => entries.filter(
      e => e.type === 'Receipt' && canonicalFeeHead(e.headOfAccount) !== undefined,
    ),
    [entries],
  );

  // Date-filtered entries (used for export too)
  const dateFilteredEntries = useMemo(() => {
    let r = feeEntries;
    if (dateFrom) r = r.filter(e => e.date >= dateFrom);
    if (dateTo)   r = r.filter(e => e.date <= dateTo);
    return r;
  }, [feeEntries, dateFrom, dateTo]);

  // Visible heads in canonical order
  const visibleHeadsList = useMemo(
    () => FEE_HEADS.filter(h => visibleHeads.has(h)),
    [visibleHeads],
  );

  // All rows after date filter
  const allRows = useMemo(
    () => buildFeeRows(dateFilteredEntries, visibleHeadsList),
    [dateFilteredEntries, visibleHeadsList],
  );

  // Search filter (applied on top for UI display only; export uses dateFilteredEntries)
  const rows = useMemo(() => {
    if (!search.trim()) return allRows;
    const q = search.toLowerCase();
    return allRows.filter(r => formatDate(r.date).includes(q) || r.date.includes(q));
  }, [allRows, search]);

  // Grand totals for visible rows
  const grandTotals = useMemo(() => {
    const map  = new Map<string, number>();
    let grand  = 0;
    for (const h of visibleHeadsList) {
      const sum = rows.reduce((s, r) => s + (r.amounts.get(h) ?? 0), 0);
      map.set(h, sum);
      grand += sum;
    }
    return { map, grand };
  }, [rows, visibleHeadsList]);

  // ── Head toggle ────────────────────────────────────────────────────────────
  const toggleHead = (h: string) => {
    setVisibleHeads(prev => {
      const next = new Set(prev);
      if (next.has(h)) {
        if (next.size > 1) next.delete(h);   // keep at least one column
      } else {
        next.add(h);
      }
      return next;
    });
  };

  const hasFilters = !!(search || dateFrom || dateTo);

  const meta = {
    financialYear: settings.activeFinancialYear,
    cashBookType:  settings.activeCashBookType,
    dateFrom:      dateFrom || undefined,
    dateTo:        dateTo   || undefined,
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in pb-6">

      {/* ── Sticky filter bar ── */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
        {refreshing && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
            <div className="h-full animate-progress bg-blue-400" />
          </div>
        )}

        {/* Row 1: search · date range · export buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search dates…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-36 rounded-md border border-slate-200 bg-white pl-7 pr-2.5 text-xs
                text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>

          {/* Date From */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs
                text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>

          {/* Date To */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 shrink-0">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs
                text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>

          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              Clear
            </button>
          )}

          <div className="flex-1" />

          {/* Export PDF */}
          <button
            type="button"
            onClick={() => exportFeeRegisterPDF(dateFilteredEntries, visibleHeadsList, meta)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
              px-2.5 py-1.5 text-xs font-medium text-slate-600
              hover:border-red-300 hover:text-red-600 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            PDF
          </button>

          {/* Export Excel */}
          <button
            type="button"
            onClick={() => exportFeeRegisterExcel(dateFilteredEntries, visibleHeadsList, meta)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white
              px-2.5 py-1.5 text-xs font-medium text-slate-600
              hover:border-green-300 hover:text-green-600 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
            </svg>
            Excel
          </button>
        </div>

        {/* Row 2: head toggle pills */}
        <div className="mt-2 flex items-center flex-wrap gap-1.5">
          <span className="text-xs font-medium text-slate-500 mr-0.5">Heads:</span>
          <button
            type="button"
            onClick={() => setVisibleHeads(new Set(FEE_HEADS))}
            className="rounded px-1.5 py-0.5 text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            All
          </button>
          {FEE_HEADS.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => toggleHead(h)}
              className={`rounded px-2 py-0.5 text-xs font-medium border transition-colors ${
                visibleHeads.has(h)
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary chips ── */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <span className="text-xs text-green-600">Total Collection</span>
          <span className="text-sm font-semibold text-green-700">
            {formatCurrency(grandTotals.grand)}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-500">Days</span>
          <span className="text-sm font-semibold text-slate-700">{rows.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-500">Fee Entries</span>
          <span className="text-sm font-semibold text-slate-700">{dateFilteredEntries.length}</span>
        </div>
        {visibleHeads.size < FEE_HEADS.length && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <span className="text-xs text-amber-600">
              {visibleHeads.size} of {FEE_HEADS.length} heads visible
            </span>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="rounded-lg border border-slate-200 p-4">
          <EntrySkeleton />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 py-16 text-center text-sm text-slate-400">
          {feeEntries.length === 0
            ? 'No fee receipts found in the cash book.'
            : 'No entries match the current filters.'}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-clip">
          {/* overflow-x-auto + overflow-y-auto: contained scrollable widget;
              sticky top-0 thead works relative to this scroll container */}
          <div
            className="overflow-x-auto overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 280px)' }}
          >
            <table className="text-sm border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>

              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-700 text-white">
                  <th className="py-2 pl-3 pr-3 text-xs font-semibold text-left whitespace-nowrap
                    border-r border-slate-500">
                    Date
                  </th>
                  {visibleHeadsList.map(h => (
                    <th key={h} className="px-3 py-2 text-xs font-semibold text-right whitespace-nowrap
                      border-r border-slate-500">
                      {h}
                    </th>
                  ))}
                  <th className="pl-3 pr-3 py-2 text-xs font-semibold text-right whitespace-nowrap
                    bg-slate-800">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.date}
                    className={`border-b border-slate-100 hover:bg-blue-50/50 transition-colors
                      ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                  >
                    <td className="py-1.5 pl-3 pr-3 text-xs font-medium text-slate-700
                      whitespace-nowrap border-r border-slate-100">
                      {formatDate(row.date)}
                    </td>
                    {visibleHeadsList.map(h => {
                      const amt = row.amounts.get(h) ?? 0;
                      return (
                        <td key={h} className="px-3 py-1.5 text-xs text-right whitespace-nowrap
                          border-r border-slate-100">
                          {amt > 0
                            ? <span className="text-slate-700">{formatCurrency(amt)}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                      );
                    })}
                    <td className="pl-3 pr-3 py-1.5 text-xs font-bold text-right text-slate-800
                      whitespace-nowrap bg-slate-50/60">
                      {formatCurrency(row.rowTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-slate-700 text-white">
                  <td className="py-2 pl-3 pr-3 text-xs font-bold text-left whitespace-nowrap
                    border-r border-slate-500">
                    Total&nbsp;
                    <span className="font-normal opacity-70">
                      ({rows.length} {rows.length === 1 ? 'day' : 'days'})
                    </span>
                  </td>
                  {visibleHeadsList.map(h => (
                    <td key={h} className="px-3 py-2 text-xs font-bold text-right whitespace-nowrap
                      border-r border-slate-500">
                      {formatCurrency(grandTotals.map.get(h) ?? 0)}
                    </td>
                  ))}
                  <td className="pl-3 pr-3 py-2 text-xs font-bold text-right whitespace-nowrap
                    bg-slate-800">
                    {formatCurrency(grandTotals.grand)}
                  </td>
                </tr>
              </tfoot>

            </table>
          </div>
        </div>
      )}

    </div>
  );
}
