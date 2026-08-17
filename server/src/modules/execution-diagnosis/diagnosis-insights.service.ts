import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { CompetitorEntity } from '../competitors/competitor.entity';
import { BrandDiagnosisQuestionEntity } from './execution-diagnosis.entity';
import { ExecutionDiagnosisRunEntity, ExecutionDiagnosisSampleEntity, ExecutionDiagnosisWebReviewEntity } from './execution-diagnosis.entity';
import { ReviewSampleDto } from './diagnosis-insights.dto';
import { DiagnosisFindingEntity } from './optimization-verification.entity';

type Mention = { name: string; count: number; sampleCount: number; rate: number };
type WebReviewCorrection = { answer: string; brandMentioned: boolean | null };

@Injectable()
export class DiagnosisInsightsService {
  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(CompetitorEntity) private readonly competitors: Repository<CompetitorEntity>,
    @InjectRepository(ExecutionDiagnosisRunEntity) private readonly runs: Repository<ExecutionDiagnosisRunEntity>,
    @InjectRepository(ExecutionDiagnosisSampleEntity) private readonly samples: Repository<ExecutionDiagnosisSampleEntity>,
    @InjectRepository(BrandDiagnosisQuestionEntity) private readonly diagnosisQuestions: Repository<BrandDiagnosisQuestionEntity>,
    @InjectRepository(DiagnosisFindingEntity) private readonly findings: Repository<DiagnosisFindingEntity>,
    @InjectRepository(ExecutionDiagnosisWebReviewEntity) private readonly webReviews: Repository<ExecutionDiagnosisWebReviewEntity>,
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
    const [samples, competitors, findings, webReviews] = await Promise.all([
      this.samples.find({ where: { runId }, order: { sampledAt: 'DESC' } }),
      this.competitors.find({ where: { brandId, deleted: false }, order: { name: 'ASC' } }),
      this.findings.find({ where: { brandId, sourceRunId: runId }, order: { createdAt: 'ASC', id: 'ASC' } }),
      this.webReviews.find({ where: { runId } }),
    ]);
    const configuredQuestions = await this.diagnosisQuestions.find({ where: { brandId }, order: { ordr: 'ASC', id: 'ASC' } });
    const activeCompetitors = competitors.filter((item) => item.enabled);
    const questions = [...new Set(samples.map((sample) => sample.question).filter((question): question is string => Boolean(question)))];
    const successfulWebReviews = webReviews.filter((review) => review.status === 'succeeded');
    const webReviewCorrections = new Map<number, WebReviewCorrection>(successfulWebReviews.map((review) => [review.apiSampleId, { answer: review.answer ?? '', brandMentioned: review.brandMentioned }]));
    const reviewedBrandMentions = new Map(successfulWebReviews.filter((review) => review.brandMentioned !== null).map((review) => [review.apiSampleId, Boolean(review.brandMentioned)]));
    const brandMention = this.mention(brand.name, [brand.name], samples, true, webReviewCorrections, reviewedBrandMentions, true);
    const competitorMentions = activeCompetitors.map((item) => this.mention(item.name, [item.name, ...item.aliases], samples, true, webReviewCorrections));
    const engineNames = [...new Set(samples.map((sample) => sample.engineName).filter(Boolean))];
    const taxonomyQuestions = run.configurationSnapshot?.questions?.length ? run.configurationSnapshot.questions : configuredQuestions;
    const taxonomyByQuestion = new Map(taxonomyQuestions.map((item) => [item.question, {
      group: item.group,
      primaryCategory: item.primaryCategory ?? item.group ?? '未分类',
      secondaryCategory: item.secondaryCategory ?? '未分类',
    }]));
    const questionInsights = questions.map((question) => {
      const scoped = samples.filter((sample) => sample.question === question);
      const mentioned = this.mention(brand.name, [brand.name], scoped, true, webReviewCorrections, reviewedBrandMentions, true);
      const leadingCompetitor = competitorMentions.map((competitor) => { const item = competitors.find((candidate) => candidate.name === competitor.name); return {...competitor, rate: this.mention(competitor.name, [competitor.name, ...(item?.aliases ?? [])], scoped, true, webReviewCorrections).rate}; }).sort((a, b) => b.rate - a.rate).find((competitor) => competitor.rate > 0);
      const diagnosis = !scoped.length ? 'unmeasured' : mentioned.rate === 0 && (leadingCompetitor?.rate ?? 0) >= 0.5 ? 'competitor-dominated' : mentioned.rate === 0 ? 'absent' : 'normal';
      const taxonomy = taxonomyByQuestion.get(question);
      return { question, group: taxonomy?.group ?? '未分类', primaryCategory: taxonomy?.primaryCategory ?? '未分类', secondaryCategory: taxonomy?.secondaryCategory ?? '未分类', sampleCount: scoped.length, mentionRate: mentioned.rate, diagnosis, leadingCompetitor: leadingCompetitor?.name ?? null, leadingCompetitorRate: leadingCompetitor?.rate ?? 0 };
    });
    const competitorMatrix = activeCompetitors.map((competitor) => {
      const aliases = [competitor.name, ...competitor.aliases];
      return {
        name: competitor.name,
        overallRate: this.mention(competitor.name, aliases, samples, true, webReviewCorrections).rate,
        byEngine: engineNames.map((engineName) => {
          const scoped = samples.filter((sample) => sample.engineName === engineName);
          const mention = this.mention(competitor.name, aliases, scoped, true, webReviewCorrections);
          return { engineName, sampleCount: scoped.length, rate: mention.rate };
        }),
        lostQuestions: questionInsights
          .map((question) => {
            const scoped = samples.filter((sample) => sample.question === question.question);
            const rate = this.mention(competitor.name, aliases, scoped, true, webReviewCorrections).rate;
            return { question: question.question, rate, brandMentionRate: question.mentionRate };
          })
          .filter((item) => item.rate > item.brandMentionRate)
          .sort((a, b) => b.rate - a.rate),
      };
    });
    const engineInsights = engineNames.map((engineName) => {
      const scoped = samples.filter((sample) => sample.engineName === engineName);
      const successful = scoped.filter((sample) => !sample.error);
      return { engineName, sampleCount: scoped.length, successRate: scoped.length ? successful.length / scoped.length : 0, mentionRate: this.mention(brand.name, [brand.name], scoped, true, webReviewCorrections, reviewedBrandMentions, true).rate };
    });
    const groupInsights = [...new Set(questionInsights.map((item) => item.group))].map((group) => {
      const scoped = questionInsights.filter((item) => item.group === group);
      const weakQuestion = [...scoped].sort((a, b) => a.mentionRate - b.mentionRate)[0];
      return { group, questionCount: scoped.length, sampleCount: scoped.reduce((total, item) => total + item.sampleCount, 0), mentionRate: scoped.length ? scoped.reduce((total, item) => total + item.mentionRate, 0) / scoped.length : 0, weakQuestion: weakQuestion?.question ?? null };
    });
    const priorityActions = questionInsights.filter((item) => item.diagnosis !== 'normal').sort((a, b) => (a.diagnosis === 'competitor-dominated' ? 0 : 1) - (b.diagnosis === 'competitor-dominated' ? 0 : 1) || a.mentionRate - b.mentionRate || b.leadingCompetitorRate - a.leadingCompetitorRate).slice(0, 3);
    const sources = new Set(samples.flatMap((sample) => this.sources(this.effectiveAnswer(sample, webReviewCorrections))));
    const countSelection = (reason: ExecutionDiagnosisWebReviewEntity['selectionReasons'][number]) => webReviews.filter((review) => review.selectionReasons.includes(reason)).length;
    const excludedByReason = webReviews.filter((review) => review.status === 'excluded' && review.exclusionReason).reduce<Record<string, number>>((result, review) => ({ ...result, [review.exclusionReason!]: (result[review.exclusionReason!] ?? 0) + 1 }), {});
    const minimumRate = run.configurationSnapshot?.webReview?.minimumRate ?? 0.3;
    const candidateTotal = run.configurationSnapshot?.webReview?.candidateSampleIds?.length ?? 0;
    const webReviewSummary = { apiTotal: samples.length, candidateTotal, minimumTarget: Math.ceil(candidateTotal * minimumRate), mandatoryCore: countSelection('core_capability'), mandatoryMentioned: countSelection('api_brand_mentioned'), randomUnmentioned: countSelection('random_unmentioned'), minimumFill: countSelection('minimum_fill'), succeeded: successfulWebReviews.length, excludedByReason };
    return {
      run: { id: run.id, status: run.status, createdAt: run.createdAt, finishedAt: run.finishedAt, summary: run.summary },
      metrics: { sampleCount: samples.length, questionCount: questions.length, brandMentionRate: brandMention.rate, citedEngines: new Set(samples.filter((sample) => !sample.error).map((sample) => sample.engineId)).size, successfulSampleRate: samples.length ? samples.filter((sample) => !sample.error).length / samples.length : 0, reviewedSampleCount: samples.filter((sample) => sample.reviewedBrandMention !== null && sample.reviewedBrandMention !== undefined).length, sourceCount: sources.size },
      questions: questionInsights,
      competitors: competitorMentions,
      competitorMatrix,
      report: { engines: engineInsights, groups: groupInsights, priorityActions, competitorDominatedCount: questionInsights.filter((item) => item.diagnosis === 'competitor-dominated').length, absentCount: questionInsights.filter((item) => item.diagnosis === 'absent').length, normalCount: questionInsights.filter((item) => item.diagnosis === 'normal').length },
      evidenceBasis: successfulWebReviews.length > 0 ? 'web-review-corrected' : 'api-reference-only',
      webReviewSummary,
      findings: findings.map((finding) => ({ id: finding.id, sourceRunId: finding.sourceRunId, type: finding.type, priority: finding.priority, scope: finding.scope, recommendation: finding.recommendation, status: finding.status })),
      samples: samples.map((sample) => { const answer = this.effectiveAnswer(sample, webReviewCorrections); return { id: sample.id, engineName: sample.engineName, question: sample.question, answer, error: sample.error, sampledAt: sample.sampledAt, statusCode: sample.statusCode, brandMention: this.sampleMentions(sample, [brand.name], true, webReviewCorrections, reviewedBrandMentions, true), reviewedBrandMention: sample.reviewedBrandMention, reviewNote: sample.reviewNote, sources: this.sources(answer) }; }),
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

  private mention(name: string, aliases: string[], samples: ExecutionDiagnosisSampleEntity[], useReview = false, webReviewCorrections = new Map<number, WebReviewCorrection>(), reviewedBrandMentions = new Map<number, boolean>(), useBrandReview = false): Mention {
    const count = samples.filter((sample) => this.sampleMentions(sample, aliases, useReview, webReviewCorrections, reviewedBrandMentions, useBrandReview)).length;
    return { name, count, sampleCount: samples.length, rate: samples.length ? count / samples.length : 0 };
  }
  private effectiveAnswer(sample: ExecutionDiagnosisSampleEntity, webReviewCorrections = new Map<number, WebReviewCorrection>()) { return webReviewCorrections.get(sample.id)?.answer ?? sample.answer; }
  private sampleMentions(sample: ExecutionDiagnosisSampleEntity, aliases: string[], useReview = false, webReviewCorrections = new Map<number, WebReviewCorrection>(), reviewedBrandMentions = new Map<number, boolean>(), useBrandReview = false) { if (useBrandReview && reviewedBrandMentions.has(sample.id)) return reviewedBrandMentions.get(sample.id)!; if (useBrandReview && sample.reviewedBrandMention !== null && sample.reviewedBrandMention !== undefined) return sample.reviewedBrandMention; const answer = this.effectiveAnswer(sample, useReview ? webReviewCorrections : undefined).toLocaleLowerCase(); return aliases.filter(Boolean).some((alias) => answer.includes(alias.toLocaleLowerCase())); }
  private sources(answer: string) { return [...new Set([...answer.matchAll(/https?:\/\/([^\s/)]+)/g)].map((match) => match[1].toLocaleLowerCase()))]; }
  private async brand(id: number) { const brand = await this.brands.findOne({ where: { id, deleted: false } }); if (!brand) throw new NotFoundException(`Brand ${id} 不存在`); return brand; }
}
