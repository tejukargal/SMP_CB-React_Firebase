import { Request, Response, NextFunction } from 'express';
import {
  getBankReconciliation,
  setBankReconciliationDate,
  clearBankReconciliationDate,
} from '../services/bankReconciliationService';

/** GET /api/bank-reconciliation?financialYear=2025-26
 *  Returns { [bankKey]: { [entryId]: "YYYY-MM-DD" } } for the given FY */
export async function handleGetReconciliation(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const financialYear = req.query['financialYear'] as string | undefined;
    if (!financialYear) {
      res.status(400).json({ error: 'financialYear query param is required' });
      return;
    }
    const data = await getBankReconciliation(financialYear);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

/** POST /api/bank-reconciliation
 *  Body: { financialYear, bankKey, entryId, bankDate: "YYYY-MM-DD" | null } */
export async function handleSetReconciliationDate(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { financialYear, bankKey, entryId, bankDate } = req.body as {
      financialYear?: string;
      bankKey?: string;
      entryId?: string;
      bankDate?: string | null;
    };
    if (!financialYear || !bankKey || !entryId) {
      res.status(400).json({ error: 'financialYear, bankKey, and entryId are required' });
      return;
    }
    if (bankDate) {
      await setBankReconciliationDate(financialYear, bankKey, entryId, bankDate);
    } else {
      await clearBankReconciliationDate(financialYear, bankKey, entryId);
    }
    res.json({ data: { financialYear, bankKey, entryId, bankDate: bankDate ?? null }, message: 'Saved' });
  } catch (err) {
    next(err);
  }
}
