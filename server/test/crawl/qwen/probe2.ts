// qwen-specific 探针 - 点击更多/快速等按钮，查看展开的菜单
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngineConfig } from '../utils/load-config.ts';

// 地址统一从上层+引擎 config.json 合并读取，不再硬编码
const { cdpUrl: CDP_URL, targetUrl: TARGET_URL } = loadEngineConfig(import.meta.dirname);
/** 引擎域名（页面判断用，从 targetUrl 推导，勿硬编码） */
const TARGET_HOST = new URL(TARGET_URL).hostname;
const OUTPUT_DIR = path.join(import.meta.dirname, 'output2');

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function save(name: string, content: string): void {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, name), content, 'utf-8');
  log(`已保存: ${name}`);
}

async function dumpButtonsAndSearch(page: Page, tag: string): Promise<void> {
  const dump = await page.evaluate(() => {
    const buttons: unknown[] = [];
    document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="switch"], [role="tab"]').forEach((el, i) => {
      const t = (el.textContent || '').trim();
      const al = el.getAttribute('aria-label') || '';
      const role = el.getAttribute('role') || '';
      const checked = el.getAttribute('aria-checked') || el.getAttribute('data-checked') || '';
      const cls = (el.className || '').toString().slice(0, 120);
      const dataState = el.getAttribute('data-state') || '';
      if (t || al || checked) {
        buttons.push({ i, tag: el.tagName, role, text: t.slice(0, 60), aria: al, checked, dataState, cls });
      }
    });
    // 找含联网/搜索/web的文字
    const kwHits: { kw: string; text: string; tag: string; cls: string }[] = [];
    for (const kw of ['联网', '搜索', 'web', 'Web', 'websearch']) {
      const r = document.evaluate(`//text()[contains(., '${kw}')]/..`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < r.snapshotLength; i++) {
        const el = r.snapshotItem(i) as HTMLElement;
        const txt = (el.textContent || '').trim();
        if (txt.length > 200) continue;
        kwHits.push({ kw, text: txt.slice(0, 80), tag: el.tagName, cls: (el.className || '').toString().slice(0, 80) });
      }
    }
    return { url: location.href, buttons, kwHits };
  });
  save(`${tag}.json`, JSON.stringify(dump, null, 2));
  log(`[${tag}] 关键词命中: ${dump.kwHits.length}, 按钮数: ${dump.buttons.length}`);
  for (const h of dump.kwHits.slice(0, 10)) log(`  kw "${h.kw}": [${h.tag}] ${h.text}`);
}

async function main(): Promise<void> {
  log('=== Qwen 探针 2 启动（菜单展开测试）===');

  const browser: Browser = await chromium.connectOverCDP(CDP_URL);
  const context: BrowserContext = browser.contexts()[0];
  const page: Page = context.pages()[0] ?? (await context.newPage());

  if (!page.url().includes(TARGET_HOST)) {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
  }
  log(`URL: ${page.url()}`);

  // 初始状态
  await dumpButtonsAndSearch(page, '00-initial');

  // 1) 点击 "更多"
  log('\n--- 点击 "更多" ---');
  try {
    const moreBtn = page.getByRole('button', { name: '更多' });
    if (await moreBtn.count() > 0) {
      await moreBtn.first().click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUTPUT_DIR, '01-more-opened.png'), fullPage: true });
      await dumpButtonsAndSearch(page, '01-more-opened');
      // 关闭
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    } else {
      log('未找到 "更多" 按钮');
    }
  } catch (e) {
    log(`点击更多失败: ${e instanceof Error ? e.message : e}`);
  }

  // 2) 点击 "快速"
  log('\n--- 点击 "快速" ---');
  try {
    const quickBtn = page.locator('button:has-text("快速")').first();
    if (await quickBtn.count() > 0) {
      await quickBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUTPUT_DIR, '02-quick-opened.png'), fullPage: true });
      await dumpButtonsAndSearch(page, '02-quick-opened');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    } else {
      log('未找到 "快速" 按钮');
    }
  } catch (e) {
    log(`点击快速失败: ${e instanceof Error ? e.message : e}`);
  }

  // 3) 点击模型选择器
  log('\n--- 点击 "Qwen3.7-千问" 模型选择器 ---');
  try {
    const modelBtn = page.locator('button:has-text("Qwen"), button:has-text("千问")').first();
    if (await modelBtn.count() > 0) {
      await modelBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUTPUT_DIR, '03-model-opened.png'), fullPage: true });
      await dumpButtonsAndSearch(page, '03-model-opened');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    } else {
      log('未找到模型选择器');
    }
  } catch (e) {
    log(`点击模型选择器失败: ${e instanceof Error ? e.message : e}`);
  }

  // 4) 在输入框聚焦后再次检查
  log('\n--- 聚焦输入框 ---');
  try {
    const editable = page.locator('[contenteditable="true"]').first();
    await editable.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04-focused.png'), fullPage: true });
    await dumpButtonsAndSearch(page, '04-focused');
  } catch (e) {
    log(`聚焦失败: ${e instanceof Error ? e.message : e}`);
  }

  await browser.close();
  log('=== 探针 2 完成 ===');
}

main().catch((e: unknown) => {
  console.error('探针 2 失败:', e instanceof Error ? e.message : e);
  process.exit(1);
});
