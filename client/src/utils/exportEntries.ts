import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Entry } from '@smp-cashbook/shared';
import { formatDate } from './formatDate';
import type { FilterState } from '@/components/entries/EntryFilters';

// ── Page geometry (A4 landscape) ──────────────────────────────────────────────
const MARGIN  = 10;
const PAGE_W  = 297;
const PAGE_CX = PAGE_W / 2;   // 148.5 mm — horizontal centre

// ── Amount formatter for PDF/Excel (plain 2-decimal, no ₹ symbol) ────────────
// Matches reference formatAmount(): n.toFixed(2) — keeps columns narrow
const fmtAmt = (n: number) => n.toFixed(2);

// ── Colour palette ────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C_WHITE:  RGB = [255, 255, 255];
const C_HEAD:   RGB = [100, 100, 100];  // grey header (matches reference)
const C_TOTAL:  RGB = [229, 231, 235];  // grey-200 for total rows
const C_DATE:   RGB = [219, 234, 254];  // blue-100 for date separator rows
const C_BLACK:  RGB = [0,   0,   0  ];  // border colour

// ── Shared base style (matches reference: 8pt, 2.5 padding, black borders) ───
const BASE = {
  fontSize:      8,
  cellPadding:   2.5,
  lineColor:     C_BLACK,
  lineWidth:     0.1,
  minCellHeight: 8,
};
const HEAD_S = {
  fillColor: C_HEAD,
  textColor: C_WHITE,
  fontStyle: 'bold'   as const,
  halign:    'center' as const,
  fontSize:  9,
};

// ── Export meta ───────────────────────────────────────────────────────────────
export interface ExportMeta {
  financialYear: string;
  cashBookType:  string;
  filters:       FilterState;
}

// ── 3-line centred header (returns startY for the table) ─────────────────────
function addHeader(doc: jsPDF, meta: ExportMeta): number {
  const { financialYear, cashBookType, filters } = meta;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Cash Book Report', PAGE_CX, 13, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`SMP Cash Book  ·  ${cashBookType}`, PAGE_CX, 20, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const parts: string[] = [`FY: ${financialYear}`];
  if (filters.dateFrom || filters.dateTo)
    parts.push(`Period: ${filters.dateFrom ? formatDate(filters.dateFrom) : '—'} – ${filters.dateTo ? formatDate(filters.dateTo) : '—'}`);
  if (filters.typeFilter !== 'All') parts.push(`Type: ${filters.typeFilter}s`);
  if (filters.headOfAccount) parts.push(`Head: ${filters.headOfAccount}`);
  if (filters.search.trim()) parts.push(`Search: "${filters.search}"`);
  doc.text(parts.join('   ·   '), PAGE_CX, 26, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, 26, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  return 32;
}

// ── Group entries by date (sorted oldest-first) ───────────────────────────────
interface DateGroup { date: string; receipts: Entry[]; payments: Entry[]; }

function groupByDate(entries: Entry[]): DateGroup[] {
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
  const map = new Map<string, DateGroup>();
  for (const e of sorted) {
    let g = map.get(e.date);
    if (!g) { g = { date: e.date, receipts: [], payments: [] }; map.set(e.date, g); }
    (e.type === 'Receipt' ? g.receipts : g.payments).push(e);
  }
  return Array.from(map.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST PDF  — CB Report 1 style
//
// Side-by-side layout: Receipt columns (left) | Payment columns (right)
// Rows are paired by index within each date group (like the reference).
//
// Columns (11):  Sl | R.Date | R.Chq | R.Amount | R.Heads | R.Notes |
//                    P.Date | P.Chq | P.Amount | P.Heads | P.Notes
// Widths (=277): 8 + 18 + 16 + 22 + 30 + 45 + 18 + 16 + 22 + 30 + 52
// ─────────────────────────────────────────────────────────────────────────────
export function exportListPDF(entries: Entry[], meta: ExportMeta) {
  const doc    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, meta);
  const groups = groupByDate(entries);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = [];
  let slNo = 1;

  for (const { date, receipts, payments } of groups) {
    // Date separator row (full-width, blue tint)
    body.push([{
      content: formatDate(date),
      colSpan: 11,
      styles:  { fontStyle: 'bold', fillColor: C_DATE, textColor: [30, 64, 175] as RGB, halign: 'left' as const },
    }]);

    const maxRows = Math.max(receipts.length, payments.length, 1);
    for (let i = 0; i < maxRows; i++) {
      const r = receipts[i];
      const p = payments[i];
      body.push([
        String(slNo++),
        r ? formatDate(r.date)       : '',
        r ? (r.chequeNo || '—')      : '',
        r ? fmtAmt(r.amount) : '',
        r ? r.headOfAccount          : '',
        r ? (r.notes || '')          : '',
        p ? formatDate(p.date)       : '',
        p ? (p.chequeNo || '—')      : '',
        p ? fmtAmt(p.amount) : '',
        p ? p.headOfAccount          : '',
        p ? (p.notes || '')          : '',
      ]);
    }
  }

  // Grand totals row
  const totalR = entries.filter(e => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
  const totalP = entries.filter(e => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
  body.push(['', '', 'Total:', fmtAmt(totalR), '', '',
             '',  'Total:', fmtAmt(totalP), '', '']);

  autoTable(doc, {
    startY,
    margin:     { left: MARGIN, right: MARGIN },
    tableWidth: 277,
    head: [[
      'Sl No', 'R.Date', 'R.Chq', 'R.Amount', 'R.Heads', 'R.Notes',
      'P.Date', 'P.Chq', 'P.Amount', 'P.Heads', 'P.Notes',
    ]],
    body,
    styles:     BASE,
    headStyles: HEAD_S,
    columnStyles: {
      0:  { cellWidth: 8,  halign: 'center' },
      1:  { cellWidth: 18 },
      2:  { cellWidth: 16 },
      3:  { cellWidth: 22, halign: 'right' },
      4:  { cellWidth: 30 },
      5:  { cellWidth: 45, fontSize: 6, cellPadding: { top: 1, bottom: 1, left: 2, right: 2 }, overflow: 'linebreak' as const },
      6:  { cellWidth: 18 },
      7:  { cellWidth: 16 },
      8:  { cellWidth: 22, halign: 'right' },
      9:  { cellWidth: 30 },
      10: { cellWidth: 52, fontSize: 6, cellPadding: { top: 1, bottom: 1, left: 2, right: 2 }, overflow: 'linebreak' as const },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const row = body[data.row.index];
      if (!row || typeof row[0] !== 'string') return;   // skip colSpan date rows
      // White background for all body rows
      data.cell.styles.fillColor = C_WHITE;
      // Total row — check by content
      if (row[2] === 'Total:') {
        data.cell.styles.fillColor = C_TOTAL;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save(`smp-cashbook-${meta.financialYear.replace('/', '-')}-list.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE PDF  — CB Report 2 style (Traditional Cash Book)
//
// Side-by-side layout per date group:
//   • "By Opening Bal" row (grey-50, receipt side, for every group after first)
//   • Transaction rows paired by index
//   • Total row (grey bg, bold) — receipts incl. opening bal | payments total
//   • Closing Balance row (bold label, payment side)
//   • Grand total row (payment side = payments + closing)
//   • Empty separator row
//
// Columns (8):  R.Date | R.Heads | R.Notes | R.Amount |
//               P.Date | P.Heads | P.Notes | P.Amount
// Widths (=277): 20 + 38 + 58 + 22 + 20 + 38 + 58 + 23
// ─────────────────────────────────────────────────────────────────────────────
export function exportDatePDF(entries: Entry[], meta: ExportMeta) {
  const doc    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, meta);
  const groups = groupByDate(entries);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = [];
  // Track which row indices are "total" rows and which are special-label rows
  const totalRows   = new Set<number>();
  const specialRows = new Set<number>();  // "By Opening Bal" / "Closing Bal"

  let runningBalance = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    const { date, receipts, payments } = groups[gi];
    const dayR = receipts.reduce((s, e) => s + e.amount, 0);
    const dayP = payments.reduce((s, e) => s + e.amount, 0);

    // By Opening Balance row
    if (gi > 0) {
      specialRows.add(body.length);
      body.push(['', '', 'By Opening Bal', fmtAmt(runningBalance), '', '', '', '']);
    }

    // Paired transaction rows
    const maxRows = Math.max(receipts.length, payments.length, 1);
    for (let i = 0; i < maxRows; i++) {
      const r = receipts[i];
      const p = payments[i];
      body.push([
        r ? formatDate(r.date)       : '',
        r ? r.headOfAccount          : '',
        r ? (r.notes || '')          : '',
        r ? fmtAmt(r.amount) : '',
        p ? formatDate(p.date)       : '',
        p ? p.headOfAccount          : '',
        p ? (p.notes || '')          : '',
        p ? fmtAmt(p.amount) : '',
      ]);
    }

    // Total row (grey bg)
    const receiptTotal = dayR + (gi > 0 ? runningBalance : 0);
    totalRows.add(body.length);
    body.push([
      '', '', 'Total', fmtAmt(receiptTotal),
      formatDate(date), '', 'Total', fmtAmt(dayP),
    ]);

    runningBalance += dayR - dayP;

    // Closing Balance row
    specialRows.add(body.length);
    body.push(['', '', '', '', '', '', 'Closing Bal', fmtAmt(runningBalance)]);

    // Grand total row (payments + closing = receipt total)
    body.push(['', '', '', '', '', '', '', fmtAmt(dayP + runningBalance)]);

    // Empty separator row
    body.push(['', '', '', '', '', '', '', '']);
  }

  autoTable(doc, {
    startY,
    margin:     { left: MARGIN, right: MARGIN },
    tableWidth: 277,
    head: [['R.Date', 'R.Heads', 'R.Notes', 'R.Amount', 'P.Date', 'P.Heads', 'P.Notes', 'P.Amount']],
    body,
    styles:     BASE,
    headStyles: HEAD_S,
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 38 },
      2: { cellWidth: 58, fontSize: 6, cellPadding: { top: 1, bottom: 1, left: 2, right: 2 }, overflow: 'linebreak' as const },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 20 },
      5: { cellWidth: 38 },
      6: { cellWidth: 58, fontSize: 6, cellPadding: { top: 1, bottom: 1, left: 2, right: 2 }, overflow: 'linebreak' as const },
      7: { cellWidth: 23, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const idx = data.row.index;
      // White background for all body rows
      data.cell.styles.fillColor = C_WHITE;
      // Total rows — grey bg + bold
      if (totalRows.has(idx)) {
        data.cell.styles.fillColor = C_TOTAL;
        data.cell.styles.fontStyle = 'bold';
      }
      // Special label rows — bold text only
      if (specialRows.has(idx)) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save(`smp-cashbook-${meta.financialYear.replace('/', '-')}-date.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST EXCEL  — CB Report 1 layout
// ─────────────────────────────────────────────────────────────────────────────
export function exportListExcel(entries: Entry[], meta: ExportMeta) {
  const { financialYear, cashBookType } = meta;
  const groups = groupByDate(entries);

  const rows: (string | number)[][] = [
    [`SMP Cash Book — ${cashBookType}`],
    [`Financial Year: ${financialYear}`],
    [],
    ['Sl No', 'R.Date', 'R.Chq', 'R.Amount', 'R.Heads', 'R.Notes',
              'P.Date', 'P.Chq', 'P.Amount', 'P.Heads', 'P.Notes'],
  ];

  let slNo = 1;
  for (const { date, receipts, payments } of groups) {
    rows.push([`── ${formatDate(date)} ──`]);
    const maxRows = Math.max(receipts.length, payments.length, 1);
    for (let i = 0; i < maxRows; i++) {
      const r = receipts[i];
      const p = payments[i];
      rows.push([
        slNo++,
        r ? formatDate(r.date) : '', r ? (r.chequeNo || '') : '',
        r ? r.amount           : '', r ? r.headOfAccount    : '', r ? (r.notes || '') : '',
        p ? formatDate(p.date) : '', p ? (p.chequeNo || '') : '',
        p ? p.amount           : '', p ? p.headOfAccount    : '', p ? (p.notes || '') : '',
      ]);
    }
  }

  const totalR = entries.filter(e => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
  const totalP = entries.filter(e => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
  rows.push([]);
  rows.push(['', '', 'Total:', totalR, '', '', '', 'Total:', totalP, '', '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6  }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 32 }, { wch: 30 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 32 }, { wch: 30 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CB Report 1');
  XLSX.writeFile(wb, `smp-cashbook-${financialYear.replace('/', '-')}-list.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE EXCEL  — CB Report 2 layout (Traditional Cash Book)
// ─────────────────────────────────────────────────────────────────────────────
export function exportDateExcel(entries: Entry[], meta: ExportMeta) {
  const { financialYear, cashBookType } = meta;
  const groups = groupByDate(entries);

  const rows: (string | number)[][] = [
    [`SMP Cash Book — ${cashBookType}`],
    [`Financial Year: ${financialYear}`],
    [],
    ['R.Date', 'R.Heads', 'R.Notes', 'R.Amount', 'P.Date', 'P.Heads', 'P.Notes', 'P.Amount'],
  ];

  let runningBalance = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const { date, receipts, payments } = groups[gi];
    const dayR = receipts.reduce((s, e) => s + e.amount, 0);
    const dayP = payments.reduce((s, e) => s + e.amount, 0);

    // By Opening Balance
    if (gi > 0) {
      rows.push(['', '', 'By Opening Bal', runningBalance, '', '', '', '']);
    }

    // Paired transaction rows
    const maxRows = Math.max(receipts.length, payments.length, 1);
    for (let i = 0; i < maxRows; i++) {
      const r = receipts[i];
      const p = payments[i];
      rows.push([
        r ? formatDate(r.date) : '', r ? r.headOfAccount : '', r ? (r.notes || '') : '',
        r ? r.amount           : '',
        p ? formatDate(p.date) : '', p ? p.headOfAccount : '', p ? (p.notes || '') : '',
        p ? p.amount           : '',
      ]);
    }

    // Total row
    const receiptTotal = dayR + (gi > 0 ? runningBalance : 0);
    rows.push(['', '', 'Total', receiptTotal, formatDate(date), '', 'Total', dayP]);

    runningBalance += dayR - dayP;

    // Closing Balance
    rows.push(['', '', '', '', '', '', 'Closing Bal', runningBalance]);
    // Grand total (payments + closing)
    rows.push(['', '', '', '', '', '', '', dayP + runningBalance]);
    // Separator
    rows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 32 }, { wch: 30 }, { wch: 14 },
    { wch: 12 }, { wch: 32 }, { wch: 30 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CB Report 2');
  XLSX.writeFile(wb, `smp-cashbook-${financialYear.replace('/', '-')}-date.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// LEDGER TRANSACTIONS PDF
//
// Side-by-side layout (ledger name is the title, no Heads column needed):
//   R.Date | R.Chq | R.Amount | R.Notes | P.Date | P.Chq | P.Amount | P.Notes
// Widths (=277): 20 + 16 + 24 + 78 + 20 + 16 + 24 + 79
//
// Rows paired by index. Totals printed as text below the table.
// ─────────────────────────────────────────────────────────────────────────────
const NOTES_COL_STYLE = {
  fontSize:    6,
  cellPadding: { top: 1, bottom: 1, left: 2, right: 2 },
  overflow:    'linebreak' as const,
};

export function exportLedgerPDF(
  head: string,
  receipts: Entry[],
  payments: Entry[],
  financialYear: string,
  cashBookType: string,
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header — matches reference ledger PDF style
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`Ledger: ${head}`, PAGE_CX, 13, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `SMP Cash Book  ·  ${cashBookType}  ·  FY: ${financialYear}  ·  Generated: ${new Date().toLocaleDateString('en-IN')}`,
    PAGE_CX, 19, { align: 'center' },
  );
  doc.setTextColor(0, 0, 0);

  // Paired rows (receipts left, payments right, indexed)
  const sorted = (arr: Entry[]) =>
    [...arr].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const sortedR = sorted(receipts);
  const sortedP = sorted(payments);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = [];
  const maxRows = Math.max(sortedR.length, sortedP.length, 1);
  for (let i = 0; i < maxRows; i++) {
    const r = sortedR[i];
    const p = sortedP[i];
    body.push([
      r ? formatDate(r.date)    : '',
      r ? (r.chequeNo || '—')   : '',
      r ? fmtAmt(r.amount)      : '',
      r ? (r.notes || '')       : '',
      p ? formatDate(p.date)    : '',
      p ? (p.chequeNo || '—')   : '',
      p ? fmtAmt(p.amount)      : '',
      p ? (p.notes || '')       : '',
    ]);
  }

  autoTable(doc, {
    startY:     24,
    margin:     { left: MARGIN, right: MARGIN },
    tableWidth: 277,
    head: [['R.Date', 'R.Chq', 'R.Amount', 'R.Notes', 'P.Date', 'P.Chq', 'P.Amount', 'P.Notes']],
    body,
    styles:     BASE,
    headStyles: HEAD_S,
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 16 },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 78, ...NOTES_COL_STYLE },
      4: { cellWidth: 20 },
      5: { cellWidth: 16 },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 79, ...NOTES_COL_STYLE },
    },
    didParseCell: (data) => {
      if (data.section === 'body') data.cell.styles.fillColor = C_WHITE;
    },
  });

  // Totals text below table — matches reference style
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 7;
  const totalR = receipts.reduce((s, e) => s + e.amount, 0);
  const totalP = payments.reduce((s, e) => s + e.amount, 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Receipts Total: ${fmtAmt(totalR)}`, MARGIN, finalY);
  doc.text(`Payments Total: ${fmtAmt(totalP)}`, MARGIN, finalY + 6);
  doc.text(`Net (R − P): ${fmtAmt(totalR - totalP)}`, MARGIN, finalY + 12);

  const safeName = head.replace(/[^a-z0-9]/gi, '_');
  doc.save(`ledger-${safeName}-${financialYear.replace('/', '-')}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// LEDGER TRANSACTIONS EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export function exportLedgerExcel(
  head: string,
  receipts: Entry[],
  payments: Entry[],
  financialYear: string,
  cashBookType: string,
) {
  const sorted = (arr: Entry[]) =>
    [...arr].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const sortedR = sorted(receipts);
  const sortedP = sorted(payments);

  const rows: (string | number)[][] = [
    [`Ledger: ${head}`],
    [`SMP Cash Book — ${cashBookType}  |  FY: ${financialYear}`],
    [],
    ['R.Date', 'R.Chq', 'R.Amount', 'R.Notes', 'P.Date', 'P.Chq', 'P.Amount', 'P.Notes'],
  ];

  const maxRows = Math.max(sortedR.length, sortedP.length, 1);
  for (let i = 0; i < maxRows; i++) {
    const r = sortedR[i];
    const p = sortedP[i];
    rows.push([
      r ? formatDate(r.date) : '', r ? (r.chequeNo || '') : '',
      r ? r.amount : '',           r ? (r.notes || '') : '',
      p ? formatDate(p.date) : '', p ? (p.chequeNo || '') : '',
      p ? p.amount : '',           p ? (p.notes || '') : '',
    ]);
  }

  const totalR = receipts.reduce((s, e) => s + e.amount, 0);
  const totalP = payments.reduce((s, e) => s + e.amount, 0);
  rows.push([]);
  rows.push(['Receipts Total:', '', totalR, '', 'Payments Total:', '', totalP, '']);
  rows.push(['Net (R - P):', '', totalR - totalP, '', '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 40 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
  const safeName = head.replace(/[^a-z0-9]/gi, '_');
  XLSX.writeFile(wb, `ledger-${safeName}-${financialYear.replace('/', '-')}.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// BANK STATEMENT PDF + EXCEL
//
// Columns (6): Date | Narration | Cheque No | Debit (Receipt) | Credit (Payment) | Balance
// PDF widths (=277mm): 22 + 125 + 28 + 34 + 34 + 34
// Title: 2 lines only — bank name/type on line 1, FY + balances + date on line 2
// ─────────────────────────────────────────────────────────────────────────────
export interface BankStatementExportParams {
  bankLabel:      string;
  financialYear:  string;
  openingBalance: number;
  openingDateStr: string;   // e.g. "01 Apr 2025"
  rows: Array<{
    date:      string;
    narration: string;
    chequeNo:  string;
    debit:     number;
    credit:    number;
    balance:   number;
  }>;
  totalDebit:     number;
  totalCredit:    number;
  closingBalance: number;
}

export function exportBankStatementPDF(p: BankStatementExportParams) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // ── Two-line centred header ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${p.bankLabel} — Bank Statement`, PAGE_CX, 11, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const cbStr = `${fmtAmt(Math.abs(p.closingBalance))}${p.closingBalance < 0 ? ' Dr' : ''}`;
  doc.text(
    `FY: ${p.financialYear}   |   Opening Balance: ${fmtAmt(p.openingBalance)}   |   Closing Balance: ${cbStr}   |   Generated: ${new Date().toLocaleDateString('en-IN')}`,
    PAGE_CX, 17, { align: 'center' },
  );
  doc.setTextColor(0, 0, 0);

  const C_OB_BG: RGB = [219, 234, 254]; // blue-100
  const C_OB_FG: RGB = [30,  64,  175]; // blue-800

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = [
    // Opening balance row
    [p.openingDateStr, 'Opening Balance', '', '—', fmtAmt(p.openingBalance), fmtAmt(p.openingBalance)],
    // Transaction rows
    ...p.rows.map(r => [
      formatDate(r.date),
      r.narration,
      r.chequeNo,
      r.debit  > 0 ? fmtAmt(r.debit)  : '—',
      r.credit > 0 ? fmtAmt(r.credit) : '—',
      `${fmtAmt(Math.abs(r.balance))}${r.balance < 0 ? ' Dr' : ''}`,
    ]),
    // Totals row
    [`${p.rows.length} transaction${p.rows.length !== 1 ? 's' : ''}`, '', '',
      fmtAmt(p.totalDebit), fmtAmt(p.totalCredit), cbStr],
  ];
  const TOTAL_IDX = body.length - 1;

  autoTable(doc, {
    startY:     22,
    margin:     { left: MARGIN, right: MARGIN },
    tableWidth: 277,
    head: [['Date', 'Narration', 'Cheque No', 'Debit\n(Receipt)', 'Credit\n(Payment)', 'Balance']],
    body,
    styles:     BASE,
    headStyles: { ...HEAD_S, minCellHeight: 10 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 125, overflow: 'ellipsize' as const },
      2: { cellWidth: 28 },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 34, halign: 'right' },
      5: { cellWidth: 34, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const idx = data.row.index;
      data.cell.styles.fillColor = C_WHITE;
      if (idx === 0) {
        data.cell.styles.fillColor = C_OB_BG;
        data.cell.styles.textColor = C_OB_FG;
        data.cell.styles.fontStyle = 'bold';
      } else if (idx === TOTAL_IDX) {
        data.cell.styles.fillColor = C_TOTAL;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const safeName = p.bankLabel.toLowerCase().replace(/\s+/g, '-');
  doc.save(`bank-statement-${safeName}-${p.financialYear.replace('/', '-')}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// LEDGER COMPARISON PDF + EXCEL
//
// Mirrors the UI's ComparePairedSection logic:
//  - receipt-only heads paired 1:1 (FIFO) with payment-only heads → side by side
//  - mixed heads (both R & P) → their own R | P table
//  - unpaired receipt-only or payment-only → half-table with other side blank
// ─────────────────────────────────────────────────────────────────────────────

// Shared pairing logic for both PDF and Excel
function buildCompareSections(heads: string[], entries: Entry[]) {
  const sortArr = (arr: Entry[]) =>
    [...arr].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const headData = heads.map((head) => ({
    head,
    receipts: sortArr(entries.filter((e) => e.type === 'Receipt' && e.headOfAccount === head)),
    payments: sortArr(entries.filter((e) => e.type === 'Payment' && e.headOfAccount === head)),
  }));

  const receiptOnly = headData.filter((h) => h.receipts.length > 0 && h.payments.length === 0);
  const paymentOnly = headData.filter((h) => h.payments.length > 0 && h.receipts.length === 0);
  const mixed       = headData.filter((h) => h.receipts.length > 0 && h.payments.length > 0);
  const pairedCount = Math.min(receiptOnly.length, paymentOnly.length);

  // Each section: leftLabel + leftRows on col 0-3, rightLabel + rightRows on col 4-7
  type Section = { leftLabel: string; leftRows: Entry[]; rightLabel: string; rightRows: Entry[] };
  const sections: Section[] = [];

  for (let i = 0; i < pairedCount; i++) {
    sections.push({ leftLabel: receiptOnly[i].head, leftRows: receiptOnly[i].receipts, rightLabel: paymentOnly[i].head, rightRows: paymentOnly[i].payments });
  }
  for (const { head, receipts, payments } of mixed) {
    sections.push({ leftLabel: head, leftRows: receipts, rightLabel: head, rightRows: payments });
  }
  for (const { head, receipts } of receiptOnly.slice(pairedCount)) {
    sections.push({ leftLabel: head, leftRows: receipts, rightLabel: '—', rightRows: [] });
  }
  for (const { head, payments } of paymentOnly.slice(pairedCount)) {
    sections.push({ leftLabel: '—', leftRows: [], rightLabel: head, rightRows: payments });
  }

  return sections;
}

export function exportComparePDF(
  heads: string[],
  entries: Entry[],
  financialYear: string,
  cashBookType: string,
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Ledger Comparison', PAGE_CX, 13, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `SMP Cash Book  ·  ${cashBookType}  ·  FY: ${financialYear}  ·  Generated: ${new Date().toLocaleDateString('en-IN')}`,
    PAGE_CX, 19, { align: 'center' },
  );
  doc.setTextColor(0, 0, 0);

  const sections = buildCompareSections(heads, entries);

  // Receipt-side header green, payment-side header red
  const C_RECEIPT_HDR: RGB = [21, 128, 61];  // green-700
  const C_PAYMENT_HDR: RGB = [185, 28, 28];  // red-700

  let currentY = 24;
  let grandTotalR = 0;
  let grandTotalP = 0;

  for (const { leftLabel, leftRows, rightLabel, rightRows } of sections) {
    if (currentY > 182) { doc.addPage(); currentY = 14; }

    const totalLeft  = leftRows.reduce((s, e) => s + e.amount, 0);
    const totalRight = rightRows.reduce((s, e) => s + e.amount, 0);
    grandTotalR += totalLeft;
    grandTotalP += totalRight;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any[] = [];
    const maxLen = Math.max(leftRows.length, rightRows.length, 1);
    for (let i = 0; i < maxLen; i++) {
      const l = leftRows[i];
      const r = rightRows[i];
      body.push([
        l ? formatDate(l.date)  : '', l ? (l.chequeNo || '—') : '', l ? fmtAmt(l.amount) : '', l ? (l.notes || '') : '',
        r ? formatDate(r.date)  : '', r ? (r.chequeNo || '—') : '', r ? fmtAmt(r.amount) : '', r ? (r.notes || '') : '',
      ]);
    }
    const totalRowIdx = body.length;
    body.push(['Total', '', fmtAmt(totalLeft), '', 'Total', '', fmtAmt(totalRight), '']);

    autoTable(doc, {
      startY:     currentY,
      margin:     { left: MARGIN, right: MARGIN },
      tableWidth: 277,
      head: [
        [
          { content: leftLabel,  colSpan: 4, styles: { halign: 'center' as const, fillColor: C_RECEIPT_HDR, textColor: C_WHITE, fontStyle: 'bold' as const, fontSize: 9 } },
          { content: rightLabel, colSpan: 4, styles: { halign: 'center' as const, fillColor: C_PAYMENT_HDR, textColor: C_WHITE, fontStyle: 'bold' as const, fontSize: 9 } },
        ],
        ['Date', 'Chq', 'Amount', 'Notes', 'Date', 'Chq', 'Amount', 'Notes'],
      ],
      body,
      styles:     BASE,
      headStyles: HEAD_S,
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 16 },
        2: { cellWidth: 24, halign: 'right' },
        3: { cellWidth: 78, ...NOTES_COL_STYLE },
        4: { cellWidth: 20 },
        5: { cellWidth: 16 },
        6: { cellWidth: 24, halign: 'right' },
        7: { cellWidth: 79, ...NOTES_COL_STYLE },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        if (data.row.index === totalRowIdx) {
          data.cell.styles.fillColor = C_TOTAL;
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.fillColor = C_WHITE;
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Grand totals (only meaningful when multiple heads selected)
  if (heads.length > 1) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Grand Total Receipts: ${fmtAmt(grandTotalR)}`, MARGIN, currentY);
    doc.text(`Grand Total Payments: ${fmtAmt(grandTotalP)}`, MARGIN, currentY + 6);
    doc.text(`Net (R − P): ${fmtAmt(grandTotalR - grandTotalP)}`, MARGIN, currentY + 12);
  }

  doc.save(`ledger-comparison-${financialYear.replace('/', '-')}.pdf`);
}

export function exportCompareExcel(
  heads: string[],
  entries: Entry[],
  financialYear: string,
  cashBookType: string,
) {
  const wb = XLSX.utils.book_new();
  const sections = buildCompareSections(heads, entries);

  // ── Summary sheet ──
  const summaryRows: (string | number)[][] = [
    ['Ledger Comparison'],
    [`SMP Cash Book — ${cashBookType}  |  FY: ${financialYear}`],
    [],
    ['Left (Receipts)', 'Left Total', 'Right (Payments)', 'Right Total', 'Net (L - R)'],
  ];
  let grandTotalR = 0;
  let grandTotalP = 0;
  for (const { leftLabel, leftRows, rightLabel, rightRows } of sections) {
    const tL = leftRows.reduce((s, e) => s + e.amount, 0);
    const tR = rightRows.reduce((s, e) => s + e.amount, 0);
    grandTotalR += tL;
    grandTotalP += tR;
    summaryRows.push([leftLabel, tL, rightLabel, tR, tL - tR]);
  }
  summaryRows.push([]);
  summaryRows.push(['Grand Total', grandTotalR, '', grandTotalP, grandTotalR - grandTotalP]);
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 36 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // ── Per-section sheets ──
  const usedNames = new Set<string>();

  for (const { leftLabel, leftRows, rightLabel, rightRows } of sections) {
    const totalLeft  = leftRows.reduce((s, e) => s + e.amount, 0);
    const totalRight = rightRows.reduce((s, e) => s + e.amount, 0);
    const maxLen = Math.max(leftRows.length, rightRows.length, 1);

    // Row 4 (0-indexed row 3): head name labels spanning 4 cols each
    // Row 5 (0-indexed row 4): column sub-headers
    const rows: (string | number)[][] = [
      ['Ledger Comparison'],
      [`SMP Cash Book — ${cashBookType}  |  FY: ${financialYear}`],
      [],
      [leftLabel, '', '', '', rightLabel, '', '', ''],   // ← merged in !merges
      ['Date', 'Chq', 'Amount', 'Notes', 'Date', 'Chq', 'Amount', 'Notes'],
    ];

    for (let i = 0; i < maxLen; i++) {
      const l = leftRows[i];
      const r = rightRows[i];
      rows.push([
        l ? formatDate(l.date) : '', l ? (l.chequeNo || '') : '', l ? l.amount : '', l ? (l.notes || '') : '',
        r ? formatDate(r.date) : '', r ? (r.chequeNo || '') : '', r ? r.amount : '', r ? (r.notes || '') : '',
      ]);
    }
    rows.push([]);
    rows.push(['Receipts Total:', '', totalLeft, '', 'Payments Total:', '', totalRight, '']);
    rows.push(['Net (L - R):', '', totalLeft - totalRight, '', '', '', '', '']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 40 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 40 },
    ];
    // Merge head-name cells across columns 0-3 and 4-7 in row index 3
    ws['!merges'] = [
      { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
      { s: { r: 3, c: 4 }, e: { r: 3, c: 7 } },
    ];

    // Build a unique sheet name ≤ 31 chars
    const raw = leftLabel === rightLabel
      ? leftLabel
      : `${leftLabel.slice(0, 13)} vs ${rightLabel.slice(0, 13)}`;
    let sheetName = raw.replace(/[\\/*?[\]:]/g, '').slice(0, 31);
    if (usedNames.has(sheetName)) {
      sheetName = sheetName.slice(0, 28) + `_${usedNames.size}`;
    }
    usedNames.add(sheetName);

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, `ledger-comparison-${financialYear.replace('/', '-')}.xlsx`);
}

export function exportBankStatementExcel(p: BankStatementExportParams) {
  const cbStr = `${fmtAmt(Math.abs(p.closingBalance))}${p.closingBalance < 0 ? ' Dr' : ''}`;

  const wsData: (string | number)[][] = [
    [`${p.bankLabel} — Bank Statement`],
    [`FY: ${p.financialYear}   |   Opening Balance: ${fmtAmt(p.openingBalance)}   |   Closing Balance: ${cbStr}   |   Generated: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Date', 'Narration', 'Cheque No', 'Debit (Receipt)', 'Credit (Payment)', 'Balance'],
    [p.openingDateStr, 'Opening Balance', '', '', p.openingBalance, p.openingBalance],
    ...p.rows.map(r => [
      formatDate(r.date),
      r.narration,
      r.chequeNo,
      r.debit  > 0 ? r.debit  : '',
      r.credit > 0 ? r.credit : '',
      r.balance,
    ]),
    [],
    [`${p.rows.length} transaction${p.rows.length !== 1 ? 's' : ''}`, '', '',
      p.totalDebit, p.totalCredit, p.closingBalance],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    { wch: 14 },  // Date
    { wch: 45 },  // Narration
    { wch: 16 },  // Cheque No
    { wch: 18 },  // Debit
    { wch: 18 },  // Credit
    { wch: 18 },  // Balance
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ws as any)['!pageSetup'] = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ws as any)['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bank Statement');
  const safeName = p.bankLabel.toLowerCase().replace(/\s+/g, '-');
  XLSX.writeFile(wb, `bank-statement-${safeName}-${p.financialYear.replace('/', '-')}.xlsx`);
}
