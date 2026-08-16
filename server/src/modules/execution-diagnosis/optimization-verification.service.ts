import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { ExecutionDiagnosisRunEntity, ExecutionDiagnosisSampleEntity, type ExecutionDiagnosisConfigurationSnapshot } from './execution-diagnosis.entity';
import { CompareDiagnosisRunsDto, CreateAttributionDto, CreateComparisonExperimentDto, CreateOptimizationActionDto, CreateOptimizationWorkOrderDto, CreatePeriodicRetestPlanDto, EvaluateComparisonExperimentDto, TransitionOptimizationWorkOrderDto, UpdatePeriodicRetestPlanDto } from './optimization-verification.dto';
import { AttributionRecordEntity, ComparisonExperimentEntity, DiagnosisComparisonEntity, DiagnosisFindingEntity, OptimizationActionEntity, OptimizationWorkOrderEntity, OptimizationWorkOrderTransitionEntity, PeriodicRetestPlanEntity, type AttributionConclusion, type RunComparability, type WorkOrderStatus } from './optimization-verification.entity';
import { ExecutionDiagnosisService } from './execution-diagnosis.service';

const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['pending_verification', 'cancelled'],
  pending_verification: ['verified', 'ineffective', 'in_progress', 'cancelled'],
  verified: ['in_progress'],
  ineffective: ['in_progress', 'cancelled'],
  cancelled: ['in_progress'],
};

@Injectable()
export class OptimizationVerificationService {
  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(ExecutionDiagnosisRunEntity) private readonly runs: Repository<ExecutionDiagnosisRunEntity>,
    @InjectRepository(DiagnosisFindingEntity) private readonly findings: Repository<DiagnosisFindingEntity>,
    @InjectRepository(OptimizationWorkOrderEntity) private readonly workOrders: Repository<OptimizationWorkOrderEntity>,
    @InjectRepository(OptimizationActionEntity) private readonly actions: Repository<OptimizationActionEntity>,
    @InjectRepository(DiagnosisComparisonEntity) private readonly comparisons: Repository<DiagnosisComparisonEntity>,
    @InjectRepository(OptimizationWorkOrderTransitionEntity) private readonly transitionHistory: Repository<OptimizationWorkOrderTransitionEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ExecutionDiagnosisSampleEntity) private readonly samples: Repository<ExecutionDiagnosisSampleEntity>,
    @InjectRepository(AttributionRecordEntity) private readonly attributions?: Repository<AttributionRecordEntity>,
    @InjectRepository(PeriodicRetestPlanEntity) private readonly retestPlans?: Repository<PeriodicRetestPlanEntity>,
    @InjectRepository(ComparisonExperimentEntity) private readonly experiments?: Repository<ComparisonExperimentEntity>,
    private readonly executionDiagnosis?: ExecutionDiagnosisService,
  ) {}

  async compareRuns(brandId: number, baselineRunId: number, retestRunId: number) {
    const brand = await this.brand(brandId);
    const [baseline, retest] = await Promise.all([
      this.run(brandId, baselineRunId),
      this.run(brandId, retestRunId),
    ]);
    const evaluated = this.evaluateComparability(baseline, retest);
    const metrics = evaluated.comparability === 'incomparable'
      ? null
      : await this.comparisonMetrics(brand.name, baseline, retest, evaluated.questionIds, evaluated.engineIds);
    const comparison = await this.comparisons.save(this.comparisons.create({
      brandId,
      baselineRunId,
      retestRunId,
      comparability: evaluated.comparability,
      metrics,
      reason: evaluated.reasons.length ? evaluated.reasons.join(',') : null,
    }));
    return { ...comparison, reasons: evaluated.reasons };
  }

  async visibilityTrend(brandId: number) {
    const brand = await this.brand(brandId);
    const runs = await this.completedRuns(brandId);
    const samples = await this.samplesFor(runs.map((run) => run.id));
    return {
      runs: runs.map((run) => ({
        runId: run.id,
        status: run.status,
        createdAt: run.createdAt,
        finishedAt: run.finishedAt,
        configuration: this.configurationSummary(run.configurationSnapshot),
        metrics: this.metricsFor(brand.name, samples.filter((sample) => sample.runId === run.id)),
      })),
    };
  }

  async questionTracking(brandId: number) {
    const brand = await this.brand(brandId);
    const runs = await this.completedRuns(brandId);
    const samples = await this.samplesFor(runs.map((run) => run.id));
    const questions = new Map<number, { id: number; question: string; group: string }>();
    runs.forEach((run) => run.configurationSnapshot?.questions.forEach((question) => {
      if (!questions.has(question.id)) questions.set(question.id, { id: question.id, question: question.question, group: question.group });
    }));
    return {
      runs: runs.map((run) => ({ runId: run.id, finishedAt: run.finishedAt, status: run.status })),
      questions: [...questions.values()].map((question) => ({
        ...question,
        points: runs.map((run) => {
          const snapshotQuestion = run.configurationSnapshot?.questions.find((item) => item.id === question.id);
          const scoped = snapshotQuestion ? samples.filter((sample) => sample.runId === run.id && sample.question === snapshotQuestion.question) : [];
          return { runId: run.id, finishedAt: run.finishedAt, ...this.metricsFor(brand.name, scoped) };
        }),
      })),
    };
  }

  async listWorkOrders(brandId: number) {
    await this.brand(brandId);
    const workOrders = await this.workOrders.find({ where: { brandId }, order: { updatedAt: 'DESC', id: 'DESC' } });
    return Promise.all(workOrders.map(async (workOrder) => ({
      ...workOrder,
      actions: await this.actions.find({
        where: { brandId, workOrderId: workOrder.id },
        order: { completedAt: 'ASC', id: 'ASC' },
      }),
      transitionHistory: await this.transitionHistory.find({
        where: { brandId, workOrderId: workOrder.id },
        order: { transitionedAt: 'ASC', id: 'ASC' },
      }),
    })));
  }

  async createWorkOrder(brandId: number, dto: CreateOptimizationWorkOrderDto) {
    await this.brand(brandId);
    if (dto.sourceRunId !== undefined) await this.sourceRun(brandId, dto.sourceRunId);
    if (dto.sourceFindingId !== undefined) await this.sourceFinding(brandId, dto.sourceFindingId);
    return this.workOrders.save(this.workOrders.create({
      brandId,
      sourceRunId: dto.sourceRunId ?? null,
      sourceFindingId: dto.sourceFindingId ?? null,
      title: this.optionalText(dto.title),
      description: this.optionalText(dto.description),
      acceptanceCriteria: this.optionalText(dto.acceptanceCriteria),
      ownerName: this.optionalText(dto.ownerName),
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      status: 'pending',
    }));
  }

  async addAction(brandId: number, workOrderId: number, dto: CreateOptimizationActionDto) {
    await this.workOrder(brandId, workOrderId);
    return this.actions.save(this.actions.create({
      brandId,
      workOrderId,
      description: dto.description.trim(),
      scope: dto.scope ?? null,
      evidence: dto.evidence ?? null,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : new Date(),
    }));
  }

  async transitionWorkOrder(brandId: number, workOrderId: number, dto: TransitionOptimizationWorkOrderDto) {
    const workOrder = await this.workOrder(brandId, workOrderId);
    if (!transitions[workOrder.status].includes(dto.status)) {
      throw new BadRequestException(`不允许从状态 ${workOrder.status} 流转至 ${dto.status}`);
    }
    if (dto.status === 'pending_verification' && await this.actions.count({ where: { brandId, workOrderId } }) === 0) {
      throw new BadRequestException('进入待验证前必须至少记录一项完成动作');
    }
    if (dto.status === 'verified') await this.verifiedComparison(brandId, dto);
    if (dto.status === 'cancelled' && !dto.reason?.trim()) throw new BadRequestException('取消工单必须提供原因');
    const previousStatus = workOrder.status;
    return this.dataSource.transaction(async (manager) => {
      workOrder.status = dto.status;
      const savedWorkOrder = await manager.getRepository(OptimizationWorkOrderEntity).save(workOrder);
      await manager.getRepository(OptimizationWorkOrderTransitionEntity).save(
        manager.getRepository(OptimizationWorkOrderTransitionEntity).create({
          brandId,
          workOrderId,
          previousStatus,
          newStatus: dto.status,
          comparisonId: dto.status === 'verified' ? dto.comparisonId! : null,
          acceptanceNote: dto.status === 'verified' ? this.optionalText(dto.acceptanceNote) : null,
          cancellationReason: dto.status === 'cancelled' ? this.optionalText(dto.reason) : null,
          actor: this.optionalText(dto.actor) ?? 'system',
        }),
      );
      return savedWorkOrder;
    });
  }

  async listAttributions(brandId: number) {
    await this.brand(brandId);
    return this.attributionRepository.find({ where: { brandId }, order: { createdAt: 'DESC', id: 'DESC' } });
  }

  async createAttribution(brandId: number, dto: CreateAttributionDto) {
    await Promise.all([this.workOrder(brandId, dto.workOrderId), this.comparison(brandId, dto.comparisonId)]);
    this.requireHumanAttributionEvidence(dto.conclusion, dto.rationale, dto.confirmedBy);
    return this.attributionRepository.save(this.attributionRepository.create({
      brandId,
      workOrderId: dto.workOrderId,
      comparisonId: dto.comparisonId,
      conclusion: dto.conclusion,
      rationale: this.optionalText(dto.rationale),
      confirmedBy: this.optionalText(dto.confirmedBy),
    }));
  }

  async suggestPossibleAttributions(brandId: number, comparisonId: number) {
    const comparison = await this.comparison(brandId, comparisonId);
    const [baseline, retest] = await Promise.all([
      this.run(brandId, comparison.baselineRunId),
      this.run(brandId, comparison.retestRunId),
    ]);
    const start = baseline.finishedAt ?? baseline.createdAt;
    const end = retest.createdAt;
    const actions = await this.actions.find({ where: { brandId }, order: { completedAt: 'ASC', id: 'ASC' } });
    const candidates = actions.filter((action) => action.completedAt >= start && action.completedAt <= end);
    return Promise.all(candidates.map(async (action) => {
      const existing = await this.attributionRepository.findOne({ where: { brandId, workOrderId: action.workOrderId, comparisonId } });
      if (existing) return existing;
      return this.attributionRepository.save(this.attributionRepository.create({
        brandId,
        workOrderId: action.workOrderId,
        comparisonId,
        conclusion: 'possible',
        rationale: `系统根据完成动作时间窗标记为可能关联：${action.completedAt.toISOString()}`,
        confirmedBy: null,
      }));
    }));
  }

  async listPeriodicRetestPlans(brandId: number) {
    await this.brand(brandId);
    return this.retestPlanRepository.find({ where: { brandId }, order: { updatedAt: 'DESC', id: 'DESC' } });
  }

  async createPeriodicRetestPlan(brandId: number, dto: CreatePeriodicRetestPlanDto) {
    await this.brand(brandId);
    this.requireExplicitPlanScope(dto.scope, dto.notification);
    if (dto.baselineRunId) await this.sourceRun(brandId, dto.baselineRunId);
    return this.retestPlanRepository.save(this.retestPlanRepository.create({
      brandId,
      baselineRunId: dto.baselineRunId ?? null,
      frequency: dto.frequency,
      scope: dto.scope,
      notification: dto.notification,
      enabled: dto.enabled ?? true,
      lastRunId: null,
      lastTriggeredAt: null,
    }));
  }

  async updatePeriodicRetestPlan(brandId: number, planId: number, dto: UpdatePeriodicRetestPlanDto) {
    const plan = await this.retestPlan(brandId, planId);
    const scope = dto.scope ?? plan.scope;
    const notification = dto.notification ?? plan.notification;
    this.requireExplicitPlanScope(scope, notification);
    if (dto.baselineRunId !== undefined) await this.sourceRun(brandId, dto.baselineRunId);
    if (dto.frequency !== undefined) plan.frequency = dto.frequency;
    plan.scope = scope;
    plan.notification = notification;
    if (dto.baselineRunId !== undefined) plan.baselineRunId = dto.baselineRunId;
    if (dto.enabled !== undefined) plan.enabled = dto.enabled;
    return this.retestPlanRepository.save(plan);
  }

  async triggerPeriodicRetest(brandId: number, planId: number) {
    const plan = await this.retestPlan(brandId, planId);
    if (!plan.enabled) throw new BadRequestException('复测计划已停用，不能手动发起复测');
    if (!this.executionDiagnosis) throw new BadRequestException('诊断执行服务不可用');
    const run = await this.executionDiagnosis.create(brandId);
    plan.lastRunId = run.id;
    plan.lastTriggeredAt = new Date();
    await this.retestPlanRepository.save(plan);
    return { plan, run };
  }

  async listComparisonExperiments(brandId: number) {
    await this.brand(brandId);
    return this.experimentRepository.find({ where: { brandId }, order: { createdAt: 'DESC', id: 'DESC' } });
  }

  async createComparisonExperiment(brandId: number, dto: CreateComparisonExperimentDto) {
    await this.brand(brandId);
    this.requireExperimentDefinition(dto);
    return this.experimentRepository.save(this.experimentRepository.create({
      brandId,
      name: dto.name.trim(),
      controlScope: dto.controlScope,
      treatmentScope: dto.treatmentScope,
      successMetrics: dto.successMetrics,
      version: 1,
      supersedesExperimentId: null,
      controlRunId: null,
      treatmentRunId: null,
      status: 'draft',
    }));
  }

  async replaceComparisonExperiment(brandId: number, experimentId: number, dto: CreateComparisonExperimentDto) {
    const previous = await this.experiment(brandId, experimentId);
    this.requireExperimentDefinition(dto);
    if (previous.status !== 'superseded') {
      previous.status = 'superseded';
      await this.experimentRepository.save(previous);
    }
    return this.experimentRepository.save(this.experimentRepository.create({
      brandId,
      name: dto.name.trim(),
      controlScope: dto.controlScope,
      treatmentScope: dto.treatmentScope,
      successMetrics: dto.successMetrics,
      version: previous.version + 1,
      supersedesExperimentId: previous.id,
      controlRunId: null,
      treatmentRunId: null,
      status: 'draft',
    }));
  }

  async evaluateExperiment(brandId: number, experimentId: number, dto: EvaluateComparisonExperimentDto = {}) {
    const experiment = await this.experiment(brandId, experimentId);
    if (!this.hasFields(experiment.successMetrics)) throw new BadRequestException('实验缺少成功指标');
    const controlRunId = dto.controlRunId ?? experiment.controlRunId;
    const treatmentRunId = dto.treatmentRunId ?? experiment.treatmentRunId;
    if (!controlRunId || !treatmentRunId) throw new BadRequestException('实验必须关联对照和实验运行');
    if (controlRunId === treatmentRunId) throw new BadRequestException('对照和实验运行必须不同');
    await Promise.all([this.run(brandId, controlRunId), this.run(brandId, treatmentRunId)]);
    experiment.controlRunId = controlRunId;
    experiment.treatmentRunId = treatmentRunId;
    experiment.status = 'running';
    await this.experimentRepository.save(experiment);
    const comparison = await this.compareRuns(brandId, controlRunId, treatmentRunId);
    experiment.status = 'completed';
    await this.experimentRepository.save(experiment);
    return { experiment, comparison, note: '系统仅提供对照数据，不自动确认因果结论。' };
  }

  private async verifiedComparison(brandId: number, dto: TransitionOptimizationWorkOrderDto) {
    if (!dto.comparisonId || !dto.acceptanceNote?.trim()) {
      throw new BadRequestException('必须关联可比验证比较和验收说明');
    }
    const comparison = await this.comparisons.findOne({ where: { id: dto.comparisonId, brandId } });
    if (!comparison || comparison.comparability !== 'comparable') {
      throw new BadRequestException('必须关联可比验证比较和验收说明');
    }
  }

  private async brand(brandId: number) {
    const brand = await this.brands.findOne({ where: { id: brandId, deleted: false } });
    if (!brand) throw new NotFoundException(`品牌 ${brandId} 不存在`);
    return brand;
  }

  private async workOrder(brandId: number, id: number) {
    const workOrder = await this.workOrders.findOne({ where: { id, brandId } });
    if (!workOrder) throw new NotFoundException(`优化工单 ${id} 不存在`);
    return workOrder;
  }

  private async sourceRun(brandId: number, id: number) {
    const run = await this.runs.findOne({ where: { id, brandId } });
    if (!run) throw new NotFoundException(`诊断批次 ${id} 不存在`);
    return run;
  }

  private async sourceFinding(brandId: number, id: number) {
    const finding = await this.findings.findOne({ where: { id, brandId } });
    if (!finding) throw new NotFoundException(`诊断发现 ${id} 不存在`);
    return finding;
  }

  private async comparison(brandId: number, id: number) {
    const comparison = await this.comparisons.findOne({ where: { id, brandId } });
    if (!comparison) throw new NotFoundException(`诊断比较 ${id} 不存在`);
    return comparison;
  }

  private async retestPlan(brandId: number, id: number) {
    const plan = await this.retestPlanRepository.findOne({ where: { id, brandId } });
    if (!plan) throw new NotFoundException(`周期复测计划 ${id} 不存在`);
    return plan;
  }

  private async experiment(brandId: number, id: number) {
    const experiment = await this.experimentRepository.findOne({ where: { id, brandId } });
    if (!experiment) throw new NotFoundException(`对比实验 ${id} 不存在`);
    return experiment;
  }

  private async run(brandId: number, id: number) {
    const run = await this.runs.findOne({ where: { id, brandId } });
    if (!run) throw new NotFoundException(`诊断批次 ${id} 不存在`);
    return run;
  }

  private async completedRuns(brandId: number) {
    return this.runs.find({
      where: { brandId, status: In(['succeeded', 'partial']) },
      order: { finishedAt: 'ASC', id: 'ASC' },
    });
  }

  private async samplesFor(runIds: number[]) {
    if (!runIds.length) return [];
    return this.samples.find({ where: { runId: In(runIds) }, order: { sampledAt: 'ASC', id: 'ASC' } });
  }

  private evaluateComparability(baseline: ExecutionDiagnosisRunEntity, retest: ExecutionDiagnosisRunEntity) {
    const reasons: string[] = [];
    if (baseline.brandId !== retest.brandId) reasons.push('brand');
    if (!this.isCompleted(baseline) || !this.isCompleted(retest)) reasons.push('not_completed');
    const baselineSnapshot = baseline.configurationSnapshot;
    const retestSnapshot = retest.configurationSnapshot;
    if (!baselineSnapshot || !retestSnapshot) return { comparability: 'incomparable' as const, reasons: [...reasons, 'missing_snapshot'], questionIds: [] as number[], engineIds: [] as number[] };
    if (!this.sameValue(this.normalizedMarkets(baselineSnapshot), this.normalizedMarkets(retestSnapshot))) reasons.push('market');
    if (baselineSnapshot.samplingMethod !== retestSnapshot.samplingMethod) reasons.push('sampling_method');
    if (baselineSnapshot.rulesVersion !== retestSnapshot.rulesVersion) reasons.push('rules_version');
    if (reasons.some((reason) => ['brand', 'not_completed', 'market', 'sampling_method', 'rules_version'].includes(reason))) {
      return { comparability: 'incomparable' as const, reasons, questionIds: [] as number[], engineIds: [] as number[] };
    }
    const baselineQuestions = this.canonicalQuestions(baselineSnapshot);
    const retestQuestions = this.canonicalQuestions(retestSnapshot);
    const baselineEngines = this.canonicalEngines(baselineSnapshot);
    const retestEngines = this.canonicalEngines(retestSnapshot);
    const questionIds = this.sharedEntryIds(baselineQuestions, retestQuestions);
    const engineIds = this.sharedEntryIds(baselineEngines, retestEngines);
    if (questionIds.length !== baselineSnapshot.questions.length || questionIds.length !== retestSnapshot.questions.length) reasons.push('question_set');
    if (engineIds.length !== baselineSnapshot.engines.length || engineIds.length !== retestSnapshot.engines.length) reasons.push('engine_set');
    const incompatible = !questionIds.length || !engineIds.length;
    if (incompatible) return { comparability: 'incomparable' as const, reasons, questionIds: [] as number[], engineIds: [] as number[] };
    return { comparability: (reasons.length ? 'partial' : 'comparable') as RunComparability, reasons, questionIds, engineIds };
  }

  private normalizedMarkets(snapshot: ExecutionDiagnosisConfigurationSnapshot) {
    return [...new Set(snapshot.markets)].sort();
  }

  private canonicalQuestions(snapshot: ExecutionDiagnosisConfigurationSnapshot) {
    return snapshot.questions
      .map((question) => ({ id: question.id, text: question.question, group: question.group, market: question.market, brandProbe: question.brandProbe === true }))
      .sort((left, right) => left.id - right.id);
  }

  private canonicalEngines(snapshot: ExecutionDiagnosisConfigurationSnapshot) {
    return snapshot.engines
      .map((engine) => ({ id: engine.id, code: engine.code, vendor: engine.vendor, modelName: engine.modelName ?? null, baseUrl: engine.baseUrl ?? null, webSearchEnabled: engine.nativeWebSearch === true }))
      .sort((left, right) => left.id - right.id);
  }

  private sharedEntryIds<T extends { id: number }>(baseline: T[], retest: T[]) {
    const retestEntries = new Set(retest.map((entry) => JSON.stringify(entry)));
    return baseline.filter((entry) => retestEntries.has(JSON.stringify(entry))).map((entry) => entry.id);
  }

  private sameValue(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private async comparisonMetrics(brandName: string, baseline: ExecutionDiagnosisRunEntity, retest: ExecutionDiagnosisRunEntity, questionIds: number[], engineIds: number[]) {
    const samples = await this.samplesFor([baseline.id, retest.id]);
    const scope = (run: ExecutionDiagnosisRunEntity) => {
      const questions = new Set(run.configurationSnapshot!.questions.filter((question) => questionIds.includes(question.id)).map((question) => question.question));
      return samples.filter((sample) => sample.runId === run.id && questions.has(sample.question ?? '') && engineIds.includes(sample.engineId));
    };
    const baselineMetrics = this.metricsFor(brandName, scope(baseline));
    const retestMetrics = this.metricsFor(brandName, scope(retest));
    return { sharedQuestionIds: questionIds, sharedEngineIds: engineIds, baseline: baselineMetrics, retest: retestMetrics, delta: { visibilityRate: retestMetrics.visibilityRate - baselineMetrics.visibilityRate, successfulSampleRate: retestMetrics.successfulSampleRate - baselineMetrics.successfulSampleRate } };
  }

  private configurationSummary(snapshot: ExecutionDiagnosisConfigurationSnapshot | null) {
    return snapshot ? { market: snapshot.market, questionCount: snapshot.questions.length, engineCount: snapshot.engines.length, samplingMethod: snapshot.samplingMethod, rulesVersion: snapshot.rulesVersion } : null;
  }

  private metricsFor(brandName: string, samples: ExecutionDiagnosisSampleEntity[]) {
    const successfulSamples = samples.filter((sample) => !sample.error);
    const mentions = samples.filter((sample) => this.sampleMentions(brandName, sample)).length;
    return { sampleCount: samples.length, successfulSampleRate: samples.length ? successfulSamples.length / samples.length : 0, visibilityRate: samples.length ? mentions / samples.length : 0 };
  }

  private sampleMentions(brandName: string, sample: ExecutionDiagnosisSampleEntity) {
    if (sample.reviewedBrandMention !== null && sample.reviewedBrandMention !== undefined) return sample.reviewedBrandMention;
    return sample.answer.toLocaleLowerCase().includes(brandName.toLocaleLowerCase());
  }

  private isCompleted(run: ExecutionDiagnosisRunEntity) { return run.status === 'succeeded' || run.status === 'partial'; }

  private get attributionRepository() {
    if (!this.attributions) throw new BadRequestException('归因服务不可用');
    return this.attributions;
  }

  private get retestPlanRepository() {
    if (!this.retestPlans) throw new BadRequestException('复测计划服务不可用');
    return this.retestPlans;
  }

  private get experimentRepository() {
    if (!this.experiments) throw new BadRequestException('对比实验服务不可用');
    return this.experiments;
  }

  private requireHumanAttributionEvidence(conclusion: AttributionConclusion, rationale?: string, confirmedBy?: string) {
    if (conclusion !== 'possible' && (!rationale?.trim() || !confirmedBy?.trim())) {
      throw new BadRequestException('确认归因必须填写人工依据和确认人');
    }
  }

  private requireExplicitPlanScope(scope: Record<string, unknown>, notification: Record<string, unknown>) {
    if (!this.hasFields(scope) || !this.hasFields(notification)) throw new BadRequestException('复测计划必须明确频率、范围和通知');
  }

  private requireExperimentDefinition(dto: CreateComparisonExperimentDto) {
    if (!this.hasFields(dto.controlScope) || !this.hasFields(dto.treatmentScope) || !this.hasFields(dto.successMetrics)) {
      throw new BadRequestException('实验必须定义对照范围、实验范围和成功指标');
    }
  }

  private hasFields(value: Record<string, unknown> | null | undefined) { return !!value && !Array.isArray(value) && Object.keys(value).length > 0; }

  private optionalText(value?: string) { return value?.trim() || null; }
}
