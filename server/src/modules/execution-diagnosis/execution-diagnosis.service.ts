import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { BrandEntity } from '../brands/brand.entity';
import { BrandEngineEntity } from '../brands/brand-engine.entity';
import { EngineEntity } from '../engines/engine.entity';
import { CompetitorEntity } from '../competitors/competitor.entity';
import { selectDiagnosticEngines } from '../engines/diagnostic-engine-selector';
import { getExecutionDiagnosisLogger } from '../../logging/pino-logger';
import { BrandDiagnosisQuestionEntity, ExecutionDiagnosisEventEntity, ExecutionDiagnosisPageEntity, ExecutionDiagnosisProbeEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisSampleEntity, ExecutionDiagnosisStepEntity, ExecutionDiagnosisWebReviewEntity, type ExecutionDiagnosisConfigurationSnapshot, type ExecutionRunStatus } from './execution-diagnosis.entity';
import { fetchPage, inspectHtml, sitemapLocations, websiteUnavailableResult, type FetchedPage } from './site-diagnostic';
import { toPageEvidence, toProbeEvidence, toSampleEvidence } from './evidence-records';
import { EngineSamplingClient } from './engine-sampling-client';
import { DiagnosisFindingEntity, type DiagnosisFindingType } from './optimization-verification.entity';
import { selectWebReviewSamples, webReviewCandidates, type WebReviewSelection } from './web-review-selector';
import { WebReviewRunnerService } from './web-review-runner.service';
import { QUESTION_TAXONOMY_VERSION } from './brand-question-prompt';
import { PlaywrightWebSamplingService } from './playwright-web-sampling.service';
import { SampleAnalysisService } from './sample-analysis.service';

type StepResult = NonNullable<ExecutionDiagnosisStepEntity['result']> & { stepStatus?: 'skipped' };
type RunContext = { brand: BrandEntity; pages: FetchedPage[]; baselineRunId: number | null };
const browserUa = 'Mozilla/5.0 (compatible; GeoCiteDiagnosis/1.0; +https://geocite.net)';
const aiCrawlerUas = ['GPTBot', 'ClaudeBot', 'Google-Extended'];

@Injectable()
export class ExecutionDiagnosisService {
  private readonly streams = new Map<number, Subject<MessageEvent>>();
  private readonly controllers = new Map<number, AbortController>();
  private readonly contexts = new Map<number, RunContext>();
  private readonly executions = new Map<number, Promise<void>>();
  private readonly engineSamplingClient = new EngineSamplingClient();

  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(BrandEngineEntity) private readonly brandEngines: Repository<BrandEngineEntity>,
    @InjectRepository(EngineEntity) private readonly engines: Repository<EngineEntity>,
    @InjectRepository(ExecutionDiagnosisRunEntity) private readonly runs: Repository<ExecutionDiagnosisRunEntity>,
    @InjectRepository(ExecutionDiagnosisStepEntity) private readonly steps: Repository<ExecutionDiagnosisStepEntity>,
    @InjectRepository(ExecutionDiagnosisEventEntity) private readonly eventsRepository: Repository<ExecutionDiagnosisEventEntity>,
    @InjectRepository(ExecutionDiagnosisPageEntity) private readonly pagesRepository: Repository<ExecutionDiagnosisPageEntity>,
    @InjectRepository(ExecutionDiagnosisProbeEntity) private readonly probesRepository: Repository<ExecutionDiagnosisProbeEntity>,
    @InjectRepository(ExecutionDiagnosisSampleEntity) private readonly samplesRepository: Repository<ExecutionDiagnosisSampleEntity>,
    @InjectRepository(BrandDiagnosisQuestionEntity) private readonly diagnosisQuestions: Repository<BrandDiagnosisQuestionEntity>,
    @InjectRepository(CompetitorEntity) private readonly competitors: Repository<CompetitorEntity>,
    @InjectRepository(DiagnosisFindingEntity) private readonly findings: Repository<DiagnosisFindingEntity>,
    @Optional() @InjectRepository(ExecutionDiagnosisWebReviewEntity) private readonly webReviews?: Repository<ExecutionDiagnosisWebReviewEntity>,
    private readonly webReviewRunner?: WebReviewRunnerService,
    @Optional() private readonly webSampler?: PlaywrightWebSamplingService,
    @Optional() private readonly sampleAnalysis?: SampleAnalysisService,
  ) {}

  async create(brandId: number, options: { scope?: 'all_configured' } = {}) {
    const brand = await this.brands.findOne({ where: { id: brandId, deleted: false } });
    if (!brand) throw new NotFoundException(`Brand ${brandId} 不存在`);
    const configurationSnapshot = await this.freezeConfiguration(brandId, 'v1', options.scope ?? 'all_configured', brand.playwrightWebReviewEnabled !== false);
    const run = await this.runs.save(this.runs.create({ brandId, status: 'queued', rulesVersion: 'v1', configurationSnapshot, summary: null, startedAt: null, finishedAt: null }));
    await this.steps.save(Array.from({ length: 8 }, (_, index) => this.steps.create({ runId: run.id, number: index + 1, status: 'pending', startedAt: null, finishedAt: null, errorCode: null, result: null })));
    getExecutionDiagnosisLogger(brand.code, run.id, run.createdAt).info({ brandId, status: run.status, rulesVersion: run.rulesVersion }, 'execution diagnosis created');
    this.streams.set(run.id, new Subject<MessageEvent>());
    const execution = this.execute(run.id).catch((error: unknown) => this.failRun(run.id, error));
    this.executions.set(run.id, execution);
    return this.findOne(brandId, run.id);
  }

  /** Allows local tooling to wait for the background run before releasing its database. */
  async waitForCompletion(runId: number) {
    const execution = this.executions.get(runId);
    await execution;
    this.executions.delete(runId);
  }

  async list(brandId: number) {
    const brand = await this.brands.findOne({ where: { id: brandId, deleted: false } });
    if (!brand) throw new NotFoundException(`Brand ${brandId} 不存在`);
    return this.runs.find({ where: { brandId }, order: { createdAt: 'DESC' }, take: 20, relations: { steps: true, events: true } }).then((runs) => runs.map((run) => this.serialize(run)));
  }

  async findOne(brandId: number, id: number) { return this.serialize(await this.getRun(id, brandId)); }

  async cancel(brandId: number, id: number) {
    const run = await this.getRun(id, brandId);
    if (this.isTerminal(run.status)) return this.serialize(run);
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    run.status = 'cancelled'; run.finishedAt = new Date();
    await this.runs.save(run);
    await this.steps.createQueryBuilder().update().set({ status: 'cancelled', finishedAt: new Date() }).where('run_id = :id AND status IN (:...statuses)', { id, statuses: ['pending', 'running'] }).execute();
    await this.publish(id, 'run', { status: 'cancelled' });
    (await this.runLogger(run)).warn({ status: run.status, finishedAt: run.finishedAt }, 'execution diagnosis cancelled');
    this.contexts.delete(id); this.streams.get(id)?.complete();
    return this.findOne(brandId, id);
  }

  async events(brandId: number, id: number): Promise<Observable<MessageEvent>> {
    await this.getRun(id, brandId);
    const stream = this.streams.get(id) ?? new Subject<MessageEvent>();
    if (!this.streams.has(id)) {
      this.streams.set(id, stream);
    }
    return new Observable<MessageEvent>((subscriber) => {
      const replay = () => this.eventsRepository.find({ where: { runId: id }, order: { sequence: 'ASC' } }).then((events) => {
        events.forEach((event) => subscriber.next({ id: String(event.sequence), type: event.type, data: { sequence: event.sequence, type: event.type, ...event.data, createdAt: event.createdAt.toISOString() } }));
      });
      if (stream.isStopped) {
        void replay().then(() => subscriber.complete()).catch((error: unknown) => subscriber.error(error));
        return undefined;
      }
      const sub = stream.subscribe(subscriber);
      void replay().catch((error: unknown) => subscriber.error(error));
      return () => sub.unsubscribe();
    });
  }

  private async execute(id: number): Promise<void> {
    const run = await this.getRun(id);
    const brand = await this.brands.findOneByOrFail({ id: run.brandId });
    this.controllers.set(id, new AbortController());
    this.contexts.set(id, { brand, pages: [], baselineRunId: null });
    run.status = 'running'; run.startedAt = new Date(); await this.runs.save(run);
    await this.publish(id, 'run', { status: 'running' });
    (await this.runLogger(run)).info({ status: run.status, startedAt: run.startedAt }, 'execution diagnosis started');
    for (let number = 1; number <= 8; number += 1) {
      if ((await this.getRun(id)).status === 'cancelled') return;
      await this.executeStep(id, number);
      if (number === 2 && (await this.getRun(id)).steps.find((step) => step.number === 2)?.status === 'failed') {
        await this.stopAfterWebsiteFailure(id);
        return;
      }
    }
    await this.finish(id);
  }

  private async executeStep(id: number, number: number) {
    const run = await this.getRun(id);
    const step = run.steps.find((item) => item.number === number);
    if (!step) return;
    step.status = 'running'; step.startedAt = new Date(); await this.steps.save(step);
    await this.publish(id, 'step', { number, status: 'running' });
    await this.log(id, number, `开始执行步骤 ${number}`);
    try {
      const result = await this.performStep(id, number);
      const current = await this.getRun(id);
      if (current.status === 'cancelled') return;
      step.status = result.stepStatus ?? (result.conclusion === 'failed' ? 'failed' : result.conclusion === 'partial' ? 'partial' : result.conclusion === 'unmeasured' ? 'unmeasured' : 'succeeded');
      step.finishedAt = new Date(); step.result = result; await this.steps.save(step);
      await this.publish(id, 'step', { number, status: step.status, result });
      await this.log(id, number, `步骤 ${number} 执行完成`);
    } catch (error) {
      if ((await this.getRun(id)).status === 'cancelled') return;
      const message = error instanceof Error ? error.message : '未知错误';
      step.status = 'failed'; step.errorCode = 'execution-error'; step.finishedAt = new Date(); step.result = { conclusion: 'failed', severity: 'P1', evidence: { message }, recommendation: 'review-step-error' };
      await this.steps.save(step); await this.publish(id, 'step', { number, status: step.status, result: step.result }); await this.log(id, number, `步骤 ${number} 执行失败：${message}`);
    }
  }

  private async finish(id: number) {
    const run = await this.getRun(id);
    if (run.status === 'cancelled') return;
    const stepCounts = run.steps.reduce((counts, step) => ({ ...counts, [step.status]: (counts[step.status] ?? 0) + 1 }), {} as Record<string, number>);
    run.finishedAt = new Date(); run.summary = { passed: stepCounts.succeeded ?? 0, failed: stepCounts.failed ?? 0, manual: 0, unmeasured: stepCounts.unmeasured ?? 0 };
    await this.generateFindings(run);
    run.status = (stepCounts.failed || stepCounts.partial || stepCounts.unmeasured) ? 'partial' : 'succeeded';
    (await this.runLogger(run)).info({ status: run.status, summary: run.summary, finishedAt: run.finishedAt }, 'execution diagnosis completed');
    await this.runs.save(run); await this.publish(id, 'summary', { status: run.status, summary: run.summary });
    this.controllers.delete(id); this.contexts.delete(id); this.streams.get(id)?.complete();
  }

  private async publish(runId: number, type: ExecutionDiagnosisEventEntity['type'], data: Record<string, unknown>) {
    const sequence = (await this.eventsRepository.count({ where: { runId } })) + 1;
    const event = await this.eventsRepository.save(this.eventsRepository.create({ runId, sequence, type, data }));
    const stream = this.streams.get(runId);
    stream?.next({ id: String(sequence), type, data: { sequence, type, ...data, createdAt: event.createdAt.toISOString() } });
  }

  private async getRun(id: number, brandId?: number) {
    const where = brandId === undefined ? { id } : { id, brandId };
    const run = await this.runs.findOne({ where, relations: { steps: true, events: true } });
    if (!run) throw new NotFoundException(`执行诊断 ${id} 不存在`);
    return run;
  }
  private async samplingEngines(brandId: number) {
    const links = await this.brandEngines.find({ where: { brandId }, order: { engineId: 'ASC' } });
    if (!links.length) return selectDiagnosticEngines([]);
    const engines = await this.engines.findBy(links.map((link) => ({ id: link.engineId, deleted: false })));
    return selectDiagnosticEngines(engines);
  }
  private async freezeConfiguration(brandId: number, rulesVersion: string, executionScope: 'all_configured', webReviewEnabled: boolean): Promise<ExecutionDiagnosisConfigurationSnapshot> {
    const [questions, engines] = await Promise.all([
      this.diagnosisQuestions.find({ where: { brandId }, order: { ordr: 'ASC', id: 'ASC' } }),
      this.samplingEngines(brandId),
    ]);
    const markets = [...new Set(questions.map((item) => item.market))];
    return {
      questions: questions.map((item) => ({ id: item.id, question: item.question, group: item.primaryCategory ?? item.group, primaryCategory: item.primaryCategory ?? item.group ?? '核心业务能力提问', secondaryCategory: item.secondaryCategory ?? '能力确认', market: item.market, brandProbe: item.brandProbe })),
      market: markets.length === 1 ? markets[0] : markets.length ? 'mixed' : null,
      markets,
      engines: engines.eligible.map((item) => ({ id: item.id, name: item.name, code: item.code, vendor: item.vendor, modelName: item.modelName, baseUrl: item.baseUrl, apiKey: item.apiKey, nativeWebSearch: item.webSearchEnabled === true })),
      skippedEngines: engines.skipped,
      samplingMethod: 'playwright',
      rulesVersion,
      taxonomyVersion: QUESTION_TAXONOMY_VERSION,
      executionScope,
      webReview: { rulesVersion: 'v1', minimumRate: 0.3, randomSeed: randomUUID(), candidateSampleIds: [], selected: [], enabled: webReviewEnabled },
    };
  }
  private async performStep(runId: number, number: number): Promise<StepResult> {
    const context = this.contexts.get(runId);
    if (!context) throw new Error('诊断上下文不存在');
    const signal = this.controllers.get(runId)?.signal;
    if (number === 1) {
      const baseline = await this.runs.findOne({ where: { brandId: context.brand.id, status: 'succeeded' }, order: { finishedAt: 'DESC' } });
      context.baselineRunId = baseline?.id ?? null;
      await this.log(runId, number, baseline ? `读取历史运行 #${baseline.id} 作为对比基线` : '没有历史成功运行，本次将建立首个基线');
      return { conclusion: 'passed', severity: 'info', evidence: { baselineRunId: baseline?.id ?? null, rulesVersion: 'v1' }, recommendation: 'continue' };
    }
    if (number === 2) {
      if (!context.brand.website) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { reason: 'brand-website-not-configured' }, recommendation: 'configure-brand-website' };
      let root: FetchedPage;
      try { root = await fetchPage(context.brand.website, browserUa, signal); }
      catch (error) { await this.log(runId, number, `网站无法访问：${context.brand.website}`); return websiteUnavailableResult(context.brand.website, undefined, error); }
      context.pages = [root]; await this.savePageEvidence(runId, root);
      await this.log(runId, number, `入口页返回 HTTP ${root.status}`);
      if (root.status >= 400) return websiteUnavailableResult(context.brand.website, root.status);
      const origin = new URL(context.brand.website).origin;
      for (const path of ['/robots.txt', '/sitemap.xml']) {
        try { const page = await fetchPage(`${origin}${path}`, browserUa, signal); context.pages.push(page); await this.savePageEvidence(runId, page); await this.log(runId, number, `${path} 返回 HTTP ${page.status}`); } catch (error) { await this.log(runId, number, `${path} 请求失败`); }
      }
      const sitemap = context.pages.find((page) => page.url.endsWith('/sitemap.xml'));
      const urls = sitemap?.status === 200 ? sitemapLocations(sitemap.html, context.brand.sitemapUrlLimit ?? 10) : [];
      for (const url of urls) { try { const page = await fetchPage(url, browserUa, signal); context.pages.push(page); await this.savePageEvidence(runId, page); await this.log(runId, number, `抓取 ${url}：HTTP ${page.status}`); } catch { await this.log(runId, number, `抓取失败：${url}`); } }
      const okPages = context.pages.filter((page) => page.status >= 200 && page.status < 400).length;
      return { conclusion: root.status < 400 ? 'passed' : 'failed', severity: root.status < 400 ? 'info' : 'P0', evidence: { pages: context.pages.map(({ url, status }) => ({ url, status })), okPages }, recommendation: root.status < 400 ? 'continue' : 'restore-site-access' };
    }
    if (number === 3) {
      if (!context.brand.website) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { reason: 'brand-website-not-configured' }, recommendation: 'configure-brand-website' };
      const probes: Array<{ userAgent: string; status: number | null }> = [];
      for (const userAgent of [browserUa, ...aiCrawlerUas]) {
        try { const page = await fetchPage(context.brand.website, userAgent, signal); probes.push({ userAgent, status: page.status }); await this.probesRepository.save(this.probesRepository.create(toProbeEvidence(runId, userAgent, context.brand.website, page.status))); await this.log(runId, number, `${userAgent} 返回 HTTP ${page.status}`); } catch { probes.push({ userAgent, status: null }); await this.probesRepository.save(this.probesRepository.create(toProbeEvidence(runId, userAgent, context.brand.website, null))); await this.log(runId, number, `${userAgent} 请求失败`); }
      }
      const blocked = probes.filter((probe) => probe.userAgent !== browserUa && (probe.status === null || probe.status >= 400));
      return { conclusion: blocked.length ? 'failed' : 'passed', severity: blocked.length ? 'P0' : 'info', evidence: { probes, blocked: blocked.map((item) => item.userAgent) }, recommendation: blocked.length ? 'allow-approved-ai-crawlers' : 'continue' };
    }
    if (number === 4) {
      const htmlPages = context.pages.filter((page) => page.contentType?.includes('text/html'));
      const signals = htmlPages.map((page) => ({ url: page.url, ...inspectHtml(page.html) }));
      await this.log(runId, number, `分析 ${signals.length} 个 HTML 页面`);
      const usable = signals.filter((item) => item.headingCount > 0 && item.paragraphCount > 0).length;
      return { conclusion: htmlPages.length ? 'passed' : 'unmeasured', severity: htmlPages.length ? 'info' : 'unmeasured', evidence: { pageCount: htmlPages.length, usablePages: usable, signals }, recommendation: htmlPages.length ? 'review-findings' : 'complete-site-crawl' };
    }
    if (number === 5) return this.sampleEngines(runId, context.brand, signal);
    if (number === 6) return this.runWebReview(runId);
    if (number === 7) return this.applyWebReviewCorrection(runId, context.baselineRunId);
    return { conclusion: 'passed', severity: 'info', evidence: { runId, generatedAt: new Date().toISOString() }, recommendation: 'review-diagnosis-summary' };
  }
  private async stopAfterWebsiteFailure(id: number) {
    const run = await this.getRun(id);
    const stoppedAt = new Date();
    const reason = '站点不可访问，已停止后续诊断步骤。';
    const pending = run.steps.filter((step) => step.status === 'pending');
    for (const step of pending) {
      step.status = 'skipped'; step.startedAt = stoppedAt; step.finishedAt = stoppedAt;
      step.result = { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { message: reason }, recommendation: 'restore-site-access' };
      await this.steps.save(step);
      await this.publish(id, 'step', { number: step.number, status: step.status, result: step.result });
    }
    run.status = 'failed'; run.finishedAt = stoppedAt; run.summary = { passed: 1, failed: 1, manual: 0, unmeasured: pending.length };
    await this.generateFindings(run); await this.runs.save(run); await this.publish(id, 'summary', { status: run.status, summary: run.summary });
    await this.log(id, 2, reason);
    (await this.runLogger(run)).warn({ status: run.status, summary: run.summary }, reason);
    this.controllers.delete(id); this.contexts.delete(id); this.streams.get(id)?.complete();
  }

  private async sampleEngines(runId: number, brand: BrandEntity, signal?: AbortSignal): Promise<StepResult> {
    const run = await this.getRun(runId);
    const snapshot = run.configurationSnapshot;
    const { eligible, skipped } = snapshot
      ? {
        eligible: snapshot.engines.map((engine) => ({ ...engine, webSearchEnabled: true, disabled: false })),
        skipped: snapshot.skippedEngines,
      }
      : await this.samplingEngines(brand.id);
    const questions = snapshot?.questions.map((item) => item.question) ?? (await this.diagnosisQuestions.find({ where: { brandId: brand.id }, order: { ordr: 'ASC', id: 'ASC' } })).map((item) => item.question);
    if (!questions.length) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { sampled: [], skipped, reason: 'diagnosis-questions-not-configured' }, recommendation: 'configure-diagnosis-questions' };
    if (!eligible.length) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { sampled: [], skipped }, recommendation: 'configure-authorized-engine' };
    const sampled: Array<Record<string, unknown>> = [];
    for (const engine of eligible) {
      signal?.throwIfAborted();
      const requests = questions.map((question) => ({
        question,
        prompt: this.webSearchPrompt(brand, question),
        brandName: brand.name,
      }));
      await this.log(runId, 5, `使用 ${engine.name} 的受控网页端发起低频联网问题采样：${questions.length} 题`);
      let logQueue = Promise.resolve();
      const results = this.webSampler
        ? await this.webSampler.searchBatch(engine, requests, {
          signal,
          onLog: (message) => {
            logQueue = logQueue.then(() => this.log(runId, 5, `${engine.name}: ${message}`));
          },
        })
        : requests.map((request) => ({ question: request.question, answer: '', citations: [], adapter: null, error: 'playwright-web-sampler-unavailable' }));
      await logQueue;
      const entries: Array<Record<string, unknown>> = [];
      for (const [index, result] of results.entries()) {
        const request = requests[index];
        if (!request) continue;
        await this.samplesRepository.save(this.samplesRepository.create(toSampleEvidence(
          runId,
          engine,
          request.question,
          request.prompt,
          null,
          result.answer,
          result.error,
          { adapter: result.adapter ?? undefined, nativeWebSearch: true, citations: result.citations },
        )));
        entries.push({ question: request.question, status: result.error ? 'failed' : 'sampled', answerExcerpt: result.answer.slice(0, 500), adapter: result.adapter, citations: result.citations.length, reason: result.error });
      }
      const succeeded = entries.filter((item) => item.status === 'sampled').length;
      const failed = entries.length - succeeded;
      sampled.push({ id: engine.id, name: engine.name, status: succeeded ? 'sampled' : failed ? 'failed' : 'skipped', totalQuestions: questions.length, succeeded, failed, skipped: questions.length - succeeded - failed, questions: entries });
    }
    const succeeded = sampled.reduce((count, item) => count + (typeof item.succeeded === 'number' ? item.succeeded : 0), 0);
    const total = eligible.length * questions.length;
    const analysis = await this.analyzeSamples(runId, brand.id);
    return { conclusion: succeeded ? 'passed' : 'failed', severity: succeeded ? 'info' : 'P1', evidence: { samplingMethod: 'playwright', sampled, skipped, totalQuestions: total, succeededQuestions: succeeded, failedQuestions: total - succeeded, questionsPerEngine: questions.length, analysis }, recommendation: succeeded ? 'review-samples' : 'restore-engine-web-session' };
  }

  private webSearchPrompt(brand: Pick<BrandEntity, 'name' | 'website'>, question: string) {
    return `请联网搜索，回答务必输出网页引用来源以及原文链接。\n\n请根据公开可见信息回答以下品牌问题。品牌：${brand.name}；官网：${brand.website ?? '未配置'}。若无法确认，请明确说明。\n\n问题：${question}`;
  }

  /**
   * API 采样备用路径：保留用于未来的离线或成本对照实验。
   * 当前执行诊断步骤 5 不调用此函数，避免 API 结果与真实网页端回答混杂。
   */
  private async sampleEnginesViaApi(runId: number, brand: BrandEntity, signal?: AbortSignal): Promise<StepResult> {
    const run = await this.getRun(runId);
    const snapshot = run.configurationSnapshot;
    const { eligible, skipped } = snapshot
      ? {
        eligible: snapshot.engines.map((engine) => ({ ...engine, webSearchEnabled: engine.nativeWebSearch, disabled: false })),
        skipped: snapshot.skippedEngines,
      }
      : await this.samplingEngines(brand.id);
    const questions = snapshot?.questions.map((item) => item.question) ?? (await this.diagnosisQuestions.find({ where: { brandId: brand.id }, order: { ordr: 'ASC', id: 'ASC' } })).map((item) => item.question);
    if (!questions.length) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { sampled: [], skipped, reason: 'diagnosis-questions-not-configured' }, recommendation: 'configure-diagnosis-questions' };
    if (!eligible.length) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { sampled: [], skipped }, recommendation: 'configure-authorized-engine' };
    const sampled: Array<Record<string, unknown>> = [];
    for (const engine of eligible) {
      const results: Array<Record<string, unknown>> = [];
      for (const question of questions) {
        const prompt = this.webSearchPrompt(brand, question);
        if (!engine.baseUrl || !engine.modelName || !engine.apiKey) {
          await this.samplesRepository.save(this.samplesRepository.create(toSampleEvidence(runId, engine, question, prompt, null, '', 'engine-config-incomplete')));
          results.push({ question, status: 'skipped', reason: 'engine-config-incomplete' });
          continue;
        }
        const nativeWebSearch = engine.webSearchEnabled === true;
        await this.log(runId, 5, `向 ${engine.name} 发起${nativeWebSearch ? '原生联网' : ''}问题采样：${question}`);
        try {
          const response = await this.engineSamplingClient.sample(engine, prompt, { nativeWebSearch, signal });
          await this.samplesRepository.save(this.samplesRepository.create(toSampleEvidence(runId, engine, question, prompt, response.statusCode, response.answer, response.error, { adapter: response.adapter, nativeWebSearch: response.nativeWebSearch })));
          results.push({ question, status: response.error ? 'failed' : 'sampled', httpStatus: response.statusCode, answerExcerpt: response.answer.slice(0, 500), adapter: response.adapter, nativeWebSearch: response.nativeWebSearch });
          await this.log(runId, 5, `${engine.name} 的问题采样返回 HTTP ${response.statusCode}${nativeWebSearch && !response.nativeWebSearch ? '（该引擎暂未支持原生联网）' : ''}`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'request-failed';
          await this.samplesRepository.save(this.samplesRepository.create(toSampleEvidence(runId, engine, question, prompt, null, '', reason)));
          results.push({ question, status: 'failed', reason });
          await this.log(runId, 5, `${engine.name} 的问题采样失败：${question}`);
        }
      }
      const succeeded = results.filter((item) => item.status === 'sampled').length;
      const failed = results.filter((item) => item.status === 'failed').length;
      sampled.push({ id: engine.id, name: engine.name, status: succeeded ? 'sampled' : failed ? 'failed' : 'skipped', totalQuestions: questions.length, succeeded, failed, skipped: questions.length - succeeded - failed, questions: results });
    }
    const succeeded = sampled.reduce((count, item) => count + (typeof item.succeeded === 'number' ? item.succeeded : 0), 0);
    const total = eligible.length * questions.length;
    await this.freezeWebReviewSelection(run, brand);
    const analysis = await this.analyzeSamples(runId, brand.id);
    return { conclusion: succeeded ? 'passed' : 'failed', severity: succeeded ? 'info' : 'P1', evidence: { sampled, skipped, totalQuestions: total, succeededQuestions: succeeded, failedQuestions: total - succeeded, questionsPerEngine: questions.length, analysis }, recommendation: succeeded ? 'review-samples' : 'verify-engine-configuration' };
  }
  private async freezeWebReviewSelection(run: ExecutionDiagnosisRunEntity, brand: BrandEntity) {
    const webReview = run.configurationSnapshot?.webReview;
    if (!webReview || !webReview.enabled) return;
    const samples = await this.samplesRepository.find({ where: { runId: run.id } });
    const selectable = samples.map((sample) => ({ ...sample, apiBrandMentioned: this.mentions(sample.answer, brand.name) }));
    webReview.candidateSampleIds = webReviewCandidates(selectable).map((sample) => sample.id);
    webReview.selected = selectWebReviewSamples(selectable, run.configurationSnapshot?.questions ?? [], webReview.randomSeed, webReview.minimumRate) as ExecutionDiagnosisConfigurationSnapshot['webReview']['selected'];
    await this.runs.update(run.id, { configurationSnapshot: run.configurationSnapshot });
  }
  private async analyzeSamples(runId: number, brandId: number) {
    if (!this.sampleAnalysis) return { status: 'unavailable', reason: 'sample-analysis-service-unavailable' };
    try {
      const result = await this.sampleAnalysis.analyzeRun(brandId, runId);
      await this.log(runId, 5, `采样结束，已完成 ${result.completed} 条样本分析${result.failed ? `，${result.failed} 条分析失败` : ''}`);
      return { status: result.failed ? 'partial' : 'completed', ...result };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'sample-analysis-failed';
      await this.log(runId, 5, `采样结束，但样本分析未完成：${reason}`);
      return { status: 'failed', reason };
    }
  }
  private async runWebReview(runId: number): Promise<StepResult> {
    const run = await this.getRun(runId);
    if (run.configurationSnapshot?.samplingMethod === 'playwright') {
      return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { reason: 'playwright-primary-sampling' }, recommendation: 'review-browser-samples', stepStatus: 'skipped' };
    }
    const webReview = run.configurationSnapshot?.webReview;
    if (!webReview?.enabled) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { reason: 'playwright-web-review-disabled' }, recommendation: 'enable-playwright-web-review', stepStatus: 'skipped' };
    const samples = await this.samplesRepository.find({ where: { runId } });
    const byId = new Map(samples.map((sample) => [sample.id, sample]));
    const candidateIds = new Set(webReview.candidateSampleIds ?? []);
    const selected = webReview.selected
      .map((item) => ({ item, sample: byId.get(item.sampleId) }))
      .filter((item): item is { item: WebReviewSelection; sample: ExecutionDiagnosisSampleEntity } => Boolean(item.sample) && candidateIds.has(item.item.sampleId) && !item.sample.error)
      .sort((left, right) => left.sample.id - right.sample.id);
    if (!selected.length) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { selected: 0, candidateSampleIds: webReview.candidateSampleIds ?? [], unreviewableApiSamples: samples.filter((sample) => sample.error).map((sample) => ({ sampleId: sample.id, reason: sample.error })), reason: 'no-reviewable-api-samples' }, recommendation: 'review-api-sampling' };
    if (!this.webReviewRunner) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { selected: selected.length, reason: 'web-review-runner-unavailable' }, recommendation: 'configure-web-review-runner' };
    const outcomes: Array<{ sampleId: number; engineId: number; status: string; exclusionReason: string | null }> = [];
    const byEngine = new Map<number, Array<{ item: WebReviewSelection; sample: ExecutionDiagnosisSampleEntity }>>();
    selected.forEach((entry) => byEngine.set(entry.sample.engineId, [...(byEngine.get(entry.sample.engineId) ?? []), entry]));
    for (const entries of byEngine.values()) {
      let stopReason: string | null = null;
      for (const { item, sample } of entries) {
        const runnable = { id: sample.id, runId: sample.runId, engineId: sample.engineId, engineName: sample.engineName, engineCode: sample.engineCode, question: sample.question, prompt: sample.prompt, brandName: this.contexts.get(runId)?.brand.name ?? '' };
        const result = stopReason ? await this.webReviewRunner.exclude(runnable, item, stopReason)
            : await this.webReviewRunner.run(runnable, item);
        outcomes.push({ sampleId: sample.id, engineId: sample.engineId, status: result.status, exclusionReason: result.exclusionReason });
        if (result.terminalForEngine) stopReason = result.exclusionReason ?? 'web-review-engine-stopped';
      }
    }
    const succeeded = outcomes.filter((outcome) => outcome.status === 'succeeded').length;
    const excluded = outcomes.length - succeeded;
    return { conclusion: succeeded === outcomes.length ? 'passed' : succeeded ? 'partial' : 'unmeasured', severity: succeeded === outcomes.length ? 'info' : 'unmeasured', evidence: { selected: outcomes.length, succeeded, excluded, outcomes }, recommendation: succeeded ? 'use-web-review-correction' : 'restore-web-review-availability' };
  }
  private async applyWebReviewCorrection(runId: number, baselineRunId: number | null): Promise<StepResult> {
    const run = await this.getRun(runId);
    if (run.configurationSnapshot?.samplingMethod === 'playwright') {
      const samples = await this.samplesRepository.find({ where: { runId } });
      const browserSamples = samples.filter((sample) => !sample.error && sample.answer.trim());
      const brandName = this.contexts.get(runId)?.brand.name ?? '';
      const reviewedAnswers = browserSamples.map((sample) => ({ apiSampleId: sample.id, answer: sample.answer, brandMentioned: this.mentions(sample.answer, brandName) }));
      const brandMentionedCount = reviewedAnswers.filter((sample) => sample.brandMentioned).length;
      return { conclusion: browserSamples.length ? 'passed' : 'unmeasured', severity: browserSamples.length ? 'info' : 'unmeasured', evidence: { baselineRunId, successfulWebReviews: browserSamples.length, correctionSource: 'browser-primary', reviewedAnswers, brandMentionedCount, brandMentionRate: browserSamples.length ? brandMentionedCount / browserSamples.length : null, comparedAt: new Date().toISOString() }, recommendation: browserSamples.length ? 'review-delta' : 'restore-engine-web-session' };
    }
    const succeeded = this.webReviews ? await this.webReviews.find({ where: { runId, status: 'succeeded' } }) : [];
    const reviewedAnswers = succeeded.map((review) => ({ apiSampleId: review.apiSampleId, answer: review.answer ?? '', brandMentioned: review.brandMentioned ?? false }));
    const brandMentionedCount = reviewedAnswers.filter((review) => review.brandMentioned).length;
    return { conclusion: succeeded.length ? 'passed' : 'unmeasured', severity: succeeded.length ? 'info' : 'unmeasured', evidence: { baselineRunId, successfulWebReviews: succeeded.length, correctionSource: succeeded.length ? 'web-review' : 'api-reference-only', reviewedAnswers, brandMentionedCount, brandMentionRate: succeeded.length ? brandMentionedCount / succeeded.length : null, comparedAt: new Date().toISOString() }, recommendation: succeeded.length ? 'review-delta' : 'restore-web-review-availability' };
  }
  private async savePageEvidence(runId: number, page: FetchedPage) { await this.pagesRepository.save(this.pagesRepository.create(toPageEvidence(runId, page))); }
  private async generateFindings(run: ExecutionDiagnosisRunEntity) {
    const findings: Array<Omit<DiagnosisFindingEntity, 'id' | 'createdAt'>> = [];
    const add = (type: DiagnosisFindingType, priority: string, scope: Record<string, unknown>, evidence: Record<string, unknown>, recommendation: string) => findings.push({ brandId: run.brandId, sourceRunId: run.id, type, priority, scope, evidence, recommendation, status: 'open' });
    const websiteFailure = run.steps.find((step) => step.number === 2 && step.status === 'failed');
    if (websiteFailure) add('site_failure', 'P0', { step: 2 }, { result: websiteFailure.result, errorCode: websiteFailure.errorCode }, 'restore-site-access');
    const samples = await this.samplesRepository.find({ where: { runId: run.id } });
    const failedSamples = samples.filter((sample) => sample.error);
    if (failedSamples.length) add('sampling_failure', 'P1', { step: 5 }, { failedSamples: failedSamples.map((sample) => ({ id: sample.id, engineCode: sample.engineCode, question: sample.question, error: sample.error })) }, 'verify-engine-configuration');
    const successfulSamples = samples.filter((sample) => !sample.error && sample.answer.trim());
    if (!successfulSamples.length) {
      await Promise.all(findings.map((finding) => this.findings.save(this.findings.create(finding))));
      return;
    }
    const brand = await this.brands.findOne({ where: { id: run.brandId, deleted: false } });
    if (!brand) return;
    const competitors = (await this.competitors.find({ where: { brandId: run.brandId, deleted: false } })).filter((competitor) => competitor.enabled);
    const successfulReviews = this.webReviews ? await this.webReviews.find({ where: { runId: run.id, status: 'succeeded' } }) : [];
    const reviewBySampleId = new Map(successfulReviews.map((review) => [review.apiSampleId, review]));
    const byQuestion = new Map<string, Array<{ sample: ExecutionDiagnosisSampleEntity; answer: string; brandMentioned: boolean }>>();
    successfulSamples.forEach((sample) => {
      if (!sample.question) return;
      const review = reviewBySampleId.get(sample.id);
      const answer = review?.answer ?? sample.answer;
      const brandMentioned = review?.brandMentioned ?? this.mentions(answer, brand.name);
      byQuestion.set(sample.question, [...(byQuestion.get(sample.question) ?? []), { sample, answer, brandMentioned }]);
    });
    for (const [question, answers] of byQuestion) {
      const brandMentioned = answers.some((answer) => answer.brandMentioned);
      const evidence = { sampleIds: answers.map(({ sample }) => sample.id), answerCount: answers.length, webReviewedSampleIds: answers.filter(({ sample }) => reviewBySampleId.has(sample.id)).map(({ sample }) => sample.id) };
      if (!brandMentioned) add('brand_absent', 'P1', { question }, evidence, 'improve-brand-coverage');
      const dominantCompetitor = competitors.find((competitor) => answers.some(({ answer }) => [competitor.name, ...competitor.aliases].some((name) => this.mentions(answer, name))));
      if (!brandMentioned && dominantCompetitor) add('competitor_dominated', 'P1', { question, competitor: dominantCompetitor.name }, { ...evidence, competitor: dominantCompetitor.name }, 'address-competitor-gap');
    }
    await Promise.all(findings.map((finding) => this.findings.save(this.findings.create(finding))));
  }
  private mentions(answer: string, name: string) { return name.trim() !== '' && answer.toLocaleLowerCase().includes(name.trim().toLocaleLowerCase()); }
  private async log(runId: number, number: number, message: string) { await this.publish(runId, 'log', { number, message }); const run = await this.getRun(runId); (await this.runLogger(run)).info({ step: number }, message); }
  private async failRun(id: number, error: unknown) { const run = await this.getRun(id); if (this.isTerminal(run.status)) return; run.status = 'failed'; run.finishedAt = new Date(); run.summary = { passed: 0, failed: 1, manual: 0, unmeasured: 0 }; await this.generateFindings(run); await this.runs.save(run); await this.publish(id, 'summary', { status: run.status, summary: run.summary }); (await this.runLogger(run)).error({ error: error instanceof Error ? error.message : String(error) }, 'execution diagnosis failed'); this.controllers.delete(id); this.contexts.delete(id); this.streams.get(id)?.complete(); }
  private async runLogger(run: ExecutionDiagnosisRunEntity) { const brand = await this.brands.findOne({ where: { id: run.brandId } }); return getExecutionDiagnosisLogger(brand?.code ?? `brand-${run.brandId}`, run.id, run.createdAt); }
  private isTerminal(status: ExecutionRunStatus) { return ['succeeded', 'failed', 'cancelled', 'partial'].includes(status); }
  private serialize(run: ExecutionDiagnosisRunEntity) {
    return {
      id: run.id, brandId: run.brandId, status: run.status, rulesVersion: run.rulesVersion, configurationSnapshot: this.publicConfigurationSnapshot(run.configurationSnapshot), summary: run.summary, createdAt: run.createdAt, startedAt: run.startedAt, finishedAt: run.finishedAt,
      steps: [...(run.steps ?? [])].sort((a, b) => a.number - b.number).map((step) => ({ number: step.number, status: step.status, startedAt: step.startedAt, finishedAt: step.finishedAt, errorCode: step.errorCode, result: step.result })),
      events: [...(run.events ?? [])].sort((a, b) => a.sequence - b.sequence).flatMap((event) => event.type === 'log' && typeof event.data.number === 'number' && typeof event.data.message === 'string' ? [{ number: event.data.number, message: event.data.message, createdAt: event.createdAt.toISOString() }] : []),
    };
  }
  private publicConfigurationSnapshot(snapshot: ExecutionDiagnosisConfigurationSnapshot | null) {
    if (!snapshot) return null;
    return { ...snapshot, engines: snapshot.engines.map(({ apiKey: _apiKey, ...engine }) => engine) };
  }
}
