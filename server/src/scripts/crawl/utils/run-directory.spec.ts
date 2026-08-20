import path from 'node:path';
import { resolveCrawlExecutionRoot, resolveCrawlRunDirectory } from './run-directory';

describe('resolveCrawlRunDirectory', () => {
  const scriptDirectory = '/workspace/server/src/scripts/crawl/deepseek';
  const runName = 'run-2026-08-19_12-13-51';

  it('调试模式将本次 output 和 results 写入引擎下的 playwright-exec 运行目录', () => {
    expect(resolveCrawlRunDirectory(scriptDirectory, runName, true)).toBe(
      path.join(scriptDirectory, 'playwright-exec', runName),
    );
  });

  it('完整执行模式将本次 output 和 results 写入 server/data/playwright-exec 运行目录', () => {
    expect(resolveCrawlRunDirectory(scriptDirectory, runName, false)).toBe(
      '/workspace/server/data/playwright-exec/run-2026-08-19_12-13-51',
    );
  });

  it('完整执行模式的结果根目录可供诊断提供者扫描', () => {
    expect(resolveCrawlExecutionRoot(scriptDirectory, false)).toBe('/workspace/server/data/playwright-exec');
  });
});
