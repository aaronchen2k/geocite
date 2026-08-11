# GeoCite

> A Generative Engine Optimization (GEO) platform for AI search engines—measuring, explaining, optimizing, and reporting how brands appear in AI-generated answers.

[中文文档](README.zh-CN.md)

## MVP

The first release focuses on the visibility loop: **monitor → attribute → report**.

### AI visibility monitoring

- Monitor whether a brand appears in selected AI platforms and record answer evidence.
- Track citation rate, recommendation tier, context accuracy, and keyword trends.
- Compare the same queries against configured competitors.
- Alert on incorrect or unfavorable AI answers.

### Attribution analysis

- Match content assets to search intent using semantic similarity.
- Analyze source classes and their relative weights.
- Score content against E-E-A-T dimensions with actionable findings.
- Check authorized websites for Schema.org/JSON-LD and AI crawler accessibility.

### Dashboard and reporting

- Visualize citation trends, keyword changes, competitor performance, content health, and monitoring coverage.
- Calculate a versioned digital asset index from explainable component metrics.
- Generate weekly and monthly reports from fixed metric snapshots.

## Deferred scope

The following capabilities are planned for later releases and are not part of the MVP:

- AI content generation and optimization suggestions
- Knowledge-base ingestion and reuse
- Multi-platform publishing and indexing tracking
- Multi-tenancy, packaging/billing, and public APIs

## Product principles

- **Evidence first:** retain answer evidence and collection metadata for review.
- **Explainable metrics:** keep rule/model versions, component scores, coverage, and sample counts visible.
- **Responsible collection:** respect platform access constraints, rate limits, and applicable terms.
- **No false certainty:** show unavailable and insufficient-data states instead of fabricating scores.

## Planning documents

- [MVP proposal](openspec/changes/geo-mvp-monitoring-attribution-dashboard/proposal.md)
- [Technical design](openspec/changes/geo-mvp-monitoring-attribution-dashboard/design.md)
- [Requirements](openspec/changes/geo-mvp-monitoring-attribution-dashboard/specs/)
- [Implementation tasks](openspec/changes/geo-mvp-monitoring-attribution-dashboard/tasks.md)

## License

GeoCite is licensed under the [GeoCite.net License v1.1](LICENSE.md), a source-available license based on Apache 2.0 with additional commercial restrictions.

For commercial licensing, contact [license@geocite.net](mailto:license@geocite.net).
