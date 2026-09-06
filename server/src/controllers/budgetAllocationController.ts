import { Request, Response, NextFunction } from 'express';
import {
  upsertBudgetAllocation,
  getBudgetAllocations,
  deleteBudgetAllocation,
  BudgetHeadNotFoundError,
} from '../services/budgetAllocationService';
import { isValidFY } from '@smp-cashbook/shared';
import type { UpsertBudgetAllocationPayload } from '@smp-cashbook/shared';

const CASH_BOOK_TYPES = ['Aided', 'Un-Aided', 'WP Un-Aided'];

export async function handleUpsertBudgetAllocation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Partial<UpsertBudgetAllocationPayload>;

    if (!body.headId?.trim()) { res.status(400).json({ error: 'headId is required' }); return; }
    if (body.allocatedAmount === undefined || isNaN(Number(body.allocatedAmount)) || Number(body.allocatedAmount) < 0) {
      res.status(400).json({ error: 'allocatedAmount must be a non-negative number' }); return;
    }
    if (!body.financialYear || !isValidFY(body.financialYear)) {
      res.status(400).json({ error: 'financialYear is required (format YYYY-YY)' }); return;
    }
    if (!body.cashBookType || !CASH_BOOK_TYPES.includes(body.cashBookType)) {
      res.status(400).json({ error: 'cashBookType must be Aided, Un-Aided, or WP Un-Aided' }); return;
    }

    const payload: UpsertBudgetAllocationPayload = {
      headId: body.headId,
      allocatedAmount: Number(body.allocatedAmount),
      financialYear: body.financialYear,
      cashBookType: body.cashBookType,
    };

    const allocation = await upsertBudgetAllocation(payload);
    res.json({ data: allocation, message: 'Budget allocation saved' });
  } catch (err) {
    if (err instanceof BudgetHeadNotFoundError) {
      res.status(404).json({ error: err.message }); return;
    }
    next(err);
  }
}

export async function handleGetBudgetAllocations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const fy = req.query['fy'] as string | undefined;
    const type = req.query['type'] as string | undefined;
    if (!fy || !type) {
      res.status(400).json({ error: 'fy and type query params are required' });
      return;
    }
    const allocations = await getBudgetAllocations(fy, type);
    res.json({ data: allocations });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteBudgetAllocation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params['id'] as string;
    const fyParam = req.query['fy'] as string | undefined;
    const typeParam = req.query['type'] as string | undefined;
    if (!fyParam || !typeParam) {
      res.status(400).json({ error: 'fy and type query params are required' });
      return;
    }
    await deleteBudgetAllocation(id, fyParam, typeParam);
    res.json({ data: null, message: 'Budget allocation deleted' });
  } catch (err) {
    next(err);
  }
}
