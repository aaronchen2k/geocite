import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

export class DoubaoEngineSessionService implements EngineSessionAdapter {
  supports(engine: EngineSessionIdentity) { return /doubao|bytedance/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage) {
    return Boolean(await page.evaluate(() => {
      const routerData = (globalThis as { _ROUTER_DATA?: { loaderData?: { chat_layout?: { chat_layout?: { is_login?: boolean; accountInfo?: { data?: { user_id?: number | string } } } } } } })._ROUTER_DATA;
      const state = routerData?.loaderData?.chat_layout?.chat_layout;
      return state?.is_login === true || Number(state?.accountInfo?.data?.user_id ?? 0) > 0;
    }));
  }
}
