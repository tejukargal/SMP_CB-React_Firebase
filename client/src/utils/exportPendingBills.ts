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
const C_WHITE:    RGB = [255, 255, 255];
const C_HEAD:     RGB = [100, 100, 100];
const C_TOTAL:    RGB = [229, 231, 235];
const C_CLEARED:  RGB = [220, 252, 231]; // light green tint
const C_APPROVED: RGB = [219, 234, 254]; // light blue tint
const C_BLACK:    RGB = [0, 0, 0];

const BASE = {
  fontSize:      10,
  cellPadding:   3,
  lineColor:     C_BLACK,
  lineWidth:     0.1,
  minCellHeight: 12,
};
const HEAD_S = {
  fillColor: C_HEAD,
  textColor: C_WHITE,
  fontStyle: 'bold'   as const,
  halign:    'center' as const,
  fontSize:  10,
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
  if (filters.firmName) parts.push(`Firm: ${filters.firmName}`);
  if (filters.search.trim()) parts.push(`Search: "${filters.search}"`);
  doc.text(parts.join('   ·   '), PAGE_CX, 20, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, 20, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  return 26;
}

const COLUMNS = ['Sl No', 'Date', 'Bank', 'Chq No/Cash', 'Amt', 'Head Of Acct', 'Firm Name', 'Bill No', 'Bill Date', 'Particulars', 'Status'];
const PDF_COLUMNS = ['Sl No', 'Date', 'Bank', 'Chq No/Cash', 'Amt', 'Head Of Acct', 'Firm Name', 'Bill No', 'Bill Date', 'Particulars', 'Remarks'];

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
    b.firmName,
    b.billNumber,
    formatDate(b.billDate),
    b.particulars || '',
    b.remarks || '—',
  ]);

  const total = sorted.reduce((s, b) => s + b.amount, 0);
  body.push(['', '', '', 'Total:', fmtAmt(total), '', '', '', '', '', '']);

  autoTable(doc, {
    startY,
    margin:     { left: MARGIN, right: MARGIN },
    tableWidth: 277,
    head: [PDF_COLUMNS],
    body,
    styles:     BASE,
    headStyles: HEAD_S,
    columnStyles: {
      0:  { cellWidth: 12, halign: 'center' },
      1:  { cellWidth: 20 },
      2:  { cellWidth: 26 },
      3:  { cellWidth: 22 },
      4:  { cellWidth: 22, halign: 'right' },
      5:  { cellWidth: 32 },
      6:  { cellWidth: 34 },
      7:  { cellWidth: 26 },
      8:  { cellWidth: 20 },
      9:  { cellWidth: 43, fontSize: 7, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, overflow: 'linebreak' as const },
      10: { cellWidth: 20, fontSize: 7, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, overflow: 'linebreak' as const },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const row = body[data.row.index];
      data.cell.styles.fillColor = C_WHITE;
      if (row[3] === 'Total:') {
        data.cell.styles.fillColor = C_TOTAL;
        data.cell.styles.fontStyle = 'bold';
      } else {
        const bill = sorted[data.row.index];
        if (bill?.status === 'Cleared') data.cell.styles.fillColor = C_CLEARED;
        else if (bill?.status === 'Approved') data.cell.styles.fillColor = C_APPROVED;
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
