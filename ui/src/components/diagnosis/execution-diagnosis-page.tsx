'use client';

import {Icon} from '@iconify/react';
import {useTranslations} from 'next-intl';
import {useMemo, useState} from 'react';
import {Button} from '@/components/ui/button';

type StepStatus = 'succeeded' | 'running' | 'pending' | 'failed' | 'unmeasured' | 'cancelled';
type Translate = ReturnType<typeof useTranslations>;
type DiagnosticStep = { id: number; title: string; detail: string; duration: string; status: StepStatus; conclusion: string; severity: string; impact: string; evidence: string; recommendation: string; events: string[] };

function getSteps(t: Translate): DiagnosticStep[] {
  return Array.from({length: 7}, (_, index) => {
    const id = index + 1;
    const key = `steps.${id}`;
    return {id, title: t(`${key}.title`), detail: t(`${key}.detail`), duration: t(`${key}.duration`), status: id < 3 ? 'succeeded' : id === 3 ? 'running' : 'pending', conclusion: t(`${key}.conclusion`), severity: t(`${key}.severity`), impact: t(`${key}.impact`), evidence: t(`${key}.evidence`), recommendation: t(`${key}.recommendation`), events: id < 4 ? [t(`${key}.events.0`), t(`${key}.events.1`), t(`${key}.events.2`), ...(id === 3 ? [t(`${key}.events.3`)] : [])] : []};
  });
}

function getStatusMeta(t: Translate): Record<StepStatus, {label: string; icon: string; className: string}> {
  return {succeeded: {label: t('status.succeeded'), icon: 'lucide:circle-check', className: 'text-emerald-600 dark:text-emerald-400'}, running: {label: t('status.running'), icon: 'lucide:loader-circle', className: 'text-blue-600 dark:text-blue-400'}, pending: {label: t('status.pending'), icon: 'lucide:circle', className: 'text-[var(--muted-foreground)]'}, failed: {label: t('status.failed'), icon: 'lucide:circle-x', className: 'text-red-600 dark:text-red-400'}, unmeasured: {label: t('status.unmeasured'), icon: 'lucide:circle-help', className: 'text-amber-600 dark:text-amber-400'}, cancelled: {label: t('status.cancelled'), icon: 'lucide:circle-slash', className: 'text-[var(--muted-foreground)]'}};
}

export function ExecutionDiagnosisPage(): React.JSX.Element {
  const t = useTranslations('ExecutionDiagnosis');
  const initialSteps = useMemo(() => getSteps(t), [t]);
  const [steps, setSteps] = useState(initialSteps);
  const [selectedId, setSelectedId] = useState(3);
  const [running, setRunning] = useState(true);
  const statusMeta = getStatusMeta(t);
  const selectedStep = steps.find((step) => step.id === selectedId) ?? steps[0];
  const completedCount = steps.filter((step) => step.status === 'succeeded').length + (running ? 1 : 0);
  const summary = useMemo(() => running ? {passed: 14, failed: 3, manual: 2, unmeasured: 1} : {passed: 17, failed: 3, manual: 2, unmeasured: 1}, [running]);
  const startRun = () => { setRunning(true); setSelectedId(3); setSteps(initialSteps); };
  const stopRun = () => { setRunning(false); setSteps((current) => current.map((step) => step.status === 'running' ? {...step, status: 'cancelled', duration: t('stopped'), detail: t('stoppedDetail')} : step)); };
  const usePreviousSnapshot = () => { setRunning(false); setSelectedId(7); setSteps((current) => current.map((step) => step.status === 'pending' || step.status === 'running' ? {...step, status: 'succeeded', duration: t('fromSnapshot'), detail: t('snapshotDetail')} : step)); };

  return <section className="mx-auto max-w-[1180px] pb-8">
    <header className="mb-6 flex flex-col gap-4 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="mb-2 flex items-center gap-2"><h1 className="text-[22px] font-semibold">{t('title')}</h1><span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">{t('sampleData')}</span></div><p className="max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">{t('description')}</p></div><div className="shrink-0 text-sm text-[var(--muted-foreground)]">{t('lastSuccess')}</div></header>
    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><span><span className="text-[var(--muted-foreground)]">{t('brandLabel')}</span>{t('brand')}</span><span><span className="text-[var(--muted-foreground)]">{t('scopeLabel')}</span>{t('scope')}</span></div><div className="flex flex-wrap gap-2"><Button size="sm" onClick={startRun}><Icon icon="lucide:play" aria-hidden="true" />{t('start')}</Button><Button size="sm" variant="outline" onClick={usePreviousSnapshot}><Icon icon="lucide:history" aria-hidden="true" />{t('usePrevious')}</Button></div></div>
    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-sm"><Icon icon={running ? 'lucide:loader-circle' : 'lucide:circle-check'} className={`size-4 ${running ? 'animate-spin text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`} aria-hidden="true" /><span className="font-medium">{running ? t('runProgress', {completed: completedCount}) : t('stoppedRun')}</span></div>{running && <Button size="sm" variant="outline" onClick={stopRun}><Icon icon="lucide:square" aria-hidden="true" />{t('stop')}</Button>}</div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]"><div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]"><div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">{t('stepQueue')}</h2></div><ol className="divide-y divide-[var(--border)]">{steps.map((step) => { const meta = statusMeta[step.status]; const selected = step.id === selectedId; return <li key={step.id}><button type="button" onClick={() => setSelectedId(step.id)} className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${selected ? 'bg-[var(--muted)]' : 'hover:bg-[var(--muted)]/60'}`}><Icon className={`mt-0.5 size-4 shrink-0 ${meta.className} ${step.status === 'running' ? 'animate-spin' : ''}`} icon={meta.icon} aria-hidden="true" /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{String(step.id).padStart(2, '0')} · {step.title}</span><span className="shrink-0 text-xs text-[var(--muted-foreground)]">{step.duration}</span></span><span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">{step.detail}</span></span></button></li>; })}</ol></div>
      <div className="space-y-5"><div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs text-[var(--muted-foreground)]">{t('currentOperation')}</p><h2 className="mt-1 text-base font-semibold">{String(selectedStep.id).padStart(2, '0')} · {selectedStep.title}</h2></div><span className={`inline-flex items-center gap-1 text-sm ${statusMeta[selectedStep.status].className}`}><Icon icon={statusMeta[selectedStep.status].icon} className={`size-4 ${selectedStep.status === 'running' ? 'animate-spin' : ''}`} aria-hidden="true" />{statusMeta[selectedStep.status].label}</span></div><p className="mb-4 text-sm leading-6 text-[var(--muted-foreground)]">{selectedStep.detail}</p><div className="rounded-md bg-[var(--muted)] p-3"><p className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">{t('liveEvents')}</p>{selectedStep.events.length ? <ul className="space-y-2">{selectedStep.events.map((event) => <li key={event} className="flex gap-2 text-xs leading-5"><Icon icon="lucide:dot" className="mt-0.5 size-3 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />{event}</li>)}</ul> : <p className="text-xs text-[var(--muted-foreground)]">{t('noEvents')}</p>}</div></div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><h2 className="mb-4 text-sm font-semibold">{t('stepResult')}</h2><dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2"><ResultItem label={t('result.status')} value={selectedStep.conclusion} /><ResultItem label={t('result.severity')} value={selectedStep.severity} /><ResultItem label={t('result.impact')} value={selectedStep.impact} /><ResultItem label={t('result.evidence')} value={selectedStep.evidence} wide /><ResultItem label={t('result.recommendation')} value={selectedStep.recommendation} wide /></dl></div></div></div>
    <div className="mt-5 flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="mb-2 text-sm font-semibold">{t('summary')}</h2><div className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><span className="text-emerald-600 dark:text-emerald-400">{t('summaryPassed', {count: summary.passed})}</span><span className="text-red-600 dark:text-red-400">{t('summaryFailed', {count: summary.failed})}</span><span className="text-amber-600 dark:text-amber-400">{t('summaryManual', {count: summary.manual})}</span><span className="text-[var(--muted-foreground)]">{t('summaryUnmeasured', {count: summary.unmeasured})}</span></div></div><div className="text-sm text-[var(--muted-foreground)]">{t('history')}</div></div>
  </section>;
}

function ResultItem({label, value, wide = false}: {label: string; value: string; wide?: boolean}): React.JSX.Element { return <div className={wide ? 'sm:col-span-2' : undefined}><dt className="mb-1 text-xs text-[var(--muted-foreground)]">{label}</dt><dd className="text-sm leading-6 text-[var(--foreground)]">{value}</dd></div>; }
