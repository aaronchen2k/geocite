import { EngineSamplingClient } from './engine-sampling-client';

const qwen = {
  id: 1, name: '通义千问', code: 'qwen', vendor: 'Alibaba Cloud', modelName: 'qwen-plus',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'test-key', webSearchEnabled: true, disabled: false,
};

describe('引擎问答采样客户端', () => {
  it('千问启用联网时使用其原生 enable_search 请求参数', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '联网回答' } }],
    }), { status: 200 }));
    const client = new EngineSamplingClient(fetcher);

    const result = await client.sample(qwen, '请回答', { nativeWebSearch: true });

    expect(fetcher).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"enable_search":true'),
      }),
    );
    expect(result).toMatchObject({ answer: '联网回答', nativeWebSearch: true, adapter: 'qwen' });
  });

  it('未知引擎使用 OpenAI 兼容请求且不声称已启用联网搜索', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '普通回答' } }],
    }), { status: 200 }));
    const client = new EngineSamplingClient(fetcher);

    const result = await client.sample({ ...qwen, code: 'unknown', name: '未知引擎', vendor: 'Unknown' }, '请回答', { nativeWebSearch: true });

    expect(result).toMatchObject({ answer: '普通回答', nativeWebSearch: false, adapter: 'openai-compatible' });
  });

  it('千问的自定义编码仍使用千问适配器', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '联网回答' } }],
    }), { status: 200 }));
    const client = new EngineSamplingClient(fetcher);

    const result = await client.sample({ ...qwen, code: 'qwen3-7-flash' }, '请回答', { nativeWebSearch: true });

    expect(result).toMatchObject({ adapter: 'qwen', nativeWebSearch: true });
  });
});
