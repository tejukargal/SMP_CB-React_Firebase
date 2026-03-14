import { SettingsPanel } from '@/components/settings/SettingsPanel';

export function SettingsPage() {
  return (
    <div className="pb-10 animate-fade-in">
      <div className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-base font-semibold text-slate-800">Settings</h1>
        <p className="mt-0.5 text-xs text-slate-400">Manage your cash book configuration, data, and tools.</p>
      </div>
      <SettingsPanel />
    </div>
  );
}
