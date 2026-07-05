import admin from 'firebase-admin';
import { db } from '../config/firebase';
import type { PendingBill, CreatePendingBillPayload } from '@smp-cashbook/shared';

function pendingBillCollection(financialYear: string, cashBookType: string) {
  return db
    .collection('pendingBills')
    .doc(financialYear)
    .collection(cashBookType);
}

export async function createPendingBill(payload: CreatePendingBillPayload): Promise<PendingBill> {
  const { financialYear, cashBookType } = payload;
  const col = pendingBillCollection(financialYear, cashBookType);

  const createdAt = new Date().toISOString();
  const docRef = await col.add({
    ...payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    id: docRef.id,
    date: payload.date,
    bank: payload.bank ?? '',
    chqNoOrCash: payload.chqNoOrCash ?? '',
    amount: payload.amount,
    headOfAccount: payload.headOfAccount,
    firmName: payload.firmName,
    billNumber: payload.billNumber,
    billDate: payload.billDate,
    particulars: payload.particulars ?? '',
    status: payload.status,
    financialYear: payload.financialYear,
    cashBookType: payload.cashBookType,
    createdAt,
  };
}

export async function getPendingBills(
  financialYear: string,
  cashBookType: string
): Promise<PendingBill[]> {
  const col = pendingBillCollection(financialYear, cashBookType);
  const snap = await col.orderBy('date', 'asc').get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      date: data.date,
      bank: data.bank ?? '',
      chqNoOrCash: data.chqNoOrCash ?? '',
      amount: data.amount,
      headOfAccount: data.headOfAccount,
      firmName: data.firmName,
      billNumber: data.billNumber,
      billDate: data.billDate,
      particulars: data.particulars ?? '',
      status: data.status ?? 'Pending',
      financialYear: data.financialYear,
      cashBookType: data.cashBookType,
      createdAt: data.createdAt?.toDate().toISOString() ?? '',
      clearedAt: data.clearedAt as string | undefined,
    };
  });
}

export interface UpdatePendingBillFields {
  date?: string;
  bank?: string;
  chqNoOrCash?: string;
  amount?: number;
  headOfAccount?: string;
  firmName?: string;
  billNumber?: string;
  billDate?: string;
  particulars?: string;
  status?: string;
}

export async function updatePendingBill(
  billId: string,
  financialYear: string,
  cashBookType: string,
  fields: UpdatePendingBillFields
): Promise<PendingBill> {
  const col = pendingBillCollection(financialYear, cashBookType);
  const ref = col.doc(billId);

  const updatePayload: Record<string, unknown> = { ...fields, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (fields.status === 'Cleared') {
    updatePayload['clearedAt'] = new Date().toISOString();
  } else if (fields.status === 'Pending') {
    updatePayload['clearedAt'] = admin.firestore.FieldValue.delete();
  }

  const [snap] = await Promise.all([
    ref.get(),
    ref.update(updatePayload),
  ]);
  const data = snap.data()!;
  const resolvedClearedAt = fields.status === 'Pending'
    ? undefined
    : (fields.status === 'Cleared' ? (updatePayload['clearedAt'] as string) : (data.clearedAt as string | undefined));

  return {
    id: billId,
    date: (fields.date ?? data.date) as string,
    bank: (fields.bank ?? data.bank ?? '') as string,
    chqNoOrCash: (fields.chqNoOrCash ?? data.chqNoOrCash ?? '') as string,
    amount: (fields.amount ?? data.amount) as number,
    headOfAccount: (fields.headOfAccount ?? data.headOfAccount) as string,
    firmName: (fields.firmName ?? data.firmName) as string,
    billNumber: (fields.billNumber ?? data.billNumber) as string,
    billDate: (fields.billDate ?? data.billDate) as string,
    particulars: (fields.particulars ?? data.particulars ?? '') as string,
    status: (fields.status ?? data.status ?? 'Pending') as PendingBill['status'],
    financialYear: data.financialYear as string,
    cashBookType: data.cashBookType as PendingBill['cashBookType'],
    createdAt: data.createdAt?.toDate().toISOString() ?? '',
    clearedAt: resolvedClearedAt,
  };
}

export async function deletePendingBill(
  billId: string,
  financialYear: string,
  cashBookType: string
): Promise<void> {
  const col = pendingBillCollection(financialYear, cashBookType);
  await col.doc(billId).delete();
}
