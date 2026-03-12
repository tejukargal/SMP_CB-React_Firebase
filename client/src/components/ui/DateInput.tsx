import { useState, useEffect } from 'react';
import { cn } from '@/utils/cn';

/** Convert ISO "YYYY-MM-DD" → display "DD/MM/YYYY" */
function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

/** Convert display "DD/MM/YYYY" or "DD/MM/YY" → ISO "YYYY-MM-DD", or '' if invalid */
function displayToISO(display: string): string {
  const parts = display.split('/');
  if (parts.length !== 3) return '';
  const [dd, mm, yyRaw] = parts;
  if (!dd || !mm || !yyRaw) return '';
  const year = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
  if (year.length !== 4) return '';
  const d = dd.padStart(2, '0');
  const mo = mm.padStart(2, '0');
  const date = new Date(`${year}-${mo}-${d}`);
  if (isNaN(date.getTime())) return '';
  return `${year}-${mo}-${d}`;
}

/** Auto-insert slashes as digits are typed: 01 → 01/ → 01/02 → 01/02/ → 01/02/2025 */
function formatInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
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

  // Sync display when external ISO value changes (e.g. form reset)
  useEffect(() => {
    setDisplay(isoToDisplay(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Allow only digits and slashes; handle backspace gracefully
    const formatted = formatInput(raw);
    setDisplay(formatted);

    const iso = displayToISO(formatted);
    onChange(iso); // '' if incomplete/invalid — caller validates on submit
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow: digits, backspace, delete, tab, arrows, home, end
    const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

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
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800',
          'placeholder:text-slate-400 tracking-wide',
          'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20',
          'disabled:bg-slate-50 disabled:text-slate-400',
          error && 'border-red-400 focus:border-red-400 focus:ring-red-400/20',
          className
        )}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
