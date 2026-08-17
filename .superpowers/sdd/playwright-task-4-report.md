# Task 4 report: web-review status and evidence basis

## Delivered

- Engine list responses now include `webReview` availability and timestamps.
- The engine table places the web-review state before the actions column and limits it to unavailable, login required, or ready. Unavailable states include the latest failure reason.
- Per-engine refresh and reset actions call the existing web-review APIs, lock while running, and make the reset guarantee explicit: it closes only the Chrome window launched by this application and retains cookies. Clearing the dedicated login profile remains behind a separate confirmation.
- Diagnosis insights now return `webReviewSummary` with API population, target, selection sources, successful reviews, and grouped exclusion reasons. Successful browser-review results override the matching API sample for brand-mention metrics.
- The diagnosis report renders the evidence counts, correction status, and fixed API/browser-review explanation.

## Verification

- `pnpm --dir server test -- diagnosis-insights.service.spec.ts` — passed.
- `pnpm --dir server build` — passed.
- `pnpm --dir ui exec tsc --noEmit` — passed.
- `pnpm --dir ui exec playwright test tests/optimization-verification.spec.ts` — passed (6/6).
- `pnpm --dir ui build` — passed.

## Scope note

Task 4 does not modify taxonomy configuration or its old editable ratios. The report continues to render the read-only group values returned by the server.
