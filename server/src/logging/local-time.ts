import { LoggerService } from '@nestjs/common';

export function localTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`;
}

export class LocalTimeLogger implements LoggerService {
  log(message: unknown, ...optional: unknown[]) { console.log(`[${localTimestamp()}]`, message, ...optional); }
  error(message: unknown, ...optional: unknown[]) { console.error(`[${localTimestamp()}]`, message, ...optional); }
  warn(message: unknown, ...optional: unknown[]) { console.warn(`[${localTimestamp()}]`, message, ...optional); }
  debug(message: unknown, ...optional: unknown[]) { console.debug(`[${localTimestamp()}]`, message, ...optional); }
  verbose(message: unknown, ...optional: unknown[]) { console.debug(`[${localTimestamp()}]`, message, ...optional); }
  fatal(message: unknown, ...optional: unknown[]) { console.error(`[${localTimestamp()}]`, message, ...optional); }
}

export const logLocal = (message: string): void => console.log(`[${localTimestamp()}] ${message}`);
