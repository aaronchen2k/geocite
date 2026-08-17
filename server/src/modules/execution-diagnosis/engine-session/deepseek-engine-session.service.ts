import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

export class DeepSeekEngineSessionService implements EngineSessionAdapter {
  supports(engine: EngineSessionIdentity) { return /deepseek/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage) {
    const texts = await page.locator('a, button, [role="button"]').allTextContents();
    return !texts.some((text) => /\b(log\s*in|sign\s*in)\b|登录|登陆/iu.test(text.trim()));
  }
}
