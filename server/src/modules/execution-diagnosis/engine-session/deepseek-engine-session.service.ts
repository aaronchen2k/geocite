import { Logger } from '@nestjs/common';
import type { EngineSessionAdapter, EngineSessionIdentity, EngineSessionPage } from './engine-session-adapter';

export class DeepSeekEngineSessionService implements EngineSessionAdapter {
  private readonly logger = new Logger(DeepSeekEngineSessionService.name);

  supports(engine: EngineSessionIdentity) { return /deepseek/.test(`${engine.code} ${engine.vendor}`.toLowerCase()); }

  async isLoggedIn(page: EngineSessionPage) {
    const conversationSelector = 'a._546d736';
    try {
      await page.waitForSelector(conversationSelector, { state: 'attached', timeout: 1_000 });
    } catch {
      // 已认证工作区节点可能尚未挂载；继续采集无敏感信息的检查结果。
    }
    const inspection = await page.evaluate(() => ({
      conversationHistoryPresent: document.querySelector('a._546d736') !== null,
      authenticatedComposerPresent: document.querySelector('textarea._27c9245') !== null,
    }));
    const conversationHistoryPresent = Boolean(inspection?.conversationHistoryPresent);
    const authenticatedComposerPresent = Boolean(inspection?.authenticatedComposerPresent);
    const loggedIn = conversationHistoryPresent && authenticatedComposerPresent;
    this.logger.log(`DeepSeek 登录态检查：会话历史=${conversationHistoryPresent}，对话输入区=${authenticatedComposerPresent}，结果=${loggedIn ? '已登录' : '未登录'}`);
    return loggedIn;
  }
}
