import { toPageEvidence, toProbeEvidence, toSampleEvidence } from './evidence-records';

describe('execution diagnosis evidence records', () => {
  it('保留抓取页面的原始内容与 HTTP 元数据', () => {
    expect(toPageEvidence(7, { url: 'https://example.com', status: 200, contentType: 'text/html', html: '<h1>Example</h1>' })).toMatchObject({ runId: 7, url: 'https://example.com', statusCode: 200, body: '<h1>Example</h1>' });
  });

  it('不在采样记录中携带 API Key', () => {
    const record = toSampleEvidence(7, { id: 2, name: '千问', code: 'qwen', modelName: 'qwen3', baseUrl: 'https://api.example.com', apiKey: 'secret-key', disabled: false }, '问题', 200, '完整回答');
    expect(record).toMatchObject({ runId: 7, engineId: 2, prompt: '问题', answer: '完整回答', statusCode: 200 });
    expect(JSON.stringify(record)).not.toContain('secret-key');
  });

  it('保留 AI UA 探测状态', () => {
    expect(toProbeEvidence(7, 'GPTBot', 'https://example.com', 403)).toEqual({ runId: 7, userAgent: 'GPTBot', url: 'https://example.com', statusCode: 403 });
  });
});
