import {expect, test} from '@playwright/test';
import {normalizeWebReviewAvailability} from '../src/components/engines/web-review-status-cell';

test('falls back to unknown for an API status that is not translatable', () => {
  expect(normalizeWebReviewAvailability(undefined)).toBe('unknown');
  expect(normalizeWebReviewAvailability('stale-status')).toBe('unknown');
});
