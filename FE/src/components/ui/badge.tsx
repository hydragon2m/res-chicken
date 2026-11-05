import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-amber-100 text-amber-900 border border-amber-200/60',
        amber: 'bg-amber-500 text-white shadow-xs',
        secondary: 'bg-slate-100 text-slate-700 border border-slate-200/60',
        destructive: 'bg-red-50 text-red-700 border border-red-200/60',
        success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
        outline: 'border border-slate-200 text-slate-700',
        ghost: 'text-slate-600 hover:bg-slate-100',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
