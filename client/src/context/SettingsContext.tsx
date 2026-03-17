import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '@/firebase';
import { apiUpdateSettings } from '@/api/settings';
import type { Settings, CashBookType, ActiveCashBookType, UpdateSettingsPayload } from '@smp-cashbook/shared';
import { getCurrentFinancialYear } from '@smp-cashbook/shared';

const DEFAULT_SETTINGS: Settings = {
  activeFinancialYear: getCurrentFinancialYear(),
  activeCashBookType: 'Aided',
  financialYears: [getCurrentFinancialYear()],
};

interface SettingsContextValue {
  settings: Settings;
  loading: boolean;
  setActiveFY: (fy: string) => Promise<void>;
  setActiveCashBookType: (type: ActiveCashBookType) => Promise<void>;
  addFinancialYear: (fy: string) => Promise<void>;
  removeFinancialYear: (fy: string) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(firestore, 'settings', 'global');
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as Settings);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const update = useCallback(async (payload: UpdateSettingsPayload) => {
    await apiUpdateSettings(payload);
  }, []);

  const setActiveFY = useCallback(
    async (fy: string) => update({ activeFinancialYear: fy }),
    [update]
  );

  const setActiveCashBookType = useCallback(
    async (type: ActiveCashBookType) => update({ activeCashBookType: type }),
    [update]
  );

  const addFinancialYear = useCallback(
    async (fy: string) => {
      if (settings.financialYears.includes(fy)) return;
      const updated = [...settings.financialYears, fy].sort().reverse();
      await update({ financialYears: updated });
    },
    [settings.financialYears, update]
  );

  const removeFinancialYear = useCallback(
    async (fy: string) => {
      const updated = settings.financialYears.filter((f) => f !== fy);
      const payload: UpdateSettingsPayload = { financialYears: updated };
      if (settings.activeFinancialYear === fy && updated.length > 0) {
        payload.activeFinancialYear = updated[0];
      }
      await update(payload);
    },
    [settings, update]
  );

  return (
    <SettingsContext.Provider
      value={{ settings, loading, setActiveFY, setActiveCashBookType, addFinancialYear, removeFinancialYear }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
