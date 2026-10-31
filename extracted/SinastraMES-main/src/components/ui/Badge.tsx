import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  color?: string;
  variant?: 'default' | 'dot';
}

export function Badge({ children, color = 'bg-slate-100 text-slate-700 border-slate-200', variant = 'default' }: BadgeProps) {
  if (variant === 'dot') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${color}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
        {children}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${color}`}>
      {children}
    </span>
  );
}
