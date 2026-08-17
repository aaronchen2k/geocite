# Playwright Positioning Map Report

## Delivered behavior

- Insights question results now include `primaryCategory` and `secondaryCategory` from the frozen run snapshot, falling back to the current brand configuration only for legacy runs without a snapshot.
- The positioning map initially shows only primary taxonomy summaries. Primary and secondary levels are keyboard-accessible buttons with `aria-expanded`.
- Expanding a secondary taxonomy shows question text, leading competitor, leading-competitor mention rate, and current-brand mention rate. Questions without a leading competitor explicitly show `无领先竞品`.

## TDD evidence

- Server RED: `diagnosis-insights-positioning-map.spec.ts` failed because question insights contained only `group`.
- Server GREEN: the same regression plus the existing insights service suite passed after snapshot-backed taxonomy output was added.
- Playwright RED: `positioning-map.spec.ts` failed because the original map had no taxonomy expansion controls.
- Playwright GREEN: the test passed after the nested accessible map was implemented.

## Verification

- `pnpm --dir server test -- diagnosis-insights-positioning-map.spec.ts diagnosis-insights.service.spec.ts`
- `pnpm --dir ui exec playwright test tests/positioning-map.spec.ts`
- `pnpm --dir ui build`
