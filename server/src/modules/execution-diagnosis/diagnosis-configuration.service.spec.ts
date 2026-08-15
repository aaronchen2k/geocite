import { DiagnosisConfigurationService } from './diagnosis-configuration.service';

describe('DiagnosisConfigurationService', () => {
  it('为未设置抓取上限的品牌返回默认值 10', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: null, description: null, questions: [], questionsPrompt: null, sitemapUrlLimit: null, deleted: false };
    const brands = { findOne: jest.fn().mockResolvedValue(brand), save: jest.fn().mockResolvedValue(brand) };
    const service = new DiagnosisConfigurationService(brands as never, {} as never, { find: jest.fn().mockResolvedValue([]) } as never);

    await expect(service.list(5)).resolves.toMatchObject({ sitemapUrlLimit: 10 });
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

    await service.save(5, [{text: '独立表问题', group: '选型', market: 'cn', brandProbe: false}]);

    expect(brand.questions).toEqual(['历史问题']);
    expect(questions.save).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({question: '独立表问题'})]));
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
