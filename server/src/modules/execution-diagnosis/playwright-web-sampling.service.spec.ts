import { PlaywrightWebSamplingService } from './playwright-web-sampling.service';

describe('PlaywrightWebSamplingService', () => {
  const engine = {
    id: 2,
    code: 'qwen',
    name: '千问',
    vendor: 'Alibaba',
    homepage: 'https://www.qianwen.com/',
    baseUrl: null,
    webReviewConfig: {
      chatUrl: 'https://www.qianwen.com/',
      inputSelector: 'textarea',
      answerSelector: '.markdown',
      citationSelector: '.markdown a[href]',
    },
  };

  it('关闭旧窗口后以随机低频网页搜索并返回回答和公开引用', async () => {
    const input = { fill: jest.fn(), press: jest.fn() };
    const answer = { last: () => ({ innerText: jest.fn().mockResolvedValue('联网回答') }) };
    const citations = {
      evaluateAll: jest.fn().mockResolvedValue([
        { title: '公开来源', url: 'https://example.com/source', excerpt: '来源摘要' },
      ]),
    };
    const page = {
      goto: jest.fn(),
      url: jest.fn().mockReturnValue('https://www.qianwen.com/'),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn((selector: string) => {
        if (selector === 'textarea') return input;
        if (selector === '.markdown') return answer;
        if (selector === '.markdown a[href]') return citations;
        return { last: () => ({ innerText: jest.fn() }) };
      }),
    };
    const chrome = {
      prepareForAutomatedSampling: jest.fn().mockResolvedValue('ready'),
      useReadyProfile: jest.fn(async (_engine, action) => action(page)),
    };
    const delay = jest.fn().mockResolvedValue(undefined);
    const service = new PlaywrightWebSamplingService(
      { findOne: jest.fn().mockResolvedValue(engine) } as never,
      chrome as never,
      { random: () => 0, delay },
    );

    const results = await service.searchBatch(engine, [
      { question: '问题一', prompt: '请联网搜索，回答务必输出网页引用来源以及原文链接。\n\n问题：问题一', brandName: '品牌' },
      { question: '问题二', prompt: '请联网搜索，回答务必输出网页引用来源以及原文链接。\n\n问题：问题二', brandName: '品牌' },
    ]);

    expect(chrome.prepareForAutomatedSampling).toHaveBeenCalledWith(engine);
    expect(delay).toHaveBeenCalledWith(2_000);
    expect(input.fill).toHaveBeenNthCalledWith(1, '请联网搜索，回答务必输出网页引用来源以及原文链接。\n\n问题：问题一');
    expect(results).toEqual([
      expect.objectContaining({ question: '问题一', answer: '联网回答', adapter: 'qwen-web', error: null, citations: [{ title: '公开来源', url: 'https://example.com/source', excerpt: '来源摘要' }] }),
      expect.objectContaining({ question: '问题二', answer: '联网回答', adapter: 'qwen-web', error: null, citations: [{ title: '公开来源', url: 'https://example.com/source', excerpt: '来源摘要' }] }),
    ]);
  });

  it('浏览器未就绪时不提交问题并返回可记录的失败结果', async () => {
    const chrome = {
      prepareForAutomatedSampling: jest.fn().mockResolvedValue('pending_login'),
      useReadyProfile: jest.fn(),
    };
    const service = new PlaywrightWebSamplingService(
      { findOne: jest.fn().mockResolvedValue(engine) } as never,
      chrome as never,
      { random: () => 0, delay: jest.fn() },
    );

    await expect(service.searchBatch(engine, [{ question: '问题', prompt: '提示词', brandName: '品牌' }])).resolves.toEqual([
      expect.objectContaining({ question: '问题', answer: '', citations: [], error: 'engine-pending-login' }),
    ]);
    expect(chrome.useReadyProfile).not.toHaveBeenCalled();
  });

  it('只使用数据库中的网页搜索配置，不为千问回退到硬编码 URL', async () => {
    const chrome = {
      prepareForAutomatedSampling: jest.fn(),
      useReadyProfile: jest.fn(),
    };
    const service = new PlaywrightWebSamplingService(
      { findOne: jest.fn().mockResolvedValue({ ...engine, webReviewConfig: null }) } as never,
      chrome as never,
      { random: () => 0, delay: jest.fn() },
    );

    await expect(service.searchBatch(engine, [{ question: '问题', prompt: '提示词', brandName: '品牌' }])).resolves.toEqual([
      expect.objectContaining({ error: 'web-search-engine-config-excluded' }),
    ]);
    expect(chrome.prepareForAutomatedSampling).not.toHaveBeenCalled();
  });
});
