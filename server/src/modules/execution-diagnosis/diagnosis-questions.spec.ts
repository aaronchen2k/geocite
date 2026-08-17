import { parseGeneratedQuestions } from './diagnosis-questions';

describe('诊断问题生成结果', () => {
  it('解析模型返回的 JSON 问题列表并去重', () => {
    expect(parseGeneratedQuestions('{"questions":[{"text":"品牌的主要服务是什么？","primaryCategory":"品牌基础提问","secondaryCategory":"事实查询"},{"text":"品牌的主要服务是什么？","primaryCategory":"品牌基础提问","secondaryCategory":"事实查询"}]}')).toEqual([{text: '品牌的主要服务是什么？', primaryCategory: '品牌基础提问', secondaryCategory: '事实查询'}]);
  });

  it('可将模型返回的问题限制为指定数量', () => {
    expect(parseGeneratedQuestions('{"questions":[{"text":"问题 1","primaryCategory":"品牌基础提问","secondaryCategory":"事实查询"},{"text":"问题 2","primaryCategory":"品牌基础提问","secondaryCategory":"事实查询"}]}', 1)).toHaveLength(1);
  });

  it('保留模型返回的两级分类标签', () => {
    expect(parseGeneratedQuestions('{"questions":[{"text":"适合哪些团队使用？","primaryCategory":"核心业务能力提问","secondaryCategory":"场景"},{"text":"与同类工具相比有什么区别？","primaryCategory":"竞品对比提问","secondaryCategory":"比较"}]}', 10)).toEqual([
      {text: '适合哪些团队使用？', primaryCategory: '核心业务能力提问', secondaryCategory: '场景'},
      {text: '与同类工具相比有什么区别？', primaryCategory: '竞品对比提问', secondaryCategory: '比较'},
    ]);
  });

  it('拒绝缺失两级标签的模型对象', () => {
    expect(parseGeneratedQuestions('```json\n{"questions":[{"text":"如何选择服务？","group":"选型"}]}\n```')).toEqual([]);
  });
});
