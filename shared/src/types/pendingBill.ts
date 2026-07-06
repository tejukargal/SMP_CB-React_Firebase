import type { CashBookType } from './entry';

export type BillStatus = 'Pending' | 'Approved' | 'Cleared';

export interface PendingBill {
  id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  bank: string;
  chqNoOrCash: string;
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
}

export interface PendingBillFormData {
  date: string;
  bank: string;
  chqNoOrCash: string;
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
  bank: string;
  chqNoOrCash: string;
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
  billIds: string[];
  totalAmount: number;
  count: number;
  financialYear: string;
  cashBookType: CashBookType;
  createdAt: string; // ISO timestamp
}

export interface CreateClearedBillBatchPayload {
  billIds: string[];
  date: string;
  financialYear: string;
  cashBookType: CashBookType;
}
