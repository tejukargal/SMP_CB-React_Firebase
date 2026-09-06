import { useMemo, useState } from 'react';
import { useBudgetHeads } from '@/hooks/useBudgetHeads';
import { useToast } from '@/context/ToastContext';
import { apiUpsertBudgetHead, apiSetBudgetHeadActive } from '@/api/budgetHeads';
import { toProperCase } from '@smp-cashbook/shared';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { BudgetHead } from '@smp-cashbook/shared';

function HeadRow({ head }: { head: BudgetHead }) {
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const openEdit = () => {
    setInputVal(head.headName);
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);

  const handleSave = async () => {
    const trimmed = inputVal.trim();
    if (!trimmed) { addToast('Name cannot be empty', 'error'); return; }
    const formatted = toProperCase(trimmed);
    if (formatted === head.headName) { setEditing(false); return; }

    setSaving(true);
    try {
      await apiUpsertBudgetHead({ headName: formatted });
      addToast(`Renamed "${head.headName}" → "${formatted}"`, 'success');
      setEditing(false);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to rename budget head', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    setToggling(true);
    try {
      await apiSetBudgetHeadActive(head.id, !head.isActive);
      addToast(head.isActive ? `Deactivated "${head.headName}"` : `Reactivated "${head.headName}"`, 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to update budget head', 'error');
    } finally {
      setToggling(false);
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
            if (e.key === 'Enter') handleSave();
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
      <span className={`flex-1 min-w-0 text-sm truncate ${head.isActive ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
        {head.headName}
      </span>
      {!head.isActive && <Badge variant="neutral">Inactive</Badge>}
      <button
        onClick={openEdit}
        className="shrink-0 flex items-center gap-1 rounded-md border border-transparent px-2 py-1
          text-xs text-slate-400 opacity-0 group-hover:opacity-100 group-hover:border-slate-200
          hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all"
        title="Rename this budget head"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        Rename
      </button>
      <button
        onClick={handleToggleActive}
        disabled={toggling}
        className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
          head.isActive
            ? 'border-transparent text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:border-red-200 hover:bg-red-50'
            : 'border-green-200 text-green-700 hover:bg-green-50'
        }`}
      >
        {head.isActive ? 'Deactivate' : 'Reactivate'}
      </button>
    </div>
  );
}

export function ManageBudgetHeadsTab() {
  const { budgetHeads, loading } = useBudgetHeads();
  const { addToast } = useToast();
  const [newHeadName, setNewHeadName] = useState('');
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return budgetHeads
      .filter((h) => showInactive || h.isActive)
      .filter((h) => !q || h.headName.toLowerCase().includes(q));
  }, [budgetHeads, search, showInactive]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newHeadName.trim();
    if (!trimmed) return;

    setAdding(true);
    try {
      await apiUpsertBudgetHead({ headName: toProperCase(trimmed) });
      addToast(`Added budget head "${toProperCase(trimmed)}"`, 'success');
      setNewHeadName('');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to add budget head', 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex items-end gap-2">
        <Input
          label="Add Budget Head"
          id="new-budget-head"
          placeholder="E.g. Stationery"
          value={newHeadName}
          onChange={(e) => setNewHeadName(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" loading={adding} disabled={!newHeadName.trim()}>
          Add
        </Button>
      </form>

      {loading ? (
        <div className="space-y-1.5 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-slate-100" />)}
        </div>
      ) : budgetHeads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
          No budget heads yet — add one above to get started.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder={`Search ${budgetHeads.length} heads…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm
                  text-slate-700 placeholder-slate-400 focus:border-blue-300 focus:outline-none
                  focus:ring-1 focus:ring-blue-300"
              />
            </div>
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No heads match "{search}"</p>
            ) : (
              filtered.map((head) => <HeadRow key={head.id} head={head} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
