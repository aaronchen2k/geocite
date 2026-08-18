import { DoubaoEngineWebSearchAdapter } from './doubao-engine-web-search.adapter';

describe('DoubaoEngineWebSearchAdapter', () => {
  it('以最新消息操作栏的父节点读取回答，并展开参考资料收集公开链接', async () => {
    const input = { fill: jest.fn(), press: jest.fn(), last: () => input };
    const action = { evaluate: jest.fn().mockResolvedValue('豆包回答'), last: () => action };
    const citations = { evaluateAll: jest.fn().mockResolvedValue([{ title: '资料', url: 'https://example.com/source', excerpt: null }]) };
    const page = { url: jest.fn().mockReturnValue('https://www.doubao.com/chat/'), goto: jest.fn(), waitForSelector: jest.fn(), evaluate: jest.fn(), locator: jest.fn((selector: string) => selector === 'input' ? input : selector === 'action' ? action : citations) };
    await expect(new DoubaoEngineWebSearchAdapter().search(page as never, { prompt: '请联网搜索，回答务必输出网页引用来源以及原文链接。\n问题', config: { chatUrl: 'https://www.doubao.com/', inputSelector: 'input', answerSelector: 'action', citationSelector: 'citation', sourceTriggerText: '参考' } })).resolves.toEqual({ answer: '豆包回答', citations: [{ title: '资料', url: 'https://example.com/source', excerpt: null }], adapter: 'doubao-web' });
    expect(page.evaluate).toHaveBeenCalled();
  });
});
