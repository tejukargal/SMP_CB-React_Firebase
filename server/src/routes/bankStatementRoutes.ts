import { Router, Response, NextFunction } from 'express';
import { db } from '../config/firebase';
import type { ImportBankStatementPayload } from '@smp-cashbook/shared';
import type { AuthRequest } from '../middleware/authMiddleware';

const router = Router();

// ── GET /api/bank-statements?fy=2025-26&bank=sbi_ppl ─────────────────────────
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const fy   = req.query['fy']   as string | undefined;
    const bank = req.query['bank'] as string | undefined;
    if (!fy || !bank) {
      res.status(400).json({ error: 'fy and bank query params are required' });
      return;
    }
    const snap = await db
      .collection('bankStatements')
      .doc(fy)
      .collection(bank)
      .orderBy('date', 'asc')
      .get();
    const transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ data: transactions });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/bank-statements/import ─────────────────────────────────────────
router.post('/import', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const uid  = req.uid ?? 'unknown';
    const body = req.body as ImportBankStatementPayload;
    const { financialYear, bankKey, transactions } = body;

    if (!financialYear || !bankKey || !Array.isArray(transactions)) {
      res.status(400).json({ error: 'financialYear, bankKey, and transactions[] are required' });
      return;
    }

    const col   = db.collection('bankStatements').doc(financialYear).collection(bankKey);
    const now   = new Date().toISOString();
    const CHUNK = 450;

    for (let i = 0; i < transactions.length; i += CHUNK) {
      const batch = db.batch();
      transactions.slice(i, i + CHUNK).forEach(txn => {
        const docRef = col.doc();
        batch.set(docRef, { ...txn, importedAt: now, importedBy: uid });
      });
      await batch.commit();
    }

    res.json({ data: { imported: transactions.length } });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/bank-statements/reconcile ─────────────────────────────────────
// Body: { fy, bank, txnId, entryId }
router.patch('/reconcile', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fy, bank, txnId, entryId } = req.body as {
      fy?: string; bank?: string; txnId?: string; entryId?: string;
    };
    if (!fy || !bank || !txnId) {
      res.status(400).json({ error: 'fy, bank, and txnId are required' });
      return;
    }
    const docRef = db.collection('bankStatements').doc(fy).collection(bank).doc(txnId);
    await docRef.update({ reconciledEntryId: entryId ?? '' });
    res.json({ data: { txnId, reconciledEntryId: entryId ?? '' } });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/bank-statements/opening-balance ───────────────────────────────
// Body: { fy, bank, openingBalance }
router.patch('/opening-balance', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fy, bank, openingBalance } = req.body as {
      fy?: string; bank?: string; openingBalance?: number;
    };
    if (!fy || !bank || openingBalance === undefined) {
      res.status(400).json({ error: 'fy, bank, and openingBalance are required' });
      return;
    }
    await db.collection('bankStatements').doc(fy).set(
      { [`${bank}_openingBalance`]: openingBalance },
      { merge: true },
    );
    res.json({ data: { openingBalance } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/bank-statements?fy=2025-26&bank=sbi_ppl ──────────────────────
router.delete('/', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const fy   = req.query['fy']   as string | undefined;
    const bank = req.query['bank'] as string | undefined;
    if (!fy || !bank) {
      res.status(400).json({ error: 'fy and bank query params are required' });
      return;
    }
    const col  = db.collection('bankStatements').doc(fy).collection(bank);
    const snap = await col.get();
    const CHUNK = 450;
    const docs  = snap.docs;
    for (let i = 0; i < docs.length; i += CHUNK) {
      const batch = db.batch();
      docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    res.json({ data: { deleted: docs.length } });
  } catch (err) {
    next(err);
  }
});

export default router;
