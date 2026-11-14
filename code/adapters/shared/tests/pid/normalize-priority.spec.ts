import { Priority } from '@jfrz38/adaptive-admission-node';
import { describe, expect, test } from 'vitest';

import { normalizePriority } from '../../src/pid/normalize-priority';

describe('normalizePriority', () => {
  test('converts an extracted tier into a host priority', () => {
    const priority = normalizePriority({ header: '2' }, { getPriority: (request) => request.header });

    expect(Math.floor(priority.value / Priority.COHORTS_PER_TIER)).toBe(2);
  });

  test.each([
    ['missing extractor', undefined],
    ['non-numeric value', { getPriority: () => 'invalid' }],
    ['non-finite value', { getPriority: () => Number.POSITIVE_INFINITY }],
    ['throwing extractor', { getPriority: () => { throw new Error('invalid application priority'); } }],
  ])('uses the default priority for a %s', (_description, options) => {
    const priority = normalizePriority({}, options);
    expect(Math.floor(priority.value / Priority.COHORTS_PER_TIER)).toBe(Priority.TIERS - 1);
  });
});
