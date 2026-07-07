import { Request, Response, NextFunction } from 'express';
import {
  createClearedBillBatch,
  getClearedBillBatches,
  deleteClearedBillBatch,
  InvalidBillsForClearingError,
  InvalidPaymentLinesError,
} from '../services/clearedBillBatchService';
import type { CreateClearedBillBatchPayload } from '@smp-cashbook/shared';

const PAYMENT_MODES = ['Cash', 'Cheque', 'AcctPayeeCheque', 'NEFT', 'Online'];

export async function handleCreateClearedBillBatch(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Partial<CreateClearedBillBatchPayload>;

    if (!body.group || !['Cash', 'NonCash'].includes(body.group)) {
      res.status(400).json({ error: 'group must be Cash or NonCash' }); return;
    }
    if (!Array.isArray(body.paymentLines) || body.paymentLines.length === 0) {
      res.status(400).json({ error: 'paymentLines must be a non-empty array' }); return;
    }
    for (const line of body.paymentLines) {
      if (!line.mode || !PAYMENT_MODES.includes(line.mode)) {
        res.status(400).json({ error: `invalid payment mode: ${line.mode}` }); return;
      }
      if (!Array.isArray(line.billIds) || line.billIds.length === 0) {
        res.status(400).json({ error: 'each payment line requires at least one bill' }); return;
      }
    }
    if (!body.date) { res.status(400).json({ error: 'date is required' }); return; }
    if (!body.financialYear) { res.status(400).json({ error: 'financialYear is required' }); return; }
    if (!body.cashBookType || !['Aided', 'Un-Aided', 'WP Un-Aided'].includes(body.cashBookType)) {
      res.status(400).json({ error: 'cashBookType must be Aided, Un-Aided, or WP Un-Aided' }); return;
    }

    const batch = await createClearedBillBatch(
      body.financialYear,
      body.cashBookType,
      body.group,
      body.paymentLines.map((line) => ({ mode: line.mode, bank: line.bank ?? '', refNo: line.refNo ?? '', billIds: line.billIds })),
      body.date
    );
    res.status(201).json({ data: batch, message: 'Bills cleared' });
  } catch (err) {
    if (err instanceof InvalidBillsForClearingError || err instanceof InvalidPaymentLinesError) {
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
