import admin from 'firebase-admin';
import { db } from '../config/firebase';
import type { ClearedBillBatch } from '@smp-cashbook/shared';

function pendingBillCollection(financialYear: string, cashBookType: string) {
  return db.collection('pendingBills').doc(financialYear).collection(cashBookType);
}

function clearedBatchCollection(financialYear: string, cashBookType: string) {
  return db.collection('clearedBillBatches').doc(financialYear).collection(cashBookType);
}

export class InvalidBillsForClearingError extends Error {
  invalidIds: string[];
  constructor(invalidIds: string[]) {
    super(`Bills must be Approved before they can be cleared: ${invalidIds.join(', ')}`);
    this.invalidIds = invalidIds;
  }
}

export async function createClearedBillBatch(
  financialYear: string,
  cashBookType: string,
  billIds: string[],
  date: string
): Promise<ClearedBillBatch> {
  const billsCol = pendingBillCollection(financialYear, cashBookType);
  const billRefs = billIds.map((id) => billsCol.doc(id));
  const billSnaps = await Promise.all(billRefs.map((ref) => ref.get()));

  const invalidIds: string[] = [];
  let totalAmount = 0;
  billSnaps.forEach((snap, i) => {
    const data = snap.data();
    if (!snap.exists || data?.status !== 'Approved') {
      invalidIds.push(billIds[i] as string);
    } else {
      totalAmount += data.amount as number;
    }
  });
  if (invalidIds.length > 0) throw new InvalidBillsForClearingError(invalidIds);

  const batchCol = clearedBatchCollection(financialYear, cashBookType);
  const batchRef = batchCol.doc();
  const createdAt = new Date().toISOString();

  const writeBatch = db.batch();
  writeBatch.set(batchRef, {
    date,
    billIds,
    totalAmount,
    count: billIds.length,
    financialYear,
    cashBookType,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  billRefs.forEach((ref) => {
    writeBatch.update(ref, {
      status: 'Cleared',
      clearedAt: date,
      clearedBatchId: batchRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await writeBatch.commit();

  return {
    id: batchRef.id,
    date,
    billIds,
    totalAmount,
    count: billIds.length,
    financialYear,
    cashBookType: cashBookType as ClearedBillBatch['cashBookType'],
    createdAt,
  };
}

export async function deleteClearedBillBatch(
  financialYear: string,
  cashBookType: string,
  batchId: string
): Promise<void> {
  const batchCol = clearedBatchCollection(financialYear, cashBookType);
  const batchRef = batchCol.doc(batchId);
  const batchSnap = await batchRef.get();
  if (!batchSnap.exists) return;

  const billIds = (batchSnap.data()?.billIds as string[]) ?? [];
  const billsCol = pendingBillCollection(financialYear, cashBookType);
  const billRefs = billIds.map((id) => billsCol.doc(id));
  const billSnaps = await Promise.all(billRefs.map((ref) => ref.get()));

  const writeBatch = db.batch();
  billSnaps.forEach((snap, i) => {
    if (!snap.exists || snap.data()?.clearedBatchId !== batchId) return;
    writeBatch.update(billRefs[i], {
      status: 'Approved',
      clearedAt: admin.firestore.FieldValue.delete(),
      clearedBatchId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  writeBatch.delete(batchRef);
  await writeBatch.commit();
}

export async function getClearedBillBatches(
  financialYear: string,
  cashBookType: string
): Promise<ClearedBillBatch[]> {
  const col = clearedBatchCollection(financialYear, cashBookType);
  const snap = await col.orderBy('date', 'desc').get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      date: data.date as string,
      billIds: (data.billIds as string[]) ?? [],
      totalAmount: data.totalAmount as number,
      count: data.count as number,
      financialYear: data.financialYear as string,
      cashBookType: data.cashBookType as ClearedBillBatch['cashBookType'],
      createdAt: data.createdAt?.toDate().toISOString() ?? '',
    };
  });
}
