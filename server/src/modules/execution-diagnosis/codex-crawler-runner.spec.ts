import { CodexCrawlerRunner } from './codex-crawler-runner';

async function* events(items: unknown[]) {
  for (const item of items) yield item;
}

describe('CodexCrawlerRunner', () => {
  it('在 crawler 目录调用 Codex，并转发命令输出的新增尾部', async () => {
    const logs: string[] = [];
    const debugLogs: string[] = [];
    const runStreamed = jest.fn().mockResolvedValue({
      events: events([
        { type: 'thread.started', thread_id: 'thread-1' },
        { type: 'item.started', item: { type: 'command_execution', id: 'command-1', command: './run.sh crawl.mts' } },
        { type: 'item.updated', item: { type: 'command_execution', id: 'command-1', command: './run.sh crawl.mts', aggregated_output: '诊断中' } },
        { type: 'item.completed', item: { type: 'command_execution', id: 'command-1', command: './run.sh crawl.mts', exit_code: 0, aggregated_output: '诊断中\n已生成结果' } },
      ]),
    });
    const startThread = jest.fn().mockReturnValue({ runStreamed });
    const runner = new CodexCrawlerRunner({
      loadCodex: async () => ({ Codex: class { startThread = startThread; } }),
    });

    await runner.run({
      crawlerDirectory: '/tmp/deepseek',
      questions: ['北京有哪些著名地标？'],
      runName: 'run-2026-08-20_08-03-18',
      onLog: (message) => logs.push(message),
      onDebugLog: (message) => debugLogs.push(message),
    });

    expect(startThread).toHaveBeenCalledWith({
      workingDirectory: '/tmp/deepseek',
      skipGitRepoCheck: true,
      sandboxMode: 'danger-full-access',
    });
    expect(runStreamed.mock.calls[0][0]).toContain("./run.sh crawl.mts '[\"北京有哪些著名地标？\"]' run-2026-08-20_08-03-18 false");
    expect(logs.join('\n')).not.toContain('诊断中');
    expect(debugLogs.join('\n')).toContain('诊断中');
    expect(debugLogs.join('\n')).toContain('已生成结果');
  });
});
