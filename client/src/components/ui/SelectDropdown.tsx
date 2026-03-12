import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';

interface SelectDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  className?: string;
}

export function SelectDropdown({
  value,
  onChange,
  options,
  placeholder = 'All',
  className,
}: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  return (
    <div ref={ref} className={cn('relative shrink-0', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:outline-none"
      >
        <span className="max-w-[140px] truncate">{selectedLabel}</span>
        <svg
          className={cn('h-3 w-3 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* List */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-max min-w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50',
                opt.value === value && 'font-medium text-slate-900'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
