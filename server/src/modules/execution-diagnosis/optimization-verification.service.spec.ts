import { ExecutionDiagnosisService } from './execution-diagnosis.service';
import { DiagnosisFindingEntity } from './optimization-verification.entity';
import { OptimizationVerificationService } from './optimization-verification.service';

describe('ExecutionDiagnosisService optimization verification', () => {
  it('freezes the run configuration and creates a competitor-dominated finding', async () => {
    const findings: DiagnosisFindingEntity[] = [];
    const run = {
      id: 7,
      brandId: 5,
      status: 'queued',
      rulesVersion: 'v1',
      configurationSnapshot: null,
      summary: null,
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
      startedAt: null,
      finishedAt: null,
      steps: [],
      events: [],
    };
    const brands = { findOne: jest.fn().mockResolvedValue({ id: 5, code: 'acme', name: 'Acme', website: null, deleted: false }) };
    const runs = {
      create: jest.fn((value) => Object.assign(run, value)),
      save: jest.fn(async (value) => value),
      findOne: jest.fn().mockResolvedValue(run),
    };
    const diagnosisQuestions = { find: jest.fn().mockResolvedValue([{ id: 3, question: '有哪些选择？', group: '推荐', market: 'cn', brandProbe: false }]) };
    const samples = { find: jest.fn().mockResolvedValue([{ question: '有哪些选择？', answer: 'Competitor X 是首选。', error: null }]) };
    const findingsRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => { findings.push(value); return value; }),
      find: jest.fn(async ({ where }) => findings.filter((finding) => finding.sourceRunId === where.sourceRunId)),
    };
    const service = new ExecutionDiagnosisService(
      brands as never,
      { find: jest.fn().mockResolvedValue([{ engineId: 2 }]) } as never,
      { findBy: jest.fn().mockResolvedValue([{ id: 2, name: 'Search API', code: 'search-api', modelName: 'model', webSearchEnabled: true, disabled: false }]) } as never,
      runs as never,
      { create: jest.fn((value) => value), save: jest.fn() } as never,
      { count: jest.fn().mockResolvedValue(0), create: jest.fn((value) => ({ ...value, createdAt: new Date() })), save: jest.fn(async (value) => value) } as never,
      {} as never,
      {} as never,
      samples as never,
      diagnosisQuestions as never,
      { find: jest.fn().mockResolvedValue([{ name: 'Competitor X', aliases: [], enabled: true, deleted: false }]) } as never,
      findingsRepository as never,
    );
    let executionError: unknown;
    jest.spyOn(service as unknown as { execute(id: number): Promise<void> }, 'execute').mockImplementation(async () => {
      try { await (service as unknown as { finish(id: number): Promise<void> }).finish(run.id); }
      catch (error) { executionError = error; throw error; }
    });

    const created = await service.create(5);
    await waitFor(() => findings.length > 0 || executionError !== undefined);
    if (executionError) throw executionError;

    expect(created.configurationSnapshot?.samplingMethod).toBe('api');
    expect(await findingsRepository.find({ where: { sourceRunId: created.id } })).toContainEqual(
      expect.objectContaining({ type: 'competitor_dominated' }),
    );
  });
});

describe('OptimizationVerificationService', () => {
  it('marks runs with different frozen markets as incomparable', async () => {
    const snapshot = (market: 'cn' | 'global') => ({
      market,
      markets: [market],
      questions: [{ id: 1, question: '品牌表现如何？', group: '品牌', market, brandProbe: true }],
      engines: [{ id: 2, name: 'Search', code: 'search', vendor: 'vendor', modelName: 'model', baseUrl: null, apiKey: null, nativeWebSearch: false }],
      skippedEngines: [],
      samplingMethod: 'api' as const,
      rulesVersion: 'v1',
    });
    const runs = {
      findOne: jest.fn(async ({ where }) => ({
        id: where.id,
        brandId: where.brandId,
        status: 'succeeded',
        configurationSnapshot: snapshot(where.id === 7 ? 'cn' : 'global'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        finishedAt: new Date('2026-08-01T01:00:00.000Z'),
      })),
    };
    const comparisons = { create: jest.fn((value) => value), save: jest.fn(async (value) => ({ id: 12, ...value })) };
    const service = new OptimizationVerificationService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, name: 'Acme', deleted: false }) } as never,
      runs as never,
      {} as never,
      {} as never,
      {} as never,
      comparisons as never,
      {} as never,
      {} as never,
      { find: jest.fn() } as never,
    );

    const result = await service.compareRuns(5, 7, 8);

    expect(result).toMatchObject({ comparability: 'incomparable', reasons: ['market'] });
  });

  it.each([
    ['question text', (snapshot: ReturnType<typeof frozenComparisonSnapshot>) => ({ ...snapshot, questions: [{ ...snapshot.questions[0], question: '更新后的问题' }] }), 'question_set'],
    ['question market', (snapshot: ReturnType<typeof frozenComparisonSnapshot>) => ({ ...snapshot, questions: [{ ...snapshot.questions[0], market: 'global' as const }] }), 'question_set'],
    ['same-ID engine configuration', (snapshot: ReturnType<typeof frozenComparisonSnapshot>) => ({ ...snapshot, engines: [{ ...snapshot.engines[0], modelName: 'new-model' }] }), 'engine_set'],
    ['same-ID engine code', (snapshot: ReturnType<typeof frozenComparisonSnapshot>) => ({ ...snapshot, engines: [{ ...snapshot.engines[0], code: 'new-search' }] }), 'engine_set'],
    ['same-ID engine vendor', (snapshot: ReturnType<typeof frozenComparisonSnapshot>) => ({ ...snapshot, engines: [{ ...snapshot.engines[0], vendor: 'new-vendor' }] }), 'engine_set'],
    ['normalized markets', (snapshot: ReturnType<typeof frozenComparisonSnapshot>) => ({ ...snapshot, markets: ['global' as const, 'cn' as const] }), 'market'],
  ])('does not share an entry when its frozen %s changes', async (_change, change, reason) => {
    const baselineSnapshot = frozenComparisonSnapshot();
    const retestSnapshot = change(frozenComparisonSnapshot());
    const runs = {
      findOne: jest.fn(async ({ where }) => ({
        id: where.id,
        brandId: where.brandId,
        status: 'succeeded',
        configurationSnapshot: where.id === 7 ? baselineSnapshot : retestSnapshot,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        finishedAt: new Date('2026-08-01T01:00:00.000Z'),
      })),
    };
    const samples = { find: jest.fn() };
    const comparisons = { create: jest.fn((value) => value), save: jest.fn(async (value) => ({ id: 15, ...value })) };
    const service = verificationComparisonService(runs, comparisons, samples);

    const result = await service.compareRuns(5, 7, 8);

    expect(result).toMatchObject({ comparability: 'incomparable', reasons: expect.arrayContaining([reason]), metrics: null });
    expect(samples.find).not.toHaveBeenCalled();
  });

  it('uses only shared frozen questions and engines for a partial comparison', async () => {
    const snapshot = (questions: number[], engines: number[]) => ({
      market: 'cn' as const,
      markets: ['cn' as const],
      questions: questions.map((id) => ({ id, question: `问题 ${id}`, group: '品牌', market: 'cn' as const, brandProbe: true })),
      engines: engines.map((id) => ({ id, name: `Engine ${id}`, code: `engine-${id}`, vendor: 'vendor', modelName: 'model', baseUrl: null, apiKey: null, nativeWebSearch: false })),
      skippedEngines: [], samplingMethod: 'api' as const, rulesVersion: 'v1',
    });
    const runs = { findOne: jest.fn(async ({ where }) => ({ id: where.id, brandId: 5, status: 'succeeded', configurationSnapshot: where.id === 7 ? snapshot([1, 2], [3, 4]) : snapshot([2, 5], [4, 6]), createdAt: new Date(), finishedAt: new Date() })) };
    const samples = { find: jest.fn(async () => [
      { runId: 7, engineId: 4, question: '问题 2', answer: 'Acme', error: null, reviewedBrandMention: null },
      { runId: 7, engineId: 3, question: '问题 1', answer: 'Acme', error: null, reviewedBrandMention: null },
      { runId: 8, engineId: 4, question: '问题 2', answer: 'other', error: null, reviewedBrandMention: null },
      { runId: 8, engineId: 6, question: '问题 5', answer: 'Acme', error: null, reviewedBrandMention: null },
    ]) };
    const comparisons = { create: jest.fn((value) => value), save: jest.fn(async (value) => ({ id: 13, ...value })) };
    const service = verificationComparisonService(runs, comparisons, samples);

    const result = await service.compareRuns(5, 7, 8);

    expect(result).toMatchObject({ comparability: 'partial', reasons: expect.arrayContaining(['question_set', 'engine_set']), metrics: { sharedQuestionIds: [2], sharedEngineIds: [4], baseline: { sampleCount: 1, visibilityRate: 1 }, retest: { sampleCount: 1, visibilityRate: 0 } } });
  });

  it('does not aggregate metrics for an incompatible comparison', async () => {
    const snapshot = (market: 'cn' | 'global') => ({ market, markets: [market], questions: [{ id: 1, question: '问题', group: '品牌', market, brandProbe: true }], engines: [{ id: 2, name: 'Engine', code: 'engine', vendor: 'vendor', modelName: null, baseUrl: null, apiKey: null, nativeWebSearch: false }], skippedEngines: [], samplingMethod: 'api' as const, rulesVersion: 'v1' });
    const runs = { findOne: jest.fn(async ({ where }) => ({ id: where.id, brandId: 5, status: 'succeeded', configurationSnapshot: snapshot(where.id === 7 ? 'cn' : 'global'), createdAt: new Date(), finishedAt: new Date() })) };
    const samples = { find: jest.fn() };
    const comparisons = { create: jest.fn((value) => value), save: jest.fn(async (value) => ({ id: 14, ...value })) };
    const service = verificationComparisonService(runs, comparisons, samples);

    const result = await service.compareRuns(5, 7, 8);

    expect(result).toMatchObject({ comparability: 'incomparable', reasons: ['market'], metrics: null });
    expect(samples.find).not.toHaveBeenCalled();
  });

  it('进入已验证时必须关联可比验证比较和验收说明', async () => {
    const service = workflowService({ status: 'pending_verification' });

    await expect(service.transitionWorkOrder(5, 9, { status: 'verified' }))
      .rejects.toThrow('必须关联可比验证比较和验收说明');
  });

  it('只允许完成动作齐全的工单进入待验证并完成验证', async () => {
    const actions = { count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1), create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const comparisons = { findOne: jest.fn().mockResolvedValue({ id: 4, brandId: 5, comparability: 'comparable' }) };
    const service = workflowService({ status: 'pending' }, actions, comparisons);

    await service.transitionWorkOrder(5, 9, { status: 'in_progress' });
    await expect(service.transitionWorkOrder(5, 9, { status: 'pending_verification' })).rejects.toThrow('进入待验证前必须至少记录一项完成动作');
    await service.addAction(5, 9, { description: '已修复 robots.txt' });
    await service.transitionWorkOrder(5, 9, { status: 'pending_verification' });
    const result = await service.transitionWorkOrder(5, 9, { status: 'verified', comparisonId: 4, acceptanceNote: '复测结果符合验收标准' });

    expect(result.status).toBe('verified');
    expect(comparisons.findOne).toHaveBeenCalledWith({ where: { id: 4, brandId: 5 } });
  });

  it('拒绝通过其他品牌读取或写入工单', async () => {
    const workOrders = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn(), create: jest.fn(), save: jest.fn() };
    const service = workflowService(undefined, undefined, undefined, workOrders);

    await expect(service.addAction(6, 9, { description: '不应写入' })).rejects.toThrow('优化工单 9 不存在');
    await expect(service.transitionWorkOrder(6, 9, { status: 'cancelled', reason: '无需继续' })).rejects.toThrow('优化工单 9 不存在');
    expect(workOrders.findOne).toHaveBeenCalledWith({ where: { id: 9, brandId: 6 } });
  });

  it('取消工单必须提供原因', async () => {
    const service = workflowService({ status: 'pending' });

    await expect(service.transitionWorkOrder(5, 9, { status: 'cancelled' })).rejects.toThrow('取消工单必须提供原因');
  });

  it('rolls back the work-order status when saving its audit history fails', async () => {
    const persistedWorkOrder = { id: 9, brandId: 5, status: 'pending' as const };
    const workOrders = {
      findOne: jest.fn(async ({ where }) => where.id === 9 && where.brandId === 5 ? { ...persistedWorkOrder } : null),
      find: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => Object.assign(persistedWorkOrder, value)),
    };
    const transitionHistory = {
      create: jest.fn((value) => value),
      save: jest.fn().mockRejectedValue(new Error('audit insert failed')),
      find: jest.fn(async () => []),
    };
    const dataSource = {
      transaction: jest.fn(async (operation) => {
        const stagedWorkOrder = { ...persistedWorkOrder };
        const manager = {
          getRepository: jest.fn((entity: { name: string }) => entity.name === 'OptimizationWorkOrderEntity'
            ? { save: jest.fn(async (value) => Object.assign(stagedWorkOrder, value)) }
            : transitionHistory),
        };
        const result = await operation(manager);
        Object.assign(persistedWorkOrder, stagedWorkOrder);
        return result;
      }),
    };
    const service = workflowService(persistedWorkOrder, undefined, undefined, workOrders, transitionHistory, dataSource);

    await expect(service.transitionWorkOrder(5, 9, { status: 'cancelled', reason: 'audit failure' }))
      .rejects.toThrow('audit insert failed');

    expect(persistedWorkOrder.status).toBe('pending');
  });

  it('retrieves a verified transition with its immutable verification audit metadata', async () => {
    const transitionHistory = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 17, transitionedAt: new Date('2026-08-16T10:00:00.000Z'), ...value })),
      find: jest.fn(async ({ where }) => where.brandId === 5 && where.workOrderId === 9 ? [{
        id: 17,
        brandId: 5,
        workOrderId: 9,
        previousStatus: 'pending_verification',
        newStatus: 'verified',
        comparisonId: 4,
        acceptanceNote: '复测结果符合验收标准',
        cancellationReason: null,
        actor: 'quality-reviewer',
        transitionedAt: new Date('2026-08-16T10:00:00.000Z'),
      }] : []),
    };
    const service = workflowService({ status: 'pending_verification' }, undefined, undefined, undefined, transitionHistory);

    await service.transitionWorkOrder(5, 9, {
      status: 'verified', comparisonId: 4, acceptanceNote: '复测结果符合验收标准', actor: 'quality-reviewer',
    });
    const [workOrder] = await service.listWorkOrders(5);

    expect(transitionHistory.save).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 5,
      workOrderId: 9,
      previousStatus: 'pending_verification',
      newStatus: 'verified',
      comparisonId: 4,
      acceptanceNote: '复测结果符合验收标准',
      cancellationReason: null,
      actor: 'quality-reviewer',
    }));
    expect(workOrder).toEqual(expect.objectContaining({
      transitionHistory: [expect.objectContaining({
        previousStatus: 'pending_verification', newStatus: 'verified', comparisonId: 4,
        acceptanceNote: '复测结果符合验收标准', actor: 'quality-reviewer', transitionedAt: expect.any(Date),
      })],
    }));
  });

  it('keeps cancellation audit data brand-scoped and marks an unauthenticated transition as system', async () => {
    const transitionHistory = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 18, transitionedAt: new Date('2026-08-16T11:00:00.000Z'), ...value })),
      find: jest.fn(async ({ where }) => where.brandId === 5 && where.workOrderId === 9 ? [{
        id: 18,
        brandId: 5,
        workOrderId: 9,
        previousStatus: 'pending',
        newStatus: 'cancelled',
        comparisonId: null,
        acceptanceNote: null,
        cancellationReason: '需求已撤回',
        actor: 'system',
        transitionedAt: new Date('2026-08-16T11:00:00.000Z'),
      }] : []),
    };
    const workOrders = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = workflowService({ status: 'pending' }, undefined, undefined, workOrders, transitionHistory);

    await service.transitionWorkOrder(5, 9, { status: 'cancelled', reason: '需求已撤回' });
    const [workOrder] = await service.listWorkOrders(5);

    expect(transitionHistory.save).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 5,
      workOrderId: 9,
      previousStatus: 'pending',
      newStatus: 'cancelled',
      cancellationReason: '需求已撤回',
      comparisonId: null,
      acceptanceNote: null,
      actor: 'system',
    }));
    expect((workOrder as { transitionHistory: unknown[] }).transitionHistory).toEqual([expect.objectContaining({
      brandId: 5, cancellationReason: '需求已撤回', actor: 'system', transitionedAt: expect.any(Date),
    })]);
    await expect(service.listWorkOrders(6)).resolves.toEqual([]);
    expect(workOrders.find).toHaveBeenLastCalledWith({ where: { brandId: 6 }, order: { updatedAt: 'DESC', id: 'DESC' } });
    expect(transitionHistory.find).toHaveBeenCalledWith({
      where: { brandId: 5, workOrderId: 9 },
      order: { transitionedAt: 'ASC', id: 'ASC' },
    });
  });

  it('returns only the persisted actions belonging to each brand-scoped work order', async () => {
    const actions = {
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      find: jest.fn(async ({ where }) => where.brandId === 5 && where.workOrderId === 9 ? [{
        id: 31, brandId: 5, workOrderId: 9, description: '已修复结构化数据', scope: null, evidence: null,
        completedAt: new Date('2026-08-16T12:00:00.000Z'),
      }] : []),
    };
    const service = workflowService({ status: 'in_progress' }, actions);

    const [workOrder] = await service.listWorkOrders(5);

    expect(workOrder).toEqual(expect.objectContaining({
      id: 9,
      actions: [expect.objectContaining({ id: 31, brandId: 5, workOrderId: 9, description: '已修复结构化数据' })],
    }));
    expect(actions.find).toHaveBeenCalledWith({
      where: { brandId: 5, workOrderId: 9 },
      order: { completedAt: 'ASC', id: 'ASC' },
    });
  });
});

function frozenComparisonSnapshot() {
  return {
    market: 'cn' as const,
    markets: ['cn' as const],
    questions: [{ id: 1, question: '品牌表现如何？', group: '品牌', market: 'cn' as const, brandProbe: true }],
    engines: [{ id: 2, name: 'Search', code: 'search', vendor: 'vendor', modelName: 'model', baseUrl: 'https://engine.example/v1', apiKey: 'secret', nativeWebSearch: false }],
    skippedEngines: [],
    samplingMethod: 'api' as const,
    rulesVersion: 'v1',
  };
}

function workflowService(
  workOrder: { id?: number; brandId?: number; status: 'pending' | 'in_progress' | 'pending_verification' | 'verified' | 'ineffective' | 'cancelled' } | undefined = { status: 'pending' },
  actions: { count: jest.Mock; create: jest.Mock; save: jest.Mock; find?: jest.Mock } = { count: jest.fn().mockResolvedValue(1), create: jest.fn((value) => value), save: jest.fn(async (value) => value), find: jest.fn(async () => []) },
  comparisons = { findOne: jest.fn().mockResolvedValue({ id: 4, brandId: 5, comparability: 'comparable' }) },
  workOrders = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  },
  transitionHistory: { create: jest.Mock; save: jest.Mock; find: jest.Mock } = { create: jest.fn((value) => value), save: jest.fn(async (value) => value), find: jest.fn(async () => []) },
  dataSource = {
    transaction: jest.fn(async (operation) => operation({
      getRepository: jest.fn((entity) => entity.name === 'OptimizationWorkOrderEntity' ? workOrders : transitionHistory),
    })),
  },
) {
  const savedWorkOrder = workOrder ? { id: 9, brandId: 5, ...workOrder } : null;
  if (!workOrders.findOne.getMockImplementation?.()) {
    workOrders.findOne.mockImplementation(async ({ where }) => savedWorkOrder && where.id === 9 && where.brandId === 5 ? savedWorkOrder : null);
  }
  if (!workOrders.find.getMockImplementation?.()) {
    workOrders.find.mockImplementation(async ({ where }) => savedWorkOrder && where.brandId === savedWorkOrder.brandId ? [savedWorkOrder] : []);
  }
  return new OptimizationVerificationService(
    { findOne: jest.fn().mockResolvedValue({ id: 5, deleted: false }) } as never,
    { findOne: jest.fn().mockResolvedValue({ id: 7, brandId: 5 }) } as never,
    { findOne: jest.fn().mockResolvedValue({ id: 3, brandId: 5 }) } as never,
    workOrders as never,
    actions as never,
    comparisons as never,
    transitionHistory as never,
    dataSource as never,
    { find: jest.fn(async () => []) } as never,
  );
}

function verificationComparisonService(runs: { findOne: jest.Mock }, comparisons: { create: jest.Mock; save: jest.Mock }, samples: { find: jest.Mock }) {
  return new OptimizationVerificationService(
    { findOne: jest.fn().mockResolvedValue({ id: 5, name: 'Acme', deleted: false }) } as never,
    runs as never,
    {} as never,
    {} as never,
    {} as never,
    comparisons as never,
    {} as never,
    {} as never,
    samples as never,
  );
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('timed out waiting for diagnosis findings');
}
