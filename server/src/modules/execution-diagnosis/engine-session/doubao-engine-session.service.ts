import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

export class DoubaoEngineSessionService implements EngineSessionAdapter {
  supports(engine: EngineSessionIdentity) { return /doubao|bytedance/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage) {
    const inspection = await page.evaluate(() => {
      const accountButton = [...document.querySelectorAll('button.w-full.h-full')]
        .find((button) => button.querySelector('img.rounded-full.object-cover') !== null);
      return {
        accountAvatarButtonPresent: accountButton !== undefined,
        authenticatedSidebarPresent: document.querySelector('a.group\\/sidebar_nav_item') !== null,
      };
    });
    return inspection.accountAvatarButtonPresent && inspection.authenticatedSidebarPresent;
  }
}
