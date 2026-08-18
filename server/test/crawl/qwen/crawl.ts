import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page, Locator } from 'playwright';
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

// ─── 工具函数（log/save/saveResult 来自 utils/fs-utils.ts） ───
// 通用输入框查找：先 textarea，再 contenteditable[role=textbox]，最后 contenteditable
async function findInputBox(page: Page): Promise<{ locator: Locator; isContentEditable: boolean } | null> {
  const textarea = page.locator('textarea').first();
  if (await textarea.count() > 0) return { locator: textarea, isContentEditable: false };
  const ceRole = page.locator('[contenteditable="true"][role="textbox"]').first();
  if (await ceRole.count() > 0) return { locator: ceRole, isContentEditable: true };
  const ce = page.locator('[contenteditable="true"]').first();
  if (await ce.count() > 0) return { locator: ce, isContentEditable: true };
  return null;
}

// 在 contenteditable 中输入：JS 聚焦（不受弹窗/浮层遮挡影响）→ 全选 → 删除 → keyboard.type
async function typeIntoContentEditable(page: Page, locator: Locator, text: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  // 用 JS focus 而非 click：即使有弹窗遮挡也能聚焦，keyboard 事件照常送达
  await locator.evaluate(el => (el as HTMLElement).focus());
  await page.waitForTimeout(200);
  // 聚焦兜底：若未聚焦成功则强制点击
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return !!el && (el.isContentEditable || el.tagName === 'TEXTAREA');
  });
  if (!focused) {
    await locator.click({ timeout: 3000, force: true });
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  await page.keyboard.type(text, { delay: 10 });
}

// 检查页面上是否有可见的模态弹窗（注意 fixed 定位元素 offsetParent 为 null，需用 getComputedStyle 判断）
async function hasVisibleModal(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const modals = document.querySelectorAll('[role*="modal"]');
    for (const m of modals) {
      const el = m as HTMLElement;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (el.offsetWidth > 0 && el.offsetHeight > 0) return true;
    }
    return false;
  });
}

// 关闭页面上可见的模态弹窗（Escape + 找关闭按钮 + JS 强制移除）
async function dismissModals(page: Page): Promise<void> {
  // 1. Escape
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  // 2. 尝试点击弹窗内的关闭按钮（X 图标、aria-label 含关闭/close、class 含 close/取消）
  const closeBtn = page.locator(
    '[role*="modal"] [aria-label*="关闭"], [role*="modal"] [aria-label*="close"], [role*="modal"] [aria-label*="Close"], [role*="modal"] [class*="close"], [role*="modal"] button:has-text("取消")',
  ).first();
  await closeBtn.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
  // 3. 仍可见则通过 JS 强制从 DOM 移除（强制登录等业务弹窗用普通方式关不掉）
  if (await hasVisibleModal(page)) {
    log('常规方式未能关闭弹窗，强制从 DOM 移除…');
    await page.evaluate(() => {
      document.querySelectorAll('[role*="modal"]').forEach(m => { (m as HTMLElement).remove(); });
      // 同时清理可能存在的遮罩层（fixed 定位元素 offsetParent 为 null，须用 getComputedStyle 判断可见性）
      document.querySelectorAll('[class*="overlay"], [class*="backdrop"], [class*="mask"]').forEach(o => {
        const e = o as HTMLElement;
        const s = window.getComputedStyle(e);
        if (s.display !== 'none' && s.visibility !== 'hidden' && e.offsetWidth > 0 && e.offsetHeight > 0) {
          e.remove();
        }
      });
    });
    await page.waitForTimeout(300);
  }
}

// ─── 登录检测（未登录则停下等人工登录/验证码，绝不继续抓取） ───
// 判定依据（文案来自 config.loginTexts，引擎无关）：
//   1. 存在可见的"登录"类按钮（button/[role=button]，短文本）→ 未登录
//   2. 存在可见弹窗且弹窗文本含登录文案（强制登录 modal）→ 未登录
//   3. 存在可见 avatar 元素（[class*="avatar"]）→ 已登录（正向兜底）
// （经验：空 profile 千问首页 = 1 个"登录"BUTTON + 无 avatar + 无 modal；
//  登录后 = 无"登录"BUTTON + 顶部有 avatar。footer 常驻"登录"链接是 <a>，不看，避免误报）
async function checkLoginState(page: Page, loginTexts: string[]): Promise<{ loggedIn: boolean; reason?: string }> {
  return page.evaluate((texts: string[]) => {
    const isVisible = (el: HTMLElement): boolean => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
    };
    // 1. 可见的登录类按钮（只看 button/[role=button]，不看 <a>——页脚常驻"登录"链接会误报）
    const clickable = Array.from(document.querySelectorAll('button, [role="button"]'));
    for (const b of clickable) {
      const el = b as HTMLElement;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 12) continue;
      if (!texts.some(x => t.toLowerCase().includes(x.toLowerCase()))) continue;
      if (isVisible(el)) return { loggedIn: false, reason: `可见登录按钮: "${t}"` };
    }
    // 2. 可见弹窗内含登录文案（强制登录弹窗；class 中可能含 modal/dialog/portal）
    const modals = Array.from(document.querySelectorAll('[role*="modal"], [class*="modal"], [class*="dialog"], [class*="portal"]'));
    for (const m of modals) {
      const el = m as HTMLElement;
      if (!isVisible(el)) continue;
      const t = (el.innerText || '').trim().slice(0, 300);
      if (texts.some(x => t.toLowerCase().includes(x.toLowerCase()))) {
        return { loggedIn: false, reason: `登录弹窗: "${t.slice(0, 60)}"` };
      }
    }
    // 3. 正向兜底：可见 avatar 元素 → 已登录（即便未来 UI 变化引入非常规"登录"文案）
    const avatars = Array.from(document.querySelectorAll('[class*="avatar"], img[alt*="头像"], img[alt*="avatar"]'));
    for (const a of avatars) {
      if (isVisible(a as HTMLElement)) return { loggedIn: true, reason: '可见 avatar' };
    }
    return { loggedIn: true };
  }, loginTexts);
}

/** 未登录时阻塞等待人工登录（含验证码/扫码），超时抛错终止 */
async function waitForManualLogin(page: Page, loginTexts: string[], timeoutMs: number): Promise<void> {
  log('⛔ 检测到未登录，脚本已暂停 —— 请在 Chrome 窗口手工登录（扫码/验证码均可），登录成功后脚本会自动继续…');
  await page.screenshot({ path: path.join(getOutDir(), '01a-login-required.png') }).catch(() => {});
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(5000);
    // 页面可能被登录流程导航走，容忍短暂不可用
    if (page.isClosed()) throw new Error('等待登录期间页面被关闭');
    const st = await checkLoginState(page, loginTexts).catch(() => ({ loggedIn: true }));
    if (st.loggedIn) {
      log('✅ 检测到已登录，继续抓取流程…');
      await page.waitForTimeout(2000); // 等登录后界面稳定
      await page.screenshot({ path: path.join(getOutDir(), '01b-logged-in.png') }).catch(() => {});
      return;
    }
    const waited = Math.round((Date.now() - start) / 1000);
    log(`仍在等待登录…（已等 ${waited}s / 上限 ${Math.round(timeoutMs / 1000)}s，当前特征: ${st.reason ?? ''}）`);
  }
  // 超时：抛错终止，绝不带未登录状态继续
  throw new Error(`等待人工登录超时（${Math.round(timeoutMs / 1000)}s），本次运行终止。请手工登录后重跑。`);
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

  // 导航到目标页面（多问题模式下 exec 已在上轮末尾刷新，这里若已离开目标页则再导航）
  if (!page.url().includes(TARGET_HOST)) {
    log(`导航到 ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  } else {
    log(`已在目标页面`);
  }
  await page.waitForTimeout(3000);

  // 更新运行时 host（处理 targetUrl 重定向到实际站点的情况）
  let runtimeHost = TARGET_HOST;
  try {
    runtimeHost = new URL(page.url()).hostname;
    if (runtimeHost !== TARGET_HOST) {
      log(`页面重定向: ${TARGET_HOST} → ${runtimeHost}（内链过滤用运行时 host）`);
    }
  } catch { /* 解析失败则沿用 TARGET_HOST */ }

  await page.screenshot({ path: path.join(getOutDir(), '01-loaded.png') });
  log('已截图: 01-loaded.png');

  // 登录预检：未登录则停下等人工登录/验证码，绝不继续（登录文案统一字段名 loginTexts）
  const loginTexts: string[] = CONFIG.loginTexts ?? [];
  if (loginTexts.length > 0) {
    log(`登录预检（匹配文案: ${loginTexts.join('/')}）…`);
    const loginState = await checkLoginState(page, loginTexts);
    if (!loginState.loggedIn) {
      log(`未登录（${loginState.reason}）`);
      await waitForManualLogin(page, loginTexts, CONFIG.loginWaitMs);
    } else {
      log('登录状态正常');
    }
  } else {
    log('未配置 loginTexts，跳过登录预检');
  }

  // 确认联网搜索开关（文案来自 config.searchToggleTexts，DOM 混淆 class 不稳，用文字匹配 + 状态判断）
  const toggleTexts: string[] = CONFIG.searchToggleTexts ?? [];
  let searchState: SearchToggleState = { on: null, reason: '未配置 searchToggleTexts' };

  if (toggleTexts.length > 0) {
    const xpathExpr = `//text()[${toggleTexts.map(t => `contains(., "${t}")`).join(' or ')}]/..`;
    log(`检查联网搜索开关状态（匹配文案: ${toggleTexts.join('/')}）…`);

    searchState = await page.evaluate(({ expr, texts }: { expr: string; texts: string[] }) => {
      // 阶段 1: XPath 找匹配文字，向上 5 层看 selected/active/checked 类（简单开关型）
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
      }
      // 阶段 2: 可见按钮的文本恰好等于开关文案（模式标签型：按钮直接显示当前模式名）
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const b of buttons) {
        const t = (b.textContent || '').trim();
        if (!texts.some(text => t === text)) continue;
        if (b.offsetParent === null) continue; // 隐藏元素跳过
        // 排除在下拉菜单里的选项（选项可见但当前模式不一定是它）
        let cur: HTMLElement | null = b;
        let inDropdown = false;
        while (cur) {
          const role = cur.getAttribute('role') || '';
          const cls = (cur.className || '').toString().toLowerCase();
          if (role === 'menu' || role === 'listbox' || cls.includes('dropdown') || cls.includes('popup') || cls.includes('popover')) {
            inDropdown = true;
            break;
          }
          cur = cur.parentElement;
        }
        if (!inDropdown) {
          return { on: true, className: 'mode-label', reason: `模式标签: ${t}` };
        }
      }
      return { on: false, reason: '未找到已激活的联网搜索开关' };
    }, { expr: xpathExpr, texts: toggleTexts });

    log(`联网搜索状态: ${JSON.stringify(searchState)}`);

    if (!searchState.on) {
      log('联网搜索未开启，尝试点击…');
      let toggled = false;

      // 尝试 1: 直接点击开关文案（简单开关型：文字直接可点）
      try {
        await page.getByText(toggleTexts[0], { exact: false }).first().click({ timeout: 3000 });
        await page.waitForTimeout(800);
        toggled = true;
      } catch {
        log('直接点击未果，尝试展开下拉菜单后再点击…');
      }

      // 尝试 2: 下拉菜单型——逐个点输入框附近的短文字按钮展开菜单，再点开关文案
      // （按与输入框的垂直距离排序：模式切换按钮一定紧挨输入框，侧边栏/营销按钮远离输入框）
      if (!toggled) {
        const orderedIdx = await page.evaluate(() => {
          const input = document.querySelector('textarea')
            || document.querySelector('[contenteditable="true"][role="textbox"]')
            || document.querySelector('[contenteditable="true"]');
          const rect = input ? (input as HTMLElement).getBoundingClientRect() : null;
          const btns = Array.from(document.querySelectorAll('button'));
          const scored: { i: number; dist: number }[] = [];
          btns.forEach((b, i) => {
            const el = b as HTMLElement;
            const t = (b.textContent || '').trim();
            if (!t || t.length > 15) return;
            if (el.offsetParent === null) return; // 不可见
            const r = el.getBoundingClientRect();
            scored.push({ i, dist: rect ? Math.abs(r.top - rect.bottom) : i });
          });
          scored.sort((a, b) => a.dist - b.dist);
          return scored.slice(0, 20).map(s => s.i);
        });
        const btns = await page.$$('button');
        for (const idx of orderedIdx) {
          const btn = btns[idx];
          if (!btn) continue;
          const txt = ((await btn.textContent()) || '').trim();
          if (toggleTexts.some(t => txt.includes(t))) continue; // 开关文案本身跳过
          if (!txt || txt.length > 15) continue; // 太长的不是模式切换按钮
          if (/登录|login|sign\s*in/i.test(txt)) continue; // 登录按钮会触发强制登录弹窗，跳过
          try {
            await btn.click({ timeout: 1500 });
            await page.waitForTimeout(600);

            // 检查是否触发了弹窗（误点了登录/广告等），是则关闭并跳过
            if (await hasVisibleModal(page)) {
              log(`点击"${txt}"触发弹窗，关闭后继续…`);
              await dismissModals(page);
              continue;
            }

            // 确认菜单确实展开：DOM 新出现含开关文案的可见文本节点（下拉组件懒渲染，未展开时这些文案不在 DOM）
            const menuOpen = await page.evaluate((texts: string[]) => {
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              let n: Node | null;
              while ((n = walker.nextNode())) {
                const t = (n.textContent || '').trim();
                if (!t || t.length > 20) continue;
                if (!texts.some(x => t.includes(x))) continue;
                const el = n.parentElement as HTMLElement | null;
                if (!el) continue;
                const s = window.getComputedStyle(el);
                if (s.display !== 'none' && s.visibility !== 'hidden') return true;
              }
              return false;
            }, toggleTexts);
            if (!menuOpen) {
              await page.keyboard.press('Escape').catch(() => {});
              await page.waitForTimeout(200);
              continue;
            }

            // 菜单已展开，精确点击开关文案对应的菜单项
            const opt = page.getByText(toggleTexts[0], { exact: true }).first();
            await opt.click({ timeout: 2000 });
            await page.waitForTimeout(800);
            toggled = true;
            log(`通过按钮"${txt}"展开菜单后点击了开关文案`);
            break;
          } catch {
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(200);
          }
        }
      }

      if (toggled) {
        await page.screenshot({ path: path.join(getOutDir(), '02-mode-switched.png') });
        log('已截图: 02-mode-switched.png');
        // 切换后复查（可见按钮文本恰好等于开关文案即视为已开启）
        const after = await page.evaluate((texts: string[]) => {
          const buttons = Array.from(document.querySelectorAll('button'));
          for (const b of buttons) {
            const t = (b.textContent || '').trim();
            if (texts.some(text => t === text) && b.offsetParent !== null) {
              return { on: true as const, className: 'mode-label', reason: `切换后模式: ${t}` };
            }
          }
          return { on: false as const, reason: '切换后仍未识别到开启状态' };
        }, toggleTexts);
        searchState = after;
        log(`切换后状态: ${JSON.stringify(after)}`);
      }
    }
  }

  // 找到输入框（通用：textarea 或 contenteditable）
  log('查找输入框…');
  // 切换模式过程中可能误触弹窗，先清理残留（跑两轮：React 可能在移除后重新挂载弹窗）
  for (let i = 0; i < 2; i++) {
    if (await hasVisibleModal(page)) {
      log(`检测到残留弹窗（第 ${i + 1} 轮），尝试关闭…`);
      await dismissModals(page);
    }
  }
  const input = await findInputBox(page);
  if (!input) throw new Error('未找到输入框（textarea / contenteditable 均未命中）');
  log(`已找到输入框 (contenteditable=${input.isContentEditable})`);

  // 输入查询
  log('输入查询内容…');
  if (input.isContentEditable) {
    await typeIntoContentEditable(page, input.locator, question);
  } else {
    await input.locator.click();
    await input.locator.fill('');
    await input.locator.fill(question);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(getOutDir(), '03-typed.png') });
  log('已截图: 03-typed.png');

  // 发送：按 Enter
  log('按 Enter 发送…');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(getOutDir(), '04-sent.png') });
  log('已截图: 04-sent.png');

  // 等回答（流式生成 + 联网搜索可能耗时）—— 基准 + 随机抖动，模拟人工节奏
  const waitMs = randomWaitMs();
  log(`等待 ${(waitMs / 1000).toFixed(1)} 秒让回答生成（基准 ${RESPONSE_WAIT_MS / 1000}s + 抖动 ${((waitMs - RESPONSE_WAIT_MS) / 1000).toFixed(1)}s）…`);
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: path.join(getOutDir(), '05-response.png') });
  log('已截图: 05-response.png');

  // 提取回答 + 引用链接（host 作为参数传入浏览器上下文）
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

    // 9.2 引用卡片：外链 + 向上找卡片容器取标题（按 URL 清理 #N 锚点后去重）
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
  }, runtimeHost);

  log(`回答长度: ${result.response.length} 字符`);
  log(`引用链接数: ${result.citationLinks.length}`);
  for (const c of result.citationLinks.slice(0, 5)) {
    log(`  引用: ${c.title.slice(0, 40)} -> ${c.href.slice(0, 80)}`);
  }
  save('response-text.txt', result.response);
  save('citation-links.json', JSON.stringify(result.citationLinks, null, 2));

  log(`回答预览:\n${result.response.slice(0, 500)}…`);

  // 点击第一个引用链接（新标签打开）
  const firstLink: Citation | undefined = result.citationLinks[0];
  if (!firstLink) {
    log('未找到任何引用/外部链接');
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
  log(`点击第一个引用链接: ${firstLink.href}`);

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
      mainText: ((document.querySelector('main, article, [class*="content"], [class*="article"]') as HTMLElement | null) ?? document.body).innerText.slice(0, 8000),
    };
  });
  save('article.json', JSON.stringify(article, null, 2));
  await targetPage.screenshot({ path: path.join(getOutDir(), '06-article.png'), fullPage: false });
  log('已截图: 06-article.png');

  log('=== 文章关键信息 ===');
  log(`URL: ${article.url}`);
  log(`Title: ${article.title || article.metaTitle}`);
  log(`Description: ${(article.metaDesc || '').slice(0, 200)}`);
  log(`H1: ${article.h1.join(' | ')}`);
  log(`正文前 500 字: ${article.mainText.slice(0, 500)}`);

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
  // 失败也要留 result.json 存证（error 字段记录失败原因）
  const errFile = path.join(RUN_DIR, 'result.json');
  if (!fs.existsSync(errFile)) {
    fs.writeFileSync(errFile, JSON.stringify({
      config: RUN_CONFIG,
      searchToggle: { on: null, reason: '运行失败，未到达开关检测/未完成' },
      response: '',
      citations: [],
      article: null,
      error: msg.split('\n')[0],
      finishedAt: new Date().toISOString(),
    }, null, 2), 'utf-8');
  }

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
