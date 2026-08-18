import { ConflictException, Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { Repository } from 'typeorm';
import { EngineEntity } from '../engines/engine.entity';
import { EngineBrowserLaunchEntity, EngineWebReviewProfileEntity, type WebReviewAvailability, type WebReviewFailureCode } from './web-review.entity';
import type { EngineSessionAdapter } from './engine-session/engine-session-adapter';
import { DeepSeekEngineSessionService } from './engine-session/deepseek-engine-session.service';
import { DoubaoEngineSessionService } from './engine-session/doubao-engine-session.service';
import { KimiEngineSessionService, type KimiSessionInspection } from './engine-session/kimi-engine-session.service';
import { QwenEngineSessionService } from './engine-session/qwen-engine-session.service';
import { WenxinEngineSessionService } from './engine-session/wenxin-engine-session.service';
import { YuanbaoEngineSessionService } from './engine-session/yuanbao-engine-session.service';

type PageLike = { goto(url: string, options?: object): Promise<unknown>; url(): string; locator(selector: string): { allTextContents(): Promise<string[]> }; evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>; waitForSelector(selector: string, options?: object): Promise<unknown> };
type BrowserContextLike = { pages(): PageLike[]; newPage(): Promise<PageLike>; close(): Promise<void> };
type BrowserLauncher = { launchPersistentContext(userDataDir: string, options: { executablePath: string; headless: boolean; args: string[]; ignoreDefaultArgs?: string[] }): Promise<BrowserContextLike> };
type BrowserEngine = Pick<EngineEntity, 'id' | 'code' | 'vendor' | 'baseUrl'> & { homepage?: string | null };

export type ControlledChromeProcess = { pid: number; launchId: string; profilePath: string };
export type ControlledPageStructure = {
  url: string;
  elements: Array<{ tag: string; id: string | null; classes: string[]; attributes: { role: string | null; dataSlot: string | null; contentEditable: string | null; type: string | null }; hrefPath: string | null }>;
};
export type ProcessInspector = {
  findControlledChrome(launchId: string, profilePath: string): Promise<ControlledChromeProcess | null>;
  kill(process: ControlledChromeProcess): Promise<void>;
};

export type LocalChromeDependencies = {
  browser: BrowserLauncher;
  processInspector: ProcessInspector;
  chromePath: () => string | null;
  appDataPath: () => string;
  removeDirectory: (directory: string) => Promise<void>;
};

export const LOCAL_CHROME_DEPENDENCIES = Symbol('LOCAL_CHROME_DEPENDENCIES');
const execFile = promisify(execFileCallback);

function commandLineArguments(command: string) {
  const argumentsList: string[] = [];
  const matcher = /(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+))/g;
  for (const match of command.matchAll(matcher)) {
    argumentsList.push((match[1] ?? match[2] ?? match[3]).replace(/\\([\\"'])/g, '$1'));
  }
  return argumentsList;
}

export function hasExactControlledChromeArguments(command: string, launchId: string, profilePath: string) {
  const argumentsList = commandLineArguments(command);
  const normalizedProfilePath = path.resolve(profilePath);
  return argumentsList.includes(`--geocite-review-launch-id=${launchId}`)
    && argumentsList.includes(`--user-data-dir=${normalizedProfilePath}`);
}

class SystemProcessInspector implements ProcessInspector {
  async findControlledChrome(launchId: string, profilePath: string): Promise<ControlledChromeProcess | null> {
    if (process.platform === 'win32') return this.findWindowsChrome(launchId, profilePath);
    const { stdout } = await execFile('ps', ['-axo', 'pid=,command=']);
    const normalizedProfilePath = path.resolve(profilePath);
    for (const line of stdout.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match) continue;
      const [, pid, command] = match;
      if (!/\b(google )?chrome\b/i.test(command)) continue;
      if (hasExactControlledChromeArguments(command, launchId, normalizedProfilePath)) {
        return { pid: Number(pid), launchId, profilePath: normalizedProfilePath };
      }
    }
    return null;
  }

  async kill(controlled: ControlledChromeProcess) {
    process.kill(controlled.pid, 'SIGTERM');
  }

  private async findWindowsChrome(launchId: string, profilePath: string): Promise<ControlledChromeProcess | null> {
    const script = "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'chrome' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
    const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-Command', script]);
    if (!stdout.trim()) return null;
    const values = JSON.parse(stdout) as { ProcessId?: number; CommandLine?: string } | { ProcessId?: number; CommandLine?: string }[] | null;
    const controlled = (Array.isArray(values) ? values : [values]).find((value) => value?.ProcessId && value.CommandLine && hasExactControlledChromeArguments(value.CommandLine, launchId, profilePath));
    return controlled?.ProcessId ? { pid: controlled.ProcessId, launchId, profilePath: path.resolve(profilePath) } : null;
  }
}

function detectChromePath(): string | null {
  const configuredPath = process.env.GEOCITE_CHROME_PATH;
  if (configuredPath && existsSync(configuredPath)) return configuredPath;
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : process.platform === 'win32'
      ? [
          path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Chrome only needs this compatibility flag when it is run as root in Linux. */
function systemNeedsNoSandbox() {
  return process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0;
}

function defaultDependencies(): LocalChromeDependencies {
  return {
    browser: chromium as unknown as BrowserLauncher,
    processInspector: new SystemProcessInspector(),
    chromePath: detectChromePath,
    appDataPath: () => process.env.GEOCITE_APP_DATA_DIR ?? path.resolve(process.cwd(), 'data'),
    removeDirectory: (directory) => rm(directory, { recursive: true, force: true }),
  };
}

@Injectable()
export class LocalChromeService {
  private readonly logger = new Logger(LocalChromeService.name);
  private readonly dependencies: LocalChromeDependencies;
  private readonly contexts = new Map<number, { launchId: string; profilePath: string; context: BrowserContextLike }>();
  private readonly engineOperations = new Map<number, Promise<void>>();
  private readonly sessionInspection = new Map<number, KimiSessionInspection>();
  private readonly engineSessions: EngineSessionAdapter[] = [
    new QwenEngineSessionService(),
    new DoubaoEngineSessionService(),
    new YuanbaoEngineSessionService(),
    new KimiEngineSessionService(),
    new WenxinEngineSessionService(),
    new DeepSeekEngineSessionService(),
  ];

  constructor(
    @InjectRepository(EngineEntity) private readonly engines: Repository<EngineEntity>,
    @InjectRepository(EngineWebReviewProfileEntity) private readonly profiles: Repository<EngineWebReviewProfileEntity>,
    @InjectRepository(EngineBrowserLaunchEntity) private readonly launches: Repository<EngineBrowserLaunchEntity>,
    @Optional() @Inject(LOCAL_CHROME_DEPENDENCIES) dependencies?: Partial<LocalChromeDependencies>,
  ) {
    this.dependencies = { ...defaultDependencies(), ...dependencies };
  }

  async getStatus(engineId: number) {
    const profile = await this.profiles.findOne({ where: { engineId } });
    return profile
      ? this.toStatus(profile)
      : { availability: 'unknown' as const, lastCheckedAt: null, failureCode: null, lastFailureReason: null, lastReadyAt: null };
  }

  /** Executes an automated review in the same dedicated, persistent profile used for manual login. */
  async useReadyProfile<T>(engineOrId: number | BrowserEngine, action: (page: unknown) => Promise<T>): Promise<T> {
    const engine = await this.resolveEngine(engineOrId);
    return this.runForEngine(engine.id, async () => {
      const profile = await this.ensureProfile(engine);
      let managed = this.contexts.get(engine.id);
      if (!managed) {
        await this.closePreviousLaunch(engine.id);
        const availability = await this.launchAndCheck(engine, profile, false);
        if (availability !== 'ready') {
          const error = new Error(availability === 'pending_login' ? 'engine-pending-login' : profile.failureCode === 'challenge_detected' ? 'engine-challenge-or-risk-control' : 'engine-unavailable');
          Object.assign(error, { code: error.message });
          throw error;
        }
        managed = this.contexts.get(engine.id);
      }
      if (!managed) {
        const error = new Error('engine-unavailable');
        Object.assign(error, { code: error.message });
        throw error;
      }
      return action(managed.context.pages()[0] ?? await managed.context.newPage());
    });
  }

  /** 供适配器生成技能比较搜索前后的页面结构；不返回文本、会话或凭证。 */
  async inspectControlledPage(engineOrId: number | BrowserEngine): Promise<ControlledPageStructure> {
    return this.useReadyProfile(engineOrId, async (rawPage) => (rawPage as PageLike).evaluate(() => {
      const safeUrl = new URL(window.location.href);
      const elements = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], button, [role="button"], a[href], [data-slot], [class*="markdown"], [class*="answer"], [class*="citation"], [class*="source"]'))
        .slice(0, 300)
        .map((element) => {
          const anchor = element instanceof HTMLAnchorElement ? new URL(element.href) : null;
          const id = element.id && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(element.id) && !/radix/i.test(element.id) ? element.id : null;
          return {
            tag: element.tagName.toLowerCase(),
            id,
            classes: Array.from(element.classList).filter((item) => item.length <= 80).slice(0, 12),
            attributes: {
              role: element.getAttribute('role'),
              dataSlot: element.getAttribute('data-slot'),
              contentEditable: element.getAttribute('contenteditable'),
              type: element.getAttribute('type'),
            },
            hrefPath: anchor ? `${anchor.origin}${anchor.pathname}` : null,
          };
        });
      return { url: `${safeUrl.origin}${safeUrl.pathname}`, elements };
    }));
  }

  async refresh(engineOrId: number | BrowserEngine): Promise<WebReviewAvailability> {
    const engine = await this.resolveEngine(engineOrId);
    return this.runForEngine(engine.id, async () => {
      const profile = await this.ensureProfile(engine);
      const existing = this.contexts.get(engine.id);
      const launch = await this.launches.findOne({ where: { engineId: engine.id, launchStatus: 'running' }, order: { startedAt: 'DESC' } });
      if (!existing || !launch || existing.launchId !== launch.launchId || !this.sameProfilePath(existing.profilePath, launch.profilePath)) {
        this.contexts.delete(engine.id);
        return this.markUnknown(profile, launch, '受控 Chrome 未运行或无法接管，请点击重置后重新打开');
      }
      const controlled = await this.dependencies.processInspector.findControlledChrome(launch.launchId, launch.profilePath);
      if (!controlled || controlled.launchId !== launch.launchId || !this.sameProfilePath(controlled.profilePath, launch.profilePath)) {
        this.contexts.delete(engine.id);
        return this.markUnknown(profile, launch, '受控 Chrome 已关闭，请点击重置后重新打开');
      }
      return this.checkContext(profile, existing.context, false, engine);
    });
  }

  async reset(engineOrId: number | BrowserEngine): Promise<WebReviewAvailability> {
    const engine = await this.resolveEngine(engineOrId);
    return this.runForEngine(engine.id, async () => {
      const profile = await this.ensureProfile(engine);
      await this.closePreviousLaunch(engine.id);
      return this.launchAndCheck(engine, profile, false);
    });
  }

  /** 网页主采样每次执行都用新的受控窗口，避免复用未知页面状态或残留会话。 */
  async prepareForAutomatedSampling(engineOrId: number | BrowserEngine): Promise<WebReviewAvailability> {
    const engine = await this.resolveEngine(engineOrId);
    return this.runForEngine(engine.id, async () => {
      const profile = await this.ensureProfile(engine);
      await this.closePreviousLaunch(engine.id);
      return this.launchAndCheck(engine, profile, false);
    });
  }

  async closePreviousLaunch(engineId: number): Promise<{ closed: boolean }> {
    const launch = await this.launches.findOne({ where: { engineId, launchStatus: 'running' }, order: { startedAt: 'DESC' } });
    if (!launch) return { closed: false };
    let closed = false;
    const managed = this.contexts.get(engineId);
    if (managed && managed.launchId === launch.launchId && this.sameProfilePath(managed.profilePath, launch.profilePath)) {
      await managed.context.close();
      this.contexts.delete(engineId);
      closed = true;
    } else {
      const controlled = await this.dependencies.processInspector.findControlledChrome(launch.launchId, launch.profilePath);
      if (controlled && controlled.launchId === launch.launchId && this.sameProfilePath(controlled.profilePath, launch.profilePath)) {
        await this.dependencies.processInspector.kill(controlled);
        // SIGTERM is asynchronous: only close the launch record after a fresh
        // enumeration proves that this exact controlled Chrome is gone.
        closed = await this.confirmControlledChromeExited(launch.launchId, launch.profilePath);
      }
    }
    if (closed) {
      launch.launchStatus = 'closed';
      launch.lastHeartbeatAt = new Date();
      await this.launches.save(launch);
    }
    return { closed };
  }

  /** 仅关闭带 GeoCite 精确启动标识的窗口，供引擎适配器探索前清理现场。 */
  async closeAllControlledLaunches() {
    const running = await this.launches.find({ where: { launchStatus: 'running' } });
    let closed = 0;
    for (const launch of running) {
      const result = await this.runForEngine(launch.engineId, () => this.closePreviousLaunch(launch.engineId));
      if (result.closed) closed += 1;
    }
    return { attempted: running.length, closed };
  }

  private async confirmControlledChromeExited(launchId: string, profilePath: string) {
    const remaining = await this.dependencies.processInspector.findControlledChrome(launchId, profilePath);
    return !remaining;
  }

  async deleteProfile(engineId: number) {
    const profile = await this.profiles.findOne({ where: { engineId } });
    if (!profile) return { deleted: false, engineId };
    const { closed } = await this.closePreviousLaunch(engineId);
    if (!closed) {
      const runningLaunch = await this.launches.findOne({ where: { engineId, launchStatus: 'running' }, order: { startedAt: 'DESC' } });
      if (runningLaunch) throw new ConflictException('受控 Chrome 尚未安全关闭，无法删除 Profile');
    }
    this.assertDedicatedProfilePath(profile.profilePath);
    await this.dependencies.removeDirectory(profile.profilePath);
    await this.launches.delete({ engineId });
    await this.profiles.remove(profile);
    return { deleted: true, engineId };
  }

  private async launchAndCheck(engine: BrowserEngine, profile: EngineWebReviewProfileEntity, temporary: boolean) {
    const executablePath = this.dependencies.chromePath();
    if (!executablePath) return this.updateProfile(profile, 'unavailable', '未找到本机 Chrome', 'chrome_not_found');
    const launchId = randomUUID();
    let context: BrowserContextLike | null = null;
    let launch: EngineBrowserLaunchEntity | null = null;
    try {
      context = await this.dependencies.browser.launchPersistentContext(profile.profilePath, {
        executablePath,
        headless: !temporary ? false : true,
        args: [`--geocite-review-launch-id=${launchId}`],
        ignoreDefaultArgs: systemNeedsNoSandbox() ? undefined : ['--no-sandbox'],
      });
      launch = this.launches.create({
        engineId: engine.id,
        profileId: profile.profileId,
        launchId,
        profilePath: profile.profilePath,
        currentProcessId: null,
        launchStatus: 'running',
        startedAt: new Date(),
        lastHeartbeatAt: new Date(),
      });
      await this.launches.save(launch);
      const controlled = await this.dependencies.processInspector.findControlledChrome(launchId, profile.profilePath);
      if (controlled && controlled.launchId === launchId && this.sameProfilePath(controlled.profilePath, profile.profilePath)) {
        launch.currentProcessId = controlled.pid;
        await this.launches.save(launch);
      }
      if (!temporary) this.contexts.set(engine.id, { launchId, profilePath: profile.profilePath, context });
      return await this.checkContext(profile, context, temporary, engine);
    } catch (error) {
      if (launch) {
        launch.launchStatus = 'failed';
        await this.launches.save(launch);
      }
      return this.updateProfile(profile, 'unavailable', this.controlledFailure(error), 'check_failed');
    } finally {
      if (temporary && context) {
        await context.close();
        if (launch) {
          launch.launchStatus = 'closed';
          launch.lastHeartbeatAt = new Date();
          await this.launches.save(launch);
        }
      }
    }
  }

  private async checkContext(profile: EngineWebReviewProfileEntity, context: BrowserContextLike, temporary: boolean, engine?: BrowserEngine) {
    try {
      const page = context.pages()[0] ?? await context.newPage();
      if (engine) await page.goto(this.officialLoginUrl(engine), { waitUntil: 'domcontentloaded', timeout: 10_000 });
      const currentUrl = page.url();
      if (/(captcha|verify|challenge|risk)/i.test(currentUrl)) return this.updateProfile(profile, 'unavailable', '检测到验证码或风控页面', 'challenge_detected');
      if (/(login|signin|sign-in|auth)/i.test(currentUrl)) return this.updateProfile(profile, 'pending_login', null, null);
      const sessionState = engine ? await this.knownEngineSessionState(engine, page) : null;
      if (sessionState !== null) return this.updateProfile(profile, sessionState ? 'ready' : 'pending_login', null, null);
      if (await this.hasLoginCallToAction(page)) return this.updateProfile(profile, 'pending_login', null, null);
      return this.updateProfile(profile, 'ready', null, null);
    } catch (error) {
      return this.updateProfile(profile, 'unavailable', this.controlledFailure(error), 'check_failed');
    } finally {
      // The temporary flag documents the lifecycle at this call site; closure happens in launchAndCheck's finally.
      void temporary;
    }
  }

  private async ensureProfile(engine: Pick<EngineEntity, 'id' | 'code'>) {
    const existing = await this.profiles.findOne({ where: { engineId: engine.id } });
    if (existing) return existing;
    const profileId = randomUUID();
    const profilePath = path.join(this.profilesRoot(), `engine-${engine.id}-${this.safeEngineCode(engine)}-${profileId}`);
    return this.profiles.save(this.profiles.create({
      engineId: engine.id,
      profileId,
      profilePath,
      availability: 'unavailable',
      lastCheckedAt: null,
      failureCode: null,
      lastFailureReason: null,
      lastReadyAt: null,
    }));
  }

  private async resolveEngine(engineOrId: number | BrowserEngine) {
    if (typeof engineOrId !== 'number') return engineOrId;
    const engine = await this.engines.findOne({ where: { id: engineOrId, deleted: false } });
    if (!engine) throw new Error(`Engine ${engineOrId} 不存在`);
    return engine;
  }

  private async updateProfile(profile: EngineWebReviewProfileEntity, availability: WebReviewAvailability, failureReason: string | null, failureCode: WebReviewFailureCode | null): Promise<WebReviewAvailability> {
    profile.availability = availability;
    profile.lastCheckedAt = new Date();
    profile.failureCode = failureCode;
    profile.lastFailureReason = failureReason;
    if (availability === 'ready') profile.lastReadyAt = new Date();
    await this.profiles.save(profile);
    return availability;
  }

  private async markUnknown(profile: EngineWebReviewProfileEntity, launch: EngineBrowserLaunchEntity | null, reason: string): Promise<WebReviewAvailability> {
    if (launch) {
      launch.launchStatus = 'closed';
      launch.lastHeartbeatAt = new Date();
      await this.launches.save(launch);
    }
    return this.updateProfile(profile, 'unknown', reason, null);
  }

  private toStatus(profile: EngineWebReviewProfileEntity) {
    const { availability, lastCheckedAt, failureCode, lastFailureReason, lastReadyAt } = profile;
    return { availability, lastCheckedAt, failureCode, lastFailureReason, lastReadyAt, sessionInspection: this.sessionInspection.get(profile.engineId) ?? null };
  }

  private officialLoginUrl(engine: Pick<BrowserEngine, 'code' | 'vendor' | 'homepage' | 'baseUrl'>) {
    if (engine.homepage?.trim()) return engine.homepage.trim();
    const identity = `${engine.code} ${engine.vendor}`.toLowerCase();
    if (identity.includes('openai') || identity.includes('chatgpt')) return 'https://chatgpt.com/auth/login';
    if (identity.includes('claude') || identity.includes('anthropic')) return 'https://claude.ai/login';
    if (identity.includes('gemini') || identity.includes('google')) return 'https://gemini.google.com/';
    if (identity.includes('deepseek')) return 'https://chat.deepseek.com/';
    if (identity.includes('doubao') || identity.includes('bytedance')) return 'https://www.doubao.com/chat/';
    if (identity.includes('yuanbao') || identity.includes('tencent')) return 'https://yuanbao.tencent.com/';
    if (identity.includes('kimi') || identity.includes('moonshot')) return 'https://kimi.moonshot.cn/';
    if (identity.includes('wenxin') || identity.includes('wenxiaoyan') || identity.includes('baidu')) return 'https://yiyan.baidu.com/';
    if (identity.includes('qwen') || identity.includes('alibaba')) return 'https://tongyi.aliyun.com/qianwen/';
    return engine.baseUrl?.replace(/\/$/, '') ?? 'https://www.google.com/';
  }

  private async hasLoginCallToAction(page: PageLike) {
    const texts = await page.locator('a, button, [role="button"]').allTextContents();
    return texts.some((text) => /\b(log\s*in|sign\s*in)\b|登录|登陆/iu.test(text.trim()));
  }

  private async knownEngineSessionState(engine: BrowserEngine, page: PageLike): Promise<boolean | null> {
    try {
      const adapter = this.engineSessions.find((item) => item.supports(engine));
      if (adapter instanceof KimiEngineSessionService) {
        const inspection = await adapter.inspect(page);
        this.sessionInspection.set(engine.id, inspection);
        return inspection.accountLabel === 'account' && inspection.membershipUpgradePresent;
      }
      if (adapter) return adapter.isLoggedIn(page);
    } catch {
      return false;
    }
    return null;
  }

  private profilesRoot() {
    return path.resolve(this.dependencies.appDataPath(), 'playwright-profiles');
  }

  private safeEngineCode(engine: Pick<EngineEntity, 'id' | 'code'>) {
    const normalized = engine.code.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return normalized || `engine-${engine.id}`;
  }

  private assertDedicatedProfilePath(profilePath: string) {
    const root = this.profilesRoot();
    const resolved = path.resolve(profilePath);
    if (path.dirname(resolved) !== root) throw new Error('拒绝删除专属 Chrome Profile 目录之外的路径');
  }

  private sameProfilePath(left: string, right: string) {
    return path.resolve(left) === path.resolve(right) && path.dirname(path.resolve(left)) === this.profilesRoot();
  }

  private controlledFailure(error: unknown) {
    this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return '浏览器状态检查失败，请稍后重试';
  }

  private async runForEngine<T>(engineId: number, operation: () => Promise<T>): Promise<T> {
    const previous = this.engineOperations.get(engineId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = previous.then(() => new Promise<void>((resolve) => { release = resolve; }));
    this.engineOperations.set(engineId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
      if (this.engineOperations.get(engineId) === current) this.engineOperations.delete(engineId);
    }
  }
}
