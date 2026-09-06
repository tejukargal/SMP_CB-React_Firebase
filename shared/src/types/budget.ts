import type { CashBookType } from './entry';

export interface BudgetHead {
  id: string; // slug of headName, doubles as the Firestore doc id
  headName: string;
  isActive: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface UpsertBudgetHeadPayload {
  headName: string;
}

export interface BudgetAllocation {
  id: string; // == headId, one allocation doc per head per FY per cashBookType
  headId: string;
  headName: string; // denormalized snapshot at allocation time
  allocatedAmount: number;
  financialYear: string; // e.g. "2025-26"
  cashBookType: CashBookType; // concrete type only, never 'Both'
  updatedAt: string; // ISO timestamp
}

export interface UpsertBudgetAllocationPayload {
  headId: string;
  allocatedAmount: number;
  financialYear: string;
  cashBookType: CashBookType;
}

export interface BudgetExpense {
  id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  headId: string;
  headName: string; // denormalized snapshot at expense time
  amount: number;
  notes: string;
  financialYear: string;
  cashBookType: CashBookType;
  linkedEntryId?: string; // optional id of a Payment Entry in entries/{fy}/{cbt}/{id}
  createdAt: string; // ISO timestamp
}

export interface BudgetExpenseFormData {
  date: string;
  headId: string;
  amount: string;
  notes: string;
  linkedEntryId?: string;
}

export interface CreateBudgetExpensePayload {
  date: string;
  headId: string;
  amount: number;
  notes: string;
  financialYear: string;
  cashBookType: CashBookType;
  linkedEntryId?: string;
}

export interface UpdateBudgetExpenseFields {
  date?: string;
  headId?: string;
  amount?: number;
  notes?: string;
  linkedEntryId?: string; // '' clears the link
}

export type BudgetStatus = 'on-track' | 'near-limit' | 'exceeded';

export interface BudgetHeadSummary {
  headId: string;
  headName: string;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number; // allocatedAmount - spentAmount, can be negative
  percentUsed: number; // spentAmount / allocatedAmount * 100 (0 if allocatedAmount is 0)
  status: BudgetStatus;
  financialYear: string;
  cashBookType: CashBookType;
}
