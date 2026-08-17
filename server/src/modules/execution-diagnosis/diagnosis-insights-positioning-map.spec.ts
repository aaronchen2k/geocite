import { DiagnosisInsightsService } from './diagnosis-insights.service';

describe('DiagnosisInsightsService positioning map', () => {
  it('returns each sampled question with its configured two-level taxonomy', async () => {
    const service = new DiagnosisInsightsService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, name: '当前品牌', deleted: false }) } as never,
      { find: jest.fn().mockResolvedValue([{ name: '领先竞品', aliases: [], enabled: true, brandId: 5, deleted: false }]) } as never,
      { findOne: jest.fn().mockResolvedValue({
        id: 7, brandId: 5, status: 'succeeded', createdAt: new Date(), finishedAt: new Date(), summary: null, steps: [],
        configurationSnapshot: { questions: [
          { id: 11, question: '什么场景适合当前品牌？', group: '运行时分组', primaryCategory: '核心业务能力提问', secondaryCategory: '场景' },
          { id: 12, question: '当前品牌是否可靠？', group: '运行时分组', primaryCategory: '品牌基础提问', secondaryCategory: '品牌验证' },
        ] },
      }) } as never,
      { find: jest.fn().mockResolvedValue([
        { id: 1, runId: 7, engineId: 1, engineName: '模型 A', question: '什么场景适合当前品牌？', answer: '领先竞品适合团队协作', error: null, reviewedBrandMention: null, sampledAt: new Date() },
        { id: 2, runId: 7, engineId: 1, engineName: '模型 A', question: '当前品牌是否可靠？', answer: '当前品牌提供官方服务', error: null, reviewedBrandMention: null, sampledAt: new Date() },
      ]) } as never,
      { find: jest.fn().mockResolvedValue([
        { question: '什么场景适合当前品牌？', group: '自由分组名称', primaryCategory: '竞品对比提问', secondaryCategory: '替代' },
        { question: '当前品牌是否可靠？', group: '自由分组名称', primaryCategory: '竞品对比提问', secondaryCategory: '推荐' },
      ]) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
    );

    const result = await service.forRun(5, 7);

    expect(result.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        question: '什么场景适合当前品牌？',
        primaryCategory: '核心业务能力提问',
        secondaryCategory: '场景',
        leadingCompetitor: '领先竞品',
        leadingCompetitorRate: 1,
        mentionRate: 0,
      }),
      expect.objectContaining({
        question: '当前品牌是否可靠？',
        primaryCategory: '品牌基础提问',
        secondaryCategory: '品牌验证',
        leadingCompetitor: null,
        leadingCompetitorRate: 0,
        mentionRate: 1,
      }),
    ]));
  });
});
