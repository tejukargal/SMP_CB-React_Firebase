import { useState, useEffect } from 'react';
import { cn } from '@/utils/cn';

/** Convert ISO "YYYY-MM-DD" → display "DD/MM/YYYY" */
function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

/** Convert display "DD/MM/YYYY" → ISO "YYYY-MM-DD", or null if invalid */
function parseDMY(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = parseInt(dd, 10), mo = parseInt(mm, 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  const dt = new Date(iso);
  if (isNaN(dt.getTime()) || dt.getDate() !== d || dt.getMonth() + 1 !== mo) return null;
  return iso;
}

interface DateInputProps {
  /** ISO string "YYYY-MM-DD" */
  value: string;
  /** Called with ISO string when a valid date is entered, or '' when cleared */
  onChange: (iso: string) => void;
  label?: string;
  id?: string;
  error?: string;
  className?: string;
}

export function DateInput({ value, onChange, label, id, error, className }: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  const [localError, setLocalError] = useState('');

  // Sync display when external ISO value changes (e.g. form reset)
  useEffect(() => {
    setDisplay(isoToDisplay(value));
    setLocalError('');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplay(e.target.value);
    setLocalError('');
  };

  const handleBlur = () => {
    const trimmed = display.trim();
    if (!trimmed) { onChange(''); return; }
    const iso = parseDMY(trimmed);
    if (!iso) {
      setLocalError('Use dd/mm/yyyy');
      onChange('');
    } else {
      setLocalError('');
      onChange(iso);
    }
  };

  const shownError = error || localError;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-slate-600">
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800',
          'placeholder:text-slate-400 tracking-wide',
          'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20',
          'disabled:bg-slate-50 disabled:text-slate-400',
          shownError && 'border-red-400 focus:border-red-400 focus:ring-red-400/20',
          className
        )}
      />
      {shownError && <p className="text-xs text-red-600">{shownError}</p>}
    </div>
  );
}
