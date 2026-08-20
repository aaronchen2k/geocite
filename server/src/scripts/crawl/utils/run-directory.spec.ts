import path from 'node:path';
import { resolveCrawlExecutionRoot, resolveCrawlRunDirectory } from './run-directory';

describe('resolveCrawlRunDirectory', () => {
  const scriptDirectory = '/workspace/server/src/scripts/crawl/deepseek';
  const runName = 'run-2026-08-19_12-13-51';
  const engineCode = 'deepseek';

  it('调试模式和完整执行模式使用同一个结果根目录', () => {
    expect(resolveCrawlExecutionRoot(scriptDirectory, true)).toBe('/workspace/server/data/playwright-exec');
    expect(resolveCrawlExecutionRoot(scriptDirectory, false)).toBe('/workspace/server/data/playwright-exec');
  });

  it('将本次 output 和 results 写入共享运行目录下的引擎子目录', () => {
    expect(resolveCrawlRunDirectory(scriptDirectory, runName, engineCode)).toBe(
      '/workspace/server/data/playwright-exec/run-2026-08-19_12-13-51/deepseek',
    );
  });

  it('结果根目录可供诊断提供者扫描', () => {
    expect(resolveCrawlExecutionRoot(scriptDirectory, false)).toBe('/workspace/server/data/playwright-exec');
  });
});
