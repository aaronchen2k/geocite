'use client';

import {Icon} from '@iconify/react';
import {useLocale, useTranslations} from 'next-intl';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {buildApiUrl, logSseRequest, logSseResponse} from '@/lib/api';

type DebugLog = { sequence: number; message: string; createdAt: string | null };

export function ExecutionDebugLogPage(): React.JSX.Element {
  const t = useTranslations('DiagnosisExecution');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const brandId = Number(searchParams.get('brandId'));
  const runId = Number(searchParams.get('runId'));
  const [entries, setEntries] = useState<DebugLog[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({top: bodyRef.current.scrollHeight, behavior: 'smooth'});
  }, [entries]);

  useEffect(() => {
    if (!Number.isInteger(brandId) || brandId <= 0 || !Number.isInteger(runId) || runId <= 0) {
      setError(t('debugLogs.invalidRun'));
      return;
    }
    const url = buildApiUrl(`brands/${brandId}/execution-checks/${runId}/events`);
    logSseRequest(url);
    const source = new EventSource(url);
    source.addEventListener('debugLog', ((event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { sequence?: number; message?: string; createdAt?: string };
        logSseResponse(url, data);
        if (typeof data.sequence !== 'number' || typeof data.message !== 'string') return;
        const sequence = data.sequence;
        const message = data.message;
        const createdAt = data.createdAt ?? null;
        setEntries((current) => current.some((entry) => entry.sequence === sequence)
          ? current
          : [...current, {sequence, message, createdAt}]);
      } catch {
        setError(t('debugLogs.invalidEvent'));
      }
    }) as EventListener);
    source.onopen = () => { setConnected(true); setError(''); };
    source.onerror = () => { setConnected(false); };
    return () => source.close();
  }, [brandId, runId, t]);

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(entries.map((entry) => `${entry.createdAt ?? ''} ${entry.message}`.trim()).join('\n'));
      setCopied(true);
    } catch {
      setError(t('debugLogs.copyFailed'));
    }
    window.setTimeout(() => setCopied(false), 1600);
  };

  return <main className="flex h-screen flex-col overflow-hidden bg-[var(--background)] px-4 py-5 text-[var(--foreground)] sm:px-6 lg:px-8">
    <header className="mx-auto flex w-full max-w-none flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
      <div className="min-w-0"><div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]"><Icon icon="lucide:scroll-text" className="size-4" aria-hidden="true" />{t('debugLogs.label')}</div><h1 className="mt-2 text-xl font-semibold tracking-[-0.02em]">{t('debugLogs.title', {runId})}</h1></div>
      <div className="flex flex-wrap items-center gap-2"><Button asChild variant="outline" size="sm"><Link href={`/${locale}/diagnosis/diagnosis-execution`}><Icon icon="lucide:arrow-left" aria-hidden="true" />{t('debugLogs.back')}</Link></Button><Button variant="outline" size="sm" disabled={!entries.length} onClick={() => void copyLogs()}><Icon icon={copied ? 'lucide:check' : 'lucide:copy'} aria-hidden="true" />{copied ? t('debugLogs.copied') : t('debugLogs.copy')}</Button></div>
    </header>
    <section className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-sm"><span className="inline-flex items-center gap-2 text-[var(--muted-foreground)]"><Icon icon="lucide:refresh-cw" className={connected ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />{error ? t('debugLogs.error') : connected ? t('debugLogs.live') : t('debugLogs.connecting')}</span><span className="text-xs text-[var(--muted-foreground)]">{t('debugLogs.count', {count: entries.length})}</span></div>
      <div ref={bodyRef} className="scroll-area min-h-0 flex-1 overflow-auto bg-[var(--muted)]/30 p-4 font-mono text-sm leading-7 sm:p-5">{error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">{error}</div> : entries.length ? entries.map((entry, index) => <div key={entry.sequence} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 border-b border-[var(--border)]/60 py-1 last:border-0"><span className="select-none text-right text-[var(--muted-foreground)]">{index + 1}</span><pre className="whitespace-pre-wrap break-words text-[var(--foreground)]">{`${entry.createdAt ?? ''} ${entry.message}`.trim()}</pre></div>) : <div className="flex h-full flex-col items-center justify-center gap-3 text-center font-sans text-sm text-[var(--muted-foreground)]"><Icon icon={connected ? 'lucide:scroll-text' : 'lucide:loader-circle'} className={connected ? 'size-5' : 'size-5 animate-spin'} aria-hidden="true" />{connected ? t('debugLogs.empty') : t('debugLogs.loading')}</div>}</div>
    </section>
  </main>;
}
