'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {useTranslations} from 'next-intl';
import { ArrowDown, ArrowUp, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001/api/v1';
const PAGE_SIZE = 20;
type Item = Record<string, unknown> & { id: number; name?: string; disabled?: boolean };
type Field = { key: string; label: string; type?: 'text' | 'textarea' | 'number' | 'checkbox' | 'multiselect'; required?: boolean; optionsEndpoint?: string; inverse?: boolean };
type Filter = { key: string; label: string; type?: 'text' | 'boolean' };
type Column = { key: string; label: string; sortable?: boolean; render?: (item: Item) => string };
const selectedValues = (values: Record<string, string | boolean | string[]>, key: string): string[] => Array.isArray(values[key]) ? values[key] : [];

export type ResourceConfig = { endpoint: string; title: string; singular: string; description: string; fields: Field[]; filters: Filter[]; columns: Column[] };

export function ResourceManagementPage({ config }: { config: ResourceConfig }): React.JSX.Element {
  const t = useTranslations('Management');
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean | string[]>>({});
  const [options, setOptions] = useState<Record<string, Item[]>>({});
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (keyword.trim()) params.set('keyword', keyword.trim());
    if (sortBy) { params.set('sortBy', sortBy); params.set('sortOrder', sortOrder); }
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters, keyword, page, sortBy, sortOrder]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`${api}/${config.endpoint}?${query}`);
      if (!response.ok) throw new Error('无法加载列表');
      const body = await response.json();
      setItems(body.items ?? []); setTotal(body.total ?? 0);
      if ((body.items?.length ?? 0) === 0 && body.total > 0 && page > 1) setPage(page - 1);
    } catch { setError(t('apiUnavailable')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [query, config.endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFieldOptions = async () => {
    const fields = config.fields.filter((field) => field.type === 'multiselect' && field.optionsEndpoint);
    const results = await Promise.all(fields.map(async (field) => {
      const response = await fetch(`${api}/${field.optionsEndpoint}?page=1&pageSize=100&disabled=false`);
      return [field.key, response.ok ? ((await response.json()).items ?? []) : []] as const;
    }));
    setOptions(Object.fromEntries(results));
  };
  const openCreate = () => { setEditing(null); setValues(Object.fromEntries(config.fields.map((field) => [field.key, field.type === 'checkbox' ? field.key !== 'disabled' : field.type === 'multiselect' ? [] : '']))); void loadFieldOptions(); setOpen(true); };
  const openEdit = (item: Item) => { setEditing(item); setValues(Object.fromEntries(config.fields.map((field) => { const value = item[field.key]; return [field.key, field.type === 'checkbox' ? Boolean(value) : field.type === 'multiselect' ? Array.isArray(value) ? value.map(String) : [] : String(value ?? '')]; }))); void loadFieldOptions(); setOpen(true); };
  const setFilter = (key: string, value: string) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const toggleSort = (key: string) => { if (sortBy === key) setSortOrder((current) => current === 'ASC' ? 'DESC' : 'ASC'); else { setSortBy(key); setSortOrder('ASC'); } setPage(1); };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const payload: Record<string, string | boolean | number | number[]> = {};
    config.fields.forEach((field) => { const value = values[field.key]; if (field.type === 'checkbox') payload[field.key] = Boolean(value); else if (field.type === 'multiselect') payload[field.key] = Array.isArray(value) ? value.map(Number) : []; else if (value !== '') payload[field.key] = field.type === 'number' ? Number(value) : String(value).trim(); });
    try {
      const response = await fetch(`${api}/${config.endpoint}${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('保存失败');
      setOpen(false); await load();
    } catch { setError(t('saveFailed')); }
  };
  const remove = async (item: Item) => { if (!window.confirm(t('confirmDelete', {name: item.name ?? item.id}))) return; try { const response = await fetch(`${api}/${config.endpoint}/${item.id}`, { method: 'DELETE' }); if (!response.ok) throw new Error(); await load(); } catch { setError(t('deleteFailed')); } };

  return <section>
    <header className="mb-[22px] border-b border-[var(--border)] pb-4"><h1 className="mb-[7px] text-[22px] font-semibold">{config.title}</h1><p className="text-[var(--muted-foreground)]">{config.description}</p></header>
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute left-3 top-2 size-4 text-[var(--muted-foreground)]" /><input aria-label={t('searchResource', {resource: config.singular})} className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--card)] pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]" placeholder={t('search')} value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} /></div>
      {config.filters.map((filter) => filter.type === 'boolean' ? <select key={filter.key} aria-label={filter.label} className="h-8 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm" value={filters[filter.key] ?? ''} onChange={(event) => setFilter(filter.key, event.target.value)}><option value="">{filter.label}</option><option value="true">{filter.key === 'disabled' ? t('disabled') : t('enabled')}</option><option value="false">{filter.key === 'disabled' ? t('enabled') : t('disabled')}</option></select> : <input key={filter.key} aria-label={filter.label} className="h-8 w-36 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]" placeholder={filter.label} value={filters[filter.key] ?? ''} onChange={(event) => setFilter(filter.key, event.target.value)} />)}
      <Button variant="outline" size="icon" aria-label={t('refresh', {resource: config.singular})} onClick={() => void load()}><RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} /></Button>
      <Button size="sm" aria-label={t('createResource', {resource: config.singular})} onClick={openCreate}><Plus className="size-4" />{t('create')}</Button>
    </div>
    {error ? <p role="alert" className="mb-4 rounded-md bg-[#fef3f2] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="scroll-area overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-b border-[var(--border)] bg-[var(--muted)] text-left text-[var(--muted-foreground)]"><tr>{config.columns.map((column) => <th key={column.key} className="px-3 py-3 font-medium">{column.sortable ? <button className="inline-flex items-center gap-1" onClick={() => toggleSort(column.key)}>{column.label}{sortBy === column.key ? sortOrder === 'ASC' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : null}</button> : column.label}</th>)}<th className="w-40 px-3 py-3 font-medium">{t('actions')}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-[var(--border)] last:border-0"><td className="px-3 py-3 font-medium">{item.name}</td>{config.columns.slice(1).map((column) => <td key={column.key} className="px-3 py-3">{column.render ? column.render(item) : item[column.key] === null || item[column.key] === undefined || item[column.key] === '' ? t('none') : String(item[column.key])}</td>)}<td className="w-40 px-3 py-3"><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={t('edit', {name: item.name ?? item.id})} onClick={() => openEdit(item)}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" className="text-[#b42318]" aria-label={t('delete', {name: item.name ?? item.id})} onClick={() => void remove(item)}><Trash2 className="size-4" /></Button></div></td></tr>)}{!loading && !items.length ? <tr><td colSpan={config.columns.length + 1} className="px-3 py-12 text-center text-[var(--muted-foreground)]">{t('empty', {resource: config.singular})}</td></tr> : null}</tbody></table></div>
      <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3"><span className="text-sm text-[var(--muted-foreground)]">{t('summary', {total, page, pageCount})}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>{t('previous')}</Button><Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage(page + 1)}>{t('next')}</Button></div></div>
    </section>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{editing ? t('editResource', {resource: config.singular}) : t('createResource', {resource: config.singular})}</DialogTitle></DialogHeader><form onSubmit={submit}><div className="grid gap-3 sm:grid-cols-2">{config.fields.map((field) => <label key={field.key} className={field.type === 'textarea' || field.type === 'multiselect' ? 'grid gap-1 sm:col-span-2' : 'grid gap-1'}><span className="text-sm text-[var(--muted-foreground)]">{field.type === 'checkbox' ? null : field.label}{field.required ? ' *' : ''}</span>{field.type === 'checkbox' ? <span className="flex h-8 items-center gap-2 text-sm text-[var(--foreground)]"><Switch aria-label={field.label} checked={field.inverse ? !Boolean(values[field.key]) : Boolean(values[field.key])} onCheckedChange={(checked) => setValues((current) => ({ ...current, [field.key]: field.inverse ? !checked : checked }))} />{field.label}</span> : field.type === 'multiselect' ? <span className="max-h-36 overflow-y-auto rounded-md border border-[var(--border)] p-2">{(options[field.key] ?? []).map((option) => <label key={option.id} className="flex items-center gap-2 py-1 text-sm"><input aria-label={String(option.name)} type="checkbox" checked={selectedValues(values, field.key).includes(String(option.id))} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked ? [...selectedValues(current, field.key), String(option.id)] : selectedValues(current, field.key).filter((id) => id !== String(option.id)) }))} />{String(option.name)}</label>)}</span> : field.type === 'textarea' ? <textarea aria-label={field.label} required={field.required} className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--card)] p-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]" value={String(values[field.key] ?? '')} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} /> : <input aria-label={field.label} required={field.required} type={field.type === 'number' ? 'number' : 'text'} className="h-8 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]" value={String(values[field.key] ?? '')} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />}</label>)}</div><DialogFooter><Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>{t('cancel')}</Button><Button type="submit" size="sm">{t('save')}</Button></DialogFooter></form></DialogContent></Dialog>
  </section>;
}
