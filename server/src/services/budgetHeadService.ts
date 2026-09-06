import admin from 'firebase-admin';
import { db } from '../config/firebase';
import { slugifyFirmName } from '@smp-cashbook/shared';
import type { BudgetHead, UpsertBudgetHeadPayload } from '@smp-cashbook/shared';

function budgetHeadCollection() {
  return db.collection('budgetHeads');
}

function mapDoc(id: string, data: FirebaseFirestore.DocumentData): BudgetHead {
  return {
    id,
    headName: data.headName ?? '',
    isActive: data.isActive ?? true,
    createdAt: data.createdAt?.toDate().toISOString() ?? '',
    updatedAt: data.updatedAt?.toDate().toISOString() ?? '',
  };
}

/** Upsert by slugified name — add and rename are both this call, keyed on the same doc id. */
export async function upsertBudgetHead(payload: UpsertBudgetHeadPayload): Promise<BudgetHead> {
  const id = slugifyFirmName(payload.headName);
  const ref = budgetHeadCollection().doc(id);
  const existing = await ref.get();

  const fields = {
    headName: payload.headName,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (existing.exists) {
    await ref.update(fields);
  } else {
    await ref.set({ ...fields, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  }

  const snap = await ref.get();
  return mapDoc(ref.id, snap.data()!);
}

export async function getBudgetHeads(): Promise<BudgetHead[]> {
  const snap = await budgetHeadCollection().orderBy('headName', 'asc').get();
  return snap.docs.map((doc) => mapDoc(doc.id, doc.data()));
}

export async function getBudgetHeadById(id: string): Promise<BudgetHead | null> {
  const snap = await budgetHeadCollection().doc(id).get();
  if (!snap.exists) return null;
  return mapDoc(snap.id, snap.data()!);
}

export async function setBudgetHeadActive(id: string, isActive: boolean): Promise<BudgetHead> {
  const ref = budgetHeadCollection().doc(id);
  await ref.update({ isActive, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  const snap = await ref.get();
  return mapDoc(ref.id, snap.data()!);
}
