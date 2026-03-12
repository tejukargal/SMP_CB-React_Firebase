import { db } from '../config/firebase';
import type { Settings, UpdateSettingsPayload } from '@smp-cashbook/shared';

const SETTINGS_DOC = db.collection('settings').doc('global');

const DEFAULT_SETTINGS: Settings = {
  activeFinancialYear: '2025-26',
  activeCashBookType: 'Aided',
  financialYears: ['2025-26'],
};

export async function getSettings(): Promise<Settings> {
  const snap = await SETTINGS_DOC.get();
  if (!snap.exists) {
    await SETTINGS_DOC.set(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return snap.data() as Settings;
}

export async function updateSettings(payload: UpdateSettingsPayload): Promise<Settings> {
  await SETTINGS_DOC.set(payload, { merge: true });
  const snap = await SETTINGS_DOC.get();
  return snap.data() as Settings;
}
