import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

export class WenxinEngineSessionService implements EngineSessionAdapter {
  supports(engine: EngineSessionIdentity) { return /wenxin|wenxiaoyan|baidu/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage) {
    return Boolean(await page.evaluate(() => {
      const source = document.querySelector('script[name="aiTabFrameBaseData"]')?.textContent;
      if (!source) return false;
      const isUserLogin = JSON.parse(source)?.userInfo?.isUserLogin;
      return isUserLogin === true || isUserLogin === 1 || isUserLogin === '1';
    }));
  }
}
