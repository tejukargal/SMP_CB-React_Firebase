import { Request, Response, NextFunction } from 'express';
import { upsertBudgetHead, getBudgetHeads, setBudgetHeadActive } from '../services/budgetHeadService';
import { toProperCase } from '@smp-cashbook/shared';
import type { UpsertBudgetHeadPayload } from '@smp-cashbook/shared';

export async function handleUpsertBudgetHead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Partial<UpsertBudgetHeadPayload>;

    if (!body.headName?.trim()) { res.status(400).json({ error: 'headName is required' }); return; }

    const payload: UpsertBudgetHeadPayload = {
      headName: toProperCase(body.headName.trim()),
    };

    const head = await upsertBudgetHead(payload);
    res.json({ data: head, message: 'Budget head saved' });
  } catch (err) {
    next(err);
  }
}

export async function handleGetBudgetHeads(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const heads = await getBudgetHeads();
    res.json({ data: heads });
  } catch (err) {
    next(err);
  }
}

export async function handleSetBudgetHeadActive(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params['id'] as string;
    const { isActive } = req.body as { isActive?: unknown };

    if (typeof isActive !== 'boolean') {
      res.status(400).json({ error: 'isActive must be a boolean' });
      return;
    }

    const head = await setBudgetHeadActive(id, isActive);
    res.json({ data: head, message: isActive ? 'Budget head reactivated' : 'Budget head deactivated' });
  } catch (err) {
    next(err);
  }
}
