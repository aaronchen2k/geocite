export type CrawlCliOptions = { questions: string[]; isDebug: boolean; outDir: string | undefined };

export function parseCrawlCliOptions(args: string[]): CrawlCliOptions {
  const [questionsArg, outDirOrDebug, debugArg] = args;
  let questions: string[] = [];
  if (questionsArg !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(questionsArg);
    } catch {
      throw new Error('参数不是合法 JSON，需为字符串数组，例如: ./run.sh crawl.mts \'["问题1","问题2"]\' false');
    }
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      throw new Error('参数需为 JSON 字符串数组，例如: ./run.sh crawl.mts \'["问题1","问题2"]\' false');
    }
    questions = parsed;
  }
  if (outDirOrDebug === undefined || outDirOrDebug === 'true' || outDirOrDebug === 'false') {
    return { questions, isDebug: outDirOrDebug !== 'false', outDir: undefined };
  }
  return { questions, isDebug: debugArg !== 'false', outDir: outDirOrDebug || undefined };
}
