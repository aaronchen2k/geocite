'use client';

import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {requestJson} from '@/lib/api';
import {useWorkspaceStore} from '@/stores/workspace-store';

type Brand = { id: number; name: string; code: string; website: string | null; industry: string | null; description: string | null };
type QuestionCategoryRatio = { brandBasic: number; coreCapability: number; competitorComparison: number };
type DiagnosisConfiguration = { questions: Array<{ id: number; text: string; group: string; market: 'cn' | 'global' | 'both'; brandProbe: boolean }>; prompt: string; sitemapUrlLimit: number; samplingQuestionCount: number; questionCategoryRatio: QuestionCategoryRatio; playwrightWebReviewEnabled: boolean };

function allocateQuestionCategories(total: number, ratio: QuestionCategoryRatio): QuestionCategoryRatio {
  const sum = ratio.brandBasic + ratio.coreCapability + ratio.competitorComparison;
  const base = { brandBasic: Math.floor(total * ratio.brandBasic / sum), coreCapability: Math.floor(total * ratio.coreCapability / sum), competitorComparison: Math.floor(total * ratio.competitorComparison / sum) };
  const fractions = (['brandBasic', 'coreCapability', 'competitorComparison'] as const).map((key, order) => ({key, order, fraction: total * ratio[key] / sum - base[key]})).sort((left, right) => right.fraction - left.fraction || left.order - right.order);
  for (let index = 0; base.brandBasic + base.coreCapability + base.competitorComparison < total; index++) base[fractions[index].key]++;
  return base;
}

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
      .then(([nextBrand, nextConfiguration]) => { setBrand(nextBrand); setConfiguration({...nextConfiguration, playwrightWebReviewEnabled: nextConfiguration.playwrightWebReviewEnabled ?? true}); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('loadFailed')));
  }, [brandId, t]);

  const save = async () => {
    if (!brand || !configuration) return;
    const sitemapUrlLimit = configuration.sitemapUrlLimit;
    if (!Number.isInteger(sitemapUrlLimit) || sitemapUrlLimit < 1 || sitemapUrlLimit > 100) { setError(t('sitemapUrlLimitInvalid')); return; }
    const {samplingQuestionCount, questionCategoryRatio} = configuration;
    if (!Number.isInteger(samplingQuestionCount) || samplingQuestionCount < 4 || samplingQuestionCount > 150) { setError('诊断问句总数必须是 4 到 150 之间的整数。'); return; }
    if (Object.values(questionCategoryRatio).some((value) => !Number.isInteger(value) || value < 1 || value > 100)) { setError('问题分类比例必须为 1 到 100 之间的整数。'); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      const {questions, prompt, sitemapUrlLimit: nextSitemapUrlLimit, samplingQuestionCount: nextSamplingQuestionCount, questionCategoryRatio: nextQuestionCategoryRatio, playwrightWebReviewEnabled} = configuration;
      const [nextBrand, nextConfiguration] = await Promise.all([
        requestJson<Brand>(`brands/${brand.id}`, {method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify({name: brand.name, website: brand.website || undefined, industry: brand.industry || undefined, description: brand.description || undefined})}),
        requestJson<DiagnosisConfiguration>(`brands/${brand.id}/diagnosis-questions`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({questions: questions.map(({text, group, market, brandProbe}) => ({text, group, market, brandProbe})), prompt, sitemapUrlLimit: nextSitemapUrlLimit, samplingQuestionCount: nextSamplingQuestionCount, questionCategoryRatio: nextQuestionCategoryRatio, playwrightWebReviewEnabled})}),
      ]);
      setBrand(nextBrand); setConfiguration(nextConfiguration); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('saveFailed')); }
    finally { setSaving(false); }
  };

  if (!brandId) return <section><header className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="mb-2 text-[22px] font-semibold">{t('title')}</h1><p className="text-sm leading-6 text-[var(--muted-foreground)]">{t('description')}</p></header><p className="text-sm text-[var(--muted-foreground)]">{t('noBrand')}</p></section>;
  const fieldClassName = 'grid items-center gap-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)]';
  const inputClassName = 'h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3';
  const allocation = configuration ? allocateQuestionCategories(configuration.samplingQuestionCount, configuration.questionCategoryRatio) : null;
  const updateRatio = (key: keyof QuestionCategoryRatio, value: number) => setConfiguration((current) => current ? {...current, questionCategoryRatio: {...current.questionCategoryRatio, [key]: value}} : current);
  return <section className="max-w-5xl pb-8"><header className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="mb-2 text-[22px] font-semibold">{t('title')}</h1><p className="text-sm leading-6 text-[var(--muted-foreground)]">{t('description')}</p></header>{error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}{saved && <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t('saved')}</p>}<div className="grid gap-5"><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"><h2 className="font-semibold">{t('brandSection')}</h2><div className="mt-5 grid gap-4"><label className={fieldClassName}><span className="sm:text-right">{t('name')}</span><input className={inputClassName} value={brand?.name ?? ''} onChange={(event) => setBrand((current) => current ? {...current, name: event.target.value} : current)} /></label><label className={fieldClassName}><span className="sm:text-right">{t('website')}</span><input className={inputClassName} value={brand?.website ?? ''} onChange={(event) => setBrand((current) => current ? {...current, website: event.target.value || null} : current)} /></label><label className={fieldClassName}><span className="sm:text-right">{t('industry')}</span><input className={inputClassName} value={brand?.industry ?? ''} onChange={(event) => setBrand((current) => current ? {...current, industry: event.target.value || null} : current)} /></label><label className={fieldClassName}><span className="sm:self-start sm:pt-2 sm:text-right">{t('descriptionField')}</span><textarea className="min-h-28 w-full rounded-md border border-[var(--border)] bg-[var(--card)] p-3" value={brand?.description ?? ''} onChange={(event) => setBrand((current) => current ? {...current, description: event.target.value || null} : current)} /></label></div></section><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"><h2 className="font-semibold">{t('crawlSection')}</h2><label className={`mt-5 ${fieldClassName}`}><span className="sm:text-right">{t('sitemapUrlLimit')}</span><span><input type="number" min={1} max={100} className={inputClassName} value={configuration?.sitemapUrlLimit ?? ''} onChange={(event) => setConfiguration((current) => current ? {...current, sitemapUrlLimit: Number(event.target.value)} : current)} /><span className="mt-2 block text-xs text-[var(--muted-foreground)]">{t('sitemapUrlLimitDescription')}</span></span></label></section><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"><h2 className="font-semibold">诊断采样范围</h2><div className="mt-5 grid gap-4"><label className={fieldClassName}><span className="sm:text-right">问句总数</span><input type="number" min={4} max={150} className={inputClassName} value={configuration?.samplingQuestionCount ?? ''} onChange={(event) => setConfiguration((current) => current ? {...current, samplingQuestionCount: Number(event.target.value)} : current)} /></label><div className={fieldClassName}><span className="sm:text-right">分类比例</span><div className="grid gap-3 sm:grid-cols-3"><label>品牌基础提问<input aria-label="品牌基础提问比例" type="number" min={1} max={100} className={`${inputClassName} mt-1`} value={configuration?.questionCategoryRatio.brandBasic ?? ''} onChange={(event) => updateRatio('brandBasic', Number(event.target.value))}/></label><label>核心业务能力提问<input aria-label="核心业务能力提问比例" type="number" min={1} max={100} className={`${inputClassName} mt-1`} value={configuration?.questionCategoryRatio.coreCapability ?? ''} onChange={(event) => updateRatio('coreCapability', Number(event.target.value))}/></label><label>竞品对比提问<input aria-label="竞品对比提问比例" type="number" min={1} max={100} className={`${inputClassName} mt-1`} value={configuration?.questionCategoryRatio.competitorComparison ?? ''} onChange={(event) => updateRatio('competitorComparison', Number(event.target.value))}/></label></div></div><div className={fieldClassName}><span className="sm:text-right">使用 Playwright 网页复核</span><div className="flex items-start gap-3"><Switch aria-label="使用 Playwright 网页复核" checked={configuration?.playwrightWebReviewEnabled ?? true} onCheckedChange={(playwrightWebReviewEnabled) => setConfiguration((current) => current ? {...current, playwrightWebReviewEnabled} : current)} /><p className="text-sm leading-5 text-[var(--muted-foreground)]">推荐开启：以网页端真实用户环境抽样校正 API 粗扫结果。关闭后本次仅保留 API 参考结果。</p></div></div>{allocation && <p className="text-sm text-[var(--muted-foreground)]">本次将生成：基础 {allocation.brandBasic}、核心 {allocation.coreCapability}、竞品 {allocation.competitorComparison}</p>}</div></section></div><div className="mt-5 flex justify-end"><Button disabled={!brand || !configuration || saving} onClick={() => void save()}>{saving ? t('saving') : t('save')}</Button></div></section>;
}
