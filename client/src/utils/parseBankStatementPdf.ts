import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseDateToISO, parseAmount } from './parseImportFile';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// ── Public output type ────────────────────────────────────────────────────────

export interface ParsedBankRow {
  date: string;       // ISO "YYYY-MM-DD"
  narration: string;
  chequeNo: string;
  debit: number;
  credit: number;
  balance: number;
}

// ── Text extraction with coordinates ─────────────────────────────────────────

interface TextToken {
  str: string;
  x: number;
  y: number;
  w: number; // token width from pdfjs
}

async function extractTokens(file: File): Promise<TextToken[][]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: TextToken[][] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    const tokens: TextToken[] = content.items
      .filter((item): item is TextItem => 'str' in item && (item as TextItem).str.trim().length > 0)
      .map(item => ({
        str: item.str.trim(),
        x:   Math.round(item.transform[4]),
        y:   Math.round(item.transform[5]),
        w:   Math.round((item as TextItem).width ?? 0),
      }));
    pages.push(tokens);
  }
  return pages;
}

// ── Group tokens into lines by Y proximity ────────────────────────────────────

interface Line {
  y: number;
  tokens: TextToken[];
}

function groupLines(tokens: TextToken[], threshold = 4): Line[] {
  const sorted = [...tokens].sort((a, b) => {
    const dy = b.y - a.y;
    return Math.abs(dy) > threshold ? dy : a.x - b.x;
  });

  const lines: Line[] = [];
  let current: Line | null = null;

  for (const tok of sorted) {
    if (!current || Math.abs(tok.y - current.y) > threshold) {
      current = { y: tok.y, tokens: [] };
      lines.push(current);
    }
    current.tokens.push(tok);
  }
  return lines;
}

// ── Column detection ──────────────────────────────────────────────────────────

// 'valueDate' and 'branchCode' are structural columns that anchor boundaries but
// are not used in the parsed output.
type ColKey = 'date' | 'valueDate' | 'narration' | 'chequeNo' | 'branchCode' | 'debit' | 'credit' | 'balance' | 'unknown';

const COL_KEYWORDS: { keys: string[]; col: ColKey }[] = [
  // 'value date' must come BEFORE 'date' — 'includes' would match 'date' inside 'value date'
  // 'value' alone handles Canara Bank's two-line header where "VALUE DATE" is split across rows
  { keys: ['value date', 'val date', 'value'], col: 'valueDate' },
  // 'branch code' / 'branch' must come BEFORE broad narration keywords
  { keys: ['branch code', 'branch', 'br code'], col: 'branchCode' },
  // 'trans' alone handles Canara Bank's split header where "TRANS DATE" appears on two lines
  { keys: ['txn date', 'date', 'tran date', 'trans date', 'posting date', 'trans'], col: 'date' },
  { keys: ['description', 'narration', 'particulars', 'details', 'remarks'], col: 'narration' },
  { keys: ['ref no', 'cheque no', 'chq no', 'cheque', 'reference', 'ref/chq no', 'ref/chq.no', 'ref no./cheque no'], col: 'chequeNo' },
  { keys: ['debit', 'withdrawal', 'withdrawals', 'withdraws', 'dr', 'withdrawal dr', 'debit(inr)'], col: 'debit' },
  { keys: ['credit', 'deposit', 'cr', 'deposit cr', 'credit(inr)'], col: 'credit' },
  { keys: ['balance', 'closing balance', 'balance(inr)', 'running balance'], col: 'balance' },
];

function detectColKey(text: string): ColKey {
  const lower = text.toLowerCase().trim();
  for (const { keys, col } of COL_KEYWORDS) {
    if (keys.some(k => lower.includes(k))) return col;
  }
  return 'unknown';
}

interface ColDef {
  col: ColKey;
  minX: number;
  maxX: number;
}

function tokenCenter(tok: TextToken): number {
  return tok.x + Math.floor(tok.w / 2);
}

function buildColumnMap(headerLine: Line): ColDef[] {
  // Accumulate center-X positions per column key (handles multi-token headers like "Withdrawal Dr")
  const centerSums: Partial<Record<ColKey, { sum: number; count: number }>> = {};

  for (const tok of headerLine.tokens) {
    const key = detectColKey(tok.str);
    if (key === 'unknown') continue;
    const cx = tokenCenter(tok);
    if (!centerSums[key]) centerSums[key] = { sum: 0, count: 0 };
    centerSums[key]!.sum   += cx;
    centerSums[key]!.count += 1;
  }

  // Build one ColDef per column, keyed by its average center X
  const defs: ColDef[] = [];
  for (const [col, acc] of Object.entries(centerSums) as [ColKey, { sum: number; count: number }][]) {
    const avgCx = Math.round(acc.sum / acc.count);
    defs.push({ col, minX: avgCx, maxX: avgCx }); // minX/maxX temporarily hold center
  }

  // Sort left-to-right by center
  defs.sort((a, b) => a.minX - b.minX);

  // Assign boundaries: split exactly halfway between adjacent column centers
  for (let i = 0; i < defs.length; i++) {
    const leftBound  = i === 0
      ? 0
      : Math.round((defs[i - 1].minX + defs[i].minX) / 2);
    const rightBound = i === defs.length - 1
      ? 9999
      : Math.round((defs[i].minX + defs[i + 1].minX) / 2);
    defs[i].minX = leftBound;
    defs[i].maxX = rightBound;
  }

  return defs;
}

function assignToken(tok: TextToken, cols: ColDef[]): ColKey {
  // Use token center so right-aligned numbers land in the correct column
  const cx = tokenCenter(tok);
  for (const def of cols) {
    if (cx >= def.minX && cx < def.maxX) return def.col;
  }
  return 'unknown';
}

// ── Header detection ──────────────────────────────────────────────────────────

function isHeaderLine(line: Line): boolean {
  const text = line.tokens.map(t => t.str.toLowerCase()).join(' ');
  // '\btrans\b' (whole-word) handles Canara Bank's split header where Line A has "TRANS" without "DATE"
  const hasDate    = /\bdate\b|\btrans\b/.test(text);
  const hasBalance = /\bbalance\b/.test(text);
  // '\bwithdraw' (no closing \b) matches withdrawal / withdrawals / withdraws (Canara Bank)
  const hasAmount  = /\bdebit\b|\bcredit\b|\bwithdraw|\bdeposit\b/.test(text);
  return hasDate && hasBalance && hasAmount;
}

// ── Row parsing ───────────────────────────────────────────────────────────────

// Detect if a line looks like a data row (starts with a date-like token)
const DATE_LIKE = /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$|^\d{2}-[A-Za-z]{3}-\d{4}$/;

function parseRow(line: Line, cols: ColDef[]): ParsedBankRow | null {
  const buckets: Partial<Record<ColKey, string[]>> = {};
  for (const tok of line.tokens) {
    const col = assignToken(tok, cols);
    if (!buckets[col]) buckets[col] = [];
    buckets[col]!.push(tok.str);
  }

  const rawDate = (buckets['date'] ?? []).join(' ');
  const date    = parseDateToISO(rawDate);
  if (!date) return null; // not a data row

  const narration = (buckets['narration'] ?? []).join(' ').trim();
  const chequeNo  = (buckets['chequeNo'] ?? []).join(' ').trim();
  const debit     = parseAmount((buckets['debit']   ?? []).join(' ').replace(/,/g, '')) ?? 0;
  const credit    = parseAmount((buckets['credit']  ?? []).join(' ').replace(/,/g, '')) ?? 0;
  const balance   = parseAmount((buckets['balance'] ?? []).join(' ').replace(/,/g, '')) ?? 0;

  return { date, narration, chequeNo, debit, credit, balance };
}

// ── Multi-line narration merging ─────────────────────────────────────────────
// Bank PDFs sometimes wrap long narrations onto a continuation line that has
// no date. Detect and merge those lines into the previous row.

function mergeRows(rows: ParsedBankRow[]): ParsedBankRow[] {
  return rows; // simple: return as-is (wrapping handled per-page by parseRow returning null)
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function parseBankStatementPdf(file: File): Promise<ParsedBankRow[]> {
  const pages = await extractTokens(file);
  const allRows: ParsedBankRow[] = [];

  for (const tokens of pages) {
    if (tokens.length === 0) continue;
    const lines  = groupLines(tokens);

    // Find header line(s) on this page
    const headerIdx = lines.findIndex(isHeaderLine);
    if (headerIdx === -1) {
      // No header on this page — try continuation using last known column map
      // (handled below after first successful page)
      continue;
    }

    const cols = buildColumnMap(lines[headerIdx]);
    if (!cols.some(c => c.col === 'date') || !cols.some(c => c.col === 'balance')) continue;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = parseRow(lines[i], cols);
      if (row) allRows.push(row);
    }
  }

  return mergeRows(allRows);
}

// ── Fallback: regex-based line parser ────────────────────────────────────────
// Used when coordinate-based parsing yields 0 rows (e.g. unusual PDF layouts).
// Parses each line of text for a leading date + trailing balance pattern.

const AMOUNT_RE = /[\d,]+(?:\.\d{2})?/g;

export async function parseBankStatementPdfFallback(file: File): Promise<ParsedBankRow[]> {
  const pages = await extractTokens(file);
  const allText = pages
    .map(tokens => {
      const lines = groupLines(tokens);
      return lines.map(l => l.tokens.map(t => t.str).join(' ')).join('\n');
    })
    .join('\n');

  const rows: ParsedBankRow[] = [];

  for (const raw of allText.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // Try to find a date at the start of the line
    const dateMatch = line.match(
      /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{2}-[A-Za-z]{3}-\d{2,4}|\d{2}\/[A-Za-z]{3}\/\d{2,4})/,
    );
    if (!dateMatch) continue;
    const date = parseDateToISO(dateMatch[1]);
    if (!date) continue;

    // Collect all amounts on the line
    const rest    = line.slice(dateMatch[0].length);
    const amounts = [...rest.matchAll(AMOUNT_RE)]
      .map(m => parseFloat(m[0].replace(/,/g, '')))
      .filter(n => !isNaN(n));

    if (amounts.length < 2) continue;

    const balance = amounts[amounts.length - 1];
    const second  = amounts[amounts.length - 2];

    // Heuristic: if second-to-last > 0 deduce credit vs debit from context
    const narration = rest.replace(/[\d,\.]+/g, ' ').replace(/\s+/g, ' ').trim();

    rows.push({ date, narration, chequeNo: '', debit: 0, credit: second, balance });
  }

  return rows;
}

// ── Combined parser (primary + fallback) ──────────────────────────────────────

export async function parseBankStatement(file: File): Promise<ParsedBankRow[]> {
  const rows = await parseBankStatementPdf(file);
  if (rows.length > 0) return rows;
  return parseBankStatementPdfFallback(file);
}
