import { useSettings } from '@/context/SettingsContext';
import { usePendingBills } from '@/hooks/usePendingBills';
import { PendingBillList } from '@/components/pendingBills/PendingBillList';

export function PendingBillsListPage() {
  const { settings } = useSettings();
  const { bills, loading, refreshing, error } = usePendingBills(
    settings.activeFinancialYear,
    settings.activeCashBookType
  );

  return (
    <div
      className="absolute inset-x-0 top-0 bottom-0 flex flex-col"
      style={{ animation: 'page-enter 0.22s ease-out' }}
    >
      <PendingBillList bills={bills} loading={loading} refreshing={refreshing} error={error} />
    </div>
  );
}
