import { allocateQuestionCategories, buildBrandQuestionPrompt, DEFAULT_QUESTION_TAXONOMY } from './brand-question-prompt';

describe('品牌问答默认提示词', () => {
  it('按数据库定义的八个二级分类权重精确分配题目，且总数不变', () => {
    expect(allocateQuestionCategories(10, DEFAULT_QUESTION_TAXONOMY))
      .toEqual({ fact_query: 2, brand_verification: 1, scenario: 2, risk: 1, capability_confirmation: 1, comparison: 1, alternative: 1, recommendation: 1 });
  });

  it('从分类定义动态填入所有二级分类、权重、示例和严格两级标签格式', () => {
    const prompt = buildBrandQuestionPrompt({ name: '乐堡论文', industry: '教育服务', description: '一站式论文服务平台', samplingQuestionCount: 10 }, DEFAULT_QUESTION_TAXONOMY);

    expect(prompt).toContain('品牌名称：乐堡论文');
    expect(prompt).toContain('所属行业：教育服务');
    expect(prompt).toContain('品牌简介：一站式论文服务平台');
    expect(prompt).toContain('只输出一个可直接解析的 JSON 对象');
    expect(prompt).toContain('事实查询（品牌基础提问，权重 20，配额 2 题）');
    expect(prompt).toContain('品牌验证（品牌基础提问，权重 8，配额 1 题）');
    expect(prompt).toContain('替代（竞品对比提问，权重 10，配额 1 题）');
    expect(prompt).toContain('"primaryCategory"');
    expect(prompt).toContain('"secondaryCategory"');
  });
});
