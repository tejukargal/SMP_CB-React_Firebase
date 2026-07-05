import { useSettings } from '@/context/SettingsContext';
import { usePendingBills } from '@/hooks/usePendingBills';
import { PendingBillForm } from '@/components/pendingBills/PendingBillForm';
import { RecentPendingBills } from '@/components/pendingBills/RecentPendingBills';

export function PendingBillsPage() {
  const { settings } = useSettings();
  const { bills, loading } = usePendingBills(
    settings.activeFinancialYear,
    settings.activeCashBookType
  );

  return (
    <div className="w-full pt-4 pb-6 space-y-4" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <PendingBillForm />
      <RecentPendingBills bills={bills} loading={loading} />
    </div>
  );
}
