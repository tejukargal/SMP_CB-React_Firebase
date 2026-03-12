import { useEffect } from 'react';
import { cn } from '@/utils/cn';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  loading?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  onConfirm,
  loading,
}: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl',
          'animate-in fade-in zoom-in-95'
        )}
      >
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={confirmVariant} size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
