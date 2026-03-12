import { memo, useState } from 'react';
import { EntryDetailModal } from './EntryDetailModal';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import type { Entry } from '@smp-cashbook/shared';

interface EntryRowProps {
  entry: Entry;
  compact?: boolean;
}

export const EntryRow = memo(function EntryRow({ entry, compact = false }: EntryRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <tr
        onClick={() => setDetailOpen(true)}
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
      >
        {/* Date — fixed 90px, no wrap */}
        <td className="w-[90px] min-w-[90px] py-2.5 pl-4 pr-2 text-xs text-slate-600 whitespace-nowrap">
          {formatDate(entry.date)}
        </td>

        {/* Type badge (non-compact only) — fixed 76px */}
        {!compact && (
          <td className="w-[76px] min-w-[76px] px-2 py-2.5 whitespace-nowrap">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              entry.type === 'Receipt' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {entry.type}
            </span>
          </td>
        )}

        {/* Head of Account — fills remaining space, truncated, no wrap */}
        <td className="px-2 py-2.5 text-sm text-slate-800 whitespace-nowrap overflow-hidden max-w-0">
          <span className="block truncate">{entry.headOfAccount}</span>
        </td>

        {/* Cheque No — fixed 100px, no wrap */}
        <td className="w-[100px] min-w-[100px] px-2 py-2.5 text-xs text-slate-500 whitespace-nowrap">
          {entry.chequeNo || '—'}
        </td>

        {/* Notes — flexible, truncated, non-compact only */}
        {!compact && (
          <td className="px-2 py-2.5 text-xs text-slate-400 whitespace-nowrap overflow-hidden max-w-0">
            <span className="block truncate">{entry.notes || '—'}</span>
          </td>
        )}

        {/* Amount — fixed 120px, right-aligned, no wrap */}
        <td className="w-[120px] min-w-[120px] pl-2 pr-4 py-2.5 text-sm font-medium text-right whitespace-nowrap">
          <span className={entry.type === 'Receipt' ? 'text-green-700' : 'text-red-700'}>
            {formatCurrency(entry.amount)}
          </span>
        </td>
      </tr>

      {detailOpen && (
        <EntryDetailModal entry={entry} onClose={() => setDetailOpen(false)} />
      )}
    </>
  );
});
