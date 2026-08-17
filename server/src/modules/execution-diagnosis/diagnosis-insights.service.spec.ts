import { DiagnosisInsightsService } from './diagnosis-insights.service';

describe('DiagnosisInsightsService', () => {
  it('按模型、问题分类和引用来源汇总诊断报告', async () => {
    const samples = [
      { id: 1, runId: 7, engineId: 1, engineName: '豆包', question: '哪个协作工具适合团队使用？', answer: '推荐腾讯文档，详见 https://docs.qq.com/guide', error: null, reviewedBrandMention: null, sampledAt: new Date() },
      { id: 2, runId: 7, engineId: 2, engineName: '通义千问', question: '哪个协作工具适合团队使用？', answer: '飞书文档更适合团队。参考 https://www.feishu.cn/docs', error: null, reviewedBrandMention: null, sampledAt: new Date() },
      { id: 3, runId: 7, engineId: 1, engineName: '豆包', question: '在线文档有哪些选择？', answer: '可选择飞书文档', error: '请求超时', reviewedBrandMention: null, sampledAt: new Date() },
    ];
    const service = new DiagnosisInsightsService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, name: '腾讯文档', deleted: false }) } as never,
      { find: jest.fn().mockResolvedValue([{ name: '飞书文档', aliases: [], enabled: true, brandId: 5, deleted: false }]) } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 7, brandId: 5, status: 'succeeded', createdAt: new Date(), finishedAt: new Date(), summary: null, steps: [], configurationSnapshot: { webReview: { minimumRate: 0.3, candidateSampleIds: [1, 2], selected: [], enabled: true } } }) } as never,
      { find: jest.fn().mockResolvedValue(samples) } as never,
      { find: jest.fn().mockResolvedValue([{ question: '哪个协作工具适合团队使用？', group: '选型' }, { question: '在线文档有哪些选择？', group: '认知' }]) } as never,
      { find: jest.fn().mockResolvedValue([{ id: 19, sourceRunId: 7, type: 'competitor_dominated', priority: 'P1', scope: { question: '在线文档有哪些选择？', competitor: '飞书文档' }, recommendation: 'address-competitor-gap', status: 'open' }]) } as never,
      { find: jest.fn().mockResolvedValue([
        { apiSampleId: 1, selectionReasons: ['core_capability'], status: 'succeeded', brandMentioned: false, exclusionReason: null },
        { apiSampleId: 2, selectionReasons: ['api_brand_mentioned', 'random_unmentioned'], status: 'excluded', brandMentioned: null, exclusionReason: 'pending-login' },
        { apiSampleId: 3, selectionReasons: ['minimum_fill'], status: 'excluded', brandMentioned: null, exclusionReason: 'pending-login' },
      ]) } as never,
    );

    const result = await service.forRun(5, 7);

    expect(result.metrics).toMatchObject({ sampleCount: 3, sourceCount: 1, successfulSampleRate: 2 / 3, brandMentionRate: 0 });
    expect(result.evidenceBasis).toBe('web-review-corrected');
    expect(result.webReviewSummary).toEqual({ apiTotal: 3, candidateTotal: 2, minimumTarget: 1, mandatoryCore: 1, mandatoryMentioned: 1, randomUnmentioned: 1, minimumFill: 1, succeeded: 1, excludedByReason: { 'pending-login': 2 } });
    expect(result.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({ question: '哪个协作工具适合团队使用？', group: '选型', mentionRate: 0 }),
      expect.objectContaining({ question: '在线文档有哪些选择？', group: '认知', diagnosis: 'competitor-dominated' }),
    ]));
    expect(result.report.engines).toEqual(expect.arrayContaining([
      expect.objectContaining({ engineName: '豆包', sampleCount: 2, successRate: 0.5, mentionRate: 0 }),
      expect.objectContaining({ engineName: '通义千问', sampleCount: 1, successRate: 1, mentionRate: 0 }),
    ]));
    expect(result.report.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: '选型', questionCount: 1, sampleCount: 2 }),
      expect.objectContaining({ group: '认知', questionCount: 1, sampleCount: 1 }),
    ]));
    expect(result.report.priorityActions[0]).toMatchObject({ question: '在线文档有哪些选择？', diagnosis: 'competitor-dominated' });
    expect(result.findings).toEqual([expect.objectContaining({ id: 19, sourceRunId: 7, type: 'competitor_dominated' })]);
  });

  it('以运行快照中的可复核候选数计算最低网页复核目标，而非失败 API 样本', async () => {
    const service = new DiagnosisInsightsService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, name: '腾讯文档', deleted: false }) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 7, brandId: 5, status: 'partial', createdAt: new Date(), finishedAt: new Date(), summary: null, steps: [], configurationSnapshot: { webReview: { minimumRate: 0.3, candidateSampleIds: [1, 2, 3, 4, 5, 6, 7], selected: [], enabled: true } } }) } as never,
      { find: jest.fn().mockResolvedValue([
        { id: 1, runId: 7, engineId: 1, engineName: '豆包', question: '问题', answer: '', error: 'API 超时', reviewedBrandMention: null, sampledAt: new Date() },
        { id: 2, runId: 7, engineId: 1, engineName: '豆包', question: '问题', answer: '', error: 'API 失败', reviewedBrandMention: null, sampledAt: new Date() },
      ]) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
    );

    await expect(service.forRun(5, 7)).resolves.toMatchObject({ webReviewSummary: { apiTotal: 2, candidateTotal: 7, minimumTarget: 3 } });
  });

  it('成功网页复核后用网页 answer 统一替换品牌和竞品口径', async () => {
    const samples = [{ id: 1, runId: 7, engineId: 1, engineName: '豆包', question: '哪个工具更适合？', answer: '腾讯文档', error: null, reviewedBrandMention: false, sampledAt: new Date() }];
    const service = new DiagnosisInsightsService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, name: '腾讯文档', deleted: false }) } as never,
      { find: jest.fn().mockResolvedValue([{ name: '飞书文档', aliases: [], enabled: true, brandId: 5, deleted: false }]) } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 7, brandId: 5, status: 'succeeded', createdAt: new Date(), finishedAt: new Date(), summary: null, steps: [], configurationSnapshot: { webReview: { minimumRate: 0.3, candidateSampleIds: [1], selected: [], enabled: true } } }) } as never,
      { find: jest.fn().mockResolvedValue(samples) } as never,
      { find: jest.fn().mockResolvedValue([{ question: '哪个工具更适合？', group: '竞品对比提问', primaryCategory: '竞品对比提问', secondaryCategory: '比较' }]) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find: jest.fn().mockResolvedValue([{ apiSampleId: 1, selectionReasons: ['core_capability'], status: 'succeeded', answer: '飞书文档', brandMentioned: false, exclusionReason: null }]) } as never,
    );

    const result = await service.forRun(5, 7);

    expect(result.metrics.brandMentionRate).toBe(0);
    expect(result.competitors).toEqual([expect.objectContaining({ name: '飞书文档', rate: 1 })]);
    expect(result.questions).toEqual([expect.objectContaining({ leadingCompetitor: '飞书文档', leadingCompetitorRate: 1, diagnosis: 'competitor-dominated' })]);
    expect(result.competitorMatrix[0]).toMatchObject({ overallRate: 1, lostQuestions: [expect.objectContaining({ question: '哪个工具更适合？', rate: 1, brandMentionRate: 0 })] });
    expect(result.samples[0]).toMatchObject({ answer: '飞书文档', brandMention: false });
  });
});
