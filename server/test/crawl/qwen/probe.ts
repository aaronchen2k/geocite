import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngineConfig } from '../utils/load-config.ts';

// 地址统一从上层+引擎 config.json 合并读取（env 可覆盖），不再硬编码
const { cdpUrl: CDP_URL, targetUrl: TARGET_URL } = loadEngineConfig(import.meta.dirname);
const OUTPUT_DIR = path.join(import.meta.dirname, 'output');

interface ElementInfo {
  idx: number;
  id: string;
  className: string;
  text?: string;
  tag?: string;
  visible?: boolean;
  [key: string]: unknown;
}

interface ProbeResult {
  url: string;
  title: string;
  textareas: ElementInfo[];
  contentEditables: ElementInfo[];
  inputs: ElementInfo[];
  buttons: ElementInfo[];
  links: { idx: number; text: string; href: string }[];
  searchTexts: {
    keyword: string;
    idx: number;
    tag: string;
    id: string;
    className: string;
    text: string;
    parentTag: string;
    parentClass: string;
    parentRole: string;
  }[];
  potentialChatArea: ElementInfo[];
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function save(name: string, content: string): void {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, name), content, 'utf-8');
  log(`已保存: ${name}`);
}

async function main(): Promise<void> {
  log('=== Qwen 探针脚本启动 ===');

  // 1. 连接 CDP
  log(`连接 CDP: ${CDP_URL}`);
  const browser: Browser = await chromium.connectOverCDP(CDP_URL);
  const context: BrowserContext | undefined = browser.contexts()[0];
  if (!context) throw new Error('未找到 CDP 浏览器上下文');
  log(`contexts: ${browser.contexts().length}, pages: ${context.pages().length}`);
  for (const p of context.pages()) {
    log(`  已有页面: ${p.url()}`);
  }

  const page: Page = context.pages()[0] ?? (await context.newPage());

  // 2. 导航 — 先尝试 tongyi.com，看最终跳转到哪里
  log(`导航到 ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // 等 SPA 渲染
  log(`最终 URL: ${page.url()}`); // 可能看到跳转到 chat.qwen.ai 等

  // 3. 截图
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'probe-01-loaded.png'), fullPage: true });
  log('已截图: probe-01-loaded.png');

  // 4. 探测可交互元素
  const probe: ProbeResult = await page.evaluate(() => {
    const result: ProbeResult = {
      url: location.href,
      title: document.title,
      textareas: [],
      contentEditables: [],
      inputs: [],
      buttons: [],
      links: [],
      searchTexts: [],
      potentialChatArea: [],
    };

    const rect = (el: Element): { x: number; y: number; w: number; h: number } | null => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };

    document.querySelectorAll('textarea').forEach((el, i) => {
      result.textareas.push({
        idx: i,
        id: el.id || '',
        className: el.className || '',
        placeholder: el.placeholder || '',
        name: el.name || '',
        visible: el.offsetParent !== null,
        rect: rect(el),
      });
    });

    document.querySelectorAll('[contenteditable="true"]').forEach((el, i) => {
      result.contentEditables.push({
        idx: i,
        tag: el.tagName,
        id: el.id || '',
        className: el.className || '',
        role: el.getAttribute('role') || '',
        visible: el.offsetParent !== null,
      });
    });

    document.querySelectorAll('input[type="text"], input:not([type])').forEach((el, i) => {
      result.inputs.push({
        idx: i,
        id: el.id || '',
        className: el.className || '',
        placeholder: el.placeholder || '',
        type: el.type || 'text',
      });
    });

    document.querySelectorAll('button, [role="button"], div[class*="btn"], div[class*="button"], div[class*="send"]').forEach((el, i) => {
      const text = (el.textContent || '').trim().slice(0, 80);
      if (!text && !el.className) return;
      result.buttons.push({
        idx: i,
        tag: el.tagName,
        id: el.id || '',
        className: (el.className || '').slice(0, 200),
        text,
        role: el.getAttribute('role') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        visible: el.offsetParent !== null,
      });
    });

    document.querySelectorAll('a[href]').forEach((el, i) => {
      const href = el.href;
      const text = (el.textContent || '').trim().slice(0, 100);
      // 排除千问自身域名
      const host = location.hostname;
      if (href && (href.startsWith('http') || href.startsWith('//')) && !href.includes(host)) {
        result.links.push({ idx: i, text, href });
      }
    });

    // 搜索含关键文字的元素（千问 DOM 混淆，用文字定位最稳）
    const keywords = ['联网搜索', '联网', '搜索', 'send', '发送', '提问', '搜索增强', 'web search', '联网查询'];
    for (const kw of keywords) {
      const els = document.evaluate(
        `//text()[contains(., '${kw}')]/..`,
        document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null,
      );
      for (let i = 0; i < els.snapshotLength; i++) {
        const el = els.snapshotItem(i) as HTMLElement;
        result.searchTexts.push({
          keyword: kw,
          idx: i,
          tag: el.tagName,
          id: el.id || '',
          className: (el.className || '').slice(0, 200),
          text: (el.textContent || '').trim().slice(0, 100),
          parentTag: el.parentElement?.tagName || '',
          parentClass: (el.parentElement?.className || '').slice(0, 200),
          parentRole: el.parentElement?.getAttribute('role') || '',
        });
      }
    }

    document.querySelectorAll('[class*="message"], [class*="chat"], [class*="answer"], [class*="response"], [class*="conversation"], [class*="markdown"]').forEach((el, i) => {
      if (i > 20) return;
      result.potentialChatArea.push({
        idx: i,
        tag: el.tagName,
        id: el.id || '',
        className: (el.className || '').slice(0, 200),
        childCount: el.children.length,
        textPreview: (el.textContent || '').trim().slice(0, 200),
      });
    });

    return result;
  });

  save('probe-elements.json', JSON.stringify(probe, null, 2));
  log(`探测结果: ${probe.textareas.length} textarea, ${probe.contentEditables.length} contenteditable, ${probe.buttons.length} buttons, ${probe.links.length} external links, ${probe.searchTexts.length} keyword hits`);

  // 5. 保存页面 HTML（截取前 200KB 避免太大）
  const html: string = await page.content();
  save('probe-page.html', html.slice(0, 200000));
  log(`页面 HTML 长度: ${html.length}`);

  // 6. 打印关键发现
  log('\n=== 关键发现 ===');
  log(`URL: ${probe.url}`);
  log(`Title: ${probe.title}`);
  log(`Textareas: ${JSON.stringify(probe.textareas.map(t => ({ id: t.id, cls: t.className, ph: t.placeholder, vis: t.visible })))}`);
  log(`ContentEditables: ${JSON.stringify(probe.contentEditables.map(c => ({ tag: c.tag, id: c.id, cls: c.className, role: c.role })))}`);
  log(`Inputs: ${JSON.stringify(probe.inputs.map(i => ({ id: i.id, cls: i.className, ph: i.placeholder })))}`);
  log(`Search text hits: ${JSON.stringify(probe.searchTexts.map(s => ({ kw: s.keyword, tag: s.tag, cls: s.className, text: s.text.slice(0, 50), pCls: s.parentClass })))}`);
  log(`External links: ${JSON.stringify(probe.links.slice(0, 10))}`);
  log(`Buttons (first 15): ${JSON.stringify(probe.buttons.slice(0, 15).map(b => ({ tag: b.tag, text: b.text?.slice(0, 40), cls: b.className?.slice(0, 60), aria: b.ariaLabel })))}`);

  // 7. 断开连接（不关闭浏览器）
  await browser.close();
  log('=== 探针完成 ===');
}

main().catch((e: unknown) => {
  console.error('探针失败:', e instanceof Error ? e.message : e);
  process.exit(1);
});
