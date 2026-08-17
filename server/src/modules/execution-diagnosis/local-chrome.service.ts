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

type PageLike = { goto(url: string, options?: object): Promise<unknown>; url(): string };
type BrowserContextLike = { pages(): PageLike[]; newPage(): Promise<PageLike>; close(): Promise<void> };
type BrowserLauncher = { launchPersistentContext(userDataDir: string, options: { executablePath: string; headless: boolean; args: string[] }): Promise<BrowserContextLike> };

export type ControlledChromeProcess = { pid: number; launchId: string; profilePath: string };
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
      : { availability: 'unavailable' as const, lastCheckedAt: null, failureCode: null, lastFailureReason: null, lastReadyAt: null };
  }

  /** Executes an automated review in the same dedicated, persistent profile used for manual login. */
  async useReadyProfile<T>(engineOrId: number | Pick<EngineEntity, 'id' | 'code' | 'vendor' | 'baseUrl'>, action: (page: unknown) => Promise<T>): Promise<T> {
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

  async refresh(engineOrId: number | Pick<EngineEntity, 'id' | 'code' | 'vendor' | 'baseUrl'>): Promise<WebReviewAvailability> {
    const engine = await this.resolveEngine(engineOrId);
    return this.runForEngine(engine.id, async () => {
      const profile = await this.ensureProfile(engine);
      const existing = this.contexts.get(engine.id);
      if (existing) return this.checkContext(profile, existing.context, false, engine);
      await this.closePreviousLaunch(engine.id);
      return this.launchAndCheck(engine, profile, true);
    });
  }

  async reset(engineOrId: number | Pick<EngineEntity, 'id' | 'code' | 'vendor' | 'baseUrl'>): Promise<WebReviewAvailability> {
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
        closed = true;
      }
    }
    if (closed) {
      launch.launchStatus = 'closed';
      launch.lastHeartbeatAt = new Date();
      await this.launches.save(launch);
    }
    return { closed };
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

  private async launchAndCheck(engine: Pick<EngineEntity, 'id' | 'code' | 'vendor' | 'baseUrl'>, profile: EngineWebReviewProfileEntity, temporary: boolean) {
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

  private async checkContext(profile: EngineWebReviewProfileEntity, context: BrowserContextLike, temporary: boolean, engine?: Pick<EngineEntity, 'id' | 'code' | 'vendor' | 'baseUrl'>) {
    try {
      const page = context.pages()[0] ?? await context.newPage();
      if (engine) await page.goto(this.officialLoginUrl(engine), { waitUntil: 'domcontentloaded', timeout: 10_000 });
      const currentUrl = page.url();
      if (/(captcha|verify|challenge|risk)/i.test(currentUrl)) return this.updateProfile(profile, 'unavailable', '检测到验证码或风控页面', 'challenge_detected');
      if (/(login|signin|sign-in|auth)/i.test(currentUrl)) return this.updateProfile(profile, 'pending_login', null, null);
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

  private async resolveEngine(engineOrId: number | Pick<EngineEntity, 'id' | 'code' | 'vendor' | 'baseUrl'>) {
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

  private toStatus(profile: EngineWebReviewProfileEntity) {
    const { availability, lastCheckedAt, failureCode, lastFailureReason, lastReadyAt } = profile;
    return { availability, lastCheckedAt, failureCode, lastFailureReason, lastReadyAt };
  }

  private officialLoginUrl(engine: Pick<EngineEntity, 'code' | 'vendor' | 'baseUrl'>) {
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
