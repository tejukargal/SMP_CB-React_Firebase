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

function getSuggestedFY(): string {
  return getCurrentFinancialYear();
}

function getNextFY(existingYears: string[]): string {
  if (existingYears.length === 0) return getSuggestedFY();
  const sorted = [...existingYears].sort().reverse();
  const latest = sorted[0];
  const startYear = parseInt(latest.split('-')[0], 10);
  return generateFYLabel(startYear + 1);
}

// ── Section card wrapper ──────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  description,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: 'blue' | 'green' | 'slate' | 'red';
  children: React.ReactNode;
}) {
  const accentBorder: Record<string, string> = {
    blue:  'border-l-blue-400',
    green: 'border-l-green-400',
    slate: 'border-l-slate-400',
    red:   'border-l-red-400',
  };
  const accentIcon: Record<string, string> = {
    blue:  'bg-blue-50 text-blue-500',
    green: 'bg-green-50 text-green-500',
    slate: 'bg-slate-100 text-slate-500',
    red:   'bg-red-50 text-red-500',
  };

  return (
    <div className={cn('rounded-xl border border-slate-200 border-l-4 bg-white shadow-sm', accentBorder[accent])}>
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
        <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', accentIcon[accent])}>
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{description}</p>
        </div>
      </div>
      {/* Body */}
      <div className="px-5 py-4">
        {children}
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconSettings = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconSalary = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const IconImport = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const IconDanger = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsPanel() {
  const { settings, loading, setActiveFY, setActiveCashBookType, addFinancialYear, removeFinancialYear } =
    useSettings();
  const { addToast } = useToast();
  const [newFY, setNewFY] = useState('');
  const [fyError, setFyError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const suggestedFY = getNextFY(settings.financialYears);

  const handleAddFY = async () => {
    const fy = newFY.trim() || suggestedFY;
    if (!isValidFY(fy)) {
      setFyError('Format must be YYYY-YY (e.g. 2025-26)');
      return;
    }
    if (settings.financialYears.includes(fy)) {
      setFyError('This financial year already exists');
      return;
    }
    setFyError('');
    setSaving('add-fy');
    try {
      await addFinancialYear(fy);
      setNewFY('');
      addToast(`Financial year ${fy} added`, 'success');
    } catch {
      addToast('Failed to add financial year', 'error');
    } finally {
      setSaving(null);
    }
  };

  const handleRemoveFY = async (fy: string) => {
    if (settings.financialYears.length <= 1) {
      addToast('Cannot remove the last financial year', 'error');
      return;
    }
    setSaving(`remove-${fy}`);
    try {
      await removeFinancialYear(fy);
      addToast(`Financial year ${fy} removed`, 'info');
    } catch {
      addToast('Failed to remove financial year', 'error');
    } finally {
      setSaving(null);
    }
  };

  const handleSetActiveFY = async (fy: string) => {
    setSaving(`activate-${fy}`);
    try {
      await setActiveFY(fy);
      addToast(`Active financial year set to ${fy}`, 'success');
    } catch {
      addToast('Failed to update active financial year', 'error');
    } finally {
      setSaving(null);
    }
  };

  const handleSetCashBookType = async (type: CashBookType) => {
    setSaving(`type-${type}`);
    try {
      await setActiveCashBookType(type);
      addToast(`Cash Book type set to ${type}`, 'success');
    } catch {
      addToast('Failed to update Cash Book type', 'error');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  const cashBookTypes: CashBookType[] = ['Aided', 'Un-Aided'];

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── 1. Active Settings ── */}
      <SectionCard
        icon={IconSettings}
        title="Active Settings"
        accent="blue"
        description="Choose the active cash book type and manage financial years."
      >
        <div className="space-y-5">

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

          {/* Divider */}
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
                    settings.activeFinancialYear === fy
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-slate-200 bg-white'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{fy}</span>
                    {settings.activeFinancialYear === fy && (
                      <Badge variant="blue">Active</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.activeFinancialYear !== fy && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSetActiveFY(fy)}
                        loading={saving === `activate-${fy}`}
                      >
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

            {/* Add FY */}
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
              <Button
                variant="secondary"
                onClick={handleAddFY}
                loading={saving === 'add-fy'}
                className="shrink-0 self-start"
              >
                Add Year
              </Button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Suggested next:{' '}
              <button
                className="font-medium text-blue-600 hover:underline"
                onClick={() => setNewFY(suggestedFY)}
              >
                {suggestedFY}
              </button>
            </p>
          </div>

        </div>
      </SectionCard>

      {/* ── 2. Quick Salary Entry ── */}
      <SectionCard
        icon={IconSalary}
        title="Quick Salary Entry"
        accent="green"
        description="Post all salary receipts and payments for a month in one step."
      >
        <SalaryEntrySection />
      </SectionCard>

      {/* ── 3. Import Data ── */}
      <SectionCard
        icon={IconImport}
        title="Import Cash Book Data"
        accent="slate"
        description="Upload an Excel (.xlsx / .xls) or CSV file to bulk-import entries."
      >
        <ImportSection />
      </SectionCard>

      {/* ── 4. Danger Zone ── */}
      <SectionCard
        icon={IconDanger}
        title="Danger Zone"
        accent="red"
        description="Irreversible actions — permanently delete transaction data."
      >
        <ResetSection />
      </SectionCard>

    </div>
  );
}
