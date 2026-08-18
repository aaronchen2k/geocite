import { DoubaoEngineSessionService } from './doubao-engine-session.service';

describe('DoubaoEngineSessionService', () => {
  const service = new DoubaoEngineSessionService();

  it('账户头像按钮和已认证侧栏同时出现时识别为已登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ accountAvatarButtonPresent: true, authenticatedSidebarPresent: true }) };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(true);
  });

  it('登录前缺少已认证特征时识别为未登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ accountAvatarButtonPresent: false, authenticatedSidebarPresent: false }) };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(false);
  });

  it('账户头像按钮或侧栏不完整时不猜测为已登录', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue({ accountAvatarButtonPresent: true, authenticatedSidebarPresent: false }) };

    await expect(service.isLoggedIn(page as never)).resolves.toBe(false);
  });
});
