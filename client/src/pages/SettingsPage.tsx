import { SettingsPanel } from '@/components/settings/SettingsPanel';

export function SettingsPage() {
  return (
    <div className="pt-6">
      <h1 className="mb-6 text-sm font-semibold text-slate-700">Settings</h1>
      <SettingsPanel />
    </div>
  );
}
