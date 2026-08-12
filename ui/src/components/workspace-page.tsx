'use client';

import { ResourceManagementPage, type ResourceConfig } from '@/components/admin/resource-management-page';
import {useTranslations} from 'next-intl';

function resources(t: ReturnType<typeof useTranslations>): Record<string, ResourceConfig> {
  const field = (key: string, label: string, type?: 'text' | 'textarea' | 'number' | 'checkbox', required?: boolean) => ({key, label, type, required});
  const status = (item: {enabled?: unknown}) => item.enabled === false ? t('disabled') : t('enabled');
  return {
    brands: { endpoint: 'brands', title: t('brands.title'), singular: t('brands.singular'), description: t('brands.description'), fields: [field('name', t('name'), 'text', true), field('code', t('code'), 'text', true), field('website', t('website')), field('industry', t('industry')), field('description', t('descriptionField'), 'textarea'), field('enabled', t('status'), 'checkbox')], filters: [{key: 'enabled', label: t('allStatus'), type: 'boolean'}], columns: [{key: 'name', label: t('name'), sortable: true}, {key: 'code', label: t('code'), sortable: true}, {key: 'industry', label: t('industry'), sortable: true}, {key: 'enabled', label: t('status'), sortable: true, render: status}] },
    engines: { endpoint: 'engines', title: t('engines.title'), singular: t('engines.singular'), description: t('engines.description'), fields: [field('name', t('name'), 'text', true), field('code', t('code'), 'text', true), field('vendor', t('vendor'), 'text', true), field('description', t('descriptionField'), 'textarea'), field('enabled', t('status'), 'checkbox')], filters: [{key: 'vendor', label: t('vendor')}, {key: 'enabled', label: t('allStatus'), type: 'boolean'}], columns: [{key: 'name', label: t('name'), sortable: true}, {key: 'code', label: t('code'), sortable: true}, {key: 'vendor', label: t('vendor'), sortable: true}, {key: 'enabled', label: t('status'), sortable: true, render: status}] },
    models: { endpoint: 'models', title: t('models.title'), singular: t('models.singular'), description: t('models.description'), fields: [field('name', t('name'), 'text', true), field('modelName', t('modelName'), 'text', true), field('provider', t('provider'), 'text', true), field('baseUrl', t('baseUrl')), field('apiKey', t('apiKey')), field('enabled', t('status'), 'checkbox')], filters: [{key: 'provider', label: t('provider')}, {key: 'enabled', label: t('allStatus'), type: 'boolean'}, {key: 'isDefault', label: t('allDefaultStatus'), type: 'boolean'}], columns: [{key: 'name', label: t('name'), sortable: true}, {key: 'modelName', label: t('modelName'), sortable: true}, {key: 'provider', label: t('provider'), sortable: true}, {key: 'enabled', label: t('status'), sortable: true, render: status}, {key: 'isDefault', label: t('default'), sortable: true, render: (item) => item.isDefault ? t('defaultModel') : t('none')}] },
    'rag-agents': { endpoint: 'rag-agents', title: t('ragAgents.title'), singular: t('ragAgents.singular'), description: t('ragAgents.description'), fields: [field('name', t('name'), 'text', true), field('code', t('code'), 'text', true), field('brandId', t('brandId'), 'number', true), field('modelId', t('modelId'), 'number', true), field('description', t('descriptionField'), 'textarea'), field('systemPrompt', t('systemPrompt'), 'textarea'), field('enabled', t('status'), 'checkbox')], filters: [{key: 'brandId', label: t('brandId')}, {key: 'modelId', label: t('modelId')}, {key: 'enabled', label: t('allStatus'), type: 'boolean'}], columns: [{key: 'name', label: t('name'), sortable: true}, {key: 'code', label: t('code'), sortable: true}, {key: 'brandId', label: t('brandId'), sortable: true}, {key: 'modelId', label: t('modelId'), sortable: true}, {key: 'enabled', label: t('status'), sortable: true, render: status}] },
  };
}

export function WorkspacePage({ title, description, admin }: { title?: string; description?: string; admin?: string }): React.JSX.Element | null {
  const t = useTranslations('Management');
  const pageT = useTranslations('Pages');
  const configs = resources(t);
  if (admin && configs[admin]) return <ResourceManagementPage config={configs[admin]} />;
  return <section><header className="mb-[22px] border-b border-[var(--border)] pb-4"><h1 className="mb-[7px] text-[22px] font-semibold">{title}</h1><p className="text-[var(--muted-foreground)]">{description}</p></header><div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-5"><p className="text-[var(--muted-foreground)]">{pageT('placeholder')}</p></div></section>;
}
