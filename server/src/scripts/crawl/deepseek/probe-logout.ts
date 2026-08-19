import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngineConfig } from '../utils/load-config.mts';

// ─── 未登录状态探针：用临时空 profile 的 Chrome（独立端口）抓 DeepSeek 未登录 DOM ───
// 用法：先手工启动临时 Chrome（空 profile + debugPort），再跑本脚本。
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --remote-debugging-port=9232 --user-data-dir=/tmp/ds-logout-probe-profile \
//     --no-first-run "https://chat.deepseek.com/"
// 产物：output/logout/ 下的截图、可见元素 JSON、可见全文、页面 HTML

// targetUrl 从上层+引擎 config.json 合并读取；CDP 端口优先 env，默认 9232（探针专用临时端口，
// 刻意避开引擎端口 9222，避免和正式抓取抢连接；如需连正式引擎 Chrome 用 PROBE_CDP_URL 覆盖）
const CDP_URL = process.env.PROBE_CDP_URL ?? 'http://127.0.0.1:9232';
const { targetUrl: TARGET_URL } = loadEngineConfig(import.meta.dirname);
/** 引擎域名（页面判断用，从 targetUrl 推导，勿硬编码） */
const TARGET_HOST = new URL(TARGET_URL).hostname;
const OUTPUT_DIR = path.join(import.meta.dirname, 'output', 'logout');

interface VisibleElement {
  tag: string;
  id: string;
  className: string;
  role: string;
  ariaLabel: string;
  text: string;
  href: string;
  placeholder: string;
  selectorHint: string;
}

interface LogoutProbeResult {
  url: string;
  title: string;
  capturedAt: string;
  visibleTextPreview: string;
  interactiveElements: VisibleElement[];
  textareas: VisibleElement[];
  dialogs: VisibleElement[];
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function save(name: string, content: string): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, name), content, 'utf-8');
  log(`已保存: ${name}`);
}

async function main(): Promise<void> {
  log(`=== 未登录状态探针启动（CDP: ${CDP_URL}）===`);
  const browser: Browser = await chromium.connectOverCDP(CDP_URL);
  const context: BrowserContext | undefined = browser.contexts()[0];
  if (!context) throw new Error('未找到浏览器上下文');

  let page: Page | undefined = context.pages().find(p => p.url().includes(TARGET_HOST));
  if (!page) {
    page = context.pages()[0] ?? (await context.newPage());
    log(`导航到 ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(6000); // 等 SPA 完全渲染
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'logout-01.png'), fullPage: true });
  log('已截图: logout-01.png');

  // 等 3 秒再截一张，捕捉可能延迟弹出的登录弹窗
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'logout-02.png'), fullPage: true });

  const probe: LogoutProbeResult = await page.evaluate(() => {
    const isVisible = (el: Element): boolean => {
      const html = el as HTMLElement;
      const style = window.getComputedStyle(html);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const r = html.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const toInfo = (el: Element): VisibleElement => {
      const html = el as HTMLElement;
      // 生成一个稳定的定位提示：id > data-testid > aria-label > 文字
      const hint =
        html.id ? `#${html.id}` :
        html.getAttribute('data-testid') ? `[data-testid="${html.getAttribute('data-testid')}"]` :
        html.getAttribute('aria-label') ? `[aria-label="${html.getAttribute('aria-label')}"]` :
        (html.innerText || '').trim() ? `文字: ${(html.innerText || '').trim().slice(0, 20)}` : '';
      return {
        tag: html.tagName.toLowerCase(),
        id: html.id || '',
        className: (html.className || '').toString().slice(0, 150),
        role: html.getAttribute('role') || '',
        ariaLabel: html.getAttribute('aria-label') || '',
        text: (html.innerText || '').trim().slice(0, 120),
        href: (html as HTMLAnchorElement).href || '',
        placeholder: (html as HTMLInputElement).placeholder || '',
        selectorHint: hint,
      };
    };

    const result: LogoutProbeResult = {
      url: location.href,
      title: document.title,
      capturedAt: new Date().toISOString(),
      visibleTextPreview: document.body.innerText.slice(0, 3000),
      interactiveElements: [],
      textareas: [],
      dialogs: [],
    };

    // 所有可见的可交互元素（按钮/链接/输入框）
    document.querySelectorAll('button, a, input, [role="button"], [contenteditable="true"]').forEach(el => {
      if (!isVisible(el)) return;
      const info = toInfo(el);
      if (!info.text && !info.ariaLabel && !info.placeholder && !info.href) return;
      result.interactiveElements.push(info);
    });

    document.querySelectorAll('textarea').forEach(el => {
      if (!isVisible(el)) return;
      result.textareas.push(toInfo(el));
    });

    // 弹窗/遮罩（登录弹窗通常在这类容器里）
    document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="dialog"], [class*="popup"], [class*="overlay"]').forEach(el => {
      if (!isVisible(el)) return;
      result.dialogs.push(toInfo(el));
    });

    return result;
  });

  save('logout-elements.json', JSON.stringify(probe, null, 2));
  save('logout-visible-text.txt', probe.visibleTextPreview);
  const html: string = await page.content();
  save('logout-page.html', html.slice(0, 300000));

  log('\n=== 未登录页面关键信息 ===');
  log(`URL: ${probe.url}, Title: ${probe.title}`);
  log(`可见全文（前 600 字）:\n${probe.visibleTextPreview.slice(0, 600)}`);
  log(`可交互元素 ${probe.interactiveElements.length} 个：`);
  for (const el of probe.interactiveElements.slice(0, 40)) {
    log(`  <${el.tag}> ${el.selectorHint || el.className.slice(0, 50)} | text="${el.text.slice(0, 40)}" | aria="${el.ariaLabel}"`);
  }
  log(`弹窗/遮罩 ${probe.dialogs.length} 个：`);
  for (const d of probe.dialogs.slice(0, 10)) {
    log(`  <${d.tag} class="${d.className.slice(0, 60)}"> text="${d.text.slice(0, 60)}"`);
  }

  await browser.close(); // 只断开连接，不关浏览器
  log('=== 探针完成 ===');
}

main().catch((e: unknown) => {
  console.error('探针失败:', e instanceof Error ? `${e.message}\n${e.stack}` : e);
  process.exit(1);
});
