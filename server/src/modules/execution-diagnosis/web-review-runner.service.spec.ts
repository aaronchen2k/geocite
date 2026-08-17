import { PlaywrightBrowserReviewer, WebReviewRunnerService } from './web-review-runner.service';

describe('WebReviewRunnerService', () => {
  const sample = { id: 9, runId: 3, engineId: 4, engineName: 'Acme AI', engineCode: 'acme', question: '推荐什么服务？', prompt: 'prompt', brandName: 'Acme' };
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

  it('通过持久 Profile 提交问题、等待网页回答并提取真实文本', async () => {
    const input = { fill: jest.fn(), press: jest.fn() };
    const answer = { innerText: jest.fn().mockResolvedValue('网页端的真实回答') };
    const page = {
      goto: jest.fn(), url: jest.fn().mockReturnValue('https://chatgpt.com/'),
      locator: jest.fn((selector: string) => selector === 'textarea#prompt-textarea' ? input : { last: () => answer, count: jest.fn().mockResolvedValue(1) }),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
    };
    const reviewer = new PlaywrightBrowserReviewer(
      { findOne: jest.fn().mockResolvedValue({ id: 4, code: 'chatgpt', vendor: 'OpenAI', webReviewConfig: null }) } as never,
      { useReadyProfile: jest.fn(async (_engineId, action) => action(page)) } as never,
    );

    await expect(reviewer.review(sample)).resolves.toEqual({ answer: '网页端的真实回答', screenshotPath: null, brandMentioned: false });
    expect(page.goto).toHaveBeenCalledWith('https://chatgpt.com/', expect.objectContaining({ waitUntil: 'domcontentloaded' }));
    expect(input.fill).toHaveBeenCalledWith('prompt');
    expect(input.press).toHaveBeenCalledWith('Enter');
    expect(page.waitForSelector).toHaveBeenCalledWith('[data-message-author-role="assistant"]', expect.objectContaining({ state: 'visible' }));
  });

  it('把没有网页配置的引擎明确排除，而不是伪造浏览器结果', async () => {
    const records = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const runner = new WebReviewRunnerService(
      { getStatus: jest.fn().mockResolvedValue({ availability: 'ready', lastFailureReason: null }) } as never,
      records as never,
      { review: jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'web-review-engine-config-excluded' })) },
    );

    await expect(runner.run(sample, selected)).resolves.toMatchObject({ status: 'excluded', exclusionReason: 'web-review-engine-config-excluded' });
  });

  it('真实适配器对未知引擎配置明确报为 excluded，且不启动网页操作', async () => {
    const useReadyProfile = jest.fn();
    const reviewer = new PlaywrightBrowserReviewer(
      { findOne: jest.fn().mockResolvedValue({ id: 4, code: 'private-ai', vendor: 'Example', webReviewConfig: null }) } as never,
      { useReadyProfile } as never,
    );

    await expect(reviewer.review(sample)).rejects.toMatchObject({ code: 'web-review-engine-config-excluded' });
    expect(useReadyProfile).not.toHaveBeenCalled();
  });
});
