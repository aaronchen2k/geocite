import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { BrandDiagnosisQuestionEntity } from './execution-diagnosis.entity';
import { DiagnosisQuestionDto } from './diagnosis-configuration.dto';
import { ModelEntity } from '../models/model.entity';
import { parseGeneratedQuestions } from './diagnosis-questions';
import { completionTokenLimit, temperatureSetting, upstreamErrorMessage } from './model-request';
import { allocateQuestionCategories, buildBrandQuestionPrompt, defaultQuestionCategoryRatio, defaultSamplingQuestionCount, QUESTION_GROUPS, type QuestionCategoryRatio, type QuestionGroup } from './brand-question-prompt';

const defaultSitemapUrlLimit = 10;
const questionCategoryKeys = ['brandBasic', 'coreCapability', 'competitorComparison'] as const;

export type SamplingConfig = { samplingQuestionCount: number; questionCategoryRatio: QuestionCategoryRatio };

export function validateSamplingConfig(config: SamplingConfig): void {
  const values = questionCategoryKeys.map((key) => config.questionCategoryRatio[key]);
  if (values.some((value) => !Number.isInteger(value) || value <= 0)) throw new BadRequestException('问题分类比例必须全部大于 0');
  if (values.some((value) => value > 100)) throw new BadRequestException('问题分类比例必须为 1 到 100 之间的整数');
  if (!Number.isInteger(config.samplingQuestionCount) || config.samplingQuestionCount < 4 || config.samplingQuestionCount > 150) throw new BadRequestException('诊断问句总数必须是 4 到 150 之间的整数');
}

@Injectable()
export class DiagnosisConfigurationService {
  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(ModelEntity) private readonly models: Repository<ModelEntity>,
    @InjectRepository(BrandDiagnosisQuestionEntity) private readonly questions: Repository<BrandDiagnosisQuestionEntity>,
  ) {}

  async list(brandId: number) {
    const brand = await this.brand(brandId);
    let saved = await this.questions.find({ where: { brandId }, order: { ordr: 'ASC', id: 'ASC' } });
    if (!saved.length && brand.questions?.length) saved = await this.questions.save(brand.questions.map((question, ordr) => this.questions.create({ brandId, question, group: '核心业务能力提问', market: 'cn', brandProbe: false, ordr })));
    const legacyQuestions = saved.filter((item) => item.group !== normalizeQuestionGroup(item.group));
    if (legacyQuestions.length) {
      legacyQuestions.forEach((item) => { item.group = '核心业务能力提问'; });
      await this.questions.save(legacyQuestions);
    }
    const items = saved.map((item) => ({ id: item.id, text: item.question, group: normalizeQuestionGroup(item.group), market: item.market, brandProbe: item.brandProbe }));
    return { questions: items, prompt: brand.questionsPrompt ?? buildBrandQuestionPrompt(brand), sitemapUrlLimit: brand.sitemapUrlLimit ?? defaultSitemapUrlLimit, ...this.samplingConfig(brand) };
  }
  async save(brandId: number, inputs: DiagnosisQuestionDto[], prompt?: string, sitemapUrlLimit?: number, samplingQuestionCount?: number, questionCategoryRatio?: QuestionCategoryRatio) {
    const brand = await this.brand(brandId);
    if (samplingQuestionCount !== undefined || questionCategoryRatio !== undefined) validateSamplingConfig({ samplingQuestionCount: samplingQuestionCount ?? brand.samplingQuestionCount ?? defaultSamplingQuestionCount, questionCategoryRatio: questionCategoryRatio ?? brand.questionCategoryRatio ?? defaultQuestionCategoryRatio });
    const normalized = this.normalize(inputs);
    if (prompt !== undefined) brand.questionsPrompt = prompt.trim() || null;
    if (sitemapUrlLimit !== undefined) brand.sitemapUrlLimit = sitemapUrlLimit;
    if (samplingQuestionCount !== undefined) brand.samplingQuestionCount = samplingQuestionCount;
    if (questionCategoryRatio !== undefined) brand.questionCategoryRatio = questionCategoryRatio;
    await this.brands.save(brand);
    await this.questions.delete({ brandId });
    if (normalized.length) await this.questions.save(normalized.map((item, ordr) => this.questions.create({ brandId, question: item.text, group: item.group, market: item.market, brandProbe: item.brandProbe, ordr })));
    return this.list(brandId);
  }
  async savePrompt(brandId: number, prompt: string) {
    const brand = await this.brand(brandId);
    brand.questionsPrompt = prompt.trim() || null;
    await this.brands.save(brand);
    return this.list(brandId);
  }
  async resetPrompt(brandId: number) {
    const brand = await this.brand(brandId);
    brand.questionsPrompt = buildBrandQuestionPrompt(brand);
    await this.brands.save(brand);
    return this.list(brandId);
  }
  async generate(brandId: number, extraPrompt?: string) {
    const brand = await this.brand(brandId);
    if (extraPrompt !== undefined) { brand.questionsPrompt = extraPrompt.trim() || null; await this.brands.save(brand); }
    const model = await this.models.findOne({ where: { isDefault: true, disabled: false, deleted: false } });
    if (!model?.baseUrl || !model.apiKey) throw new BadRequestException('未配置可用的默认模型，请先在模型管理中设置默认模型和 API Key。');
    const samplingConfig = this.samplingConfig(brand);
    validateSamplingConfig(samplingConfig);
    const quota = allocateQuestionCategories(samplingConfig.samplingQuestionCount, samplingConfig.questionCategoryRatio);
    const prompt = `${buildBrandQuestionPrompt(brand)}${extraPrompt ? `\n\n## 补充提示词\n\n${extraPrompt}` : ''}`;
    const questions = parseGeneratedQuestions(await this.complete(model, prompt), Number.MAX_SAFE_INTEGER);
    if (questions.length !== samplingConfig.samplingQuestionCount) throw new BadRequestException(`默认模型仅返回 ${questions.length} 个有效问题，需要严格返回 ${samplingConfig.samplingQuestionCount} 个问题。`);
    const categoryCounts = { brandBasic: 0, coreCapability: 0, competitorComparison: 0 };
    for (const question of questions) {
      if (question.group === '品牌基础提问') categoryCounts.brandBasic++;
      else if (question.group === '核心业务能力提问') categoryCounts.coreCapability++;
      else if (question.group === '竞品对比提问') categoryCounts.competitorComparison++;
      else throw new BadRequestException(`问题分类配额不匹配：仅允许 ${QUESTION_GROUPS.join('、')}。`);
    }
    if (questionCategoryKeys.some((key) => categoryCounts[key] !== quota[key])) throw new BadRequestException(`问题分类配额不匹配：基础 ${quota.brandBasic}、核心 ${quota.coreCapability}、竞品 ${quota.competitorComparison}。`);
    return { questions };
  }
  private async complete(model: ModelEntity, prompt: string) {
    let response: Response;
    try {
      response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${model.apiKey}` }, body: JSON.stringify({ model: model.modelName, messages: [{ role: 'user', content: prompt }], ...temperatureSetting(model, 0.4), ...completionTokenLimit(model, 700) }), signal: AbortSignal.timeout(45_000) });
    } catch { throw new BadRequestException('调用默认模型失败，请检查模型地址、网络和 API Key。'); }
    const body = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }> };
    if (!response.ok) throw new BadRequestException(upstreamErrorMessage(body, response.status));
    return body.choices?.[0]?.message?.content ?? '';
  }
  private normalize(inputs: DiagnosisQuestionDto[]) { const seen = new Set<string>(); return inputs.map((item) => ({ text: item.text.trim(), group: normalizeQuestionGroup(item.group), market: item.market ?? 'cn', brandProbe: item.brandProbe === true })).filter((item) => item.text && !seen.has(item.text) && Boolean(seen.add(item.text))).slice(0, 50); }
  private samplingConfig(brand: Pick<BrandEntity, 'samplingQuestionCount' | 'questionCategoryRatio'>): SamplingConfig { return { samplingQuestionCount: brand.samplingQuestionCount ?? defaultSamplingQuestionCount, questionCategoryRatio: brand.questionCategoryRatio ?? defaultQuestionCategoryRatio }; }
  private async brand(id: number) { const brand = await this.brands.findOne({ where: { id, deleted: false } }); if (!brand) throw new NotFoundException(`Brand ${id} 不存在`); return brand; }
}

function normalizeQuestionGroup(group: string | undefined): QuestionGroup {
  return QUESTION_GROUPS.includes(group as QuestionGroup) ? group as QuestionGroup : '核心业务能力提问';
}
