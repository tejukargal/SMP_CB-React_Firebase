export function EntrySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      {/* Header row */}
      <div className="flex gap-2 border-b border-slate-100 bg-white px-4 py-2">
        <div className="h-3 w-14 rounded bg-slate-200" />
        <div className="h-3 flex-1 rounded bg-slate-200" />
        <div className="h-3 w-16 rounded bg-slate-200" />
        <div className="h-3 w-16 rounded bg-slate-200" />
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 border-b border-slate-50 px-4 py-2.5"
          style={{ opacity: 1 - i * 0.12 }}
        >
          <div className="h-3.5 w-[72px] shrink-0 rounded bg-slate-100" />
          <div className="h-3.5 flex-1 rounded bg-slate-100" />
          <div className="h-3.5 w-[80px] shrink-0 rounded bg-slate-100" />
          <div className="h-3.5 w-[90px] shrink-0 rounded bg-slate-100" />
          <div className="h-3.5 w-5 shrink-0 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
