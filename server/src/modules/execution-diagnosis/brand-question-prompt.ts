import fs from 'node:fs';
import path from 'node:path';

export const QUESTION_GROUPS = ['品牌基础提问', '核心业务能力提问', '竞品对比提问'] as const;
export type QuestionGroup = typeof QUESTION_GROUPS[number];
export type QuestionTaxonomyDefinition = {
  code: string;
  primaryCode: string;
  primaryCategory: QuestionGroup;
  secondaryCategory: string;
  weight: number;
  example: string;
  version?: string;
  ordr?: number;
};

export const defaultSamplingQuestionCount = 20;
export const QUESTION_TAXONOMY_VERSION = 'v1';
export const DEFAULT_QUESTION_TAXONOMY: readonly QuestionTaxonomyDefinition[] = [
  { code: 'fact_query', primaryCode: 'brand_basic', primaryCategory: '品牌基础提问', secondaryCategory: '事实查询', weight: 20, example: '某品牌的主营产品和服务是什么？', ordr: 10 },
  { code: 'brand_verification', primaryCode: 'brand_basic', primaryCategory: '品牌基础提问', secondaryCategory: '品牌验证', weight: 8, example: '某品牌是否提供官方售后与服务保障？', ordr: 20 },
  { code: 'scenario', primaryCode: 'core_capability', primaryCategory: '核心业务能力提问', secondaryCategory: '场景', weight: 15, example: '什么场景下适合选择这类服务？', ordr: 30 },
  { code: 'risk', primaryCode: 'core_capability', primaryCategory: '核心业务能力提问', secondaryCategory: '风险', weight: 12, example: '选择这类服务时需要注意哪些风险？', ordr: 40 },
  { code: 'capability_confirmation', primaryCode: 'core_capability', primaryCategory: '核心业务能力提问', secondaryCategory: '能力确认', weight: 15, example: '这类服务能否满足我的核心需求？', ordr: 50 },
  { code: 'comparison', primaryCode: 'competitor_comparison', primaryCategory: '竞品对比提问', secondaryCategory: '比较', weight: 12, example: '同类品牌之间有哪些关键差异？', ordr: 60 },
  { code: 'alternative', primaryCode: 'competitor_comparison', primaryCategory: '竞品对比提问', secondaryCategory: '替代', weight: 10, example: '如果不选择当前方案，有哪些替代选择？', ordr: 70 },
  { code: 'recommendation', primaryCode: 'competitor_comparison', primaryCategory: '竞品对比提问', secondaryCategory: '推荐', weight: 8, example: '面对这类需求，推荐哪个品牌或方案？', ordr: 80 },
];

type BrandPromptInput = { name: string; industry: string | null; description: string | null; samplingQuestionCount?: number | null };
let cachedTemplate: string | null = null;

function loadTemplate(): string {
  if (cachedTemplate) return cachedTemplate;
  const candidates = [path.resolve(process.cwd(), '../assert/prompts/brand-question-generation.md'), path.resolve(process.cwd(), 'assert/prompts/brand-question-generation.md')];
  const templateFile = candidates.find((candidate) => fs.existsSync(candidate));
  if (!templateFile) throw new Error('未找到品牌问答提示词模板');
  cachedTemplate = fs.readFileSync(templateFile, 'utf8');
  return cachedTemplate;
}

export function validateQuestionTaxonomy(taxonomy: readonly QuestionTaxonomyDefinition[]): void {
  if (taxonomy.length !== 8 || taxonomy.some((item) => !QUESTION_GROUPS.includes(item.primaryCategory) || !item.secondaryCategory || !Number.isInteger(item.weight) || item.weight <= 0) || taxonomy.reduce((sum, item) => sum + item.weight, 0) !== 100) {
    throw new Error('问题分类权重必须包含 8 个二级分类且总计 100');
  }
}

export function allocateQuestionCategories(total: number, taxonomy: readonly QuestionTaxonomyDefinition[]): Record<string, number> {
  validateQuestionTaxonomy(taxonomy);
  const allocation = Object.fromEntries(taxonomy.map((item) => [item.code, Math.floor(total * item.weight / 100)])) as Record<string, number>;
  const fractions = taxonomy.map((item, order) => ({ item, order, fraction: total * item.weight / 100 - allocation[item.code] })).sort((left, right) => right.fraction - left.fraction || left.order - right.order);
  for (let index = 0; Object.values(allocation).reduce((sum, value) => sum + value, 0) < total; index += 1) allocation[fractions[index].item.code] += 1;
  return allocation;
}

export function buildBrandQuestionPrompt(brand: BrandPromptInput, taxonomy: readonly QuestionTaxonomyDefinition[] = DEFAULT_QUESTION_TAXONOMY): string {
  const samplingQuestionCount = brand.samplingQuestionCount ?? defaultSamplingQuestionCount;
  const allocation = allocateQuestionCategories(samplingQuestionCount, taxonomy);
  const taxonomyRules = taxonomy.map((item) => `- ${item.secondaryCategory}（${item.primaryCategory}，权重 ${item.weight}，配额 ${allocation[item.code]} 题）：示例「${item.example}」`).join('\n');
  return loadTemplate()
    .replaceAll('{{brandName}}', brand.name)
    .replaceAll('{{industry}}', brand.industry?.trim() || '未填写')
    .replaceAll('{{description}}', brand.description?.trim() || '未填写')
    .replaceAll('{{samplingQuestionCount}}', String(samplingQuestionCount))
    .replaceAll('{{taxonomyRules}}', taxonomyRules);
}
