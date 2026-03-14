import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { apiImportEntries } from '@/api/entries';
import {
  parseImportFile,
  buildImportSummary,
  type ParsedRow,
  type ParseError,
  type ImportSummaryRow,
} from '@/utils/parseImportFile';

type Stage = 'idle' | 'parsing' | 'preview' | 'importing' | 'done';

interface ParseState {
  valid: ParsedRow[];
  errors: ParseError[];
  summary: ImportSummaryRow[];
  fileName: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DropZone({ onFile, disabled }: { onFile: (f: File) => void; disabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['xlsx', 'xls', 'csv'].includes(ext)) return;
    onFile(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) accept(f); }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`
        flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
        px-6 py-10 text-center transition-colors cursor-pointer select-none
        ${dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'}
        ${disabled ? 'pointer-events-none opacity-50' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(f); e.target.value = ''; }}
      />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200">
        <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700">Drop your Excel file here</p>
        <p className="mt-0.5 text-xs text-slate-400">or click to browse &nbsp;·&nbsp; .xlsx · .xls · .csv</p>
      </div>
    </div>
  );
}

function SummaryTable({ summary }: { summary: ImportSummaryRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Financial Year</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Cash Book Type</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-green-600">Receipts</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-red-600">Payments</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Total</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((row) => (
            <tr key={`${row.financialYear}-${row.cashBookType}`} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2.5 font-medium text-slate-700">{row.financialYear}</td>
              <td className="px-4 py-2.5 text-slate-600">{row.cashBookType}</td>
              <td className="px-4 py-2.5 text-right text-green-700 font-medium">{row.receipts}</td>
              <td className="px-4 py-2.5 text-right text-red-700 font-medium">{row.payments}</td>
              <td className="px-4 py-2.5 text-right text-slate-700 font-semibold">{row.total}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 bg-slate-50">
            <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-slate-600">Total</td>
            <td className="px-4 py-2.5 text-right text-xs font-semibold text-green-700">
              {summary.reduce((s, r) => s + r.receipts, 0)}
            </td>
            <td className="px-4 py-2.5 text-right text-xs font-semibold text-red-700">
              {summary.reduce((s, r) => s + r.payments, 0)}
            </td>
            <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-700">
              {summary.reduce((s, r) => s + r.total, 0)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ErrorList({ errors }: { errors: ParseError[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? errors : errors.slice(0, 5);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-xs font-semibold text-amber-700">
            {errors.length} row{errors.length !== 1 ? 's' : ''} will be skipped (invalid data)
          </span>
        </div>
      </div>
      <div className="divide-y divide-amber-100">
        {shown.map((err) => (
          <div key={err.row} className="px-4 py-2.5">
            <span className="text-xs font-medium text-amber-800">Row {err.row}: </span>
            <span className="text-xs text-amber-700">{err.reasons.join(' · ')}</span>
          </div>
        ))}
      </div>
      {errors.length > 5 && (
        <button
          onClick={() => setExpanded((x) => !x)}
          className="w-full px-4 py-2 text-xs text-amber-600 hover:text-amber-800 border-t border-amber-200 transition-colors"
        >
          {expanded ? 'Show less' : `Show ${errors.length - 5} more rows…`}
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ImportSection() {
  const { addToast } = useToast();
  const [stage, setStage] = useState<Stage>('idle');
  const [parseState, setParseState] = useState<ParseState | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; failed: number } | null>(null);

  const handleFile = async (file: File) => {
    setStage('parsing');
    setParseError(null);
    setParseState(null);
    try {
      const { valid, errors } = await parseImportFile(file);
      const summary = buildImportSummary(valid);
      setParseState({ valid, errors, summary, fileName: file.name });
      setStage('preview');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
      setStage('idle');
    }
  };

  const handleImport = async () => {
    if (!parseState || parseState.valid.length === 0) return;
    setStage('importing');
    try {
      const result = await apiImportEntries(parseState.valid.map((r) => r.entry));
      setImportResult(result);
      setStage('done');
      addToast(`Successfully imported ${result.imported} entries`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Import failed', 'error');
      setStage('preview');
    }
  };

  const reset = () => {
    setStage('idle');
    setParseState(null);
    setParseError(null);
    setImportResult(null);
  };

  return (
    <div>
      {stage !== 'idle' && stage !== 'parsing' && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={reset}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Start over
          </button>
        </div>
      )}

      {/* ── Idle: drop zone ── */}
      {(stage === 'idle' || stage === 'parsing') && (
        <div className="space-y-3">
          <DropZone onFile={handleFile} disabled={stage === 'parsing'} />
          {stage === 'parsing' && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <svg className="h-3.5 w-3.5 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Parsing file…
            </div>
          )}
          {parseError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {parseError}
            </div>
          )}
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-600 mb-1.5">Expected column headers (case-insensitive):</p>
            <div className="flex flex-wrap gap-1.5">
              {['Financial Year', 'Cash Book Type', 'Date', 'Type', 'Cheque No', 'Amount', 'Head of Accounts', 'Notes'].map((h) => (
                <span key={h} className="rounded bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-600 font-mono">
                  {h}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Preview ── */}
      {(stage === 'preview' || stage === 'importing') && parseState && (
        <div className="space-y-4 animate-fade-in">
          {/* File name + counts */}
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <svg className="h-5 w-5 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-700">{parseState.fileName}</p>
              <p className="text-xs text-slate-400">
                {parseState.valid.length} valid entr{parseState.valid.length !== 1 ? 'ies' : 'y'} ready to import
                {parseState.errors.length > 0 && `, ${parseState.errors.length} will be skipped`}
              </p>
            </div>
          </div>

          <SummaryTable summary={parseState.summary} />

          {parseState.errors.length > 0 && <ErrorList errors={parseState.errors} />}

          {/* Action bar */}
          <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs text-blue-700">
              <span className="font-semibold">{parseState.valid.length}</span> entries will be imported
              across <span className="font-semibold">{parseState.summary.length}</span> book
              {parseState.summary.length !== 1 ? 's' : ''}.
            </p>
            <Button
              onClick={handleImport}
              loading={stage === 'importing'}
              disabled={parseState.valid.length === 0}
              size="sm"
            >
              Import All Entries
            </Button>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {stage === 'done' && importResult && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-xl border border-green-200 bg-green-50 px-6 py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-green-800">Import Complete</p>
            <p className="mt-1 text-xs text-green-600">
              {importResult.imported} {importResult.imported === 1 ? 'entry' : 'entries'} imported successfully
              {importResult.failed > 0 && `, ${importResult.failed} skipped`}
            </p>
          </div>
          <div className="text-center">
            <button onClick={reset} className="text-xs text-blue-600 hover:underline">
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
