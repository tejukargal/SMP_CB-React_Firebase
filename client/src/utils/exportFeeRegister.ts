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

export interface SplitFeeRegisterRow extends FeeRegisterRow {
  cashBookType: string;   // 'Aided' | 'Un-Aided'
}

// ── Export meta ───────────────────────────────────────────────────────────────
export interface FeeRegisterMeta {
  financialYear: string;
  cashBookType:  string;
  dateFrom?:     string;
  dateTo?:       string;
  splitView?:    boolean;   // when true (Both mode), export per cashBookType rows
}

// ── Build split rows (grouped by date × cashBookType) ────────────────────────
export function buildSplitFeeRows(
  entries: Entry[],
  visibleHeads: readonly string[],
): SplitFeeRegisterRow[] {
  const keyMap  = new Map<string, Map<string, number>>();
  const metaMap = new Map<string, { date: string; cashBookType: string }>();

  for (const e of entries) {
    if (e.type !== 'Receipt') continue;
    const head = canonicalFeeHead(e.headOfAccount);
    if (!head) continue;
    const key = `${e.date}|${e.cashBookType}`;
    if (!keyMap.has(key)) {
      keyMap.set(key, new Map());
      metaMap.set(key, { date: e.date, cashBookType: e.cashBookType });
    }
    const m = keyMap.get(key)!;
    m.set(head, (m.get(head) ?? 0) + e.amount);
  }

  return Array.from(keyMap.keys())
    .sort()
    .map(key => {
      const amounts  = keyMap.get(key)!;
      const meta     = metaMap.get(key)!;
      const rowTotal = visibleHeads.reduce((s, h) => s + (amounts.get(h) ?? 0), 0);
      return { date: meta.date, cashBookType: meta.cashBookType, amounts, rowTotal };
    });
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
// Consolidated: Date (20) | heads (share 237mm) | Total (20+extra)
// Split:        Date (20) | Type (16) | heads (share 221mm) | Total (20+extra)
// Empty cells (zero amount) print blank. Grand totals row with grey fill.
// ─────────────────────────────────────────────────────────────────────────────

// Row fill colours for split view (light teal / light orange)
const C_AIDED:   RGB = [236, 253, 245];   // teal-50
const C_UNAIDED: RGB = [255, 247, 237];   // orange-50

export function exportFeeRegisterPDF(
  entries:      Entry[],
  visibleHeads: readonly string[],
  meta:         FeeRegisterMeta,
) {
  const isSplit  = !!(meta.splitView);
  const doc      = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const dataRows = isSplit
    ? buildSplitFeeRows(entries, visibleHeads)
    : buildFeeRows(entries, visibleHeads);
  const n = visibleHeads.length;

  // ── Header ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Fee Register', PAGE_CX, 13, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const subTitle = isSplit
    ? `${meta.cashBookType}  ·  Split View (Aided & Un-Aided)`
    : `SMP Cash Book  ·  ${meta.cashBookType}`;
  doc.text(subTitle, PAGE_CX, 20, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const parts: string[] = [`FY: ${meta.financialYear}`];
  if (meta.dateFrom || meta.dateTo)
    parts.push(`Period: ${meta.dateFrom ? formatDate(meta.dateFrom) : '—'} – ${meta.dateTo ? formatDate(meta.dateTo) : '—'}`);
  doc.text(parts.join('   ·   '), PAGE_CX, 26, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, 26, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // ── Column widths ──
  // Usable: 277mm. In split mode a 16mm Type column is inserted after Date.
  // Remaining space for heads + Total: 277 - 20 (Date) - [16 (Type)] - 20 (Total base)
  const TYPE_W    = 16;
  const headsPool = isSplit ? (277 - 20 - TYPE_W - 20) : (277 - 20 - 20); // 221 or 237
  const headW     = n > 0 ? Math.floor(headsPool / n) : 0;
  const extra     = headsPool - headW * n;   // leftover goes to Total column

  // ── Body rows ──
  const fmtAmt = (v: number) => v === 0 ? '' : v.toFixed(2);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = dataRows.map(row => {
    const splitRow = row as SplitFeeRegisterRow;
    const cells = [formatDate(row.date)];
    if (isSplit) cells.push(splitRow.cashBookType ?? '');
    cells.push(...visibleHeads.map(h => fmtAmt(row.amounts.get(h) ?? 0)));
    cells.push(row.rowTotal.toFixed(2));
    return cells;
  });

  // Grand totals row
  const grandTotals = visibleHeads.map(h =>
    dataRows.reduce((s, r) => s + (r.amounts.get(h) ?? 0), 0),
  );
  const grandTotal = grandTotals.reduce((s, v) => s + v, 0);
  const totalRow = ['Total'];
  if (isSplit) totalRow.push('');   // blank under Type column
  totalRow.push(...grandTotals.map(v => v.toFixed(2)), grandTotal.toFixed(2));
  body.push(totalRow);

  // ── Column styles ──
  // Col 0: Date, [Col 1: Type (split only)], Cols +1..+n: heads, last: Total
  const typeOffset  = isSplit ? 1 : 0;   // extra columns before heads
  const totalColIdx = 1 + typeOffset + n; // index of the Total column

  const colStyles: Record<number, object> = {
    0:            { cellWidth: 20 },
    [totalColIdx]: { cellWidth: 20 + extra, halign: 'right' as const, fontStyle: 'bold' as const },
  };
  if (isSplit) {
    colStyles[1] = { cellWidth: TYPE_W, halign: 'center' as const };
  }
  for (let i = 0; i < n; i++) {
    colStyles[1 + typeOffset + i] = { cellWidth: headW, halign: 'right' as const };
  }

  const headRow = ['Date'];
  if (isSplit) headRow.push('Type');
  headRow.push(...visibleHeads, 'Total');

  autoTable(doc, {
    startY:     32,
    margin:     { left: MARGIN, right: MARGIN },
    tableWidth: 277,
    head:       [headRow],
    body,
    styles:     BASE,
    headStyles: HEAD_S,
    columnStyles: colStyles,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (data.row.index === dataRows.length) {   // grand totals row
        data.cell.styles.fillColor = C_TOTAL;
        data.cell.styles.fontStyle = 'bold';
        return;
      }
      if (isSplit) {
        // Colour rows by cashBookType
        const splitRow = dataRows[data.row.index] as SplitFeeRegisterRow;
        data.cell.styles.fillColor =
          splitRow.cashBookType === 'Aided' ? C_AIDED : C_UNAIDED;
      } else {
        data.cell.styles.fillColor = C_WHITE;
      }
    },
  });

  const suffix = isSplit ? '-split' : '';
  doc.save(`fee-register-${meta.financialYear.replace('/', '-')}${suffix}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// FEE REGISTER EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export function exportFeeRegisterExcel(
  entries:      Entry[],
  visibleHeads: readonly string[],
  meta:         FeeRegisterMeta,
) {
  const isSplit  = !!(meta.splitView);
  const dataRows = isSplit
    ? buildSplitFeeRows(entries, visibleHeads)
    : buildFeeRows(entries, visibleHeads);

  const grandTotals = visibleHeads.map(h =>
    dataRows.reduce((s, r) => s + (r.amounts.get(h) ?? 0), 0),
  );
  const grandTotal = grandTotals.reduce((s, v) => s + v, 0);

  const titleLine = isSplit
    ? `Fee Register — ${meta.cashBookType} (Split View)`
    : `Fee Register — ${meta.cashBookType}`;

  const headerRow = isSplit
    ? ['Date', 'Type', ...visibleHeads, 'Total']
    : ['Date', ...visibleHeads, 'Total'];

  const grandTotalRow = isSplit
    ? ['Grand Total', '', ...grandTotals, grandTotal]
    : ['Grand Total', ...grandTotals, grandTotal];

  const sheetRows: (string | number)[][] = [
    [titleLine],
    [`Financial Year: ${meta.financialYear}`],
    ...(meta.dateFrom || meta.dateTo
      ? [[`Period: ${meta.dateFrom ? formatDate(meta.dateFrom) : '—'}  to  ${meta.dateTo ? formatDate(meta.dateTo) : '—'}`]]
      : []),
    [],
    headerRow,
    ...dataRows.map(row => {
      const splitRow = row as SplitFeeRegisterRow;
      const cells: (string | number)[] = [formatDate(row.date)];
      if (isSplit) cells.push(splitRow.cashBookType ?? '');
      cells.push(...visibleHeads.map(h => row.amounts.get(h) ?? 0));
      cells.push(row.rowTotal);
      return cells;
    }),
    [],
    grandTotalRow,
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  ws['!cols'] = isSplit
    ? [{ wch: 12 }, { wch: 10 }, ...visibleHeads.map(() => ({ wch: 11 })), { wch: 13 }]
    : [{ wch: 12 }, ...visibleHeads.map(() => ({ wch: 11 })), { wch: 13 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee Register');
  const suffix = isSplit ? '-split' : '';
  XLSX.writeFile(wb, `fee-register-${meta.financialYear.replace('/', '-')}${suffix}.xlsx`);
}
