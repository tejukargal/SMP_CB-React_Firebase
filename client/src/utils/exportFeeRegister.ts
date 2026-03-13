import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Entry } from '@smp-cashbook/shared';
import { formatDate } from './formatDate';

// ── Page geometry (A4 landscape) ──────────────────────────────────────────────
const MARGIN  = 10;
const PAGE_W  = 297;
const PAGE_CX = PAGE_W / 2;

// ── Colour palette ────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C_WHITE: RGB = [255, 255, 255];
const C_HEAD:  RGB = [60,  60,  60 ];
const C_TOTAL: RGB = [229, 231, 235];
const C_BLACK: RGB = [0,   0,   0  ];

// ── Base table style ──────────────────────────────────────────────────────────
const BASE = {
  fontSize:      7,
  cellPadding:   1.8,
  lineColor:     C_BLACK,
  lineWidth:     0.1,
  minCellHeight: 6,
};
const HEAD_S = {
  fillColor: C_HEAD,
  textColor: C_WHITE as RGB,
  fontStyle: 'bold'   as const,
  halign:    'center' as const,
  fontSize:  7,
};

// ── Canonical fee heads ───────────────────────────────────────────────────────
export const FEE_HEADS = [
  'Adm Fee', 'Tution Fee', 'RR Fee', 'Ass Fee', 'Sports Fee', 'Mag Fee',
  'Id Fee', 'Lib Fee', 'Lab Fee', 'Dvp Fee', 'Swf Fee', 'Twf Fee', 'Nss Fee', 'Fine Fee',
] as const;

export type FeeHead = typeof FEE_HEADS[number];

/** Returns the canonical FEE_HEADS entry whose label matches `head`
 *  case-insensitively, or `undefined` if it is not a fee head. */
export function canonicalFeeHead(head: string): string | undefined {
  const lower = head.toLowerCase();
  return (FEE_HEADS as readonly string[]).find(h => h.toLowerCase() === lower);
}

// ── Row type ──────────────────────────────────────────────────────────────────
export interface FeeRegisterRow {
  date:     string;
  amounts:  Map<string, number>;   // head → amount collected
  rowTotal: number;
}

// ── Export meta ───────────────────────────────────────────────────────────────
export interface FeeRegisterMeta {
  financialYear: string;
  cashBookType:  string;
  dateFrom?:     string;
  dateTo?:       string;
}

// ── Build rows (used by both UI and export) ───────────────────────────────────
export function buildFeeRows(
  entries: Entry[],
  visibleHeads: readonly string[],
): FeeRegisterRow[] {
  const dateMap = new Map<string, Map<string, number>>();

  for (const e of entries) {
    if (e.type !== 'Receipt') continue;
    const head = canonicalFeeHead(e.headOfAccount);
    if (!head) continue;
    if (!dateMap.has(e.date)) dateMap.set(e.date, new Map());
    const m = dateMap.get(e.date)!;
    m.set(head, (m.get(head) ?? 0) + e.amount);
  }

  return Array.from(dateMap.keys())
    .sort()
    .map(date => {
      const amounts  = dateMap.get(date)!;
      const rowTotal = visibleHeads.reduce((s, h) => s + (amounts.get(h) ?? 0), 0);
      return { date, amounts, rowTotal };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// FEE REGISTER PDF
//
// Landscape A4 (277 mm usable).
// Columns: Date (20) | <each head> (equal share of 237mm) | Total (20+extra)
// Empty cells (zero amount) print blank to keep the table readable.
// Grand totals row at the bottom with grey-200 fill.
// ─────────────────────────────────────────────────────────────────────────────
export function exportFeeRegisterPDF(
  entries:      Entry[],
  visibleHeads: readonly string[],
  meta:         FeeRegisterMeta,
) {
  const doc    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const rows   = buildFeeRows(entries, visibleHeads);
  const n      = visibleHeads.length;

  // ── Header ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Fee Register', PAGE_CX, 13, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`SMP Cash Book  ·  ${meta.cashBookType}`, PAGE_CX, 20, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const parts: string[] = [`FY: ${meta.financialYear}`];
  if (meta.dateFrom || meta.dateTo)
    parts.push(`Period: ${meta.dateFrom ? formatDate(meta.dateFrom) : '—'} – ${meta.dateTo ? formatDate(meta.dateTo) : '—'}`);
  doc.text(parts.join('   ·   '), PAGE_CX, 26, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, 26, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // ── Column widths ──
  // Usable: 277mm. Date=20, Total=20+extra, each head=floor(237/n)
  const headW  = n > 0 ? Math.floor(237 / n) : 0;
  const extra  = 237 - headW * n;          // leftover goes to Total column

  // ── Body rows ──
  const fmtAmt = (v: number) => v === 0 ? '' : v.toFixed(2);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = rows.map(row => [
    formatDate(row.date),
    ...visibleHeads.map(h => fmtAmt(row.amounts.get(h) ?? 0)),
    row.rowTotal.toFixed(2),
  ]);

  // Grand totals row
  const grandTotals = visibleHeads.map(h =>
    rows.reduce((s, r) => s + (r.amounts.get(h) ?? 0), 0),
  );
  const grandTotal = grandTotals.reduce((s, v) => s + v, 0);
  body.push(['Total', ...grandTotals.map(v => v.toFixed(2)), grandTotal.toFixed(2)]);

  // ── Column styles ──
  const colStyles: Record<number, object> = {
    0:     { cellWidth: 20 },
    [n+1]: { cellWidth: 20 + extra, halign: 'right' as const, fontStyle: 'bold' as const },
  };
  for (let i = 0; i < n; i++) {
    colStyles[i + 1] = { cellWidth: headW, halign: 'right' as const };
  }

  autoTable(doc, {
    startY:     32,
    margin:     { left: MARGIN, right: MARGIN },
    tableWidth: 277,
    head:       [['Date', ...visibleHeads, 'Total']],
    body,
    styles:     BASE,
    headStyles: HEAD_S,
    columnStyles: colStyles,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      data.cell.styles.fillColor = C_WHITE;
      if (data.row.index === rows.length) {          // grand totals row
        data.cell.styles.fillColor = C_TOTAL;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save(`fee-register-${meta.financialYear.replace('/', '-')}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// FEE REGISTER EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export function exportFeeRegisterExcel(
  entries:      Entry[],
  visibleHeads: readonly string[],
  meta:         FeeRegisterMeta,
) {
  const rows = buildFeeRows(entries, visibleHeads);

  const grandTotals = visibleHeads.map(h =>
    rows.reduce((s, r) => s + (r.amounts.get(h) ?? 0), 0),
  );
  const grandTotal = grandTotals.reduce((s, v) => s + v, 0);

  const sheetRows: (string | number)[][] = [
    [`Fee Register — ${meta.cashBookType}`],
    [`Financial Year: ${meta.financialYear}`],
    ...(meta.dateFrom || meta.dateTo
      ? [[`Period: ${meta.dateFrom ? formatDate(meta.dateFrom) : '—'}  to  ${meta.dateTo ? formatDate(meta.dateTo) : '—'}`]]
      : []),
    [],
    ['Date', ...visibleHeads, 'Total'],
    ...rows.map(row => [
      formatDate(row.date),
      ...visibleHeads.map(h => row.amounts.get(h) ?? 0),
      row.rowTotal,
    ]),
    [],
    ['Grand Total', ...grandTotals, grandTotal],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  ws['!cols'] = [
    { wch: 12 },
    ...visibleHeads.map(() => ({ wch: 11 })),
    { wch: 13 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee Register');
  XLSX.writeFile(wb, `fee-register-${meta.financialYear.replace('/', '-')}.xlsx`);
}
