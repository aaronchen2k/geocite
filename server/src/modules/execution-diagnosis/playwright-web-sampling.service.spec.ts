import { PlaywrightWebSamplingService } from './playwright-web-sampling.service';

describe('PlaywrightWebSamplingService', () => {
  const requests = [
    { question: '问题一', prompt: '请联网搜索，回答务必输出网页引用来源以及原文链接。\n\n问题：问题一', brandName: '品牌' },
    { question: '问题二', prompt: '请联网搜索，回答务必输出网页引用来源以及原文链接。\n\n问题：问题二', brandName: '品牌' },
  ];

  it('dsh 执行后将 crawler 回答和引用映射为诊断样本', async () => {
    const dshCommand = jest.fn().mockResolvedValue([
      { question: requests[0].prompt, response: '联网回答一', citations: [{ title: '公开来源', href: 'https://example.com/source' }] },
      { question: requests[1].prompt, response: '联网回答二', citations: [{ title: '仅文字来源', href: '' }] },
    ]);
    const service = new PlaywrightWebSamplingService({ dshCommand });

    await expect(service.searchBatch({ id: 2, code: 'qwen', name: '千问' }, requests)).resolves.toEqual([
      expect.objectContaining({ question: '问题一', answer: '联网回答一', adapter: 'qwen-crawler', error: null, citations: [{ title: '公开来源', url: 'https://example.com/source', excerpt: null }] }),
      expect.objectContaining({ question: '问题二', answer: '联网回答二', adapter: 'qwen-crawler', error: null, citations: [] }),
    ]);
    expect(dshCommand).toHaveBeenCalledWith('qwen', requests.map((request) => request.prompt));
  });

  it('不支持的引擎不会尝试运行 crawler', async () => {
    const dshCommand = jest.fn();
    const service = new PlaywrightWebSamplingService({ dshCommand });

    await expect(service.searchBatch({ id: 9, code: 'kimi', name: 'Kimi' }, [requests[0]])).resolves.toEqual([
      expect.objectContaining({ question: '问题一', error: 'crawler-engine-not-supported' }),
    ]);
    expect(dshCommand).not.toHaveBeenCalled();
  });
});
