// ─── 引擎无关的数据类型与运行快照构造（三引擎共享） ───
// 豆包等引擎可在本地扩展 Citation（如加 rawHref）或 RunResult（如加 loginCheck）。
import type { EngineConfig } from './load-config.ts';

/** 引用链接（基础结构；需要原始链接等附加字段的引擎可在本地 extends） */
export interface Citation {
  title: string;
  href: string;
}

/** 单次抓取产物（回答 + 引用列表） */
export interface CrawlResult {
  response: string;
  citationLinks: Citation[];
}

/** 联网搜索开关检测状态 */
export interface SearchToggleState {
  on: boolean | null;
  className?: string;
  reason?: string;
}

/** 引用文章详情 */
export interface ArticleInfo {
  url: string;
  title: string;
  metaTitle: string;
  metaDesc: string;
  metaImage: string;
  h1: string[];
  h2: string[];
  mainText: string;
}

/** 运行配置快照（随结果一起持久化） */
export interface RunConfigSnapshot {
  runId: string;
  startedAt: string;
  config: EngineConfig;
}

/** 构造运行配置快照 */
export function makeRunConfig(runId: string, config: EngineConfig): RunConfigSnapshot {
  return { runId, startedAt: new Date().toISOString(), config };
}

/** 单问题汇总结果（问题 + 配置 + 回答 + 引用 + 文章，单文件留档） */
export interface RunResult {
  question: string;
  config: RunConfigSnapshot;
  searchToggle: SearchToggleState;
  response: string;
  citations: Citation[];
  article: ArticleInfo | null;
  finishedAt: string;
}
