export type CashBookType = 'Aided' | 'Un-Aided';
export type EntryType = 'Receipt' | 'Payment';

export interface Entry {
  id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  chequeNo: string;
  amount: number;
  headOfAccount: string;
  notes: string;
  type: EntryType;
  financialYear: string; // e.g. "2025-26"
  cashBookType: CashBookType;
  createdAt: string; // ISO timestamp
  voucherNo?: string; // Optional voucher number for Payment entries, e.g. "25-26_0001"
}

export interface EntryFormData {
  date: string;
  chequeNo: string;
  amount: string;
  headOfAccount: string;
  notes: string;
  type: EntryType;
}

export interface CreateEntryPayload {
  date: string;
  chequeNo: string;
  amount: number;
  headOfAccount: string;
  notes: string;
  type: EntryType;
  financialYear: string;
  cashBookType: CashBookType;
}
