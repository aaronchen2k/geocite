'use client';

import {Icon} from '@iconify/react';
import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001/api/v1';
type Brand = { id: number; name: string; isDefault: boolean };

export function ComprehensiveReportPage(): React.JSX.Element {
  const t = useTranslations('ComprehensiveReport');
  const [brand, setBrand] = useState<Brand | null>(null);

  useEffect(() => { void fetch(`${api}/brands`).then((response) => response.ok ? response.json() : Promise.reject()).then((payload: {items: Brand[]}) => setBrand(payload.items.find((item) => item.isDefault) ?? payload.items[0] ?? null)).catch(() => setBrand(null)); }, []);

  return <section>
    <header className="mb-[22px] border-b border-[var(--border)] pb-4"><h1 className="mb-[7px] text-[22px] font-semibold">{t('title')}</h1><p className="text-[var(--muted-foreground)]">{t('description')}</p></header>
    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><span><span className="text-[var(--muted-foreground)]">{t('brandLabel')}</span>{brand?.name ?? t('noBrand')}</span><span><span className="text-[var(--muted-foreground)]">{t('scopeLabel')}</span>{t('scope')}</span></div><Button size="sm" disabled={!brand}><Icon icon="lucide:history" aria-hidden="true" />{t('viewHistory')}</Button></div>
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-5"><p className="text-[var(--muted-foreground)]">{t('placeholder')}</p></div>
  </section>;
}
