import { Request, Response, NextFunction } from 'express';
import type { LedgerVerificationStatus } from '@smp-cashbook/shared';
import {
  getLedgerVerification,
  setLedgerVerificationStatus,
  clearLedgerVerificationStatus,
} from '../services/ledgerVerificationService';

/** GET /api/ledger-verification?financialYear=2025-26
 *  Returns { [cashBookType]: { [entryId]: "verified" | "mismatch" } } for the given FY */
export async function handleGetLedgerVerification(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const financialYear = req.query['financialYear'] as string | undefined;
    if (!financialYear) {
      res.status(400).json({ error: 'financialYear query param is required' });
      return;
    }
    const data = await getLedgerVerification(financialYear);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/** POST /api/ledger-verification
 *  Body: { financialYear, cashBookType, entryId, status: "verified" | "mismatch" | null } */
export async function handleSetLedgerVerification(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { financialYear, cashBookType, entryId, status } = req.body as {
      financialYear?: string;
      cashBookType?: string;
      entryId?: string;
      status?: LedgerVerificationStatus | null;
    };
    if (!financialYear || !cashBookType || !entryId) {
      res.status(400).json({ error: 'financialYear, cashBookType, and entryId are required' });
      return;
    }
    if (status) {
      await setLedgerVerificationStatus(financialYear, cashBookType, entryId, status);
    } else {
      await clearLedgerVerificationStatus(financialYear, cashBookType, entryId);
    }
    res.json({ data: { financialYear, cashBookType, entryId, status: status ?? null }, message: 'Saved' });
  } catch (err) {
    next(err);
  }
}
