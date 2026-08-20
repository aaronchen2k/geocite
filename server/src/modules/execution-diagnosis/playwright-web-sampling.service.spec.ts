jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }));

import fs from 'node:fs/promises';
import { PlaywrightWebSamplingService } from './playwright-web-sampling.service';

describe('PlaywrightWebSamplingService', () => {
  it('通过 Codex runner 执行 crawler，并且只读取磁盘结果', async () => {
    const logs: string[] = [];
    const runner = { run: jest.fn(async ({ onLog }: { onLog: (message: string) => void }) => onLog('Codex 已执行 crawler')) };
    jest.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ question: 'q', response: '磁盘答案', citations: [{ title: '来源', href: 'https://example.com' }] }));
    const resultDirectories = jest.fn()
      .mockResolvedValueOnce(['/tmp/deepseek/results/run-previous'])
      .mockResolvedValueOnce(['/tmp/deepseek/results/run-previous', '/tmp/deepseek/results/run-test']);
    const service = new PlaywrightWebSamplingService({ runner, resultDirectories });

    const result = await service.searchBatch(
      { id: 1, code: 'deepseek', name: 'DeepSeek' },
      [{ question: 'q', prompt: 'p', brandName: '品牌' }],
      { onLog: (message) => logs.push(message) },
    );

    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      crawlerDirectory: expect.stringContaining('/deepseek'),
      questions: ['p'],
    }));
    expect(result).toMatchObject([{ answer: '磁盘答案', error: null }]);
    expect(logs).toContain('Codex 已执行 crawler');
  });
});
