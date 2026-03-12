import admin from 'firebase-admin';
import { db } from '../config/firebase';
import type { CreateEntryPayload } from '@smp-cashbook/shared';

const BATCH_SIZE = 499; // Firestore max is 500 ops per batch

export interface ImportResult {
  imported: number;
  failed: number;
}

export async function importEntries(
  entries: CreateEntryPayload[]
): Promise<ImportResult> {
  let imported = 0;
  let failed = 0;

  // Split into chunks of BATCH_SIZE and commit each chunk
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const entry of chunk) {
      try {
        const ref = db
          .collection('entries')
          .doc(entry.financialYear)
          .collection(entry.cashBookType)
          .doc(); // auto-ID

        batch.set(ref, {
          date: entry.date,
          chequeNo: entry.chequeNo ?? '',
          amount: entry.amount,
          headOfAccount: entry.headOfAccount,
          notes: entry.notes ?? '',
          type: entry.type,
          financialYear: entry.financialYear,
          cashBookType: entry.cashBookType,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        imported++;
      } catch {
        failed++;
      }
    }

    await batch.commit();
  }

  return { imported, failed };
}
