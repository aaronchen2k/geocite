import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { ModelEntity } from '../models/model.entity';
import { normalizeDiagnosisQuestions } from './brand-diagnosis-config';
import { parseGeneratedQuestions } from './diagnosis-questions';
import { completionTokenLimit, temperatureSetting, upstreamErrorMessage } from './model-request';

@Injectable()
export class DiagnosisConfigurationService {
  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(ModelEntity) private readonly models: Repository<ModelEntity>,
  ) {}

  async list(brandId: number) { const brand = await this.brand(brandId); return { questions: brand.questions ?? [], prompt: brand.questionsPrompt ?? '' }; }
  async save(brandId: number, inputs: string[], prompt?: string) {
    const brand = await this.brand(brandId);
    brand.questions = normalizeDiagnosisQuestions(inputs);
    if (prompt !== undefined) brand.questionsPrompt = prompt.trim() || null;
    await this.brands.save(brand);
    return this.list(brandId);
  }
  async savePrompt(brandId: number, prompt: string) {
    const brand = await this.brand(brandId);
    brand.questionsPrompt = prompt.trim() || null;
    await this.brands.save(brand);
    return this.list(brandId);
  }
  async generate(brandId: number, extraPrompt?: string) {
    const brand = await this.brand(brandId);
    if (extraPrompt !== undefined) { brand.questionsPrompt = extraPrompt.trim() || null; await this.brands.save(brand); }
    const model = await this.models.findOne({ where: { isDefault: true, disabled: false, deleted: false } });
    if (!model?.baseUrl || !model.apiKey) throw new BadRequestException('未配置可用的默认模型，请先在模型管理中设置默认模型和 API Key。');
    const prompt = `你是 GEO 品牌诊断专家。请严格生成 5 个适合 AI 问答采样与网站内容诊断的问题。品牌名称：${brand.name}；行业：${brand.industry ?? '未填写'}；简介：${brand.description ?? '未填写'}。${extraPrompt ? `补充要求：${extraPrompt}` : ''}。只返回 JSON：{"questions":["问题1","问题2","问题3","问题4","问题5"]}；数组必须恰好包含 5 个不重复的问题，不能附带任何说明。`;
    let response: Response;
    try {
      response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${model.apiKey}` }, body: JSON.stringify({ model: model.modelName, messages: [{ role: 'user', content: prompt }], ...temperatureSetting(model, 0.4), ...completionTokenLimit(model, 700) }), signal: AbortSignal.timeout(45_000) });
    } catch { throw new BadRequestException('调用默认模型失败，请检查模型地址、网络和 API Key。'); }
    const body = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }> };
    if (!response.ok) throw new BadRequestException(upstreamErrorMessage(body, response.status));
    const questions = parseGeneratedQuestions(body.choices?.[0]?.message?.content ?? '', 5);
    if (questions.length !== 5) throw new BadRequestException('默认模型未返回完整的 5 个问题，请调整提示词后重试。');
    return { questions };
  }
  private async brand(id: number) { const brand = await this.brands.findOne({ where: { id, deleted: false } }); if (!brand) throw new NotFoundException(`Brand ${id} 不存在`); return brand; }
}
