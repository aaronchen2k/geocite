import { Subject } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { ExecutionDiagnosisService } from './execution-diagnosis.service';

describe('ExecutionDiagnosisService events', () => {
  it('冻结网页复核开关、随机种子和八步运行框架', async () => {
    const brand = { id: 5, code: 'acme', name: 'Acme', playwrightWebReviewEnabled: false, deleted: false };
    const runs = {
      create: jest.fn((value) => ({ ...value, id: 7, createdAt: new Date('2026-08-17T00:00:00.000Z') })),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
    };
    const steps = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const service = new ExecutionDiagnosisService(
      { findOne: jest.fn().mockResolvedValue(brand) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never, runs as never, steps as never, {} as never, {} as never, {} as never, {} as never,
      { find: jest.fn().mockResolvedValue([]) } as never, {} as never, {} as never,
    );
    jest.spyOn(service as unknown as { execute(id: number): Promise<void> }, 'execute').mockResolvedValue();
    jest.spyOn(service as unknown as { findOne(brandId: number, id: number): Promise<unknown> }, 'findOne').mockResolvedValue({ id: 7, steps: [], events: [] });

    await service.create(5);

    expect(runs.create).toHaveBeenCalledWith(expect.objectContaining({
      configurationSnapshot: expect.objectContaining({
        taxonomyVersion: 'v1',
        webReview: expect.objectContaining({ enabled: false, minimumRate: 0.3, selected: [], randomSeed: expect.any(String) }),
      }),
    }));
    expect(steps.save).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ number: 8 })]));
  });

  it('冻结网页选样时只更新快照，不级联重存已持久化事件', async () => {
    const runs = { update: jest.fn().mockResolvedValue(undefined) };
    const service = new ExecutionDiagnosisService(
      {} as never, {} as never, {} as never, runs as never, {} as never, {} as never, {} as never, {} as never,
      { find: jest.fn().mockResolvedValue([{ id: 9, engineId: 2, question: '核心能力', answer: '答案', error: null }]) } as never,
      {} as never, {} as never, {} as never,
    );
    const run = { id: 7, configurationSnapshot: { questions: [{ id: 1, question: '核心能力', group: '核心业务能力提问', market: 'cn', brandProbe: false }], webReview: { rulesVersion: 'v1', minimumRate: 0.3, randomSeed: 'seed', selected: [], enabled: true } } };

    await (service as unknown as { freezeWebReviewSelection(run: unknown, brand: { name: string }): Promise<void> }).freezeWebReviewSelection(run, { name: 'Acme' });

    expect(runs.update).toHaveBeenCalledWith(7, expect.objectContaining({ configurationSnapshot: expect.objectContaining({ webReview: expect.objectContaining({ selected: [{ sampleId: 9, reasons: ['core_capability'] }] }) }) }));
  });

  it('冻结按 id 排序的成功 API 候选集，并且不把 API 失败样本加入网页复核', async () => {
    const runs = { update: jest.fn().mockResolvedValue(undefined) };
    const service = new ExecutionDiagnosisService(
      {} as never, {} as never, {} as never, runs as never, {} as never, {} as never, {} as never, {} as never,
      { find: jest.fn().mockResolvedValue([
        { id: 12, engineId: 2, question: '普通问题', answer: '', error: 'api-failed' },
        { id: 9, engineId: 2, question: '核心能力', answer: '答案', error: null },
      ]) } as never,
      {} as never, {} as never, {} as never,
    );
    const run = { id: 7, configurationSnapshot: { questions: [{ id: 1, question: '核心能力', group: '核心业务能力提问', market: 'cn', brandProbe: false }], webReview: { rulesVersion: 'v1', minimumRate: 0.3, randomSeed: 'seed', selected: [], enabled: true } } };

    await (service as unknown as { freezeWebReviewSelection(run: unknown, brand: { name: string }): Promise<void> }).freezeWebReviewSelection(run, { name: 'Acme' });

    expect(runs.update).toHaveBeenCalledWith(7, expect.objectContaining({ configurationSnapshot: expect.objectContaining({ webReview: expect.objectContaining({ candidateSampleIds: [9], selected: [{ sampleId: 9, reasons: ['core_capability'] }] }) }) }));
  });

  it('网页复核关闭时第六步精确跳过，不创建排除记录', async () => {
    const webReviews = { find: jest.fn(), create: jest.fn(), save: jest.fn() };
    const service = new ExecutionDiagnosisService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, webReviews as never, {} as never);
    jest.spyOn(service as unknown as { getRun(id: number): Promise<unknown> }, 'getRun').mockResolvedValue({ configurationSnapshot: { webReview: { enabled: false } } });

    await expect((service as unknown as { runWebReview(id: number): Promise<unknown> }).runWebReview(7)).resolves.toEqual({ conclusion: 'unmeasured', severity: 'unmeasured', evidence: { reason: 'playwright-web-review-disabled' }, recommendation: 'enable-playwright-web-review', stepStatus: 'skipped' });
    expect(webReviews.save).not.toHaveBeenCalled();
  });

  it('第七步以成功网页证据的真实 answer 和 brandMentioned 校正指标', async () => {
    const webReviews = { find: jest.fn().mockResolvedValue([
      { apiSampleId: 9, answer: '网页端没有提及品牌', brandMentioned: false },
      { apiSampleId: 10, answer: '网页端提及 Acme', brandMentioned: true },
    ]) };
    const service = new ExecutionDiagnosisService({} as never, {} as never, {} as never, { findOne: jest.fn().mockResolvedValue({ id: 7, configurationSnapshot: { samplingMethod: 'api' }, steps: [], events: [] }) } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, webReviews as never);

    await expect((service as unknown as { applyWebReviewCorrection(id: number, baseline: number | null): Promise<unknown> }).applyWebReviewCorrection(7, null)).resolves.toMatchObject({
      conclusion: 'passed', evidence: { correctionSource: 'web-review', successfulWebReviews: 2, brandMentionedCount: 1, brandMentionRate: 0.5, reviewedAnswers: [{ apiSampleId: 9, answer: '网页端没有提及品牌', brandMentioned: false }, { apiSampleId: 10, answer: '网页端提及 Acme', brandMentioned: true }] },
    });
  });

  it('生成发现时以成功网页复核的 brandMentioned 覆盖 API 答案判断', async () => {
    const samples = { find: jest.fn().mockResolvedValue([{ id: 9, question: '推荐什么服务？', answer: 'Acme 是首选', error: null }]) };
    const reviews = { find: jest.fn().mockResolvedValue([{ apiSampleId: 9, answer: '网页端未提及品牌', brandMentioned: false }]) };
    const findings = { create: jest.fn((value) => value), save: jest.fn().mockResolvedValue(undefined) };
    const service = new ExecutionDiagnosisService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, name: 'Acme', deleted: false }) } as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      samples as never, {} as never, { find: jest.fn().mockResolvedValue([]) } as never, findings as never, reviews as never,
    );

    await (service as unknown as { generateFindings(run: unknown): Promise<void> }).generateFindings({ id: 7, brandId: 5, steps: [] });

    expect(findings.save).toHaveBeenCalledWith(expect.objectContaining({ type: 'brand_absent', scope: { question: '推荐什么服务？' }, evidence: expect.objectContaining({ sampleIds: [9], webReviewedSampleIds: [9] }) }));
  });

  it('运行快照包含已持久化的步骤日志', () => {
    const service = new ExecutionDiagnosisService(
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    const snapshot = (service as unknown as { serialize(run: unknown): unknown }).serialize({
      id: 7, brandId: 3, status: 'succeeded', rulesVersion: 'v1', summary: null,
      createdAt: new Date('2026-08-14T00:00:00.000Z'), startedAt: null, finishedAt: null, steps: [],
      events: [{ sequence: 2, type: 'log', data: { number: 2, message: '入口页返回 HTTP 200' }, createdAt: new Date('2026-08-14T00:00:01.000Z') }],
    }) as { events?: unknown[] };

    expect(snapshot.events).toEqual([{ number: 2, message: '入口页返回 HTTP 200', createdAt: '2026-08-14T00:00:01.000Z' }]);
  });

  it('在任务已结束时仍回放已持久化的 SSE 事件', async () => {
    const eventsRepository = {
      find: jest.fn().mockResolvedValue([{ sequence: 1, type: 'run', data: { status: 'partial' }, createdAt: new Date('2026-08-14T00:00:00.000Z') }]),
    };
    const service = new ExecutionDiagnosisService(
      {} as never, {} as never, {} as never, { findOne: jest.fn().mockResolvedValue({ id: 7, brandId: 3, steps: [], events: [] }) } as never, {} as never, eventsRepository as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    const completed = new Subject();
    completed.complete();
    (service as unknown as { streams: Map<number, Subject<MessageEvent>> }).streams.set(7, completed);

    const received: unknown[] = [];
    const stream = await service.events(3, 7);
    await new Promise<void>((resolve, reject) => stream.subscribe({ next: (event) => received.push(event.data), error: reject, complete: resolve }));

    expect(received).toEqual([{ sequence: 1, type: 'run', status: 'partial', createdAt: '2026-08-14T00:00:00.000Z' }]);
  });

  it('rejects a run requested through a different brand scope', async () => {
    const runs = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new ExecutionDiagnosisService(
      {} as never, {} as never, {} as never, runs as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );

    await expect(service.findOne(5, 7)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cancel(5, 7)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.events(5, 7)).rejects.toBeInstanceOf(NotFoundException);
    expect(runs.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7, brandId: 5 } }));
  });

  it('以冻结引擎集合执行低频网页采样，并保存回答和引用而不调用 API 采样', async () => {
    const liveBrandEngines = { find: jest.fn() };
    const liveEngines = { findBy: jest.fn() };
    const runs = {
      findOne: jest.fn().mockResolvedValue({
        id: 7,
        configurationSnapshot: {
          questions: [{ id: 1, question: '冻结问题', group: '推荐', market: 'cn', brandProbe: false }],
          engines: [{ id: 2, name: 'Frozen Engine', code: 'frozen', vendor: 'Frozen Vendor', modelName: 'frozen-model', baseUrl: 'https://frozen.example', apiKey: 'frozen-key', nativeWebSearch: true }],
          skippedEngines: [], samplingMethod: 'playwright', rulesVersion: 'v1', market: 'cn', markets: ['cn'],
        },
        steps: [], events: [],
      }),
    };
    const samples = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const events = { count: jest.fn().mockResolvedValue(0), create: jest.fn((value) => ({ ...value, createdAt: new Date() })), save: jest.fn(async (value) => value) };
    const webSampler = {
      searchBatch: jest.fn(async (_engine, _requests, options) => {
        options.onLog('Codex 正在诊断浏览器连接');
        return [{
        question: '冻结问题', answer: '网页端的联网回答', citations: [{ title: '公开来源', url: 'https://example.com/source', excerpt: '摘要' }], adapter: 'frozen-web', error: null,
        }];
      }),
    };
    const sampleAnalysis = { analyzeRun: jest.fn().mockResolvedValue({ runId: 7, completed: 1, failed: 0 }) };
    const service = new ExecutionDiagnosisService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, code: 'acme' }) } as never, liveBrandEngines as never, liveEngines as never, runs as never, {} as never, events as never, {} as never, {} as never, samples as never, {} as never, {} as never, {} as never,
      {} as never, undefined, webSampler as never, sampleAnalysis as never,
    );
    const sampler = jest.spyOn((service as unknown as { engineSamplingClient: { sample: jest.Mock } }).engineSamplingClient, 'sample').mockResolvedValue({ adapter: 'frozen', nativeWebSearch: true, statusCode: 200, answer: '答案', error: null });

    await (service as unknown as { sampleEngines(runId: number, brand: { id: number; name: string; website: string | null }): Promise<unknown> }).sampleEngines(7, { id: 5, name: 'Acme', website: null });

    expect(webSampler.searchBatch).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Frozen Engine', code: 'frozen' }),
      [expect.objectContaining({ question: '冻结问题', prompt: expect.stringContaining('请联网搜索，回答务必输出网页引用来源以及原文链接。') })],
      expect.objectContaining({ onLog: expect.any(Function) }),
    );
    expect(events.save).toHaveBeenCalledWith(expect.objectContaining({ type: 'log', data: expect.objectContaining({ number: 5, message: expect.stringContaining('Codex 正在诊断浏览器连接') }) }));
    expect(samples.save).toHaveBeenCalledWith(expect.objectContaining({ answer: '网页端的联网回答', adapter: 'frozen-web', citations: [{ title: '公开来源', url: 'https://example.com/source', excerpt: '摘要' }] }));
    expect(sampleAnalysis.analyzeRun).toHaveBeenCalledWith(5, 7);
    expect(samples.save.mock.invocationCallOrder[0]).toBeLessThan(sampleAnalysis.analyzeRun.mock.invocationCallOrder[0]);
    expect(sampler).not.toHaveBeenCalled();
    expect(liveBrandEngines.find).not.toHaveBeenCalled();
    expect(liveEngines.findBy).not.toHaveBeenCalled();
  });

  it('样本分析不可用时保留采样结果并返回分析失败统计', async () => {
    const runs = {
      findOne: jest.fn().mockResolvedValue({
        id: 7,
        configurationSnapshot: {
          questions: [{ id: 1, question: '冻结问题', group: '推荐', market: 'cn', brandProbe: false }],
          engines: [{ id: 2, name: 'Frozen Engine', code: 'frozen', vendor: 'Frozen Vendor', modelName: 'frozen-model', baseUrl: 'https://frozen.example', apiKey: 'frozen-key', nativeWebSearch: true }],
          skippedEngines: [], samplingMethod: 'playwright', rulesVersion: 'v1', market: 'cn', markets: ['cn'],
        },
        steps: [], events: [],
      }),
    };
    const samples = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const sampleAnalysis = { analyzeRun: jest.fn().mockRejectedValue(new Error('default-model-unavailable')) };
    const service = new ExecutionDiagnosisService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, code: 'acme' }) } as never, {} as never, {} as never, runs as never, {} as never,
      { count: jest.fn().mockResolvedValue(0), create: jest.fn((value) => ({ ...value, createdAt: new Date() })), save: jest.fn(async (value) => value) } as never,
      {} as never, {} as never, samples as never, {} as never, {} as never, {} as never,
      {} as never, undefined,
      { searchBatch: jest.fn().mockResolvedValue([{ question: '冻结问题', answer: '网页端的联网回答', citations: [], adapter: 'frozen-web', error: null }]) } as never,
      sampleAnalysis as never,
    );

    await expect((service as unknown as { sampleEngines(runId: number, brand: { id: number; name: string; website: string | null }): Promise<unknown> }).sampleEngines(7, { id: 5, name: 'Acme', website: null })).resolves.toMatchObject({
      conclusion: 'passed',
      evidence: { analysis: { status: 'failed', reason: 'default-model-unavailable' } },
    });
    expect(samples.save).toHaveBeenCalledWith(expect.objectContaining({ answer: '网页端的联网回答' }));
  });

  it('persists the site-failure finding before publishing a failed run', async () => {
    const order: string[] = [];
    const run = {
      id: 7, brandId: 5, status: 'running', rulesVersion: 'v1', configurationSnapshot: null, summary: null,
      createdAt: new Date(), startedAt: new Date(), finishedAt: null,
      steps: [
        { number: 1, status: 'succeeded' },
        { number: 2, status: 'failed', errorCode: 'site-unavailable', result: { conclusion: 'failed', severity: 'P0', evidence: {}, recommendation: 'restore-site-access' } },
        { number: 3, status: 'pending' },
      ],
      events: [],
    };
    const service = new ExecutionDiagnosisService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, code: 'acme' }) } as never,
      {} as never, {} as never,
      { findOne: jest.fn().mockResolvedValue(run), save: jest.fn(async (value) => { if (value.status === 'failed') order.push('terminal-run'); return value; }) } as never,
      { save: jest.fn(async () => undefined) } as never,
      { count: jest.fn().mockResolvedValue(0), create: jest.fn((value) => ({ ...value, createdAt: new Date() })), save: jest.fn(async (value) => value) } as never,
      {} as never, {} as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never, {} as never,
      { create: jest.fn((value) => value), save: jest.fn(async (value) => { if (value.type === 'site_failure') order.push('site-finding'); return value; }) } as never,
    );

    await (service as unknown as { stopAfterWebsiteFailure(id: number): Promise<void> }).stopAfterWebsiteFailure(7);

    expect(order).toEqual(['site-finding', 'terminal-run']);
  });
});
