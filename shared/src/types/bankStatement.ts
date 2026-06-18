export type BankKey = 'sbi_ppl' | 'can_bank_pd' | 'can_bank_scholar';

export interface BankStatementTxn {
  id: string;
  bankKey: BankKey;
  financialYear: string;
  date: string;               // ISO "YYYY-MM-DD"
  narration: string;
  chequeNo: string;
  debit: number;              // Withdrawal / Dr
  credit: number;             // Deposit / Cr
  balance: number;            // Running balance after this row (as imported)
  seq: number;                // Original row order within the imported file
  reconciledEntryId: string;  // "" if unreconciled; Cash Book entry ID if matched
  importedAt: string;         // ISO timestamp
  importedBy: string;         // Firebase UID
}

export interface ImportBankStatementPayload {
  financialYear: string;
  bankKey: BankKey;
  transactions: Omit<BankStatementTxn, 'id' | 'importedAt' | 'importedBy'>[];
}
