import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

export class YuanbaoEngineSessionService implements EngineSessionAdapter {
  supports(engine: EngineSessionIdentity) { return /yuanbao|tencent/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage) {
    if (await this.hasLoginDialog(page)) return false;
    return Boolean(await page.evaluate(() => {
      const name = document.querySelector('.nick-info-name')?.textContent?.trim();
      return name && name !== '未登录';
    }));
  }

  private async hasLoginDialog(page: EngineSessionPage) {
    try {
      await page.waitForSelector('text=微信登录', { state: 'visible', timeout: 3_000 });
      return true;
    } catch {
      return false;
    }
  }
}
