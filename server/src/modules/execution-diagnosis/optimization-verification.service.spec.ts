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
});

function workflowService(
  workOrder: { id?: number; brandId?: number; status: 'pending' | 'in_progress' | 'pending_verification' | 'verified' | 'ineffective' | 'cancelled' } | undefined = { status: 'pending' },
  actions = { count: jest.fn().mockResolvedValue(1), create: jest.fn((value) => value), save: jest.fn(async (value) => value) },
  comparisons = { findOne: jest.fn().mockResolvedValue({ id: 4, brandId: 5, comparability: 'comparable' }) },
  workOrders = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  },
) {
  const savedWorkOrder = workOrder ? { id: 9, brandId: 5, ...workOrder } : null;
  if (!workOrders.findOne.getMockImplementation?.()) {
    workOrders.findOne.mockImplementation(async ({ where }) => savedWorkOrder && where.id === 9 && where.brandId === 5 ? savedWorkOrder : null);
  }
  return new OptimizationVerificationService(
    { findOne: jest.fn().mockResolvedValue({ id: 5, deleted: false }) } as never,
    { findOne: jest.fn().mockResolvedValue({ id: 7, brandId: 5 }) } as never,
    { findOne: jest.fn().mockResolvedValue({ id: 3, brandId: 5 }) } as never,
    workOrders as never,
    actions as never,
    comparisons as never,
  );
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('timed out waiting for diagnosis findings');
}
