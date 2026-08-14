'use client';

import { Icon } from '@iconify/react';
import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { requestJson } from '@/lib/api';
import { useWorkspaceStore } from '@/stores/workspace-store';

type Configuration = { questions: string[]; prompt: string };
type QuestionItem = { id: string; text: string };

const createQuestion = (text = ''): QuestionItem => ({ id: crypto.randomUUID(), text });

function defaultPrompt(brand: { name: string; industry?: string | null; description?: string | null }): string {
  return `请围绕品牌“${brand.name}”生成5个适合 GEO 诊断和 AI 问答采样的问题。品牌所属行业为“${brand.industry?.trim() || '未填写'}”，品牌简介为“${brand.description?.trim() || '未填写'}”。请重点覆盖用户需求、核心服务或产品、选择依据、可信度、价格或交付预期，以及与同类方案的差异；问题应自然、具体、便于验证品牌在 AI 回答中的可见度。`;
}

function isSupersededDefaultPrompt(prompt: string): boolean {
  return prompt.startsWith('品牌名称：') || (prompt.includes('生成适合 GEO 诊断和 AI 问答采样的 5 个问题。') && !prompt.includes('请重点覆盖用户需求'));
}

function SortableQuestion({ id, index, question, placeholder, removeLabel, onChange, onRemove }: { id: string; index: number; question: string; placeholder: string; removeLabel: string; onChange(value: string): void; onRemove(): void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="flex gap-2 rounded-md bg-[var(--card)]"><button type="button" className="cursor-grab touch-none pt-2 text-[var(--muted-foreground)] active:cursor-grabbing" aria-label="拖动排序" {...attributes} {...listeners}><Icon icon="lucide:grip-vertical" className="size-4" /></button><span className="pt-2 text-sm text-[var(--muted-foreground)]">{index + 1}</span><input className="h-9 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]" value={question} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /><Button size="icon" variant="ghost" aria-label={removeLabel} onClick={onRemove}><Icon icon="lucide:trash-2" /></Button></div>;
}

export function DiagnosisConfigurationPage(): React.JSX.Element {
  const t = useTranslations('DiagnosisConfiguration');
  const brand = useWorkspaceStore((state) => state.brands.find((item) => item.id === state.currentBrandId) ?? null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [prompt, setPrompt] = useState('');
  const [generated, setGenerated] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    setGenerated([]); setError('');
    if (!brand) { setQuestions([]); return; }
    void requestJson<Configuration>(`brands/${brand.id}/diagnosis-questions`).then((configuration) => { setQuestions(configuration.questions.map(createQuestion)); setPrompt(!configuration.prompt || isSupersededDefaultPrompt(configuration.prompt) ? defaultPrompt(brand) : configuration.prompt); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('loadFailed')));
  }, [brand?.id, t]);

  const save = async () => {
    if (!brand) return;
    setSaving(true); setError('');
    try { const configuration = await requestJson<Configuration>(`brands/${brand.id}/diagnosis-questions`, { method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({questions: questions.map((item) => item.text), prompt}) }); setQuestions(configuration.questions.map(createQuestion)); setPrompt(configuration.prompt); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('saveFailed')); }
    finally { setSaving(false); }
  };
  const savePrompt = async () => {
    if (!brand) return;
    setSaving(true); setError('');
    try { const configuration = await requestJson<Configuration>(`brands/${brand.id}/diagnosis-questions/prompt`, { method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({prompt}) }); setPrompt(configuration.prompt); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('saveFailed')); }
    finally { setSaving(false); }
  };
  const generate = async () => {
    if (!brand) return;
    setLoading(true); setError('');
    try { const response = await requestJson<{questions: string[]}>(`brands/${brand.id}/diagnosis-questions/generate`, { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({prompt}) }); setGenerated(response.questions); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('generateFailed')); }
    finally { setLoading(false); }
  };
  const update = (id: string, text: string) => setQuestions((current) => current.map((item) => item.id === id ? {...item, text} : item));
  const toggleGenerated = (question: string, selected: boolean) => {
    setQuestions((current) => selected
      ? current.some((item) => item.text === question) ? current : [...current, createQuestion(question)]
      : current.filter((item) => item.text !== question));
  };
  const toggleAllGenerated = () => {
    const generatedTexts = new Set(generated);
    const allSelected = generated.every((question) => questions.some((item) => item.text === question));
    setQuestions((current) => allSelected
      ? current.filter((item) => !generatedTexts.has(item.text))
      : [...current, ...generated.filter((question) => !current.some((item) => item.text === question)).map(createQuestion)]);
  };
  const reorder = (event: DragEndEvent) => { if (!event.over || event.active.id === event.over.id) return; setQuestions((current) => arrayMove(current, current.findIndex((item) => item.id === event.active.id), current.findIndex((item) => item.id === event.over?.id))); };

  return <section className="pb-8">
    <header className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="mb-2 text-[22px] font-semibold">{t('title')}</h1><p className="text-sm leading-6 text-[var(--muted-foreground)]">{t('description')}</p></header>
    <div className="mb-5 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm"><span className="text-[var(--muted-foreground)]">{t('brandLabel')}</span>{brand?.name ?? t('noBrand')}</div>
    {error && <p role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <section className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">{t('manualTitle')}</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">{t('manualDescription')}</p></div><Button size="sm" variant="outline" disabled={!brand} onClick={() => setQuestions((items) => [...items, createQuestion()])}><Icon icon="lucide:plus" />{t('add')}</Button></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}><SortableContext items={questions.map((item) => item.id)} strategy={verticalListSortingStrategy}><div className="scroll-area space-y-3 pr-1">{questions.map((question, index) => <SortableQuestion key={question.id} id={question.id} index={index} question={question.text} placeholder={t('questionPlaceholder')} removeLabel={t('remove')} onChange={(value) => update(question.id, value)} onRemove={() => setQuestions((items) => items.filter((item) => item.id !== question.id))} />)}{!questions.length && <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">{t('empty')}</p>}</div></SortableContext></DndContext><div className="mt-5 flex justify-end"><Button size="sm" disabled={!brand || saving} onClick={() => void save()}>{saving ? t('saving') : t('save')}</Button></div></section>
      <section className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><h2 className="font-semibold">{t('generateTitle')}</h2><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{t('generateDescription')}</p><label className="mt-4 grid gap-2 text-sm"><span>{t('prompt')}</span><textarea className="h-40 resize-none rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]" value={prompt} placeholder={t('promptPlaceholder')} onChange={(event) => setPrompt(event.target.value)} /></label><div className="mt-4 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={!brand || saving || !prompt.trim()} onClick={() => void savePrompt()}><Icon icon="lucide:save" />{t('savePrompt')}</Button><Button size="sm" disabled={!brand || loading || !prompt.trim()} onClick={() => void generate()}><Icon icon="lucide:sparkles" />{loading ? t('generating') : t('generate')}</Button></div>{generated.length > 0 && <div className="mt-5 min-h-0 flex-1 border-t border-[var(--border)] pt-4"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-medium">{t('suggestions')}</p><button type="button" className="text-sm text-[var(--primary)] hover:underline" onClick={toggleAllGenerated}>{generated.every((question) => questions.some((item) => item.text === question)) ? t('deselectAll') : t('selectAll')}</button></div><div className="scroll-area h-full space-y-2 overflow-y-auto pr-1">{generated.map((question) => {
        const selected = questions.some((item) => item.text === question);
        return <label key={question} className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border)] p-3 text-sm hover:bg-[var(--muted)]/40"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={selected} onChange={(event) => toggleGenerated(question, event.target.checked)} /><span>{question}</span></label>;
      })}</div><p className="mt-3 text-xs text-[var(--muted-foreground)]">{t('suggestionHint')}</p></div>}</section>
    </div>
  </section>;
}
