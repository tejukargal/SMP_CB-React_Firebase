import type { CashBookType } from './entry';

/** 'Both' allows viewing Aided + Un-Aided entries merged in a single view. */
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
