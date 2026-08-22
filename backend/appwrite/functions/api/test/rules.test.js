import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RuleError,
  assertReservationWindow,
  looksLikeSlug,
  normalizeSlug,
  parseTimestamp,
  rangesOverlap,
} from '../src/rules.js';

describe('normalizeSlug', () => {
  it('returns null for blank slugs', () => {
    assert.equal(normalizeSlug(null), null);
    assert.equal(normalizeSlug('   '), null);
  });

  it('accepts lowercase hyphenated slugs', () => {
    assert.equal(normalizeSlug(' rocky-mountain-1 '), 'rocky-mountain-1');
  });

  it('rejects invalid slugs', () => {
    assert.throws(() => normalizeSlug('Not A Slug'), RuleError);
    assert.throws(() => normalizeSlug('-leading'), RuleError);
  });
});

describe('parseTimestamp', () => {
  it('parses ISO-8601 strings', () => {
    assert.equal(parseTimestamp('2026-05-22T00:00:00Z', 'from').toISOString(), '2026-05-22T00:00:00.000Z');
  });

  it('rejects garbage', () => {
    assert.throws(() => parseTimestamp('not-a-date', 'from'), RuleError);
  });
});

describe('assertReservationWindow', () => {
  const start = new Date('2026-05-22T01:00:00Z');

  it('accepts a whole number of aligned blocks', () => {
    assert.doesNotThrow(() => assertReservationWindow(start, new Date('2026-05-22T03:00:00Z'), 60));
  });

  it('rejects an end time at or before the start time', () => {
    assert.throws(() => assertReservationWindow(start, start, 60), /ends_at must be after starts_at/);
  });

  it('rejects durations that are not a multiple of the block size', () => {
    assert.throws(
      () => assertReservationWindow(start, new Date('2026-05-22T01:30:00Z'), 60),
      /whole multiple of the block size \(60 minutes\)/,
    );
  });

  it('rejects start times that are not aligned to a block boundary', () => {
    assert.throws(
      () => assertReservationWindow(new Date('2026-05-22T01:10:00Z'), new Date('2026-05-22T02:10:00Z'), 60),
      /aligned to a block boundary \(60 minutes\)/,
    );
  });

  it('aligns 30 minute blocks to the half hour', () => {
    assert.doesNotThrow(() =>
      assertReservationWindow(new Date('2026-05-22T01:30:00Z'), new Date('2026-05-22T02:00:00Z'), 30),
    );
  });
});

describe('rangesOverlap', () => {
  it('treats ranges as half-open', () => {
    assert.equal(
      rangesOverlap('2026-05-22T01:00:00Z', '2026-05-22T02:00:00Z', '2026-05-22T02:00:00Z', '2026-05-22T03:00:00Z'),
      false,
    );
    assert.equal(
      rangesOverlap('2026-05-22T01:00:00Z', '2026-05-22T03:00:00Z', '2026-05-22T02:00:00Z', '2026-05-22T04:00:00Z'),
      true,
    );
  });
});

describe('looksLikeSlug', () => {
  it('recognizes URL-safe slugs only', () => {
    assert.equal(looksLikeSlug('rocky-mountain'), true);
    assert.equal(looksLikeSlug('Rocky Mountain'), false);
  });
});
