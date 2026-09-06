import { Request, Response, NextFunction } from 'express';
import {
  createBudgetExpense,
  getBudgetExpenses,
  updateBudgetExpense,
  deleteBudgetExpense,
} from '../services/budgetExpenseService';
import { BudgetHeadNotFoundError } from '../services/budgetAllocationService';
import { isValidFY, toProperCase } from '@smp-cashbook/shared';
import type { CreateBudgetExpensePayload } from '@smp-cashbook/shared';

const CASH_BOOK_TYPES = ['Aided', 'Un-Aided', 'WP Un-Aided'];

export async function handleCreateBudgetExpense(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Partial<CreateBudgetExpensePayload>;

    if (!body.date) { res.status(400).json({ error: 'date is required' }); return; }
    if (!body.headId?.trim()) { res.status(400).json({ error: 'headId is required' }); return; }
    if (!body.amount || isNaN(Number(body.amount)) || Number(body.amount) <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' }); return;
    }
    if (!body.financialYear || !isValidFY(body.financialYear)) {
      res.status(400).json({ error: 'financialYear is required (format YYYY-YY)' }); return;
    }
    if (!body.cashBookType || !CASH_BOOK_TYPES.includes(body.cashBookType)) {
      res.status(400).json({ error: 'cashBookType must be Aided, Un-Aided, or WP Un-Aided' }); return;
    }

    const payload: CreateBudgetExpensePayload = {
      date: body.date,
      headId: body.headId,
      amount: Number(body.amount),
      notes: body.notes ? toProperCase(body.notes.trim()) : '',
      financialYear: body.financialYear,
      cashBookType: body.cashBookType,
      linkedEntryId: body.linkedEntryId?.trim() || undefined,
    };

    const expense = await createBudgetExpense(payload);
    res.status(201).json({ data: expense, message: 'Budget expense created' });
  } catch (err) {
    if (err instanceof BudgetHeadNotFoundError) {
      res.status(404).json({ error: err.message }); return;
    }
    next(err);
  }
}

export async function handleGetBudgetExpenses(
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
    const expenses = await getBudgetExpenses(fy, type);
    res.json({ data: expenses });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateBudgetExpense(
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

    const body = req.body as {
      date?: string;
      headId?: string;
      amount?: number;
      notes?: string;
      linkedEntryId?: string;
    };

    if (body.amount !== undefined && (isNaN(Number(body.amount)) || Number(body.amount) <= 0)) {
      res.status(400).json({ error: 'amount must be a positive number' }); return;
    }

    const fields: Record<string, unknown> = {};
    if (body.date !== undefined) fields['date'] = body.date;
    if (body.headId !== undefined) fields['headId'] = body.headId;
    if (body.amount !== undefined) fields['amount'] = Number(body.amount);
    if (body.notes !== undefined) fields['notes'] = body.notes ? toProperCase(body.notes.trim()) : '';
    if (body.linkedEntryId !== undefined) fields['linkedEntryId'] = body.linkedEntryId.trim();

    const expense = await updateBudgetExpense(id, fyParam, typeParam, fields);
    res.json({ data: expense, message: 'Budget expense updated' });
  } catch (err) {
    if (err instanceof BudgetHeadNotFoundError) {
      res.status(404).json({ error: err.message }); return;
    }
    next(err);
  }
}

export async function handleDeleteBudgetExpense(
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
    await deleteBudgetExpense(id, fyParam, typeParam);
    res.json({ data: null, message: 'Budget expense deleted' });
  } catch (err) {
    next(err);
  }
}
