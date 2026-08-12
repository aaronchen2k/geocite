import * as React from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {useTranslations} from 'next-intl';
import { cn } from '@/lib/utils';

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

export const DialogContent = React.forwardRef<React.ElementRef<typeof Primitive.Content>, React.ComponentPropsWithoutRef<typeof Primitive.Content>>(({ className, children, ...props }, ref) => {
  const t = useTranslations('Shell');
  return <Primitive.Portal>
    <Primitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
    <Primitive.Content ref={ref} className={cn('fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-2rem),48rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl outline-none', className)} {...props}>
      {children}
      <Primitive.Close className="absolute right-4 top-4 rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]" aria-label={t('close')}><X className="size-4" /></Primitive.Close>
    </Primitive.Content>
  </Primitive.Portal>;
});
DialogContent.displayName = 'DialogContent';
export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('mb-5 grid gap-1 text-left', className)} {...props} />;
export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} />;
export const DialogTitle = React.forwardRef<React.ElementRef<typeof Primitive.Title>, React.ComponentPropsWithoutRef<typeof Primitive.Title>>(({ className, ...props }, ref) => <Primitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />);
DialogTitle.displayName = 'DialogTitle';
