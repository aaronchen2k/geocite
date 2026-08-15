import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { CompetitorEntity } from '../competitors/competitor.entity';
import { ExecutionDiagnosisRunEntity, ExecutionDiagnosisSampleEntity } from './execution-diagnosis.entity';
import { ReviewSampleDto } from './diagnosis-insights.dto';

type Mention = { name: string; count: number; sampleCount: number; rate: number };

@Injectable()
export class DiagnosisInsightsService {
  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(CompetitorEntity) private readonly competitors: Repository<CompetitorEntity>,
    @InjectRepository(ExecutionDiagnosisRunEntity) private readonly runs: Repository<ExecutionDiagnosisRunEntity>,
    @InjectRepository(ExecutionDiagnosisSampleEntity) private readonly samples: Repository<ExecutionDiagnosisSampleEntity>,
  ) {}

  async latest(brandId: number) {
    await this.brand(brandId);
    const run = await this.runs.createQueryBuilder('run').where('run.brand_id = :brandId', { brandId }).andWhere('run.status IN (:...statuses)', { statuses: ['succeeded', 'partial'] }).orderBy('run.finished_at', 'DESC').getOne();
    return run ? this.forRun(brandId, run.id) : null;
  }

  async forRun(brandId: number, runId: number) {
    const brand = await this.brand(brandId);
    const run = await this.runs.findOne({ where: { id: runId, brandId }, relations: { steps: true } });
    if (!run) throw new NotFoundException(`诊断批次 ${runId} 不存在`);
    const [samples, competitors] = await Promise.all([
      this.samples.find({ where: { runId }, order: { sampledAt: 'DESC' } }),
      this.competitors.find({ where: { brandId, deleted: false }, order: { name: 'ASC' } }),
    ]);
    const activeCompetitors = competitors.filter((item) => item.enabled);
    const questions = [...new Set(samples.map((sample) => sample.question).filter((question): question is string => Boolean(question)))];
    const brandMention = this.mention(brand.name, [brand.name], samples, true);
    const competitorMentions = activeCompetitors.map((item) => this.mention(item.name, [item.name, ...item.aliases], samples));
    const engineNames = [...new Set(samples.map((sample) => sample.engineName).filter(Boolean))];
    const questionInsights = questions.map((question) => {
      const scoped = samples.filter((sample) => sample.question === question);
      const mentioned = this.mention(brand.name, [brand.name], scoped, true);
      const leadingCompetitor = competitorMentions.map((competitor) => { const item = competitors.find((candidate) => candidate.name === competitor.name); return {...competitor, rate: this.mention(competitor.name, [competitor.name, ...(item?.aliases ?? [])], scoped).rate}; }).sort((a, b) => b.rate - a.rate)[0];
      const diagnosis = !scoped.length ? 'unmeasured' : mentioned.rate === 0 && (leadingCompetitor?.rate ?? 0) >= 0.5 ? 'competitor-dominated' : mentioned.rate === 0 ? 'absent' : 'normal';
      return { question, sampleCount: scoped.length, mentionRate: mentioned.rate, diagnosis, leadingCompetitor: leadingCompetitor?.name ?? null, leadingCompetitorRate: leadingCompetitor?.rate ?? 0 };
    });
    const competitorMatrix = activeCompetitors.map((competitor) => {
      const aliases = [competitor.name, ...competitor.aliases];
      return {
        name: competitor.name,
        overallRate: this.mention(competitor.name, aliases, samples).rate,
        byEngine: engineNames.map((engineName) => {
          const scoped = samples.filter((sample) => sample.engineName === engineName);
          const mention = this.mention(competitor.name, aliases, scoped);
          return { engineName, sampleCount: scoped.length, rate: mention.rate };
        }),
        lostQuestions: questionInsights
          .map((question) => {
            const scoped = samples.filter((sample) => sample.question === question.question);
            const rate = this.mention(competitor.name, aliases, scoped).rate;
            return { question: question.question, rate, brandMentionRate: question.mentionRate };
          })
          .filter((item) => item.rate > item.brandMentionRate)
          .sort((a, b) => b.rate - a.rate),
      };
    });
    return {
      run: { id: run.id, status: run.status, createdAt: run.createdAt, finishedAt: run.finishedAt, summary: run.summary },
      metrics: { sampleCount: samples.length, questionCount: questions.length, brandMentionRate: brandMention.rate, citedEngines: new Set(samples.filter((sample) => !sample.error).map((sample) => sample.engineId)).size },
      questions: questionInsights,
      competitors: competitorMentions,
      competitorMatrix,
      samples: samples.map((sample) => ({ id: sample.id, engineName: sample.engineName, question: sample.question, answer: sample.answer, error: sample.error, sampledAt: sample.sampledAt, statusCode: sample.statusCode, brandMention: this.sampleMentions(sample, [brand.name], true), reviewedBrandMention: sample.reviewedBrandMention, reviewNote: sample.reviewNote, sources: this.sources(sample.answer) })),
    };
  }

  async reviewSample(brandId: number, sampleId: number, dto: ReviewSampleDto) {
    await this.brand(brandId);
    const sample = await this.samples.createQueryBuilder('sample').innerJoin(ExecutionDiagnosisRunEntity, 'run', 'run.id = sample.run_id').where('sample.id = :sampleId AND run.brand_id = :brandId', { sampleId, brandId }).getOne();
    if (!sample) throw new NotFoundException(`样本 ${sampleId} 不存在`);
    sample.reviewedBrandMention = dto.brandMention;
    sample.reviewNote = dto.note?.trim() || null;
    sample.reviewedAt = new Date();
    return this.samples.save(sample);
  }

  private mention(name: string, aliases: string[], samples: ExecutionDiagnosisSampleEntity[], useReview = false): Mention {
    const count = samples.filter((sample) => this.sampleMentions(sample, aliases, useReview)).length;
    return { name, count, sampleCount: samples.length, rate: samples.length ? count / samples.length : 0 };
  }
  private sampleMentions(sample: ExecutionDiagnosisSampleEntity, aliases: string[], useReview = false) { if (useReview && sample.reviewedBrandMention !== null && sample.reviewedBrandMention !== undefined) return sample.reviewedBrandMention; const answer = sample.answer.toLocaleLowerCase(); return aliases.filter(Boolean).some((alias) => answer.includes(alias.toLocaleLowerCase())); }
  private sources(answer: string) { return [...new Set([...answer.matchAll(/https?:\/\/([^\s/)]+)/g)].map((match) => match[1].toLocaleLowerCase()))]; }
  private async brand(id: number) { const brand = await this.brands.findOne({ where: { id, deleted: false } }); if (!brand) throw new NotFoundException(`Brand ${id} 不存在`); return brand; }
}
