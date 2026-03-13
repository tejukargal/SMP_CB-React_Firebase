import admin from 'firebase-admin';
import { db } from '../config/firebase';
import type { Entry, CreateEntryPayload } from '@smp-cashbook/shared';

function entryCollection(financialYear: string, cashBookType: string) {
  return db
    .collection('entries')
    .doc(financialYear)
    .collection(cashBookType);
}

export async function createEntry(payload: CreateEntryPayload): Promise<Entry> {
  const { financialYear, cashBookType } = payload;
  const col = entryCollection(financialYear, cashBookType);

  const createdAt = new Date().toISOString();
  const docRef = await col.add({
    ...payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    id: docRef.id,
    date: payload.date,
    chequeNo: payload.chequeNo ?? '',
    amount: payload.amount,
    headOfAccount: payload.headOfAccount,
    notes: payload.notes ?? '',
    type: payload.type,
    financialYear: payload.financialYear,
    cashBookType: payload.cashBookType,
    createdAt,
  };
}

export async function getEntries(
  financialYear: string,
  cashBookType: string
): Promise<Entry[]> {
  const col = entryCollection(financialYear, cashBookType);
  const snap = await col.orderBy('date', 'asc').get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      date: data.date,
      chequeNo: data.chequeNo ?? '',
      amount: data.amount,
      headOfAccount: data.headOfAccount,
      notes: data.notes ?? '',
      type: data.type,
      financialYear: data.financialYear,
      cashBookType: data.cashBookType,
      createdAt: data.createdAt?.toDate().toISOString() ?? '',
      voucherNo: data.voucherNo as string | undefined,
    };
  });
}

export interface UpdateEntryFields {
  date?: string;
  chequeNo?: string;
  amount?: number;
  headOfAccount?: string;
  notes?: string;
  type?: string;
  voucherNo?: string;
}

export async function updateEntry(
  entryId: string,
  financialYear: string,
  cashBookType: string,
  fields: UpdateEntryFields
): Promise<Entry> {
  const col = entryCollection(financialYear, cashBookType);
  const ref = col.doc(entryId);
  // Fetch current doc and write update in parallel, then merge
  // Build the update payload — empty voucherNo means delete the field
  const updatePayload: Record<string, unknown> = { ...fields, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (fields.voucherNo === '') {
    updatePayload['voucherNo'] = admin.firestore.FieldValue.delete();
  }

  const [snap] = await Promise.all([
    ref.get(),
    ref.update(updatePayload),
  ]);
  const data = snap.data()!;
  const resolvedVoucherNo = fields.voucherNo === ''
    ? undefined
    : (fields.voucherNo ?? data.voucherNo) as string | undefined;
  return {
    id: entryId,
    date: (fields.date ?? data.date) as string,
    chequeNo: (fields.chequeNo ?? data.chequeNo ?? '') as string,
    amount: (fields.amount ?? data.amount) as number,
    headOfAccount: (fields.headOfAccount ?? data.headOfAccount) as string,
    notes: (fields.notes ?? data.notes ?? '') as string,
    type: (fields.type ?? data.type) as Entry['type'],
    financialYear: data.financialYear as string,
    cashBookType: data.cashBookType as Entry['cashBookType'],
    createdAt: data.createdAt?.toDate().toISOString() ?? '',
    voucherNo: resolvedVoucherNo,
  };
}

export async function deleteEntry(
  entryId: string,
  financialYear: string,
  cashBookType: string
): Promise<void> {
  const col = entryCollection(financialYear, cashBookType);
  await col.doc(entryId).delete();
}

/** Delete every entry for a specific financial year + cash-book type, in batches. */
export async function resetEntriesForFY(
  financialYear: string,
  cashBookType: string
): Promise<number> {
  const col = entryCollection(financialYear, cashBookType);
  let totalDeleted = 0;

  while (true) {
    const snap = await col.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < 400) break;
  }

  return totalDeleted;
}
