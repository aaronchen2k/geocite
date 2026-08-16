'use client';

import {useCallback, useEffect, useState} from 'react';
import {useLocale} from 'next-intl';
import {useSearchParams} from 'next/navigation';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import {requestJson} from '@/lib/api';
import {useWorkspaceStore} from '@/stores/workspace-store';

type WorkOrder = {id: number; title: string | null; description: string | null; acceptanceCriteria: string | null; status: string; sourceRunId: number | null; sourceFindingId: number | null; ownerName: string | null; dueAt: string | null};

const sourceLabels: Record<string, {zh: string; en: string}> = {
  'diagnosis-report': {zh: '诊断报告', en: 'Diagnosis report'},
  'problem-summary': {zh: '问答汇总', en: 'Q&A summary'},
  'competitor-comparison': {zh: '竞品对比', en: 'Competitor comparison'},
  'site-discovery': {zh: '站点发现', en: 'Site discovery'},
};

const statusLabels: Record<string, {zh: string; en: string}> = {
  pending: {zh: '待处理', en: 'Pending'}, in_progress: {zh: '进行中', en: 'In progress'}, pending_verification: {zh: '待验证', en: 'Pending verification'}, verified: {zh: '已验证', en: 'Verified'}, ineffective: {zh: '无效', en: 'Ineffective'}, cancelled: {zh: '已取消', en: 'Cancelled'},
};

function numberParam(value: string | null) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : undefined; }

export function OptimizationWorkOrdersPage(): React.JSX.Element {
  const locale = useLocale();
  const zh = locale === 'zh';
  const brandId = useWorkspaceStore((state) => state.currentBrandId);
  const query = useSearchParams();
  const source = query.get('source');
  const sourceRunId = numberParam(query.get('sourceRunId'));
  const sourceFindingId = numberParam(query.get('sourceFindingId'));
  const [orders, setOrders] = useState<WorkOrder[] | undefined>(undefined);
  const [values, setValues] = useState({title: '', description: '', acceptanceCriteria: ''});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [completedActions, setCompletedActions] = useState<Record<number, string[]>>({});
  const [actionValues, setActionValues] = useState<Record<number, string>>({});
  const [actionSaving, setActionSaving] = useState<number | null>(null);
  const load = useCallback(async () => {
    if (!brandId) { setOrders(null as unknown as WorkOrder[]); return; }
    try { setOrders(await requestJson<WorkOrder[]>(`brands/${brandId}/optimization-work-orders`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : (zh ? '加载优化工单失败' : 'Could not load optimization work orders')); setOrders([]); }
  }, [brandId, zh]);
  useEffect(() => { setOrders(undefined); void load(); }, [load]);
  const create = async () => {
    if (!brandId || !values.title.trim()) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const order = await requestJson<WorkOrder>(`brands/${brandId}/optimization-work-orders`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...values, sourceRunId, sourceFindingId})});
      setOrders((current) => [order, ...(current ?? [])]); setValues({title: '', description: '', acceptanceCriteria: ''}); setNotice(zh ? `优化工单 #${order.id} 已创建` : `Optimization work order #${order.id} created`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : (zh ? '创建优化工单失败' : 'Could not create optimization work order')); }
    finally { setSaving(false); }
  };
  const addAction = async (orderId: number) => {
    const description = actionValues[orderId]?.trim(); if (!brandId || !description) return;
    setActionSaving(orderId); setError('');
    try { await requestJson(`brands/${brandId}/optimization-work-orders/${orderId}/actions`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({description})}); setCompletedActions((current) => ({...current, [orderId]: [...(current[orderId] ?? []), description]})); setActionValues((current) => ({...current, [orderId]: ''})); }
    catch (reason) { setError(reason instanceof Error ? reason.message : (zh ? '记录完成动作失败' : 'Could not record completion action')); }
    finally { setActionSaving(null); }
  };
  const sourceLabel = source ? sourceLabels[source]?.[zh ? 'zh' : 'en'] ?? source : null;
  const text = zh ? {title: '优化工单', description: '将诊断、问题、竞品和站点发现转为可执行、可验收并可复测的优化工作。', createTitle: '创建优化工单', source: '来源', run: '诊断批次', goal: '目标', details: '完成动作与说明', acceptance: '验收条件', create: '创建工单', creating: '创建中…', noBrand: '请先在顶部选择 Brand。', empty: '尚无优化工单。可从诊断报告、问答汇总、竞品对比或站点发现创建。', loading: '正在加载优化工单…', action: '完成动作', record: '记录动作', recording: '记录中…', retest: '发起复测', sourceFinding: '发现项'} : {title: 'Optimization work orders', description: 'Turn report, question, competitor, and site discoveries into executable, verifiable, retestable optimization work.', createTitle: 'Create optimization work order', source: 'Source', run: 'Diagnosis run', goal: 'Goal', details: 'Completion actions and notes', acceptance: 'Acceptance criteria', create: 'Create work order', creating: 'Creating…', noBrand: 'Select a Brand in the top bar first.', empty: 'No optimization work orders yet. Create one from a diagnosis report, Q&A summary, competitor comparison, or site discovery.', loading: 'Loading optimization work orders…', action: 'Completion action', record: 'Record action', recording: 'Recording…', retest: 'Start retest', sourceFinding: 'Finding'};
  return <section className="pb-8"><header className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="mb-2 text-[22px] font-semibold">{text.title}</h1><p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">{text.description}</p></header>{(sourceLabel || sourceRunId) && <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm"><span>{text.source}：{sourceLabel ?? '—'}</span>{sourceRunId && <span>{text.run}：#{sourceRunId}</span>}</div>}{!brandId ? <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 py-10 text-center text-sm text-[var(--muted-foreground)]">{text.noBrand}</p> : <><section className="mb-6 max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"><h2 className="text-base font-semibold">{text.createTitle}</h2><div className="mt-4 grid gap-4"><label className="grid gap-2 text-sm font-medium">{text.goal}<input aria-label={text.goal} className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-normal" value={values.title} onChange={(event) => setValues((current) => ({...current, title: event.target.value}))} /></label><label className="grid gap-2 text-sm font-medium">{text.details}<textarea aria-label={text.details} className="min-h-20 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-normal" value={values.description} onChange={(event) => setValues((current) => ({...current, description: event.target.value}))} /></label><label className="grid gap-2 text-sm font-medium">{text.acceptance}<textarea aria-label={text.acceptance} className="min-h-20 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-normal" value={values.acceptanceCriteria} onChange={(event) => setValues((current) => ({...current, acceptanceCriteria: event.target.value}))} /></label></div><div className="mt-5 flex items-center gap-3"><Button onClick={() => void create()} disabled={saving || !values.title.trim()}>{saving ? text.creating : text.create}</Button>{notice && <p className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}</div>{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}</section>{orders === undefined ? <p className="text-sm text-[var(--muted-foreground)]">{text.loading}</p> : !orders.length ? <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 py-10 text-center text-sm text-[var(--muted-foreground)]">{text.empty}</p> : <div className="space-y-4">{orders.map((order) => <article key={order.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{order.title || `${text.goal} #${order.id}`}</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">#{order.id} · {statusLabels[order.status]?.[zh ? 'zh' : 'en'] ?? order.status}</p></div><Button asChild size="sm" variant="outline"><Link href="/diagnosis/diagnosis-execution">{text.retest}</Link></Button></div><dl className="mt-4 grid gap-4 text-sm md:grid-cols-2"><div><dt className="text-[var(--muted-foreground)]">{text.source}</dt><dd className="mt-1">{order.sourceRunId ? `${text.run} #${order.sourceRunId}` : order.sourceFindingId ? `${text.sourceFinding} #${order.sourceFindingId}` : '—'}</dd></div><div><dt className="text-[var(--muted-foreground)]">{text.acceptance}</dt><dd className="mt-1 whitespace-pre-wrap">{order.acceptanceCriteria || '—'}</dd></div></dl><div className="mt-4 border-t border-[var(--border)] pt-4"><p className="text-sm font-medium">{text.action}</p><p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted-foreground)]">{order.description || '—'}</p>{(completedActions[order.id] ?? []).map((action) => <p key={action} className="mt-2 rounded-md bg-[var(--muted)] px-3 py-2 text-sm">{action}</p>)}<div className="mt-3 flex flex-wrap gap-2"><input aria-label={`${text.action} #${order.id}`} className="min-w-52 flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm" value={actionValues[order.id] ?? ''} onChange={(event) => setActionValues((current) => ({...current, [order.id]: event.target.value}))} /><Button size="sm" variant="outline" onClick={() => void addAction(order.id)} disabled={actionSaving === order.id || !(actionValues[order.id] ?? '').trim()}>{actionSaving === order.id ? text.recording : text.record}</Button></div></div></article>)}</div>}</>}</section>;
}
