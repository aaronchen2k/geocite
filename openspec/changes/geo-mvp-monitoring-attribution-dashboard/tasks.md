## 1. Product foundation and data model

- [ ] 1.1 Establish the application skeleton, environment configuration, migration strategy, and project-level access boundary.
- [ ] 1.2 Define project, brand alias, keyword, competitor, platform configuration, monitoring schedule, and notification preference models.
- [ ] 1.3 Define immutable monitoring run, answer evidence, mention finding, source reference, alert, attribution result, metric snapshot, and report models.
- [ ] 1.4 Add schema validation, rule/model version fields, timestamps, status enums, indexes, and retention hooks for all MVP entities.
- [ ] 1.5 Add seed fixtures and deterministic replay samples for successful, unavailable, negative, low-match, and insufficient-data cases.

## 2. Monitoring configuration and platform collection

- [ ] 2.1 Implement project monitoring configuration APIs and validation for brands, aliases, keywords, competitors, platforms, sampling, language, and region.
- [ ] 2.2 Implement the platform adapter contract for query execution, response normalization, rate limiting, timeout, and failure states.
- [ ] 2.3 Implement the first legally permitted AI platform adapter and a replay adapter for local testing.
- [ ] 2.4 Implement asynchronous scheduling, queue execution, retry/backoff, idempotency, per-platform limits, and run status transitions.
- [ ] 2.5 Persist redacted raw answer evidence, query metadata, execution metadata, evidence hash, and parser diagnostics.
- [ ] 2.6 Implement mention detection, alias matching, recommendation level classification, context extraction, and semantic accuracy result persistence.
- [ ] 2.7 Implement keyword-level aggregation for mention rate, recommendation tiers, valid sample counts, and time-series snapshots.
- [ ] 2.8 Run the same normalized query context for configured competitors and expose comparable brand/competitor results.
- [ ] 2.9 Add negative/error rule configuration, alert creation, deduplication, quiet windows, and pluggable notification delivery.
- [ ] 2.10 Add adapter contract tests and end-to-end replay tests for success, timeout, rate limit, parse failure, mention, non-mention, competitor, and alert scenarios.

## 3. Attribution analysis

- [ ] 3.1 Implement content asset URL registration and authorized website scan job management.
- [ ] 3.2 Implement crawler/robots accessibility and structured data detection for Schema.org and JSON-LD, including explicit unavailable states.
- [ ] 3.3 Implement content extraction and asset metadata needed for semantic matching and E-E-A-T analysis with redaction and size limits.
- [ ] 3.4 Implement versioned embedding configuration, intent/content vector generation, cosine similarity, thresholding, and low-efficiency asset findings.
- [ ] 3.5 Implement source extraction/classification and configurable source weights for central media, industry media, self-media, and ordinary sites.
- [ ] 3.6 Implement versioned E-E-A-T scoring, dimension breakdown, evidence, and actionable low-score recommendations.
- [ ] 3.7 Implement attribution aggregation linking findings to monitoring evidence, with coverage and unavailable states instead of fabricated scores.
- [ ] 3.8 Add deterministic tests for similarity thresholds, source tiers, E-E-A-T explanations, structured data, crawler blocking, and incomplete analysis.

## 4. Dashboard and reporting

- [ ] 4.1 Implement metric snapshot calculation for citation rate, recommendation tiers, keyword trends, competitor comparison, content health, and monitoring coverage.
- [ ] 4.2 Implement the digital asset index formula, configurable weights, component breakdown, sample sufficiency checks, and calculation versioning.
- [ ] 4.3 Implement dashboard APIs with project/time-range filters, data-quality metadata, drill-down links to evidence, and project authorization.
- [ ] 4.4 Build the monitoring configuration and run-status UI.
- [ ] 4.5 Build the evidence detail, attribution analysis, negative alert, and competitor comparison UI.
- [ ] 4.6 Build the trend dashboard with index components, sample counts, failure rates, coverage, and insufficient-data states.
- [ ] 4.7 Implement weekly/monthly report generation from fixed metric snapshots, including changes, competitor results, alerts, actions, coverage, and recommendations.
- [ ] 4.8 Implement report preview/download and display generation time, period, sample quality, rule versions, and access checks.
- [ ] 4.9 Add UI/API tests for populated, empty, insufficient-data, failed-task, and cross-project access scenarios.

## 5. Security, operations, and MVP validation

- [ ] 5.1 Add secrets handling, request logging without raw sensitive content, audit events, rate-limit metrics, and failure monitoring.
- [ ] 5.2 Add retention/deletion controls for raw evidence and document platform terms/compliance checks for each enabled adapter.
- [ ] 5.3 Add feature flags to disable an adapter or external collection while preserving historical evidence and dashboard/report access.
- [ ] 5.4 Run a full seeded-data acceptance flow from project setup through collection, attribution, dashboard, alert, and report generation.
- [ ] 5.5 Validate MVP acceptance criteria with GEO engineer and marketing-owner scenarios, including evidence traceability and data-quality messaging.
- [ ] 5.6 Document deferred V1.0/V2.0 capabilities: content generation, knowledge base, publishing/collection tracking, multi-tenancy, packages, and public API.
