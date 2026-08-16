'use client';

import {useState} from 'react';
import {useLocale} from 'next-intl';
import {useSearchParams} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {requestJson} from '@/lib/api';
import {useWorkspaceStore} from '@/stores/workspace-store';

export type PlanningVariant = 'matrix' | 'source' | 'website' | 'content';

type PlanningCopy = {
  title: string; description: string; primary: string; noBrand: string; saved: string; saving: string; source: string; run: string;
  fields: Array<{key: 'title' | 'context' | 'review'; label: string; placeholder: string}>; note?: string; status?: Array<{value: string; label: string}>;
};

const chinese: Record<PlanningVariant, PlanningCopy> = {
  matrix: {title: '破局计划', description: '将优先问题、竞品差距和待补充的事实沉淀为可验收的优化工单。', primary: '创建计划工单', noBrand: '请先在顶部选择 Brand。', saved: '计划工单 #{id} 已创建', saving: '创建中…', source: '来源', run: '诊断批次', fields: [{key: 'title', label: '目标问题', placeholder: '需要突破的品牌问题或主题'}, {key: 'context', label: '关联证据或竞品差距', placeholder: '记录诊断、竞品或内容覆盖的依据'}, {key: 'review', label: '验收条件', placeholder: '明确问题覆盖、品牌提及或事实补充的验收条件'}]},
  source: {title: '候选信源', description: '只登记候选信源及其工作状态，再将经过评估的建设计划转为工单。', primary: '创建计划工单', noBrand: '请先在顶部选择 Brand。', saved: '计划工单 #{id} 已创建', saving: '创建中…', source: '来源', run: '诊断批次', fields: [{key: 'title', label: '候选信源', placeholder: '官网页面、行业媒体或案例页'}, {key: 'context', label: '关联事实或引用缺口', placeholder: '说明需要支撑的品牌事实或待治理的 URL'}, {key: 'review', label: '工作状态', placeholder: '待评估'}], status: [{value: '待评估', label: '待评估'}, {value: '待补充材料', label: '待补充材料'}, {value: '待审核', label: '待审核'}]},
  website: {title: '网站优化计划', description: '围绕可抓取、可理解、可引用的站点问题创建计划化工单。', primary: '创建计划工单', noBrand: '请先在顶部选择 Brand。', saved: '计划工单 #{id} 已创建', saving: '创建中…', source: '来源', run: '诊断批次', fields: [{key: 'title', label: '优化目标', placeholder: 'robots.txt、页面、结构化数据或站点地图'}, {key: 'context', label: '发现项与完成动作', placeholder: '描述站点发现和要完成的技术或页面动作'}, {key: 'review', label: '验收条件', placeholder: '例如：页面可访问、结构化数据通过校验'}]},
  content: {title: '内容计划', description: '只保存选题、关联事实或问题和审核计划；不自动生成或发布文章。', primary: '创建计划工单', noBrand: '请先在顶部选择 Brand。', saved: '计划工单 #{id} 已创建', saving: '创建中…', source: '来源', run: '诊断批次', fields: [{key: 'title', label: '选题', placeholder: '需要解释的主题或品牌问题'}, {key: 'context', label: '关联事实或问题', placeholder: '注明已审核的事实依据或问题缺口'}, {key: 'review', label: '审核计划', placeholder: '确定事实、品牌与合规审核安排'}], note: '不自动生成或发布文章'},
};

const english: Record<PlanningVariant, PlanningCopy> = {
  matrix: {title: 'Breakthrough plan', description: 'Turn priority questions, competitor gaps, and missing facts into verifiable work orders.', primary: 'Create planned work order', noBrand: 'Select a Brand in the top bar first.', saved: 'Planned work order #{id} created', saving: 'Creating…', source: 'Source', run: 'Diagnosis run', fields: [{key: 'title', label: 'Target question', placeholder: 'Brand question or topic to address'}, {key: 'context', label: 'Evidence or competitor gap', placeholder: 'Record the diagnosis, competitor, or coverage evidence'}, {key: 'review', label: 'Acceptance criteria', placeholder: 'Define coverage, mention, or fact-completeness acceptance'}]},
  source: {title: 'Candidate sources', description: 'Only register candidate sources and their work state, then turn reviewed construction plans into work orders.', primary: 'Create planned work order', noBrand: 'Select a Brand in the top bar first.', saved: 'Planned work order #{id} created', saving: 'Creating…', source: 'Source', run: 'Diagnosis run', fields: [{key: 'title', label: 'Candidate source', placeholder: 'Website page, trade media, or case study'}, {key: 'context', label: 'Related fact or citation gap', placeholder: 'State the supporting fact or URL requiring governance'}, {key: 'review', label: 'Work state', placeholder: 'Needs assessment'}], status: [{value: 'Needs assessment', label: 'Needs assessment'}, {value: 'Needs materials', label: 'Needs materials'}, {value: 'Needs review', label: 'Needs review'}]},
  website: {title: 'Website optimization plan', description: 'Create planned work orders for website conditions that enable crawling, understanding, and citation.', primary: 'Create planned work order', noBrand: 'Select a Brand in the top bar first.', saved: 'Planned work order #{id} created', saving: 'Creating…', source: 'Source', run: 'Diagnosis run', fields: [{key: 'title', label: 'Optimization target', placeholder: 'robots.txt, page, structured data, or sitemap'}, {key: 'context', label: 'Finding and completion action', placeholder: 'Describe the discovery and technical or page action'}, {key: 'review', label: 'Acceptance criteria', placeholder: 'For example: accessible page or valid structured data'}]},
  content: {title: 'Content plan', description: 'Save only the topic, related facts or questions, and review plan; articles are never generated or published automatically.', primary: 'Create planned work order', noBrand: 'Select a Brand in the top bar first.', saved: 'Planned work order #{id} created', saving: 'Creating…', source: 'Source', run: 'Diagnosis run', fields: [{key: 'title', label: 'Topic', placeholder: 'Topic or brand question to explain'}, {key: 'context', label: 'Related fact or question', placeholder: 'Name the reviewed fact basis or question gap'}, {key: 'review', label: 'Review plan', placeholder: 'Set fact, brand, and compliance review'}], note: 'No article generation or external publishing'},
};

const sourceLabels: Record<string, {zh: string; en: string}> = {
  'diagnosis-report': {zh: '诊断报告', en: 'Diagnosis report'},
  'problem-summary': {zh: '问答汇总', en: 'Q&A summary'},
  'competitor-comparison': {zh: '竞品对比', en: 'Competitor comparison'},
  'site-discovery': {zh: '站点发现', en: 'Site discovery'},
};

function numberParam(value: string | null) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : undefined; }

export function OptimizationPlanningPage({variant}: {variant: PlanningVariant}): React.JSX.Element {
  const locale = useLocale();
  const copy = locale === 'zh' ? chinese[variant] : english[variant];
  const brandId = useWorkspaceStore((state) => state.currentBrandId);
  const query = useSearchParams();
  const source = query.get('source');
  const sourceRunId = numberParam(query.get('sourceRunId'));
  const sourceFindingId = numberParam(query.get('sourceFindingId'));
  const [values, setValues] = useState({title: '', context: '', review: copy.status?.[0]?.value ?? ''});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({...current, [key]: value}));
  const create = async () => {
    if (!brandId || !values.title.trim()) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const workOrder = await requestJson<{id: number}>(`brands/${brandId}/optimization-work-orders`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title: values.title, description: values.context, acceptanceCriteria: values.review, sourceRunId, sourceFindingId}),
      });
      setNotice(copy.saved.replace('{id}', String(workOrder.id)));
      setValues({title: '', context: '', review: copy.status?.[0]?.value ?? ''});
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setSaving(false); }
  };
  const sourceLabel = source ? sourceLabels[source]?.[locale === 'zh' ? 'zh' : 'en'] ?? source : null;

  return <section className="pb-8">
    <header className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="mb-2 text-[22px] font-semibold">{copy.title}</h1><p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">{copy.description}</p></header>
    {(sourceLabel || sourceRunId) && <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm"><span>{copy.source}：{sourceLabel ?? '—'}</span>{sourceRunId && <span>{copy.run}：#{sourceRunId}</span>}</div>}
    {copy.note && <p className="mb-5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium">{copy.note}</p>}
    {!brandId ? <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 py-10 text-center text-sm text-[var(--muted-foreground)]">{copy.noBrand}</p>
      : <section className="max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"><div className="grid gap-4"><label className="grid gap-2 text-sm font-medium">{copy.fields[0].label}<input aria-label={copy.fields[0].label} className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-normal" placeholder={copy.fields[0].placeholder} value={values.title} onChange={(event) => set('title', event.target.value)} /></label><label className="grid gap-2 text-sm font-medium">{copy.fields[1].label}<textarea aria-label={copy.fields[1].label} className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-normal" placeholder={copy.fields[1].placeholder} value={values.context} onChange={(event) => set('context', event.target.value)} /></label><label className="grid gap-2 text-sm font-medium">{copy.fields[2].label}{copy.status ? <select aria-label={copy.fields[2].label} className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-normal" value={values.review} onChange={(event) => set('review', event.target.value)}>{copy.status.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select> : <textarea aria-label={copy.fields[2].label} className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-normal" placeholder={copy.fields[2].placeholder} value={values.review} onChange={(event) => set('review', event.target.value)} />}</label></div><div className="mt-5 flex items-center gap-3"><Button onClick={() => void create()} disabled={saving || !values.title.trim()}>{saving ? copy.saving : copy.primary}</Button>{notice && <p className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}</div>{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}</section>}
  </section>;
}
