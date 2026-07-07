import type { CashBookType } from './entry';

export type BillStatus = 'Pending' | 'Approved' | 'Cleared';

export type PaymentMode = 'Cash' | 'Cheque' | 'AcctPayeeCheque' | 'NEFT' | 'Online';

export type ClearingGroup = 'Cash' | 'NonCash';

export interface PaymentLine {
  mode: PaymentMode;
  bank: string; // blank for Cash
  refNo: string; // blank for Cash
  billIds: string[];
  amount: number;
}

export interface PendingBill {
  id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  bank: string; // set only when the bill is cleared
  /** @deprecated legacy free-text field entered at creation time, no longer written; kept for display fallback on old docs */
  chqNoOrCash?: string;
  amount: number;
  headOfAccount: string;
  firmName: string;
  billNumber: string;
  billDate: string; // ISO date string "YYYY-MM-DD"
  particulars: string;
  remarks: string;
  status: BillStatus;
  financialYear: string; // e.g. "2025-26"
  cashBookType: CashBookType;
  createdAt: string; // ISO timestamp
  approvedAt?: string; // ISO timestamp, set when status becomes Approved
  clearedAt?: string; // ISO timestamp/date, set when status becomes Cleared
  clearedBatchId?: string; // links to the ClearedBillBatch this bill was cleared as part of
  paymentMode?: PaymentMode; // set when the bill is cleared
  paymentRefNo?: string; // cheque/NEFT/online reference, set when the bill is cleared
}

export interface PendingBillFormData {
  date: string;
  amount: string;
  headOfAccount: string;
  firmName: string;
  billNumber: string;
  billDate: string;
  particulars: string;
  remarks: string;
}

export interface CreatePendingBillPayload {
  date: string;
  amount: number;
  headOfAccount: string;
  firmName: string;
  billNumber: string;
  billDate: string;
  particulars: string;
  remarks: string;
  status: BillStatus;
  financialYear: string;
  cashBookType: CashBookType;
}

export interface ClearedBillBatch {
  id: string;
  date: string; // ISO date string "YYYY-MM-DD" — the clearance date chosen by the user
  group: ClearingGroup;
  paymentLines: PaymentLine[];
  billIds: string[]; // flattened union of all paymentLines' billIds
  totalAmount: number;
  count: number;
  financialYear: string;
  cashBookType: CashBookType;
  createdAt: string; // ISO timestamp
}

export interface CreateClearedBillBatchPayload {
  group: ClearingGroup;
  paymentLines: { mode: PaymentMode; bank: string; refNo: string; billIds: string[] }[];
  date: string;
  financialYear: string;
  cashBookType: CashBookType;
}
