import type { CashBookType } from './entry';

export type BillStatus = 'Pending' | 'Cleared';

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
  status: BillStatus;
  financialYear: string; // e.g. "2025-26"
  cashBookType: CashBookType;
  createdAt: string; // ISO timestamp
  clearedAt?: string; // ISO timestamp, set when status becomes Cleared
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
  status: BillStatus;
  financialYear: string;
  cashBookType: CashBookType;
}
