'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {requestJson} from '@/lib/api';

type Availability = 'unavailable' | 'pending_login' | 'ready';
export type WebReviewStatus = {availability: Availability; lastCheckedAt: string | null; lastFailureReason: string | null; lastReadyAt: string | null};
type Engine = {id: number; webReview?: WebReviewStatus};

const labels: Record<Availability, string> = {unavailable: 'unavailable', pending_login: 'pendingLogin', ready: 'ready'};

export function WebReviewStatusCell({engine}: {engine: Engine}): React.JSX.Element {
  const t = useTranslations('Management.webReview');
  const status = engine.webReview ?? {availability: 'unavailable', lastCheckedAt: null, lastFailureReason: null, lastReadyAt: null};
  return <div className="min-w-28"><span className={status.availability === 'ready' ? 'text-emerald-700 dark:text-emerald-400' : status.availability === 'pending_login' ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--muted-foreground)]'}>{t(labels[status.availability])}</span>{status.availability === 'unavailable' && status.lastFailureReason ? <p className="mt-1 max-w-48 text-xs leading-5 text-[var(--muted-foreground)]">{status.lastFailureReason}</p> : null}</div>;
}

export function WebReviewActions({engine, onChanged}: {engine: Engine; onChanged: () => Promise<void> | void}): React.JSX.Element {
  const t = useTranslations('Management.webReview');
  const [running, setRunning] = useState<'refresh' | 'reset' | 'clear' | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [error, setError] = useState('');

  const run = async (operation: 'refresh' | 'reset' | 'clear') => {
    setRunning(operation); setError('');
    try {
      await requestJson(`engines/${engine.id}/${operation === 'clear' ? 'web-review-profile' : `web-review/${operation}`}`, {method: operation === 'clear' ? 'DELETE' : 'POST'});
      setResetOpen(false); setClearOpen(false); await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('operationFailed')); }
    finally { setRunning(null); }
  };

  return <div className="flex flex-wrap items-center gap-1"><Button size="sm" variant="ghost" onClick={() => void run('refresh')} disabled={running !== null}>{running === 'refresh' ? t('refreshing') : t('refresh')}</Button><Button size="sm" variant="ghost" onClick={() => setResetOpen(true)} disabled={running !== null}>{t('reset')}</Button>{error ? <p role="alert" className="basis-full text-xs text-red-600">{error}</p> : null}<Dialog open={resetOpen} onOpenChange={setResetOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{t('resetTitle')}</DialogTitle></DialogHeader><p className="text-sm leading-6 text-[var(--muted-foreground)]">{t('resetDescription')}</p><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{t('resetKeepsCookies')}</p><button type="button" className="mt-5 w-fit text-sm text-[var(--muted-foreground)] underline underline-offset-4" onClick={() => { setResetOpen(false); setClearOpen(true); }}>{t('clearLoginData')}</button><DialogFooter><Button type="button" variant="outline" size="sm" onClick={() => setResetOpen(false)}>{t('cancel')}</Button><Button type="button" size="sm" onClick={() => void run('reset')} disabled={running !== null}>{running === 'reset' ? t('resetting') : t('confirmReset')}</Button></DialogFooter></DialogContent></Dialog><Dialog open={clearOpen} onOpenChange={setClearOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{t('clearTitle')}</DialogTitle></DialogHeader><p className="text-sm leading-6 text-[var(--muted-foreground)]">{t('clearDescription')}</p><DialogFooter><Button type="button" variant="outline" size="sm" onClick={() => setClearOpen(false)}>{t('cancel')}</Button><Button type="button" variant="destructive" size="sm" onClick={() => void run('clear')} disabled={running !== null}>{running === 'clear' ? t('clearing') : t('confirmClear')}</Button></DialogFooter></DialogContent></Dialog></div>;
}
