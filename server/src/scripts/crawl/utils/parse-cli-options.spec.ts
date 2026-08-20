import { parseCrawlCliOptions } from './parse-cli-options';

describe('parseCrawlCliOptions', () => {
  it('将第三个参数 false 解析为完整等待模式，而非结果目录', () => {
    expect(parseCrawlCliOptions(['["问题"]', 'false'])).toEqual({ questions: ['问题'], isDebug: false, outDir: undefined });
  });
});
