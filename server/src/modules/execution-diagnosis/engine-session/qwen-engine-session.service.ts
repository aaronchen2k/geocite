import { Logger } from '@nestjs/common';
import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

export class QwenEngineSessionService implements EngineSessionAdapter {
  private readonly logger = new Logger(QwenEngineSessionService.name);

  supports(engine: EngineSessionIdentity) { return /qwen|alibaba/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage) {
    const accountButtonSelector = 'button.flex.min-w-0.flex-1.cursor-pointer.items-center.gap-3.text-left';
    try {
      await page.waitForSelector(accountButtonSelector, { state: 'attached', timeout: 1_000 });
    } catch {
      // 账户节点可能尚未挂载；继续采集无敏感信息的检查结果。
    }
    const inspection = await page.evaluate(() => {
      const accountButton = document.querySelector('button.flex.min-w-0.flex-1.cursor-pointer.items-center.gap-3.text-left');
      return {
        accountButtonPresent: accountButton !== null,
        accountAvatarPresent: accountButton?.querySelector('img.size-7.rounded-full') !== null,
      };
    });
    const accountButtonPresent = Boolean(inspection.accountButtonPresent);
    const accountAvatarPresent = Boolean(inspection.accountAvatarPresent);
    const loggedIn = accountButtonPresent && accountAvatarPresent;
    this.logger.log(`千问登录态检查：账户按钮=${accountButtonPresent}，圆形头像=${accountAvatarPresent}，结果=${loggedIn ? '已登录' : '未登录'}`);
    return loggedIn;
  }
}
