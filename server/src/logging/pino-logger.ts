import fs from 'node:fs';
import path from 'node:path';
import pino, { type Logger } from 'pino';
import { LoggerService } from '@nestjs/common';
import { localTimestamp } from './local-time';

type Channel = 'app' | 'inbound' | 'outbound';
type HttpRequestLog = { method: string; url: string; ip?: string; userAgent?: string; headers?: Record<string, unknown>; body?: unknown };
type HttpResponseLog = { target: string; statusCode: number; durationMs: number };

const loggers = new Map<string, Logger>();
const logDirectory = path.resolve(__dirname, '../../logs');

function safeSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  if (!normalized || normalized === '.' || normalized === '..') throw new Error('日志路径段无效');
  return normalized;
}

function getLogger(key: string, logFile: string, bindings: Record<string, unknown>): Logger {
  const existing = loggers.get(key);
  if (existing) return existing;
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const logger = pino({
    base: undefined,
    timestamp: () => `,"time":${JSON.stringify(localTimestamp())}`,
    formatters: { level: (label) => ({ level: label }) },
  }, pino.destination({ dest: logFile, mkdir: true, sync: false })).child({ ...bindings, logFile });
  loggers.set(key, logger);
  return logger;
}

function redactHeaders(headers: Record<string, unknown> | undefined) {
  if (!headers) return undefined;
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, /authorization|cookie|token|api-key/i.test(key) ? '[REDACTED]' : value]));
}

function summarizeBody(body: unknown) {
  if (body == null) return undefined;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return text.length > 800 ? `${text.slice(0, 800)}…` : text;
}

export const appLogger = getLogger('app', path.join(logDirectory, 'app.log'), { channel: 'app' });
export const inboundLogger = getLogger('inbound', path.join(logDirectory, 'inbound.log'), { channel: 'inbound' });
export const outboundLogger = getLogger('outbound', path.join(logDirectory, 'outbound.log'), { channel: 'outbound' });

export function getExecutionDiagnosisLogger(brandCode: string, runId: number, createdAt: Date): Logger {
  const safeCode = safeSegment(brandCode);
  const timestamp = localTimestamp(createdAt).replace(/[- :]/g, '');
  const fileName = `execution-diagnosis-${timestamp}-run-${runId}.log`;
  return getLogger(`execution-diagnosis:${safeCode}:${runId}`, path.join(logDirectory, safeCode, fileName), { channel: 'execution-diagnosis', brandCode: safeCode, runId });
}

export class PinoNestLogger implements LoggerService {
  log(message: unknown, ...optional: unknown[]) { appLogger.info({ optional }, String(message)); }
  error(message: unknown, ...optional: unknown[]) { appLogger.error({ optional }, String(message)); }
  warn(message: unknown, ...optional: unknown[]) { appLogger.warn({ optional }, String(message)); }
  debug(message: unknown, ...optional: unknown[]) { appLogger.debug({ optional }, String(message)); }
  verbose(message: unknown, ...optional: unknown[]) { appLogger.trace({ optional }, String(message)); }
  fatal(message: unknown, ...optional: unknown[]) { appLogger.fatal({ optional }, String(message)); }
}

export function logInboundRequest(request: HttpRequestLog) { inboundLogger.info({ method: request.method, url: request.url, ip: request.ip, userAgent: request.userAgent, headers: redactHeaders(request.headers), body: summarizeBody(request.body) }, 'incoming request'); }
export function logInboundResponse(response: HttpResponseLog) { inboundLogger.info(response, 'incoming response'); }
export function logOutboundRequest(request: HttpRequestLog) { outboundLogger.info({ method: request.method, url: request.url, headers: redactHeaders(request.headers), body: summarizeBody(request.body) }, 'outgoing request'); }
export function logOutboundResponse(response: HttpResponseLog) { outboundLogger.info(response, 'outgoing response'); }

export async function flushLoggers(): Promise<void> { await Promise.all([...loggers.values()].map((logger) => new Promise<void>((resolve, reject) => logger.flush((error) => error ? reject(error) : resolve())))); }
