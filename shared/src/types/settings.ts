import type { CashBookType } from './entry';

/** 'Both' allows viewing all three cashbook types merged in a single read-only view. */
export type ActiveCashBookType = CashBookType | 'Both';

export interface Settings {
  activeFinancialYear: string;
  activeCashBookType: ActiveCashBookType;
  financialYears: string[];
}

export interface UpdateSettingsPayload {
  activeFinancialYear?: string;
  activeCashBookType?: ActiveCashBookType;
  financialYears?: string[];
}
