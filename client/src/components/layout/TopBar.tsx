import { Link } from 'react-router-dom';
import { useSettings } from '@/context/SettingsContext';
import { Badge } from '@/components/ui/Badge';

export function TopBar() {
  const { settings, loading } = useSettings();

  return (
    <div className="flex w-full items-center justify-between">
      <span className="text-sm font-medium text-slate-500">
        Sanjay Memorial Polytechnic
      </span>
      <Link
        to="/settings"
        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-slate-50"
        title="Open Settings"
      >
        {loading ? (
          <span className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        ) : (
          <>
            <Badge variant="blue">{settings.activeFinancialYear}</Badge>
            <Badge variant={settings.activeCashBookType === 'Aided' ? 'receipt' : 'payment'}>
              {settings.activeCashBookType}
            </Badge>
          </>
        )}
      </Link>
    </div>
  );
}
