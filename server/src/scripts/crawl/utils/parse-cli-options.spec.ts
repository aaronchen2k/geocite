import { parseCrawlCliOptions } from './parse-cli-options';

describe('parseCrawlCliOptions', () => {
  it('将目录名解析为 isDebug 前的可选参数', () => {
    expect(parseCrawlCliOptions(['["问题"]', 'run-2026-08-20_08-03-18', 'false'])).toEqual({
      questions: ['问题'],
      isDebug: false,
      outDir: 'run-2026-08-20_08-03-18',
    });
  });

  it('将省略目录名时的第二个布尔参数解析为 isDebug', () => {
    expect(parseCrawlCliOptions(['["问题"]', 'false'])).toEqual({ questions: ['问题'], isDebug: false, outDir: undefined });
  });
});
