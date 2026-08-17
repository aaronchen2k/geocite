import { DiagnosisConfigurationService, validateSamplingConfig } from './diagnosis-configuration.service';

describe('DiagnosisConfigurationService', () => {
  it('拒绝不完整或非正数的诊断采样配置', () => {
    expect(() => validateSamplingConfig({ samplingQuestionCount: 3, questionCategoryRatio: { brandBasic: 1, coreCapability: 0, competitorComparison: 1 } }))
      .toThrow('问题分类比例必须全部大于 0');
  });

  it('为未设置抓取上限的品牌返回默认值 10', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: null, description: null, questions: [], questionsPrompt: null, sitemapUrlLimit: null, deleted: false };
    const brands = { findOne: jest.fn().mockResolvedValue(brand), save: jest.fn().mockResolvedValue(brand) };
    const service = new DiagnosisConfigurationService(brands as never, {} as never, { find: jest.fn().mockResolvedValue([]) } as never);

    await expect(service.list(5)).resolves.toMatchObject({ sitemapUrlLimit: 10 });
  });

  it('为未配置网页复核开关的品牌返回默认开启状态', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: null, description: null, questions: [], questionsPrompt: null, sitemapUrlLimit: null, deleted: false };
    const service = new DiagnosisConfigurationService({ findOne: jest.fn().mockResolvedValue(brand) } as never, {} as never, { find: jest.fn().mockResolvedValue([]) } as never);

    await expect(service.list(5)).resolves.toMatchObject({ playwrightWebReviewEnabled: true });
  });

  it('保存 Playwright 网页复核开关', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: null, description: null, questions: [], questionsPrompt: null, sitemapUrlLimit: null, deleted: false };
    const brands = { findOne: jest.fn().mockResolvedValue(brand), save: jest.fn().mockResolvedValue(brand) };
    const service = new DiagnosisConfigurationService(brands as never, {} as never, { find: jest.fn().mockResolvedValue([]), delete: jest.fn(), save: jest.fn(), create: jest.fn() } as never);

    const saveWithWebReviewSetting = service.save.bind(service) as unknown as (brandId: number, inputs: [], prompt?: string, sitemapUrlLimit?: number, samplingQuestionCount?: number, questionCategoryRatio?: unknown, playwrightWebReviewEnabled?: boolean) => Promise<unknown>;
    await expect(saveWithWebReviewSetting(5, [], undefined, undefined, undefined, undefined, false)).resolves.toMatchObject({ playwrightWebReviewEnabled: false });
    expect(brands.save).toHaveBeenCalledWith(expect.objectContaining({ playwrightWebReviewEnabled: false }));
  });

  it('保存 sitemap 抓取上限', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: null, description: null, questions: [], questionsPrompt: null, sitemapUrlLimit: null, deleted: false };
    const brands = { findOne: jest.fn().mockResolvedValue(brand), save: jest.fn().mockResolvedValue(brand) };
    const service = new DiagnosisConfigurationService(brands as never, {} as never, { find: jest.fn().mockResolvedValue([]), delete: jest.fn(), save: jest.fn(), create: jest.fn() } as never);

    await expect(service.save(5, [], undefined, 25)).resolves.toMatchObject({ sitemapUrlLimit: 25 });
    expect(brands.save).toHaveBeenCalledWith(expect.objectContaining({ sitemapUrlLimit: 25 }));
  });

  it('保存问题时只写入独立问题表，不覆盖品牌主表中的历史问题', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: null, description: null, questions: ['历史问题'], questionsPrompt: null, sitemapUrlLimit: null, deleted: false };
    const brands = { findOne: jest.fn().mockResolvedValue(brand), save: jest.fn().mockResolvedValue(brand) };
    const questions = { find: jest.fn().mockResolvedValue([]), delete: jest.fn(), save: jest.fn().mockResolvedValue([]), create: jest.fn((value) => value) };
    const service = new DiagnosisConfigurationService(brands as never, {} as never, questions as never);

    await service.save(5, [{text: '独立表问题', group: '核心业务能力提问', market: 'cn', brandProbe: false}]);

    expect(brand.questions).toEqual(['历史问题']);
    expect(questions.save).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({question: '独立表问题'})]));
  });

  it('将历史非标准问题分类迁移为核心业务能力提问且保留问题文本', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: null, description: null, questions: [], questionsPrompt: null, sitemapUrlLimit: null, samplingQuestionCount: null, questionCategoryRatio: null, deleted: false };
    const legacyQuestion = { id: 11, question: '旧问题仍应保留', group: '选型', market: 'cn', brandProbe: false, ordr: 0 };
    const questions = { find: jest.fn().mockResolvedValue([legacyQuestion]), save: jest.fn().mockResolvedValue([legacyQuestion]) };
    const service = new DiagnosisConfigurationService({ findOne: jest.fn().mockResolvedValue(brand) } as never, {} as never, questions as never);

    await expect(service.list(5)).resolves.toMatchObject({ questions: [expect.objectContaining({ text: '旧问题仍应保留', group: '核心业务能力提问' })] });
    expect(questions.save).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ group: '核心业务能力提问' })]));
  });

  it('仅调用一次模型并拒绝与冻结配额不匹配的生成结果', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: null, description: null, questions: [], questionsPrompt: null, sitemapUrlLimit: null, samplingQuestionCount: 4, questionCategoryRatio: { brandBasic: 1, coreCapability: 1, competitorComparison: 2 }, deleted: false };
    const brands = { findOne: jest.fn().mockResolvedValue(brand), save: jest.fn().mockResolvedValue(brand) };
    const models = { findOne: jest.fn().mockResolvedValue({ baseUrl: 'https://model.example', apiKey: 'key', modelName: 'model' }) };
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ questions: [
      { text: '品牌是什么？', category: '品牌基础提问' },
      { text: '核心能力是什么？', category: '核心业务能力提问' },
      { text: '竞品有哪些？', category: '竞品对比提问' },
      { text: '如何对比竞品？', category: '竞品对比提问' },
    ] }) } }] }) });
    const previousFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    const service = new DiagnosisConfigurationService(brands as never, models as never, {} as never);

    try {
      await expect(service.generate(5)).resolves.toMatchObject({ questions: expect.arrayContaining([expect.objectContaining({ group: '品牌基础提问' })]) });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ questions: [
        { text: '品牌是什么？', category: '品牌基础提问' },
        { text: '核心能力是什么？', category: '核心业务能力提问' },
        { text: '竞品有哪些？', category: '竞品对比提问' },
        { text: '竞品还是什么？', category: '核心业务能力提问' },
      ] }) } }] }) });
      await expect(service.generate(5)).rejects.toThrow('问题分类配额');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = previousFetch;
    }
  });

  it('仅调用一次模型并拒绝超过目标数量的生成结果', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: null, description: null, questions: [], questionsPrompt: null, sitemapUrlLimit: null, samplingQuestionCount: 4, questionCategoryRatio: { brandBasic: 1, coreCapability: 1, competitorComparison: 2 }, deleted: false };
    const models = { findOne: jest.fn().mockResolvedValue({ baseUrl: 'https://model.example', apiKey: 'key', modelName: 'model' }) };
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ questions: [
      { text: '品牌是什么？', category: '品牌基础提问' },
      { text: '核心能力是什么？', category: '核心业务能力提问' },
      { text: '竞品有哪些？', category: '竞品对比提问' },
      { text: '如何对比竞品？', category: '竞品对比提问' },
      { text: '竞品优势是什么？', category: '竞品对比提问' },
    ] }) } }] }) });
    const previousFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    const service = new DiagnosisConfigurationService({ findOne: jest.fn().mockResolvedValue(brand) } as never, models as never, {} as never);

    try {
      await expect(service.generate(5)).rejects.toThrow('仅返回 5 个有效问题，需要严格返回 4 个问题');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = previousFetch;
    }
  });

  it('重置提示词时将文件模板渲染后保存到品牌记录', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: '教育服务', description: '一站式论文服务平台', questions: [], questionsPrompt: '自定义提示词', deleted: false };
    const brands = { findOne: jest.fn().mockResolvedValue(brand), save: jest.fn().mockResolvedValue(brand) };
    const service = new DiagnosisConfigurationService(brands as never, {} as never, { find: jest.fn().mockResolvedValue([]) } as never);

    const result = await service.resetPrompt(5);

    expect(brands.save).toHaveBeenCalledWith(expect.objectContaining({ questionsPrompt: expect.stringContaining('品牌名称：乐堡论文') }));
    expect(result.prompt).toContain('只生成 10 个问题');
  });
});
