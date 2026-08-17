import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

/**
 * Kimi 的登录态只依据页面已渲染的账户区域判断。
 * 不读取 Cookie、localStorage 等会话凭证，也不触发页面交互。
 */
export class KimiEngineSessionService implements EngineSessionAdapter {
  supports(engine: EngineSessionIdentity) { return /kimi|moonshot/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage, options: KimiSessionCheckOptions = {}): Promise<boolean> {
    const inspection = await this.inspect(page, options);
    return inspection.accountLabel === 'account' && inspection.membershipUpgradePresent;
  }

  /** 不含用户名或会话凭证，仅用于解释登录态检查结果。 */
  async inspect(page: EngineSessionPage, options: KimiSessionCheckOptions = {}): Promise<KimiSessionInspection> {
    const timeout = options.wait ? 10_000 : 1_000;
    try {
      await page.waitForSelector('.user-name', { state: 'attached', timeout });
    } catch {
      // 未挂载时仍返回 DOM 检查结果，由调用方标记为待登录。
    }
    const initial = await this.readInspection(page);
    if (initial.accountLabel !== 'account' || initial.membershipUpgradePresent) return initial;
    try {
      await page.waitForSelector('.membership-upgrade', { state: 'attached', timeout });
    } catch {
      // 登录账户未出现升级入口时，按当前 DOM 状态继续判定。
    }
    return this.readInspection(page);
  }

  private readInspection(page: EngineSessionPage): Promise<KimiSessionInspection> {
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

export type KimiSessionCheckOptions = { wait?: boolean };
