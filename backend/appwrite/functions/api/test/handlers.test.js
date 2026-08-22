import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { handlers } from '../src/main.js';

/**
 * Minimal in-memory stand-in for the Appwrite TablesDB repository. It understands
 * the subset of Appwrite query methods the handlers use.
 */
class FakeRepo {
  constructor(tables = {}) {
    this.tables = tables;
    this.sequence = 0;
  }

  static matches(row, query) {
    const parsed = JSON.parse(query);
    const value = parsed.attribute === '$id' ? row.$id : row[parsed.attribute];
    switch (parsed.method) {
      case 'equal':
        return parsed.values.includes(value);
      case 'lessThan':
        return new Date(value) < new Date(parsed.values[0]);
      case 'greaterThan':
        return new Date(value) > new Date(parsed.values[0]);
      default:
        return true;
    }
  }

  rowsOf(tableId) {
    this.tables[tableId] ??= [];
    return this.tables[tableId];
  }

  async list(tableId, queries = []) {
    return this.rowsOf(tableId).filter((row) => queries.every((q) => FakeRepo.matches(row, q)));
  }

  async first(tableId, queries = []) {
    return (await this.list(tableId, queries))[0] ?? null;
  }

  async get(tableId, rowId) {
    return this.rowsOf(tableId).find((row) => row.$id === rowId) ?? null;
  }

  async create(tableId, data, rowId) {
    const row = {
      $id: rowId ?? `row-${++this.sequence}`,
      $createdAt: new Date().toISOString(),
      $updatedAt: new Date().toISOString(),
      ...data,
    };
    this.rowsOf(tableId).push(row);
    return row;
  }

  async update(tableId, rowId, data) {
    const row = await this.get(tableId, rowId);
    Object.assign(row, data, { $updatedAt: new Date().toISOString() });
    return row;
  }

  async remove(tableId, rowId) {
    this.tables[tableId] = this.rowsOf(tableId).filter((row) => row.$id !== rowId);
  }
}

const hourFromNow = (hours) => {
  const base = new Date(Date.now() + hours * 3600_000);
  base.setUTCMinutes(0, 0, 0);
  return base.toISOString();
};

describe('reservation handlers', () => {
  let repo;
  let ctx;

  beforeEach(() => {
    repo = new FakeRepo({
      clubs: [{ $id: 'club-1', name: 'Rocky Mountain', slug: 'rocky-mountain' }],
      memberships: [
        { $id: 'mem-1', club_id: 'club-1', user_id: 'user-1', role: 'member', status: 'approved' },
        { $id: 'mem-2', club_id: 'club-1', user_id: 'user-2', role: 'admin', status: 'approved' },
      ],
      resources: [
        {
          $id: 'res-1',
          club_id: 'club-1',
          name: 'HF Station',
          block_size_minutes: 60,
          is_active: true,
        },
      ],
      resource_access_approvals: [
        { $id: 'app-1', membership_id: 'mem-1', resource_id: 'res-1', status: 'approved' },
      ],
      reservations: [],
      reservation_audit_events: [],
    });
    ctx = { callerId: 'user-1', repo, users: null };
  });

  it('creates a reservation and an audit event', async () => {
    const reservation = await handlers.createReservation(ctx, {
      resourceId: 'res-1',
      startsAt: hourFromNow(2),
      endsAt: hourFromNow(3),
    });

    assert.equal(reservation.membership_id, 'mem-1');
    assert.equal(reservation.status, 'active');
    assert.deepEqual(
      repo.tables.reservation_audit_events.map((event) => event.event_type),
      ['created'],
    );
  });

  it('rejects overlapping reservations', async () => {
    await handlers.createReservation(ctx, {
      resourceId: 'res-1',
      startsAt: hourFromNow(2),
      endsAt: hourFromNow(4),
    });

    await assert.rejects(
      handlers.createReservation(ctx, {
        resourceId: 'res-1',
        startsAt: hourFromNow(3),
        endsAt: hourFromNow(5),
      }),
      /overlaps with an existing reservation/,
    );
  });

  it('rejects reservations without approved resource access', async () => {
    repo.tables.resource_access_approvals[0].status = 'pending';

    await assert.rejects(
      handlers.createReservation(ctx, {
        resourceId: 'res-1',
        startsAt: hourFromNow(2),
        endsAt: hourFromNow(3),
      }),
      /approved access to this resource/,
    );
  });

  it('lets a club admin cancel someone else\u2019s reservation', async () => {
    const reservation = await handlers.createReservation(ctx, {
      resourceId: 'res-1',
      startsAt: hourFromNow(2),
      endsAt: hourFromNow(3),
    });

    const cancelled = await handlers.cancelReservation(
      { ...ctx, callerId: 'user-2' },
      { reservationId: reservation.id, notes: 'Station maintenance' },
    );

    assert.equal(cancelled.status, 'cancelled');
    assert.equal(repo.tables.reservation_audit_events.at(-1).notes, 'Station maintenance');
  });

  it('refuses cancellation by an unrelated user', async () => {
    const reservation = await handlers.createReservation(ctx, {
      resourceId: 'res-1',
      startsAt: hourFromNow(2),
      endsAt: hourFromNow(3),
    });

    await assert.rejects(
      handlers.cancelReservation({ ...ctx, callerId: 'user-3' }, { reservationId: reservation.id }),
      /do not have permission/,
    );
  });

  it('cancels upcoming reservations when a membership is denied', async () => {
    const reservation = await handlers.createReservation(ctx, {
      resourceId: 'res-1',
      startsAt: hourFromNow(2),
      endsAt: hourFromNow(3),
    });

    await handlers.setMembershipStatus(
      { ...ctx, callerId: 'user-2' },
      { membershipId: 'mem-1', status: 'denied' },
    );

    assert.equal((await repo.get('reservations', reservation.id)).status, 'cancelled');
  });
});

describe('membership handlers', () => {
  let repo;
  let adminCtx;

  beforeEach(() => {
    repo = new FakeRepo({
      clubs: [{ $id: 'club-1', name: 'Rocky Mountain', slug: 'rocky-mountain' }],
      memberships: [
        { $id: 'mem-1', club_id: 'club-1', user_id: 'user-1', role: 'member', status: 'pending' },
        { $id: 'mem-2', club_id: 'club-1', user_id: 'user-2', role: 'admin', status: 'approved' },
      ],
    });
    adminCtx = { callerId: 'user-2', repo, users: null };
  });

  it('refuses role changes from non-admins', async () => {
    await assert.rejects(
      handlers.setMemberRole(
        { ...adminCtx, callerId: 'user-1' },
        { membershipId: 'mem-1', role: 'admin' },
      ),
      /Only a club admin/,
    );
  });

  it('refuses to change the caller\u2019s own role', async () => {
    await assert.rejects(
      handlers.setMemberRole(adminCtx, { membershipId: 'mem-2', role: 'member' }),
      /cannot change their own role/,
    );
  });

  it('creates a club with an approved admin membership for the creator', async () => {
    const emptyRepo = new FakeRepo({ clubs: [], memberships: [] });
    const club = await handlers.createClub(
      { callerId: 'user-9', repo: emptyRepo, users: null },
      { name: 'New Club', slug: 'new-club' },
    );

    assert.equal(club.slug, 'new-club');
    assert.deepEqual(emptyRepo.tables.memberships[0].role, 'admin');
    assert.deepEqual(emptyRepo.tables.memberships[0].status, 'approved');
  });

  it('rejects a duplicate club slug', async () => {
    await assert.rejects(
      handlers.createClub(adminCtx, { name: 'Another', slug: 'rocky-mountain' }),
      /already taken/,
    );
  });
});
