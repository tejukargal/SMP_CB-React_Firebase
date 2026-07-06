import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { PendingBill } from '@smp-cashbook/shared';
import { formatDate } from './formatDate';
import type { PendingBillFilterState } from '@/components/pendingBills/PendingBillFilters';

// ── Page geometry (A4 landscape) ──────────────────────────────────────────────
const MARGIN  = 10;
const PAGE_W  = 297;
const PAGE_CX = PAGE_W / 2;

const fmtAmt = (n: number) => n.toFixed(2);

// ── Colour palette ────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C_WHITE: RGB = [255, 255, 255];
const C_BLACK: RGB = [0, 0, 0];

// Minimal style: horizontal rules only (top/bottom), no vertical borders
const BASE = {
  fontSize:      9,
  cellPadding:   2.5,
  lineColor:     C_BLACK,
  lineWidth:     { top: 0.1, bottom: 0.1, left: 0, right: 0 },
  minCellHeight: 10,
};
const HEAD_S = {
  fillColor:  C_WHITE,
  textColor:  C_BLACK,
  fontStyle:  'bold'   as const,
  halign:     'left'   as const,
  fontSize:   9,
  lineWidth:  { top: 0.1, bottom: 0.3, left: 0, right: 0 },
};

export interface PendingBillExportMeta {
  financialYear: string;
  cashBookType:  string;
  filters:       PendingBillFilterState;
}

function addHeader(doc: jsPDF, meta: PendingBillExportMeta): number {
  const { financialYear, cashBookType, filters } = meta;

  const title = 'Pending Bills Report';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, MARGIN, 13, { align: 'left' });
  const titleWidth = doc.getTextWidth(title);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`  —  SMP Cash Book  ·  ${cashBookType}`, MARGIN + titleWidth, 13, { align: 'left' });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const parts: string[] = [`FY: ${financialYear}`];
  if (filters.dateFrom || filters.dateTo)
    parts.push(`Bill Date: ${filters.dateFrom ? formatDate(filters.dateFrom) : '—'} – ${filters.dateTo ? formatDate(filters.dateTo) : '—'}`);
  if (filters.status !== 'All') parts.push(`Status: ${filters.status}`);
  if (filters.bank) parts.push(`Bank: ${filters.bank}`);
  if (filters.chqNoOrCash) parts.push(`Chq/Cash: ${filters.chqNoOrCash}`);
  if (filters.headOfAccount) parts.push(`Head: ${filters.headOfAccount}`);
  if (filters.search.trim()) parts.push(`Search: "${filters.search}"`);
  doc.text(parts.join('   ·   '), PAGE_CX, 20, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, 20, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  return 26;
}

const COLUMNS = ['Sl No', 'Date', 'Bank', 'Chq No/Cash', 'Amt', 'Head Of Acct', 'Firm Name', 'Bill No', 'Bill Date', 'Particulars', 'Status'];
// Firm Name column carries the particulars as a second, muted line under the firm name
const PDF_COLUMNS = ['Sl No', 'Date', 'Bank', 'Chq No/Cash', 'Amt', 'Head Of Acct', 'Firm Name', 'Bill No', 'Bill Date', 'Remarks'];

export function exportPendingBillsPDF(bills: PendingBill[], meta: PendingBillExportMeta) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, meta);

  const sorted = [...bills].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = sorted.map((b, i) => [
    String(i + 1),
    formatDate(b.date),
    b.bank || '—',
    b.chqNoOrCash || '—',
    fmtAmt(b.amount),
    b.headOfAccount,
    b.particulars ? `${b.firmName}\n${b.particulars}` : b.firmName,
    b.billNumber,
    formatDate(b.billDate),
    b.remarks || '—',
  ]);

  const total = sorted.reduce((s, b) => s + b.amount, 0);
  body.push(['', '', '', 'Total:', fmtAmt(total), '', '', '', '', '']);

  autoTable(doc, {
    startY,
    margin:     { left: MARGIN, right: MARGIN },
    tableWidth: 277,
    theme:      'plain',
    head: [PDF_COLUMNS],
    body,
    styles:     BASE,
    headStyles: HEAD_S,
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 24, overflow: 'ellipsize' as const },
      2: { cellWidth: 28 },
      3: { cellWidth: 20 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 30 },
      6: { cellWidth: 65, overflow: 'linebreak' as const },
      7: { cellWidth: 26 },
      8: { cellWidth: 24, overflow: 'ellipsize' as const },
      9: { cellWidth: 26, fontSize: 7 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const row = body[data.row.index];
      if (row[3] === 'Total:') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.lineWidth = { top: 0.3, bottom: 0.1, left: 0, right: 0 };
      }
    },
  });

  doc.save(`smp-pending-bills-${meta.financialYear.replace('/', '-')}.pdf`);
}

export function exportPendingBillsExcel(bills: PendingBill[], meta: PendingBillExportMeta) {
  const sorted = [...bills].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const rows: (string | number)[][] = [
    [`Pending Bills Report — ${meta.cashBookType}`],
    [`Financial Year: ${meta.financialYear}`],
    [],
    COLUMNS,
  ];

  sorted.forEach((b, i) => {
    rows.push([
      i + 1,
      formatDate(b.date),
      b.bank,
      b.chqNoOrCash,
      b.amount,
      b.headOfAccount,
      b.firmName,
      b.billNumber,
      formatDate(b.billDate),
      b.particulars,
      b.status,
    ]);
  });

  const total = sorted.reduce((s, b) => s + b.amount, 0);
  rows.push([]);
  rows.push(['', '', '', 'Total:', total, '', '', '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 12 },
    { wch: 20 }, { wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 40 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pending Bills');
  XLSX.writeFile(wb, `smp-pending-bills-${meta.financialYear.replace('/', '-')}.xlsx`);
}
