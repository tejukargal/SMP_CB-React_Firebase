import { useMemo, useState } from 'react';
import { useEntries } from '@/hooks/useEntries';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { apiRenameHead } from '@/api/entries';

// ── derive the cashBookTypes array to pass to the rename API ─────────────────
function toCashBookTypes(activeCashBookType: string): string[] {
  if (activeCashBookType === 'Both') return ['Aided', 'Un-Aided'];
  return [activeCashBookType];
}

// ── one editable row ─────────────────────────────────────────────────────────
function HeadRow({
  head,
  count,
  onRenamed,
  renaming,
  setRenaming,
}: {
  head:        string;
  count:       number;
  onRenamed:   (oldName: string, newName: string) => void;
  renaming:    string | null;   // head currently being saved
  setRenaming: (h: string | null) => void;
}) {
  const { settings } = useSettings();
  const { addToast }  = useToast();
  const [editing,  setEditing]  = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [saving,   setSaving]   = useState(false);

  const isAnyRenaming = renaming !== null;

  const openEdit = () => {
    setInputVal(head);
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);

  const handleSave = async () => {
    const trimmed = inputVal.trim();
    if (!trimmed) { addToast('Name cannot be empty', 'error'); return; }
    if (trimmed === head) { setEditing(false); return; }

    setSaving(true);
    setRenaming(head);
    try {
      const cashBookTypes = toCashBookTypes(settings.activeCashBookType);
      const result = await apiRenameHead(settings.activeFinancialYear, cashBookTypes, head, trimmed);
      addToast(
        result.updated > 0
          ? `Renamed "${head}" → "${trimmed}" (${result.updated} entries updated)`
          : `Renamed — no entries matched "${head}"`,
        'success',
      );
      onRenamed(head, trimmed);
      setEditing(false);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to rename head of account', 'error');
    } finally {
      setSaving(false);
      setRenaming(null);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 last:border-0 bg-blue-50/40">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter')  handleSave();
            if (e.key === 'Escape') cancelEdit();
          }}
          autoFocus
          className="flex-1 min-w-0 rounded-md border border-blue-300 px-2.5 py-1 text-sm
            text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white
            hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={cancelEdit}
          disabled={saving}
          className="shrink-0 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium
            text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 last:border-0
      hover:bg-slate-50 transition-colors group"
    >
      <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{head}</span>
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
        {count} {count === 1 ? 'entry' : 'entries'}
      </span>
      <button
        onClick={openEdit}
        disabled={isAnyRenaming}
        className="shrink-0 flex items-center gap-1 rounded-md border border-transparent px-2 py-1
          text-xs text-slate-400 opacity-0 group-hover:opacity-100 group-hover:border-slate-200
          hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50
          disabled:cursor-not-allowed disabled:opacity-30
          transition-all"
        title="Rename this head of account"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        Rename
      </button>
    </div>
  );
}

// ── main section ──────────────────────────────────────────────────────────────

export function HeadOfAccountSection() {
  const { settings } = useSettings();
  const { entries, loading } = useEntries(settings.activeFinancialYear, settings.activeCashBookType);

  // Track local renames so the list updates immediately without waiting for Firestore
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Build sorted unique heads with per-head entry counts (apply local renames)
  const heads = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const name = renames[e.headOfAccount] ?? e.headOfAccount;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([head, count]) => ({ head, count }));
  }, [entries, renames]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? heads.filter((h) => h.head.toLowerCase().includes(q)) : heads;
  }, [heads, search]);

  const handleRenamed = (oldName: string, newName: string) => {
    setRenames((prev) => {
      // Remap any existing renames that pointed to oldName
      const next: Record<string, string> = {};
      for (const [orig, mapped] of Object.entries(prev)) {
        next[orig] = mapped === oldName ? newName : mapped;
      }
      // Map the old name itself to the new name
      next[oldName] = newName;
      return next;
    });
  };

  const scopeLabel =
    settings.activeCashBookType === 'Both'
      ? 'Aided + Un-Aided'
      : settings.activeCashBookType;

  return (
    <div className="space-y-4">
      {/* Scope info */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 flex items-center gap-2">
        <svg className="h-3.5 w-3.5 shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-blue-700">
          Showing heads for{' '}
          <span className="font-semibold">{settings.activeFinancialYear}</span>
          {' · '}
          <span className="font-semibold">{scopeLabel}</span>.
          {' '}Renaming a head updates all matching entries in this scope.
        </p>
      </div>

      {loading ? (
        <div className="space-y-1.5 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : heads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
          No entries found for the active scope.
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={`Search ${heads.length} heads…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm
                text-slate-700 placeholder-slate-400 focus:border-blue-300 focus:outline-none
                focus:ring-1 focus:ring-blue-300"
            />
          </div>

          {/* List */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No heads match "{search}"</p>
            ) : (
              filtered.map(({ head, count }) => (
                <HeadRow
                  key={head}
                  head={head}
                  count={count}
                  onRenamed={handleRenamed}
                  renaming={renaming}
                  setRenaming={setRenaming}
                />
              ))
            )}
          </div>

          <p className="text-xs text-slate-400">
            {heads.length} unique head{heads.length !== 1 ? 's' : ''} · hover a row to rename
          </p>
        </>
      )}
    </div>
  );
}
