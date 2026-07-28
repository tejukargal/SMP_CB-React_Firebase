import admin from 'firebase-admin';
import { db } from '../config/firebase';
import { slugifyFirmName } from '@smp-cashbook/shared';
import type { Firm, UpsertFirmPayload } from '@smp-cashbook/shared';

function firmCollection() {
  return db.collection('firms');
}

function mapDoc(id: string, data: FirebaseFirestore.DocumentData): Firm {
  return {
    id,
    firmName: data.firmName ?? '',
    accountNo: data.accountNo ?? '',
    ifscCode: data.ifscCode ?? '',
    bankName: data.bankName ?? '',
    branch: data.branch ?? '',
    createdAt: data.createdAt?.toDate().toISOString() ?? '',
    updatedAt: data.updatedAt?.toDate().toISOString() ?? '',
  };
}

export async function upsertFirm(payload: UpsertFirmPayload): Promise<Firm> {
  const id = slugifyFirmName(payload.firmName);
  const ref = firmCollection().doc(id);
  const existing = await ref.get();

  const fields = {
    firmName: payload.firmName,
    accountNo: payload.accountNo.trim(),
    ifscCode: payload.ifscCode.trim(),
    bankName: payload.bankName.trim(),
    branch: payload.branch.trim(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (existing.exists) {
    await ref.update(fields);
  } else {
    await ref.set({ ...fields, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  }

  const snap = await ref.get();
  return mapDoc(ref.id, snap.data()!);
}

export async function getFirms(): Promise<Firm[]> {
  const snap = await firmCollection().orderBy('firmName', 'asc').get();
  return snap.docs.map((doc) => mapDoc(doc.id, doc.data()));
}

/** Looks up firms by display name, keyed by the original (non-slugified) name passed in. Missing firms are simply absent from the map. */
export async function getFirmsByNames(firmNames: string[]): Promise<Map<string, Firm>> {
  const distinct = Array.from(new Set(firmNames));
  if (distinct.length === 0) return new Map();

  const refs = distinct.map((name) => firmCollection().doc(slugifyFirmName(name)));
  const snaps = await db.getAll(...refs);

  const map = new Map<string, Firm>();
  snaps.forEach((snap, i) => {
    if (snap.exists) map.set(distinct[i] as string, mapDoc(snap.id, snap.data()!));
  });
  return map;
}

export async function deleteFirm(id: string): Promise<void> {
  await firmCollection().doc(id).delete();
}
