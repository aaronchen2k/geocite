jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }));

import fs from 'node:fs/promises';
import { PlaywrightWebSamplingService } from './playwright-web-sampling.service';

describe('PlaywrightWebSamplingService', () => {
  it('通过 Codex runner 执行 crawler，并且只读取磁盘结果', async () => {
    const logs: string[] = [];
    const runner = { run: jest.fn(async ({ onLog }: { onLog: (message: string) => void }) => onLog('Codex 已执行 crawler')) };
    jest.mocked(fs.readFile).mockImplementation(async (file) => {
      if (String(file).endsWith('errors.json')) throw new Error('ENOENT');
      return JSON.stringify({ question: 'q', response: '磁盘答案', citations: [{ title: '来源', href: 'https://example.com' }] });
    });
    const service = new PlaywrightWebSamplingService({ runner });

    const result = await service.searchBatch(
      { id: 1, code: 'deepseek', name: 'DeepSeek' },
      [{ question: 'q', prompt: 'p', brandName: '品牌' }],
      { runName: 'run-test', onLog: (message) => logs.push(message) },
    );

    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      crawlerDirectory: expect.stringContaining('/deepseek'),
      questions: ['p'],
      runName: 'run-test',
    }));
    expect(jest.mocked(fs.readFile).mock.calls[0][0]).toContain('/data/playwright-exec/run-test/deepseek/result.json');
    expect(result).toMatchObject({
      isSuccess: true,
      errors: [],
      itemArray: [{ answer: '磁盘答案', error: null }],
    });
    expect(logs).toContain('Codex 已执行 crawler');
  });

  it('将运行根目录 errors.json 的当前引擎错误返回给调用方', async () => {
    const runner = { run: jest.fn() };
    jest.mocked(fs.readFile).mockImplementation(async (file) => {
      if (String(file).endsWith('errors.json')) return JSON.stringify({ errors: [{ engine: 'deepseek', message: 'CDP 连接失败' }] });
      throw new Error('ENOENT');
    });
    const service = new PlaywrightWebSamplingService({ runner });

    const result = await service.searchBatch(
      { id: 1, code: 'deepseek', name: 'DeepSeek' },
      [{ question: 'q', prompt: 'p', brandName: '品牌' }],
      { runName: 'run-test' },
    );

    expect(result).toMatchObject({
      isSuccess: false,
      errors: ['CDP 连接失败', 'crawler-result-missing'],
      itemArray: [{ error: 'crawler-result-missing' }],
    });
  });
});
