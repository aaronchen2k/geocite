'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, CircleUserRound, LogOut, UserRound } from 'lucide-react';
import {useTranslations} from 'next-intl';

export function UserMenu() {
  const t = useTranslations('Shell');
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button type="button" className="relative grid size-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)] p-0 text-[var(--foreground)] hover:bg-[var(--muted)]" aria-label={t('openUserMenu')}>
        <CircleUserRound size={22} aria-hidden="true" />
        <span className="absolute right-0.5 top-0.5 size-2 rounded-full border-2 border-[var(--card)] bg-red-600" aria-label={t('unreadMessages')} />
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className="z-50 min-w-[168px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--foreground)] shadow-md" sideOffset={8} align="end">
        <DropdownMenu.Item className="flex min-h-[34px] cursor-pointer items-center gap-2 rounded-md px-2 text-sm outline-none focus:bg-[var(--muted)]"><Bell size={16} />{t('messages')}<span className="ml-auto min-w-[18px] rounded-full bg-[var(--primary)] px-1 py-px text-center text-xs text-[var(--primary-foreground)]">1</span></DropdownMenu.Item>
        <DropdownMenu.Item className="flex min-h-[34px] cursor-pointer items-center gap-2 rounded-md px-2 text-sm outline-none focus:bg-[var(--muted)]"><UserRound size={16} />{t('profile')}</DropdownMenu.Item>
        <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
        <DropdownMenu.Item className="flex min-h-[34px] cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-red-600 outline-none focus:bg-[var(--muted)]"><LogOut size={16} />{t('logout')}</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
