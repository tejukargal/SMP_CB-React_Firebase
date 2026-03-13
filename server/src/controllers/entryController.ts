import { Request, Response, NextFunction } from 'express';
import { createEntry, getEntries, deleteEntry, updateEntry, resetEntriesForFY } from '../services/entryService';
import { toProperCase } from '@smp-cashbook/shared';
import type { CreateEntryPayload } from '@smp-cashbook/shared';

export async function handleCreateEntry(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Partial<CreateEntryPayload>;

    // Validate required fields
    if (!body.date) { res.status(400).json({ error: 'date is required' }); return; }
    if (!body.amount || isNaN(Number(body.amount)) || Number(body.amount) <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' }); return;
    }
    if (!body.headOfAccount?.trim()) { res.status(400).json({ error: 'headOfAccount is required' }); return; }
    if (!body.type || !['Receipt', 'Payment'].includes(body.type)) {
      res.status(400).json({ error: 'type must be Receipt or Payment' }); return;
    }
    if (!body.financialYear) { res.status(400).json({ error: 'financialYear is required' }); return; }
    if (!body.cashBookType || !['Aided', 'Un-Aided'].includes(body.cashBookType)) {
      res.status(400).json({ error: 'cashBookType must be Aided or Un-Aided' }); return;
    }

    const payload: CreateEntryPayload = {
      date: body.date,
      chequeNo: body.chequeNo?.trim() ?? '',
      amount: Number(body.amount),
      headOfAccount: toProperCase(body.headOfAccount.trim()),
      notes: body.notes ? toProperCase(body.notes.trim()) : '',
      type: body.type,
      financialYear: body.financialYear,
      cashBookType: body.cashBookType,
    };

    const entry = await createEntry(payload);
    res.status(201).json({ data: entry, message: 'Entry created' });
  } catch (err) {
    next(err);
  }
}

export async function handleGetEntries(
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
    const entries = await getEntries(fy, type);
    res.json({ data: entries });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateEntry(
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
      chequeNo?: string;
      amount?: number;
      headOfAccount?: string;
      notes?: string;
      type?: string;
      voucherNo?: string;
    };

    if (body.amount !== undefined && (isNaN(Number(body.amount)) || Number(body.amount) <= 0)) {
      res.status(400).json({ error: 'amount must be a positive number' }); return;
    }
    if (body.type && !['Receipt', 'Payment'].includes(body.type)) {
      res.status(400).json({ error: 'type must be Receipt or Payment' }); return;
    }

    const fields: Record<string, unknown> = {};
    if (body.date !== undefined) fields['date'] = body.date;
    if (body.chequeNo !== undefined) fields['chequeNo'] = body.chequeNo.trim();
    if (body.amount !== undefined) fields['amount'] = Number(body.amount);
    if (body.headOfAccount !== undefined) fields['headOfAccount'] = toProperCase(body.headOfAccount.trim());
    if (body.notes !== undefined) fields['notes'] = body.notes ? toProperCase(body.notes.trim()) : '';
    if (body.type !== undefined) fields['type'] = body.type;
    if (body.voucherNo !== undefined) fields['voucherNo'] = body.voucherNo.trim();

    const entry = await updateEntry(id, fyParam, typeParam, fields);
    res.json({ data: entry, message: 'Entry updated' });
  } catch (err) {
    next(err);
  }
}

export async function handleResetEntries(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const fyParam = req.query['fy'] as string | undefined;
    const typeParam = req.query['type'] as string | undefined;
    if (!fyParam || !/^\d{4}-\d{2}$/.test(fyParam)) {
      res.status(400).json({ error: 'fy query param is required (format YYYY-YY)' });
      return;
    }
    if (!typeParam || !['Aided', 'Un-Aided'].includes(typeParam)) {
      res.status(400).json({ error: 'type query param is required (Aided or Un-Aided)' });
      return;
    }
    const deleted = await resetEntriesForFY(fyParam, typeParam);
    res.json({ data: { deleted }, message: `Deleted ${deleted} entries for ${fyParam} – ${typeParam}` });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteEntry(
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
    await deleteEntry(id, fyParam, typeParam);
    res.json({ data: null, message: 'Entry deleted' });
  } catch (err) {
    next(err);
  }
}
