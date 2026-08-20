import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeCrawlerErrorRecord } from './error-record';

describe('writeCrawlerErrorRecord', () => {
  let runDirectory: string;

  beforeEach(() => {
    runDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'geocite-crawl-error-'));
  });

  afterEach(() => {
    fs.rmSync(runDirectory, { recursive: true, force: true });
  });

  it('在运行根目录合并各引擎的错误消息和 99-error 产物路径', () => {
    writeCrawlerErrorRecord(runDirectory, 'deepseek', '连接 CDP 失败', true, '2026-08-20 08:03:18');
    writeCrawlerErrorRecord(runDirectory, 'qwen', '登录超时', false, '2026-08-20 08:04:18');

    expect(JSON.parse(fs.readFileSync(path.join(runDirectory, 'errors.json'), 'utf8'))).toEqual({
      errors: [
        {
          engine: 'deepseek',
          occurredAt: '2026-08-20 08:03:18',
          message: '连接 CDP 失败',
          errorTextPath: 'deepseek/99-error.txt',
          errorImagePath: 'deepseek/99-error.png',
        },
        {
          engine: 'qwen',
          occurredAt: '2026-08-20 08:04:18',
          message: '登录超时',
          errorTextPath: 'qwen/99-error.txt',
          errorImagePath: null,
        },
      ],
    });
  });
});
