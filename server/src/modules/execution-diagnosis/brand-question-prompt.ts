import fs from 'node:fs';
import path from 'node:path';

type BrandPromptInput = { name: string; industry: string | null; description: string | null };

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
  return loadTemplate()
    .replaceAll('{{brandName}}', brand.name)
    .replaceAll('{{industry}}', brand.industry?.trim() || '未填写')
    .replaceAll('{{description}}', brand.description?.trim() || '未填写');
}
