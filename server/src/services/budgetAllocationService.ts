import admin from 'firebase-admin';
import { db } from '../config/firebase';
import { getBudgetHeadById } from './budgetHeadService';
import type { BudgetAllocation, UpsertBudgetAllocationPayload } from '@smp-cashbook/shared';

function allocationCollection(financialYear: string, cashBookType: string) {
  return db
    .collection('budgetAllocations')
    .doc(financialYear)
    .collection(cashBookType);
}

function mapDoc(id: string, data: FirebaseFirestore.DocumentData): BudgetAllocation {
  return {
    id,
    headId: data.headId,
    headName: data.headName ?? '',
    allocatedAmount: data.allocatedAmount ?? 0,
    financialYear: data.financialYear,
    cashBookType: data.cashBookType,
    updatedAt: data.updatedAt?.toDate().toISOString() ?? '',
  };
}

export class BudgetHeadNotFoundError extends Error {
  constructor(headId: string) {
    super(`Budget head "${headId}" not found or inactive`);
  }
}

export async function upsertBudgetAllocation(
  payload: UpsertBudgetAllocationPayload
): Promise<BudgetAllocation> {
  const head = await getBudgetHeadById(payload.headId);
  if (!head || !head.isActive) throw new BudgetHeadNotFoundError(payload.headId);

  const { financialYear, cashBookType, headId, allocatedAmount } = payload;
  const ref = allocationCollection(financialYear, cashBookType).doc(headId);

  // Full replace — no revision history, matches "edit in place" allocation model.
  await ref.set({
    headId,
    headName: head.headName,
    allocatedAmount,
    financialYear,
    cashBookType,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return mapDoc(ref.id, snap.data()!);
}

export async function getBudgetAllocations(
  financialYear: string,
  cashBookType: string
): Promise<BudgetAllocation[]> {
  const snap = await allocationCollection(financialYear, cashBookType)
    .orderBy('headName', 'asc')
    .get();
  return snap.docs.map((doc) => mapDoc(doc.id, doc.data()));
}

export async function deleteBudgetAllocation(
  headId: string,
  financialYear: string,
  cashBookType: string
): Promise<void> {
  await allocationCollection(financialYear, cashBookType).doc(headId).delete();
}
