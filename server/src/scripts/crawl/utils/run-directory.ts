import path from 'node:path';

export function resolveCrawlRunDirectory(scriptDirectory: string, runName: string, isDebug: boolean): string {
  const root = resolveCrawlExecutionRoot(scriptDirectory, isDebug);
  return path.join(root, runName);
}

export function resolveCrawlExecutionRoot(scriptDirectory: string, isDebug: boolean): string {
  return isDebug
    ? path.join(scriptDirectory, 'playwright-exec')
    : path.resolve(scriptDirectory, '../../../..', 'data', 'playwright-exec');
}
