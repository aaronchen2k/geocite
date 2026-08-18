import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page, ElementHandle } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngineConfig } from '../utils/load-config.ts';
import { ensureBrowser } from '../utils/ensure-browser.ts';
import { save, log, setOutDir, getOutDir } from '../utils/fs-utils.ts';
import { makeRunConfig } from '../utils/domain.ts';
import type { Citation, SearchToggleState, ArticleInfo, RunResult as BaseRunResult } from '../utils/domain.ts';

// ─── 配置：上层 crawl/config.json（通用默认）+ 本目录 config.json（引擎差异）合并 ───
const CONFIG = loadEngineConfig(import.meta.dirname);
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

const RESULTS_ROOT = path.join(import.meta.dirname, 'results');
const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const RUN_DIR = path.join(RESULTS_ROOT, `run-${RUN_TS}`);

// 本次运行使用的完整配置快照（随结果一起持久化；构造来自 utils/domain.ts）
const RUN_CONFIG = makeRunConfig(`run-${RUN_TS}`, CONFIG);

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

// 失败时供兜底逻辑截图用的当前页引用
let currentPage: Page | null = null;

/**
 * 单次提问全流程：导航 → 登录预检 → 联网开关 → 输入 → 发送 → 等待 → 提取回答/引用 → 打开首个引用提取文章。
 * 产物（question.txt / 截图 / response-text.txt / citation-links.json / article.json / result.json）落到当前输出目录（getOutDir()）。
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
  let searchState: SearchToggleState;
  const toggleTexts: string[] = CONFIG.searchToggleTexts ?? [];
  if (toggleTexts.length === 0) {
    searchState = { on: null, reason: 'config.searchToggleTexts 未配置，跳过开关检查' };
  } else {
    const xpathExpr = `//text()[${toggleTexts.map(t => `contains(., "${t}")`).join(' or ')}]/..`;
    log(`检查联网搜索开关状态（匹配文案: ${toggleTexts.join('/')}）…`);
    searchState = await page.evaluate((expr: string) => {
      const result = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < result.snapshotLength; i++) {
        const el = result.snapshotItem(i) as HTMLElement | null;
        if (!el) continue;
        let cur: HTMLElement | null = el;
        for (let d = 0; d < 5 && cur; d++) {
          const cls = (cur.className || '').toString();
          if (cls.includes('selected') || cls.includes('active') || cls.includes('checked')) {
            return { on: true, className: cls.slice(0, 200) };
          }
          cur = cur.parentElement;
        }
        return { on: false, className: '' };
      }
      return { on: null, reason: '未找到联网搜索开关文字（部分引擎按查询内容自动联网）' };
    }, xpathExpr);
    if (searchState.on === false) {
      log('联网搜索未开启，尝试点击…');
      try {
        await page.getByText(toggleTexts[0], { exact: false }).first().click({ timeout: 3000 });
        await page.waitForTimeout(500);
        searchState = { ...searchState, reason: '检测到开关未开启，已尝试点击' };
      } catch (e) {
        log(`点击联网搜索开关失败: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  log(`联网搜索状态: ${JSON.stringify(searchState)}`);

  // 找输入框并输入查询（textarea 用 fill，富文本编辑器用键盘模拟）
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

  // 等回答（流式生成）—— 基准 + 随机抖动，模拟人工节奏
  const waitMs = randomWaitMs();
  log(`等待 ${(waitMs / 1000).toFixed(1)} 秒让回答生成（基准 ${RESPONSE_WAIT_MS / 1000}s + 抖动 ${((waitMs - RESPONSE_WAIT_MS) / 1000).toFixed(1)}s）…`);
  await page.waitForTimeout(waitMs);
  await shot(page, '04-response.png', true);

  // 提取回答 + 引用链接（host/query 作为参数传入浏览器上下文，不在 evaluate 里引用外部变量）
  log('提取回答内容和引用链接…');
  const result: CrawlResult = await page.evaluate(({ host, queryPrefix }: { host: string; queryPrefix: string }) => {
    const data: CrawlResult = { response: '', citationLinks: [] };

    // 8.1 回答全文：候选容器取最长文本。
    // 排除两类容器：包含输入框的（输入区/整页外壳）、包含问题原文的（会话整体/问题气泡），
    // 剩下最长者即回答容器。不依赖引擎 class/文案。
    const inputBox = document.querySelector('textarea[placeholder]')
      ?? document.querySelector('[contenteditable="true"]');
    const candidates: string[] = [];
    document.querySelectorAll('div, article, section, main').forEach(el => {
      if (inputBox && el !== inputBox && (el.contains(inputBox) || inputBox.contains(el))) return;
      const txt = (el.textContent || '').trim();
      if (txt.length < 200) return;
      if (queryPrefix && txt.includes(queryPrefix)) return;
      candidates.push(txt);
    });
    data.response = candidates.length
      ? candidates.reduce((a, b) => (a.length >= b.length ? a : b))
      : document.body.innerText.slice(0, 8000);

    // 8.2 引用链接：外链 → 清理 #N 锚点 → 解包中转链接 → 按清理后 URL 去重
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
      const rawHref = a.href || '';
      if (!rawHref.startsWith('http')) return;
      const cleanHref = unwrap(rawHref.replace(/#\d+$/, ''));
      if (isInternal(cleanHref)) return;
      if (seen.has(cleanHref)) return; // 引用按 URL 去重
      seen.add(cleanHref);

      // 向上遍历卡片容器取标题
      let title = '';
      let cur: HTMLElement | null = a;
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
    return data;
  }, { host: TARGET_HOST, queryPrefix: question.slice(0, 15) });

  log(`回答长度: ${result.response.length} 字符`);
  log(`引用链接数: ${result.citationLinks.length}`);
  save('response-text.txt', result.response);
  save('citation-links.json', JSON.stringify(result.citationLinks, null, 2));
  log(`回答预览:\n${result.response.slice(0, 300)}\n...`);

  // 点击第一个引用链接
  const firstLink: Citation | undefined = result.citationLinks[0];
  if (!firstLink) {
    log('⚠️  未找到任何引用/外部链接');
    const early: RunResult = {
      question,
      config: RUN_CONFIG,
      loginCheck,
      searchToggle: searchState,
      response: result.response,
      citations: [],
      article: null,
      finishedAt: new Date().toISOString(),
    };
    save('result.json', JSON.stringify(early, null, 2));
    return early;
  }
  log(`打开引用链接: ${firstLink.href}`);

  // 用同 context 新标签页打开（共享登录态/cookie，比 window.open 更稳，不受弹窗拦截影响）
  const articlePage: Page = await context.newPage();
  try {
    await articlePage.goto(firstLink.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (e) {
    log(`新标签页加载失败，重试一次: ${e instanceof Error ? e.message : e}`);
    await articlePage.waitForTimeout(3000);
    try {
      await articlePage.goto(firstLink.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (e2) {
      log(`重试仍失败: ${e2 instanceof Error ? e2.message : e2}`);
    }
  }
  await articlePage.waitForTimeout(3000);
  const targetPage: Page = articlePage;
  log(`文章页: ${targetPage.url()}`);

  // 提取文章信息
  log('开始提取文章内容…');
  const article: ArticleInfo = await targetPage.evaluate(() => {
    const getMeta = (name: string): string => {
      const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return el ? (el.getAttribute('content') || '').trim() : '';
    };
    return {
      url: location.href,
      title: document.title,
      metaTitle: getMeta('og:title') || getMeta('twitter:title'),
      metaDesc: getMeta('og:description') || getMeta('twitter:description') || getMeta('description'),
      metaImage: getMeta('og:image'),
      h1: [...document.querySelectorAll('h1')].map(h => h.textContent?.trim() || '').filter(Boolean).slice(0, 5),
      h2: [...document.querySelectorAll('h2')].map(h => h.textContent?.trim() || '').filter(Boolean).slice(0, 5),
      mainText: (document.querySelector('main, article, [class*="content"], [class*="article"]') as HTMLElement | null ?? document.body).innerText.slice(0, 8000),
    };
  });
  save('article.json', JSON.stringify(article, null, 2));
  await shot(targetPage, '05-article.png');

  log(`文章: ${article.url} | ${article.title || article.metaTitle} | H1: ${article.h1.join(' | ')}`);

  const final: RunResult = {
    question,
    config: RUN_CONFIG,
    loginCheck,
    searchToggle: searchState,
    response: result.response,
    citations: result.citationLinks,
    article,
    finishedAt: new Date().toISOString(),
  };
  save('result.json', JSON.stringify(final, null, 2));
  return final;
}

/**
 * 主执行入口：批量采样。
 * @param questions 问题数组；为空时使用 config.query 单问题执行。
 * 单问题产物在 results/run-<时间戳>/ 根目录；多问题每问一个 results/run-<时间戳>/q-NN/ 子目录，
 * 并在 run 目录根部额外生成 summary.json 汇总。
 */
export async function exec(questions: string[] = []): Promise<RunResult[]> {
  const qs = questions.length > 0 ? questions : [QUERY];
  const multi = qs.length > 1;
  log(`=== ${CONFIG.engine} 自动化抓取启动（${qs.length} 个问题${multi ? '，批量模式' : ''}）===`);
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
      finishedAt: new Date().toISOString(),
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

async function main(): Promise<void> {
  await exec(); // 无参：使用 config.json 的 query 单问题执行
}

/** 失败兜底：截图存证 + 检测登录/验证码特征，给出人工介入提示 */
async function failWithEvidence(e: unknown): Promise<never> {
  const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  console.error('抓取失败:', msg);
  fs.mkdirSync(RUN_DIR, { recursive: true });
  save('99-error.txt', `${new Date().toISOString()}\n${msg}`);

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

main().catch(failWithEvidence);
