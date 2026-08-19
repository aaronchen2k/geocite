// 探针：千问未登录状态 DOM 采集（临时空 profile 的 Chrome，端口 9225）
// 目的：拿到未登录时的真实 DOM 特征，校准 crawl.ts 的 checkLoginState 登录检测
import { chromium } from 'playwright';
import fs from 'node:fs';
import { loadEngineConfig } from '../utils/load-config.mts';

const OUT = new URL('./output-login/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

// targetUrl 从上层+引擎 config.json 合并读取；CDP 默认 9225（探针专用临时端口，env 可覆盖）
const { targetUrl: TARGET_URL } = loadEngineConfig(import.meta.dirname);
const CDP_URL = process.env.PROBE_CDP_URL ?? 'http://127.0.0.1:9225';

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
let page = context.pages()[0] ?? (await context.newPage());

console.log(`导航到 ${TARGET_URL}…`);
await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
console.log('最终 URL:', page.url());

await page.screenshot({ path: OUT + '01-not-logged-in.png' });

// 1. 可见按钮清单（含文本、class、aria）——找"登录"类按钮
const buttons = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button, [role="button"]')).map((b) => {
    const el = b as HTMLElement;
    const s = window.getComputedStyle(el);
    const visible = s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
    return {
      tag: el.tagName,
      text: (el.textContent || '').trim().slice(0, 40),
      cls: (el.className || '').toString().slice(0, 100),
      aria: el.getAttribute('aria-label'),
      visible,
    };
  }).filter(x => x.text && x.visible);
});
fs.writeFileSync(OUT + 'buttons.json', JSON.stringify(buttons, null, 2));

// 2. 弹窗 / modal 清单
const modals = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[role*="modal"], [class*="modal"], [class*="dialog"]')).map((m) => {
    const el = m as HTMLElement;
    const s = window.getComputedStyle(el);
    const visible = s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      cls: (el.className || '').toString().slice(0, 120),
      visible,
      text: (el.innerText || '').trim().slice(0, 200),
    };
  });
});
fs.writeFileSync(OUT + 'modals.json', JSON.stringify(modals, null, 2));

// 3. 输入框是否存在（未登录时输入框是否可见）
const inputInfo = await page.evaluate(() => {
  const sel = [
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
  ];
  for (const s of sel) {
    const el = document.querySelector(s) as HTMLElement | null;
    if (el) {
      const st = window.getComputedStyle(el);
      return { selector: s, found: true, visible: st.display !== 'none' && el.offsetWidth > 0, placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '' };
    }
  }
  return { found: false };
});

// 4. 头像特征（登录后一般有 avatar/img，未登录没有）
const avatars = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('img[class*="avatar"], [class*="avatar"], img[alt*="头像"]')).map((a) => {
    const el = a as HTMLElement;
    const s = window.getComputedStyle(el);
    return { tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), visible: s.display !== 'none' && el.offsetWidth > 0 };
  }).filter(x => x.visible);
});

// 5. 页面 body 文本里的登录相关关键词
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
const keywords = ['登录', '扫码', '验证码', '注册', 'login', 'Sign in'];
const hits = keywords.filter(k => bodyText.includes(k));

// 6. 完整 HTML 留档
fs.writeFileSync(OUT + 'page.html', await page.content());

const report = {
  finalUrl: page.url(),
  title: await page.title(),
  visibleButtonsCount: buttons.length,
  loginButtons: buttons.filter(b => /登录|login|sign\s*in/i.test(b.text)),
  modals,
  inputInfo,
  visibleAvatars: avatars,
  bodyKeywordHits: hits,
};
fs.writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
