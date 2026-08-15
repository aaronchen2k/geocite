'use client';

import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {requestJson} from '@/lib/api';
import {useWorkspaceStore} from '@/stores/workspace-store';

type Brand = { id: number; name: string; code: string; website: string | null; industry: string | null; description: string | null };
type DiagnosisConfiguration = { questions: string[]; prompt: string; sitemapUrlLimit: number };

export function BasicConfigurationPage(): React.JSX.Element {
  const t = useTranslations('BasicConfiguration');
  const brandId = useWorkspaceStore((state) => state.currentBrandId);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [configuration, setConfiguration] = useState<DiagnosisConfiguration | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setBrand(null); setConfiguration(null); setError(''); setSaved(false);
    if (!brandId) return;
    void Promise.all([requestJson<Brand>(`brands/${brandId}`), requestJson<DiagnosisConfiguration>(`brands/${brandId}/diagnosis-questions`)])
      .then(([nextBrand, nextConfiguration]) => { setBrand(nextBrand); setConfiguration(nextConfiguration); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('loadFailed')));
  }, [brandId, t]);

  const save = async () => {
    if (!brand || !configuration) return;
    const sitemapUrlLimit = configuration.sitemapUrlLimit;
    if (!Number.isInteger(sitemapUrlLimit) || sitemapUrlLimit < 1 || sitemapUrlLimit > 100) { setError(t('sitemapUrlLimitInvalid')); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      const [nextBrand, nextConfiguration] = await Promise.all([
        requestJson<Brand>(`brands/${brand.id}`, {method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify({name: brand.name, website: brand.website || undefined, industry: brand.industry || undefined, description: brand.description || undefined})}),
        requestJson<DiagnosisConfiguration>(`brands/${brand.id}/diagnosis-questions`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify(configuration)}),
      ]);
      setBrand(nextBrand); setConfiguration(nextConfiguration); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('saveFailed')); }
    finally { setSaving(false); }
  };

  if (!brandId) return <section><header className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="mb-2 text-[22px] font-semibold">{t('title')}</h1><p className="text-sm leading-6 text-[var(--muted-foreground)]">{t('description')}</p></header><p className="text-sm text-[var(--muted-foreground)]">{t('noBrand')}</p></section>;
  const fieldClassName = 'grid items-center gap-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)]';
  const inputClassName = 'h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3';
  return <section className="max-w-5xl pb-8"><header className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="mb-2 text-[22px] font-semibold">{t('title')}</h1><p className="text-sm leading-6 text-[var(--muted-foreground)]">{t('description')}</p></header>{error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}{saved && <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t('saved')}</p>}<div className="grid gap-5"><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"><h2 className="font-semibold">{t('brandSection')}</h2><div className="mt-5 grid gap-4"><label className={fieldClassName}><span className="sm:text-right">{t('name')}</span><input className={inputClassName} value={brand?.name ?? ''} onChange={(event) => setBrand((current) => current ? {...current, name: event.target.value} : current)} /></label><label className={fieldClassName}><span className="sm:text-right">{t('website')}</span><input className={inputClassName} value={brand?.website ?? ''} onChange={(event) => setBrand((current) => current ? {...current, website: event.target.value || null} : current)} /></label><label className={fieldClassName}><span className="sm:text-right">{t('industry')}</span><input className={inputClassName} value={brand?.industry ?? ''} onChange={(event) => setBrand((current) => current ? {...current, industry: event.target.value || null} : current)} /></label><label className={fieldClassName}><span className="sm:self-start sm:pt-2 sm:text-right">{t('descriptionField')}</span><textarea className="min-h-28 w-full rounded-md border border-[var(--border)] bg-[var(--card)] p-3" value={brand?.description ?? ''} onChange={(event) => setBrand((current) => current ? {...current, description: event.target.value || null} : current)} /></label></div></section><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"><h2 className="font-semibold">{t('crawlSection')}</h2><label className={`mt-5 ${fieldClassName}`}><span className="sm:text-right">{t('sitemapUrlLimit')}</span><span><input type="number" min={1} max={100} className={inputClassName} value={configuration?.sitemapUrlLimit ?? ''} onChange={(event) => setConfiguration((current) => current ? {...current, sitemapUrlLimit: Number(event.target.value)} : current)} /><span className="mt-2 block text-xs text-[var(--muted-foreground)]">{t('sitemapUrlLimitDescription')}</span></span></label></section></div><div className="mt-5 flex justify-end"><Button disabled={!brand || !configuration || saving} onClick={() => void save()}>{saving ? t('saving') : t('save')}</Button></div></section>;
}
