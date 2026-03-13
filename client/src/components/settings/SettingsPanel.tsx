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
  // Take the latest FY and add one year
  const sorted = [...existingYears].sort().reverse();
  const latest = sorted[0];
  const startYear = parseInt(latest.split('-')[0], 10);
  return generateFYLabel(startYear + 1);
}

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
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  const cashBookTypes: CashBookType[] = ['Aided', 'Un-Aided'];

  return (
    <div className="space-y-8 max-w-3xl">

      {/* Cash Book Type */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Cash Book Type</h2>
        <div className="flex gap-2">
          {cashBookTypes.map((type) => (
            <button
              key={type}
              onClick={() => handleSetCashBookType(type)}
              disabled={saving !== null}
              className={cn(
                'flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-all',
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
      </section>

      {/* Financial Years */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Financial Years</h2>
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
          Suggested next: <button className="font-medium text-blue-600 hover:underline" onClick={() => setNewFY(suggestedFY)}>{suggestedFY}</button>
        </p>
      </section>

      {/* Divider */}
      <hr className="border-slate-200" />

      {/* Quick Salary Entry */}
      <SalaryEntrySection />

      {/* Divider */}
      <hr className="border-slate-200" />

      {/* Import Cash Book Data */}
      <ImportSection />

      {/* Divider */}
      <hr className="border-slate-200" />

      {/* Reset Transactions */}
      <ResetSection />

    </div>
  );
}
