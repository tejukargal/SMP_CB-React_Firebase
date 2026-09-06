import admin from 'firebase-admin';
import { db } from '../config/firebase';
import { getBudgetHeadById } from './budgetHeadService';
import { BudgetHeadNotFoundError } from './budgetAllocationService';
import type { BudgetExpense, CreateBudgetExpensePayload } from '@smp-cashbook/shared';

function expenseCollection(financialYear: string, cashBookType: string) {
  return db
    .collection('budgetExpenses')
    .doc(financialYear)
    .collection(cashBookType);
}

function mapDoc(id: string, data: FirebaseFirestore.DocumentData): BudgetExpense {
  return {
    id,
    date: data.date,
    headId: data.headId,
    headName: data.headName ?? '',
    amount: data.amount,
    notes: data.notes ?? '',
    financialYear: data.financialYear,
    cashBookType: data.cashBookType,
    linkedEntryId: data.linkedEntryId as string | undefined,
    createdAt: data.createdAt?.toDate().toISOString() ?? '',
  };
}

export async function createBudgetExpense(payload: CreateBudgetExpensePayload): Promise<BudgetExpense> {
  const head = await getBudgetHeadById(payload.headId);
  if (!head || !head.isActive) throw new BudgetHeadNotFoundError(payload.headId);

  const { financialYear, cashBookType } = payload;
  const col = expenseCollection(financialYear, cashBookType);

  const docData: Record<string, unknown> = {
    date: payload.date,
    headId: payload.headId,
    headName: head.headName,
    amount: payload.amount,
    notes: payload.notes ?? '',
    financialYear,
    cashBookType,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (payload.linkedEntryId) docData['linkedEntryId'] = payload.linkedEntryId;

  const docRef = await col.add(docData);

  return {
    id: docRef.id,
    date: payload.date,
    headId: payload.headId,
    headName: head.headName,
    amount: payload.amount,
    notes: payload.notes ?? '',
    financialYear,
    cashBookType,
    linkedEntryId: payload.linkedEntryId,
    createdAt: new Date().toISOString(),
  };
}

export async function getBudgetExpenses(
  financialYear: string,
  cashBookType: string
): Promise<BudgetExpense[]> {
  const col = expenseCollection(financialYear, cashBookType);
  const snap = await col.orderBy('date', 'asc').get();
  return snap.docs.map((doc) => mapDoc(doc.id, doc.data()));
}

export interface UpdateBudgetExpenseFields {
  date?: string;
  headId?: string;
  amount?: number;
  notes?: string;
  linkedEntryId?: string;
}

export async function updateBudgetExpense(
  expenseId: string,
  financialYear: string,
  cashBookType: string,
  fields: UpdateBudgetExpenseFields
): Promise<BudgetExpense> {
  const col = expenseCollection(financialYear, cashBookType);
  const ref = col.doc(expenseId);

  const updatePayload: Record<string, unknown> = { ...fields };
  if (fields.linkedEntryId === '') {
    updatePayload['linkedEntryId'] = admin.firestore.FieldValue.delete();
  }

  if (fields.headId !== undefined) {
    const head = await getBudgetHeadById(fields.headId);
    if (!head || !head.isActive) throw new BudgetHeadNotFoundError(fields.headId);
    updatePayload['headName'] = head.headName;
  }

  const [snap] = await Promise.all([
    ref.get(),
    ref.update(updatePayload),
  ]);
  const data = snap.data()!;
  const resolvedLinkedEntryId = fields.linkedEntryId === ''
    ? undefined
    : (fields.linkedEntryId ?? data.linkedEntryId) as string | undefined;

  return {
    id: expenseId,
    date: (fields.date ?? data.date) as string,
    headId: (fields.headId ?? data.headId) as string,
    headName: (updatePayload['headName'] ?? data.headName ?? '') as string,
    amount: (fields.amount ?? data.amount) as number,
    notes: (fields.notes ?? data.notes ?? '') as string,
    financialYear: data.financialYear as string,
    cashBookType: data.cashBookType as BudgetExpense['cashBookType'],
    linkedEntryId: resolvedLinkedEntryId,
    createdAt: data.createdAt?.toDate().toISOString() ?? '',
  };
}

export async function deleteBudgetExpense(
  expenseId: string,
  financialYear: string,
  cashBookType: string
): Promise<void> {
  await expenseCollection(financialYear, cashBookType).doc(expenseId).delete();
}
