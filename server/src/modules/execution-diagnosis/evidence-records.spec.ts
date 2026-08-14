import { toSampleEvidence } from './evidence-records';

describe('问答采样证据', () => {
  it('保存单题采样时保留原始问题', () => {
    const evidence = toSampleEvidence(9, {
      id: 3, name: '示例引擎', code: 'example', modelName: 'model', baseUrl: 'https://example.com', apiKey: 'key', disabled: false,
    }, '品牌是什么？', '请回答：品牌是什么？', 200, '回答内容');

    expect(evidence.question).toBe('品牌是什么？');
  });
});
