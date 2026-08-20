export type CrawlCliOptions = { questions: string[]; isDebug: boolean; outDir: string | undefined };

export function parseCrawlCliOptions(args: string[]): CrawlCliOptions {
  const [questionsArg, debugOrOutDir, outDirArg] = args;
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
  if (debugOrOutDir === undefined || debugOrOutDir === 'true' || debugOrOutDir === 'false') {
    return { questions, isDebug: debugOrOutDir !== 'false', outDir: outDirArg };
  }
  return { questions, isDebug: true, outDir: debugOrOutDir };
}
