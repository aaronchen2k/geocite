const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL
  ?? process.env.NEXT_PUBLIC_API_BASE_URL
  ?? 'http://127.0.0.1:8001/api/v1';

function previewBody(body: BodyInit | null | undefined): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof FormData) return [...body.entries()].map(([key, value]) => `${key}=${typeof value === 'string' ? value : `[File:${value.name}]`}`).join('&');
  return String(body);
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('；');
    if (typeof message === 'string') return message;
  }
  return `HTTP ${status}`;
}

export function buildApiUrl(pathname: string): string {
  return `${apiBaseUrl.replace(/\/$/, '')}/${pathname.replace(/^\/+/, '')}`;
}

export async function requestJson<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const url = buildApiUrl(pathname);
  console.log('>>>>>> Request:', method, url, previewBody(init.body));
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = parseBody(await response.text());
  console.log('<<<<<< Response:', method, url, response.status, body);
  if (!response.ok) throw new Error(errorMessage(response.status, body));
  return body as T;
}

export function logSseRequest(url: string) {
  console.log('>>>>>> Request:', 'SSE', url, '');
}

export function logSseResponse(url: string, payload: unknown) {
  console.log('<<<<<< Response:', 'SSE', url, 200, payload);
}
