import { parseGeneratedQuestions } from './diagnosis-questions';

describe('诊断问题生成结果', () => {
  it('解析模型返回的 JSON 问题列表并去重', () => {
    expect(parseGeneratedQuestions('{"questions":["品牌的主要服务是什么？","品牌的主要服务是什么？","目标用户是谁？"]}')).toEqual(['品牌的主要服务是什么？', '目标用户是谁？']);
  });

  it('可将模型返回的问题限制为指定数量', () => {
    expect(parseGeneratedQuestions('{"questions":["问题 1","问题 2","问题 3","问题 4","问题 5","问题 6"]}', 5)).toEqual(['问题 1', '问题 2', '问题 3', '问题 4', '问题 5']);
  });
});
