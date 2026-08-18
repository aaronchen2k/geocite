import { QwenEngineSessionService } from './qwen-engine-session.service';

describe('QwenEngineSessionService', () => {
  const service = new QwenEngineSessionService();

  it('账户按钮和圆形头像同时出现时识别为已登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ accountButtonPresent: true, accountAvatarPresent: true }) };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(true);
  });

  it('访客页面没有账户区域时识别为未登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ accountButtonPresent: false, accountAvatarPresent: false }) };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(false);
  });

  it('账户区域缺少头像时不猜测为已登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ accountButtonPresent: true, accountAvatarPresent: false }) };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(false);
  });
});
