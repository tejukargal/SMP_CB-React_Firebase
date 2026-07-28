import { Request, Response, NextFunction } from 'express';
import { upsertFirm, getFirms, deleteFirm } from '../services/firmService';
import { toProperCase } from '@smp-cashbook/shared';
import type { UpsertFirmPayload } from '@smp-cashbook/shared';

export async function handleUpsertFirm(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Partial<UpsertFirmPayload>;

    if (!body.firmName?.trim()) { res.status(400).json({ error: 'firmName is required' }); return; }

    const payload: UpsertFirmPayload = {
      firmName: toProperCase(body.firmName.trim()),
      accountNo: body.accountNo?.trim() ?? '',
      ifscCode: body.ifscCode?.trim() ?? '',
      bankName: body.bankName ? toProperCase(body.bankName.trim()) : '',
      branch: body.branch ? toProperCase(body.branch.trim()) : '',
    };

    const firm = await upsertFirm(payload);
    res.json({ data: firm, message: 'Firm saved' });
  } catch (err) {
    next(err);
  }
}

export async function handleGetFirms(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const firms = await getFirms();
    res.json({ data: firms });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteFirm(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params['id'] as string;
    await deleteFirm(id);
    res.json({ data: null, message: 'Firm deleted' });
  } catch (err) {
    next(err);
  }
}
