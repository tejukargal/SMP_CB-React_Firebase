import { Request, Response, NextFunction } from 'express';
import {
  createClearedBillBatch,
  getClearedBillBatches,
  deleteClearedBillBatch,
  InvalidBillsForClearingError,
} from '../services/clearedBillBatchService';
import type { CreateClearedBillBatchPayload } from '@smp-cashbook/shared';

export async function handleCreateClearedBillBatch(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Partial<CreateClearedBillBatchPayload>;

    if (!Array.isArray(body.billIds) || body.billIds.length === 0) {
      res.status(400).json({ error: 'billIds must be a non-empty array' }); return;
    }
    if (!body.date) { res.status(400).json({ error: 'date is required' }); return; }
    if (!body.financialYear) { res.status(400).json({ error: 'financialYear is required' }); return; }
    if (!body.cashBookType || !['Aided', 'Un-Aided', 'WP Un-Aided'].includes(body.cashBookType)) {
      res.status(400).json({ error: 'cashBookType must be Aided, Un-Aided, or WP Un-Aided' }); return;
    }

    const batch = await createClearedBillBatch(body.financialYear, body.cashBookType, body.billIds, body.date);
    res.status(201).json({ data: batch, message: 'Bills cleared' });
  } catch (err) {
    if (err instanceof InvalidBillsForClearingError) {
      res.status(400).json({ error: err.message }); return;
    }
    next(err);
  }
}

export async function handleGetClearedBillBatches(
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
    const batches = await getClearedBillBatches(fy, type);
    res.json({ data: batches });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteClearedBillBatch(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params['id'] as string;
    const fy = req.query['fy'] as string | undefined;
    const type = req.query['type'] as string | undefined;
    if (!fy || !type) {
      res.status(400).json({ error: 'fy and type query params are required' });
      return;
    }
    await deleteClearedBillBatch(fy, type, id);
    res.json({ data: null, message: 'Cleared batch deleted' });
  } catch (err) {
    next(err);
  }
}
