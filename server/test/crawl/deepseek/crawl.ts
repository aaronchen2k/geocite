import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page, ElementHandle } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngineConfig } from '../utils/load-config.ts';
import { ensureBrowser } from '../utils/ensure-browser.ts';
import { save, saveResult, log, setOutDir, getOutDir } from '../utils/fs-utils.ts';
import { makeRunConfig } from '../utils/domain.ts';
import type { Citation, CrawlResult, SearchToggleState, ArticleInfo, RunResult } from '../utils/domain.ts';

// ─── 配置：上层 crawl/config.json（通用默认）+ 本目录 config.json（引擎差异）合并 ───
const CONFIG = loadEngineConfig(import.meta.dirname);
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

const RESULTS_ROOT = path.join(import.meta.dirname, 'results');
const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const RUN_DIR = path.join(RESULTS_ROOT, `run-${RUN_TS}`);

// 本次运行使用的配置（随结果一起持久化；类型/构造来自 utils/domain.ts）
const RUN_CONFIG = makeRunConfig(`run-${RUN_TS}`, CONFIG);

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

// 失败时供兜底逻辑截图用的当前页引用
let currentPage: Page | null = null;

/**
 * 单次提问全流程：导航 → 登录预检 → 联网开关 → 输入 → 发送 → 等待 → 提取回答/引用 → 打开首个引用提取文章。
 * 产物（question.txt / 截图 / response-text.txt / citation-links.json / article.json / result.json）落到当前输出目录（getOutDir()）。
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

  // 确认联网搜索开关是否已开启（DOM 混淆 class 不稳，用文字匹配 + selected 状态判断；文案来自 config.searchToggleTexts）
  const toggleTexts: string[] = CONFIG.searchToggleTexts ?? ['智能搜索', '联网搜索'];
  const xpathExpr = `//text()[${toggleTexts.map(t => `contains(., "${t}")`).join(' or ')}]/..`;
  log(`检查联网搜索开关状态（匹配文案: ${toggleTexts.join('/')}）…`);
  const searchState: SearchToggleState = await page.evaluate((expr: string) => {
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
    return { on: null, reason: '未找到联网搜索开关文字' };
  }, xpathExpr);
  log(`联网搜索状态: ${JSON.stringify(searchState)}`);
  if (searchState.on === false) {
    log('联网搜索未开启，尝试点击…');
    try {
      await page.getByText(toggleTexts[0], { exact: false }).first().click({ timeout: 3000 });
      await page.waitForTimeout(500);
    } catch (e) {
      log(`点击联网搜索开关失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 找到输入框（用 placeholder 匹配最稳）
  log('查找输入框…');
  const inputEl: ElementHandle<HTMLTextAreaElement> | null = await page.waitForSelector(
    'textarea[placeholder*="发送消息"]', { timeout: 5000, state: 'visible' },
  );
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

  // 等回答（流式生成）—— 基准 20s + (-5s ~ +10s) 随机抖动，模拟人工节奏
  const waitMs = randomWaitMs();
  log(`等待 ${(waitMs / 1000).toFixed(1)} 秒让回答生成（基准 ${RESPONSE_WAIT_MS / 1000}s + 抖动 ${((waitMs - RESPONSE_WAIT_MS) / 1000).toFixed(1)}s）…`);
  await page.waitForTimeout(waitMs);
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
      const href = a.href || '';
      if (!href.startsWith('http') || href.includes(host)) return;
      const cleanHref = href.replace(/#\d+$/, '');
      if (seen.has(cleanHref)) return;
      seen.add(cleanHref);
      let title = '';
      let cur: HTMLElement | null = a;
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

  // 点击第一个引用链接（新标签打开）
  const firstLink: Citation | undefined = result.citationLinks[0];
  if (!firstLink) {
    log('⚠️  未找到任何引用/外部链接');
    const early: RunResult = {
      question,
      config: RUN_CONFIG,
      searchToggle: searchState,
      response: result.response,
      citations: [],
      article: null,
      finishedAt: new Date().toISOString(),
    };
    saveResult(early);
    return early;
  }
  log(`\n点击第一个引用链接: ${firstLink.href}`);

  const pagePromise: Promise<Page | null> = context
    .waitForEvent('page', { timeout: 10_000 })
    .catch(() => null);
  await page.evaluate((url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, firstLink.href);

  const articlePage: Page | null = await pagePromise;
  let targetPage: Page = page;
  if (!articlePage) {
    log('未弹出新标签，尝试在当前页打开…');
    await page.goto(firstLink.href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  } else {
    log(`新标签页: ${articlePage.url()}`);
    await articlePage.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
    await articlePage.waitForTimeout(3000);
    targetPage = articlePage;
  }

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
  await targetPage.screenshot({ path: path.join(getOutDir(), '05-article.png'), fullPage: false });
  log('已截图: 05-article.png');

  log(`文章: ${article.url} | ${article.title || article.metaTitle} | H1: ${article.h1.join(' | ')}`);

  const final: RunResult = {
    question,
    config: RUN_CONFIG,
    searchToggle: searchState,
    response: result.response,
    citations: result.citationLinks,
    article,
    finishedAt: new Date().toISOString(),
  };
  saveResult(final);
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
  log(`=== DeepSeek 自动化抓取启动（${qs.length} 个问题${multi ? '，批量模式' : ''}）===`);
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
