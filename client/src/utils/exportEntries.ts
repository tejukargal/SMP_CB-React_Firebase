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
// Widths (=277): 8 + 18 + 16 + 26 + 38 + 33 + 18 + 16 + 26 + 38 + 40
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
      3:  { cellWidth: 26, halign: 'right' },
      4:  { cellWidth: 38 },
      5:  { cellWidth: 33 },
      6:  { cellWidth: 18 },
      7:  { cellWidth: 16 },
      8:  { cellWidth: 26, halign: 'right' },
      9:  { cellWidth: 38 },
      10: { cellWidth: 40 },
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
// Widths (=277): 20 + 48 + 44 + 26 + 20 + 48 + 44 + 27
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
      1: { cellWidth: 48 },
      2: { cellWidth: 44 },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 20 },
      5: { cellWidth: 48 },
      6: { cellWidth: 44 },
      7: { cellWidth: 27, halign: 'right' },
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
