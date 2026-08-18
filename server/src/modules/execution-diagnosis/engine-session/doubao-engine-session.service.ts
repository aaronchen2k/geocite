import { Logger } from '@nestjs/common';
import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

export class DoubaoEngineSessionService implements EngineSessionAdapter {
  private readonly logger = new Logger(DoubaoEngineSessionService.name);

  supports(engine: EngineSessionIdentity) { return /doubao|bytedance/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage) {
    const accountButtonSelector = 'button[data-slot="dropdown-menu-trigger"].w-full.h-full';
    try {
      await page.waitForSelector(accountButtonSelector, { state: 'attached', timeout: 1_000 });
    } catch {
      // 账户节点可能尚未挂载；继续采集无敏感信息的检查结果。
    }
    const inspection = await page.evaluate(() => {
      const accountButton = document.querySelector('button[data-slot="dropdown-menu-trigger"].w-full.h-full');
      return {
        accountAvatarPresent: accountButton?.querySelector('img.rounded-full.object-cover') !== null,
        accountInfoPresent: accountButton?.querySelector('div.flex.min-w-0.flex-1.flex-col.overflow-hidden') !== null,
      };
    });
    const accountAvatarPresent = Boolean(inspection.accountAvatarPresent);
    const accountInfoPresent = Boolean(inspection.accountInfoPresent);
    const loggedIn = accountAvatarPresent && accountInfoPresent;
    this.logger.log(`豆包登录态检查：账户头像=${accountAvatarPresent}，账户信息=${accountInfoPresent}，结果=${loggedIn ? '已登录' : '未登录'}`);
    return loggedIn;
  }
}
