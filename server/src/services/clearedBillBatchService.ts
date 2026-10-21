import admin from 'firebase-admin';
import { db } from '../config/firebase';
import { getFirmsByNames } from './firmService';
import type { ClearedBillBatch, ClearingGroup, FirmBankSnapshot, PaymentLine, PaymentMode } from '@smp-cashbook/shared';

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

export class ClearedBatchNotFoundError extends Error {
  constructor() {
    super('Cleared batch not found');
  }
}

export interface CreatePaymentLineInput {
  mode: PaymentMode;
  bank: string;
  refNo: string;
  billIds: string[];
}

/** Validates payment lines and returns their flattened bill ids. */
function validatePaymentLines(lines: CreatePaymentLineInput[]): string[] {
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
  return billIds;
}

/** Keeps only snapshots for firms in the batch that have at least one field filled in. */
function cleanFirmSnapshots(snapshots: FirmBankSnapshot[], firmNames: Set<string>): FirmBankSnapshot[] {
  return snapshots
    .filter((f) => firmNames.has(f.firmName))
    .map((f) => ({
      firmName: f.firmName,
      accountNo: (f.accountNo ?? '').trim(),
      ifscCode: (f.ifscCode ?? '').trim().toUpperCase(),
      bankName: (f.bankName ?? '').trim(),
      branch: (f.branch ?? '').trim(),
    }))
    .filter((f) => f.accountNo || f.ifscCode || f.bankName || f.branch);
}

function revertBillToApprovedFields() {
  return {
    status: 'Approved',
    bank: '',
    clearedAt: admin.firestore.FieldValue.delete(),
    clearedBatchId: admin.firestore.FieldValue.delete(),
    paymentMode: admin.firestore.FieldValue.delete(),
    paymentRefNo: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export async function createClearedBillBatch(
  financialYear: string,
  cashBookType: string,
  group: ClearingGroup,
  lines: CreatePaymentLineInput[],
  date: string,
  clientFirmBankDetails?: FirmBankSnapshot[]
): Promise<ClearedBillBatch> {
  const billIds = validatePaymentLines(lines);

  const billsCol = pendingBillCollection(financialYear, cashBookType);
  const billRefs = billIds.map((id) => billsCol.doc(id));
  const billSnaps = await Promise.all(billRefs.map((ref) => ref.get()));

  const invalidIds: string[] = [];
  const amountById = new Map<string, number>();
  const firmNameById = new Map<string, string>();
  billSnaps.forEach((snap, i) => {
    const data = snap.data();
    if (!snap.exists || data?.status !== 'Approved') {
      invalidIds.push(billIds[i] as string);
    } else {
      amountById.set(billIds[i] as string, data.amount as number);
      if (data.firmName) firmNameById.set(billIds[i] as string, data.firmName as string);
    }
  });
  if (invalidIds.length > 0) throw new InvalidBillsForClearingError(invalidIds);

  // Snapshot each distinct firm's bank details at clearance time, so later edits to the Firm
  // Directory never retroactively change an already-printed/cleared batch. Prefer the snapshot
  // the client printed; fall back to the Firm Directory for older clients.
  const distinctFirmNames = Array.from(new Set(firmNameById.values()));
  let firmBankDetails: FirmBankSnapshot[];
  if (clientFirmBankDetails) {
    firmBankDetails = cleanFirmSnapshots(clientFirmBankDetails, new Set(distinctFirmNames));
  } else {
    const firmMap = await getFirmsByNames(distinctFirmNames);
    firmBankDetails = distinctFirmNames
      .map((name) => firmMap.get(name))
      .filter((f): f is NonNullable<typeof f> => !!f)
      .map((f) => ({ firmName: f.firmName, accountNo: f.accountNo, ifscCode: f.ifscCode, bankName: f.bankName, branch: f.branch }));
  }

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
    ...(firmBankDetails.length > 0 && { firmBankDetails }),
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
    ...(firmBankDetails.length > 0 && { firmBankDetails }),
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
    writeBatch.update(billRefs[i], revertBillToApprovedFields());
  });
  writeBatch.delete(batchRef);
  await writeBatch.commit();
}

export async function updateClearedBillBatch(
  financialYear: string,
  cashBookType: string,
  batchId: string,
  lines: CreatePaymentLineInput[],
  date: string,
  firmSnapshots: FirmBankSnapshot[]
): Promise<ClearedBillBatch> {
  const batchRef = clearedBatchCollection(financialYear, cashBookType).doc(batchId);
  const batchSnap = await batchRef.get();
  if (!batchSnap.exists) throw new ClearedBatchNotFoundError();
  const existing = batchSnap.data()!;
  const group = (existing.group as ClearingGroup | undefined) ?? 'Cash';

  const billIds = validatePaymentLines(lines);
  if (group === 'Cash' && (lines.length !== 1 || lines[0]?.mode !== 'Cash')) {
    throw new InvalidPaymentLinesError('A Cash batch must have exactly one Cash payment line');
  }
  if (group === 'NonCash' && lines.some((line) => line.mode === 'Cash')) {
    throw new InvalidPaymentLinesError('A Non-Cash batch cannot contain Cash payment lines');
  }

  const oldBillIds = (existing.billIds as string[]) ?? [];
  const oldSet = new Set(oldBillIds);
  const added = billIds.filter((id) => !oldSet.has(id));
  if (added.length > 0) {
    throw new InvalidPaymentLinesError(`Bills cannot be added to an existing batch: ${added.join(', ')}`);
  }
  const newSet = new Set(billIds);
  const removedIds = oldBillIds.filter((id) => !newSet.has(id));

  const billsCol = pendingBillCollection(financialYear, cashBookType);
  const keptSnaps = await Promise.all(billIds.map((id) => billsCol.doc(id).get()));
  const removedSnaps = await Promise.all(removedIds.map((id) => billsCol.doc(id).get()));

  const invalidIds: string[] = [];
  const amountById = new Map<string, number>();
  const firmNames = new Set<string>();
  keptSnaps.forEach((snap, i) => {
    const data = snap.data();
    if (!snap.exists || data?.clearedBatchId !== batchId) {
      invalidIds.push(billIds[i] as string);
    } else {
      amountById.set(billIds[i] as string, data.amount as number);
      if (data.firmName) firmNames.add(data.firmName as string);
    }
  });
  if (invalidIds.length > 0) {
    throw new InvalidPaymentLinesError(`Bills no longer belong to this batch: ${invalidIds.join(', ')}`);
  }

  const firmBankDetails = cleanFirmSnapshots(firmSnapshots, firmNames);
  const paymentLines: PaymentLine[] = lines.map((line) => ({
    mode: line.mode,
    bank: line.bank.trim(),
    refNo: line.refNo.trim(),
    billIds: line.billIds,
    amount: line.billIds.reduce((sum, id) => sum + (amountById.get(id) ?? 0), 0),
  }));
  const totalAmount = paymentLines.reduce((sum, line) => sum + line.amount, 0);

  const writeBatch = db.batch();
  writeBatch.update(batchRef, {
    date,
    paymentLines,
    billIds,
    totalAmount,
    count: billIds.length,
    firmBankDetails: firmBankDetails.length > 0 ? firmBankDetails : admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  paymentLines.forEach((line) => {
    line.billIds.forEach((id) => {
      writeBatch.update(billsCol.doc(id), {
        clearedAt: date,
        bank: line.bank,
        paymentMode: line.mode,
        paymentRefNo: line.refNo,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  });
  removedSnaps.forEach((snap, i) => {
    if (!snap.exists || snap.data()?.clearedBatchId !== batchId) return;
    writeBatch.update(billsCol.doc(removedIds[i] as string), revertBillToApprovedFields());
  });
  await writeBatch.commit();

  return {
    id: batchId,
    date,
    group,
    paymentLines,
    billIds,
    totalAmount,
    count: billIds.length,
    financialYear,
    cashBookType: cashBookType as ClearedBillBatch['cashBookType'],
    createdAt: existing.createdAt?.toDate().toISOString() ?? '',
    updatedAt: new Date().toISOString(),
    ...(firmBankDetails.length > 0 && { firmBankDetails }),
  };
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
      firmBankDetails: data.firmBankDetails as FirmBankSnapshot[] | undefined,
      updatedAt: data.updatedAt?.toDate().toISOString(),
    };
  });
}
