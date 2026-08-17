# Playwright whole-branch important fixes

## TDD record

### Red

- `LocalChromeService` regression tests showed that a SIGTERM was treated as a completed close after only one process enumeration, and that a still-live controlled process could have its profile deleted.
- Category migration test showed legacy `group = 品牌基础提问` and `group = 竞品对比提问` were both overwritten by the core-capability fallback.
- Insights test showed the web-review summary did not expose the frozen candidate total and derived its minimum target from all API samples.
- Insights test showed a successful web review corrected the brand boolean while competitor rates, leading competitor, lost-question matrix, and returned sample answer still used the API answer.

### Green

- SIGTERM now requires a fresh controlled-Chrome enumeration to be absent before the launch is closed; a persistent process remains `running` and `deleteProfile` returns 409.
- `LEGACY_GROUP_CATEGORY_MAP` explicitly maps each historical first-level group to an auditable second-level category. Unknown legacy values alone take the core-capability fallback; question text is preserved.
- `webReviewSummary` returns `candidateTotal`; `minimumTarget` is `ceil(candidateTotal * minimumRate)` from `configurationSnapshot.webReview.candidateSampleIds`.
- A successful web review supplies a whole-sample replacement answer for competitor matrices, leading competitors, positioning-map question insight, sources, and returned samples. Brand mention uses the explicit reviewed boolean when present, otherwise parses that same effective answer; that brand-only boolean cannot be misapplied as a competitor result.

## Verification

- `server`: `npm test -- local-chrome.service.spec.ts diagnosis-configuration.service.spec.ts diagnosis-insights.service.spec.ts` — 28 passed.
- `server`: `npm run build` — passed.
- `ui`: `npm run build` — passed.
- `ui`: `npm test -- optimization-verification.spec.ts` — the added web-review evidence/UI assertion passed. One pre-existing route sequence test failed because the shared page state had no selected Brand (`暂无 Brand`), so the work-order form correctly did not render; this is outside these changes. Result: 5 passed, 1 failed.

## Commit

- Implementation: `2644987` (`fix: harden playwright web review evidence`).
