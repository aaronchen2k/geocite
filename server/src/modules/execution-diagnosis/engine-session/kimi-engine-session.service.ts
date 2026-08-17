import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

/**
 * Kimi 的登录态只依据页面已渲染的账户区域判断。
 * 不读取 Cookie、localStorage 等会话凭证，也不触发页面交互。
 */
export class KimiEngineSessionService implements EngineSessionAdapter {
  supports(engine: EngineSessionIdentity) { return /kimi|moonshot/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage): Promise<boolean> {
    return Boolean(await page.evaluate(() => {
      const userName = document.querySelector('.user-info .user-name')?.textContent?.trim();
      const hasGuestAvatar = document.querySelector('.user-info .not-login-icon') !== null;
      return Boolean(userName && userName !== '登录' && !hasGuestAvatar);
    }));
  }
}
