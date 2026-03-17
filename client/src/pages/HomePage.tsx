import { useMemo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useEntries } from '@/hooks/useEntries';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useDashboardData, type LedgerTickerItem } from '@/hooks/useDashboardData';
import { formatCurrency } from '@/utils/formatCurrency';
import type { Entry } from '@smp-cashbook/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function computeStats(entries: Entry[]) {
  const aided   = entries.filter(e => e.cashBookType === 'Aided');
  const unAided = entries.filter(e => e.cashBookType === 'Un-Aided');
  const sum = (arr: Entry[], t: string) =>
    arr.filter(e => e.type === t).reduce((s, e) => s + e.amount, 0);
  return {
    totalReceipts:   sum(entries, 'Receipt'),
    totalPayments:   sum(entries, 'Payment'),
    aidedReceipts:   sum(aided,   'Receipt'),
    aidedPayments:   sum(aided,   'Payment'),
    unAidedReceipts: sum(unAided, 'Receipt'),
    unAidedPayments: sum(unAided, 'Payment'),
    totalCount:  entries.length,
    aidedCount:  aided.length,
    unAidedCount: unAided.length,
  };
}

function buildTickerItems(entries: Entry[], fy: string): LedgerTickerItem[] {
  const map = new Map<string, LedgerTickerItem>();
  for (const e of entries) {
    if (!e.headOfAccount || e.amount === 0) continue;
    const key  = `${e.headOfAccount}|${e.cashBookType}`;
    const prev = map.get(key) ??
      { head: e.headOfAccount, fy, cashBookType: e.cashBookType, receipts: 0, payments: 0 };
    if (e.type === 'Receipt') prev.receipts += e.amount;
    else                      prev.payments += e.amount;
    map.set(key, prev);
  }
  return Array.from(map.values()).filter(i => i.receipts > 0 || i.payments > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Search types
// ─────────────────────────────────────────────────────────────────────────────
interface Amounts { receipts: number; payments: number; }
interface YearData {
  fy:       string;
  isActive: boolean;
  aided:    Amounts;
  unAided:  Amounts;
}
interface SearchGroup { head: string; years: YearData[]; }

function buildSearchResults(
  pool:     LedgerTickerItem[],
  query:    string,
  activeFY: string,
): SearchGroup[] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const matched = pool.filter(i => i.head.toLowerCase().includes(q));
  if (matched.length === 0) return [];

  // head → fy → YearData
  const byHead = new Map<string, Map<string, YearData>>();
  for (const item of matched) {
    if (!byHead.has(item.head)) byHead.set(item.head, new Map());
    const byFY = byHead.get(item.head)!;
    const existing = byFY.get(item.fy) ?? {
      fy: item.fy,
      isActive: item.fy === activeFY,
      aided:   { receipts: 0, payments: 0 },
      unAided: { receipts: 0, payments: 0 },
    };
    if (item.cashBookType === 'Aided') {
      existing.aided = { receipts: item.receipts, payments: item.payments };
    } else {
      existing.unAided = { receipts: item.receipts, payments: item.payments };
    }
    byFY.set(item.fy, existing);
  }

  const results: SearchGroup[] = [];
  for (const [head, byFY] of byHead) {
    const sortedYears = Array.from(byFY.values()).sort((a, b) => {
      if (a.isActive) return -1;
      if (b.isActive) return 1;
      return b.fy.localeCompare(a.fy);
    });
    results.push({ head, years: sortedYears });
  }
  return results.sort((a, b) => a.head.localeCompare(b.head));
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI atoms
// ─────────────────────────────────────────────────────────────────────────────
function PulseSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

function SectionHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h2>
      <div className="h-px flex-1 bg-slate-200" />
      {aside}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard stat cards
// ─────────────────────────────────────────────────────────────────────────────
const C_MAP = {
  green: { bg: 'bg-green-50',  border: 'border-green-100',  label: 'text-green-600', val: 'text-green-800' },
  red:   { bg: 'bg-red-50',    border: 'border-red-100',    label: 'text-red-500',   val: 'text-red-700'   },
  blue:  { bg: 'bg-blue-50',   border: 'border-blue-100',   label: 'text-blue-600',  val: 'text-blue-800'  },
  amber: { bg: 'bg-amber-50',  border: 'border-amber-100',  label: 'text-amber-600', val: 'text-amber-800' },
  slate: { bg: 'bg-slate-50',  border: 'border-slate-200',  label: 'text-slate-500', val: 'text-slate-800' },
} as const;

function StatCard({
  label, value, color, isCount = false,
}: {
  label: string; value: number; color: keyof typeof C_MAP; isCount?: boolean;
}) {
  const c = C_MAP[color];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} px-4 py-3.5`}>
      <p className={`text-xs font-medium ${c.label}`}>{label}</p>
      <p className={`mt-1 text-[1.3rem] font-bold leading-tight tracking-tight ${c.val}`}>
        {isCount ? value.toLocaleString('en-IN') : formatCurrency(value)}
      </p>
    </div>
  );
}

const T_MAP = {
  teal:   { wrap: 'bg-teal-50/60 border-teal-100',     badge: 'bg-teal-100 text-teal-700'     },
  orange: { wrap: 'bg-orange-50/60 border-orange-100', badge: 'bg-orange-100 text-orange-700' },
} as const;

function TypeRow({
  label, receipts, payments, count, color,
}: {
  label: string; receipts: number; payments: number; count: number; color: keyof typeof T_MAP;
}) {
  const c   = T_MAP[color];
  const bal = receipts - payments;
  return (
    <div className={`rounded-xl border ${c.wrap} px-4 py-3`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.badge}`}>{label}</span>
        <span className="text-xs text-slate-400">{count.toLocaleString('en-IN')} entries</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-green-600 mb-0.5">Receipts</p>
          <p className="text-sm font-semibold text-green-700">{formatCurrency(receipts)}</p>
        </div>
        <div>
          <p className="text-xs text-red-500 mb-0.5">Payments</p>
          <p className="text-sm font-semibold text-red-600">{formatCurrency(payments)}</p>
        </div>
        <div>
          <p className="text-xs text-blue-600 mb-0.5">Balance</p>
          <p className={`text-sm font-semibold ${bal >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
            {formatCurrency(Math.abs(bal))}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Search result components
// ─────────────────────────────────────────────────────────────────────────────
function AmountRow({
  label, labelCls, receipts, payments,
}: {
  label: string; labelCls: string; receipts: number; payments: number;
}) {
  const bal = receipts - payments;
  return (
    <div>
      <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${labelCls}`}>
        {label}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-slate-400">Receipts</p>
          <p className="text-xs font-semibold text-green-700">{formatCurrency(receipts)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400">Payments</p>
          <p className="text-xs font-semibold text-red-600">{formatCurrency(payments)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400">Balance</p>
          <p className={`text-xs font-semibold ${bal >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>
            {formatCurrency(Math.abs(bal))}
          </p>
        </div>
      </div>
    </div>
  );
}

function YearCard({ year }: { year: YearData }) {
  const { fy, isActive, aided, unAided } = year;
  const hasAided   = aided.receipts > 0   || aided.payments > 0;
  const hasUnAided = unAided.receipts > 0 || unAided.payments > 0;
  const hasBoth    = hasAided && hasUnAided;
  const totalR     = aided.receipts  + unAided.receipts;
  const totalP     = aided.payments  + unAided.payments;

  return (
    <div className={`rounded-xl border overflow-hidden transition-shadow hover:shadow-sm ${
      isActive ? 'border-blue-200' : 'border-slate-200'
    }`}>
      {/* FY header */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${
        isActive
          ? 'bg-blue-50 border-blue-100'
          : 'bg-slate-50 border-slate-100'
      }`}>
        <span className="text-sm font-semibold text-slate-700">{fy}</span>
        {isActive && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
            Active
          </span>
        )}
      </div>

      {/* Body */}
      <div className="space-y-3 p-4">
        {hasAided && (
          <AmountRow
            label="Aided" labelCls="text-teal-600"
            receipts={aided.receipts} payments={aided.payments}
          />
        )}
        {hasUnAided && (
          <AmountRow
            label="Un-Aided" labelCls="text-orange-600"
            receipts={unAided.receipts} payments={unAided.payments}
          />
        )}
        {hasBoth && (
          <div className="border-t border-slate-100 pt-3">
            <AmountRow
              label="Total" labelCls="text-slate-500"
              receipts={totalR} payments={totalP}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResultGroup({ group }: { group: SearchGroup }) {
  return (
    <div>
      {/* Head label */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-slate-700">{group.head}</span>
        <span className="text-xs text-slate-400">
          {group.years.length} year{group.years.length !== 1 ? 's' : ''}
        </span>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      {/* Two-column year grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {group.years.map(year => (
          <YearCard key={year.fy} year={year} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger ticker
// ─────────────────────────────────────────────────────────────────────────────
function TickerCard({ item }: { item: LedgerTickerItem }) {
  return (
    <div className="mx-1.5 my-2 flex items-center gap-2 rounded-lg border border-slate-200
      bg-white px-3.5 py-2.5 shadow-sm whitespace-nowrap">
      <span className="text-xs font-semibold text-slate-700">{item.head}</span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
        {item.fy}
      </span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        item.cashBookType === 'Aided' ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'
      }`}>
        {item.cashBookType}
      </span>
      {item.receipts > 0 && (
        <span className="text-xs font-medium text-green-600">R: {formatCurrency(item.receipts)}</span>
      )}
      {item.payments > 0 && (
        <span className="text-xs font-medium text-red-500">P: {formatCurrency(item.payments)}</span>
      )}
    </div>
  );
}

function LedgerTicker({ items }: { items: LedgerTickerItem[] }) {
  const [paused, setPaused] = useState(false);
  const duration = `${Math.max(40, items.length * 4)}s`;
  const doubled  = [...items, ...items];

  return (
    <>
      <style>{`
        @keyframes ledger-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div
        className="cursor-default overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        title="Hover to pause"
      >
        <div
          style={{
            display: 'flex', width: 'max-content',
            animation: `ledger-scroll ${duration} linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        >
          {doubled.map((item, i) => <TickerCard key={i} item={item} />)}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export function HomePage() {
  const { settings }                               = useSettings();
  const { user }                                   = useAuth();
  const { entries: aidedEntries,   loading: aL1 }  = useEntries(settings.activeFinancialYear, 'Aided');
  const { entries: unAidedEntries, loading: aL2 }  = useEntries(settings.activeFinancialYear, 'Un-Aided');
  const activeEntries = useMemo(
    () => [...aidedEntries, ...unAidedEntries],
    [aidedEntries, unAidedEntries],
  );
  const aL = aL1 || aL2;

  const recentFYs = useMemo(
    () => [...settings.financialYears]
      .filter(fy => fy !== settings.activeFinancialYear)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 3),
    [settings.financialYears, settings.activeFinancialYear],
  );

  const { fyStats: histStats, tickerItems: histTicker, loading: hL } =
    useDashboardData(recentFYs);

  const activeStats = useMemo(() => computeStats(activeEntries), [activeEntries]);

  // Combined pool used for both the ticker and search
  const allTickerPool = useMemo(
    () => [
      ...buildTickerItems(activeEntries, settings.activeFinancialYear),
      ...histTicker,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEntries, histTicker, settings.activeFinancialYear],
  );

  // Ticker: Fisher-Yates shuffle once per pool-size change
  const [tickerItems, setTickerItems] = useState<LedgerTickerItem[]>([]);
  const poolSize = allTickerPool.length;
  const prevPoolSize = useRef(-1);
  useEffect(() => {
    if (poolSize === prevPoolSize.current) return;
    prevPoolSize.current = poolSize;
    const pool = [...allTickerPool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setTickerItems(pool);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolSize]);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const searchResults = useMemo(
    () => buildSearchResults(allTickerPool, searchQuery, settings.activeFinancialYear),
    [allTickerPool, searchQuery, settings.activeFinancialYear],
  );

  const activeBal = activeStats.totalReceipts - activeStats.totalPayments;
  const userName  = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '';
  const allFYs    = [settings.activeFinancialYear, ...recentFYs];

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-8 pt-1">

      {/* ── Greeting ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {getGreeting()}{userName ? `, ${userName}` : ''}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {settings.activeFinancialYear}&nbsp;&middot;&nbsp;
            {settings.activeCashBookType === 'Both' ? 'Aided & Un-Aided' : settings.activeCashBookType}
          </p>
        </div>
        <Link
          to="/new-entry"
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2
            text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Entry
        </Link>
      </div>

      {/* ── Search bar ── */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder={`Search ledgers across ${allFYs.join(', ')}…`}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm
            text-slate-700 shadow-sm placeholder:text-slate-400
            focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center
              justify-center rounded-full bg-slate-200 hover:bg-slate-300 transition-colors"
            aria-label="Clear search"
          >
            <svg className="h-3 w-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SEARCH RESULTS — replaces dashboard when query is active
         ═══════════════════════════════════════════════════════════════════════ */}
      {searchResults !== null ? (
        <section className="flex flex-col gap-6">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(aL || hL) ? (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Loading some years…
                </span>
              ) : searchResults.length > 0 ? (
                <span className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{searchResults.length}</span>
                  {' '}ledger{searchResults.length !== 1 ? 's' : ''} matched across{' '}
                  <span className="font-semibold text-slate-700">{allFYs.length}</span> year{allFYs.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-xs text-slate-400">No ledgers matched "{searchQuery}"</span>
              )}
            </div>
          </div>

          {/* Results list */}
          {searchResults.length > 0 ? (
            <div className="flex flex-col gap-8">
              {searchResults.map(group => (
                <SearchResultGroup key={group.head} group={group} />
              ))}
            </div>
          ) : !aL && !hL && (
            /* Empty state */
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed
              border-slate-200 py-16 text-center">
              <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm text-slate-400">
                No ledgers found for <span className="font-medium text-slate-600">"{searchQuery}"</span>
              </p>
              <p className="text-xs text-slate-400">Try a different head of account name</p>
            </div>
          )}
        </section>

      ) : (
        /* ═══════════════════════════════════════════════════════════════════
           NORMAL DASHBOARD — shown when search is empty
           ═══════════════════════════════════════════════════════════════════ */
        <>
          {/* ── Active FY ── */}
          <section>
            <SectionHead title={`${settings.activeFinancialYear} — Active`} />
            {aL ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[...Array(4)].map((_, i) => <PulseSkeleton key={i} className="h-20" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Total Receipts" value={activeStats.totalReceipts} color="green" />
                  <StatCard label="Total Payments" value={activeStats.totalPayments} color="red" />
                  <StatCard
                    label="Balance"
                    value={Math.abs(activeBal)}
                    color={activeBal >= 0 ? 'blue' : 'amber'}
                  />
                  <StatCard label="Entries" value={activeStats.totalCount} color="slate" isCount />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TypeRow
                    label="Aided" color="teal"
                    receipts={activeStats.aidedReceipts}
                    payments={activeStats.aidedPayments}
                    count={activeStats.aidedCount}
                  />
                  <TypeRow
                    label="Un-Aided" color="orange"
                    receipts={activeStats.unAidedReceipts}
                    payments={activeStats.unAidedPayments}
                    count={activeStats.unAidedCount}
                  />
                </div>
              </>
            )}
          </section>

          {/* ── Previous FYs ── */}
          {recentFYs.length > 0 && (
            <section>
              <SectionHead title="Previous Financial Years" />
              {hL ? (
                <div className="space-y-2">
                  {recentFYs.map(fy => <PulseSkeleton key={fy} className="h-11" />)}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="py-2.5 pl-4 pr-3 text-left   text-xs font-semibold text-slate-500">FY</th>
                        <th className="px-3    py-2.5 text-right text-xs font-semibold text-slate-500">Receipts</th>
                        <th className="px-3    py-2.5 text-right text-xs font-semibold text-slate-500">Payments</th>
                        <th className="px-3    py-2.5 text-right text-xs font-semibold text-slate-500">Balance</th>
                        <th className="pl-3 pr-4 py-2.5 text-right text-xs font-semibold text-slate-500">Entries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentFYs.map((fy, i) => {
                        const s   = histStats.get(fy);
                        const bal = (s?.totalReceipts ?? 0) - (s?.totalPayments ?? 0);
                        return (
                          <tr
                            key={fy}
                            className={`border-b border-slate-100 last:border-0 ${
                              i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                            }`}
                          >
                            <td className="py-2.5 pl-4 pr-3 font-semibold text-slate-700">{fy}</td>
                            <td className="px-3 py-2.5 text-right text-green-700">
                              {s ? formatCurrency(s.totalReceipts) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-red-600">
                              {s ? formatCurrency(s.totalPayments) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className={`px-3 py-2.5 text-right font-semibold ${
                              bal >= 0 ? 'text-blue-700' : 'text-amber-700'
                            }`}>
                              {s ? formatCurrency(Math.abs(bal)) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="pl-3 pr-4 py-2.5 text-right text-slate-500">
                              {s ? s.entryCount.toLocaleString('en-IN') : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ── Ledger Ticker ── */}
          {tickerItems.length > 0 && (
            <section>
              <SectionHead
                title="Ledger Activity"
                aside={<span className="text-xs italic text-slate-400">hover to pause</span>}
              />
              <LedgerTicker items={tickerItems} />
            </section>
          )}
        </>
      )}

    </div>
  );
}
