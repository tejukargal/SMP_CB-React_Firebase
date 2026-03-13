import * as XLSX from 'xlsx';
import { toProperCase } from '@smp-cashbook/shared';
import type { CashBookType, EntryType, CreateEntryPayload } from '@smp-cashbook/shared';

// ── Column header aliases ─────────────────────────────────────────────────────
const HEADER_MAP: Record<string, string> = {
  'financialyear':    'financialYear',
  'financialyr':      'financialYear',
  'fy':               'financialYear',
  'year':             'financialYear',
  'cashbooktype':     'cashBookType',
  'cashbook':         'cashBookType',
  'booktype':         'cashBookType',
  'type':             'cashBookType',      // "Cash Book Type" column
  'date':             'date',
  'entrytype':        'type',              // Receipt/Payment type
  'receiptpayment':   'type',
  'chequeno':         'chequeNo',
  'cheque':           'chequeNo',
  'chequenumber':     'chequeNo',
  'chno':             'chequeNo',
  'amount':           'amount',
  'headofaccount':    'headOfAccount',
  'headofaccounts':   'headOfAccount',
  'headaccount':      'headOfAccount',
  'account':          'headOfAccount',
  'particulars':      'headOfAccount',
  'notes':            'notes',
  'remarks':          'notes',
  'narration':        'notes',
  'description':      'notes',
};

/** Normalise a raw header string to a canonical key */
function normaliseHeader(raw: string): string {
  const key = raw.toLowerCase().replace(/[\s_\-\.]+/g, '');
  return HEADER_MAP[key] ?? key;
}

// ── Date parsing ──────────────────────────────────────────────────────────────
const MONTHS: Record<string, string> = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
};

export function parseDateToISO(val: unknown): string | null {
  // JS Date object — round to nearest UTC day to neutralise any sub-second
  // floating-point drift introduced by serial → timestamp conversions.
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const utc = new Date(Math.round(val.getTime() / 86400000) * 86400000);
    const y = utc.getUTCFullYear();
    const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
    const d = String(utc.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Excel serial number (when cellDates is not set)
  if (typeof val === 'number') {
    // Excel epoch: Jan 0, 1900. Correct for the 1900 leap-year bug.
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return null;
  }

  if (typeof val !== 'string') return null;
  const s = val.trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY  or  DD-MM-YYYY  or  DD/MM/YY
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const dt = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    if (!isNaN(dt.getTime())) return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // DD-Mon-YYYY  e.g. 01-Apr-2025
  const textDate = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,})[\s\-\/](\d{2,4})$/);
  if (textDate) {
    const [, d, mon, yRaw] = textDate;
    const m = MONTHS[mon.toLowerCase().slice(0, 3)];
    if (m) {
      const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
      return `${y}-${m}-${d.padStart(2,'0')}`;
    }
  }

  // Mon DD, YYYY  e.g. "April 1, 2025"
  const jsDate = new Date(s);
  if (!isNaN(jsDate.getTime())) {
    const y = jsDate.getFullYear();
    const m = String(jsDate.getMonth() + 1).padStart(2, '0');
    const d = String(jsDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

// ── Value normalisers ─────────────────────────────────────────────────────────
function parseAmount(val: unknown): number | null {
  if (typeof val === 'number') return val > 0 ? val : null;
  if (typeof val === 'string') {
    // strip currency symbols, commas, spaces
    const n = Number(val.replace(/[₹,\s]/g, '').trim());
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

function parseEntryType(val: unknown): EntryType | null {
  const s = String(val ?? '').trim().toLowerCase();
  if (s === 'receipt' || s === 'receipts' || s === 'cr' || s === 'credit') return 'Receipt';
  if (s === 'payment' || s === 'payments' || s === 'dr' || s === 'debit')  return 'Payment';
  return null;
}

function parseCashBookType(val: unknown): CashBookType | null {
  const s = String(val ?? '').trim().toLowerCase().replace(/[\s\-_]/g, '');
  if (s === 'aided')   return 'Aided';
  if (s === 'unaided') return 'Un-Aided';
  return null;
}

function parseFY(val: unknown): string | null {
  const s = String(val ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  // Accept "2025-2026" → "2025-26"
  const long = s.match(/^(\d{4})-(\d{4})$/);
  if (long) return `${long[1]}-${long[2].slice(2)}`;
  return null;
}

// ── Main parser ───────────────────────────────────────────────────────────────
export interface ParsedRow {
  row: number;          // 1-based row number in the sheet
  entry: CreateEntryPayload;
}

export interface ParseError {
  row: number;
  raw: Record<string, unknown>;
  reasons: string[];
}

export interface ParseResult {
  valid: ParsedRow[];
  errors: ParseError[];
}

export function parseImportFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        // cellDates:false keeps date cells as raw Excel serial numbers.
        // SheetJS's cellDates:true has a UTC-conversion bug that shifts dates
        // by ~10 seconds, causing local-midnight dates to land on the previous
        // calendar day in IST (+5:30). The numeric path below uses UTC methods
        // on the serial → timestamp conversion and is always correct.
        const wb = XLSX.read(data, { type: 'array', cellDates: false });

        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];

        // Read as array-of-objects; raw:false converts numbers/dates to strings
        // We use raw:true to get actual types, then normalise ourselves
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
          raw: true,
        });

        const valid: ParsedRow[] = [];
        const errors: ParseError[] = [];

        // Detect header mapping from first row (already applied by sheet_to_json)
        // We need to normalise the keys
        rows.forEach((rawRow, idx) => {
          const rowNum = idx + 2; // +2 because row 1 is the header
          const row: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rawRow)) {
            row[normaliseHeader(k)] = v;
          }

          const reasons: string[] = [];

          // ── Determine type column ambiguity ──────────────────────────────
          // The Excel has two "type" columns: "Cash Book Type" and "Type"
          // After normalising: both might map to different keys
          // "Cash Book Type" → key "cashbooktype" → "cashBookType"
          // "Type"           → key "type"         → "cashBookType" (conflict!)
          // We handle this by checking the HEADER_MAP order:
          // "cashbooktype" → cashBookType, "type" → cashBookType
          // But raw header "Type" alone is ambiguous — we resolve by value
          //
          // If we see BOTH cashBookType and type fields, the "type" field
          // is likely entryType (Receipt/Payment). Re-map it.
          //
          // Strategy: if row has both 'cashBookType' key (from "Cash Book Type")
          // and an extra un-mapped 'type' key: treat the one that looks like
          // EntryType as 'type', and the one that looks like CashBookType as 'cashBookType'.

          // Re-scan original keys to separate "Cash Book Type" vs "Type"
          let entryTypeValue: unknown = row['type'];
          let cashBookTypeValue: unknown = row['cashBookType'];

          // If user's Excel has separate "Cash Book Type" and "Type" columns,
          // sheet_to_json will deduplicate keys (later one wins).
          // Re-parse from raw keys to avoid this.
          const rawKeys = Object.keys(rawRow);
          const hasCashBookTypeCol = rawKeys.some(k =>
            normaliseHeader(k) === 'cashBookType' &&
            k.toLowerCase().replace(/[\s_\-\.]+/g, '') !== 'type'
          );
          if (hasCashBookTypeCol) {
            // Find the "Type" column (plain "Type" header)
            for (const [k, v] of Object.entries(rawRow)) {
              const norm = k.toLowerCase().replace(/[\s_\-\.]+/g, '');
              if (norm === 'type') {
                entryTypeValue = v;
              }
              if (norm === 'cashbooktype' || norm === 'cashbook') {
                cashBookTypeValue = v;
              }
            }
          }

          // ── Validate & parse each field ──────────────────────────────────
          const fy = parseFY(row['financialYear']);
          if (!fy) reasons.push(`Invalid Financial Year: "${row['financialYear']}"`);

          const cashBookType = parseCashBookType(cashBookTypeValue);
          if (!cashBookType) reasons.push(`Invalid Cash Book Type: "${cashBookTypeValue}"`);

          const date = parseDateToISO(row['date']);
          if (!date) reasons.push(`Invalid Date: "${row['date']}"`);

          const type = parseEntryType(entryTypeValue);
          if (!type) reasons.push(`Invalid Type (must be Receipt/Payment): "${entryTypeValue}"`);

          const amount = parseAmount(row['amount']);
          if (!amount) reasons.push(`Invalid Amount: "${row['amount']}"`);

          const headOfAccount = String(row['headOfAccount'] ?? '').trim();
          if (!headOfAccount) reasons.push('Head of Account is required');

          if (reasons.length > 0) {
            errors.push({ row: rowNum, raw: rawRow, reasons });
            return;
          }

          valid.push({
            row: rowNum,
            entry: {
              financialYear: fy!,
              cashBookType: cashBookType!,
              date: date!,
              type: type!,
              chequeNo: String(row['chequeNo'] ?? '').trim(),
              amount: amount!,
              headOfAccount: toProperCase(headOfAccount),
              notes: row['notes'] ? toProperCase(String(row['notes']).trim()) : '',
            },
          });
        });

        resolve({ valid, errors });
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`));
      }
    };

    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Summary helpers ───────────────────────────────────────────────────────────
export interface ImportSummaryRow {
  financialYear: string;
  cashBookType: CashBookType;
  receipts: number;
  payments: number;
  total: number;
}

export function buildImportSummary(valid: ParsedRow[]): ImportSummaryRow[] {
  const map = new Map<string, ImportSummaryRow>();
  for (const { entry } of valid) {
    const key = `${entry.financialYear}|${entry.cashBookType}`;
    if (!map.has(key)) {
      map.set(key, {
        financialYear: entry.financialYear,
        cashBookType: entry.cashBookType as CashBookType,
        receipts: 0,
        payments: 0,
        total: 0,
      });
    }
    const s = map.get(key)!;
    if (entry.type === 'Receipt') s.receipts++;
    else s.payments++;
    s.total++;
  }
  return Array.from(map.values()).sort((a, b) =>
    a.financialYear.localeCompare(b.financialYear) ||
    a.cashBookType.localeCompare(b.cashBookType)
  );
}
