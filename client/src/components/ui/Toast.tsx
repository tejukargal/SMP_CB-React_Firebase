import { cn } from '@/utils/cn';
import type { Toast as ToastType } from '@/context/ToastContext';
import { useToast } from '@/context/ToastContext';

const typeClasses = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-800 text-white',
};

const icons = {
  success: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

function ToastItem({ toast }: { toast: ToastType }) {
  const { removeToast } = useToast();
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 shadow-lg text-sm',
        'min-w-[240px] max-w-sm',
        typeClasses[toast.type]
      )}
    >
      {icons[toast.type]}
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="ml-1 rounded opacity-70 hover:opacity-100"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
