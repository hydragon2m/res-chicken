import * as React from 'react';
import { cn } from '@/thu-vien/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white pl-3.5 pr-3.5 py-2 text-sm text-slate-900 shadow-xs transition-all outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:pointer-events-none disabled:opacity-50 disabled:bg-slate-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
