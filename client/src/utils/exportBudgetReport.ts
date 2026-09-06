import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { slugifyFirmName } from '@smp-cashbook/shared';
import type { BudgetHeadSummary, BudgetExpense } from '@smp-cashbook/shared';
import { formatDate } from './formatDate';

// ── Page geometry (A4 portrait — few columns, unlike the wide ledger tables) ──
const MARGIN  = 10;
const PAGE_W  = 210;
const PAGE_CX = PAGE_W / 2;

// ── Amount formatter (plain 2-decimal, no ₹ symbol) ──────────────────────────
const fmtAmt = (n: number) => n.toFixed(2);

// ── Colour palette ────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C_WHITE:  RGB = [255, 255, 255];
const C_HEAD:   RGB = [100, 100, 100];
const C_TOTAL:  RGB = [229, 231, 235];
const C_GREEN:  RGB = [21, 128, 61];
const C_AMBER:  RGB = [180, 83, 9];
const C_RED:    RGB = [185, 28, 28];
const C_BLACK:  RGB = [0, 0, 0];

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

export interface BudgetReportMeta {
  financialYear: string;
  cashBookTypeLabel: string; // e.g. "Aided" or "All Cash Book Types"
}

function addHeader(doc: jsPDF, meta: BudgetReportMeta, title = 'Budget Tracker Report'): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, PAGE_CX, 13, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`SMP Cash Book  ·  ${meta.cashBookTypeLabel}`, PAGE_CX, 20, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`FY: ${meta.financialYear}`, MARGIN, 26);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, 26, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  return 32;
}

function statusLabel(s: BudgetHeadSummary): string {
  if (s.status === 'exceeded') {
    return s.allocatedAmount === 0 ? 'No Budget Set' : `Exceeded +${fmtAmt(s.spentAmount - s.allocatedAmount)}`;
  }
  if (s.status === 'near-limit') return 'Near Limit';
  return 'On Track';
}

function statusColor(status: BudgetHeadSummary['status']): RGB {
  if (status === 'exceeded') return C_RED;
  if (status === 'near-limit') return C_AMBER;
  return C_GREEN;
}

export function exportBudgetReportPDF(summaries: BudgetHeadSummary[], meta: BudgetReportMeta): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, meta);

  const totalAllocated = summaries.reduce((s, r) => s + r.allocatedAmount, 0);
  const totalSpent = summaries.reduce((s, r) => s + r.spentAmount, 0);

  const body = summaries.map((s) => [
    s.headName,
    fmtAmt(s.allocatedAmount),
    fmtAmt(s.spentAmount),
    fmtAmt(s.remainingAmount),
    s.allocatedAmount === 0 ? '—' : `${Math.round(s.percentUsed)}%`,
    statusLabel(s),
  ]);
  body.push(['Total', fmtAmt(totalAllocated), fmtAmt(totalSpent), fmtAmt(totalAllocated - totalSpent), '', '']);

  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: 190,
    head: [['Head of Account', 'Allocated', 'Spent', 'Remaining', '% Used', 'Status']],
    body,
    styles: BASE,
    headStyles: HEAD_S,
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 26, halign: 'right' as const },
      2: { cellWidth: 26, halign: 'right' as const },
      3: { cellWidth: 26, halign: 'right' as const },
      4: { cellWidth: 20, halign: 'right' as const },
      5: { cellWidth: 34, halign: 'center' as const },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (data.row.index === summaries.length) {
        data.cell.styles.fillColor = C_TOTAL;
        data.cell.styles.fontStyle = 'bold';
        return;
      }
      if (data.column.index === 5) {
        data.cell.styles.textColor = statusColor(summaries[data.row.index]!.status);
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const suffix = meta.cashBookTypeLabel.replace(/\s+/g, '-');
  doc.save(`budget-report-${meta.financialYear.replace('/', '-')}-${suffix}.pdf`);
}

export function exportBudgetReportExcel(summaries: BudgetHeadSummary[], meta: BudgetReportMeta): void {
  const totalAllocated = summaries.reduce((s, r) => s + r.allocatedAmount, 0);
  const totalSpent = summaries.reduce((s, r) => s + r.spentAmount, 0);

  const rows: (string | number)[][] = [
    ['Budget Tracker Report'],
    [`SMP Cash Book · ${meta.cashBookTypeLabel}`],
    [`FY: ${meta.financialYear} · Generated: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Head of Account', 'Allocated', 'Spent', 'Remaining', '% Used', 'Status'],
    ...summaries.map((s) => [
      s.headName,
      s.allocatedAmount,
      s.spentAmount,
      s.remainingAmount,
      s.allocatedAmount === 0 ? '' : Math.round(s.percentUsed),
      statusLabel(s),
    ]),
    ['Total', totalAllocated, totalSpent, totalAllocated - totalSpent, '', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Budget Report');

  const suffix = meta.cashBookTypeLabel.replace(/\s+/g, '-');
  XLSX.writeFile(wb, `budget-report-${meta.financialYear.replace('/', '-')}-${suffix}.xlsx`);
}

// ── Per-head expense breakup (from the Overview tab's drill-down modal) ──────

function breakupFilename(headName: string, meta: BudgetReportMeta, ext: 'pdf' | 'xlsx'): string {
  const suffix = meta.cashBookTypeLabel.replace(/\s+/g, '-');
  return `budget-breakup-${slugifyFirmName(headName)}-${meta.financialYear.replace('/', '-')}-${suffix}.${ext}`;
}

export function exportBudgetHeadBreakupPDF(
  headName: string,
  expenses: BudgetExpense[],
  meta: BudgetReportMeta,
  showTypeColumn: boolean
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, meta, `Budget Head Breakup — ${headName}`);

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  const head = ['Date', 'Notes', ...(showTypeColumn ? ['Type'] : []), 'Linked', 'Amount'];
  const body = expenses.map((e) => [
    formatDate(e.date),
    e.notes || '—',
    ...(showTypeColumn ? [e.cashBookType] : []),
    e.linkedEntryId ? 'Yes' : '—',
    fmtAmt(e.amount),
  ]);
  const totalRow = ['Total', '', ...(showTypeColumn ? [''] : []), '', fmtAmt(totalAmount)];
  body.push(totalRow);

  const amountColIdx = head.length - 1;
  const linkedColIdx = amountColIdx - 1;
  const notesW = showTypeColumn ? 78 : 100;

  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: 190,
    head: [head],
    body,
    styles: BASE,
    headStyles: HEAD_S,
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: notesW },
      ...(showTypeColumn ? { 2: { cellWidth: 30, halign: 'center' as const } } : {}),
      [linkedColIdx]: { cellWidth: 20, halign: 'center' as const },
      [amountColIdx]: { cellWidth: 190 - 22 - notesW - (showTypeColumn ? 30 : 0) - 20, halign: 'right' as const },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (data.row.index === expenses.length) {
        data.cell.styles.fillColor = C_TOTAL;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save(breakupFilename(headName, meta, 'pdf'));
}

export function exportBudgetHeadBreakupExcel(
  headName: string,
  expenses: BudgetExpense[],
  meta: BudgetReportMeta,
  showTypeColumn: boolean
): void {
  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  const head = ['Date', 'Notes', ...(showTypeColumn ? ['Cash Book Type'] : []), 'Linked to Entry', 'Amount'];
  const rows: (string | number)[][] = [
    [`Budget Head Breakup — ${headName}`],
    [`SMP Cash Book · ${meta.cashBookTypeLabel}`],
    [`FY: ${meta.financialYear} · Generated: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    head,
    ...expenses.map((e) => [
      formatDate(e.date),
      e.notes || '',
      ...(showTypeColumn ? [e.cashBookType] : []),
      e.linkedEntryId ? 'Yes' : '',
      e.amount,
    ]),
    ['Total', '', ...(showTypeColumn ? [''] : []), '', totalAmount],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = showTypeColumn
    ? [{ wch: 12 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
    : [{ wch: 12 }, { wch: 32 }, { wch: 14 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Breakup');

  XLSX.writeFile(wb, breakupFilename(headName, meta, 'xlsx'));
}
