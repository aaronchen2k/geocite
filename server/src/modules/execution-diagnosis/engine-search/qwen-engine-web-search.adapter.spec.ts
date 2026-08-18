import { QwenEngineWebSearchAdapter } from './qwen-engine-web-search.adapter';

describe('QwenEngineWebSearchAdapter', () => {
  it('使用数据库配置的来源入口，收集展开后新增的公开引用', async () => {
    const input = { fill: jest.fn(), press: jest.fn() };
    const answer = { last: () => ({ innerText: jest.fn().mockResolvedValue('千问联网回答') }) };
    const page = {
      goto: jest.fn(),
      url: jest.fn().mockReturnValue('https://www.qianwen.com/'),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      waitForFunction: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn((selector: string) => selector === 'div[role="textbox"]' ? input : selector === '#qk-markdown-react' ? answer : { evaluateAll: jest.fn().mockResolvedValue([]) }),
      evaluate: jest.fn()
        .mockResolvedValueOnce(['https://www.qianwen.com/'])
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce([{ title: '公开论文', url: 'https://example.com/paper', excerpt: null }]),
    };

    await expect(new QwenEngineWebSearchAdapter().search(page as never, {
      prompt: '请联网搜索，回答务必输出网页引用来源以及原文链接。\n\n问题：测试',
      config: {
        chatUrl: 'https://www.qianwen.com/',
        inputSelector: 'div[role="textbox"]',
        answerSelector: '#qk-markdown-react',
        citationSelector: 'a[href]',
        sourceTriggerText: '来源',
      },
    })).resolves.toEqual({
      answer: '千问联网回答',
      citations: [{ title: '公开论文', url: 'https://example.com/paper', excerpt: null }],
      adapter: 'qwen-web',
    });
    expect(input.fill).toHaveBeenCalledWith(expect.stringContaining('请联网搜索'));
    expect(page.waitForFunction).toHaveBeenCalled();
  });
});
