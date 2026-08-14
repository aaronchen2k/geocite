import { DiagnosisConfigurationService } from './diagnosis-configuration.service';

describe('DiagnosisConfigurationService', () => {
  it('重置提示词时将文件模板渲染后保存到品牌记录', async () => {
    const brand = { id: 5, name: '乐堡论文', industry: '教育服务', description: '一站式论文服务平台', questions: [], questionsPrompt: '自定义提示词', deleted: false };
    const brands = { findOne: jest.fn().mockResolvedValue(brand), save: jest.fn().mockResolvedValue(brand) };
    const service = new DiagnosisConfigurationService(brands as never, {} as never);

    const result = await service.resetPrompt(5);

    expect(brands.save).toHaveBeenCalledWith(expect.objectContaining({ questionsPrompt: expect.stringContaining('品牌名称：乐堡论文') }));
    expect(result.prompt).toContain('共生成 8 个问题');
  });
});
