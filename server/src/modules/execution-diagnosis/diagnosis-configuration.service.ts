import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { BrandDiagnosisQuestionEntity } from './execution-diagnosis.entity';
import { DiagnosisQuestionDto } from './diagnosis-configuration.dto';
import { ModelEntity } from '../models/model.entity';
import { parseGeneratedQuestions } from './diagnosis-questions';
import { completionTokenLimit, temperatureSetting, upstreamErrorMessage } from './model-request';
import { buildBrandQuestionPrompt } from './brand-question-prompt';

const defaultSitemapUrlLimit = 10;

@Injectable()
export class DiagnosisConfigurationService {
  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(ModelEntity) private readonly models: Repository<ModelEntity>,
    @InjectRepository(BrandDiagnosisQuestionEntity) private readonly questions: Repository<BrandDiagnosisQuestionEntity>,
  ) {}

  async list(brandId: number) { const brand = await this.brand(brandId); const saved = await this.questions.find({ where: { brandId }, order: { ordr: 'ASC', id: 'ASC' } }); const items = saved.length ? saved.map((item) => ({ id: item.id, text: item.question, group: item.group, market: item.market, brandProbe: item.brandProbe })) : (brand.questions ?? []).map((text, index) => ({ id: index + 1, text, group: '推荐', market: 'cn' as const, brandProbe: false })); return { questions: items, prompt: brand.questionsPrompt ?? buildBrandQuestionPrompt(brand), sitemapUrlLimit: brand.sitemapUrlLimit ?? defaultSitemapUrlLimit }; }
  async save(brandId: number, inputs: DiagnosisQuestionDto[], prompt?: string, sitemapUrlLimit?: number) {
    const brand = await this.brand(brandId);
    const normalized = this.normalize(inputs);
    brand.questions = normalized.map((item) => item.text);
    if (prompt !== undefined) brand.questionsPrompt = prompt.trim() || null;
    if (sitemapUrlLimit !== undefined) brand.sitemapUrlLimit = sitemapUrlLimit;
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
    const prompt = `${buildBrandQuestionPrompt(brand)}${extraPrompt ? `\n\n## 补充提示词\n\n${extraPrompt}` : ''}`;
    let response: Response;
    try {
      response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${model.apiKey}` }, body: JSON.stringify({ model: model.modelName, messages: [{ role: 'user', content: prompt }], ...temperatureSetting(model, 0.4), ...completionTokenLimit(model, 700) }), signal: AbortSignal.timeout(45_000) });
    } catch { throw new BadRequestException('调用默认模型失败，请检查模型地址、网络和 API Key。'); }
    const body = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }> };
    if (!response.ok) throw new BadRequestException(upstreamErrorMessage(body, response.status));
    const questions = parseGeneratedQuestions(body.choices?.[0]?.message?.content ?? '', 8);
    if (questions.length !== 8) throw new BadRequestException('默认模型未返回完整的 8 个问题，请调整提示词后重试。');
    return { questions };
  }
  private normalize(inputs: DiagnosisQuestionDto[]) { const seen = new Set<string>(); return inputs.map((item) => ({ text: item.text.trim(), group: item.group?.trim() || '推荐', market: item.market ?? 'cn', brandProbe: item.brandProbe === true })).filter((item) => item.text && !seen.has(item.text) && Boolean(seen.add(item.text))).slice(0, 50); }
  private async brand(id: number) { const brand = await this.brands.findOne({ where: { id, deleted: false } }); if (!brand) throw new NotFoundException(`Brand ${id} 不存在`); return brand; }
}
