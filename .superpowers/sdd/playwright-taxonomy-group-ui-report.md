# Playwright taxonomy group UI report

## Scope

- Basic configuration UI only: fixed category weights are rendered in ordered primary-category groups.
- Locale strings used by the sampling-scope UI were moved into the existing Chinese and English `BasicConfiguration` message namespaces.
- No server, database, taxonomy values, generation rules, or save payload fields changed.

## TDD evidence

1. Extended the Playwright fixture with all eight fixed taxonomy weights and asserted the three group headings, item labels, percentages, examples, and absence of the previous `primary · secondary` item presentation.
2. Ran the focused test before implementation. It failed as expected because `[data-testid="fixed-category-weight-groups"]` did not exist.
3. Implemented UI-only ordered grouping by `primaryCategory` and reran the focused test successfully.

## Verification

```text
pnpm exec playwright test tests/home.spec.ts --grep 'groups fixed category weights by primary category in basic configuration'
1 passed (6.7s)

pnpm build
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages
```
