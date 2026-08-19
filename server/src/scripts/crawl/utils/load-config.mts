// ─── 引擎配置加载器（三引擎共享） ───
// 配置分层：
//   上层 crawl/config.json  —— 通用/共享默认值（host、chromeBin、profileRoot、query、等待参数、
//                               targetUrls[engine]、searchToggleTexts[engine] 等）
//   引擎目录 config.json   —— 引擎差异（engine、debugPort、profileName、登录检测相关）
// 加载顺序：上层合并引擎，引擎字段覆盖上层同名键。各方法避免在脚本里散落推导逻辑。
import fs from 'node:fs';
import path from 'node:path';

export interface EngineConfig {
  engine: string;
  host: string;
  debugPort: number;
  /** CDP 调试地址，由 host:debugPort 推导 */
  cdpUrl: string;
  /** 引擎首页，从上层的 targetUrls[engine] 取 */
  targetUrl: string;
  profileRoot: string;
  profileName: string;
  /** profile 完整目录 = profileRoot + profileName */
  profileDir: string;
  chromeBin: string;
  query: string;
  /** 批量采样问题列表（可选，来自上层 config.json）：exec() 未传问题时优先使用；未配置则退回 [query] 单问题 */
  batchQueries?: string[];
  responseWaitMs: number;
  waitJitterMs: [number, number];
  loginWaitMs: number;
  /** 登录等待轮询间隔（毫秒，仅部分引擎使用，如豆包；默认 5000） */
  loginPollIntervalMs?: number;
  searchToggleTexts: string[];
  loginTexts?: string[];
  loginUrlPatterns?: string[];
  /** 引擎 config 里的其他差异项（如豆包 loginCheck、千问 loginDetectTexts）原样透传，可按需取用 */
  [key: string]: unknown;
}

/** 读取 JSON 配置，文件不存在/损坏返回 {}（由必填校验兜底报错） */
function readJson(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function requireValue<T>(name: string, value: T | undefined): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`配置缺失: ${name}（上层 crawl/config.json 或引擎 config.json）`);
  }
  return value;
}

/** 加载并合并引擎配置：engineDir 为引擎目录（如 deepseek/），上层取其父目录 config.json */
export function loadEngineConfig(engineDir: string): EngineConfig {
  const top = readJson(path.join(engineDir, '..', 'config.json'));
  const own = readJson(path.join(engineDir, 'config.json'));

  const engine = requireValue<string>('engine', (own.engine as string) ?? (top.engine as string));
  const debugPorts = (top.debugPorts ?? {}) as Record<string, number>;
  const targetUrls = (top.targetUrls ?? {}) as Record<string, string>;
  const toggleMap = (top.searchToggleTexts ?? {}) as Record<string, string[]>;

  const host = requireValue<string>('host', (own.host as string) ?? (top.host as string));
  const debugPort = requireValue<number>('debugPort', (own.debugPort as number) ?? debugPorts[engine]);
  const profileRoot = requireValue<string>('profileRoot', top.profileRoot as string);
  const profileName = requireValue<string>('profileName', own.profileName as string);

  return {
    engine,
    host,
    debugPort,
    cdpUrl: (own.cdpUrl as string) ?? `http://${host}:${debugPort}`,
    targetUrl: (own.targetUrl as string) ?? requireValue<string>(`targetUrls.${engine}`, targetUrls[engine]),
    profileRoot,
    profileName,
    profileDir: path.join(profileRoot, profileName),
    chromeBin: requireValue<string>('chromeBin', (own.chromeBin as string) ?? (top.chromeBin as string)),
    query: requireValue<string>('query', (own.query as string) ?? (top.query as string)),
    batchQueries: ((own.batchQueries as string[] | undefined) ?? (top.batchQueries as string[] | undefined)),
    responseWaitMs: requireValue<number>('responseWaitMs', (own.responseWaitMs as number) ?? (top.responseWaitMs as number)),
    waitJitterMs: ((own.waitJitterMs as [number, number]) ?? (top.waitJitterMs as [number, number]) ?? [0, 0]),
    loginWaitMs: ((own.loginWaitMs as number) ?? (top.loginWaitMs as number) ?? 300_000),
    loginPollIntervalMs: (own.loginPollIntervalMs as number | undefined) ?? (top.loginPollIntervalMs as number | undefined),
    searchToggleTexts: (own.searchToggleTexts as string[]) ?? toggleMap[engine] ?? ['智能搜索', '联网搜索'],
    loginTexts: own.loginTexts as string[] | undefined,
    loginUrlPatterns: own.loginUrlPatterns as string[] | undefined,
    // 引擎 config 其余字段（loginCheck/loginDetectTexts 等）原样透传，供各引擎脚本按需取用
    ...own,
  };
}

/** profile 根目录（所有引擎共用，来自上层 config.json） */
export function getProfileRoot(cfg: Pick<EngineConfig, 'profileRoot'>): string {
  return cfg.profileRoot;
}

/** 引擎 profile 完整目录 = profileRoot/profileName */
export function getProfileDir(cfg: Pick<EngineConfig, 'profileRoot' | 'profileName'>): string {
  return path.join(cfg.profileRoot, cfg.profileName);
}

/** CDP 地址 = host:debugPort（cdpUrl 未显式配置时） */
export function getCdpUrl(cfg: Pick<EngineConfig, 'host' | 'debugPort'>): string {
  return `http://${cfg.host}:${cfg.debugPort}`;
}
