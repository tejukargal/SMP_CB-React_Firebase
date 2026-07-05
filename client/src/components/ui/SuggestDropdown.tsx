export function SuggestDropdown({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (v: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <ul className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
      {suggestions.map((s) => (
        <li key={s}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 truncate transition-colors"
          >
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}
