import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { BrandDiagnosisQuestionEntity } from './execution-diagnosis.entity';
import { DiagnosisQuestionDto } from './diagnosis-configuration.dto';
import { ModelEntity } from '../models/model.entity';
import { parseGeneratedQuestions } from './diagnosis-questions';
import { completionTokenLimit, temperatureSetting, upstreamErrorMessage } from './model-request';
import { allocateQuestionCategories, buildBrandQuestionPrompt, DEFAULT_QUESTION_TAXONOMY, defaultSamplingQuestionCount, QUESTION_GROUPS, QUESTION_TAXONOMY_VERSION, type QuestionGroup, type QuestionTaxonomyDefinition, validateQuestionTaxonomy } from './brand-question-prompt';
import { DiagnosisQuestionTaxonomyEntity } from './question-taxonomy.entity';

const defaultSitemapUrlLimit = 10;
const fallbackPrimary: QuestionGroup = '核心业务能力提问';
const fallbackSecondary = '能力确认';
/** Explicit legacy group-to-taxonomy mapping; unknown legacy values use the fallback only. */
export const LEGACY_GROUP_CATEGORY_MAP: Readonly<Record<QuestionGroup, { primaryCategory: QuestionGroup; secondaryCategory: string }>> = {
  '品牌基础提问': { primaryCategory: '品牌基础提问', secondaryCategory: '事实查询' },
  '核心业务能力提问': { primaryCategory: '核心业务能力提问', secondaryCategory: '能力确认' },
  '竞品对比提问': { primaryCategory: '竞品对比提问', secondaryCategory: '比较' },
};

@Injectable()
export class DiagnosisConfigurationService {
  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(ModelEntity) private readonly models: Repository<ModelEntity>,
    @InjectRepository(BrandDiagnosisQuestionEntity) private readonly questions: Repository<BrandDiagnosisQuestionEntity>,
    @Optional() @InjectRepository(DiagnosisQuestionTaxonomyEntity) private readonly taxonomy?: Repository<DiagnosisQuestionTaxonomyEntity>,
  ) {}

  async list(brandId: number) {
    const [brand, taxonomy] = await Promise.all([this.brand(brandId), this.taxonomyDefinitions()]);
    let saved = await this.questions.find({ where: { brandId }, order: { ordr: 'ASC', id: 'ASC' } });
    if (!saved.length && brand.questions?.length) {
      saved = await this.questions.save(brand.questions.map((question, ordr) => this.questions.create({ brandId, question, group: fallbackPrimary, primaryCategory: fallbackPrimary, secondaryCategory: fallbackSecondary, market: 'cn', brandProbe: false, ordr })));
    }
    const migrated = saved.filter((item) => this.normalizeQuestionCategories(item, taxonomy));
    if (migrated.length) await this.questions.save(migrated);
    return {
      questions: saved.map((item) => ({ id: item.id, text: item.question, group: item.primaryCategory, primaryCategory: item.primaryCategory, secondaryCategory: item.secondaryCategory, market: item.market, brandProbe: item.brandProbe })),
      prompt: brand.questionsPrompt ?? buildBrandQuestionPrompt(brand, taxonomy),
      sitemapUrlLimit: brand.sitemapUrlLimit ?? defaultSitemapUrlLimit,
      samplingQuestionCount: brand.samplingQuestionCount ?? defaultSamplingQuestionCount,
      taxonomyVersion: taxonomy[0]?.version ?? QUESTION_TAXONOMY_VERSION,
      categoryWeights: taxonomy.map((item) => ({ primaryCategory: item.primaryCategory, secondaryCategory: item.secondaryCategory, weight: item.weight, example: item.example, code: item.code })),
      playwrightWebReviewEnabled: brand.playwrightWebReviewEnabled ?? true,
    };
  }

  async save(brandId: number, inputs: DiagnosisQuestionDto[], prompt?: string, sitemapUrlLimit?: number, samplingQuestionCount?: number, playwrightWebReviewEnabled?: boolean) {
    const [brand, taxonomy] = await Promise.all([this.brand(brandId), this.taxonomyDefinitions()]);
    if (samplingQuestionCount !== undefined && (!Number.isInteger(samplingQuestionCount) || samplingQuestionCount < 4 || samplingQuestionCount > 150)) throw new BadRequestException('诊断问句总数必须是 4 到 150 之间的整数');
    const normalized = this.normalize(inputs, taxonomy);
    if (prompt !== undefined) brand.questionsPrompt = prompt.trim() || null;
    if (sitemapUrlLimit !== undefined) brand.sitemapUrlLimit = sitemapUrlLimit;
    if (samplingQuestionCount !== undefined) brand.samplingQuestionCount = samplingQuestionCount;
    if (playwrightWebReviewEnabled !== undefined) brand.playwrightWebReviewEnabled = playwrightWebReviewEnabled;
    await this.brands.save(brand);
    await this.questions.delete({ brandId });
    if (normalized.length) await this.questions.save(normalized.map((item, ordr) => this.questions.create({ brandId, question: item.text, group: item.primaryCategory, primaryCategory: item.primaryCategory, secondaryCategory: item.secondaryCategory, market: item.market, brandProbe: item.brandProbe, ordr })));
    return this.list(brandId);
  }

  async savePrompt(brandId: number, prompt: string) { const brand = await this.brand(brandId); brand.questionsPrompt = prompt.trim() || null; await this.brands.save(brand); return this.list(brandId); }
  async resetPrompt(brandId: number) { const [brand, taxonomy] = await Promise.all([this.brand(brandId), this.taxonomyDefinitions()]); brand.questionsPrompt = buildBrandQuestionPrompt(brand, taxonomy); await this.brands.save(brand); return this.list(brandId); }

  async generate(brandId: number, extraPrompt?: string) {
    const [brand, taxonomy] = await Promise.all([this.brand(brandId), this.taxonomyDefinitions()]);
    const model = await this.models.findOne({ where: { isDefault: true, disabled: false, deleted: false } });
    if (!model?.baseUrl || !model.apiKey) throw new BadRequestException('未配置可用的默认模型，请先在模型管理中设置默认模型和 API Key。');
    const count = brand.samplingQuestionCount ?? defaultSamplingQuestionCount;
    if (!Number.isInteger(count) || count < 4 || count > 150) throw new BadRequestException('诊断问句总数必须是 4 到 150 之间的整数');
    const quota = allocateQuestionCategories(count, taxonomy);
    const prompt = `${buildBrandQuestionPrompt(brand, taxonomy)}${extraPrompt ? `\n\n## 补充提示词\n\n${extraPrompt}` : ''}`;
    const questions = parseGeneratedQuestions(await this.complete(model, prompt), Number.MAX_SAFE_INTEGER);
    if (questions.length !== count) throw new BadRequestException(`默认模型仅返回 ${questions.length} 个有效问题，需要严格返回 ${count} 个问题。`);
    const categories = new Map(taxonomy.map((item) => [`${item.primaryCategory}\u0000${item.secondaryCategory}`, item]));
    const counts = Object.fromEntries(taxonomy.map((item) => [item.code, 0])) as Record<string, number>;
    for (const question of questions) {
      const category = categories.get(`${question.primaryCategory}\u0000${question.secondaryCategory}`);
      if (!category) throw new BadRequestException('问题分类配额不匹配：必须返回有效的一级和二级分类标签。');
      counts[category.code] += 1;
    }
    if (taxonomy.some((item) => counts[item.code] !== quota[item.code])) throw new BadRequestException(`问题分类配额不匹配：${taxonomy.map((item) => `${item.secondaryCategory} ${quota[item.code]} 题`).join('、')}。`);
    return { questions: questions.map((item) => ({ ...item, group: item.primaryCategory })), taxonomyVersion: taxonomy[0]?.version ?? QUESTION_TAXONOMY_VERSION };
  }

  private async complete(model: ModelEntity, prompt: string) {
    let response: Response;
    try { response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${model.apiKey}` }, body: JSON.stringify({ model: model.modelName, messages: [{ role: 'user', content: prompt }], ...temperatureSetting(model, 0.4), ...completionTokenLimit(model, 1200) }), signal: AbortSignal.timeout(45_000) }); }
    catch { throw new BadRequestException('调用默认模型失败，请检查模型地址、网络和 API Key。'); }
    const body = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }> };
    if (!response.ok) throw new BadRequestException(upstreamErrorMessage(body, response.status));
    return body.choices?.[0]?.message?.content ?? '';
  }

  private normalize(inputs: DiagnosisQuestionDto[], taxonomy: QuestionTaxonomyDefinition[]) {
    const seen = new Set<string>();
    const valid = new Set(taxonomy.map((item) => `${item.primaryCategory}\u0000${item.secondaryCategory}`));
    return inputs.map((item) => ({ text: item.text.trim(), primaryCategory: item.primaryCategory ?? item.group ?? fallbackPrimary, secondaryCategory: item.secondaryCategory ?? fallbackSecondary, market: item.market ?? 'cn', brandProbe: item.brandProbe === true }))
      .map((item) => { if (!valid.has(`${item.primaryCategory}\u0000${item.secondaryCategory}`)) throw new BadRequestException('二级分类必须属于所选一级分类。'); return item; })
      .filter((item) => item.text && !seen.has(item.text) && Boolean(seen.add(item.text))).slice(0, 50);
  }

  private normalizeQuestionCategories(item: BrandDiagnosisQuestionEntity, taxonomy: QuestionTaxonomyDefinition[]): boolean {
    const valid = taxonomy.some((definition) => definition.primaryCategory === item.primaryCategory && definition.secondaryCategory === item.secondaryCategory);
    if (valid) { if (item.group !== item.primaryCategory) { item.group = item.primaryCategory; return true; } return false; }
    const legacyMapping = QUESTION_GROUPS.includes(item.group as QuestionGroup) ? LEGACY_GROUP_CATEGORY_MAP[item.group as QuestionGroup] : undefined;
    const mapped = legacyMapping ?? { primaryCategory: fallbackPrimary, secondaryCategory: fallbackSecondary };
    item.group = mapped.primaryCategory; item.primaryCategory = mapped.primaryCategory; item.secondaryCategory = mapped.secondaryCategory;
    return true;
  }

  private async taxonomyDefinitions(): Promise<QuestionTaxonomyDefinition[]> {
    if (!this.taxonomy) return [...DEFAULT_QUESTION_TAXONOMY];
    let records = await this.taxonomy.find({ order: { ordr: 'ASC', id: 'ASC' } });
    if (!records.length) {
      records = await this.taxonomy.save(DEFAULT_QUESTION_TAXONOMY.map((item) => this.taxonomy!.create({ ...item, version: QUESTION_TAXONOMY_VERSION })));
    }
    const definitions = records.map((item) => ({ code: item.code, primaryCode: item.primaryCode, primaryCategory: item.primaryCategory as QuestionGroup, secondaryCategory: item.secondaryCategory, weight: item.weight, example: item.example, version: item.version, ordr: item.ordr }));
    try { validateQuestionTaxonomy(definitions); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '问题分类定义无效'); }
    return definitions;
  }
  private async brand(id: number) { const brand = await this.brands.findOne({ where: { id, deleted: false } }); if (!brand) throw new NotFoundException(`Brand ${id} 不存在`); return brand; }
}
