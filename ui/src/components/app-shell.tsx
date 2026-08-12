'use client';

import {useLocale, useTranslations} from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { navigationTree, type NavigationNode } from '../lib/navigation';
import {Link, usePathname, useRouter} from '@/i18n/navigation';
import {routing} from '@/i18n/routing';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001/api/v1';
type Brand = { id: number; name: string; code: string; isDefault: boolean };

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('Shell');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({ diagnosis: true, improvement: true, verification: true, admin: true });
  useEffect(() => { fetch(`${api}/brands`).then((r) => r.ok ? r.json() : Promise.reject()).then((x) => setBrands(x.items ?? [])).catch(() => setBrands([])); }, []);
  const selected = brands.find((x) => x.isDefault)?.id ?? '';
  const select = async (id: number) => { const response = await fetch(`${api}/brands/${id}/default`, { method: 'PATCH' }); if (response.ok) setBrands(brands.map((x) => ({ ...x, isDefault: x.id === id }))); };
  return <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--background)] text-[var(--foreground)]"><header className="flex h-[58px] items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-[22px] shadow-sm"><Link href="/dashboard" className="font-bold tracking-[.06em]">{t('appName')}</Link><div className="flex items-center gap-2"><select aria-label={t('brandLabel')} className="min-w-[230px] rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-[7px] text-[var(--foreground)]" value={selected} onChange={(e) => void select(Number(e.target.value))}><option value="">{brands.length ? t('chooseBrand') : t('noBrands')}</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name} · {brand.code}</option>)}</select><select aria-label={t('language')} className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={locale} onChange={(event) => router.replace(pathname, {locale: event.target.value as typeof routing.locales[number]})}><option value="zh">{t('chinese')}</option><option value="en">{t('english')}</option></select><ThemeToggle /><UserMenu /></div></header><div className="grid min-h-0 grid-cols-[224px_minmax(0,1fr)] overflow-hidden"><aside className="scroll-area min-h-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--card)] p-2.5">{navigationTree.map((node) => <NavigationNodeView key={node.key} node={node} pathname={pathname} open={open[node.key] ?? false} onToggle={() => setOpen({ ...open, [node.key]: !open[node.key] })} />)}</aside><main className="scroll-area min-h-0 w-full max-w-[1400px] overflow-y-auto p-[18px]">{children}</main></div></div>;
}

function NavigationNodeView({ node, pathname, open, onToggle }: { node: NavigationNode; pathname: string; open: boolean; onToggle: () => void }) {
  const t = useTranslations('Navigation');
  if (!node.children) return <Link className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm ${pathname === node.href ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--foreground)] hover:bg-[var(--muted)]'}`} href={node.href!}>{t(node.titleKey)}</Link>;
  return <section><button className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)]" aria-expanded={open} onClick={onToggle}>{t(node.titleKey)}<span>{open ? '⌄' : '›'}</span></button>{open && node.children.map((child) => <Link className={`block rounded-md py-[7px] pl-6 pr-2.5 text-sm ${pathname === child.href ? 'bg-[var(--muted)] text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)]'}`} key={child.key} href={child.href!}>{t(child.titleKey)}</Link>)}</section>;
}
