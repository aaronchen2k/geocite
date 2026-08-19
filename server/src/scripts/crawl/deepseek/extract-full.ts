import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngineConfig } from '../utils/load-config.mts';

// 地址统一从上层+引擎 config.json 合并读取（env 可覆盖），不再硬编码
const { cdpUrl: CDP_URL, targetUrl: TARGET_URL } = loadEngineConfig(import.meta.dirname);
/** 引擎域名（页面判断/内链过滤用，从 targetUrl 推导，勿硬编码） */
const TARGET_HOST = new URL(TARGET_URL).hostname;
const OUTPUT_DIR = path.join(import.meta.dirname, 'output');

interface Citation {
  title: string;
  href: string;
  rawText: string;
}

interface ExtractResult {
  fullResponse: string;
  cards: Citation[];
  bodyTextLength: number;
  bodyText: string;
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function save(name: string, content: string): void {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, name), content, 'utf-8');
  log(`已保存: ${name}`);
}

async function main(): Promise<void> {
  log('=== 补充提取：完整回答 + 引用卡片 ===');
  const browser: Browser = await chromium.connectOverCDP(CDP_URL);
  const context: BrowserContext | undefined = browser.contexts()[0];
  if (!context) throw new Error('未找到浏览器上下文');
  // 找到 DeepSeek 标签页（不是新打开的文章页）
  const page: Page | undefined = context.pages().find(p => p.url().includes(TARGET_HOST));
  if (!page) throw new Error('未找到 DeepSeek 页面');
  log(`页面: ${page.url()}`);

  await page.bringToFront().catch(() => {});
  await page.waitForTimeout(1000);

  const data: ExtractResult = await page.evaluate((host: string) => {
    // ── 1. 完整回答：取所有 markdown/message 候选中最长的 ──
    const candidates: string[] = [];
    document.querySelectorAll('[class*="markdown"], [class*="message"]').forEach(el => {
      const txt = (el.innerText || '').trim();
      if (txt.length > 100) candidates.push(txt);
    });
    const fullResponse = candidates.length
      ? candidates.reduce((a, b) => (a.length >= b.length ? a : b))
      : '';

    // ── 2. 引用卡片：外链的祖先链上找含标题的卡片容器 ──
    const seen = new Set<string>();
    const cards: Citation[] = [];
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
      if (!title) {
        title = a.getAttribute('title') || a.getAttribute('aria-label') || '';
      }
      cards.push({ title, href: cleanHref, rawText: (a.innerText || '').trim() });
    });

    const bodyText = document.body.innerText;
    return { fullResponse, cards, bodyTextLength: bodyText.length, bodyText };
  }, TARGET_HOST);

  log(`完整回答长度: ${data.fullResponse.length} 字符`);
  log(`引用卡片数: ${data.cards.length}`);
  data.cards.forEach((c, i) => log(`  [${i + 1}] ${c.title || '(无标题)'} → ${c.href}`));

  save('full-response.txt', data.fullResponse);
  save('citations.json', JSON.stringify(data.cards, null, 2));
  save('page-body.txt', data.bodyText);

  log('\n=== 回答全文预览 ===');
  log(data.fullResponse.slice(0, 1200));

  await browser.close();
  log('=== 完成 ===');
}

main().catch((e: unknown) => {
  console.error('失败:', e instanceof Error ? e.message : e);
  process.exit(1);
});
