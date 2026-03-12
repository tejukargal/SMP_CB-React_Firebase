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
    <div className="w-full animate-fade-in pb-6">
      <EntryList entries={entries} loading={loading} refreshing={refreshing} error={error} />
    </div>
  );
}
