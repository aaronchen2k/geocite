import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page, ElementHandle } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEngineConfig } from '../utils/load-config.mts';
import { ensureBrowser } from '../utils/ensure-browser.mts';
import { save, saveResult, log, setOutDir, getOutDir, localTimestamp } from '../utils/fs-utils.mts';
import { makeRunConfig } from '../utils/domain.mts';
import { parseCrawlCliOptions } from '../utils/parse-cli-options.ts';
import { resolveCrawlRunDirectory } from '../utils/run-directory.ts';
import { writeCrawlerErrorRecord } from '../utils/error-record.ts';
import type { Citation, CrawlResult, SearchToggleState, RunResult } from '../utils/domain.mts';


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
  RUN_DIR = resolveCrawlRunDirectory(SCRIPT_DIR, RUN_NAME, CONFIG.engine);
  RUN_CONFIG = makeRunConfig(RUN_NAME, CONFIG);
  // 问题来源：显式传入 > config.batchQueries（批量）> config.query（单问题）
  const qs = questions.length > 0 ? questions
    : (CONFIG.batchQueries && CONFIG.batchQueries.length > 0 ? CONFIG.batchQueries : [QUERY]);
  const multi = qs.length > 1;
  log(`=== DeepSeek 自动化抓取启动（${qs.length} 个问题${multi ? '，批量模式（config.batchQueries）' : '，单问题模式（config.query）'}）===`);
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
    // 选/建页面（整批共用同一页面）
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
/** 实际等待时长：基准 + 随机抖动（含边界），避免被引擎识别为机器人 */
function randomWaitMs(): number {
  const lo = Math.min(JITTER_MIN, JITTER_MAX);
  const hi = Math.max(JITTER_MIN, JITTER_MAX);
  return RESPONSE_WAIT_MS + Math.floor(lo + Math.random() * (hi - lo + 1));
}
const TARGET_HOST = new URL(TARGET_URL).hostname; // 引擎域名（页面判断/内链过滤用，勿硬编码）

const RUN_TS = localTimestamp().replace(' ', '_').replace(/:/g, '-');
let RUN_NAME = `run-${RUN_TS}`;
let RUN_DIR = resolveCrawlRunDirectory(SCRIPT_DIR, RUN_NAME, CONFIG.engine);

// 本次运行使用的配置（随结果一起持久化；类型/构造来自 utils/domain.ts）
let RUN_CONFIG = makeRunConfig(RUN_NAME, CONFIG);

/** 登录预检：先查 URL 路径，再扫可见 button/a 的文字。命中即返回命中文本。规则：未登录必须停下等人工处理，绝不带病继续 */
async function checkNotLoggedIn(page: Page): Promise<string | null> {
  // 1) URL 路径匹配：未登录通常整页跳转到 /sign_in 之类的登录路由（最稳的信号）
  const urlPatterns = CONFIG.loginUrlPatterns ?? ['sign_in', 'login'];
  const urlHit = urlPatterns.find(p => page.url().toLowerCase().includes(p));
  if (urlHit) return `url:${urlHit}`;

  // 2) 可见的 button/a/role=button 元素，文字短且命中登录文案 → 判定未登录
  const textHit = await page.evaluate((texts: string[]) => {
    const els = document.querySelectorAll('button, a, [role="button"], [role="dialog"] *');
    for (const el of els) {
      const html = el as HTMLElement;
      const style = window.getComputedStyle(html);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = html.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const txt = (html.innerText || html.textContent || '').trim();
      if (!txt || txt.length > 16) continue;
      if (txt.includes('退出') || txt.includes('已登录')) continue;
      const hit = texts.find(t => txt === t || txt.startsWith(t));
      if (hit) return hit;
    }
    return null;
  }, CONFIG.loginTexts ?? ['登录', '扫码登录', '登录/注册', '手机号登录', '验证码登录', 'Log in']);
  return textHit;
}

/** 未登录 → 截图 + 醒目提示 + 轮询等待人工登录；超时抛错退出 */
async function ensureLoggedIn(page: Page): Promise<void> {
  const hit = await checkNotLoggedIn(page);
  if (!hit) {
    log('✅ 登录预检通过（未发现登录拦截）');
    return;
  }
  await page.screenshot({ path: path.join(getOutDir(), '00-login-required.png') });
  console.log('\n' + [
    '╔══════════════════════════════════════════════════╗',
    '║  ⛔ 检测到未登录 / 登录弹窗（需要人工介入）        ║',
    `║  命中特征: ${hit}`,
    `║  截图: ${getOutDir()}/00-login-required.png`,
    '║  已暂停！请在 Chrome 窗口完成登录/验证码，          ║',
    '║  脚本会自动检测登录完成后继续。                     ║',
    '╚══════════════════════════════════════════════════╝',
  ].join('\n'));

  const waitMs = CONFIG.loginWaitMs ?? 300_000;
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    await page.waitForTimeout(5000);
    const still = await checkNotLoggedIn(page);
    if (!still) {
      log('✅ 检测到登录完成，继续执行');
      return;
    }
  }
  throw new Error(`等待登录超时（${waitMs / 60000} 分钟），已放弃本次运行。请登录后重跑。`);
}

// ─── 联网搜索开关：检测 + 安全点击 ───
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
    if (matched === 0) return { on: null, reason: '未找到联网搜索开关文字' };
    return { on: false, reason: `匹配到 ${matched} 处文字，但均未显示激活态` };
  }, { expr: xpathExpr, depth: TOGGLE_DEPTH });
}

/**
 * 点击联网搜索开关：优先点 toggle 按钮本体（class 含 ds-toggle-button，避免误点侧边栏同文字链接），
 * 兜底用 getByText 点文字。两种方式都失败则抛错（由调用方记录 click-failed）。
 */
async function clickSearchToggle(page: Page, toggleTexts: string[]): Promise<void> {
  const text = toggleTexts[0];
  const attempts: Array<() => Promise<void>> = [
    async () => {
      await page.locator('[class*="toggle"]', { hasText: text }).first().click({ timeout: 3000 });
    },
    async () => {
      await page.getByText(text, { exact: false }).first().click({ timeout: 3000 });
    },
  ];
  let lastErr: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      await attempts[i]();
      await page.waitForTimeout(600); // 等切换动画/状态更新
      log(`已点击联网搜索开关（方式 ${i + 1}）`);
      return;
    } catch (e) {
      lastErr = e;
      log(`点击联网搜索开关（方式 ${i + 1}）失败: ${e instanceof Error ? e.message : e}`);
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
  after2.reason = `点击两次后仍未开启（${after2.reason ?? ''}），继续尝试（DeepSeek 可能按提问自动联网）`;
  log(`⚠️ ${after2.reason}`);
  return after2;
}

// 失败时供兜底逻辑截图用的当前页引用
// 调试模式开关：由 exec(isDebug) 设置，runQuestion 读取（true=6s 快速抓取，重点参考文献引用；false=完整等待）
let debugMode = false;

let currentPage: Page | null = null;

/**
 * 单次提问全流程：导航 → 登录预检 → 联网开关 → 输入 → 发送 → 等待 → 提取回答/引用。
 * 产物（question.txt / 截图 / response-text.txt / citation-links.json / result.json）落到当前输出目录（getOutDir()）。
 * 注意：不点击引用 URL——引用链接中常混有死链/错链，抓取重点是回答文本与引用列表本身（article 置 null）。
 */
async function runQuestion(browser: Browser, context: BrowserContext, page: Page, question: string, qIndex: number): Promise<RunResult> {
  log(`\n[${qIndex + 1}] 问题: ${question}`);
  save('question.txt', question);

  // 导航到 DeepSeek（多问题模式下 exec 已在上轮末尾刷新，这里若已离开目标页则再导航）
  if (!page.url().includes(TARGET_HOST)) {
    log(`导航到 ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  } else {
    log(`已在 ${TARGET_HOST} 页面`);
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(getOutDir(), '01-loaded.png') });
  log('已截图: 01-loaded.png');

  // 登录预检：未登录/弹验证码则停下等人工处理（铁律：绝不带病继续）
  await ensureLoggedIn(page);

  // 确认联网搜索开关是否已开启（文案来自 config.searchToggleTexts；检测扫描全部命中，
  // 避免侧边栏历史标题等误匹配；点击后复查，记录最终状态与动作）
  const toggleTexts: string[] = CONFIG.searchToggleTexts ?? ['智能搜索', '联网搜索'];
  const xpathExpr = `//text()[${toggleTexts.map(t => `contains(., "${t}")`).join(' or ')}]/..`;
  log(`检查联网搜索开关状态（匹配文案: ${toggleTexts.join('/')}）…`);
  const searchState: SearchToggleState = await ensureSearchToggle(page, xpathExpr, toggleTexts);
  log(`联网搜索最终状态: ${JSON.stringify(searchState)}`);

  // 找到输入框（用 placeholder 匹配最稳）
  log('查找输入框…');
  const inputEl: ElementHandle<HTMLElement> | null = await page.waitForSelector(
    'textarea[placeholder*="发送消息"]', { timeout: 5000, state: 'visible' },
  ) as ElementHandle<HTMLElement> | null;
  if (!inputEl) throw new Error('未找到输入框');
  log('已找到输入框');

  // 输入查询
  log('输入查询内容…');
  await inputEl.click();
  await inputEl.fill('');
  await inputEl.fill(question);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(getOutDir(), '02-typed.png') });

  // 发送：用 Enter（对 DeepSeek 响应最稳）
  log('按 Enter 发送…');
  await inputEl.press('Enter');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(getOutDir(), '03-sent.png') });

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
        const lens = [...document.querySelectorAll('[class*="markdown"], [class*="message"], [class*="answer"]')]
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

  await page.screenshot({ path: path.join(getOutDir(), '04-response.png') });

  // 提取回答 + 引用链接
  log('提取回答内容和引用链接…');
  const result: CrawlResult = await page.evaluate((host: string) => {
    const data: CrawlResult = { response: '', citationLinks: [] };

    // 9.1 完整回答文本：候选中最长者（最新回答通常最长且包含全文）
    const candidates: string[] = [];
    document.querySelectorAll('[class*="markdown"], [class*="message"], [class*="answer"], [class*="response"]').forEach(el => {
      const txt = (el.textContent || '').trim();
      if (txt.length > 100) candidates.push(txt);
    });
    data.response = candidates.length
      ? candidates.reduce((a, b) => (a.length >= b.length ? a : b))
      : document.body.innerText.slice(0, 5000);

    // 9.2 引用卡片：外链 + 向上找卡片容器取标题（去重、清理 #N 锚点）
    const seen = new Set<string>();
    document.querySelectorAll('a[href]').forEach(a => {
      const anchor = a as HTMLAnchorElement;
      const href = anchor.href || '';
      if (!href.startsWith('http') || href.includes(host)) return;
      const cleanHref = href.replace(/#\d+$/, '');
      if (seen.has(cleanHref)) return;
      seen.add(cleanHref);
      let title = '';
      let cur: HTMLElement | null = a as HTMLElement;
      for (let d = 0; d < 6 && cur; d++) {
        cur = cur.parentElement;
        if (!cur) break;
        const t = (cur.innerText || '').trim();
        if (t.length > 5 && t.length < 300 && !t.includes('\n\n')) {
          title = t.split('\n').filter(Boolean)[0] || '';
          break;
        }
      }
      if (!title) title = a.getAttribute('title') || a.getAttribute('aria-label') || '';
      data.citationLinks.push({ title, href: cleanHref });
    });
    return data;
  }, TARGET_HOST);

  log(`回答长度: ${result.response.length} 字符`);
  log(`引用链接数: ${result.citationLinks.length}`);
  save('response-text.txt', result.response);
  save('citation-links.json', JSON.stringify(result.citationLinks, null, 2));

  log(`回答预览:\n${result.response.slice(0, 500)}\n...`);

  // 不点击/打开引用 URL（引用链接中常混有死链/错链，抓取重点是回答文本与引用列表本身），
  // 直接保存回答 + 引用（article 置 null）
  const final: RunResult = {
    question,
    config: RUN_CONFIG,
    searchToggle: searchState,
    response: result.response,
    citations: result.citationLinks,
    article: null,
    finishedAt: localTimestamp(),
  };
  saveResult(final);
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
  let hasErrorImage = false;
  if (currentPage && !currentPage.isClosed()) {
    try {
      await currentPage.screenshot({ path: path.join(RUN_DIR, '99-error.png') });
      hasErrorImage = true;
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
  writeCrawlerErrorRecord(path.dirname(RUN_DIR), CONFIG.engine, msg, hasErrorImage, localTimestamp());
  process.exit(1);
}


// 主入口：仅当作为主模块直接运行（node crawl.mts / ./run.sh）时执行 main()；
// 被 import 作为库（如批量调用 exec([...]) 或后端 provider 动态导入 .mjs）时不应触发运行。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(failWithEvidence);
}
