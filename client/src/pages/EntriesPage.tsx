import { useEntries } from '@/hooks/useEntries';
import { useSettings } from '@/context/SettingsContext';
import { EntryList } from '@/components/entries/EntryList';

export function EntriesPage() {
  const { settings } = useSettings();
  const { entries, loading, refreshing, error } = useEntries(
    settings.activeFinancialYear,
    settings.activeCashBookType
  );

  return (
    <div className="w-full pb-6" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <EntryList entries={entries} loading={loading} refreshing={refreshing} error={error} />
    </div>
  );
}
