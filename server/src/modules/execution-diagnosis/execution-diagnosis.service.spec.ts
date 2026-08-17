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

  it('samples with the frozen engine configuration after the engine changes', async () => {
    const liveBrandEngines = { find: jest.fn() };
    const liveEngines = { findBy: jest.fn() };
    const runs = {
      findOne: jest.fn().mockResolvedValue({
        id: 7,
        configurationSnapshot: {
          questions: [{ id: 1, question: '冻结问题', group: '推荐', market: 'cn', brandProbe: false }],
          engines: [{ id: 2, name: 'Frozen Engine', code: 'frozen', vendor: 'Frozen Vendor', modelName: 'frozen-model', baseUrl: 'https://frozen.example', apiKey: 'frozen-key', nativeWebSearch: true }],
          skippedEngines: [], samplingMethod: 'api', rulesVersion: 'v1', market: 'cn', markets: ['cn'],
        },
        steps: [], events: [],
      }),
    };
    const samples = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const events = { count: jest.fn().mockResolvedValue(0), create: jest.fn((value) => ({ ...value, createdAt: new Date() })), save: jest.fn(async (value) => value) };
    const service = new ExecutionDiagnosisService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, code: 'acme' }) } as never, liveBrandEngines as never, liveEngines as never, runs as never, {} as never, events as never, {} as never, {} as never, samples as never, {} as never, {} as never, {} as never,
    );
    const sampler = jest.spyOn((service as unknown as { engineSamplingClient: { sample: jest.Mock } }).engineSamplingClient, 'sample').mockResolvedValue({ adapter: 'frozen', nativeWebSearch: true, statusCode: 200, answer: '答案', error: null });

    await (service as unknown as { sampleEngines(runId: number, brand: { id: number; name: string; website: string | null }): Promise<unknown> }).sampleEngines(7, { id: 5, name: 'Acme', website: null });

    expect(sampler).toHaveBeenCalledWith(expect.objectContaining({ name: 'Frozen Engine', modelName: 'frozen-model', baseUrl: 'https://frozen.example', apiKey: 'frozen-key' }), expect.any(String), expect.objectContaining({ nativeWebSearch: true }));
    expect(liveBrandEngines.find).not.toHaveBeenCalled();
    expect(liveEngines.findBy).not.toHaveBeenCalled();
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
