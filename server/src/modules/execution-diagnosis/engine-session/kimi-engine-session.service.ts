import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

/**
 * Kimi 的登录态只依据页面已渲染的账户区域判断。
 * 不读取 Cookie、localStorage 等会话凭证，也不触发页面交互。
 */
export class KimiEngineSessionService implements EngineSessionAdapter {
  supports(engine: EngineSessionIdentity) { return /kimi|moonshot/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage): Promise<boolean> {
    const inspection = await this.inspect(page);
    return inspection.accountLabel === 'account' && inspection.membershipUpgradePresent;
  }

  /** 不含用户名或会话凭证，仅用于解释登录态检查结果。 */
  async inspect(page: EngineSessionPage): Promise<KimiSessionInspection> {
    try {
      await page.waitForSelector('.user-name', { state: 'attached', timeout: 10_000 });
      await page.waitForSelector('.membership-upgrade', { state: 'attached', timeout: 10_000 });
    } catch {
      // 未挂载时仍返回 DOM 检查结果，由调用方标记为待登录。
    }
    return page.evaluate(() => {
      const userName = document.querySelector('.user-name')?.textContent?.trim();
      return {
        accountLabel: !userName ? 'missing' : userName === '登录' ? 'login' : 'account',
        membershipUpgradePresent: document.querySelector('.membership-upgrade') !== null,
      };
    });
  }
}

export type KimiSessionInspection = {
  accountLabel: 'missing' | 'login' | 'account';
  membershipUpgradePresent: boolean;
};
