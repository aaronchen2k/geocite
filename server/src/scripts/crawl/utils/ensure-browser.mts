// ─── CDP 端口探测 + 自动拉起受控 Chrome（三引擎共享） ───
// exec 开始前调用 ensureBrowser(cfg)：若端口已有 Chrome 在监听则直接复用；
// 否则用 config 的 chromeBin/profileDir/debugPort 拉起一个常驻 Chrome，等待端口就绪后返回。
// 拉起后 Chrome 保持运行（与手动执行 start-chrome.sh 效果一致），后续多次抓取复用。
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { EngineConfig } from './load-config.mts';

/** 探测 CDP 端口是否就绪（有 Chrome 在监听且返回 Browser 标识） */
export function checkCdpPort(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get({ host, port, path: '/json/version', timeout: timeoutMs }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(data.includes('Browser')));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 确保受控 Chrome 在线：端口已有 → 直接返回；无 → 启动后等待就绪。
 * @param cfg 合并后的引擎配置（host/debugPort/chromeBin/profileDir）
 * @param waitMs 启动后等待端口就绪的最长毫秒数（默认 30s）
 * @throws 启动失败或等待超时
 */
export async function ensureBrowser(cfg: EngineConfig, waitMs = 30_000): Promise<void> {
  const { host, debugPort, chromeBin, profileDir } = cfg;
  if (await checkCdpPort(host, debugPort)) {
    console.log(`[ensure-browser] 端口 ${debugPort} 已有 Chrome，直接复用`);
    return;
  }

  console.log(`[ensure-browser] 端口 ${debugPort} 无 Chrome，启动 ${chromeBin}（profile: ${profileDir}）…`);
  const child = spawn(chromeBin, [
    `--remote-debugging-port=${debugPort}`,
    '--no-sandbox',          // 受限环境下 Chrome 自身沙箱起不来会 FATAL 退出
    '--disable-gpu',
    `--user-data-dir=${profileDir}`,
  ], {
    stdio: 'ignore',
    // 去掉代理环境变量：继承 HTTP_PROXY 会让 Chrome 网络服务异常（与 start-chrome.sh 一致）
    env: { ...process.env, HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  });

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(1000);
    if (await checkCdpPort(host, debugPort)) {
      console.log(`[ensure-browser] 端口 ${debugPort} 就绪`);
      return;
    }
    // 子进程提前退出说明启动失败（如 chromeBin 路径错、profile 被占用）
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Chrome 启动失败（端口 ${debugPort}，进程已退出 code=${child.exitCode ?? child.signalCode}）。请检查 chromeBin/profileDir。`);
    }
  }
  throw new Error(`等待 Chrome 就绪超时（端口 ${debugPort}，${waitMs / 1000}s）。`);
}
