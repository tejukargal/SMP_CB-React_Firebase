import { Request, Response, NextFunction } from 'express';
import {
  createClearedBillBatch,
  getClearedBillBatches,
  deleteClearedBillBatch,
  updateClearedBillBatch,
  ClearedBatchNotFoundError,
  InvalidBillsForClearingError,
  InvalidPaymentLinesError,
} from '../services/clearedBillBatchService';
import type { CreateClearedBillBatchPayload, UpdateClearedBillBatchPayload } from '@smp-cashbook/shared';

const PAYMENT_MODES = ['Cash', 'Cheque', 'AcctPayeeCheque', 'NEFT', 'Online'];

/** Returns an error message for an invalid paymentLines array, or null if it is well-formed. */
function paymentLinesError(lines: unknown): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return 'paymentLines must be a non-empty array';
  for (const line of lines as CreateClearedBillBatchPayload['paymentLines']) {
    if (!line.mode || !PAYMENT_MODES.includes(line.mode)) return `invalid payment mode: ${line.mode}`;
    if (!Array.isArray(line.billIds) || line.billIds.length === 0) return 'each payment line requires at least one bill';
  }
  return null;
}

function normalizeLines(lines: CreateClearedBillBatchPayload['paymentLines']) {
  return lines.map((line) => ({ mode: line.mode, bank: line.bank ?? '', refNo: line.refNo ?? '', billIds: line.billIds }));
}

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
    const linesErr = paymentLinesError(body.paymentLines);
    if (linesErr) { res.status(400).json({ error: linesErr }); return; }
    if (!body.date) { res.status(400).json({ error: 'date is required' }); return; }
    if (!body.financialYear) { res.status(400).json({ error: 'financialYear is required' }); return; }
    if (!body.cashBookType || !['Aided', 'Un-Aided', 'WP Un-Aided'].includes(body.cashBookType)) {
      res.status(400).json({ error: 'cashBookType must be Aided, Un-Aided, or WP Un-Aided' }); return;
    }
    if (body.firmBankDetails !== undefined && !Array.isArray(body.firmBankDetails)) {
      res.status(400).json({ error: 'firmBankDetails must be an array' }); return;
    }

    const batch = await createClearedBillBatch(
      body.financialYear,
      body.cashBookType,
      body.group,
      normalizeLines(body.paymentLines!),
      body.date,
      body.firmBankDetails
    );
    res.status(201).json({ data: batch, message: 'Bills cleared' });
  } catch (err) {
    if (err instanceof InvalidBillsForClearingError || err instanceof InvalidPaymentLinesError) {
      res.status(400).json({ error: err.message }); return;
    }
    next(err);
  }
}

export async function handleUpdateClearedBillBatch(
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
    const body = req.body as Partial<UpdateClearedBillBatchPayload>;
    const linesErr = paymentLinesError(body.paymentLines);
    if (linesErr) { res.status(400).json({ error: linesErr }); return; }
    if (!body.date) { res.status(400).json({ error: 'date is required' }); return; }
    if (!Array.isArray(body.firmBankDetails)) {
      res.status(400).json({ error: 'firmBankDetails must be an array' }); return;
    }

    const batch = await updateClearedBillBatch(
      fy, type, id, normalizeLines(body.paymentLines!), body.date, body.firmBankDetails
    );
    res.json({ data: batch, message: 'Cleared batch updated' });
  } catch (err) {
    if (err instanceof ClearedBatchNotFoundError) {
      res.status(404).json({ error: err.message }); return;
    }
    if (err instanceof InvalidPaymentLinesError) {
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
