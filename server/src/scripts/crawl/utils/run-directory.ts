import path from 'node:path';

export function resolveCrawlRunDirectory(scriptDirectory: string, runName: string, engineCode: string): string {
  return path.join(resolveCrawlExecutionRoot(scriptDirectory), runName, engineCode);
}

export function resolveCrawlExecutionRoot(scriptDirectory: string, _isDebug?: boolean): string {
  return path.resolve(scriptDirectory, '../../../..', 'data', 'playwright-exec');
}
