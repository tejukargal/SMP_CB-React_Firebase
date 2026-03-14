import { Request, Response, NextFunction } from 'express';
import { getBankOpeningBalances, setBankOpeningBalance } from '../services/bankBalanceService';

export async function handleGetBankBalances(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const financialYear = req.query['financialYear'] as string | undefined;
    if (!financialYear) {
      res.status(400).json({ error: 'financialYear query param is required' });
      return;
    }
    const balances = await getBankOpeningBalances(financialYear);
    res.json({ data: balances });
  } catch (err) {
    next(err);
  }
}

export async function handleSetBankBalance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { financialYear, accountKey, balance } = req.body as {
      financialYear?: string;
      accountKey?: string;
      balance?: unknown;
    };
    if (!financialYear || !accountKey || balance === undefined || balance === null) {
      res.status(400).json({ error: 'financialYear, accountKey, and balance are required' });
      return;
    }
    const numBalance = Number(balance);
    if (isNaN(numBalance) || numBalance < 0) {
      res.status(400).json({ error: 'balance must be a non-negative number' });
      return;
    }
    await setBankOpeningBalance(financialYear, accountKey, numBalance);
    res.json({
      data: { financialYear, accountKey, balance: numBalance },
      message: 'Opening balance saved',
    });
  } catch (err) {
    next(err);
  }
}
