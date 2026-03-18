import { memo, useState, useEffect, useRef } from 'react';
import { EntryDetailModal } from './EntryDetailModal';
import { VoucherModal } from './VoucherModal';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { useSettings } from '@/context/SettingsContext';
import type { Entry } from '@smp-cashbook/shared';

interface EntryRowProps {
  entry:        Entry;
  compact?:     boolean;
  colorAmount?: boolean;
  allEntries?:  Entry[];
  // bulk-select
  selectMode?:  boolean;
  selected?:    boolean;
  onToggle?:    (id: string) => void;
}

export const EntryRow = memo(function EntryRow({
  entry,
  compact     = false,
  colorAmount = true,
  allEntries  = [],
  selectMode  = false,
  selected    = false,
  onToggle,
}: EntryRowProps) {
  const [detailOpen,  setDetailOpen]  = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [menu,        setMenu]        = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  const showCashBookBadge = settings.activeCashBookType === 'Both';

  // Close context menu on Escape
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (selectMode) return;
    if (entry.type !== 'Payment') return;
    e.preventDefault();
    const menuW = 192;
    const menuH = 44;
    const x = Math.min(e.clientX, window.innerWidth  - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
    setMenu({ x, y });
  };

  return (
    <>
      <tr
        onClick={selectMode ? () => onToggle?.(entry.id) : undefined}
        onDoubleClick={!selectMode ? () => setDetailOpen(true) : undefined}
        onContextMenu={handleContextMenu}
        className={`border-b border-slate-100 transition-colors cursor-pointer
          ${selectMode
            ? selected
              ? 'bg-blue-50 hover:bg-blue-100'
              : 'hover:bg-slate-50'
            : 'hover:bg-slate-50'
          }`}
      >
        {/* Checkbox (select mode only) */}
        {selectMode && (
          <td className="w-[36px] min-w-[36px] pl-3 pr-1 py-2.5">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle?.(entry.id)}
              onClick={e => e.stopPropagation()}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer
                focus:ring-1 focus:ring-blue-400"
            />
          </td>
        )}

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
            {showCashBookBadge && (
              <span className={`mt-0.5 flex rounded px-1.5 py-0.5 text-[10px] font-semibold w-fit ${
                entry.cashBookType === 'Aided'
                  ? 'bg-teal-50 text-teal-600'
                  : 'bg-orange-50 text-orange-600'
              }`}>
                {entry.cashBookType === 'Aided' ? 'Aided' : 'Un-Aided'}
              </span>
            )}
          </td>
        )}

        {/* Head of Account — fills remaining space, truncated, no wrap */}
        <td className="px-2 py-2.5 text-sm text-slate-800 whitespace-nowrap overflow-hidden max-w-0">
          <span className="block truncate">{entry.headOfAccount}</span>
          {compact && showCashBookBadge && (
            <span className={`mt-0.5 inline-flex rounded px-1.5 py-0 text-[10px] font-semibold leading-4 ${
              entry.cashBookType === 'Aided'
                ? 'bg-teal-50 text-teal-600'
                : 'bg-orange-50 text-orange-600'
            }`}>
              {entry.cashBookType === 'Aided' ? 'Aided' : 'Un-Aided'}
            </span>
          )}
        </td>

        {/* Cheque No + optional Voucher No badge — fixed 100px */}
        <td className="w-[100px] min-w-[100px] px-2 py-2.5">
          <div className="text-xs text-slate-500 whitespace-nowrap">{entry.chequeNo || '—'}</div>
          {compact && entry.type === 'Payment' && entry.voucherNo && (
            <div className="mt-0.5 text-[10px] font-mono font-semibold text-amber-600 whitespace-nowrap leading-tight">
              Vr No: {entry.voucherNo}
            </div>
          )}
        </td>

        {/* Notes — flexible, truncated, non-compact only */}
        {!compact && (
          <td className="px-2 py-2.5 text-xs text-slate-400 whitespace-nowrap overflow-hidden max-w-0">
            <span className="block truncate" title={entry.notes || undefined}>{entry.notes || '—'}</span>
            {entry.type === 'Payment' && entry.voucherNo && (
              <span className="block truncate font-mono font-semibold text-amber-600 text-[10px] leading-tight mt-0.5">
                Vr No: {entry.voucherNo}
              </span>
            )}
          </td>
        )}

        {/* Amount — fixed 120px, right-aligned, no wrap */}
        <td className="w-[120px] min-w-[120px] pl-2 pr-4 py-2.5 text-sm font-medium text-right whitespace-nowrap">
          <span className={colorAmount ? (entry.type === 'Receipt' ? 'text-green-700' : 'text-red-700') : 'text-slate-900'}>
            {formatCurrency(entry.amount)}
          </span>
        </td>
      </tr>

      {/* ── Right-click context menu (Payment entries only) ───────────────────── */}
      {menu && (
        <>
          <tr style={{ display: 'none' }} />
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            ref={menuRef}
            className="fixed z-50 min-w-[12rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
            style={{ top: menu.y, left: menu.x }}
          >
            <button
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-slate-700
                hover:bg-amber-50 hover:text-amber-700 transition-colors"
              onClick={() => { setMenu(null); setVoucherOpen(true); }}
            >
              <svg className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              {entry.voucherNo ? 'Update Voucher No' : 'Assign Voucher No'}
            </button>
          </div>
        </>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {detailOpen && (
        <EntryDetailModal entry={entry} onClose={() => setDetailOpen(false)} />
      )}
      {voucherOpen && (
        <VoucherModal
          entry={entry}
          allEntries={allEntries}
          onClose={() => setVoucherOpen(false)}
        />
      )}
    </>
  );
});
