import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PendingBill, PaymentLine, FirmBankSnapshot } from '@smp-cashbook/shared';
import { formatDate } from './formatDate';
import { PAYMENT_MODE_LABEL } from './formatPaymentMode';

const MARGIN  = 10;
const PAGE_W  = 297;
const PAGE_H  = 210;
// Table gets a narrower right margin than the page (header text, signature block, etc. keep the full MARGIN)
// so the freed width can go to the Particulars column.
const TABLE_MARGIN_RIGHT = 6;
const TABLE_WIDTH = PAGE_W - MARGIN - TABLE_MARGIN_RIGHT;

const fmtAmt = (n: number) => n.toFixed(2);

export interface ClearingListMeta {
  financialYear: string;
  cashBookType: string;
  date: string; // clearance date, ISO
}

function addHeader(doc: jsPDF, title: string, meta: ClearingListMeta): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Sanjay Memorial Polytechnic, Sagar', MARGIN, 8, { align: 'left' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, MARGIN, 16, { align: 'left' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `SMP Cash Book  ·  ${meta.cashBookType}  ·  FY: ${meta.financialYear}  ·  Clearance Date: ${formatDate(meta.date)}`,
    MARGIN, 20, { align: 'left' }
  );
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, 20, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  return 26;
}

function addSignatureBlock(doc: jsPDF, y: number): void {
  const pageHeight = PAGE_H;
  if (y + 28 > pageHeight - MARGIN) {
    doc.addPage();
    y = 20;
  }
  const labels = ['Prepared By', 'Accounts Head', 'Principal'];
  const colW = (PAGE_W - 2 * MARGIN) / labels.length;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  labels.forEach((label, i) => {
    const x = MARGIN + i * colW;
    doc.line(x, y, x + colW - 15, y);
    doc.text(label, x, y + 8);
  });
}

function finalYOf(doc: jsPDF): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable?.finalY ?? 30;
}

const COLUMN_STYLES = {
  0: { cellWidth: 14, halign: 'center' as const },
  1: { cellWidth: 24 },
  2: { cellWidth: 70, overflow: 'linebreak' as const },
  3: { cellWidth: 30 },
  4: { cellWidth: 40 },
  5: { cellWidth: 26, halign: 'right' as const },
  6: { cellWidth: 63 + (TABLE_WIDTH - 277), overflow: 'linebreak' as const },
};

// Matches the app's table row divider (Tailwind border-slate-300) for a consistent look on screen and in print.
const BORDER_GREY = [203, 213, 225] as [number, number, number];
// Light grey fill used to highlight the header row and subtotal/total rows.
const HIGHLIGHT_GREY = [241, 245, 249] as [number, number, number];

const BASE = {
  fontSize: 9,
  cellPadding: 2.5,
  lineColor: BORDER_GREY,
  lineWidth: { top: 0.1, bottom: 0.1, left: 0, right: 0 },
  minCellHeight: 9,
};
const HEAD_S = {
  fillColor: HIGHLIGHT_GREY,
  textColor: [0, 0, 0] as [number, number, number],
  fontStyle: 'bold' as const,
  halign: 'left' as const,
  fontSize: 9,
  lineColor: BORDER_GREY,
  lineWidth: { top: 0.1, bottom: 0.3, left: 0, right: 0 },
};

const HEAD = ['Sl No', 'Bill Date', 'Firm Name', 'Bill No', 'Head Of Acct', 'Amount', 'Particulars'];

/** A, B, ... Z, AA, AB, ... — spreadsheet-style column labels, for numbering payment-line groups. */
function groupLabel(index: number): string {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/**
 * Appends one bold underlined info row per distinct firm name (in the order given) that has
 * bank details on file — styled like the payment-line group header. Firms with no record are
 * silently omitted; this must never block export.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pushFirmInfoRows(body: any[], firmNames: Iterable<string>, firmMap: Map<string, FirmBankSnapshot>): void {
  for (const firmName of new Set(firmNames)) {
    const f = firmMap.get(firmName);
    if (!f) continue;
    const parts = [
      f.accountNo && `A/c No: ${f.accountNo}`,
      f.ifscCode && `IFSC: ${f.ifscCode}`,
      f.bankName && `Bank: ${f.bankName}`,
      f.branch && `Branch: ${f.branch}`,
    ].filter(Boolean);
    if (parts.length === 0) continue;
    body.push([{
      content: `${firmName}   ·   ${parts.join('   ·   ')}`,
      colSpan: 7,
      isFirmInfoRow: true,
      styles: { fontStyle: 'bold', halign: 'left' as const },
    }]);
  }
}

export function exportCashClearingListPDF(
  bills: PendingBill[],
  meta: ClearingListMeta,
  firmBankDetails: FirmBankSnapshot[] = []
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, 'Cash Payment List — For Approval & Attestation', meta);

  const sorted = [...bills].sort((a, b) => a.billDate.localeCompare(b.billDate));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = sorted.map((b, i) => [
    String(i + 1), formatDate(b.billDate), b.firmName, b.billNumber, b.headOfAccount, fmtAmt(b.amount), b.particulars || '—',
  ]);
  const total = sorted.reduce((s, b) => s + b.amount, 0);
  body.push(['', '', '', '', 'Total:', fmtAmt(total), '']);

  const firmMap = new Map(firmBankDetails.map((f) => [f.firmName, f]));
  pushFirmInfoRows(body, sorted.map((b) => b.firmName), firmMap);

  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: TABLE_MARGIN_RIGHT },
    tableWidth: TABLE_WIDTH,
    theme: 'plain',
    head: [HEAD],
    body,
    styles: BASE,
    headStyles: HEAD_S,
    columnStyles: COLUMN_STYLES,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (body[data.row.index][4] === 'Total:') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = HIGHLIGHT_GREY;
        data.cell.styles.lineWidth = { top: 0.3, bottom: 0.1, left: 0, right: 0 };
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      if (!body[data.row.index]?.[0]?.isFirmInfoRow) return;
      const { cell } = data;
      const textWidth = doc.getTextWidth(cell.text.join(' '));
      const x = cell.x + cell.padding('left');
      const y = cell.y + cell.height - cell.padding('bottom') + 0.5;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.line(x, y, x + textWidth, y);
    },
  });

  addSignatureBlock(doc, finalYOf(doc) + 20);
  doc.save(`smp-cash-clearing-list-${meta.financialYear.replace('/', '-')}.pdf`);
}

/** Merge payment lines that share the same mode/bank/reference no. into one group with a combined subtotal */
function groupPaymentLines(paymentLines: PaymentLine[]): PaymentLine[] {
  const groups = new Map<string, PaymentLine>();
  for (const line of paymentLines) {
    const key = `${line.mode}|${line.bank.trim().toLowerCase()}|${line.refNo.trim().toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.billIds = [...existing.billIds, ...line.billIds];
      existing.amount += line.amount;
    } else {
      groups.set(key, { ...line, billIds: [...line.billIds] });
    }
  }
  return Array.from(groups.values());
}

export function exportNonCashClearingListPDF(
  bills: PendingBill[],
  paymentLines: PaymentLine[],
  meta: ClearingListMeta,
  firmBankDetails: FirmBankSnapshot[] = []
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, 'Cheque / NEFT / Online / Acct Payee Payment List — For Approval & Attestation', meta);

  const billsById = new Map(bills.map((b) => [b.id, b]));
  const firmMap = new Map(firmBankDetails.map((f) => [f.firmName, f]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = [];
  let slNo = 1;
  const groups = groupPaymentLines(paymentLines);
  groups.forEach((line, groupIndex) => {
    if (groupIndex > 0) {
      body.push([{ content: '', colSpan: 7, isSpacerRow: true }]);
    }
    body.push([{
      content: `${groupLabel(groupIndex)}.   ${PAYMENT_MODE_LABEL[line.mode]}   ·   Bank: ${line.bank || '—'}   ·   Ref No: ${line.refNo || '—'}`,
      colSpan: 7,
      isGroupHeader: true,
      styles: { fontStyle: 'bold', halign: 'left' as const },
    }]);
    const lineBills = [...line.billIds]
      .map((id) => billsById.get(id))
      .filter((b): b is PendingBill => !!b)
      .sort((a, b) => a.billDate.localeCompare(b.billDate));
    lineBills.forEach((b) => {
      body.push([String(slNo++), formatDate(b.billDate), b.firmName, b.billNumber, b.headOfAccount, fmtAmt(b.amount), b.particulars || '—']);
    });
    body.push(['', '', '', '', 'Subtotal:', fmtAmt(line.amount), '']);
    pushFirmInfoRows(body, lineBills.map((b) => b.firmName), firmMap);
  });
  const total = paymentLines.reduce((s, l) => s + l.amount, 0);
  body.push(['', '', '', '', 'Total:', fmtAmt(total), '']);

  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: TABLE_MARGIN_RIGHT },
    tableWidth: TABLE_WIDTH,
    theme: 'plain',
    head: [HEAD],
    body,
    styles: BASE,
    headStyles: HEAD_S,
    columnStyles: COLUMN_STYLES,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const row = body[data.row.index];
      if (row[0]?.isSpacerRow) {
        data.cell.styles.lineWidth = { top: 0, bottom: 0, left: 0, right: 0 };
        data.cell.styles.minCellHeight = 3;
        return;
      }
      if (row[4] === 'Total:' || row[4] === 'Subtotal:') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = HIGHLIGHT_GREY;
        data.cell.styles.lineWidth = { top: 0.3, bottom: 0.1, left: 0, right: 0 };
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      const flags = body[data.row.index]?.[0];
      if (!flags?.isGroupHeader && !flags?.isFirmInfoRow) return;
      const { cell } = data;
      const textWidth = doc.getTextWidth(cell.text.join(' '));
      const x = cell.x + cell.padding('left');
      const y = cell.y + cell.height - cell.padding('bottom') + 0.5;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.line(x, y, x + textWidth, y);
    },
  });

  addSignatureBlock(doc, finalYOf(doc) + 20);
  doc.save(`smp-noncash-clearing-list-${meta.financialYear.replace('/', '-')}.pdf`);
}
