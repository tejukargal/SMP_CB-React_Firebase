import { cn } from '@/utils/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'receipt' | 'payment' | 'neutral' | 'blue';
  className?: string;
}

const variantClasses = {
  receipt: 'bg-green-100 text-green-700',
  payment: 'bg-red-100 text-red-700',
  neutral: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-100 text-blue-700',
};

export function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
