import fs from 'node:fs';
import path from 'node:path';

type CrawlerErrorRecord = {
  engine: string;
  occurredAt: string;
  message: string;
  errorTextPath: string;
  errorImagePath: string | null;
};

/** 将某个引擎的失败存证写入 runName 根目录，保留同一批次其他引擎的错误。 */
export function writeCrawlerErrorRecord(
  runDirectory: string,
  engine: string,
  message: string,
  hasErrorImage: boolean,
  occurredAt: string,
): void {
  fs.mkdirSync(runDirectory, { recursive: true });
  const errorFile = path.join(runDirectory, 'errors.json');
  let errors: CrawlerErrorRecord[] = [];
  try {
    const existing = JSON.parse(fs.readFileSync(errorFile, 'utf8')) as { errors?: unknown };
    if (Array.isArray(existing.errors)) errors = existing.errors as CrawlerErrorRecord[];
  } catch {
    // 尚未创建或内容无法读取时，以本次错误重新建立文件。
  }
  errors.push({
    engine,
    occurredAt,
    message,
    errorTextPath: `${engine}/99-error.txt`,
    errorImagePath: hasErrorImage ? `${engine}/99-error.png` : null,
  });
  fs.writeFileSync(errorFile, JSON.stringify({ errors }, null, 2));
}
