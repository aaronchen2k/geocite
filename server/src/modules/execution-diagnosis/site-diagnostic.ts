export type FetchedPage = { url: string; status: number; html: string; contentType: string | null };

export function sitemapLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim()).filter((url) => /^https?:\/\//i.test(url));
}

export function inspectHtml(html: string) {
  return {
    canonicalCount: (html.match(/<link\b[^>]*\brel=["']?canonical["']?[^>]*>/gi) ?? []).length,
    jsonLdCount: (html.match(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>/gi) ?? []).length,
    headingCount: (html.match(/<h[1-6]\b/gi) ?? []).length,
    paragraphCount: (html.match(/<p\b/gi) ?? []).length,
  };
}

export async function fetchPage(url: string, userAgent: string, signal?: AbortSignal): Promise<FetchedPage> {
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(url, { headers: { 'user-agent': userAgent, accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' }, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  return { url, status: response.status, html: await response.text(), contentType: response.headers.get('content-type') };
}
