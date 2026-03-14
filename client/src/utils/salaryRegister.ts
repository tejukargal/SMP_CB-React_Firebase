import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Entry } from '@smp-cashbook/shared';

// ── Canonical salary heads ────────────────────────────────────────────────────

export const RECEIPT_SALARY_HEADS = [
  'Govt Salary Grants',
  'I Tax',
  'P Tax',
  'Lic',
  'Gslic',
  'Fbf',
] as const;

export const PAYMENT_SALARY_HEADS = [
  'Govt Salary Acct',
  'I Tax',
  'P Tax',
  'Lic',
  'Gslic',
  'Fbf',
] as const;

// Short labels for table column headers
export const RECEIPT_LABELS: Record<string, string> = {
  'Govt Salary Grants': 'Govt Salary',
  'I Tax': 'I Tax',
  'P Tax': 'P Tax',
  'Lic':   'LIC',
  'Gslic': 'GSLIC',
  'Fbf':   'FBF',
};
export const PAYMENT_LABELS: Record<string, string> = {
  'Govt Salary Acct': 'Salary Acct',
  'I Tax': 'I Tax',
  'P Tax': 'P Tax',
  'Lic':   'LIC',
  'Gslic': 'GSLIC',
  'Fbf':   'FBF',
};

function canonicalHead(head: string, heads: readonly string[]): string | undefined {
  const lower = head.toLowerCase();
  return heads.find(h => h.toLowerCase() === lower);
}

export function canonicalReceiptSalaryHead(head: string): string | undefined {
  return canonicalHead(head, RECEIPT_SALARY_HEADS);
}

export function canonicalPaymentSalaryHead(head: string): string | undefined {
  return canonicalHead(head, PAYMENT_SALARY_HEADS);
}

export function isSalaryEntry(e: Entry): boolean {
  return e.type === 'Receipt'
    ? canonicalReceiptSalaryHead(e.headOfAccount) !== undefined
    : canonicalPaymentSalaryHead(e.headOfAccount) !== undefined;
}

// ── Month extraction from Notes + date ───────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Returns "YYYY-MM" representing the salary month this entry belongs to,
 *  derived first from the Notes field, then falling back to entry date. */
export function extractSalaryMonth(notes: string, entryDate: string): string {
  const lower = notes.toLowerCase();

  // Match longest month name first to avoid "mar" matching inside "march"
  const sortedKeys = Object.keys(MONTH_MAP).sort((a, b) => b.length - a.length);
  let foundMonth: number | null = null;
  for (const name of sortedKeys) {
    if (lower.includes(name)) { foundMonth = MONTH_MAP[name]; break; }
  }

  // 4-digit year
  let foundYear: number | null = null;
  const y4 = notes.match(/20(\d{2})/);
  if (y4) foundYear = 2000 + parseInt(y4[1]);

  // 2-digit year (e.g. "25" → 2025) only if no 4-digit year found
  if (!foundYear) {
    const y2 = notes.match(/\b(\d{2})\b/);
    if (y2) {
      const n = parseInt(y2[1]);
      if (n >= 20 && n <= 50) foundYear = 2000 + n;
    }
  }

  const [dYear, dMonth] = entryDate.split('-').map(Number);
  return `${foundYear ?? dYear}-${String(foundMonth ?? dMonth).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric',
  });
}

// ── Salary type detection ─────────────────────────────────────────────────────

export type SalaryType = 'Regular' | 'DA Arrears' | 'EL Encashment';

/** Infers salary type from the Notes field of an entry. */
export function extractSalaryType(notes: string): SalaryType {
  const lower = notes.toLowerCase();
  if (/\bel\b/.test(lower) || lower.includes('earned leave')) return 'EL Encashment';
  if (/\bda\b/.test(lower) || lower.includes('arrear'))       return 'DA Arrears';
  return 'Regular';
}

// ── Row type (used by PDF/Excel exports) ─────────────────────────────────────

export interface SalaryMonthRow {
  monthKey: string;
  receipts: Map<string, number>;
  payments: Map<string, number>;
  totalR:   number;
  totalP:   number;
  balance:  number;
}

// ── Group type (used by the two-column card view) ─────────────────────────────

export interface SalaryMonthGroup {
  monthKey:       string;
  salaryType:     SalaryType;
  receiptEntries: Entry[];
  paymentEntries: Entry[];
  totalR:         number;
  totalP:         number;
  balance:        number;
}

const SALARY_TYPE_ORDER: SalaryType[] = ['Regular', 'DA Arrears', 'EL Encashment'];

export function buildSalaryGroups(entries: Entry[]): SalaryMonthGroup[] {
  const map = new Map<string, { salaryType: SalaryType; monthKey: string; receipts: Entry[]; payments: Entry[] }>();

  for (const e of entries) {
    const head = e.type === 'Receipt'
      ? canonicalReceiptSalaryHead(e.headOfAccount)
      : canonicalPaymentSalaryHead(e.headOfAccount);
    if (!head) continue;

    const salaryType = extractSalaryType(e.notes ?? '');

    // Regular salary groups by calendar month; DA/EL group by type only
    // (their receipt and payment entries can have different month hints in notes)
    const key = salaryType === 'Regular'
      ? `${extractSalaryMonth(e.notes ?? '', e.date)}|Regular`
      : salaryType;

    const monthKey = salaryType === 'Regular'
      ? extractSalaryMonth(e.notes ?? '', e.date)
      : e.date.slice(0, 7); // use earliest entry date as display month

    if (!map.has(key)) map.set(key, { salaryType, monthKey, receipts: [], payments: [] });
    const bucket = map.get(key)!;
    // Keep the earliest date as the representative monthKey for DA/EL
    if (salaryType !== 'Regular' && e.date.slice(0, 7) < bucket.monthKey) {
      bucket.monthKey = e.date.slice(0, 7);
    }
    if (e.type === 'Receipt') bucket.receipts.push(e);
    else bucket.payments.push(e);
  }

  return Array.from(map.entries())
    .sort(([a, av], [b, bv]) => {
      // Regular groups sort by monthKey; DA/EL sort after all Regular by type order
      if (av.salaryType === 'Regular' && bv.salaryType === 'Regular')
        return av.monthKey.localeCompare(bv.monthKey);
      if (av.salaryType === 'Regular') return -1;
      if (bv.salaryType === 'Regular') return  1;
      return SALARY_TYPE_ORDER.indexOf(av.salaryType) - SALARY_TYPE_ORDER.indexOf(bv.salaryType);
    })
    .map(([, { salaryType, monthKey, receipts, payments }]) => {
      const sortedR = [...receipts].sort((a, b) => a.date.localeCompare(b.date));
      const sortedP = [...payments].sort((a, b) => a.date.localeCompare(b.date));
      const totalR  = sortedR.reduce((s, e) => s + e.amount, 0);
      const totalP  = sortedP.reduce((s, e) => s + e.amount, 0);
      return { monthKey, salaryType, receiptEntries: sortedR, paymentEntries: sortedP, totalR, totalP, balance: totalR - totalP };
    });
}

// ── Build rows ────────────────────────────────────────────────────────────────

export function buildSalaryRows(entries: Entry[]): SalaryMonthRow[] {
  const monthMap = new Map<string, {
    receipts: Map<string, number>;
    payments: Map<string, number>;
  }>();

  for (const e of entries) {
    const head = e.type === 'Receipt'
      ? canonicalReceiptSalaryHead(e.headOfAccount)
      : canonicalPaymentSalaryHead(e.headOfAccount);
    if (!head) continue;

    const key = extractSalaryMonth(e.notes ?? '', e.date);
    if (!monthMap.has(key)) monthMap.set(key, { receipts: new Map(), payments: new Map() });
    const bucket = monthMap.get(key)!;
    const side   = e.type === 'Receipt' ? bucket.receipts : bucket.payments;
    side.set(head, (side.get(head) ?? 0) + e.amount);
  }

  return Array.from(monthMap.keys()).sort().map(monthKey => {
    const { receipts, payments } = monthMap.get(monthKey)!;
    const totalR = RECEIPT_SALARY_HEADS.reduce((s, h) => s + (receipts.get(h) ?? 0), 0);
    const totalP = PAYMENT_SALARY_HEADS.reduce((s, h) => s + (payments.get(h) ?? 0), 0);
    return { monthKey, receipts, payments, totalR, totalP, balance: totalR - totalP };
  });
}

// ── PDF export ────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const C_WHITE:   RGB = [255, 255, 255];
const C_HEAD_R:  RGB = [22,  101, 52 ];   // green-800
const C_HEAD_P:  RGB = [153, 27,  27 ];   // red-800
const C_SUB:     RGB = [60,  60,  60 ];
const C_TOTAL:   RGB = [229, 231, 235];
const C_BLACK:   RGB = [0,   0,   0  ];
const MARGIN = 8;

export interface SalaryRegisterMeta {
  financialYear: string;
  cashBookType:  string;
  dateFrom?:     string;
  dateTo?:       string;
}

function fmt(v: number) { return v === 0 ? '' : v.toFixed(2); }

export function exportSalaryRegisterPDF(rows: SalaryMonthRow[], meta: SalaryRegisterMeta) {
  const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PAGE_W  = 297;
  const PAGE_CX = PAGE_W / 2;

  // ── Title block ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Salary Register', PAGE_CX, 12, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`SMP Cash Book  ·  ${meta.cashBookType}  ·  FY: ${meta.financialYear}`, PAGE_CX, 19, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, PAGE_W - MARGIN, 19, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // ── Column widths (277mm usable) ──
  // Month(22) + 6 receipt(15ea=90) + TotalR(18) + 7 payment(14ea=98) + TotalP(18) + Balance(20) = 266
  const RH = RECEIPT_SALARY_HEADS as readonly string[];
  const PH = PAYMENT_SALARY_HEADS as readonly string[];

  const colW = {
    month:   22,
    receipt: 15,
    totalR:  18,
    payment: 14,
    totalP:  18,
    balance: 20,
  };

  // Sub-header: 2 rows
  const rLabels = RH.map(h => RECEIPT_LABELS[h]);
  const pLabels = PH.map(h => PAYMENT_LABELS[h]);

  // Body data
  const body = rows.map(row => [
    monthLabel(row.monthKey),
    ...RH.map(h => fmt(row.receipts.get(h) ?? 0)),
    row.totalR.toFixed(2),
    ...PH.map(h => fmt(row.payments.get(h) ?? 0)),
    row.totalP.toFixed(2),
    row.balance.toFixed(2),
  ]);

  // Grand totals row
  const gR = RH.map(h => rows.reduce((s, r) => s + (r.receipts.get(h) ?? 0), 0));
  const gP = PH.map(h => rows.reduce((s, r) => s + (r.payments.get(h) ?? 0), 0));
  const gTR = rows.reduce((s, r) => s + r.totalR, 0);
  const gTP = rows.reduce((s, r) => s + r.totalP, 0);
  const gBal = gTR - gTP;
  body.push(['Total', ...gR.map(v => v.toFixed(2)), gTR.toFixed(2), ...gP.map(v => v.toFixed(2)), gTP.toFixed(2), gBal.toFixed(2)]);

  // Column styles
  const colStyles: Record<number, object> = {
    0:  { cellWidth: colW.month, fontStyle: 'bold' as const },
    [1 + RH.length]: { cellWidth: colW.totalR, fontStyle: 'bold' as const, halign: 'right' as const },
    [1 + RH.length + 1 + PH.length]: { cellWidth: colW.totalP, fontStyle: 'bold' as const, halign: 'right' as const },
    [1 + RH.length + 1 + PH.length + 1]: { cellWidth: colW.balance, fontStyle: 'bold' as const, halign: 'right' as const },
  };
  RH.forEach((_, i) => { colStyles[i + 1] = { cellWidth: colW.receipt, halign: 'right' as const }; });
  PH.forEach((_, i) => { colStyles[i + 1 + RH.length + 1] = { cellWidth: colW.payment, halign: 'right' as const }; });

  autoTable(doc, {
    startY: 24,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: 281,
    head: [
      // Row 1: group labels
      [
        { content: 'Month', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: C_SUB, textColor: C_WHITE } },
        { content: 'Receipts', colSpan: RH.length + 1, styles: { halign: 'center', fillColor: C_HEAD_R, textColor: C_WHITE } },
        { content: 'Payments', colSpan: PH.length + 1, styles: { halign: 'center', fillColor: C_HEAD_P, textColor: C_WHITE } },
        { content: 'Balance', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: C_SUB, textColor: C_WHITE } },
      ],
      // Row 2: individual head labels
      [
        ...rLabels.map(l => ({ content: l, styles: { fillColor: C_HEAD_R, textColor: C_WHITE, halign: 'right' as const } })),
        { content: 'Total', styles: { fillColor: C_HEAD_R, textColor: C_WHITE, halign: 'right' as const, fontStyle: 'bold' as const } },
        ...pLabels.map(l => ({ content: l, styles: { fillColor: C_HEAD_P, textColor: C_WHITE, halign: 'right' as const } })),
        { content: 'Total', styles: { fillColor: C_HEAD_P, textColor: C_WHITE, halign: 'right' as const, fontStyle: 'bold' as const } },
      ],
    ],
    body,
    styles: { fontSize: 6.5, cellPadding: 1.6, lineColor: C_BLACK, lineWidth: 0.1, minCellHeight: 5.5 },
    columnStyles: colStyles,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      data.cell.styles.fillColor = C_WHITE;
      if (data.row.index === rows.length) {
        data.cell.styles.fillColor = C_TOTAL;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save(`salary-register-${meta.financialYear.replace('/', '-')}.pdf`);
}

// ── Excel export ──────────────────────────────────────────────────────────────

export function exportSalaryRegisterExcel(rows: SalaryMonthRow[], meta: SalaryRegisterMeta) {
  const RH = RECEIPT_SALARY_HEADS as readonly string[];
  const PH = PAYMENT_SALARY_HEADS as readonly string[];

  const sheetRows: (string | number)[][] = [
    [`Salary Register — ${meta.cashBookType}`],
    [`Financial Year: ${meta.financialYear}`],
    [],
    [
      'Month',
      ...RH.map(h => RECEIPT_LABELS[h]), 'Total Receipts',
      ...PH.map(h => PAYMENT_LABELS[h]), 'Total Payments',
      'Balance',
    ],
    ...rows.map(row => [
      monthLabel(row.monthKey),
      ...RH.map(h => row.receipts.get(h) ?? 0),
      row.totalR,
      ...PH.map(h => row.payments.get(h) ?? 0),
      row.totalP,
      row.balance,
    ]),
    [],
    [
      'Grand Total',
      ...RH.map(h => rows.reduce((s, r) => s + (r.receipts.get(h) ?? 0), 0)),
      rows.reduce((s, r) => s + r.totalR, 0),
      ...PH.map(h => rows.reduce((s, r) => s + (r.payments.get(h) ?? 0), 0)),
      rows.reduce((s, r) => s + r.totalP, 0),
      rows.reduce((s, r) => s + r.balance, 0),
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  ws['!cols'] = [
    { wch: 16 },
    ...RH.map(() => ({ wch: 12 })), { wch: 14 },
    ...PH.map(() => ({ wch: 12 })), { wch: 14 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Salary Register');
  XLSX.writeFile(wb, `salary-register-${meta.financialYear.replace('/', '-')}.xlsx`);
}
