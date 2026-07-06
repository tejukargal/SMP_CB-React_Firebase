import { Request, Response, NextFunction } from 'express';
import {
  createPendingBill,
  getPendingBills,
  updatePendingBill,
  deletePendingBill,
} from '../services/pendingBillService';
import { toProperCase } from '@smp-cashbook/shared';
import type { CreatePendingBillPayload } from '@smp-cashbook/shared';

export async function handleCreatePendingBill(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Partial<CreatePendingBillPayload>;

    if (!body.date) { res.status(400).json({ error: 'date is required' }); return; }
    if (!body.amount || isNaN(Number(body.amount)) || Number(body.amount) <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' }); return;
    }
    if (!body.headOfAccount?.trim()) { res.status(400).json({ error: 'headOfAccount is required' }); return; }
    if (!body.firmName?.trim()) { res.status(400).json({ error: 'firmName is required' }); return; }
    if (!body.billNumber?.trim()) { res.status(400).json({ error: 'billNumber is required' }); return; }
    if (!body.billDate) { res.status(400).json({ error: 'billDate is required' }); return; }
    if (!body.financialYear) { res.status(400).json({ error: 'financialYear is required' }); return; }
    if (!body.cashBookType || !['Aided', 'Un-Aided', 'WP Un-Aided'].includes(body.cashBookType)) {
      res.status(400).json({ error: 'cashBookType must be Aided, Un-Aided, or WP Un-Aided' }); return;
    }

    const payload: CreatePendingBillPayload = {
      date: body.date,
      bank: body.bank ? toProperCase(body.bank.trim()) : '',
      chqNoOrCash: body.chqNoOrCash?.trim() ?? '',
      amount: Number(body.amount),
      headOfAccount: toProperCase(body.headOfAccount.trim()),
      firmName: toProperCase(body.firmName.trim()),
      billNumber: body.billNumber.trim(),
      billDate: body.billDate,
      particulars: body.particulars ? toProperCase(body.particulars.trim()) : '',
      remarks: body.remarks?.trim() ?? '',
      status: 'Pending',
      financialYear: body.financialYear,
      cashBookType: body.cashBookType,
    };

    const bill = await createPendingBill(payload);
    res.status(201).json({ data: bill, message: 'Pending bill added' });
  } catch (err) {
    next(err);
  }
}

export async function handleGetPendingBills(
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
    const bills = await getPendingBills(fy, type);
    res.json({ data: bills });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdatePendingBill(
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
      bank?: string;
      chqNoOrCash?: string;
      amount?: number;
      headOfAccount?: string;
      firmName?: string;
      billNumber?: string;
      billDate?: string;
      particulars?: string;
      remarks?: string;
      status?: string;
    };

    if (body.amount !== undefined && (isNaN(Number(body.amount)) || Number(body.amount) <= 0)) {
      res.status(400).json({ error: 'amount must be a positive number' }); return;
    }
    if (body.status && !['Pending', 'Approved', 'Cleared'].includes(body.status)) {
      res.status(400).json({ error: 'status must be Pending, Approved, or Cleared' }); return;
    }

    const fields: Record<string, unknown> = {};
    if (body.date !== undefined) fields['date'] = body.date;
    if (body.bank !== undefined) fields['bank'] = body.bank ? toProperCase(body.bank.trim()) : '';
    if (body.chqNoOrCash !== undefined) fields['chqNoOrCash'] = body.chqNoOrCash.trim();
    if (body.amount !== undefined) fields['amount'] = Number(body.amount);
    if (body.headOfAccount !== undefined) fields['headOfAccount'] = toProperCase(body.headOfAccount.trim());
    if (body.firmName !== undefined) fields['firmName'] = toProperCase(body.firmName.trim());
    if (body.billNumber !== undefined) fields['billNumber'] = body.billNumber.trim();
    if (body.billDate !== undefined) fields['billDate'] = body.billDate;
    if (body.particulars !== undefined) fields['particulars'] = body.particulars ? toProperCase(body.particulars.trim()) : '';
    if (body.remarks !== undefined) fields['remarks'] = body.remarks.trim();
    if (body.status !== undefined) fields['status'] = body.status;

    const bill = await updatePendingBill(id, fyParam, typeParam, fields);
    res.json({ data: bill, message: 'Pending bill updated' });
  } catch (err) {
    next(err);
  }
}

export async function handleDeletePendingBill(
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
    await deletePendingBill(id, fyParam, typeParam);
    res.json({ data: null, message: 'Pending bill deleted' });
  } catch (err) {
    next(err);
  }
}
