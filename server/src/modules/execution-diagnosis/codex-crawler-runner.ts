type CodexEvent = { type: string; thread_id?: string; item?: Record<string, unknown>; error?: { message?: string }; message?: string };
type CodexThread = {
  runStreamed(prompt: string, options?: { signal?: AbortSignal }): Promise<{ events: AsyncIterable<CodexEvent> }>;
};
type CodexModule = {
  Codex: new () => { startThread(options: { workingDirectory: string; skipGitRepoCheck: boolean; sandboxMode: 'danger-full-access' }): CodexThread };
};

export type CodexCrawlerRunInput = {
  crawlerDirectory: string;
  questions: string[];
  runName: string;
  signal?: AbortSignal;
  onLog: (message: string) => void;
  onDebugLog: (message: string) => void;
};

export type CodexCrawlerRunnerDependencies = { loadCodex?: () => Promise<CodexModule> };

function buildCrawlerPrompt(questions: string[], runName: string) {
  const serializedQuestions = JSON.stringify(questions);
  return [
    '在当前目录执行以下采样命令：',
    `./run.sh crawl.mts '${serializedQuestions.replace(/'/g, "'\\''")}' ${runName} false`,
    '',
    '要求：',
    '1. 不要汇总问题答案；后续系统会读取磁盘结果，只保留必要错误信息和诊断线索。',
    '2. 若命令、crawler、依赖、配置、浏览器环境或运行环境报错，先定位根因。',
    '3. 在当前任务范围内修复 crawler 代码或运行环境问题；修复后重新执行同一组问题。',
    '4. 可重复“诊断 → 修复 → 重试”，直到成功或遇到必须由用户提供的外部信息（例如密钥、账号权限）。',
    '5. 不要把未实际执行的结果当作成功返回。最终只简要说明执行结果、做过的修复和仍存在的阻塞。',
  ].join('\n');
}

async function loadCodexSdk(): Promise<CodexModule> {
  return Function('return import("@openai/codex-sdk")')() as Promise<CodexModule>;
}

function outputDelta(item: Record<string, unknown>, lengths: Map<string, number>) {
  const key = String(item.id ?? item.command ?? 'command');
  const output = String(item.aggregated_output ?? '');
  const previous = lengths.get(key) ?? 0;
  lengths.set(key, output.length);
  return output.length > previous ? output.slice(previous) : '';
}

function debugLog(onDebugLog: (message: string) => void, message: string) {
  if (message.trim()) onDebugLog(message);
}

export class CodexCrawlerRunner {
  constructor(private readonly dependencies: CodexCrawlerRunnerDependencies = {}) {}

  async run({ crawlerDirectory, questions, runName, signal, onLog, onDebugLog }: CodexCrawlerRunInput): Promise<void> {
    const { Codex } = await (this.dependencies.loadCodex ?? loadCodexSdk)();
    const thread = new Codex().startThread({ workingDirectory: crawlerDirectory, skipGitRepoCheck: true, sandboxMode: 'danger-full-access' });
    const streamed = await thread.runStreamed(buildCrawlerPrompt(questions, runName), { signal });
    const outputLengths = new Map<string, number>();
    for await (const event of streamed.events) {
      if (event.type === 'thread.started') {
        onLog(`Codex 线程已启动：${event.thread_id ?? 'unknown'}`);
        continue;
      }
      if (event.type === 'item.started' && event.item?.type === 'command_execution') {
        onLog(`开始执行命令：${String(event.item.command ?? '')}`);
        continue;
      }
      if ((event.type === 'item.updated' || event.type === 'item.completed') && event.item?.type === 'command_execution') {
        const delta = outputDelta(event.item, outputLengths);
        debugLog(onDebugLog, delta);
        if (event.type === 'item.completed') onLog(`命令完成: ${String(event.item.command ?? '')} (exit=${String(event.item.exit_code ?? 'unknown')})`);
        continue;
      }
      if (event.type === 'turn.failed' || event.type === 'error') onLog(`Codex 执行失败：${event.error?.message ?? event.message ?? 'unknown error'}`);
    }
  }
}
