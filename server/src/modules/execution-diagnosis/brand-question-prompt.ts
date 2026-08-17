import fs from 'node:fs';
import path from 'node:path';

export const QUESTION_GROUPS = ['品牌基础提问', '核心业务能力提问', '竞品对比提问'] as const;
export type QuestionGroup = typeof QUESTION_GROUPS[number];
export type QuestionCategoryRatio = { brandBasic: number; coreCapability: number; competitorComparison: number };
export type QuestionCategoryAllocation = QuestionCategoryRatio;

export const defaultSamplingQuestionCount = 10;
export const defaultQuestionCategoryRatio: QuestionCategoryRatio = { brandBasic: 1, coreCapability: 2, competitorComparison: 1 };

type BrandPromptInput = {
  name: string;
  industry: string | null;
  description: string | null;
  samplingQuestionCount?: number | null;
  questionCategoryRatio?: QuestionCategoryRatio | null;
};

let cachedTemplate: string | null = null;

function loadTemplate(): string {
  if (cachedTemplate) return cachedTemplate;
  const candidates = [
    path.resolve(process.cwd(), '../assert/prompts/brand-question-generation.md'),
    path.resolve(process.cwd(), 'assert/prompts/brand-question-generation.md'),
  ];
  const templateFile = candidates.find((candidate) => fs.existsSync(candidate));
  if (!templateFile) throw new Error('未找到品牌问答提示词模板');
  cachedTemplate = fs.readFileSync(templateFile, 'utf8');
  return cachedTemplate;
}

export function buildBrandQuestionPrompt(brand: BrandPromptInput): string {
  const samplingQuestionCount = brand.samplingQuestionCount ?? defaultSamplingQuestionCount;
  const questionCategoryRatio = brand.questionCategoryRatio ?? defaultQuestionCategoryRatio;
  const allocation = allocateQuestionCategories(samplingQuestionCount, questionCategoryRatio);
  return loadTemplate()
    .replaceAll('{{brandName}}', brand.name)
    .replaceAll('{{industry}}', brand.industry?.trim() || '未填写')
    .replaceAll('{{description}}', brand.description?.trim() || '未填写')
    .replaceAll('{{samplingQuestionCount}}', String(samplingQuestionCount))
    .replaceAll('{{brandBasicQuota}}', String(allocation.brandBasic))
    .replaceAll('{{coreCapabilityQuota}}', String(allocation.coreCapability))
    .replaceAll('{{competitorComparisonQuota}}', String(allocation.competitorComparison));
}

export function allocateQuestionCategories(total: number, ratio: QuestionCategoryRatio): QuestionCategoryAllocation {
  const sum = ratio.brandBasic + ratio.coreCapability + ratio.competitorComparison;
  const base = {
    brandBasic: Math.floor(total * ratio.brandBasic / sum),
    coreCapability: Math.floor(total * ratio.coreCapability / sum),
    competitorComparison: Math.floor(total * ratio.competitorComparison / sum),
  };
  const fractions = (['brandBasic', 'coreCapability', 'competitorComparison'] as const)
    .map((key, order) => ({ key, order, fraction: total * ratio[key] / sum - base[key] }))
    .sort((left, right) => right.fraction - left.fraction || left.order - right.order);
  for (let index = 0; base.brandBasic + base.coreCapability + base.competitorComparison < total; index++) base[fractions[index].key]++;
  return base;
}
