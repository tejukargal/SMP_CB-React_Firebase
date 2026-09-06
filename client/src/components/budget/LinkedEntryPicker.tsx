import { useMemo, useState } from 'react';
import { formatCurrency } from '@/utils/formatCurrency';
import type { Entry } from '@smp-cashbook/shared';

interface LinkedEntryPickerProps {
  entries: Entry[]; // already filtered to Payment-only, active FY + cash-book-type
  selectedEntry: Entry | null;
  onSelect: (entry: Entry) => void;
  onClear: () => void;
}

export function LinkedEntryPicker({ entries, selectedEntry, onSelect, onClear }: LinkedEntryPickerProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = q
      ? entries.filter(
          (e) =>
            e.headOfAccount.toLowerCase().includes(q) ||
            e.notes.toLowerCase().includes(q) ||
            e.amount.toString().includes(q)
        )
      : entries;
    return pool.slice(0, 20);
  }, [entries, search]);

  if (selectedEntry) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l4-4a4 4 0 015.656 5.656l-1.5 1.5" />
        </svg>
        <span className="flex-1 min-w-0 truncate">
          {selectedEntry.date} · {selectedEntry.headOfAccount} · {formatCurrency(selectedEntry.amount)}
        </span>
        <button type="button" onClick={onClear} className="shrink-0 text-blue-500 hover:text-blue-700" title="Unlink">
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search Payment entries by head, notes or amount…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800
          placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      {open && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">No matching Payment entries</li>
          ) : (
            matches.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onSelect(entry); }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm
                    text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  <span className="truncate">{entry.date} · {entry.headOfAccount}</span>
                  <span className="shrink-0 font-medium">{formatCurrency(entry.amount)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
