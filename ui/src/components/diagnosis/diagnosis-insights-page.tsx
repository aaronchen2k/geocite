'use client';

import {useCallback, useEffect, useState} from 'react';
import {useWorkspaceStore} from '@/stores/workspace-store';
import {requestJson} from '@/lib/api';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';

type Question = {question: string; group: string; primaryCategory: string; secondaryCategory: string; sampleCount: number; mentionRate: number; diagnosis: string; leadingCompetitor: string | null; leadingCompetitorRate: number};
type SampleAnalysis = {brandMentioned: boolean | null; mentionedCompetitors: string[]; recommendation: string; recommendationRank: number | null; sentiment: string; claims: Array<{text: string; type: string}>; factVerdict: string; citations: Array<{url: string; title: string | null; supports: string}>; evidence: string[]};
type Sample = {id: number; engineName: string; question: string | null; answer: string; error: string | null; sampledAt: string; brandMention: boolean; reviewedBrandMention: boolean | null; reviewNote: string | null; sources: string[]; citations?: Array<{title: string | null; url: string; excerpt: string | null}>; analysis?: SampleAnalysis | null; analysisError?: string | null};
type MatrixRow = {name: string; overallRate: number; byEngine: Array<{engineName: string; sampleCount: number; rate: number}>; lostQuestions: Array<{question: string; rate: number; brandMentionRate: number}>};
type Finding = {id: number; sourceRunId: number; type: string; priority: string; scope: Record<string, unknown> | null; recommendation: string; status: string};
type WebReviewSummary = {apiTotal: number; candidateTotal: number; minimumTarget: number; mandatoryCore: number; mandatoryMentioned: number; randomUnmentioned: number; minimumFill: number; succeeded: number; excludedByReason: Record<string, number>};
type EvidenceBasis = 'web-review-corrected' | 'api-reference-only';
type Insight = {run: {id: number; createdAt: string; finishedAt: string | null}; metrics: {sampleCount: number; questionCount: number; brandMentionRate: number; citedEngines: number; successfulSampleRate: number; reviewedSampleCount: number; sourceCount: number}; questions: Question[]; competitors: Array<{name: string; count: number; sampleCount: number; rate: number}>; competitorMatrix: MatrixRow[]; report: {engines: Array<{engineName: string; sampleCount: number; successRate: number; mentionRate: number}>; groups: Array<{group: string; questionCount: number; sampleCount: number; mentionRate: number; weakQuestion: string | null}>; priorityActions: Question[]; competitorDominatedCount: number; absentCount: number; normalCount: number}; evidenceBasis?: EvidenceBasis; webReviewSummary?: WebReviewSummary; findings: Finding[]; samples: Sample[]};
type Variant = 'report' | 'summary' | 'competitors' | 'samples' | 'map';

const percent = (value: number) => `${Math.round(value * 100)}%`;
const diagnosisLabel: Record<string, string> = {'competitor-dominated': '竞品主导', absent: '完全缺席', normal: '表现正常', unmeasured: '未测'};
type PositioningMapDemoArea = {primary: string; mentionRate: number; leadingCompetitor: string; gap: string; secondary: Array<{name: string; mentionRate: number; leadingCompetitor: string; competitorRate: number; missingFact: string; source: {name: string; count: number; supports: string}; questions: string[]}>};

// 暂以静态示例呈现完整分析结构；接入样本标注和结构化信源聚合后替换为服务端统计结果。
const POSITIONING_MAP_DEMO: PositioningMapDemoArea[] = [
  {primary: '品牌基础提问', mentionRate: 58, leadingCompetitor: '竞品 A', gap: '基础事实与官方身份信息分散', secondary: [
    {name: '事实查询', mentionRate: 64, leadingCompetitor: '竞品 A', competitorRate: 76, missingFact: '主营服务、服务边界与官网主体关系缺少统一说明。', source: {name: '行业媒体示例', count: 12, supports: '企业背景与服务范围'}, questions: ['某品牌的主营产品和服务是什么？', '某品牌的官网和服务范围是什么？']},
    {name: '品牌验证', mentionRate: 51, leadingCompetitor: '竞品 A', competitorRate: 68, missingFact: '品牌别名、官方渠道与服务保障缺少可核验的公开说明。', source: {name: '官网帮助中心示例', count: 8, supports: '品牌身份与服务保障'}, questions: ['某品牌是否提供官方售后与服务保障？']},
  ]},
  {primary: '核心业务能力提问', mentionRate: 43, leadingCompetitor: '竞品 B', gap: '能力边界与行业场景的可信证据不足', secondary: [
    {name: '场景', mentionRate: 46, leadingCompetitor: '竞品 B', competitorRate: 72, missingFact: '适用行业、客户类型和典型使用场景缺少案例支撑。', source: {name: '垂直行业媒体示例', count: 15, supports: '适用场景与客户案例'}, questions: ['什么场景下适合选择这类服务？']},
    {name: '风险', mentionRate: 31, leadingCompetitor: '竞品 B', competitorRate: 55, missingFact: '服务限制、实施前提和不适用场景尚未形成公开边界说明。', source: {name: '问答社区示例', count: 9, supports: '风险与限制'}, questions: ['选择这类服务时需要注意哪些风险？']},
    {name: '能力确认', mentionRate: 52, leadingCompetitor: '竞品 B', competitorRate: 66, missingFact: '核心交付物、方法流程和可验证能力说明不足。', source: {name: '协会专栏示例', count: 11, supports: '专业能力与交付方式'}, questions: ['这类服务能否满足我的核心需求？']},
  ]},
  {primary: '竞品对比提问', mentionRate: 36, leadingCompetitor: '竞品 C', gap: '对比、替代与推荐场景缺少差异化事实', secondary: [
    {name: '比较', mentionRate: 39, leadingCompetitor: '竞品 C', competitorRate: 74, missingFact: '与同类服务在方法、行业经验和交付方式上的差异缺少对照说明。', source: {name: '第三方评测示例', count: 14, supports: '服务能力横向比较'}, questions: ['同类品牌之间有哪些关键差异？']},
    {name: '替代', mentionRate: 34, leadingCompetitor: '竞品 C', competitorRate: 69, missingFact: '替代方案选择条件及品牌不可替代价值未被公开表达。', source: {name: '采购指南示例', count: 10, supports: '替代方案与选择条件'}, questions: ['如果不选择当前方案，有哪些替代选择？']},
    {name: '推荐', mentionRate: 35, leadingCompetitor: '竞品 C', competitorRate: 77, missingFact: '可验证案例、行业口碑和推荐理由覆盖不足。', source: {name: '行业榜单示例', count: 18, supports: '推荐依据与服务商选择'}, questions: ['面对这类需求，推荐哪个品牌或方案？']},
  ]},
];

export function DiagnosisInsightsPage({variant}: {variant: Variant}): React.JSX.Element {
  const brandId = useWorkspaceStore((state) => state.currentBrandId);
  const [insight, setInsight] = useState<Insight | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [recalculating, setRecalculating] = useState(false);
  const load = useCallback(async () => {
    if (!brandId) { setInsight(null); return; }
    setError('');
    try { setInsight(await requestJson<Insight | null>(`brands/${brandId}/diagnosis-insights/latest`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '加载诊断结果失败'); setInsight(null); }
  }, [brandId]);
  useEffect(() => { setInsight(undefined); void load(); }, [load]);
  const recalculate = async () => {
    if (!brandId) return;
    setRecalculating(true);
    setError('');
    try { setInsight(await requestJson<Insight>(`brands/${brandId}/diagnosis-insights/latest/recalculate`, {method: 'POST'})); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '重新统计失败'); }
    finally { setRecalculating(false); }
  };

  const title = {report: '诊断报告', summary: '问答汇总', competitors: '竞品对比', samples: '样本标注', map: '阵地地图'}[variant];
  const description = {report: '汇总当前品牌最近一次诊断的真实采样结果。', summary: '按品牌问题汇总各模型回答、品牌提及和竞品表现。', competitors: '从问题与模型两个维度找出竞品占优的具体场景。', samples: '查看并校验每个问题在各引擎中的原始回答、引用信源与结构化分析结果。人工修改优先于 AI 标注。', map: '基于问题表现和竞品出现率识别值得争取的主题阵地。'}[variant];

  return <section className="pb-8">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4"><div><h1 className="mb-2 text-[22px] font-semibold">{title}</h1><p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">{description}</p></div>{variant === 'samples' && <div className="shrink-0"><Button variant="outline" onClick={() => void recalculate()} disabled={!brandId || recalculating}>{recalculating ? '分析并统计中…' : '重新统计'}</Button><p className="mt-2 text-xs text-[var(--muted-foreground)]">调用默认模型分析回答与引用，再生成当前指标和报告，不重新采样。</p></div>}</header>
    {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
    {insight === undefined ? <p className="text-sm text-[var(--muted-foreground)]">正在加载诊断结果…</p>
      : !brandId ? <p className="text-sm text-[var(--muted-foreground)]">请先在顶部选择 Brand。</p>
        : !insight ? variant === 'map' ? <PositioningMap /> : <EmptyState />
          : <><p className="mb-4 text-xs text-[var(--muted-foreground)]">诊断批次 #{insight.run.id} · {new Date(insight.run.createdAt).toLocaleString()}</p>
            {variant === 'report' && <><Report insight={insight} /><WebReviewEvidence summary={insight.webReviewSummary} evidenceBasis={insight.evidenceBasis} /></>}
            {variant === 'summary' && <QuestionTable items={insight.questions} sourceRunId={insight.run.id} />}
            {variant === 'competitors' && <CompetitorComparison insight={insight} />}
            {variant === 'samples' && <SampleList samples={insight.samples} brandId={brandId} onReviewed={load} />}
            {variant === 'map' && <PositioningMap />}
          </>}
  </section>;
}

function EmptyState() { return <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center"><h2 className="font-semibold">尚无已完成的诊断结果</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">完成一次诊断后，这里将只展示可追溯的真实结果。</p><Button asChild className="mt-5"><Link href="/diagnosis/diagnosis-execution">发起诊断</Link></Button></div>; }

function WebReviewEvidence({summary, evidenceBasis}: {summary?: WebReviewSummary; evidenceBasis?: EvidenceBasis}): React.JSX.Element | null {
  if (!summary) return null;
  const corrected = evidenceBasis === 'web-review-corrected';
  const excluded = Object.entries(summary.excludedByReason);
  return <section className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="font-semibold">网页端真实用户环境复核</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">{corrected ? '以网页复核校正' : '仅 API 参考，未经过网页复核校正，不输出校正结论'}</p></div><span className="text-sm text-[var(--muted-foreground)]">成功复核 {summary.succeeded} 条</span></div><dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4"><div><dt className="text-[var(--muted-foreground)]">API 采样</dt><dd className="mt-1 font-medium">{summary.apiTotal}</dd></div><div><dt className="text-[var(--muted-foreground)]">可复核候选</dt><dd className="mt-1 font-medium">{summary.candidateTotal}</dd></div><div><dt className="text-[var(--muted-foreground)]">最低目标</dt><dd className="mt-1 font-medium">{summary.minimumTarget}</dd></div><div><dt className="text-[var(--muted-foreground)]">强制复核</dt><dd className="mt-1 font-medium">核心 {summary.mandatoryCore} · 已提及 {summary.mandatoryMentioned}</dd></div><div><dt className="text-[var(--muted-foreground)]">随机未提及</dt><dd className="mt-1 font-medium">{summary.randomUnmentioned}</dd></div><div><dt className="text-[var(--muted-foreground)]">最低目标补足</dt><dd className="mt-1 font-medium">{summary.minimumFill}</dd></div><div><dt className="text-[var(--muted-foreground)]">排除原因</dt><dd className="mt-1 font-medium">{excluded.length ? excluded.map(([reason, count]) => `${reason} ${count}`).join(' · ') : '—'}</dd></div></dl>{corrected && <p className="mt-5 border-t border-[var(--border)] pt-4 text-sm leading-6 text-[var(--muted-foreground)]">本次共采集 {summary.apiTotal} 条 API 样本，其中 {summary.candidateTotal} 条可进入网页复核候选；{summary.succeeded} 条关键样本经过网页端真实用户环境复核，最终指标以复核样本校正得出；其余 API 扫描结果仅供参考。</p>}</section>;
}

function Report({insight}: {insight: Insight}) {
  const lead = insight.report.competitorDominatedCount ? `有 ${insight.report.competitorDominatedCount} 个品牌问题被竞品主导，建议优先查看问答汇总与竞品对比。` : insight.report.absentCount ? `有 ${insight.report.absentCount} 个品牌问题尚未提及当前品牌，建议核对问题覆盖与品牌事实。` : '当前采样中品牌问题均出现有效提及，可继续关注模型与问题分类差异。';
  return <div className="space-y-5"><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"><p className="text-sm text-[var(--muted-foreground)]">本次诊断结论</p><p className="mt-2 text-lg font-semibold leading-7">{lead}</p><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" asChild><Link href="/diagnosis/problem-summary">查看问答汇总</Link></Button><Button size="sm" variant="outline" asChild><Link href="/diagnosis/competitor-comparison">查看竞品对比</Link></Button><Button size="sm" variant="outline" asChild><Link href={`/improvement/optimization-work-orders?source=diagnosis-report&sourceRunId=${insight.run.id}`}>创建优化工单</Link></Button></div></section><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['样本数', insight.metrics.sampleCount], ['品牌提及率', percent(insight.metrics.brandMentionRate)], ['有效样本率', percent(insight.metrics.successfulSampleRate)], ['引用来源', insight.metrics.sourceCount]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><p className="text-sm text-[var(--muted-foreground)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div><div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><div className="mb-4"><h2 className="font-semibold">模型覆盖与表现</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">比较各模型的采样有效性与品牌提及。</p></div><div className="space-y-3">{insight.report.engines.map((engine) => <div key={engine.engineName} className="grid grid-cols-[minmax(7rem,1fr)_auto_auto] items-center gap-4 text-sm"><span>{engine.engineName}</span><span>有效 {percent(engine.successRate)}</span><span className="text-[var(--muted-foreground)]">提及 {percent(engine.mentionRate)} · {engine.sampleCount} 条</span></div>)}{!insight.report.engines.length && <p className="text-sm text-[var(--muted-foreground)]">暂无可用模型样本。</p>}</div></section><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><h2 className="font-semibold">诊断可信度</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">已采样问题</dt><dd>{insight.metrics.questionCount}</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">成功采样模型</dt><dd>{insight.metrics.citedEngines}</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">人工复核</dt><dd>{insight.metrics.reviewedSampleCount} 条</dd></div></dl></section></div><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><div className="mb-4"><h2 className="font-semibold">问题分类健康度</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">按品牌问题分类观察覆盖与提及表现。</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{insight.report.groups.map((group) => <article key={group.group} className="rounded-md bg-[var(--muted)] p-3"><div className="flex justify-between gap-3"><strong className="text-sm">{group.group}</strong><span className="text-sm">{percent(group.mentionRate)}</span></div><p className="mt-2 text-xs text-[var(--muted-foreground)]">{group.questionCount} 个问题 · {group.sampleCount} 条样本</p>{group.weakQuestion && <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">较弱问题：{group.weakQuestion}</p>}</article>)}</div></section><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">优先关注方向</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">基于本次真实采样得出的前三项关注点。</p></div><span className="text-sm text-[var(--muted-foreground)]">竞品主导 {insight.report.competitorDominatedCount} · 缺席 {insight.report.absentCount}</span></div><div className="space-y-3">{insight.report.priorityActions.map((item) => <article key={item.question} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3 first:border-t-0 first:pt-0"><div><p className="text-sm font-medium">{item.question}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.group} · {diagnosisLabel[item.diagnosis]}{item.leadingCompetitor ? ` · ${item.leadingCompetitor} ${percent(item.leadingCompetitorRate)}` : ''}</p></div><Button size="sm" variant="outline" asChild><Link href="/diagnosis/problem-summary">查看问答</Link></Button></article>)}{!insight.report.priorityActions.length && <p className="text-sm text-[var(--muted-foreground)]">当前没有需要优先处理的品牌问题。</p>}</div></section></div>;
}

function workOrderHref(source: 'competitor-comparison' | 'site-discovery', sourceRunId: number, sourceFindingId?: number) { return `/improvement/optimization-work-orders?source=${source}&sourceRunId=${sourceRunId}${sourceFindingId ? `&sourceFindingId=${sourceFindingId}` : ''}`; }

function CompetitorComparison({insight}: {insight: Insight}) {
  const engines = [...new Set(insight.competitorMatrix.flatMap((row) => row.byEngine.map((item) => item.engineName)))];
  return <div className="space-y-5">
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[var(--muted)]"><tr><th className="px-3 py-3">竞品</th><th className="px-3 py-3">总体出现率</th>{engines.map((engine) => <th key={engine} className="px-3 py-3">{engine}</th>)}</tr></thead><tbody>{insight.competitorMatrix.map((row) => <tr key={row.name} className="border-t border-[var(--border)]"><td className="px-3 py-3 font-medium">{row.name}</td><td className="px-3 py-3">{percent(row.overallRate)}</td>{engines.map((engine) => { const item = row.byEngine.find((cell) => cell.engineName === engine); return <td key={engine} className="px-3 py-3">{item ? <>{percent(item.rate)} <span className="text-xs text-[var(--muted-foreground)]">({item.sampleCount})</span></> : '—'}</td>; })}</tr>)}{!insight.competitorMatrix.length && <tr><td colSpan={Math.max(2, engines.length + 2)} className="px-3 py-10 text-center text-[var(--muted-foreground)]">暂无启用的竞品配置。</td></tr>}</tbody></table></div>
    {insight.competitorMatrix.some((row) => row.lostQuestions.length) && <section><h2 className="mb-3 font-semibold">竞品占优的问题</h2><div className="grid gap-3 lg:grid-cols-2">{insight.competitorMatrix.flatMap((row) => row.lostQuestions.map((item) => { const finding = insight.findings.find((candidate) => candidate.type === 'competitor_dominated' && candidate.scope?.question === item.question && candidate.scope?.competitor === row.name); return <article key={`${row.name}-${item.question}`} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><p className="text-sm font-medium">{item.question}</p><p className="mt-3 text-sm"><span className="text-[var(--muted-foreground)]">{row.name} </span>{percent(item.rate)} <span className="ml-3 text-[var(--muted-foreground)]">当前品牌 </span>{percent(item.brandMentionRate)}</p><Button size="sm" variant="outline" className="mt-3" asChild><Link href={workOrderHref('competitor-comparison', insight.run.id, finding?.id)}>创建优化工单</Link></Button></article>; }))}</div></section>}
  </div>;
}

function SampleList({samples, brandId, onReviewed}: {samples: Sample[]; brandId: number; onReviewed: () => Promise<void>}) { return <div className="space-y-3">{samples.map((sample) => <SampleCard key={sample.id} sample={sample} brandId={brandId} onReviewed={onReviewed} />)}{!samples.length && <p className="text-sm text-[var(--muted-foreground)]">该批次没有样本。</p>}</div>; }

function SampleCard({sample, brandId, onReviewed}: {sample: Sample; brandId: number; onReviewed: () => Promise<void>}) {
  const [mention, setMention] = useState(sample.brandMention);
  const [note, setNote] = useState(sample.reviewNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => { setSaving(true); setError(''); try { await requestJson(`brands/${brandId}/diagnosis-insights/samples/${sample.id}/review`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({brandMention: mention, note})}); await onReviewed(); } catch (reason) { setError(reason instanceof Error ? reason.message : '保存复核失败'); } finally { setSaving(false); } };
  return <article className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{sample.engineName}</strong><span className="text-[var(--muted-foreground)]">{new Date(sample.sampledAt).toLocaleString()}</span></div><p className="mt-3 text-sm font-medium">{sample.question ?? '未关联问题'}</p><div className="mt-2 max-h-72 overflow-y-auto rounded-md bg-[var(--muted)] p-3 text-sm leading-6 text-[var(--muted-foreground)]"><p className="whitespace-pre-wrap">{sample.error ? `采样失败：${sample.error}` : sample.answer || '无回答内容'}</p></div>{sample.analysis ? <SampleAnalysisView analysis={sample.analysis} /> : <p className="mt-3 text-xs text-[var(--muted-foreground)]">{sample.analysisError ? `分析失败：${sample.analysisError}` : '尚未进行样本分析。点击页面顶部“重新统计”后生成。'}</p>}<div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3"><label className="flex items-center gap-2 text-sm"><Switch aria-label="品牌被提及" checked={mention} onCheckedChange={setMention} /><span>品牌被提及</span></label><input aria-label="复核备注" className="h-8 min-w-48 flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm" placeholder="复核备注（可选）" value={note} onChange={(event) => setNote(event.target.value)} /><Button size="sm" variant="outline" onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : sample.reviewedBrandMention === null ? '确认复核' : '更新复核'}</Button></div>{error && <p className="mt-2 text-xs text-red-600">{error}</p>}</article>;
}

function SampleAnalysisView({analysis}: {analysis: SampleAnalysis}) { return <section className="mt-3 border-t border-[var(--border)] pt-3 text-sm"><div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 xl:grid-cols-4"><p><span className="text-[var(--muted-foreground)]">品牌出现：</span>{analysis.brandMentioned === null ? '待确认' : analysis.brandMentioned ? '是' : '否'}</p><p><span className="text-[var(--muted-foreground)]">推荐：</span>{analysis.recommendation}{analysis.recommendationRank ? ` · 第 ${analysis.recommendationRank} 位` : ''}</p><p><span className="text-[var(--muted-foreground)]">语气：</span>{analysis.sentiment}</p><p><span className="text-[var(--muted-foreground)]">事实结论：</span>{analysis.factVerdict}</p></div>{analysis.mentionedCompetitors.length > 0 && <p className="mt-2"><span className="text-[var(--muted-foreground)]">出现竞品：</span>{analysis.mentionedCompetitors.join('、')}</p>}{analysis.claims.length > 0 && <p className="mt-2 leading-6"><span className="text-[var(--muted-foreground)]">能力/事实主张：</span>{analysis.claims.map((claim) => claim.text).join('；')}</p>}{analysis.citations.length > 0 && <div className="mt-3"><p className="text-[var(--muted-foreground)]">主要引用信源及支持观点</p><ul className="mt-2 space-y-1.5">{analysis.citations.map((citation) => <li key={citation.url}><a className="text-[var(--primary)] underline underline-offset-2" href={citation.url} target="_blank" rel="noreferrer">{citation.title || citation.url}</a>{citation.supports ? <span className="text-[var(--muted-foreground)]"> · {citation.supports}</span> : null}</li>)}</ul></div>}</section>; }

function PositioningMap() {
  const [expandedPrimary, setExpandedPrimary] = useState<string[]>([]);
  const [expandedSecondary, setExpandedSecondary] = useState<string[]>([]);
  const toggle = (value: string, setExpanded: React.Dispatch<React.SetStateAction<string[]>>) => setExpanded((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);

  return <div className="space-y-4">
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4"><div><h2 className="font-semibold">问题阵地</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">按一级、二级问题意图查看品牌覆盖、竞品领先、事实缺口和高引用信源。</p></div><span className="rounded-md bg-[var(--muted)] px-2.5 py-1 text-xs text-[var(--muted-foreground)]">示例数据 · 接入统计后自动替换</span></div>
      <div className="space-y-3">
        {POSITIONING_MAP_DEMO.map((area, primaryIndex) => {
          const primaryOpen = expandedPrimary.includes(area.primary);
          const primaryId = `positioning-primary-${primaryIndex}`;
          return <section key={area.primary} className="overflow-hidden rounded-md border border-[var(--border)]">
            <button type="button" aria-label={area.primary} aria-expanded={primaryOpen} aria-controls={primaryId} onClick={() => toggle(area.primary, setExpandedPrimary)} className="flex w-full flex-wrap items-center justify-between gap-3 bg-[var(--card)] px-4 py-3 text-left hover:bg-[var(--muted)]">
              <span className="font-medium">{area.primary}</span><span className="text-sm text-[var(--muted-foreground)]">品牌提及 {percent(area.mentionRate)} · 领先竞品 {area.leadingCompetitor}</span>
            </button>
            {primaryOpen && <div id={primaryId} className="space-y-2 border-t border-[var(--border)] p-3">
              <p className="px-1 text-sm leading-6 text-[var(--muted-foreground)]">主要缺口：{area.gap}</p>
              {area.secondary.map((item, secondaryIndex) => {
                const secondaryKey = `${area.primary}\u0000${item.name}`;
                const secondaryOpen = expandedSecondary.includes(secondaryKey);
                const secondaryId = `positioning-secondary-${primaryIndex}-${secondaryIndex}`;
                return <section key={secondaryKey} className="overflow-hidden rounded-md bg-[var(--muted)]">
                  <button type="button" aria-label={item.name} aria-expanded={secondaryOpen} aria-controls={secondaryId} onClick={() => toggle(secondaryKey, setExpandedSecondary)} className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--card)]">
                    <span className="text-sm font-medium">{item.name}</span><span className="text-xs text-[var(--muted-foreground)]">品牌 {percent(item.mentionRate)} · {item.leadingCompetitor} {percent(item.competitorRate)}</span>
                  </button>
                  {secondaryOpen && <div id={secondaryId} className="grid gap-4 border-t border-[var(--border)] bg-[var(--card)] p-3 lg:grid-cols-2"><div className="space-y-3 text-sm"><div><p className="text-xs text-[var(--muted-foreground)]">主要缺失事实</p><p className="mt-1 leading-6">{item.missingFact}</p></div><div><p className="text-xs text-[var(--muted-foreground)]">高引用信源</p><p className="mt-1 font-medium">{item.source.name} <span className="font-normal text-[var(--muted-foreground)]">· 引用 {item.source.count} 次</span></p><p className="mt-1 leading-6 text-[var(--muted-foreground)]">支持观点：{item.source.supports}</p></div></div><div><p className="text-xs text-[var(--muted-foreground)]">关联问题</p><ul className="mt-2 space-y-2 text-sm">{item.questions.map((question) => <li key={question} className="rounded-md bg-[var(--muted)] px-3 py-2 leading-5">{question}</li>)}</ul></div></div>}
                </section>;
              })}
            </div>}
          </section>;
        })}
      </div>
    </section>
  </div>;
}

function QuestionTable({items, className = '', priority = false, sourceRunId}: {items: Question[]; className?: string; priority?: boolean; sourceRunId?: number}) { return <div className="space-y-3"><div className={`${className} overflow-x-auto rounded-lg border border-[var(--border)]`}><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--muted)]"><tr><th className="px-3 py-3">品牌问题</th><th className="px-3 py-3">分类</th><th className="px-3 py-3">品牌提及</th><th className="px-3 py-3">诊断</th><th className="px-3 py-3">关联竞品</th></tr></thead><tbody>{items.map((item) => <tr key={item.question} className="border-t border-[var(--border)]"><td className="px-3 py-3">{item.question}</td><td className="px-3 py-3"><span className="rounded-md bg-[var(--muted)] px-2 py-1 text-xs">{item.secondaryCategory || '未分类'}</span></td><td className="px-3 py-3">{percent(item.mentionRate)} <span className="text-xs text-[var(--muted-foreground)]">({item.sampleCount})</span></td><td className="px-3 py-3">{diagnosisLabel[item.diagnosis]}</td><td className="px-3 py-3">{item.leadingCompetitor ? `${item.leadingCompetitor} ${percent(item.leadingCompetitorRate)}` : '—'}</td></tr>)}{!items.length && <tr><td colSpan={5} className="px-3 py-10 text-center text-[var(--muted-foreground)]">{priority ? '没有需要优先处理的问题。' : '暂无问题结果。'}</td></tr>}</tbody></table></div>{sourceRunId && <Button size="sm" variant="outline" asChild><Link href={`/improvement/optimization-work-orders?source=problem-summary&sourceRunId=${sourceRunId}`}>从问答汇总创建优化工单</Link></Button>}</div>; }
