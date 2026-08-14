import { completionTokenLimit, temperatureSetting } from './model-request';

describe('默认模型请求参数', () => {
  it('为 Azure GPT-5 模型使用 max_completion_tokens', () => {
    expect(completionTokenLimit({ provider: 'Azure OpenAI', modelName: 'gpt-5.6-terra' }, 700)).toEqual({ max_completion_tokens: 700 });
  });

  it('不为 GPT-5 模型发送 temperature 参数', () => {
    expect(temperatureSetting({ provider: 'Azure OpenAI', modelName: 'gpt-5.6-terra' }, 0.4)).toEqual({});
  });
});
