import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { CompetitorEntity } from '../competitors/competitor.entity';
import { ModelEntity } from '../models/model.entity';
import { completionTokenLimit, temperatureSetting, upstreamErrorMessage } from './model-request';
import { ExecutionDiagnosisRunEntity, ExecutionDiagnosisSampleEntity, type SampleAnalysis } from './execution-diagnosis.entity';

const ANALYSIS_PROMPT = `你是 GEO 诊断样本分析器。仅依据输入的品牌、竞品、问题、回答和引用列表生成 JSON，不要补充说明，不要编造未提供的引用或事实。\n\n返回严格 JSON：{\"brandMentioned\":boolean|null,\"mentionedCompetitors\":string[],\"recommendation\":\"recommended|candidate|not_recommended|not_mentioned|uncertain\",\"recommendationRank\":number|null,\"sentiment\":\"positive|neutral|negative|mixed|uncertain\",\"claims\":[{\"text\":string,\"type\":\"ability|scenario|boundary|fact|risk\"}],\"factVerdict\":\"accurate|missing|suspected_incorrect|unverifiable|pending_review\",\"citations\":[{\"url\":string,\"title\":string|null,\"supports\":string}],\"evidence\":[string]}。\n\n规则：\n- brandMentioned 只判断当前品牌是否出现在回答中；不确定则 null。\n- mentionedCompetitors 只能使用输入竞品的规范名称。\n- 推荐与提及不同；没有明确推荐就不要标 recommended。\n- 尚无品牌事实库，factVerdict 除非回答明确缺失或明显自相矛盾，否则使用 pending_review 或 unverifiable。\n- citations.url 只能从输入引用列表选择；supports 简述该信源支持的观点。\n- evidence 仅摘取回答中的短句。`;

@Injectable()
export class SampleAnalysisService {
  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(CompetitorEntity) private readonly competitors: Repository<CompetitorEntity>,
    @InjectRepository(ModelEntity) private readonly models: Repository<ModelEntity>,
    @InjectRepository(ExecutionDiagnosisRunEntity) private readonly runs: Repository<ExecutionDiagnosisRunEntity>,
    @InjectRepository(ExecutionDiagnosisSampleEntity) private readonly samples: Repository<ExecutionDiagnosisSampleEntity>,
  ) {}

  async analyzeLatest(brandId: number) {
    const run = await this.runs.createQueryBuilder('run').where('run.brand_id = :brandId', { brandId }).andWhere('run.status IN (:...statuses)', { statuses: ['succeeded', 'partial'] }).orderBy('run.finished_at', 'DESC').getOne();
    if (!run) throw new NotFoundException('暂无可统计的诊断批次');
    return this.analyzeRun(brandId, run.id);
  }

  async analyzeRun(brandId: number, runId: number) {
    const [brand, competitors, model, samples, run] = await Promise.all([
      this.brands.findOne({ where: { id: brandId, deleted: false } }),
      this.competitors.find({ where: { brandId, deleted: false, enabled: true } }),
      this.models.findOne({ where: { isDefault: true, disabled: false, deleted: false } }),
      this.samples.find({ where: { runId }, order: { id: 'ASC' } }),
      this.runs.findOne({ where: { id: runId, brandId } }),
    ]);
    if (!brand || !run) throw new NotFoundException('诊断批次不存在');
    if (!model?.baseUrl || !model.apiKey) throw new BadRequestException('未配置可用的默认模型，请先在模型管理中设置默认模型和 API Key。');
    const taxonomy = new Map((run.configurationSnapshot?.questions ?? []).map((item) => [item.question, { primaryCategory: item.primaryCategory, secondaryCategory: item.secondaryCategory }]));
    let completed = 0;
    let failed = 0;
    for (const sample of samples.filter((item) => !item.error && item.answer.trim())) {
      try {
        const content = await this.complete(model, this.prompt({ brand, competitors, sample, taxonomy: taxonomy.get(sample.question ?? '') }));
        sample.analysis = this.normalize(content, model.modelName);
        const allowedCitationUrls = new Set((sample.citations ?? []).map((citation) => citation.url));
        sample.analysis.citations = sample.analysis.citations.filter((citation) => allowedCitationUrls.has(citation.url));
        sample.analysisError = null;
        await this.samples.save(sample);
        completed += 1;
      } catch (error) {
        sample.analysis = null;
        sample.analysisError = error instanceof Error ? error.message.slice(0, 1000) : '样本分析失败';
        await this.samples.save(sample);
        failed += 1;
      }
    }
    return { runId, completed, failed };
  }

  private prompt(input: { brand: BrandEntity; competitors: CompetitorEntity[]; sample: ExecutionDiagnosisSampleEntity; taxonomy?: { primaryCategory: string; secondaryCategory: string } }) {
    return `${ANALYSIS_PROMPT}\n\n当前品牌：${input.brand.name}\n竞品（规范名称与别名）：${JSON.stringify(input.competitors.map((item) => ({ name: item.name, aliases: item.aliases })))}\n问题分类：${JSON.stringify(input.taxonomy ?? null)}\n问题：${input.sample.question ?? ''}\n回答：${input.sample.answer}\n引用列表：${JSON.stringify(input.sample.citations ?? [])}`;
  }

  private async complete(model: ModelEntity, prompt: string) {
    let response: Response;
    try { response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${model.apiKey}` }, body: JSON.stringify({ model: model.modelName, messages: [{ role: 'user', content: prompt }], ...temperatureSetting(model, 0), ...completionTokenLimit(model, 1400) }), signal: AbortSignal.timeout(60_000) }); }
    catch { throw new Error('调用默认模型失败'); }
    const body = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }> };
    if (!response.ok) throw new Error(upstreamErrorMessage(body, response.status));
    return body.choices?.[0]?.message?.content ?? '';
  }

  private normalize(content: string, modelName: string): SampleAnalysis {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('默认模型未返回 JSON 标注');
    const raw = JSON.parse(match[0]) as Partial<SampleAnalysis>;
    const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T) => typeof value === 'string' && options.includes(value as T) ? value as T : fallback;
    return {
      brandMentioned: typeof raw.brandMentioned === 'boolean' ? raw.brandMentioned : null,
      mentionedCompetitors: Array.isArray(raw.mentionedCompetitors) ? raw.mentionedCompetitors.filter((item): item is string => typeof item === 'string').slice(0, 20) : [],
      recommendation: oneOf(raw.recommendation, ['recommended', 'candidate', 'not_recommended', 'not_mentioned', 'uncertain'] as const, 'uncertain'),
      recommendationRank: typeof raw.recommendationRank === 'number' && raw.recommendationRank > 0 ? raw.recommendationRank : null,
      sentiment: oneOf(raw.sentiment, ['positive', 'neutral', 'negative', 'mixed', 'uncertain'] as const, 'uncertain'),
      claims: Array.isArray(raw.claims) ? raw.claims.filter((item): item is { text: string; type: SampleAnalysis['claims'][number]['type'] } => Boolean(item) && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string').slice(0, 12).map((item) => ({ text: item.text.slice(0, 400), type: oneOf(item.type, ['ability', 'scenario', 'boundary', 'fact', 'risk'] as const, 'fact') })) : [],
      factVerdict: oneOf(raw.factVerdict, ['accurate', 'missing', 'suspected_incorrect', 'unverifiable', 'pending_review'] as const, 'pending_review'),
      citations: Array.isArray(raw.citations) ? raw.citations.filter((item) => Boolean(item) && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string').slice(0, 20).map((item) => { const citation = item as { url: string; title?: string | null; supports?: string }; return { url: citation.url, title: typeof citation.title === 'string' ? citation.title : null, supports: typeof citation.supports === 'string' ? citation.supports.slice(0, 400) : '' }; }) : [],
      evidence: Array.isArray(raw.evidence) ? raw.evidence.filter((item): item is string => typeof item === 'string').slice(0, 8).map((item) => item.slice(0, 400)) : [],
      modelName,
      analyzedAt: new Date().toISOString(),
    };
  }
}
