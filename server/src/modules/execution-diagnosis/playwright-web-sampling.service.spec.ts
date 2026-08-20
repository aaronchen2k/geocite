jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }));

import fs from 'node:fs/promises';
import { PlaywrightWebSamplingService } from './playwright-web-sampling.service';

describe('PlaywrightWebSamplingService', () => {
  it('通过 Codex runner 执行 crawler，并且只读取磁盘结果', async () => {
    const logs: string[] = [];
    const runner = { run: jest.fn(async ({ onLog }: { onLog: (message: string) => void }) => onLog('Codex 已执行 crawler')) };
    jest.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ question: 'q', response: '磁盘答案', citations: [{ title: '来源', href: 'https://example.com' }] }));
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
    expect(result).toMatchObject([{ answer: '磁盘答案', error: null }]);
    expect(logs).toContain('Codex 已执行 crawler');
  });
});
