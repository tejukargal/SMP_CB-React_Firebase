import { useState } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ImportSection } from './ImportSection';
import { ResetSection } from './ResetSection';
import { SalaryEntrySection } from './SalaryEntrySection';
import { cn } from '@/utils/cn';
import { getCurrentFinancialYear, generateFYLabel, isValidFY } from '@smp-cashbook/shared';
import type { CashBookType } from '@smp-cashbook/shared';

function getNextFY(existingYears: string[]): string {
  if (existingYears.length === 0) return getCurrentFinancialYear();
  const sorted = [...existingYears].sort().reverse();
  const startYear = parseInt(sorted[0].split('-')[0], 10);
  return generateFYLabel(startYear + 1);
}

// ── Nav items ─────────────────────────────────────────────────────────────────

type SectionId = 'general' | 'salary' | 'import' | 'danger';

const NAV_ITEMS: {
  id: SectionId;
  label: string;
  description: string;
  accent: string;
  activeClass: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'general',
    label: 'Active Settings',
    description: 'Cash book type & financial years',
    accent: 'text-blue-500',
    activeClass: 'bg-blue-50 border-blue-200 text-blue-700',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'salary',
    label: 'Quick Salary Entry',
    description: 'Post salary receipts & payments',
    accent: 'text-green-500',
    activeClass: 'bg-green-50 border-green-200 text-green-700',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    id: 'import',
    label: 'Import Data',
    description: 'Bulk-import from Excel / CSV',
    accent: 'text-slate-500',
    activeClass: 'bg-slate-100 border-slate-300 text-slate-700',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
  },
  {
    id: 'danger',
    label: 'Danger Zone',
    description: 'Permanently delete data',
    accent: 'text-red-500',
    activeClass: 'bg-red-50 border-red-200 text-red-700',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
];

// ── General section content ───────────────────────────────────────────────────

function GeneralSection() {
  const { settings, setActiveFY, setActiveCashBookType, addFinancialYear, removeFinancialYear } = useSettings();
  const { addToast } = useToast();
  const [newFY, setNewFY] = useState('');
  const [fyError, setFyError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const suggestedFY = getNextFY(settings.financialYears);
  const cashBookTypes: CashBookType[] = ['Aided', 'Un-Aided'];

  const handleAddFY = async () => {
    const fy = newFY.trim() || suggestedFY;
    if (!isValidFY(fy)) { setFyError('Format must be YYYY-YY (e.g. 2025-26)'); return; }
    if (settings.financialYears.includes(fy)) { setFyError('This financial year already exists'); return; }
    setFyError('');
    setSaving('add-fy');
    try {
      await addFinancialYear(fy);
      setNewFY('');
      addToast(`Financial year ${fy} added`, 'success');
    } catch { addToast('Failed to add financial year', 'error'); }
    finally { setSaving(null); }
  };

  const handleRemoveFY = async (fy: string) => {
    if (settings.financialYears.length <= 1) { addToast('Cannot remove the last financial year', 'error'); return; }
    setSaving(`remove-${fy}`);
    try {
      await removeFinancialYear(fy);
      addToast(`Financial year ${fy} removed`, 'info');
    } catch { addToast('Failed to remove financial year', 'error'); }
    finally { setSaving(null); }
  };

  const handleSetActiveFY = async (fy: string) => {
    setSaving(`activate-${fy}`);
    try {
      await setActiveFY(fy);
      addToast(`Active financial year set to ${fy}`, 'success');
    } catch { addToast('Failed to update active financial year', 'error'); }
    finally { setSaving(null); }
  };

  const handleSetCashBookType = async (type: CashBookType) => {
    setSaving(`type-${type}`);
    try {
      await setActiveCashBookType(type);
      addToast(`Cash Book type set to ${type}`, 'success');
    } catch { addToast('Failed to update Cash Book type', 'error'); }
    finally { setSaving(null); }
  };

  return (
    <div className="space-y-6">
      {/* Cash Book Type */}
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">Cash Book Type</p>
        <div className="flex gap-2">
          {cashBookTypes.map((type) => (
            <button
              key={type}
              onClick={() => handleSetCashBookType(type)}
              disabled={saving !== null}
              className={cn(
                'flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all',
                settings.activeCashBookType === type
                  ? type === 'Aided'
                    ? 'border-green-300 bg-green-50 text-green-700 ring-2 ring-green-300'
                    : 'border-red-300 bg-red-50 text-red-700 ring-2 ring-red-300'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
              )}
            >
              {type}
              {settings.activeCashBookType === type && (
                <span className="ml-2 text-xs opacity-70">● Active</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {/* Financial Years */}
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">Financial Years</p>
        <div className="space-y-2">
          {settings.financialYears.map((fy) => (
            <div
              key={fy}
              className={cn(
                'flex items-center justify-between rounded-lg border px-4 py-2.5',
                settings.activeFinancialYear === fy ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">{fy}</span>
                {settings.activeFinancialYear === fy && <Badge variant="blue">Active</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {settings.activeFinancialYear !== fy && (
                  <Button size="sm" variant="secondary" onClick={() => handleSetActiveFY(fy)} loading={saving === `activate-${fy}`}>
                    Set Active
                  </Button>
                )}
                <button
                  onClick={() => handleRemoveFY(fy)}
                  disabled={saving !== null || settings.financialYears.length <= 1}
                  className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  title="Remove financial year"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            <Input
              placeholder={`e.g. ${suggestedFY}`}
              value={newFY}
              onChange={(e) => { setNewFY(e.target.value); setFyError(''); }}
              error={fyError}
              onKeyDown={(e) => e.key === 'Enter' && handleAddFY()}
            />
          </div>
          <Button variant="secondary" onClick={handleAddFY} loading={saving === 'add-fy'} className="shrink-0 self-start">
            Add Year
          </Button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Suggested next:{' '}
          <button className="font-medium text-blue-600 hover:underline" onClick={() => setNewFY(suggestedFY)}>
            {suggestedFY}
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function SettingsPanel() {
  const { loading } = useSettings();
  const [active, setActive] = useState<SectionId>('general');

  if (loading) {
    return (
      <div className="flex gap-4 animate-pulse">
        <div className="w-48 shrink-0 space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 rounded-lg bg-slate-100" />)}
        </div>
        <div className="flex-1 rounded-xl bg-slate-100 h-64" />
      </div>
    );
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === active)!;

  return (
    <div className="flex gap-4 items-start">

      {/* ── Left nav ── */}
      <nav className="w-48 shrink-0 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            className={cn(
              'w-full text-left rounded-lg border px-3 py-2.5 transition-all',
              active === item.id
                ? item.activeClass
                : 'border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-200'
            )}
          >
            <div className={cn('flex items-center gap-2 font-medium text-sm', active === item.id ? '' : item.accent)}>
              {item.icon}
              <span className={active === item.id ? '' : 'text-slate-700'}>{item.label}</span>
            </div>
            <p className="mt-0.5 pl-6 text-[11px] text-slate-400 leading-tight">{item.description}</p>
          </button>
        ))}
      </nav>

      {/* ── Right content panel ── */}
      <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Panel header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className={activeNav.accent}>{activeNav.icon}</span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{activeNav.label}</h2>
            <p className="text-xs text-slate-400">{activeNav.description}</p>
          </div>
        </div>
        {/* Panel body */}
        <div className="px-5 py-5 animate-fade-in">
          {active === 'general' && <GeneralSection />}
          {active === 'salary'  && <SalaryEntrySection />}
          {active === 'import'  && <ImportSection />}
          {active === 'danger'  && <ResetSection />}
        </div>
      </div>

    </div>
  );
}
