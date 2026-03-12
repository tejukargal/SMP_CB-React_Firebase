import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Entry } from '@smp-cashbook/shared';
import { formatDate } from './formatDate';
import { formatCurrency } from './formatCurrency';
import type { FilterState } from '@/components/entries/EntryFilters';

// ── Page geometry (A4 landscape) ──────────────────────────────────────────────
const MARGIN    = 10;         // mm
const PAGE_W    = 297;        // mm
const CONTENT_W = PAGE_W - 2 * MARGIN; // 277 mm

// ── Palette ───────────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C_HEAD_BG:  RGB = [51,  65,  85 ];   // slate-700
const C_WHITE:    RGB = [255, 255, 255];
const C_ALT:      RGB = [248, 250, 252];   // slate-50
const C_FOOT_BG:  RGB = [241, 245, 249];   // slate-100
const C_FOOT_FG:  RGB = [15,  23,  42 ];   // slate-900
const C_BORDER:   RGB = [203, 213, 225];   // slate-300
const C_GREEN:    RGB = [21,  128, 61 ];   // green-700
const C_RED:      RGB = [185, 28,  28 ];   // red-700
const C_BLUE:     RGB = [29,  78,  216];   // blue-700
const C_ORANGE:   RGB = [154, 52,  18 ];   // orange-700
const C_DATE_BG:  RGB = [239, 246, 255];   // blue-50
const C_R_BG:     RGB = [240, 253, 244];   // green-50
const C_P_BG:     RGB = [255, 241, 242];   // red-50
const C_CB_BG:    RGB = [255, 247, 237];   // orange-50

// ── Shared table styles ───────────────────────────────────────────────────────
const BASE = {
  fontSize:    7.5,
  cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
  overflow:    'ellipsize' as const,
  font:        'helvetica',
  lineWidth:   0.1,
  lineColor:   C_BORDER,
};
const HEAD_S = {
  fillColor:   C_HEAD_BG,
  textColor:   C_WHITE,
  fontStyle:   'bold' as const,
  fontSize:    7.5,
  cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
};
const FOOT_S = {
  fillColor: C_FOOT_BG,
  textColor: C_FOOT_FG,
  fontStyle: 'bold' as const,
  fontSize:  7.5,
};

// ── Meta ──────────────────────────────────────────────────────────────────────
export interface ExportMeta {
  financialYear: string;
  cashBookType:  string;
  filters:       FilterState;
}

// ── Two-line page header ──────────────────────────────────────────────────────
function addHeader(doc: jsPDF, meta: ExportMeta) {
  const { financialYear, cashBookType, filters } = meta;

  // Line 1 — bold title left, FY·type right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('SMP Cash Book', MARGIN, 8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${financialYear}  ·  ${cashBookType}`, PAGE_W - MARGIN, 8, { align: 'right' });

  // Line 2 — filter summary left, generated date right
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139); // slate-500
  const parts: string[] = [];
  if (filters.dateFrom || filters.dateTo)
    parts.push(`Period: ${filters.dateFrom ? formatDate(filters.dateFrom) : '—'} to ${filters.dateTo ? formatDate(filters.dateTo) : '—'}`);
  if (filters.typeFilter !== 'All') parts.push(`Type: ${filters.typeFilter}s`);
  if (filters.headOfAccount) parts.push(`Head: ${filters.headOfAccount}`);
  if (filters.search.trim()) parts.push(`Search: "${filters.search}"`);
  if (parts.length === 0) parts.push('All entries');
  doc.text(parts.join('   ·   '), MARGIN, 13);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, 13, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

// ── Date-group computation (same logic as DateGroupedView) ────────────────────
interface DateGroup {
  date:           string;
  dateEntries:    Entry[];
  openingBalance: number;
  closingBalance: number;
  dayR:           number;
  dayP:           number;
}

function computeDateGroups(entries: Entry[]): DateGroup[] {
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
  );
  const map = new Map<string, Entry[]>();
  for (const e of sorted) {
    const list = map.get(e.date);
    if (list) list.push(e); else map.set(e.date, [e]);
  }
  let running = 0;
  return Array.from(map.entries()).map(([date, dateEntries]) => {
    const openingBalance  = running;
    const dayR            = dateEntries.filter(e => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
    const dayP            = dateEntries.filter(e => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
    const closingBalance  = openingBalance + dayR - dayP;
    running = closingBalance;
    return { date, dateEntries, openingBalance, closingBalance, dayR, dayP };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST  PDF
// Columns: # | Date | Type | Head of Account | Cheque No | Notes | Amount
//          8 + 22  + 20   + 62              + 24        + 113   + 28  = 277
// ─────────────────────────────────────────────────────────────────────────────
export function exportListPDF(entries: Entry[], meta: ExportMeta) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  addHeader(doc, meta);

  const totalR = entries.filter(e => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
  const totalP = entries.filter(e => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
  const net    = totalR - totalP;

  autoTable(doc, {
    startY:     17,
    margin:     { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    head: [['#', 'Date', 'Type', 'Head of Account', 'Cheque No', 'Notes', 'Amount']],
    body: entries.map((e, i) => [
      String(i + 1),
      formatDate(e.date),
      e.type,
      e.headOfAccount,
      e.chequeNo || '—',
      e.notes || '',
      formatCurrency(e.amount),
    ]),
    foot: [
      ['', '', '', 'Total Receipts', '', '', formatCurrency(totalR)],
      ['', '', '', 'Total Payments', '', '', formatCurrency(totalP)],
      ['', '', '', `Net Balance${net < 0 ? ' (Dr)' : ''}`, '', '', formatCurrency(Math.abs(net))],
    ],
    styles:             BASE,
    headStyles:         HEAD_S,
    footStyles:         FOOT_S,
    alternateRowStyles: { fillColor: C_ALT },
    columnStyles: {
      0: { cellWidth: 8,   halign: 'center' },
      1: { cellWidth: 22 },
      2: { cellWidth: 20 },
      3: { cellWidth: 62 },
      4: { cellWidth: 24 },
      5: { cellWidth: 113 },
      6: { cellWidth: 28,  halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const e = entries[data.row.index];
      if (!e) return;
      const col = data.column.index;
      if (col === 2 || col === 6)
        data.cell.styles.textColor = e.type === 'Receipt' ? C_GREEN : C_RED;
    },
  });

  doc.save(`smp-cashbook-${meta.financialYear.replace('/', '-')}-list.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE  PDF
// Columns: Date | Type | Head of Account | Cheque No | Notes | Amount
//          22   + 20   + 67             + 24        + 116   + 28  = 277
// ─────────────────────────────────────────────────────────────────────────────
export function exportDatePDF(entries: Entry[], meta: ExportMeta) {
  const doc    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  addHeader(doc, meta);

  const groups = computeDateGroups(entries);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = [];

  const totRow = (
    label: string, val: string,
    bg: RGB, fg: RGB,
  ) => [
    { content: label, colSpan: 5, styles: { fontStyle: 'bold', fillColor: bg, textColor: fg } },
    { content: val,               styles: { fontStyle: 'bold', fillColor: bg, textColor: fg, halign: 'right' } },
  ];

  for (const { date, dateEntries, openingBalance, closingBalance, dayR, dayP } of groups) {
    const receipts          = dateEntries.filter(e => e.type === 'Receipt');
    const payments          = dateEntries.filter(e => e.type === 'Payment');
    const receiptGrandTotal = openingBalance + dayR;
    const paymentGrandTotal = dayP + closingBalance;

    // Date header row — spans all 6 columns
    const ob = openingBalance !== 0
      ? `  |  Opening Balance: ${formatCurrency(Math.abs(openingBalance))}${openingBalance < 0 ? ' (Dr)' : ''}`
      : '';
    body.push([{
      content: `${formatDate(date)}${ob}`,
      colSpan: 6,
      styles:  { fontStyle: 'bold', fontSize: 8, fillColor: C_DATE_BG, textColor: C_BLUE },
    }]);

    // Entry rows
    for (const e of dateEntries) {
      const isR = e.type === 'Receipt';
      body.push([
        formatDate(e.date),
        { content: e.type, styles: { textColor: isR ? C_GREEN : C_RED } },
        e.headOfAccount,
        e.chequeNo || '—',
        e.notes || '',
        { content: formatCurrency(e.amount), styles: { textColor: isR ? C_GREEN : C_RED, halign: 'right' } },
      ]);
    }

    // Totals rows
    body.push(totRow(`Receipts (${receipts.length})`,  formatCurrency(receiptGrandTotal),                                  C_R_BG,  C_GREEN));
    body.push(totRow(`Payments (${payments.length})`,  formatCurrency(dayP),                                               C_P_BG,  C_RED));
    body.push(totRow(`Closing Balance${closingBalance < 0 ? ' (Dr)' : ''}`,
                      formatCurrency(Math.abs(closingBalance)),                                                             C_CB_BG, C_ORANGE));
    body.push(totRow('',                               formatCurrency(paymentGrandTotal),                                   C_P_BG,  C_RED));
  }

  autoTable(doc, {
    startY:     17,
    margin:     { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    head:       [['Date', 'Type', 'Head of Account', 'Cheque No', 'Notes', 'Amount']],
    body,
    styles:      BASE,
    headStyles:  HEAD_S,
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 20 },
      2: { cellWidth: 67 },
      3: { cellWidth: 24 },
      4: { cellWidth: 116 },
      5: { cellWidth: 28, halign: 'right' },
    },
  });

  doc.save(`smp-cashbook-${meta.financialYear.replace('/', '-')}-date.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST  EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export function exportListExcel(entries: Entry[], meta: ExportMeta) {
  const { financialYear, cashBookType } = meta;
  const totalR = entries.filter(e => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
  const totalP = entries.filter(e => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
  const net    = totalR - totalP;

  const rows: (string | number)[][] = [
    ['SMP Cash Book', financialYear, cashBookType],
    [],
    ['#', 'Date', 'Type', 'Head of Account', 'Cheque No', 'Notes', 'Amount'],
    ...entries.map((e, i) => [
      i + 1, formatDate(e.date), e.type,
      e.headOfAccount, e.chequeNo || '', e.notes || '', e.amount,
    ]),
    [],
    ['', '', '', 'Total Receipts', '', '', totalR],
    ['', '', '', 'Total Payments', '', '', totalP],
    ['', '', '', `Net Balance${net < 0 ? ' (Dr)' : ''}`, '', '', Math.abs(net)],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 4 }, { wch: 12 }, { wch: 10 },
    { wch: 32 }, { wch: 14 }, { wch: 45 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  XLSX.writeFile(wb, `smp-cashbook-${financialYear.replace('/', '-')}-list.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE  EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export function exportDateExcel(entries: Entry[], meta: ExportMeta) {
  const { financialYear, cashBookType } = meta;
  const groups = computeDateGroups(entries);

  const rows: (string | number)[][] = [
    ['SMP Cash Book', financialYear, cashBookType],
    [],
    ['Date', 'Type', 'Head of Account', 'Cheque No', 'Notes', 'Amount'],
  ];

  for (const { date, dateEntries, openingBalance, closingBalance, dayR, dayP } of groups) {
    const receipts          = dateEntries.filter(e => e.type === 'Receipt');
    const payments          = dateEntries.filter(e => e.type === 'Payment');
    const receiptGrandTotal = openingBalance + dayR;

    const ob = openingBalance !== 0
      ? `  |  Opening: ${formatCurrency(Math.abs(openingBalance))}${openingBalance < 0 ? ' Dr' : ''}`
      : '';
    rows.push([`${formatDate(date)}${ob}`, '', '', '', '', '']);

    for (const e of dateEntries) {
      rows.push([formatDate(e.date), e.type, e.headOfAccount, e.chequeNo || '', e.notes || '', e.amount]);
    }

    rows.push(['', `Receipts (${receipts.length})`,  '', '', '', receiptGrandTotal]);
    rows.push(['', `Payments (${payments.length})`,  '', '', '', dayP]);
    rows.push(['', `Closing Balance${closingBalance < 0 ? ' (Dr)' : ''}`, '', '', '', Math.abs(closingBalance)]);
    rows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 30 }, { wch: 10 }, { wch: 32 },
    { wch: 14 }, { wch: 45 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'By Date');
  XLSX.writeFile(wb, `smp-cashbook-${financialYear.replace('/', '-')}-date.xlsx`);
}
