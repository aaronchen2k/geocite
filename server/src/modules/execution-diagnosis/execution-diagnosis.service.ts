import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';
import { BrandEntity } from '../brands/brand.entity';
import { BrandEngineEntity } from '../brands/brand-engine.entity';
import { EngineEntity } from '../engines/engine.entity';
import { selectDiagnosticEngines } from '../engines/diagnostic-engine-selector';
import { getExecutionDiagnosisLogger } from '../../logging/pino-logger';
import { ExecutionDiagnosisEventEntity, ExecutionDiagnosisRunEntity, ExecutionDiagnosisStepEntity, type ExecutionRunStatus, type ExecutionStepStatus } from './execution-diagnosis.entity';
import { fetchPage, inspectHtml, sitemapLocations, type FetchedPage } from './site-diagnostic';

type StepResult = NonNullable<ExecutionDiagnosisStepEntity['result']>;
type RunContext = { brand: BrandEntity; pages: FetchedPage[]; baselineRunId: number | null };
const browserUa = 'Mozilla/5.0 (compatible; GeoCiteDiagnosis/1.0; +https://geocite.net)';
const aiCrawlerUas = ['GPTBot', 'ClaudeBot', 'Google-Extended'];

@Injectable()
export class ExecutionDiagnosisService {
  private readonly streams = new Map<number, Subject<MessageEvent>>();
  private readonly controllers = new Map<number, AbortController>();
  private readonly contexts = new Map<number, RunContext>();

  constructor(
    @InjectRepository(BrandEntity) private readonly brands: Repository<BrandEntity>,
    @InjectRepository(BrandEngineEntity) private readonly brandEngines: Repository<BrandEngineEntity>,
    @InjectRepository(EngineEntity) private readonly engines: Repository<EngineEntity>,
    @InjectRepository(ExecutionDiagnosisRunEntity) private readonly runs: Repository<ExecutionDiagnosisRunEntity>,
    @InjectRepository(ExecutionDiagnosisStepEntity) private readonly steps: Repository<ExecutionDiagnosisStepEntity>,
    @InjectRepository(ExecutionDiagnosisEventEntity) private readonly eventsRepository: Repository<ExecutionDiagnosisEventEntity>,
  ) {}

  async create(brandId: number) {
    const brand = await this.brands.findOne({ where: { id: brandId, deleted: false } });
    if (!brand) throw new NotFoundException(`Brand ${brandId} 不存在`);
    const run = await this.runs.save(this.runs.create({ brandId, status: 'queued', rulesVersion: 'v1', summary: null, startedAt: null, finishedAt: null }));
    await this.steps.save(Array.from({ length: 7 }, (_, index) => this.steps.create({ runId: run.id, number: index + 1, status: 'pending', startedAt: null, finishedAt: null, errorCode: null, result: null })));
    getExecutionDiagnosisLogger(brand.code, run.id, run.createdAt).info({ brandId, status: run.status, rulesVersion: run.rulesVersion }, 'execution diagnosis created');
    this.streams.set(run.id, new Subject<MessageEvent>());
    void this.execute(run.id).catch((error: unknown) => this.failRun(run.id, error));
    return this.findOne(run.id);
  }

  async list(brandId: number) {
    const brand = await this.brands.findOne({ where: { id: brandId, deleted: false } });
    if (!brand) throw new NotFoundException(`Brand ${brandId} 不存在`);
    return this.runs.find({ where: { brandId }, order: { createdAt: 'DESC' }, take: 20, relations: { steps: true } }).then((runs) => runs.map((run) => this.serialize(run)));
  }

  async findOne(id: number) { return this.serialize(await this.getRun(id)); }

  async cancel(id: number) {
    const run = await this.getRun(id);
    if (this.isTerminal(run.status)) return this.serialize(run);
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    run.status = 'cancelled'; run.finishedAt = new Date();
    await this.runs.save(run);
    await this.steps.createQueryBuilder().update().set({ status: 'cancelled', finishedAt: new Date() }).where('run_id = :id AND status IN (:...statuses)', { id, statuses: ['pending', 'running'] }).execute();
    await this.publish(id, 'run', { status: 'cancelled' });
    (await this.runLogger(run)).warn({ status: run.status, finishedAt: run.finishedAt }, 'execution diagnosis cancelled');
    this.contexts.delete(id); this.streams.get(id)?.complete();
    return this.findOne(id);
  }

  events(id: number): Observable<MessageEvent> | null {
    const stream = this.streams.get(id) ?? new Subject<MessageEvent>();
    if (!this.streams.has(id)) {
      void this.runs.exist({ where: { id } }).then((exists) => { if (exists) this.streams.set(id, stream); else stream.complete(); });
    }
    return new Observable<MessageEvent>((subscriber) => {
      void this.eventsRepository.find({ where: { runId: id }, order: { sequence: 'ASC' } }).then((events) => events.forEach((event) => subscriber.next({ id: String(event.sequence), type: event.type, data: { sequence: event.sequence, type: event.type, ...event.data, createdAt: event.createdAt.toISOString() } }))).catch((error: unknown) => subscriber.error(error));
      const sub = stream.subscribe(subscriber);
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
    for (let number = 1; number <= 7; number += 1) {
      if ((await this.getRun(id)).status === 'cancelled') return;
      await this.executeStep(id, number);
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
      step.status = result.conclusion === 'failed' ? 'failed' : result.conclusion === 'unmeasured' ? 'unmeasured' : 'succeeded';
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
    run.status = (stepCounts.failed || stepCounts.unmeasured) ? 'partial' : 'succeeded'; run.finishedAt = new Date(); run.summary = { passed: stepCounts.succeeded ?? 0, failed: stepCounts.failed ?? 0, manual: 0, unmeasured: stepCounts.unmeasured ?? 0 };
    await this.runs.save(run); await this.publish(id, 'summary', { status: run.status, summary: run.summary });
    (await this.runLogger(run)).info({ status: run.status, summary: run.summary, finishedAt: run.finishedAt }, 'execution diagnosis completed');
    this.controllers.delete(id); this.contexts.delete(id); this.streams.get(id)?.complete();
  }

  private async publish(runId: number, type: ExecutionDiagnosisEventEntity['type'], data: Record<string, unknown>) {
    const sequence = (await this.eventsRepository.count({ where: { runId } })) + 1;
    const event = await this.eventsRepository.save(this.eventsRepository.create({ runId, sequence, type, data }));
    const stream = this.streams.get(runId);
    stream?.next({ id: String(sequence), type, data: { sequence, type, ...data, createdAt: event.createdAt.toISOString() } });
  }

  private async getRun(id: number) { const run = await this.runs.findOne({ where: { id }, relations: { steps: true } }); if (!run) throw new NotFoundException(`执行诊断 ${id} 不存在`); return run; }
  private async samplingEngines(brandId: number) {
    const links = await this.brandEngines.find({ where: { brandId }, order: { engineId: 'ASC' } });
    if (!links.length) return selectDiagnosticEngines([]);
    const engines = await this.engines.findBy(links.map((link) => ({ id: link.engineId, deleted: false })));
    return selectDiagnosticEngines(engines);
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
      const root = await fetchPage(context.brand.website, browserUa, signal); context.pages = [root];
      await this.log(runId, number, `入口页返回 HTTP ${root.status}`);
      const origin = new URL(context.brand.website).origin;
      for (const path of ['/robots.txt', '/sitemap.xml']) {
        try { const page = await fetchPage(`${origin}${path}`, browserUa, signal); context.pages.push(page); await this.log(runId, number, `${path} 返回 HTTP ${page.status}`); } catch (error) { await this.log(runId, number, `${path} 请求失败`); }
      }
      const sitemap = context.pages.find((page) => page.url.endsWith('/sitemap.xml'));
      const urls = sitemap?.status === 200 ? sitemapLocations(sitemap.html).slice(0, 10) : [];
      for (const url of urls) { try { const page = await fetchPage(url, browserUa, signal); context.pages.push(page); await this.log(runId, number, `抓取 ${url}：HTTP ${page.status}`); } catch { await this.log(runId, number, `抓取失败：${url}`); } }
      const okPages = context.pages.filter((page) => page.status >= 200 && page.status < 400).length;
      return { conclusion: root.status < 400 ? 'passed' : 'failed', severity: root.status < 400 ? 'info' : 'P0', evidence: { pages: context.pages.map(({ url, status }) => ({ url, status })), okPages }, recommendation: root.status < 400 ? 'continue' : 'restore-site-access' };
    }
    if (number === 3) {
      if (!context.brand.website) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { reason: 'brand-website-not-configured' }, recommendation: 'configure-brand-website' };
      const probes: Array<{ userAgent: string; status: number | null }> = [];
      for (const userAgent of [browserUa, ...aiCrawlerUas]) {
        try { const page = await fetchPage(context.brand.website, userAgent, signal); probes.push({ userAgent, status: page.status }); await this.log(runId, number, `${userAgent} 返回 HTTP ${page.status}`); } catch { probes.push({ userAgent, status: null }); await this.log(runId, number, `${userAgent} 请求失败`); }
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
    if (number === 6) return { conclusion: 'passed', severity: 'info', evidence: { baselineRunId: context.baselineRunId, comparedAt: new Date().toISOString() }, recommendation: context.baselineRunId ? 'review-delta' : 'use-this-run-as-baseline' };
    return { conclusion: 'passed', severity: 'info', evidence: { runId, generatedAt: new Date().toISOString() }, recommendation: 'review-diagnosis-summary' };
  }

  private async sampleEngines(runId: number, brand: BrandEntity, signal?: AbortSignal): Promise<StepResult> {
    const { eligible, skipped } = await this.samplingEngines(brand.id);
    if (!eligible.length) return { conclusion: 'unmeasured', severity: 'unmeasured', evidence: { sampled: [], skipped }, recommendation: 'configure-authorized-engine' };
    const sampled: Array<Record<string, unknown>> = [];
    for (const engine of eligible) {
      if (!engine.baseUrl || !engine.modelName || !engine.apiKey) { sampled.push({ id: engine.id, name: engine.name, status: 'skipped', reason: 'engine-config-incomplete' }); continue; }
      await this.log(runId, 5, `向 ${engine.name} 发起品牌问答采样`);
      try {
        const timeout = AbortSignal.timeout(45_000);
        const response = await fetch(`${engine.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { 'content-type': 'application/json', authorization: `Bearer ${engine.apiKey}` }, body: JSON.stringify({ model: engine.modelName, messages: [{ role: 'user', content: `请简要介绍品牌“${brand.name}”及其官网信息。若无法确认，请明确说明。` }], temperature: 0.2, max_tokens: 400 }) });
        const body = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }> };
        const answer = body.choices?.[0]?.message?.content ?? '';
        sampled.push({ id: engine.id, name: engine.name, status: response.ok ? 'sampled' : 'failed', httpStatus: response.status, answerExcerpt: answer.slice(0, 500) });
        await this.log(runId, 5, `${engine.name} 返回 HTTP ${response.status}`);
      } catch (error) { sampled.push({ id: engine.id, name: engine.name, status: 'failed', reason: error instanceof Error ? error.message : 'request-failed' }); await this.log(runId, 5, `${engine.name} 采样失败`); }
    }
    const succeeded = sampled.filter((item) => item.status === 'sampled').length;
    return { conclusion: succeeded ? 'passed' : 'failed', severity: succeeded ? 'info' : 'P1', evidence: { sampled, skipped }, recommendation: succeeded ? 'review-samples' : 'verify-engine-configuration' };
  }
  private async log(runId: number, number: number, message: string) { await this.publish(runId, 'log', { number, message }); const run = await this.getRun(runId); (await this.runLogger(run)).info({ step: number }, message); }
  private async failRun(id: number, error: unknown) { const run = await this.getRun(id); if (this.isTerminal(run.status)) return; run.status = 'failed'; run.finishedAt = new Date(); run.summary = { passed: 0, failed: 1, manual: 0, unmeasured: 0 }; await this.runs.save(run); await this.publish(id, 'summary', { status: run.status, summary: run.summary }); (await this.runLogger(run)).error({ error: error instanceof Error ? error.message : String(error) }, 'execution diagnosis failed'); this.controllers.delete(id); this.contexts.delete(id); this.streams.get(id)?.complete(); }
  private async runLogger(run: ExecutionDiagnosisRunEntity) { const brand = await this.brands.findOne({ where: { id: run.brandId } }); return getExecutionDiagnosisLogger(brand?.code ?? `brand-${run.brandId}`, run.id, run.createdAt); }
  private isTerminal(status: ExecutionRunStatus) { return ['succeeded', 'failed', 'cancelled', 'partial'].includes(status); }
  private serialize(run: ExecutionDiagnosisRunEntity) { return { id: run.id, brandId: run.brandId, status: run.status, rulesVersion: run.rulesVersion, summary: run.summary, createdAt: run.createdAt, startedAt: run.startedAt, finishedAt: run.finishedAt, steps: [...(run.steps ?? [])].sort((a, b) => a.number - b.number).map((step) => ({ number: step.number, status: step.status, startedAt: step.startedAt, finishedAt: step.finishedAt, errorCode: step.errorCode, result: step.result })) }; }
}
