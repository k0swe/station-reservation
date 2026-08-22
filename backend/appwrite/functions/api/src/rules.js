/**
 * Pure business rules shared by the API function handlers.
 *
 * These used to live in Postgres `SECURITY DEFINER` functions; with Appwrite they
 * are enforced here, in the only code path that is allowed to write rows.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Error type whose message is safe to return to the caller. */
export class RuleError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'RuleError';
    this.status = status;
  }
}

/**
 * Normalizes an optional club slug, rejecting anything that is not URL safe.
 *
 * @param {string | null | undefined} slug
 * @returns {string | null}
 */
export function normalizeSlug(slug) {
  const trimmed = (slug ?? '').trim();
  if (!trimmed) {
    return null;
  }
  if (!SLUG_PATTERN.test(trimmed)) {
    throw new RuleError('Invalid slug format: use lowercase letters, numbers, and hyphens only');
  }
  return trimmed;
}

/**
 * Parses an ISO-8601 timestamp.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Date}
 */
export function parseTimestamp(value, label) {
  const parsed = new Date(String(value ?? ''));
  if (Number.isNaN(parsed.getTime())) {
    throw new RuleError(`${label} must be a valid ISO-8601 timestamp`);
  }
  return parsed;
}

/**
 * Validates a requested reservation window against the resource block size.
 *
 * Rules (ported from the `create_reservation` SQL function):
 *   - `endsAt` must be after `startsAt`.
 *   - the duration must be a whole multiple of the block size.
 *   - `startsAt` must be aligned to a block boundary, counted from the Unix epoch.
 *
 * @param {Date} startsAt
 * @param {Date} endsAt
 * @param {number} blockSizeMinutes
 */
export function assertReservationWindow(startsAt, endsAt, blockSizeMinutes) {
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new RuleError('ends_at must be after starts_at');
  }

  if (!Number.isInteger(blockSizeMinutes) || blockSizeMinutes <= 0) {
    throw new RuleError('Resource has an invalid block size');
  }

  const blockMs = blockSizeMinutes * 60 * 1000;

  if ((endsAt.getTime() - startsAt.getTime()) % blockMs !== 0) {
    throw new RuleError(
      `Reservation duration must be a whole multiple of the block size (${blockSizeMinutes} minutes)`,
    );
  }

  if (startsAt.getTime() % blockMs !== 0) {
    throw new RuleError(
      `Reservation start time must be aligned to a block boundary (${blockSizeMinutes} minutes)`,
    );
  }
}

/**
 * Half-open `[start, end)` overlap test, matching the Postgres `tstzrange` behavior.
 *
 * @param {Date | string} aStart
 * @param {Date | string} aEnd
 * @param {Date | string} bStart
 * @param {Date | string} bEnd
 * @returns {boolean}
 */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

/**
 * Appwrite row IDs are used where Postgres used UUIDs; club lookups still accept
 * either a slug or an ID.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function looksLikeSlug(value) {
  return SLUG_PATTERN.test(value);
}
