import * as XLSX from 'xlsx';
import { parseDateToISO, parseAmount } from './parseImportFile';
import type { ParsedBankRow } from './parseBankStatementPdf';

export type { ParsedBankRow };

// ── Column header aliases ─────────────────────────────────────────────────────

const HEADER_MAP: Record<string, keyof ParsedBankRow> = {
  // date
  'date':            'date',
  'txndate':         'date',
  'txn date':        'date',
  'valuedate':       'date',
  'value date':      'date',
  'trandate':        'date',
  'tran date':       'date',
  'transactiondate': 'date',
  'postingdate':     'date',
  // narration
  'narration':       'narration',
  'description':     'narration',
  'particulars':     'narration',
  'details':         'narration',
  'remarks':         'narration',
  'transactionremarks': 'narration',
  // chequeNo
  'chequeno':        'chequeNo',
  'cheque no':       'chequeNo',
  'chqno':           'chequeNo',
  'refno':           'chequeNo',
  'ref no':          'chequeNo',
  'reference':       'chequeNo',
  'instrumentno':    'chequeNo',
  'instrument no':   'chequeNo',
  'cheque/refno':    'chequeNo',
  // debit
  'debit':           'debit',
  'withdrawal':      'debit',
  'dr':              'debit',
  'withdrawaldr':    'debit',
  'withdrawal(dr)':  'debit',
  'withdrawal dr':   'debit',
  'debit(inr)':      'debit',
  'debitamount':     'debit',
  // credit
  'credit':          'credit',
  'deposit':         'credit',
  'cr':              'credit',
  'depositcr':       'credit',
  'deposit(cr)':     'credit',
  'deposit cr':      'credit',
  'credit(inr)':     'credit',
  'creditamount':    'credit',
  // balance
  'balance':         'balance',
  'closingbalance':  'balance',
  'runningbalance':  'balance',
  'balance(inr)':    'balance',
  'availablebalance': 'balance',
};

function normaliseHeader(raw: string): keyof ParsedBankRow | null {
  const key = raw.toLowerCase().replace(/[\s_\-\.\/\(\)]+/g, '');
  return (HEADER_MAP[key] ?? HEADER_MAP[raw.toLowerCase().trim()]) as keyof ParsedBankRow | undefined ?? null;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export interface BankFileParseResult {
  rows: ParsedBankRow[];
  errors: { row: number; reason: string }[];
}

export function parseBankStatementFile(file: File): Promise<BankFileParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data  = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb    = XLSX.read(data, { type: 'array', cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
          raw: true,
        });

        const rows: ParsedBankRow[] = [];
        const errors: { row: number; reason: string }[] = [];

        rawRows.forEach((rawRow, idx) => {
          const rowNum = idx + 2;
          const mapped: Partial<Record<keyof ParsedBankRow, unknown>> = {};

          for (const [k, v] of Object.entries(rawRow)) {
            const canon = normaliseHeader(k);
            if (canon) mapped[canon] = v;
          }

          const date = parseDateToISO(mapped['date']);
          if (!date) {
            // Skip rows without a valid date (header rows, summary rows, blanks)
            return;
          }

          const debit   = parseAmount(mapped['debit'])   ?? 0;
          const credit  = parseAmount(mapped['credit'])  ?? 0;
          const balance = parseAmount(mapped['balance'])
            ?? parseAmount(String(mapped['balance'] ?? '').replace(/[^0-9.]/g, ''))
            ?? 0;

          if (debit === 0 && credit === 0 && balance === 0) {
            errors.push({ row: rowNum, reason: 'All amounts are zero — likely a non-data row' });
            return;
          }

          rows.push({
            date,
            narration: String(mapped['narration'] ?? '').trim(),
            chequeNo:  String(mapped['chequeNo']  ?? '').trim(),
            debit,
            credit,
            balance,
          });
        });

        resolve({ rows, errors });
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`));
      }
    };

    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ── CSV entry point (same logic, XLSX reads CSV too) ─────────────────────────
export const parseBankStatementCsv = parseBankStatementFile;
