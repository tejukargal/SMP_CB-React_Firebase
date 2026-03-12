import { Request, Response, NextFunction } from 'express';
import { getSettings, updateSettings } from '../services/settingsService';
import type { UpdateSettingsPayload } from '@smp-cashbook/shared';

export async function handleGetSettings(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const settings = await getSettings();
    res.json({ data: settings });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateSettings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const payload = req.body as UpdateSettingsPayload;
    const settings = await updateSettings(payload);
    res.json({ data: settings, message: 'Settings updated' });
  } catch (err) {
    next(err);
  }
}
