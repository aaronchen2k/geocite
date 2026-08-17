import { WebReviewRunnerService } from './web-review-runner.service';

describe('WebReviewRunnerService', () => {
  const sample = { id: 9, runId: 3, engineId: 4, engineName: 'Acme AI', engineCode: 'acme', question: '推荐什么服务？', prompt: 'prompt' };
  const selected = { sampleId: 9, reasons: ['core_capability'] as Array<'core_capability'> };

  it('将未就绪引擎的样本保存为排除记录，而不是 API 或品牌失败', async () => {
    const records = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const runner = new WebReviewRunnerService(
      { getStatus: jest.fn().mockResolvedValue({ availability: 'pending_login', lastFailureReason: null }) } as never,
      records as never,
    );

    const result = await runner.run(sample, selected);

    expect(result).toMatchObject({ status: 'excluded', exclusionReason: 'engine-pending-login' });
    expect(records.save).toHaveBeenCalledWith(expect.objectContaining({ apiSampleId: 9, status: 'excluded', exclusionReason: 'engine-pending-login', answer: null }));
  });

  it('保存成功网页答案且不改写 API 样本', async () => {
    const records = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const runner = new WebReviewRunnerService(
      { getStatus: jest.fn().mockResolvedValue({ availability: 'ready', lastFailureReason: null }) } as never,
      records as never,
      { review: jest.fn().mockResolvedValue({ answer: '网页端回答', screenshotPath: '/tmp/review.png', brandMentioned: true }) },
    );

    const result = await runner.run(sample, selected);

    expect(result).toMatchObject({ status: 'succeeded', answer: '网页端回答', brandMentioned: true });
    expect(records.save).toHaveBeenCalledWith(expect.objectContaining({ apiSampleId: 9, answer: '网页端回答', screenshotPath: '/tmp/review.png', status: 'succeeded' }));
    expect(sample).toEqual(expect.objectContaining({ id: 9, prompt: 'prompt' }));
  });
});
