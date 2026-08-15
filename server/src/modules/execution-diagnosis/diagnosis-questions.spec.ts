import { parseGeneratedQuestions } from './diagnosis-questions';

describe('诊断问题生成结果', () => {
  it('解析模型返回的 JSON 问题列表并去重', () => {
    expect(parseGeneratedQuestions('{"questions":["品牌的主要服务是什么？","品牌的主要服务是什么？","目标用户是谁？"]}')).toEqual([{text: '品牌的主要服务是什么？', group: '推荐'}, {text: '目标用户是谁？', group: '推荐'}]);
  });

  it('可将模型返回的问题限制为指定数量', () => {
    expect(parseGeneratedQuestions('{"questions":["问题 1","问题 2","问题 3","问题 4","问题 5","问题 6","问题 7","问题 8","问题 9"]}', 8)).toEqual([{text: '问题 1', group: '推荐'}, {text: '问题 2', group: '推荐'}, {text: '问题 3', group: '推荐'}, {text: '问题 4', group: '推荐'}, {text: '问题 5', group: '推荐'}, {text: '问题 6', group: '推荐'}, {text: '问题 7', group: '推荐'}, {text: '问题 8', group: '推荐'}]);
  });

  it('保留模型按行业生成的问题分类，并限制为 10 题', () => {
    expect(parseGeneratedQuestions('{"questions":[{"text":"适合哪些团队使用？","group":"适用场景"},{"text":"与同类工具相比有什么区别？","group":"选型对比"}]}', 10)).toEqual([
      {text: '适合哪些团队使用？', group: '适用场景'},
      {text: '与同类工具相比有什么区别？', group: '选型对比'},
    ]);
  });

  it('可解析包裹在 Markdown 代码块中的 JSON', () => {
    expect(parseGeneratedQuestions('```json\n{"questions":[{"text":"如何选择服务？","group":"选型"}]}\n```')).toEqual([{text: '如何选择服务？', group: '选型'}]);
  });
});
