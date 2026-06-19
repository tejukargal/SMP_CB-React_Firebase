import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { BankStatementTxn } from '@smp-cashbook/shared';
import { formatDate } from './formatDate';

type RGB = [number, number, number];

const MARGIN  = 10;
const PAGE_W  = 297;
const PAGE_CX = PAGE_W / 2;

const fmtAmt = (n: number) => n.toFixed(2);

const C_WHITE:   RGB = [255, 255, 255];
const C_HEAD:    RGB = [100, 100, 100];
const C_TOTAL:   RGB = [229, 231, 235];
const C_OB_BG:   RGB = [219, 234, 254];
const C_OB_FG:   RGB = [30,  64,  175];
const C_OK_BG:   RGB = [220, 252, 231]; // green-100
const C_WARN_BG: RGB = [254, 243, 199]; // amber-100
const C_BLACK:   RGB = [0,   0,   0];

const BASE = {
  fontSize: 8, cellPadding: 2.5,
  lineColor: C_BLACK, lineWidth: 0.1, minCellHeight: 8,
};
const HEAD_S = {
  fillColor: C_HEAD, textColor: C_WHITE,
  fontStyle: 'bold' as const, halign: 'center' as const, fontSize: 9,
};

export interface BankStmtExportParams {
  bankLabel:       string;
  financialYear:   string;
  openingBalance:  number;
  openingDateStr:  string;
  transactions:    BankStatementTxn[];
  totalDebit:      number;
  totalCredit:     number;
  closingBalance:  number;
  /** When Match CB is active, one entry per transaction (null = not matched). */
  cbMatchRows?:    Array<{ headOfAccount: string; notes: string } | null>;
}

// ── PDF export ────────────────────────────────────────────────────────────────

export function exportImportedBankStatementPDF(p: BankStmtExportParams) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${p.bankLabel} — Imported Bank Statement`, PAGE_CX, 11, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const cbStr = `${fmtAmt(Math.abs(p.closingBalance))}${p.closingBalance < 0 ? ' Dr' : ''}`;
  doc.text(
    `FY: ${p.financialYear}   |   Opening: ${fmtAmt(p.openingBalance)}   |   Closing: ${cbStr}   |   Generated: ${new Date().toLocaleDateString('en-IN')}`,
    PAGE_CX, 17, { align: 'center' },
  );
  doc.setTextColor(0, 0, 0);

  const hasCB = !!p.cbMatchRows;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = [
    [p.openingDateStr, 'Opening Balance', '', '—', fmtAmt(p.openingBalance), fmtAmt(p.openingBalance), ''],
    ...p.transactions.map((txn, i) => {
      const cb   = hasCB ? p.cbMatchRows![i] : null;
      const col1 = hasCB ? (cb?.headOfAccount || '—') : (txn.narration || '—');
      const col2 = hasCB ? (cb?.notes         || '—') : (txn.chequeNo  || '—');
      return [
        formatDate(txn.date),
        col1, col2,
        txn.debit  > 0 ? fmtAmt(txn.debit)  : '—',
        txn.credit > 0 ? fmtAmt(txn.credit) : '—',
        `${fmtAmt(Math.abs(txn.balance))}${txn.balance < 0 ? ' Dr' : ''}`,
        txn.reconciledEntryId ? '✓' : '✗',
      ];
    }),
    [
      `${p.transactions.length} transaction${p.transactions.length !== 1 ? 's' : ''}`,
      '', '', fmtAmt(p.totalDebit), fmtAmt(p.totalCredit), cbStr,
      `${p.transactions.filter(t => t.reconciledEntryId).length}/${p.transactions.length} matched`,
    ],
  ];
  const TOTAL_IDX = body.length - 1;

  const head = hasCB
    ? [['Date', 'CB Head', 'CB Notes', 'Debit (Dr)', 'Credit (Cr)', 'Balance', 'Status']]
    : [['Date', 'Narration', 'Cheque / Ref', 'Debit (Dr)', 'Credit (Cr)', 'Balance', 'Status']];

  const columnStyles = hasCB
    ? {
        0: { cellWidth: 22 },
        1: { cellWidth: 60, overflow: 'ellipsize' as const },
        2: { cellWidth: 73, overflow: 'ellipsize' as const },
        3: { cellWidth: 28, halign: 'right' as const },
        4: { cellWidth: 28, halign: 'right' as const },
        5: { cellWidth: 28, halign: 'right' as const },
        6: { cellWidth: 38, halign: 'center' as const },
      }
    : {
        0: { cellWidth: 22 },
        1: { cellWidth: 105, overflow: 'ellipsize' as const },
        2: { cellWidth: 28 },
        3: { cellWidth: 28, halign: 'right' as const },
        4: { cellWidth: 28, halign: 'right' as const },
        5: { cellWidth: 28, halign: 'right' as const },
        6: { cellWidth: 38, halign: 'center' as const },
      };

  autoTable(doc, {
    startY: 22,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: 277,
    head,
    body,
    styles:     BASE,
    headStyles: { ...HEAD_S, minCellHeight: 10 },
    columnStyles,
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
      } else if (data.column.index === 6) {
        const txn = p.transactions[idx - 1];
        if (txn) {
          data.cell.styles.fillColor = txn.reconciledEntryId ? C_OK_BG : C_WARN_BG;
          data.cell.styles.textColor = txn.reconciledEntryId ? [21, 128, 61] as RGB : [180, 83, 9] as RGB;
          data.cell.styles.fontStyle = 'bold';
        }
      } else if (hasCB && data.column.index === 1 && idx > 0 && idx < TOTAL_IDX) {
        // Highlight unmatched CB Head cells
        if (!p.cbMatchRows![idx - 1]) {
          data.cell.styles.textColor = [148, 163, 184] as RGB;
        }
      }
    },
  });

  doc.save(`BankStatement_${p.bankLabel.replace(/\s+/g, '_')}_${p.financialYear}.pdf`);
}

// ── Excel export ──────────────────────────────────────────────────────────────

export function exportImportedBankStatementExcel(p: BankStmtExportParams) {
  const hasCB = !!p.cbMatchRows;

  const header = hasCB
    ? ['Date', 'CB Head', 'CB Notes', 'Debit (Dr)', 'Credit (Cr)', 'Balance', 'Reconciled']
    : ['Date', 'Narration', 'Cheque / Ref No', 'Debit (Dr)', 'Credit (Cr)', 'Balance', 'Reconciled'];

  const rows: (string | number)[][] = [
    header,
    [p.openingDateStr, 'Opening Balance', '', '', p.openingBalance, p.openingBalance, ''],
    ...p.transactions.map((txn, i) => {
      const cb   = hasCB ? p.cbMatchRows![i] : null;
      const col1 = hasCB ? (cb?.headOfAccount ?? '') : txn.narration;
      const col2 = hasCB ? (cb?.notes         ?? '') : txn.chequeNo;
      return [
        txn.date, col1, col2,
        txn.debit  > 0 ? txn.debit  : '',
        txn.credit > 0 ? txn.credit : '',
        txn.balance,
        txn.reconciledEntryId ? 'Matched' : 'Unmatched',
      ];
    }),
    [
      `${p.transactions.length} transactions`,
      '', '', p.totalDebit, p.totalCredit, p.closingBalance,
      `${p.transactions.filter(t => t.reconciledEntryId).length}/${p.transactions.length} matched`,
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = hasCB
    ? [{ wch: 14 }, { wch: 35 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
    : [{ wch: 14 }, { wch: 45 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bank Statement');
  XLSX.writeFile(wb, `BankStatement_${p.bankLabel.replace(/\s+/g, '_')}_${p.financialYear}.xlsx`);
}
