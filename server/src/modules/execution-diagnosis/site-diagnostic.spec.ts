import { inspectHtml, sitemapLocations, websiteUnavailableResult } from './site-diagnostic';

describe('site diagnostic helpers', () => {
  it('将网站不可访问原因转换为页面可读的诊断结果', () => {
    expect(websiteUnavailableResult('https://example.com', 403)).toEqual({
      conclusion: 'failed',
      severity: 'P0',
      evidence: { website: 'https://example.com', message: '网站无法访问：服务器返回 HTTP 403。' },
      recommendation: 'restore-site-access',
    });
  });

  it('提取 sitemap 中的页面地址', () => {
    expect(sitemapLocations('<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>')).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('统计页面的结构化与可引用信号', () => {
    expect(inspectHtml('<html><head><link rel="canonical" href="https://example.com" /><script type="application/ld+json">{}</script></head><body><h1>标题</h1><h2>小节</h2><p>一段可引用的正文内容。</p></body></html>')).toMatchObject({ canonicalCount: 1, jsonLdCount: 1, headingCount: 2, paragraphCount: 1 });
  });
});
