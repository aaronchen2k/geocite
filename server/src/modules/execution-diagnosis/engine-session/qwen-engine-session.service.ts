import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

export class QwenEngineSessionService implements EngineSessionAdapter {
  supports(engine: EngineSessionIdentity) { return /qwen|alibaba/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage) {
    return Boolean(await page.evaluate(() => {
      const user = (globalThis as { _USER_?: { userId?: string } })._USER_;
      return user?.userId?.trim() ?? '';
    }));
  }
}
