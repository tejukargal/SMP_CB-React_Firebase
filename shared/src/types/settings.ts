import type { CashBookType } from './entry';

export interface Settings {
  activeFinancialYear: string;
  activeCashBookType: CashBookType;
  financialYears: string[];
}

export interface UpdateSettingsPayload {
  activeFinancialYear?: string;
  activeCashBookType?: CashBookType;
  financialYears?: string[];
}
