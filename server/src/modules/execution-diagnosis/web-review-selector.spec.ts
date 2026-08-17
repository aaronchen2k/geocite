import { selectWebReviewSamples } from './web-review-selector';

describe('selectWebReviewSamples', () => {
  const questions = [
    { id: 1, question: '核心能力是什么？', group: '核心业务能力提问' },
    { id: 2, question: '品牌是否被推荐？', group: '品牌基础提问' },
    { id: 3, question: '还有哪些选择？', group: '竞品对比提问' },
    { id: 4, question: '适合谁使用？', group: '品牌基础提问' },
  ];
  const samples = [
    { id: 11, engineId: 1, question: '核心能力是什么？', answer: '未提及', error: null, apiBrandMentioned: false },
    { id: 12, engineId: 1, question: '品牌是否被推荐？', answer: 'Acme', error: null, apiBrandMentioned: true },
    { id: 13, engineId: 1, question: '还有哪些选择？', answer: '其他品牌', error: null, apiBrandMentioned: false },
    { id: 14, engineId: 1, question: '适合谁使用？', answer: '其他品牌', error: null, apiBrandMentioned: false },
  ];

  it('强制选中所有核心能力和 API 命中当前品牌的样本，并冻结随机结果', () => {
    const result = selectWebReviewSamples(samples, questions, 'fixed-seed');

    expect(result).toEqual(expect.arrayContaining([
      { sampleId: 11, reasons: ['core_capability'] },
      { sampleId: 12, reasons: ['api_brand_mentioned'] },
    ]));
    expect(result.length / samples.length).toBeGreaterThanOrEqual(0.3);
    expect(selectWebReviewSamples(samples, questions, 'fixed-seed')).toEqual(result);
  });

  it('只从有效的未命中非核心样本随机抽取，并合并重复入选原因', () => {
    const result = selectWebReviewSamples([
      { id: 21, engineId: 1, question: '核心能力是什么？', answer: 'Acme', error: null, apiBrandMentioned: true },
      { id: 22, engineId: 1, question: '品牌是否被推荐？', answer: '', error: 'api-failed', apiBrandMentioned: false },
      { id: 23, engineId: 1, question: '还有哪些选择？', answer: '其他品牌', error: null, apiBrandMentioned: false },
      { id: 24, engineId: 1, question: '适合谁使用？', answer: '其他品牌', error: null, apiBrandMentioned: false },
    ], questions, 'fixed-seed', 1);

    expect(result).toContainEqual({ sampleId: 21, reasons: ['core_capability', 'api_brand_mentioned'] });
    expect(result).not.toContainEqual(expect.objectContaining({ sampleId: 22 }));
    expect(result).toHaveLength(3);
    expect(result.filter((item) => item.reasons.includes('minimum_fill')).every((item) => item.sampleId !== 22)).toBe(true);
  });
});
