# Playwright final UI fix report

## Scope

- API-only diagnosis evidence wording and explicit response evidence basis.
- Chinese navigation terminology and the three specified home-page regressions.
- A narrow locator repair discovered during the full browser run.

## Diagnosis

1. The report used `webReviewSummary.succeeded` only for a short status label, while its detailed sentence always claimed that final metrics were corrected by web-review samples. Zero successful reviews therefore produced contradictory evidence claims.
2. `diagnosisRoom` was rendered as `诊断`, despite the approved navigation term and test requirement being `诊断室`.
3. The verification and improvement routes had changed from static guidance pages to functional pages. With no selected Brand, their task/activation guidance disappeared behind the empty state. The required explanation was a product regression, not a stale assertion.
4. The AI question-suggestion test selected the generic text `场景`; the new taxonomy summary made that text non-unique. The dialog's full classification label is the stable user-visible target.

## Changes

- `DiagnosisInsightsService` now emits `evidenceBasis` as either `web-review-corrected` or `api-reference-only`.
- The report renders the exact API-only statement and does not render the correction claim unless the response basis is `web-review-corrected`.
- Verification and improvement flows show compact, non-interactive guidance before Brand selection, while retaining their functional controls once a Brand is selected.
- The Chinese sidebar restores `诊断室`.
- Playwright tests pin Chinese locale where Chinese copy is asserted, cover the API-only negative claim, and scope the taxonomy assertion to its dialog.

## Verification

Passed before the unrelated positioning-map work entered the shared tree:

```text
pnpm --dir server exec jest src/modules/execution-diagnosis/diagnosis-insights.service.spec.ts --runInBand
1 passed

pnpm --dir ui exec playwright test tests/home.spec.ts --grep "separates configuration|explains how each verification|explains the target and concrete" --workers=1
3 passed

pnpm --dir ui exec playwright test tests/optimization-verification.spec.ts --grep "does not claim correction" --workers=1
1 passed
```

The subsequent all-suite single-worker run reached the new shared `positioning-map.spec.ts` and failed because its expected expandable primary-taxonomy control has not yet been implemented in that concurrently added feature. That failure is outside this repair's scope. The first run also exposed the now-fixed ambiguous `场景` selector.
