import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page, ElementHandle } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEngineConfig } from '../utils/load-config.mts';
import { ensureBrowser } from '../utils/ensure-browser.mts';
import { save, log, setOutDir, getOutDir, localTimestamp } from '../utils/fs-utils.mts';
import { makeRunConfig } from '../utils/domain.mts';
import { parseCrawlCliOptions } from '../utils/parse-cli-options.ts';
import { resolveCrawlRunDirectory } from '../utils/run-directory.ts';
import type { Citation, SearchToggleState, RunResult as BaseRunResult } from '../utils/domain.mts';


async function main(): Promise<void> {
  let options;
  try { options = parseCrawlCliOptions(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
  const { questions, isDebug, outDir: outDirArg } = options;
  if (outDirArg !== undefined) {
    if (!/^[A-Za-z0-9._-]+$/.test(outDirArg)) {
      console.error('结果目录名只能包含字母/数字/点/下划线/连字符，例如: run-2026-08-19_12-18-36');
      process.exit(1);
    }
    RUN_NAME = outDirArg;
    RUN_CONFIG = makeRunConfig(outDirArg, CONFIG);
  }
  await exec(questions, isDebug);
}

/**
 * 主执行入口：批量采样。
 * @param questions 问题数组；为空时使用 config.batchQueries（批量），未配置则退回 config.query 单问题。
 * @param isDebug 调试模式（默认 true）：为真时回答等待仅 6s 基准 + ±2s 随机抖动（不等完整回答，
 *               重点抓取参考文献引用，快速验证）；为假时按 config.responseWaitMs 等待并轮询回答稳定。
 * 单问题产物在 results/run-<时间戳>/ 根目录；多问题每问一个 results/run-<时间戳>/q-NN/ 子目录，
 * 并在 run 目录根部额外生成 summary.json 汇总。
 */
export async function exec(questions: string[] = [], isDebug = true): Promise<RunResult[]> {
  debugMode = isDebug; // 调试模式开关（true=6s 快速抓取，重点参考文献引用）
  RUN_DIR = resolveCrawlRunDirectory(SCRIPT_DIR, RUN_NAME, isDebug);
  RUN_CONFIG = makeRunConfig(RUN_NAME, CONFIG);
  // 问题来源：显式传入 > config.batchQueries（批量）> config.query（单问题）
  const qs = questions.length > 0 ? questions
    : (CONFIG.batchQueries && CONFIG.batchQueries.length > 0 ? CONFIG.batchQueries : [QUERY]);
  const multi = qs.length > 1;
  log(`=== ${CONFIG.engine} 自动化抓取启动（${qs.length} 个问题${multi ? '，批量模式（config.batchQueries）' : '，单问题模式（config.query）'}）===`);
  setOutDir(RUN_DIR); // 单问题产物根目录；多问题下每问前再 setOutDir 到 q-NN/
  save('config.json', JSON.stringify(RUN_CONFIG, null, 2));
  log(`运行目录: ${RUN_DIR}`);

  // 0. 确保受控 Chrome 在线：端口无 Chrome 则自动拉起，再连接 CDP
  await ensureBrowser(CONFIG);

  // 连接 CDP
  log(`连接 CDP: ${CDP_URL}`);
  const browser: Browser = await chromium.connectOverCDP(CDP_URL);
  log(`contexts: ${browser.contexts().length}`);

  const results: RunResult[] = [];
  try {
    // 选/建页面（目标页判断用 TARGET_HOST，不硬编码引擎域名）
    const context: BrowserContext | undefined = browser.contexts()[0];
    if (!context) throw new Error('未找到浏览器上下文');
    const existing: Page[] = context.pages();
    let page: Page = existing.find(p => p.url().includes(TARGET_HOST)) ?? existing[0];
    if (!page) {
      page = await context.newPage();
    }
    currentPage = page;
    log(`当前页面: ${page.url()}`);

    for (let i = 0; i < qs.length; i++) {
      // 每个问题的产物目录：单问题在 run 根，多问题各自 q-NN/ 子目录
      setOutDir(multi ? path.join(RUN_DIR, `q-${String(i + 1).padStart(2, '0')}`) : RUN_DIR);

      const result = await runQuestion(browser, context, page, qs[i], i);
      results.push(result);

      // 批量模式：下一问之前刷新页面清空会话（避免历史上下文污染回答）
      if (multi && i < qs.length - 1) {
        log('\n刷新页面清空会话，准备下一个问题…');
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' }).catch((e: unknown) => {
          log(`刷新失败（继续尝试）: ${e instanceof Error ? e.message : e}`);
        });
        await page.waitForTimeout(3000);
      }
    }
  } finally {
    await browser.close();
  }

  // 多问题模式：在 run 目录根部输出汇总
  if (multi) {
    const summary = {
      runId: `run-${RUN_TS}`,
      engine: CONFIG.engine,
      startedAt: RUN_CONFIG.startedAt,
      finishedAt: localTimestamp(),
      count: results.length,
      items: results.map(r => ({
        index: results.indexOf(r) + 1,
        question: r.question,
        responseLength: r.response.length,
        citationsCount: r.citations.length,
        articleUrl: r.article?.url ?? null,
        articleTitle: r.article?.title ?? null,
        finishedAt: r.finishedAt,
      })),
    };
    fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    log(`已保存汇总: ${RUN_DIR}/summary.json`);
  }

  log(`=== 全部完成：${results.length} 个问题，结果目录 ${RUN_DIR} ===`);
  return results;
}

// ─── 脚本目录：crawl 为独立 ESM 子项目（.mts 源 / .mjs 产物均为 ESM），用 import.meta.dirname（Node ≥ 20.11） ───
const SCRIPT_DIR: string = import.meta.dirname;

// ─── 配置：上层 crawl/config.json（通用默认）+ 本目录 config.json（引擎差异）合并 ───
const CONFIG = loadEngineConfig(SCRIPT_DIR);
const CDP_URL = CONFIG.cdpUrl;
const TARGET_URL = CONFIG.targetUrl;
const QUERY = CONFIG.query;
const RESPONSE_WAIT_MS = CONFIG.responseWaitMs;
const [JITTER_MIN, JITTER_MAX] = CONFIG.waitJitterMs;
/** 未登录标志文案（统一字段名 loginTexts，与 deepseek/qwen 一致） */
const LOGIN_TEXTS = CONFIG.loginTexts ?? [];
/** 登录等待轮询间隔 / 超时（统一字段名，与 deepseek/qwen 一致） */
const LOGIN_POLL_MS = CONFIG.loginPollIntervalMs ?? 5000;
const LOGIN_WAIT_MS = CONFIG.loginWaitMs;
/** 实际等待时长：基准 + 随机抖动（含边界），避免被引擎识别为机器人 */
function randomWaitMs(): number {
  const lo = Math.min(JITTER_MIN, JITTER_MAX);
  const hi = Math.max(JITTER_MIN, JITTER_MAX);
  return RESPONSE_WAIT_MS + Math.floor(lo + Math.random() * (hi - lo + 1));
}
const TARGET_HOST = new URL(TARGET_URL).hostname; // 引擎域名（页面判断/内链过滤用，由 targetUrl 推导，勿硬编码）

const RUN_TS = localTimestamp().replace(' ', '_').replace(/:/g, '-');
let RUN_NAME = `run-${RUN_TS}`;
let RUN_DIR = resolveCrawlRunDirectory(SCRIPT_DIR, RUN_NAME, true);

// 本次运行使用的完整配置快照（随结果一起持久化；构造来自 utils/domain.ts）
let RUN_CONFIG = makeRunConfig(RUN_NAME, CONFIG);

// ─── 类型（公共类型来自 utils/domain.ts，此处仅保留豆包差异：rawHref / loginCheck） ───
/** 豆包引用链接：在公共 Citation 基础上增加原始 href（排查中转问题用） */
interface CitationRaw extends Citation {
  href: string;    // 清理锚点 + 解包中转后的真实 URL
  rawHref: string; // 页面上的原始 href（排查中转问题用）
}

interface CrawlResult {
  response: string;
  citationLinks: CitationRaw[];
}

/** 登录预检结果 */
interface LoginCheckResult {
  required: boolean; // true = 本次运行因未登录而中断
  detail: string;    // 检测到/等待/通过 的说明
}

// 汇总结果（问题 + 配置快照 + 登录预检 + 回答引用文章，单文件留档）
interface RunResult extends Omit<BaseRunResult, 'citations'> {
  loginCheck: LoginCheckResult;
  citations: CitationRaw[];
}

// ─── 工具函数（log/save 来自 utils/fs-utils.ts，此处仅保留豆包特有的截图封装） ───
/** 截图产物（每个文件只打一条日志） */
async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await page.screenshot({ path: path.join(getOutDir(), name), fullPage });
  log(`已保存: ${name}`);
}

/** 是否有可见的模态弹窗（fixed 定位元素 offsetParent 为 null，须用 getComputedStyle/尺寸判断） */
async function hasVisibleModal(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const modals = document.querySelectorAll('[role="dialog"], [data-slot="dialog-content"], [class*="modal"], [class*="dialog"]');
    for (const m of modals) {
      const el = m as HTMLElement;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 100 && r.height > 100) return true; // 全屏/大弹窗才需要处理（小浮层不影响点击）
    }
    return false;
  });
}

/**
 * 关闭可见模态弹窗（豆包常见"下载电脑版"营销弹窗，会拦截输入框点击）：
 * Escape → 点 aria-label=关闭 → 点"下次提醒我" → JS 强制从 DOM 移除。
 */
async function dismissModals(page: Page): Promise<void> {
  for (let round = 0; round < 2; round++) {
    if (!(await hasVisibleModal(page))) return;
    log(`检测到模态弹窗（第 ${round + 1} 轮），尝试关闭…`);
    // 1. Escape
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
    if (!(await hasVisibleModal(page))) { log('✅ Escape 关闭弹窗'); return; }
    // 2. 点 aria-label=关闭 / 关闭按钮
    const closeBtn = page.locator(
      '[role="dialog"] [aria-label*="关闭"], [role="dialog"] [aria-label*="close"], [role="dialog"] [aria-label*="Close"], [role="dialog"] [class*="close"]',
    ).first();
    await closeBtn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
    if (!(await hasVisibleModal(page))) { log('✅ 关闭按钮关闭弹窗'); return; }
    // 3. 点"下次提醒我"类文字按钮
    const later = page.locator('[role="dialog"] button, [role="dialog"] [role="button"]').filter({ hasText: /下次提醒|稍后|暂不|取消|我知道了|关闭/ }).first();
    await later.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
    if (!(await hasVisibleModal(page))) { log('✅ 文字按钮关闭弹窗'); return; }
    // 4. JS 强制移除
    log('常规方式未能关闭弹窗，强制从 DOM 移除…');
    await page.evaluate(() => {
      document.querySelectorAll('[role="dialog"], [data-slot="dialog-content"], [class*="modal"]').forEach(m => {
        (m as HTMLElement).remove();
      });
    });
    await page.waitForTimeout(400);
  }
}

/**
 * 找输入框：先试带 placeholder 的 textarea，再试富文本 contenteditable 编辑器。
 * 两种都是"输入框"的常见实现，靠可见性筛选，不依赖任何引擎特定文案/class。
 */
async function findInputBox(page: Page): Promise<ElementHandle<HTMLElement>> {
  const selectors = ['textarea[placeholder]', '[contenteditable="true"]'];
  for (const sel of selectors) {
    const el = await page.waitForSelector(sel, { timeout: 5000, state: 'visible' }).catch(() => null);
    if (el) return el as ElementHandle<HTMLElement>;
  }
  throw new Error(`未找到输入框（依次尝试: ${selectors.join(' / ')}）`);
}

/**
 * 登录预检：扫描页面上可见的按钮/链接/输入框占位符，是否出现"未登录"标志文案。
 * 文案来自 config.loginTexts（如 "登录"/"扫码登录"/"验证码"），代码不内置。
 * 返回命中的元素描述列表（空数组 = 已登录或未发现登录墙）。
 */
async function checkLoginState(page: Page, texts: string[]): Promise<string[]> {
  return page.evaluate((ts: string[]) => {
    const visible = (el: Element): boolean => el.getClientRects().length > 0;
    const match = (t: string, text: string, isPlaceholder: boolean): boolean => {
      if (t === '退出登录') return false; // 登录态菜单项，不算未登录
      if (isPlaceholder) return t.includes(text);
      return t === text || t.endsWith(text) || t.startsWith(text + '/') || t.startsWith(text + ' ');
    };
    const hits: string[] = [];
    document.querySelectorAll('button, a, [role="button"], input[placeholder]').forEach(el => {
      if (!visible(el)) return;
      const isPh = el.tagName.toLowerCase() === 'input';
      const t = (isPh ? el.getAttribute('placeholder') : el.textContent || '').trim().replace(/\s+/g, '');
      if (!t) return;
      for (const text of ts) {
        if (match(t, text, isPh)) {
          hits.push(`${el.tagName.toLowerCase()}:${t.slice(0, 20)}`);
          break;
        }
      }
    });
    return hits;
  }, texts);
}

// ─── 联网搜索开关：检测 + 安全点击（与 deepseek 修复一致） ───
// 背景：侧边栏历史会话标题 / 恢复的问题气泡可能含开关文案（如长提问「请联网搜索…」），
// 因此检测必须扫描全部 XPath 命中、任一命中显示激活态即视为开启，绝不能只看第一个命中
// （原实现首个命中非开关时早退误判 on:false，进而点击把已开启的开关关掉，污染运行结果）。
const TOGGLE_DEPTH = 6;

/**
 * 扫描全部 XPath 命中：任一命中（或其祖先链）显示激活态（selected/active/checked 类或 aria-pressed=true）
 * 即视为已开启。无命中返回 on:null；有命中但均未激活返回 on:false。
 */
async function detectSearchToggle(page: Page, xpathExpr: string): Promise<SearchToggleState> {
  return page.evaluate(({ expr, depth }: { expr: string; depth: number }) => {
    const result = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    let matched = 0;
    for (let i = 0; i < result.snapshotLength; i++) {
      const el = result.snapshotItem(i) as HTMLElement | null;
      if (!el) continue;
      matched++;
      let cur: HTMLElement | null = el;
      for (let d = 0; d < depth && cur; d++) {
        const cls = (cur.className || '').toString();
        if (cls.includes('selected') || cls.includes('active') || cls.includes('checked')
          || cur.getAttribute('aria-pressed') === 'true') {
          return { on: true, className: cls.slice(0, 200), reason: `命中 ${matched} 处，第 ${i + 1} 处显示激活` };
        }
        cur = cur.parentElement;
      }
    }
    if (matched === 0) return { on: null, reason: '未找到联网搜索开关文字（部分引擎按查询内容自动联网）' };
    return { on: false, reason: `匹配到 ${matched} 处文字，但均未显示激活态` };
  }, { expr: xpathExpr, depth: TOGGLE_DEPTH });
}

/** 点击联网搜索开关：点开关文字（兜底 getByText）；失败抛错由调用方记录 */
async function clickSearchToggle(page: Page, toggleTexts: string[]): Promise<void> {
  const text = toggleTexts[0];
  const attempts: Array<() => Promise<void>> = [
    async () => { await page.getByText(text, { exact: false }).first().click({ timeout: 3000 }); },
  ];
  let lastErr: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      await attempts[i]();
      await page.waitForTimeout(600);
      log('已点击联网搜索开关');
      return;
    } catch (e) {
      lastErr = e;
      log(`点击联网搜索开关失败: ${e instanceof Error ? e.message : e}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('点击联网搜索开关失败');
}

/**
 * 确保联网搜索开启：检测 → 未开启则点击 → 复查（点击可能误关已开启的开关，需恢复）。
 * 返回的 searchState 记录最终状态与动作（action），随 result.json 持久化。
 */
async function ensureSearchToggle(page: Page, xpathExpr: string, toggleTexts: string[]): Promise<SearchToggleState> {
  const state = await detectSearchToggle(page, xpathExpr);
  log(`联网搜索状态: ${JSON.stringify(state)}`);

  if (state.on === true) {
    state.action = 'none';
    return state;
  }
  if (state.on === null) {
    state.action = 'none';
    log(`⚠️ 未找到联网搜索开关文字（${state.reason ?? ''}），跳过开关操作（部分引擎按提问自动联网）`);
    return state;
  }

  // on === false：尝试点击开启，并复查确认
  log('联网搜索未开启，尝试点击…');
  try {
    await clickSearchToggle(page, toggleTexts);
  } catch (e) {
    state.action = 'click-failed';
    state.reason = `点击失败: ${e instanceof Error ? e.message : e}`;
    log(`⚠️ ${state.reason}`);
    return state;
  }

  const after = await detectSearchToggle(page, xpathExpr);
  if (after.on === true) {
    log('✅ 点击后联网搜索已开启');
    after.action = 'clicked';
    return after;
  }
  // 复查未开启：可能误把已开启的开关点关了（检测误判时）或点击未生效 → 再点一次恢复
  log(`点击后复查仍未开启（${JSON.stringify(after)}），重试一次…`);
  try {
    await clickSearchToggle(page, toggleTexts);
  } catch (e) {
    after.action = 'click-failed';
    after.reason = `复查后重试点击失败: ${e instanceof Error ? e.message : e}`;
    log(`⚠️ ${after.reason}`);
    return after;
  }
  const after2 = await detectSearchToggle(page, xpathExpr);
  if (after2.on === true) {
    log('✅ 重试后联网搜索已开启');
    after2.action = 'clicked-after-retry';
    return after2;
  }
  after2.action = 'click-failed';
  after2.reason = `点击两次后仍未开启（${after2.reason ?? ''}），继续尝试（豆包可能按提问自动联网）`;
  log(`⚠️ ${after2.reason}`);
  return after2;
}

// 失败时供兜底逻辑截图用的当前页引用
// 调试模式开关：由 exec(isDebug) 设置，runQuestion 读取（true=6s 快速抓取，重点参考文献引用；false=完整等待）
let debugMode = false;

let currentPage: Page | null = null;

/**
 * 单次提问全流程：导航 → 弹窗关闭 → 登录预检 → 联网开关 → 输入 → 发送 → 等待 → 提取回答/引用。
 * 产物（question.txt / 截图 / response-text.txt / citation-links.json / result.json）落到当前输出目录（getOutDir()）。
 * 注意：不点击引用 URL——引用链接中常混有死链/错链，抓取重点是回答文本与引用列表本身（article 置 null）。
 */
async function runQuestion(browser: Browser, context: BrowserContext, page: Page, question: string, qIndex: number): Promise<RunResult> {
  log(`\n[${qIndex + 1}] 问题: ${question}`);
  save('question.txt', question);

  // 导航到目标站点（多问题模式下 exec 已在上轮末尾刷新，这里若已离开目标页则再导航）
  if (!page.url().includes(TARGET_HOST)) {
    log(`导航到 ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  } else {
    log(`已在 ${TARGET_HOST} 页面`);
  }
  await page.waitForTimeout(5000);
  // 豆包会弹"下载电脑版"营销弹窗（全屏 dialog 拦截输入框点击），先关闭
  await dismissModals(page);
  await shot(page, '01-loaded.png');

  // 登录预检：未登录时截图提示并轮询等待用户登录，超时才停止（不产出劣质数据）
  let loginCheck: LoginCheckResult = { required: false, detail: 'config.loginTexts 未配置，跳过登录预检' };
  if (LOGIN_TEXTS.length > 0) {
    const pollMs = LOGIN_POLL_MS;
    const maxMs = LOGIN_WAIT_MS;
    let hits = await checkLoginState(page, LOGIN_TEXTS);
    if (hits.length > 0) {
      log(`⚠️ 检测到未登录（标志: ${hits.join('; ')}），已截图提示。请在 Chrome 窗口中登录/输入验证码…`);
      await shot(page, '00-login-check.png');
      const startAt = Date.now();
      while (Date.now() - startAt < maxMs) {
        await page.waitForTimeout(pollMs);
        hits = await checkLoginState(page, LOGIN_TEXTS);
        if (hits.length === 0) break;
        log(`⏳ 仍在等待登录…（${Math.round((Date.now() - startAt) / 1000)}s / ${maxMs / 1000}s）`);
      }
      if (hits.length > 0) {
        log(`❌ 等待登录超时（${maxMs / 1000}s），停止抓取。登录完成后重新运行即可。`);
        throw new Error(`等待登录超时（${maxMs / 1000}s），未登录状态下停止抓取。请登录后重跑。`);
      }
      loginCheck = { required: false, detail: '检测到未登录，等待用户登录完成后继续' };
      log('✅ 检测到已登录，继续抓取');
    } else {
      loginCheck = { required: false, detail: `未检测到未登录标志（文案: ${LOGIN_TEXTS.join('/')}）` };
      log(`登录预检通过: ${loginCheck.detail}`);
    }
  } else {
    log(`登录预检跳过: ${loginCheck.detail}`);
  }

  // 联网搜索开关检查（文案全部来自上层 config.json searchToggleTexts[engine]）
  const toggleTexts: string[] = CONFIG.searchToggleTexts ?? [];
  let searchState: SearchToggleState;
  if (toggleTexts.length === 0) {
    searchState = { on: null, reason: 'config.searchToggleTexts 未配置，跳过开关检查' };
    log(`联网搜索状态: ${JSON.stringify(searchState)}`);
  } else {
    const xpathExpr = `//text()[${toggleTexts.map(t => `contains(., "${t}")`).join(' or ')}]/..`;
    log(`检查联网搜索开关状态（匹配文案: ${toggleTexts.join('/')}）…`);
    searchState = await ensureSearchToggle(page, xpathExpr, toggleTexts);
    log(`联网搜索最终状态: ${JSON.stringify(searchState)}`);
  }

  // 找输入框并输入查询（textarea 用 fill，富文本编辑器用键盘模拟）
  // 输入前再关一次弹窗（开关点击过程可能触发新的营销弹窗）
  await dismissModals(page);
  const inputEl = await findInputBox(page);
  const tag = await inputEl.evaluate(el => el.tagName.toLowerCase());
  log(`已找到输入框 (${tag})，输入查询…`);
  await inputEl.click();
  if (tag === 'textarea') {
    const ta = inputEl as ElementHandle<HTMLTextAreaElement>;
    await ta.fill('');
    await ta.fill(question);
  } else {
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    await page.keyboard.type(question, { delay: 15 });
  }
  await page.waitForTimeout(500);
  await shot(page, '02-typed.png');

  // 发送：Enter（对各家聊天 UI 通用）
  log('按 Enter 发送…');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  await shot(page, '03-sent.png');

  // 等回答：调试模式（isDebug=true）固定 6s 基准 + ±2s 随机抖动（防风控，不等完整回答，重点抓参考文献引用）；
  // 正式模式按 config.responseWaitMs（30s 基准 + 抖动）等待并轮询检测回答稳定。
  if (debugMode) {
    const debugWaitMs = 6000 + Math.floor(-2000 + Math.random() * 4001);
    log(`🛠️ 调试模式（isDebug=true）：等待 ${(debugWaitMs / 1000).toFixed(1)} 秒后提取（6s 基准 ± 2s 抖动，重点抓取参考文献引用）`);
    await page.waitForTimeout(debugWaitMs);
  } else {
    const waitMs = randomWaitMs();
    log(`等待 ${(waitMs / 1000).toFixed(1)} 秒让回答生成（基准 ${RESPONSE_WAIT_MS / 1000}s + 抖动 ${((waitMs - RESPONSE_WAIT_MS) / 1000).toFixed(1)}s）…`);
    await page.waitForTimeout(waitMs);

    const MAX_ANSWER_WAIT_MS = RESPONSE_WAIT_MS + JITTER_MAX + 45_000; // 轮询上限：基准+最大抖动+45s 余量
    const STABLE_ROUNDS = 3; // 连续 3 次（间隔 2s）文本长度不变视为回答完成
    const pollStart = Date.now();
    let lastLen = -1;
    let stable = 0;
    while (Date.now() - pollStart < MAX_ANSWER_WAIT_MS) {
      await page.waitForTimeout(2000);
      const len = await page.evaluate(() => {
        const lens = [...document.querySelectorAll('[class*="md-box"], [class*="markdown"], [class*="message"], [class*="answer"]')]
          .map(el => (el.textContent || '').trim().length)
          .filter(l => l > 100);
        return lens.length ? Math.max(...lens) : 0;
      });
      if (len > 0 && len === lastLen) {
        stable++;
        if (stable >= STABLE_ROUNDS) {
          log(`✅ 回答已稳定（${len} 字符），提前结束等待`);
          break;
        }
      } else {
        stable = 0;
      }
      lastLen = len;
    }
    if (stable < STABLE_ROUNDS) log(`⚠️ 等待 ${((Date.now() - pollStart) / 1000).toFixed(0)}s 回答仍未完全稳定，按当前内容提取`);
  }

  await shot(page, '04-response.png', true);

  // 提取回答 + 引用链接（host/query 作为参数传入浏览器上下文，不在 evaluate 里引用外部变量）
  log('提取回答内容和引用链接…');
  const result: CrawlResult = await page.evaluate(({ host, queryPrefix }: { host: string; queryPrefix: string }) => {
    const data: CrawlResult = { response: '', citationLinks: [] };

    // 8.1 回答全文：优先纯回答 markdown 容器（md-box/markdown），排除会话/滚动容器（含用户问题）。
    // 兜底：遍历 div/article/section/main，排除含输入框、含问题原文的容器，取最长。
    const inputBox = document.querySelector('textarea[placeholder]')
      ?? document.querySelector('[contenteditable="true"]');
    const SESSION_HINTS = ['message-list', 'scroller', 'conversation', 'chat-round', 'thread'];
    const pickLongest = (els: NodeListOf<Element>): string => {
      let best = '';
      for (const el of els) {
        const cls = (el.className || '').toString();
        if (SESSION_HINTS.some(h => cls.includes(h))) continue;
        if (inputBox && el !== inputBox && (el.contains(inputBox) || inputBox.contains(el))) continue;
        const txt = (el.textContent || '').trim();
        if (txt.length < 200) continue;
        if (queryPrefix && txt.includes(queryPrefix)) continue;
        if (txt.length > best.length) best = txt;
      }
      return best;
    };
    let resp = pickLongest(document.querySelectorAll('[class*="md-box"], [class*="markdown"]'));
    if (!resp) resp = pickLongest(document.querySelectorAll('div, article, section, main'));
    if (!resp) resp = document.body.innerText.slice(0, 8000);

    // 8.1b 剔除豆包「联网搜索摘要」段（如"明确搜索任务与要求 我来联网搜索一下…"），
    // 从正式回答起始标记处截取（常见"根据联网搜索结果/根据搜索结果…"）；未命中则保留全文。
    const answerMarkers = ['根据联网搜索结果', '根据搜索结果', '根据网络搜索结果', '根据以上信息', '根据以上资料', '以下是根据', '以下是联网搜索'];
    let cut = -1;
    for (const m of answerMarkers) {
      const i = resp.indexOf(m);
      if (i >= 0 && (cut < 0 || i < cut)) cut = i;
    }
    if (cut > 0 && cut < resp.length * 0.7) resp = resp.slice(cut);
    data.response = resp;

    // 8.2 引用：
    //  (a) 外链 <a> → 清理 #N 锚点 → 解包中转链接 → 按清理后 URL 去重
    //  (b) 豆包联网回答的引用常渲染为纯文本「来源：站点名」（无 <a> 链接、无 URL）→ 从 LI 提取站点名（href 留空）
    const unwrap = (href: string): string => {
      try {
        const u = new URL(href);
        for (const k of ['target', 'url', 'link', 'u']) {
          const v = u.searchParams.get(k);
          if (!v) continue;
          const dec = decodeURIComponent(v);
          if (/^https?:\/\//.test(dec)) return dec;
        }
      } catch { /* 非法 URL 原样返回 */ }
      return href;
    };
    const isInternal = (href: string): boolean => {
      try { return new URL(href).hostname.includes(host); } catch { return true; }
    };
    const seen = new Set<string>();
    document.querySelectorAll('a[href]').forEach(a => {
      const anchor = a as HTMLAnchorElement;
      const rawHref = anchor.href || '';
      if (!rawHref.startsWith('http')) return;
      const cleanHref = unwrap(rawHref.replace(/#\d+$/, ''));
      if (isInternal(cleanHref)) return;
      if (seen.has(cleanHref)) return; // 引用按 URL 去重
      seen.add(cleanHref);

      // 向上遍历卡片容器取标题
      let title = '';
      let cur: HTMLElement | null = a as HTMLElement;
      for (let d = 0; d < 6 && cur; d++) {
        cur = cur.parentElement;
        if (!cur) break;
        const t = (cur.innerText || '').trim();
        if (t.length > 5 && t.length < 200 && !t.includes('\n\n')) {
          const firstLine = t.split('\n').filter(Boolean)[0] || '';
          if (firstLine && firstLine.length < 100) { title = firstLine; break; }
        }
      }
      if (!title) title = a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent?.trim().slice(0, 80) || '';

      data.citationLinks.push({ title, href: cleanHref, rawHref });
    });

    // (b) 纯文本「来源」列表（LI 内以"来源："开头，后续为站点名）
    document.querySelectorAll('li').forEach(li => {
      const t = (li.innerText || '').trim().replace(/\s+/g, ' ');
      if (!t) return;
      const m = t.match(/^来源[：:]\s*(.+)$/);
      if (!m) return;
      const name = m[1].trim().slice(0, 80);
      if (!name) return;
      if (seen.has(`text:${name}`)) return; // 按站点名去重
      seen.add(`text:${name}`);
      data.citationLinks.push({ title: `来源：${name}`, href: '', rawHref: '' });
    });

    return data;
  }, { host: TARGET_HOST, queryPrefix: question.slice(0, 15) });

  log(`回答长度: ${result.response.length} 字符`);
  log(`引用链接数: ${result.citationLinks.length}`);
  save('response-text.txt', result.response);
  save('citation-links.json', JSON.stringify(result.citationLinks, null, 2));
  log(`回答预览:\n${result.response.slice(0, 300)}\n...`);

  // 不点击/打开引用 URL（引用链接中常混有死链/错链，抓取重点是回答文本与引用列表本身），
  // 直接保存回答 + 引用（article 置 null）
  const final: RunResult = {
    question,
    config: RUN_CONFIG,
    loginCheck,
    searchToggle: searchState,
    response: result.response,
    citations: result.citationLinks,
    article: null,
    finishedAt: localTimestamp(),
  };
  save('result.json', JSON.stringify(final, null, 2));
  return final;
}


/** 失败兜底：截图存证 + 检测登录/验证码特征，给出人工介入提示 */
async function failWithEvidence(e: unknown): Promise<never> {
  const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  console.error('抓取失败:', msg);
  fs.mkdirSync(RUN_DIR, { recursive: true });
  save('99-error.txt', `${localTimestamp()}\n${msg}`);

  // 验证码/登录特征关键词（页面文本命中即提示人工处理）
  const CAPTCHA_PATTERNS = [
    '登录', '扫码', '验证码', '滑块', '拖动', '拼图', '安全验证', '身份验证',
    '人机验证', '异常', 'captcha', 'verify', 'verification', 'slider', 'puzzle',
  ];

  let captchaHit: string | null = null;
  if (currentPage && !currentPage.isClosed()) {
    try {
      await currentPage.screenshot({ path: path.join(RUN_DIR, '99-error.png') });
      log('已保存失败截图: 99-error.png');
      const bodyText = await currentPage.evaluate(() => document.body.innerText.slice(0, 3000));
      captchaHit = CAPTCHA_PATTERNS.find(p => bodyText.toLowerCase().includes(p.toLowerCase())) ?? null;
    } catch (shotErr) {
      log(`失败截图未成功: ${shotErr instanceof Error ? shotErr.message : shotErr}`);
    }
  }

  if (captchaHit) {
    console.error('\n' + [
      '╔══════════════════════════════════════════════════╗',
      '║  ⛔ 疑似遇到登录/验证码拦截（人工介入 needed）      ║',
      `║  页面命中特征词: ${captchaHit}`,
      `║  失败截图: ${RUN_DIR}/99-error.png`,
      '║  请在 Chrome 窗口手工完成验证后重跑脚本。           ║',
      '╚══════════════════════════════════════════════════╝',
    ].join('\n'));
  }
  process.exit(1);
}


// 主入口：仅当作为主模块直接运行（node crawl.mts / ./run.sh）时执行 main()；
// 被 import 作为库（如批量调用 exec([...]) 或后端 provider 动态导入 .mjs）时不应触发运行。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(failWithEvidence);
}
