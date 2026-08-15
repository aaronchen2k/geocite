'use client';

import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {requestJson} from '@/lib/api';
import {useWorkspaceStore} from '@/stores/workspace-store';

type Competitor = {id: number; name: string; aliases: string[]; market: string | null; enabled: boolean};

export function CompetitorBrandsPage(): React.JSX.Element {
  const t = useTranslations('Competitors');
  const brandId = useWorkspaceStore((state) => state.currentBrandId);
  const [items, setItems] = useState<Competitor[]>([]);
  const [editing, setEditing] = useState<Competitor | null>(null);
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [market, setMarket] = useState('');
  const load = () => brandId && requestJson<{items: Competitor[]}>(`brands/${brandId}/competitors`).then((response) => setItems(response.items));
  const reset = () => { setEditing(null); setName(''); setAliases(''); setMarket(''); };

  useEffect(() => { setItems([]); reset(); void load(); }, [brandId]);

  const save = async () => {
    if (!brandId || !name.trim()) return;
    const body = JSON.stringify({name, aliases: aliases.split('\n'), market});
    if (editing) await requestJson(`brands/${brandId}/competitors/${editing.id}`, {method: 'PATCH', headers: {'content-type': 'application/json'}, body});
    else await requestJson(`brands/${brandId}/competitors`, {method: 'POST', headers: {'content-type': 'application/json'}, body});
    reset();
    void load();
  };
  const edit = (item: Competitor) => { setEditing(item); setName(item.name); setAliases(item.aliases.join('\n')); setMarket(item.market ?? ''); };
  const toggle = async (item: Competitor) => { if (!brandId) return; await requestJson(`brands/${brandId}/competitors/${item.id}`, {method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify({enabled: !item.enabled})}); void load(); };

  return <section className="max-w-5xl pb-8"><header className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="mb-2 text-[22px] font-semibold">{t('title')}</h1><p className="text-sm text-[var(--muted-foreground)]">{t('description')}</p></header>{!brandId ? <p className="text-sm text-[var(--muted-foreground)]">{t('noBrand')}</p> : <><section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{editing ? t('editTitle') : t('add')}</h2>{editing && <Button size="sm" variant="ghost" onClick={reset}>{t('cancel')}</Button>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><input aria-label={t('name')} className="h-9 rounded-md border border-[var(--border)] px-3" placeholder={t('name')} value={name} onChange={(event) => setName(event.target.value)}/><select aria-label={t('market')} className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3" value={market} onChange={(event) => setMarket(event.target.value)}><option value="">{t('marketPlaceholder')}</option><option value="cn">{t('marketCn')}</option><option value="global">{t('marketGlobal')}</option><option value="both">{t('marketBoth')}</option></select><textarea aria-label={t('aliases')} className="min-h-20 rounded-md border border-[var(--border)] p-3 sm:col-span-2" placeholder={t('aliasesHint')} value={aliases} onChange={(event) => setAliases(event.target.value)}/></div><div className="mt-3 flex justify-end"><Button onClick={() => void save()} disabled={!name.trim()}>{editing ? t('save') : t('add')}</Button></div></section><div className="mt-5 overflow-x-auto rounded-lg border border-[var(--border)]"><table className="w-full table-fixed text-left text-sm"><colgroup><col/><col/><col className="w-[150px]"/><col className="w-[120px]"/><col className="w-[72px]"/></colgroup><thead className="bg-[var(--muted)]"><tr>{[t('name'), t('aliases'), t('market'), t('status'), ''].map((heading, index) => <th key={`${heading}-${index}`} className="px-3 py-3 font-medium">{heading}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-[var(--border)]"><td className="px-3 py-3">{item.name}</td><td className="px-3 py-3 text-[var(--muted-foreground)]">{item.aliases.join(' / ') || '—'}</td><td className="px-3 py-3">{item.market ? t(`market${item.market === 'cn' ? 'Cn' : item.market === 'global' ? 'Global' : 'Both'}`) : '—'}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><Switch aria-label={`${t('status')}：${item.name}`} checked={item.enabled} onCheckedChange={() => void toggle(item)}/><span className="text-xs text-[var(--muted-foreground)]">{item.enabled ? t('enabled') : t('disabled')}</span></div></td><td className="px-3 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => edit(item)}>{t('edit')}</Button></td></tr>)}{!items.length && <tr><td className="px-3 py-8 text-center text-[var(--muted-foreground)]" colSpan={5}>{t('empty')}</td></tr>}</tbody></table></div></>}</section>;
}
