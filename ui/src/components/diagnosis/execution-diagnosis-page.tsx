'use client';

import {Icon} from '@iconify/react';
import {useTranslations} from 'next-intl';
import {useLocale} from 'next-intl';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import { useWorkspaceStore } from '@/stores/workspace-store';

type StepStatus = 'succeeded' | 'running' | 'pending' | 'failed' | 'unmeasured' | 'cancelled';
type Translate = ReturnType<typeof useTranslations>;
type DiagnosticStep = {
    id: number;
    title: string;
    detail: string;
    duration: string;
    status: StepStatus;
    conclusion: string;
    severity: string;
    impact: string;
    evidence: string;
    recommendation: string;
    events: string[]
};
type ApiStep = {
    number: number;
    status: StepStatus;
    startedAt: string | null;
    finishedAt: string | null;
    result: { conclusion: string; severity: string; evidence: unknown; recommendation: string } | null
};
type ApiRun = {
    id: number;
    brandId: number;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'partial';
    summary: { passed: number; failed: number; manual: number; unmeasured: number } | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    steps: ApiStep[]
};
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001/api/v1';

function resultText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '—';
    return JSON.stringify(value, null, 2);
}

function getSteps(t: Translate): DiagnosticStep[] {
    return Array.from({length: 7}, (_, index) => {
        const id = index + 1;
        const key = `steps.${id}`;
        return {
            id,
            title: t(`${key}.title`),
            detail: t(`${key}.detail`),
            duration: t('status.pending'),
            status: 'pending',
            conclusion: t('notExecuted'),
            severity: t('status.unmeasured'),
            impact: t('noEvents'),
            evidence: '—',
            recommendation: t('start'),
            events: []
        };
    });
}

function getStatusMeta(t: Translate): Record<StepStatus, { label: string; icon: string; className: string }> {
    return {
        succeeded: {
            label: t('status.succeeded'),
            icon: 'lucide:circle-check',
            className: 'text-emerald-600 dark:text-emerald-400'
        },
        running: {
            label: t('status.running'),
            icon: 'lucide:loader-circle',
            className: 'text-blue-600 dark:text-blue-400'
        },
        pending: {label: t('status.pending'), icon: 'lucide:circle', className: 'text-[var(--muted-foreground)]'},
        failed: {label: t('status.failed'), icon: 'lucide:circle-x', className: 'text-red-600 dark:text-red-400'},
        unmeasured: {
            label: t('status.unmeasured'),
            icon: 'lucide:circle-help',
            className: 'text-amber-600 dark:text-amber-400'
        },
        cancelled: {
            label: t('status.cancelled'),
            icon: 'lucide:circle-slash',
            className: 'text-[var(--muted-foreground)]'
        }
    };
}

export function ExecutionDiagnosisPage(): React.JSX.Element {
  const t = useTranslations('ExecutionDiagnosis');
  const locale = useLocale();
    const initialSteps = useMemo(() => getSteps(t), [t]);
    const [steps, setSteps] = useState(initialSteps);
    const [selectedId, setSelectedId] = useState(1);
    const [running, setRunning] = useState(false);
    const [run, setRun] = useState<ApiRun | null>(null);
    const brand = useWorkspaceStore((state) => state.brands.find((item) => item.id === state.currentBrandId) ?? null);
    const hasBrands = useWorkspaceStore((state) => state.brands.length > 0);
    const source = useRef<EventSource | null>(null);
    const poller = useRef<ReturnType<typeof setInterval> | null>(null);
    const statusMeta = getStatusMeta(t);
    const selectedStep = steps.find((step) => step.id === selectedId) ?? steps[0];
    const completedCount = steps.filter((step) => ['succeeded', 'failed', 'unmeasured', 'cancelled'].includes(step.status)).length + (running ? 1 : 0);
    const summary = run?.summary ?? {passed: 0, failed: 0, manual: 0, unmeasured: 0};
    const applyRun = useCallback((nextRun: ApiRun) => {
        setRun(nextRun);
        setRunning(nextRun.status === 'queued' || nextRun.status === 'running');
        setSteps(initialSteps.map((step) => {
            const next = nextRun.steps.find((item) => item.number === step.id);
            if (!next) return step;
            return {
                ...step,
                status: next.status,
                duration: next.status === 'running' ? t('status.running') : next.status === 'pending' ? t('status.pending') : next.status === 'cancelled' ? t('status.cancelled') : step.duration,
                conclusion: next.result?.conclusion ?? step.conclusion,
                severity: next.result?.severity ?? step.severity,
                evidence: next.result ? resultText(next.result.evidence) : step.evidence,
                recommendation: next.result?.recommendation ?? step.recommendation,
            };
        }));
    }, [initialSteps, t]);
    const subscribe = useCallback((runId: number) => {
        source.current?.close();
        if (poller.current) clearInterval(poller.current);
        const eventSource = new EventSource(`${api}/execution-checks/${runId}/events`);
        source.current = eventSource;
        const onEvent = (event: MessageEvent<string>) => {
            const data = JSON.parse(event.data) as {
                number?: number;
                status?: StepStatus;
                message?: string;
                result?: ApiStep['result'];
                summary?: ApiRun['summary']
            };
            if (data.status && data.number) setSteps((current) => current.map((step) => step.id === data.number ? {
                ...step,
                status: data.status ?? step.status,
                duration: data.status === 'running' ? t('status.running') : step.duration,
                conclusion: data.result?.conclusion ?? step.conclusion,
                severity: data.result?.severity ?? step.severity,
                evidence: data.result ? resultText(data.result.evidence) : step.evidence,
                recommendation: data.result?.recommendation ?? step.recommendation,
            } : step));
            const {message, number} = data;
            if (message && number) setSteps((current) => current.map((step) => step.id === number ? {
                ...step,
                events: [...step.events, message]
            } : step));
            const eventSummary = data.summary;
            if (eventSummary) {
                setRun((current) => current ? {...current, status: 'partial', summary: eventSummary} : current);
                setRunning(false);
            }
        };
        ['run', 'step', 'log', 'summary'].forEach((type) => eventSource.addEventListener(type, onEvent as EventListener));
        eventSource.onerror = () => {
            eventSource.close();
            if (poller.current) return;
            poller.current = setInterval(() => {
                void fetch(`${api}/execution-checks/${runId}`).then((response) => response.ok ? response.json() : Promise.reject()).then((snapshot: ApiRun) => {
                    applyRun(snapshot);
                    if (!['queued', 'running'].includes(snapshot.status) && poller.current) {
                        clearInterval(poller.current);
                        poller.current = null;
                    }
                }).catch(() => undefined);
            }, 3000);
        };
    }, [applyRun, t]);
    useEffect(() => () => { source.current?.close(); if (poller.current) clearInterval(poller.current); }, []);
    useEffect(() => {
        source.current?.close();
        if (poller.current) clearInterval(poller.current);
        setRun(null); setRunning(false); setSelectedId(1); setSteps(initialSteps);
    }, [brand?.id, initialSteps]);
    const startRun = async () => {
        if (!brand) return;
        const response = await fetch(`${api}/brands/${brand.id}/execution-checks`, {method: 'POST'});
        if (!response.ok) return;
        const nextRun = await response.json() as ApiRun;
        setSelectedId(1);
        applyRun(nextRun);
        subscribe(nextRun.id);
    };
    const stopRun = async () => {
        if (!run) return;
        const response = await fetch(`${api}/execution-checks/${run.id}/cancel`, {method: 'POST'});
        if (response.ok) applyRun(await response.json() as ApiRun);
    };

    return <section className="pb-8">
        <header
            className="mb-6 flex flex-col gap-4 border-b border-[var(--border)] lg:flex-row lg:items-start lg:justify-between">
            <div>
                <div className="mb-2 flex items-center gap-2"><h1
                    className="text-[22px] font-semibold">{t('title')}</h1>{!hasBrands && <span
                    className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">{t('sampleData')}</span>}
                </div>
                <p className="text-sm leading-6 text-[var(--muted-foreground)]">{t('description')}</p></div>
            <div
                className="shrink-0 text-sm text-[var(--muted-foreground)]">{run?.finishedAt ? t('lastSuccess', {time: new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'medium'}).format(new Date(run.finishedAt))}) : t('noCompletedRun')}</div>
        </header>

        <div
            className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><span><span
                className="text-[var(--muted-foreground)]">{t('brandLabel')}</span>{brand?.name ?? t('brand')}</span><span><span
                className="text-[var(--muted-foreground)]">{t('scopeLabel')}</span>{t('scope')}</span></div>
            <Button size="sm" disabled={!brand} onClick={() => void startRun()}><Icon icon="lucide:play"
                                                                                      aria-hidden="true"/>{t('start')}
            </Button>
        </div>

        <div
            className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm"><Icon
                icon={running ? 'lucide:loader-circle' : 'lucide:circle'}
                className={`size-4 ${running ? 'animate-spin text-blue-600 dark:text-blue-400' : 'text-[var(--muted-foreground)]'}`}
                aria-hidden="true"/><span
                className="font-medium">{running ? t('runProgress', {completed: completedCount}) : run?.status === 'cancelled' ? t('stoppedRun') : run ? t('completedRun') : t('status.pending')}</span>
            </div>
            {running && <Button size="sm" variant="outline" onClick={() => void stopRun()}><Icon icon="lucide:square"
                                                                                                 aria-hidden="true"/>{t('stop')}
            </Button>}</div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
            <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
                <div className="border-b border-[var(--border)] px-4 py-3"><h2
                    className="text-sm font-semibold">{t('stepQueue')}</h2></div>
                <ol className="divide-y divide-[var(--border)]">{steps.map((step) => {
                    const meta = statusMeta[step.status];
                    const selected = step.id === selectedId;
                    return <li key={step.id}>
                        <button type="button" onClick={() => setSelectedId(step.id)}
                                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${selected ? 'bg-[var(--muted)]' : 'hover:bg-[var(--muted)]/60'}`}>
                            <Icon
                                className={`mt-0.5 size-4 shrink-0 ${meta.className} ${step.status === 'running' ? 'animate-spin' : ''}`}
                                icon={meta.icon} aria-hidden="true"/><span className="min-w-0 flex-1"><span
                            className="flex items-center justify-between gap-3"><span
                            className="text-sm font-medium">{String(step.id).padStart(2, '0')} · {step.title}</span><span
                            className="shrink-0 text-xs text-[var(--muted-foreground)]">{step.duration}</span></span><span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">{step.detail}</span></span>
                        </button>
                    </li>;
                })}</ol>
            </div>
            <div className="space-y-5">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div><p className="text-xs text-[var(--muted-foreground)]">{t('currentOperation')}</p><h2
                            className="mt-1 text-base font-semibold">{String(selectedStep.id).padStart(2, '0')} · {selectedStep.title}</h2>
                        </div>
                        <span
                            className={`inline-flex items-center gap-1 text-sm ${statusMeta[selectedStep.status].className}`}><Icon
                            icon={statusMeta[selectedStep.status].icon}
                            className={`size-4 ${selectedStep.status === 'running' ? 'animate-spin' : ''}`}
                            aria-hidden="true"/>{statusMeta[selectedStep.status].label}</span></div>
                    <p className="mb-4 text-sm leading-6 text-[var(--muted-foreground)]">{selectedStep.detail}</p>
                    <div className="rounded-md bg-[var(--muted)] p-3"><p
                        className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">{t('liveEvents')}</p>{selectedStep.events.length ?
                        <ul className="space-y-2">{selectedStep.events.map((event) => <li key={event}
                                                                                          className="flex gap-2 text-xs leading-5">
                            <Icon icon="lucide:dot" className="mt-0.5 size-3 shrink-0 text-[var(--muted-foreground)]"
                                  aria-hidden="true"/>{event}</li>)}</ul> :
                        <p className="text-xs text-[var(--muted-foreground)]">{t('noEvents')}</p>}</div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><h2
                    className="mb-4 text-sm font-semibold">{t('stepResult')}</h2>
                    <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2"><ResultItem label={t('result.status')}
                                                                                    value={selectedStep.conclusion}/><ResultItem
                        label={t('result.severity')} value={selectedStep.severity}/><ResultItem
                        label={t('result.impact')} value={selectedStep.impact}/><ResultItem label={t('result.evidence')}
                                                                                            value={selectedStep.evidence}
                                                                                            wide/><ResultItem
                        label={t('result.recommendation')} value={selectedStep.recommendation} wide/></dl>
                </div>
            </div>
        </div>
        <div
            className="mt-5 flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="mb-2 text-sm font-semibold">{t('summary')}</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><span
                    className="text-emerald-600 dark:text-emerald-400">{t('summaryPassed', {count: summary.passed})}</span><span
                    className="text-red-600 dark:text-red-400">{t('summaryFailed', {count: summary.failed})}</span><span
                    className="text-amber-600 dark:text-amber-400">{t('summaryManual', {count: summary.manual})}</span><span
                    className="text-[var(--muted-foreground)]">{t('summaryUnmeasured', {count: summary.unmeasured})}</span>
                </div>
            </div>
            <div className="text-sm text-[var(--muted-foreground)]">{t('history')}</div>
        </div>
    </section>;
}

function ResultItem({label, value, wide = false}: { label: string; value: string; wide?: boolean }): React.JSX.Element {
    return <div className={wide ? 'sm:col-span-2' : undefined}>
        <dt className="mb-1 text-xs text-[var(--muted-foreground)]">{label}</dt>
        <dd className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--foreground)]">{value}</dd>
    </div>;
}
