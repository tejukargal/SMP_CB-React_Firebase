import type { PaymentMode, PendingBill } from '@smp-cashbook/shared';

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  Cash: 'Cash',
  Cheque: 'Cheque',
  AcctPayeeCheque: 'A/c Payee Chq',
  NEFT: 'NEFT',
  Online: 'Online',
};

/** Human-readable payment summary for a bill: "Cheque #101", "NEFT #55", "Cash", or "—" pre-clearing. */
export function formatPaymentMode(bill: Pick<PendingBill, 'paymentMode' | 'paymentRefNo' | 'chqNoOrCash'>): string {
  if (bill.paymentMode) {
    const label = PAYMENT_MODE_LABEL[bill.paymentMode];
    return bill.paymentRefNo ? `${label} #${bill.paymentRefNo}` : label;
  }
  return bill.chqNoOrCash || '—';
}
