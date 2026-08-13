'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export const Switch = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root
    className={cn('inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-[var(--border)] p-0.5 outline-none transition-colors duration-150 ease-out data-[state=checked]:bg-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] disabled:cursor-not-allowed disabled:opacity-50', className)}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-[var(--card)] shadow-sm transition-transform duration-150 ease-out data-[state=checked]:translate-x-4" />
  </SwitchPrimitive.Root>
);
