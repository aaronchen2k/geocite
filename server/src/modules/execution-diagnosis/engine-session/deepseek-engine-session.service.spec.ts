import { DeepSeekEngineSessionService } from './deepseek-engine-session.service';

describe('DeepSeekEngineSessionService', () => {
  const service = new DeepSeekEngineSessionService();

  it('会话历史和对话输入区同时出现时识别为已登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ conversationHistoryPresent: true, authenticatedComposerPresent: true }), waitForSelector: jest.fn() };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(true);
  });

  it('登录前缺少已认证工作区特征时识别为未登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ conversationHistoryPresent: false, authenticatedComposerPresent: false }), waitForSelector: jest.fn() };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(false);
  });

  it('已认证工作区特征不完整时不猜测为已登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ conversationHistoryPresent: true, authenticatedComposerPresent: false }), waitForSelector: jest.fn() };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(false);
  });
});
