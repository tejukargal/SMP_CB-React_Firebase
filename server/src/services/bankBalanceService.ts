import { db } from '../config/firebase';

// Stored at settings/bankOpeningBalances
// Shape: { [financialYear]: { [accountKey]: number } }
const BALANCES_DOC = db.collection('settings').doc('bankOpeningBalances');

export async function getBankOpeningBalances(
  financialYear: string,
): Promise<Record<string, number>> {
  const snap = await BALANCES_DOC.get();
  if (!snap.exists) return {};
  const data = snap.data() as Record<string, Record<string, number>>;
  return data[financialYear] ?? {};
}

export async function setBankOpeningBalance(
  financialYear: string,
  accountKey: string,
  balance: number,
): Promise<void> {
  // merge: true ensures other FYs and other accounts are not overwritten
  await BALANCES_DOC.set(
    { [financialYear]: { [accountKey]: balance } },
    { merge: true },
  );
}
