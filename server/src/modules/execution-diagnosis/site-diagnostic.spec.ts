import { inspectHtml, sitemapLocations } from './site-diagnostic';

describe('site diagnostic helpers', () => {
  it('提取 sitemap 中的页面地址', () => {
    expect(sitemapLocations('<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>')).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('统计页面的结构化与可引用信号', () => {
    expect(inspectHtml('<html><head><link rel="canonical" href="https://example.com" /><script type="application/ld+json">{}</script></head><body><h1>标题</h1><h2>小节</h2><p>一段可引用的正文内容。</p></body></html>')).toMatchObject({ canonicalCount: 1, jsonLdCount: 1, headingCount: 2, paragraphCount: 1 });
  });
});
