import { allocateQuestionCategories, buildBrandQuestionPrompt } from './brand-question-prompt';

describe('品牌问答默认提示词', () => {
  it('按比例分配精确题目配额，并优先把余数分给核心业务能力', () => {
    expect(allocateQuestionCategories(10, { brandBasic: 1, coreCapability: 2, competitorComparison: 1 }))
      .toEqual({ brandBasic: 3, coreCapability: 5, competitorComparison: 2 });
  });

  it('使用统一模板填入品牌信息，并要求仅返回问题 JSON', () => {
    const prompt = buildBrandQuestionPrompt({ name: '乐堡论文', industry: '教育服务', description: '一站式论文服务平台', samplingQuestionCount: 10, questionCategoryRatio: { brandBasic: 1, coreCapability: 2, competitorComparison: 1 } });

    expect(prompt).toContain('品牌名称：乐堡论文');
    expect(prompt).toContain('所属行业：教育服务');
    expect(prompt).toContain('品牌简介：一站式论文服务平台');
    expect(prompt).toContain('只输出一个可直接解析的 JSON 对象');
    expect(prompt).toContain('品牌基础提问：3 题');
    expect(prompt).toContain('核心业务能力提问：5 题');
    expect(prompt).toContain('竞品对比提问：2 题');
    expect(prompt).toContain('"category"');
  });
});
