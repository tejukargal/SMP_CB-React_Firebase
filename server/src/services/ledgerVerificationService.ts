import admin from 'firebase-admin';
import { db } from '../config/firebase';
import type { LedgerVerificationStatus } from '@smp-cashbook/shared';

// Stored at settings/ledgerVerification
// Shape: { [financialYear]: { [cashBookType]: { [entryId]: "verified" | "mismatch" } } }
const VERIFICATION_DOC = db.collection('settings').doc('ledgerVerification');

/** Returns { [cashBookType]: { [entryId]: status } } for the given FY */
export async function getLedgerVerification(
  financialYear: string,
): Promise<Record<string, Record<string, LedgerVerificationStatus>>> {
  const snap = await VERIFICATION_DOC.get();
  if (!snap.exists) return {};
  const data = snap.data() as Record<string, Record<string, Record<string, LedgerVerificationStatus>>>;
  return data[financialYear] ?? {};
}

/** Sets the verification status for one entry */
export async function setLedgerVerificationStatus(
  financialYear: string,
  cashBookType: string,
  entryId: string,
  status: LedgerVerificationStatus,
): Promise<void> {
  await VERIFICATION_DOC.set(
    { [financialYear]: { [cashBookType]: { [entryId]: status } } },
    { merge: true },
  );
}

/** Clears the verification status for one entry (marks it as unverified) */
export async function clearLedgerVerificationStatus(
  financialYear: string,
  cashBookType: string,
  entryId: string,
): Promise<void> {
  try {
    await VERIFICATION_DOC.update({
      [`${financialYear}.${cashBookType}.${entryId}`]: admin.firestore.FieldValue.delete(),
    });
  } catch (err: unknown) {
    // Document doesn't exist yet — nothing to clear
    const code = (err as { code?: number }).code;
    if (code === 5) return; // NOT_FOUND
    throw err;
  }
}
