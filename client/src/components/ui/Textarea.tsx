import { cn } from '@/utils/cn';
import { type TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-xs font-medium text-slate-600">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          rows={3}
          className={cn(
            'w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800',
            'placeholder:text-slate-400',
            'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20',
            error && 'border-red-400 focus:border-red-400 focus:ring-red-400/20',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
