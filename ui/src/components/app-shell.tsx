'use client';

import {useLocale, useTranslations} from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import {addCollection, Icon} from '@iconify/react';
import lucide from '@iconify-json/lucide/icons.json';
import { navigationTree, type NavigationNode } from '../lib/navigation';
import {Link, usePathname, useRouter} from '@/i18n/navigation';
import {routing} from '@/i18n/routing';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { requestJson } from '@/lib/api';

addCollection(lucide);

const localeStorageKey = 'geocite.locale';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('Shell');
  const brands = useWorkspaceStore((state) => state.brands);
  const currentBrandId = useWorkspaceStore((state) => state.currentBrandId);
  const setBrands = useWorkspaceStore((state) => state.setBrands);
  const setCurrentBrandId = useWorkspaceStore((state) => state.setCurrentBrandId);
  const [open, setOpen] = useState<Record<string, boolean>>({ diagnosis: true, improvement: true, verification: true, admin: true });
  useEffect(() => { void requestJson<{ items: typeof brands }>('brands').then((x) => setBrands(x.items ?? [])).catch(() => setBrands([])); }, [setBrands]);
  useEffect(() => {
    const stored = window.localStorage.getItem(localeStorageKey);
    const preferred = stored === 'zh' || stored === 'en' ? stored : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    if (!stored) window.localStorage.setItem(localeStorageKey, preferred);
    if (preferred !== locale) router.replace(pathname, {locale: preferred});
  }, [locale, pathname, router]);
  const selected = currentBrandId ?? '';
  const select = async (id: number) => { setCurrentBrandId(id); try { await requestJson(`brands/${id}/default`, { method: 'PATCH' }); setBrands(brands.map((x) => ({ ...x, isDefault: x.id === id }))); } catch { /* 请求日志已记录，保留本地已选择品牌 */ } };
  const changeLocale = (nextLocale: typeof routing.locales[number]) => { window.localStorage.setItem(localeStorageKey, nextLocale); router.replace(pathname, {locale: nextLocale}); };
  return <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--background)] text-[var(--foreground)]"><header className="flex h-[58px] items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-[22px] shadow-sm"><Link href="/dashboard" className="font-bold tracking-[.06em]">{t('appName')}</Link><div className="flex items-center gap-2"><select aria-label={t('brandLabel')} className="min-w-[230px] rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-[7px] text-[var(--foreground)]" value={selected} onChange={(e) => void select(Number(e.target.value))}><option value="">{brands.length ? t('chooseBrand') : t('noBrands')}</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name} · {brand.code}</option>)}</select><select aria-label={t('language')} className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={locale} onChange={(event) => changeLocale(event.target.value as typeof routing.locales[number])}><option value="zh">{t('chinese')}</option><option value="en">{t('english')}</option></select><ThemeToggle /><UserMenu /></div></header><div className="grid min-h-0 grid-cols-[224px_minmax(0,1fr)] overflow-hidden"><aside className="scroll-area scrollbar-hide min-h-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--card)] p-2.5">{navigationTree.map((node) => <NavigationNodeView key={node.key} node={node} pathname={pathname} open={open[node.key] ?? false} onToggle={() => setOpen({ ...open, [node.key]: !open[node.key] })} />)}</aside><main className="scroll-area scrollbar-hide min-h-0 w-full overflow-y-auto p-[18px]">{children}</main></div></div>;
}

function NavigationNodeView({ node, pathname, open, onToggle }: { node: NavigationNode; pathname: string; open: boolean; onToggle: () => void }) {
  const t = useTranslations('Navigation');
  if (!node.children) return <Link className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${pathname === node.href ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--foreground)] hover:bg-[var(--muted)]'}`} href={node.href!}><Icon className="size-4 shrink-0" icon={`lucide:${node.icon}`} aria-hidden="true" />{t(node.titleKey)}</Link>;
  return <section><button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)]" aria-expanded={open} onClick={onToggle}><Icon className="size-4 shrink-0" icon={`lucide:${node.icon}`} aria-hidden="true" /><span>{t(node.titleKey)}</span><span className="ml-auto" aria-hidden="true">{open ? '⌄' : '›'}</span></button>{open && node.children.map((child) => <Link className={`flex items-center gap-2.5 rounded-md py-[7px] pl-6 pr-2.5 text-sm ${pathname === child.href ? 'bg-[var(--muted)] text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)]'}`} key={child.key} href={child.href!}><Icon className="size-4 shrink-0" icon={`lucide:${child.icon}`} aria-hidden="true" />{t(child.titleKey)}</Link>)}</section>;
}
