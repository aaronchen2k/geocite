import { DoubaoEngineSessionService } from './doubao-engine-session.service';

describe('DoubaoEngineSessionService', () => {
  const service = new DoubaoEngineSessionService();

  it('账户按钮中的头像和账户信息容器同时出现时识别为已登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ accountAvatarPresent: true, accountInfoPresent: true }) };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(true);
  });

  it('登录前缺少账户特征时识别为未登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ accountAvatarPresent: false, accountInfoPresent: false }) };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(false);
  });

  it('账户按钮内部特征不完整时不猜测为已登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ accountAvatarPresent: true, accountInfoPresent: false }) };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(false);
  });
});
