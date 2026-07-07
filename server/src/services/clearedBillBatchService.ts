import admin from 'firebase-admin';
import { db } from '../config/firebase';
import type { ClearedBillBatch, ClearingGroup, PaymentLine, PaymentMode } from '@smp-cashbook/shared';

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

export class InvalidPaymentLinesError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface CreatePaymentLineInput {
  mode: PaymentMode;
  bank: string;
  refNo: string;
  billIds: string[];
}

export async function createClearedBillBatch(
  financialYear: string,
  cashBookType: string,
  group: ClearingGroup,
  lines: CreatePaymentLineInput[],
  date: string
): Promise<ClearedBillBatch> {
  const billIds = lines.flatMap((line) => line.billIds);
  if (billIds.length === 0) throw new InvalidPaymentLinesError('At least one bill must be included');

  const seen = new Set<string>();
  for (const id of billIds) {
    if (seen.has(id)) throw new InvalidPaymentLinesError(`Bill ${id} is assigned to more than one payment line`);
    seen.add(id);
  }
  for (const line of lines) {
    if (line.mode !== 'Cash' && !line.refNo.trim()) {
      throw new InvalidPaymentLinesError(`Reference number is required for ${line.mode} payment lines`);
    }
    if (line.billIds.length === 0) {
      throw new InvalidPaymentLinesError('Every payment line must include at least one bill');
    }
  }

  const billsCol = pendingBillCollection(financialYear, cashBookType);
  const billRefs = billIds.map((id) => billsCol.doc(id));
  const billSnaps = await Promise.all(billRefs.map((ref) => ref.get()));

  const invalidIds: string[] = [];
  const amountById = new Map<string, number>();
  billSnaps.forEach((snap, i) => {
    const data = snap.data();
    if (!snap.exists || data?.status !== 'Approved') {
      invalidIds.push(billIds[i] as string);
    } else {
      amountById.set(billIds[i] as string, data.amount as number);
    }
  });
  if (invalidIds.length > 0) throw new InvalidBillsForClearingError(invalidIds);

  const paymentLines: PaymentLine[] = lines.map((line) => ({
    mode: line.mode,
    bank: line.bank.trim(),
    refNo: line.refNo.trim(),
    billIds: line.billIds,
    amount: line.billIds.reduce((sum, id) => sum + (amountById.get(id) ?? 0), 0),
  }));
  const totalAmount = paymentLines.reduce((sum, line) => sum + line.amount, 0);

  const batchCol = clearedBatchCollection(financialYear, cashBookType);
  const batchRef = batchCol.doc();
  const createdAt = new Date().toISOString();

  const writeBatch = db.batch();
  writeBatch.set(batchRef, {
    date,
    group,
    paymentLines,
    billIds,
    totalAmount,
    count: billIds.length,
    financialYear,
    cashBookType,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  paymentLines.forEach((line) => {
    line.billIds.forEach((id) => {
      const ref = billsCol.doc(id);
      writeBatch.update(ref, {
        status: 'Cleared',
        clearedAt: date,
        clearedBatchId: batchRef.id,
        bank: line.bank,
        paymentMode: line.mode,
        paymentRefNo: line.refNo,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  });
  await writeBatch.commit();

  return {
    id: batchRef.id,
    date,
    group,
    paymentLines,
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
      bank: '',
      clearedAt: admin.firestore.FieldValue.delete(),
      clearedBatchId: admin.firestore.FieldValue.delete(),
      paymentMode: admin.firestore.FieldValue.delete(),
      paymentRefNo: admin.firestore.FieldValue.delete(),
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
    const billIds = (data.billIds as string[]) ?? [];
    const totalAmount = data.totalAmount as number;
    const paymentLines = (data.paymentLines as PaymentLine[] | undefined)
      ?? [{ mode: 'Cash' as PaymentMode, bank: '', refNo: '', billIds, amount: totalAmount }];
    return {
      id: doc.id,
      date: data.date as string,
      group: (data.group as ClearingGroup | undefined) ?? 'Cash',
      paymentLines,
      billIds,
      totalAmount,
      count: data.count as number,
      financialYear: data.financialYear as string,
      cashBookType: data.cashBookType as ClearedBillBatch['cashBookType'],
      createdAt: data.createdAt?.toDate().toISOString() ?? '',
    };
  });
}
