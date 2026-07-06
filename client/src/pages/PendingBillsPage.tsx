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
    <div className="w-full h-full pt-4 pb-2 flex flex-col gap-4" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="shrink-0">
        <PendingBillForm />
      </div>
      <div className="flex-1 min-h-0">
        <RecentPendingBills bills={bills} loading={loading} />
      </div>
    </div>
  );
}
