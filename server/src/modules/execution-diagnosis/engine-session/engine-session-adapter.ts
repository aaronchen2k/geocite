export type EngineSessionPage = {
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
  waitForSelector(selector: string, options?: object): Promise<unknown>;
  locator(selector: string): { allTextContents(): Promise<string[]> };
};

export type EngineSessionIdentity = { code: string; vendor: string };

/** 单一引擎的页面登录态识别适配器。 */
export interface EngineSessionAdapter {
  supports(engine: EngineSessionIdentity): boolean;
  isLoggedIn(page: EngineSessionPage): Promise<boolean>;
}
