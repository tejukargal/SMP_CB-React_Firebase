import { Request, Response, NextFunction } from 'express';
import { toProperCase } from '@smp-cashbook/shared';
import type { CreateEntryPayload } from '@smp-cashbook/shared';
import { importEntries } from '../services/importService';

const VALID_TYPES = ['Receipt', 'Payment'] as const;
const VALID_BOOK_TYPES = ['Aided', 'Un-Aided'] as const;

function isValidFY(fy: string): boolean {
  return /^\d{4}-\d{2}$/.test(fy);
}

export async function handleImportEntries(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as { entries?: unknown[] };

    if (!Array.isArray(body.entries) || body.entries.length === 0) {
      res.status(400).json({ error: 'entries array is required and must not be empty' });
      return;
    }

    if (body.entries.length > 10_000) {
      res.status(400).json({ error: 'Cannot import more than 10,000 entries at once' });
      return;
    }

    const valid: CreateEntryPayload[] = [];
    const skipped: number[] = [];

    for (let i = 0; i < body.entries.length; i++) {
      const e = body.entries[i] as Record<string, unknown>;

      const fy = String(e.financialYear ?? '').trim();
      const cashBookType = String(e.cashBookType ?? '').trim();
      const date = String(e.date ?? '').trim();
      const type = String(e.type ?? '').trim();
      const amount = Number(e.amount);
      const headOfAccount = String(e.headOfAccount ?? '').trim();

      if (
        !isValidFY(fy) ||
        !VALID_BOOK_TYPES.includes(cashBookType as 'Aided' | 'Un-Aided') ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !VALID_TYPES.includes(type as 'Receipt' | 'Payment') ||
        isNaN(amount) || amount <= 0 ||
        !headOfAccount
      ) {
        skipped.push(i + 1);
        continue;
      }

      valid.push({
        financialYear: fy,
        cashBookType: cashBookType as 'Aided' | 'Un-Aided',
        date,
        type: type as 'Receipt' | 'Payment',
        chequeNo: String(e.chequeNo ?? '').trim(),
        amount,
        headOfAccount: toProperCase(headOfAccount),
        notes: e.notes ? toProperCase(String(e.notes).trim()) : '',
      });
    }

    if (valid.length === 0) {
      res.status(400).json({ error: 'No valid entries found after validation', skipped });
      return;
    }

    const result = await importEntries(valid);
    res.status(201).json({
      data: { imported: result.imported, failed: result.failed + skipped.length },
      message: `Imported ${result.imported} entries successfully`,
    });
  } catch (err) {
    next(err);
  }
}
