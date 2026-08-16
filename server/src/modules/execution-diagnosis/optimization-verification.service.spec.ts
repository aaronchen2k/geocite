import { ExecutionDiagnosisService } from './execution-diagnosis.service';
import { DiagnosisFindingEntity } from './optimization-verification.entity';

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

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('timed out waiting for diagnosis findings');
}
