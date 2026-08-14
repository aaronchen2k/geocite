import { buildBrandQuestionPrompt } from './brand-question-prompt';

describe('品牌问答默认提示词', () => {
  it('使用统一模板填入品牌信息，并要求仅返回问题 JSON', () => {
    const prompt = buildBrandQuestionPrompt({ name: '乐堡论文', industry: '教育服务', description: '一站式论文服务平台' });

    expect(prompt).toContain('品牌名称：乐堡论文');
    expect(prompt).toContain('所属行业：教育服务');
    expect(prompt).toContain('品牌简介：一站式论文服务平台');
    expect(prompt).toContain('只输出 JSON，不要 Markdown、解释或诊断执行建议');
  });
});
