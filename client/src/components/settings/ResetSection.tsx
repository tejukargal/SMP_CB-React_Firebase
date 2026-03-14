import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { apiResetEntries } from '@/api/entries';

const PASSKEY = 'teju2015';

type Stage = 'idle' | 'confirm' | 'passkey' | 'resetting';

export function ResetSection() {
  const { settings } = useSettings();
  const { addToast } = useToast();
  const [stage, setStage] = useState<Stage>('idle');
  const [key, setKey] = useState('');
  const [keyError, setKeyError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const fy = settings.activeFinancialYear;
  const bookType = settings.activeCashBookType;

  const openConfirm = () => {
    setStage('confirm');
    setKey('');
    setKeyError('');
  };

  const goPasskey = () => {
    setStage('passkey');
    setKey('');
    setKeyError('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancel = () => {
    setStage('idle');
    setKey('');
    setKeyError('');
  };

  const handleReset = async () => {
    if (key !== PASSKEY) {
      setKeyError('Incorrect passkey. Try again.');
      setKey('');
      inputRef.current?.focus();
      return;
    }
    setStage('resetting');
    try {
      const result = await apiResetEntries(fy, bookType);
      addToast(
        result.deleted > 0
          ? `Deleted ${result.deleted} entries for ${fy}`
          : `No entries found for ${fy}`,
        'success'
      );
      setStage('idle');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Reset failed', 'error');
      setStage('passkey');
    }
  };

  return (
    <div>

      {/* ── Idle ── */}
      {stage === 'idle' && (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-slate-400">Financial Year</p>
              <p className="text-sm font-semibold text-slate-700">{fy}</p>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <p className="text-xs text-slate-400">Cash Book</p>
              <p className="text-sm font-semibold text-slate-700">{bookType}</p>
            </div>
          </div>
          <button
            onClick={openConfirm}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Reset
          </button>
        </div>
      )}

      {/* ── Step 1: Warning ── */}
      {stage === 'confirm' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-4 animate-fade-in">
          <div className="flex gap-3">
            <div className="mt-0.5 shrink-0">
              <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-red-800">
                This will permanently delete all transactions for {fy} — {bookType}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-red-700 list-disc list-inside">
                <li>All Receipt entries for the <span className="font-semibold">{bookType}</span> cash book ({fy}) will be erased</li>
                <li>All Payment entries for the <span className="font-semibold">{bookType}</span> cash book ({fy}) will be erased</li>
                <li>Other cash book types are <span className="font-semibold">not affected</span></li>
                <li>This action <span className="font-semibold">cannot be undone</span></li>
              </ul>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="secondary" onClick={cancel}>Cancel</Button>
            <Button size="sm" variant="danger" onClick={goPasskey}>
              I understand, continue
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Passkey ── */}
      {(stage === 'passkey' || stage === 'resetting') && (
        <div className="rounded-lg border border-red-200 bg-white p-4 space-y-3 animate-fade-in">
          <p className="text-xs font-medium text-slate-700">
            Enter the passkey to confirm reset for{' '}
            <span className="font-semibold text-red-700">{fy} — {bookType}</span>
          </p>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <input
                ref={inputRef}
                type="password"
                placeholder="Passkey"
                value={key}
                onChange={(e) => { setKey(e.target.value); setKeyError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleReset()}
                disabled={stage === 'resetting'}
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20 disabled:opacity-50"
              />
              {keyError && (
                <p className="mt-1 text-xs text-red-600">{keyError}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="danger"
              onClick={handleReset}
              loading={stage === 'resetting'}
              disabled={!key}
            >
              Reset
            </Button>
            <Button size="sm" variant="secondary" onClick={cancel} disabled={stage === 'resetting'}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
