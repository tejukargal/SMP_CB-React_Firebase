import admin from 'firebase-admin';
import { db } from '../config/firebase';

// Stored at settings/bankReconciliation
// Shape: { [financialYear]: { [bankKey]: { [entryId]: "YYYY-MM-DD" } } }
const RECON_DOC = db.collection('settings').doc('bankReconciliation');

/** Returns { [entryId]: bankDate } for the given bank + FY */
export async function getBankReconciliation(
  financialYear: string,
): Promise<Record<string, Record<string, string>>> {
  const snap = await RECON_DOC.get();
  if (!snap.exists) return {};
  const data = snap.data() as Record<string, Record<string, Record<string, string>>>;
  return data[financialYear] ?? {};
}

/** Sets a bank clearing date for one entry */
export async function setBankReconciliationDate(
  financialYear: string,
  bankKey: string,
  entryId: string,
  bankDate: string,
): Promise<void> {
  await RECON_DOC.set(
    { [financialYear]: { [bankKey]: { [entryId]: bankDate } } },
    { merge: true },
  );
}

/** Clears the bank date for one entry (marks it as unreconciled) */
export async function clearBankReconciliationDate(
  financialYear: string,
  bankKey: string,
  entryId: string,
): Promise<void> {
  try {
    await RECON_DOC.update({
      [`${financialYear}.${bankKey}.${entryId}`]: admin.firestore.FieldValue.delete(),
    });
  } catch (err: unknown) {
    // Document doesn't exist yet — nothing to clear
    const code = (err as { code?: number }).code;
    if (code === 5) return; // NOT_FOUND
    throw err;
  }
}
