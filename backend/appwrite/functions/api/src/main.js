import { Client, ID, Query, TablesDB, Users } from 'node-appwrite';
import {
  RuleError,
  assertReservationWindow,
  looksLikeSlug,
  normalizeSlug,
  parseTimestamp,
  rangesOverlap,
} from './rules.js';

const TABLES = {
  clubs: 'clubs',
  users: 'users',
  memberships: 'memberships',
  resources: 'resources',
  approvals: 'resource_access_approvals',
  reservations: 'reservations',
  auditEvents: 'reservation_audit_events',
};

const PAGE_SIZE = 100;

/** Converts an Appwrite row into the shape the web client expects. */
function mapRow(row) {
  const mapped = { id: row.$id, created_at: row.$createdAt, updated_at: row.$updatedAt };
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith('$')) {
      mapped[key] = value;
    }
  }
  return mapped;
}

class Repository {
  constructor(tablesDB, databaseId) {
    this.tablesDB = tablesDB;
    this.databaseId = databaseId;
  }

  /** Lists every row matching the queries, following pagination. */
  async list(tableId, queries = []) {
    const collected = [];
    let cursor = null;

    for (;;) {
      const pageQueries = [...queries, Query.limit(PAGE_SIZE)];
      if (cursor) {
        pageQueries.push(Query.cursorAfter(cursor));
      }

      const page = await this.tablesDB.listRows({
        databaseId: this.databaseId,
        tableId,
        queries: pageQueries,
      });

      collected.push(...page.rows);
      if (page.rows.length < PAGE_SIZE) {
        return collected;
      }
      cursor = page.rows[page.rows.length - 1].$id;
    }
  }

  async first(tableId, queries = []) {
    const page = await this.tablesDB.listRows({
      databaseId: this.databaseId,
      tableId,
      queries: [...queries, Query.limit(1)],
    });
    return page.rows[0] ?? null;
  }

  async get(tableId, rowId) {
    try {
      return await this.tablesDB.getRow({ databaseId: this.databaseId, tableId, rowId });
    } catch (err) {
      if (err?.code === 404) {
        return null;
      }
      throw err;
    }
  }

  create(tableId, data, rowId = ID.unique()) {
    return this.tablesDB.createRow({ databaseId: this.databaseId, tableId, rowId, data });
  }

  update(tableId, rowId, data) {
    return this.tablesDB.updateRow({ databaseId: this.databaseId, tableId, rowId, data });
  }

  remove(tableId, rowId) {
    return this.tablesDB.deleteRow({ databaseId: this.databaseId, tableId, rowId });
  }
}

/** Approved membership of the caller in a club, or null. */
async function callerMembership(ctx, clubId) {
  return ctx.repo.first(TABLES.memberships, [
    Query.equal('club_id', clubId),
    Query.equal('user_id', ctx.callerId),
  ]);
}

async function isClubAdmin(ctx, clubId) {
  const membership = await callerMembership(ctx, clubId);
  return membership?.role === 'admin' && membership?.status === 'approved';
}

async function assertClubAdmin(ctx, clubId, message) {
  if (!(await isClubAdmin(ctx, clubId))) {
    throw new RuleError(message, 403);
  }
}

async function ensureProfile(ctx) {
  const existing = await ctx.repo.get(TABLES.users, ctx.callerId);
  if (existing) {
    return existing;
  }

  const account = await ctx.users.get({ userId: ctx.callerId });
  const email = account.email || null;
  return ctx.repo.create(
    TABLES.users,
    {
      email,
      display_name: account.name || (email ? email.split('@')[0] : null),
      callsign: account.prefs?.callsign || null,
      phone_number: account.prefs?.phone_number || null,
    },
    ctx.callerId,
  );
}

/** Builds a lookup of user profiles keyed by user id. */
async function profilesByUserId(ctx, userIds) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) {
    return new Map();
  }

  const rows = await ctx.repo.list(TABLES.users, [Query.equal('$id', unique)]);
  return new Map(rows.map((row) => [row.$id, row]));
}

const handlers = {
  async listClubs(ctx) {
    const rows = await ctx.repo.list(TABLES.clubs, [Query.orderAsc('name')]);
    return rows.map(mapRow);
  },

  async createClub(ctx, payload) {
    const name = String(payload.name ?? '').trim();
    if (!name) {
      throw new RuleError('Club name is required');
    }
    const slug = normalizeSlug(payload.slug);

    if (slug) {
      const clash = await ctx.repo.first(TABLES.clubs, [Query.equal('slug', slug)]);
      if (clash) {
        throw new RuleError('That club URL is already taken');
      }
    }

    const club = await ctx.repo.create(TABLES.clubs, { name, slug });
    await ctx.repo.create(TABLES.memberships, {
      club_id: club.$id,
      user_id: ctx.callerId,
      role: 'admin',
      status: 'approved',
    });

    return mapRow(club);
  },

  async getClub(ctx, payload) {
    const identifier = String(payload.identifier ?? '').trim();
    if (!identifier) {
      return null;
    }

    if (looksLikeSlug(identifier)) {
      const bySlug = await ctx.repo.first(TABLES.clubs, [Query.equal('slug', identifier)]);
      if (bySlug) {
        return mapRow(bySlug);
      }
    }

    const byId = await ctx.repo.get(TABLES.clubs, identifier);
    return byId ? mapRow(byId) : null;
  },

  async isClubAdmin(ctx, payload) {
    return isClubAdmin(ctx, String(payload.clubId));
  },

  async listClubResources(ctx, payload) {
    const clubId = String(payload.clubId);
    const membership = await callerMembership(ctx, clubId);
    const admin = membership?.role === 'admin' && membership?.status === 'approved';

    const rows = await ctx.repo.list(TABLES.resources, [
      Query.equal('club_id', clubId),
      Query.orderAsc('name'),
    ]);

    // Members only see active resources; admins see everything.
    return rows.filter((row) => admin || row.is_active).map(mapRow);
  },

  async createResource(ctx, payload) {
    const clubId = String(payload.clubId);
    await assertClubAdmin(ctx, clubId, 'Only a club admin may create resources');

    const row = await ctx.repo.create(TABLES.resources, {
      club_id: clubId,
      name: String(payload.name ?? '').trim(),
      description: payload.description ?? null,
      block_size_minutes: Number(payload.blockSizeMinutes),
      is_active: payload.isActive ?? true,
    });
    return mapRow(row);
  },

  async updateResource(ctx, payload) {
    const resource = await ctx.repo.get(TABLES.resources, String(payload.resourceId));
    if (!resource) {
      throw new RuleError('Resource not found', 404);
    }
    await assertClubAdmin(ctx, resource.club_id, 'Only a club admin may update resources');

    const row = await ctx.repo.update(TABLES.resources, resource.$id, {
      name: String(payload.name ?? '').trim(),
      description: payload.description ?? null,
      block_size_minutes: Number(payload.blockSizeMinutes),
      is_active: Boolean(payload.isActive),
    });
    return mapRow(row);
  },

  async deleteResource(ctx, payload) {
    const resource = await ctx.repo.get(TABLES.resources, String(payload.resourceId));
    if (!resource) {
      throw new RuleError('Resource not found', 404);
    }
    await assertClubAdmin(ctx, resource.club_id, 'Only a club admin may delete resources');

    await ctx.repo.remove(TABLES.resources, resource.$id);
    return null;
  },

  async requestMembership(ctx, payload) {
    const clubId = String(payload.clubId);
    const club = await ctx.repo.get(TABLES.clubs, clubId);
    if (!club) {
      throw new RuleError('Club not found', 404);
    }

    const existing = await callerMembership(ctx, clubId);
    if (existing) {
      return mapRow(existing);
    }

    await ensureProfile(ctx);
    const row = await ctx.repo.create(TABLES.memberships, {
      club_id: clubId,
      user_id: ctx.callerId,
      role: 'member',
      status: 'pending',
    });
    return mapRow(row);
  },

  async getUserMembership(ctx, payload) {
    const membership = await callerMembership(ctx, String(payload.clubId));
    return membership ? mapRow(membership) : null;
  },

  async listClubMembershipRequests(ctx, payload) {
    const clubId = String(payload.clubId);
    await assertClubAdmin(ctx, clubId, 'Only a club admin may view membership requests');

    const memberships = (
      await ctx.repo.list(TABLES.memberships, [
        Query.equal('club_id', clubId),
        Query.orderAsc('$createdAt'),
      ])
    ).filter((membership) => membership.user_id !== ctx.callerId);

    const profiles = await profilesByUserId(
      ctx,
      memberships.map((membership) => membership.user_id),
    );

    return memberships.map((membership) => ({
      ...mapRow(membership),
      user_display_name: profiles.get(membership.user_id)?.display_name ?? null,
      user_callsign: profiles.get(membership.user_id)?.callsign ?? null,
    }));
  },

  async setMembershipStatus(ctx, payload) {
    const status = String(payload.status);
    if (!['approved', 'denied'].includes(status)) {
      throw new RuleError('Invalid status: must be approved or denied');
    }

    const membership = await ctx.repo.get(TABLES.memberships, String(payload.membershipId));
    if (!membership) {
      throw new RuleError('Membership not found', 404);
    }
    await assertClubAdmin(
      ctx,
      membership.club_id,
      'Only a club admin may approve or deny memberships',
    );

    const updated = await ctx.repo.update(TABLES.memberships, membership.$id, { status });

    if (status === 'denied') {
      // Cancel every upcoming reservation that belonged to the denied member.
      const now = new Date().toISOString();
      const upcoming = await ctx.repo.list(TABLES.reservations, [
        Query.equal('membership_id', membership.$id),
        Query.equal('status', 'active'),
        Query.greaterThan('starts_at', now),
      ]);

      for (const reservation of upcoming) {
        await ctx.repo.update(TABLES.reservations, reservation.$id, { status: 'cancelled' });
        await ctx.repo.create(TABLES.auditEvents, {
          reservation_id: reservation.$id,
          event_type: 'cancelled',
          actor_user_id: ctx.callerId,
          notes: 'Cancelled because membership was denied',
        });
      }
    }

    return mapRow(updated);
  },

  async setMemberRole(ctx, payload) {
    const role = String(payload.role);
    if (!['admin', 'member'].includes(role)) {
      throw new RuleError('Invalid role: must be admin or member');
    }

    const membership = await ctx.repo.get(TABLES.memberships, String(payload.membershipId));
    if (!membership) {
      throw new RuleError('Membership not found', 404);
    }
    await assertClubAdmin(ctx, membership.club_id, 'Only a club admin may change member roles');

    if (membership.user_id === ctx.callerId) {
      throw new RuleError('A club admin cannot change their own role', 403);
    }

    if (membership.role === 'admin' && role === 'member') {
      const otherAdmins = (
        await ctx.repo.list(TABLES.memberships, [
          Query.equal('club_id', membership.club_id),
          Query.equal('role', 'admin'),
          Query.equal('status', 'approved'),
        ])
      ).filter((row) => row.$id !== membership.$id);

      if (otherAdmins.length < 1) {
        throw new RuleError('Cannot demote the last club admin');
      }
    }

    const updated = await ctx.repo.update(TABLES.memberships, membership.$id, { role });
    return mapRow(updated);
  },

  async getMyResourceApprovals(ctx, payload) {
    const clubId = String(payload.clubId);
    const membership = await callerMembership(ctx, clubId);
    if (!membership) {
      return [];
    }

    const approvals = await ctx.repo.list(TABLES.approvals, [
      Query.equal('membership_id', membership.$id),
    ]);

    return approvals.map((approval) => ({
      id: approval.$id,
      resource_id: approval.resource_id,
      status: approval.status,
    }));
  },

  async applyForResourceAccess(ctx, payload) {
    const membership = await ctx.repo.get(TABLES.memberships, String(payload.membershipId));
    if (!membership) {
      throw new RuleError('Membership not found', 404);
    }
    if (membership.user_id !== ctx.callerId) {
      throw new RuleError('You may only request access for your own membership', 403);
    }
    if (membership.status !== 'approved') {
      throw new RuleError('You do not have an approved membership in this club', 403);
    }

    const resource = await ctx.repo.get(TABLES.resources, String(payload.resourceId));
    if (!resource || resource.club_id !== membership.club_id) {
      throw new RuleError('Resource not found', 404);
    }

    const existing = await ctx.repo.first(TABLES.approvals, [
      Query.equal('membership_id', membership.$id),
      Query.equal('resource_id', resource.$id),
    ]);
    const approval =
      existing ??
      (await ctx.repo.create(TABLES.approvals, {
        membership_id: membership.$id,
        resource_id: resource.$id,
        status: 'pending',
      }));

    return { id: approval.$id, resource_id: approval.resource_id, status: approval.status };
  },

  async listClubResourceAccessRequests(ctx, payload) {
    const clubId = String(payload.clubId);
    await assertClubAdmin(ctx, clubId, 'Only a club admin may view resource access requests');

    const resources = await ctx.repo.list(TABLES.resources, [Query.equal('club_id', clubId)]);
    if (resources.length === 0) {
      return [];
    }
    const resourcesById = new Map(resources.map((resource) => [resource.$id, resource]));

    const approvals = await ctx.repo.list(TABLES.approvals, [
      Query.equal(
        'resource_id',
        resources.map((resource) => resource.$id),
      ),
      Query.orderAsc('$createdAt'),
    ]);

    const memberships = await ctx.repo.list(TABLES.memberships, [Query.equal('club_id', clubId)]);
    const membershipsById = new Map(memberships.map((membership) => [membership.$id, membership]));
    const profiles = await profilesByUserId(
      ctx,
      memberships.map((membership) => membership.user_id),
    );

    return approvals.map((approval) => {
      const membership = membershipsById.get(approval.membership_id);
      const profile = membership ? profiles.get(membership.user_id) : null;
      return {
        ...mapRow(approval),
        resource_name: resourcesById.get(approval.resource_id)?.name ?? null,
        user_display_name: profile?.display_name ?? null,
        user_callsign: profile?.callsign ?? null,
      };
    });
  },

  async setResourceAccessStatus(ctx, payload) {
    const status = String(payload.status);
    if (!['pending', 'approved', 'denied'].includes(status)) {
      throw new RuleError('Invalid status: must be pending, approved, or denied');
    }

    const approval = await ctx.repo.get(TABLES.approvals, String(payload.approvalId));
    if (!approval) {
      throw new RuleError('Approval record not found', 404);
    }

    const resource = await ctx.repo.get(TABLES.resources, approval.resource_id);
    if (!resource) {
      throw new RuleError('Resource not found', 404);
    }
    await assertClubAdmin(
      ctx,
      resource.club_id,
      'Only a club admin may change resource access approvals',
    );

    const updated = await ctx.repo.update(TABLES.approvals, approval.$id, { status });
    return { id: updated.$id, resource_id: updated.resource_id, status: updated.status };
  },

  async listClubReservations(ctx, payload) {
    const clubId = String(payload.clubId);
    const membership = await callerMembership(ctx, clubId);
    if (membership?.status !== 'approved') {
      throw new RuleError('You are not an approved member of this club', 403);
    }

    const resources = await ctx.repo.list(TABLES.resources, [Query.equal('club_id', clubId)]);
    if (resources.length === 0) {
      return [];
    }

    const from = parseTimestamp(payload.from, 'from').toISOString();
    const to = parseTimestamp(payload.to, 'to').toISOString();

    const reservations = await ctx.repo.list(TABLES.reservations, [
      Query.equal(
        'resource_id',
        resources.map((resource) => resource.$id),
      ),
      Query.equal('status', 'active'),
      Query.lessThan('starts_at', to),
      Query.greaterThan('ends_at', from),
    ]);

    const memberships = await ctx.repo.list(TABLES.memberships, [Query.equal('club_id', clubId)]);
    const membershipsById = new Map(memberships.map((row) => [row.$id, row]));
    const profiles = await profilesByUserId(
      ctx,
      memberships.map((row) => row.user_id),
    );

    return reservations.map((reservation) => {
      const owner = membershipsById.get(reservation.membership_id);
      const profile = owner ? profiles.get(owner.user_id) : null;
      return {
        id: reservation.$id,
        resource_id: reservation.resource_id,
        membership_id: reservation.membership_id,
        starts_at: reservation.starts_at,
        ends_at: reservation.ends_at,
        status: reservation.status,
        callsign: profile?.callsign ?? null,
        display_name: profile?.display_name ?? null,
      };
    });
  },

  async createReservation(ctx, payload) {
    const resource = await ctx.repo.get(TABLES.resources, String(payload.resourceId));
    if (!resource) {
      throw new RuleError('Resource not found', 404);
    }
    if (!resource.is_active) {
      throw new RuleError('Resource is not active');
    }

    const membership = await callerMembership(ctx, resource.club_id);
    if (membership?.status !== 'approved') {
      throw new RuleError('You do not have an approved membership in this club', 403);
    }

    const approval = await ctx.repo.first(TABLES.approvals, [
      Query.equal('membership_id', membership.$id),
      Query.equal('resource_id', resource.$id),
      Query.equal('status', 'approved'),
    ]);
    if (!approval) {
      throw new RuleError('You do not have approved access to this resource', 403);
    }

    const startsAt = parseTimestamp(payload.startsAt, 'starts_at');
    const endsAt = parseTimestamp(payload.endsAt, 'ends_at');
    assertReservationWindow(startsAt, endsAt, resource.block_size_minutes);

    const sameResource = await ctx.repo.list(TABLES.reservations, [
      Query.equal('resource_id', resource.$id),
      Query.equal('status', 'active'),
      Query.lessThan('starts_at', endsAt.toISOString()),
      Query.greaterThan('ends_at', startsAt.toISOString()),
    ]);
    const conflict = sameResource.some((reservation) =>
      rangesOverlap(reservation.starts_at, reservation.ends_at, startsAt, endsAt),
    );
    if (conflict) {
      throw new RuleError('The requested time slot overlaps with an existing reservation');
    }

    const reservation = await ctx.repo.create(TABLES.reservations, {
      resource_id: resource.$id,
      membership_id: membership.$id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'active',
    });

    await ctx.repo.create(TABLES.auditEvents, {
      reservation_id: reservation.$id,
      event_type: 'created',
      actor_user_id: ctx.callerId,
    });

    return mapRow(reservation);
  },

  async cancelReservation(ctx, payload) {
    const reservation = await ctx.repo.get(TABLES.reservations, String(payload.reservationId));
    if (!reservation) {
      throw new RuleError('Reservation not found', 404);
    }
    if (reservation.status !== 'active') {
      throw new RuleError('Only active reservations can be cancelled');
    }
    if (new Date(reservation.ends_at) <= new Date()) {
      throw new RuleError('Cannot cancel a reservation that has already ended');
    }

    const owner = await ctx.repo.get(TABLES.memberships, reservation.membership_id);
    const resource = await ctx.repo.get(TABLES.resources, reservation.resource_id);
    const isOwner = owner?.user_id === ctx.callerId;
    const isAdmin = resource ? await isClubAdmin(ctx, resource.club_id) : false;

    if (!isOwner && !isAdmin) {
      throw new RuleError('You do not have permission to cancel this reservation', 403);
    }

    const updated = await ctx.repo.update(TABLES.reservations, reservation.$id, {
      status: 'cancelled',
    });
    await ctx.repo.create(TABLES.auditEvents, {
      reservation_id: reservation.$id,
      event_type: 'cancelled',
      actor_user_id: ctx.callerId,
      notes: payload.notes ?? null,
    });

    return mapRow(updated);
  },

  async getCurrentProfile(ctx) {
    const profile = await ensureProfile(ctx);
    return {
      id: profile.$id,
      email: profile.email ?? null,
      display_name: profile.display_name ?? null,
      callsign: profile.callsign ?? null,
      phone_number: profile.phone_number ?? null,
    };
  },

  async saveCurrentProfile(ctx, payload) {
    await ensureProfile(ctx);

    const displayName = String(payload.displayName ?? '').trim();
    const callsign = String(payload.callsign ?? '').trim();
    const phoneNumber = String(payload.phoneNumber ?? '').trim();

    if (!displayName) {
      throw new RuleError('Display name is required');
    }

    const profile = await ctx.repo.update(TABLES.users, ctx.callerId, {
      display_name: displayName,
      callsign: callsign || null,
      phone_number: phoneNumber || null,
    });

    return {
      id: profile.$id,
      email: profile.email ?? null,
      display_name: profile.display_name ?? null,
      callsign: profile.callsign ?? null,
      phone_number: profile.phone_number ?? null,
    };
  },

  async listCurrentMemberships(ctx) {
    const memberships = await ctx.repo.list(TABLES.memberships, [
      Query.equal('user_id', ctx.callerId),
      Query.orderDesc('$createdAt'),
    ]);
    if (memberships.length === 0) {
      return [];
    }

    const clubs = await ctx.repo.list(TABLES.clubs, [
      Query.equal(
        '$id',
        memberships.map((membership) => membership.club_id),
      ),
    ]);
    const clubsById = new Map(clubs.map((club) => [club.$id, club]));

    return memberships.map((membership) => {
      const club = clubsById.get(membership.club_id);
      return {
        id: membership.$id,
        role: membership.role,
        status: membership.status,
        club: club ? { id: club.$id, name: club.name } : null,
      };
    });
  },
};

export default async ({ req, res, error }) => {
  const action = (req.path ?? '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const handler = Object.prototype.hasOwnProperty.call(handlers, action)
    ? handlers[action]
    : undefined;

  if (!handler) {
    return res.json({ data: null, error: `Unknown action: ${action}` }, 404);
  }

  const callerId = req.headers['x-appwrite-user-id'];
  if (!callerId) {
    return res.json({ data: null, error: 'Not authenticated.' }, 401);
  }

  const databaseId = process.env.APPWRITE_DATABASE_ID;
  const apiKey = req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY;
  if (!databaseId || !apiKey) {
    return res.json({ data: null, error: 'Appwrite function is not configured.' }, 500);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(apiKey);

  const ctx = {
    callerId,
    repo: new Repository(new TablesDB(client), databaseId),
    users: new Users(client),
  };

  let payload = {};
  if (req.bodyText) {
    try {
      payload = JSON.parse(req.bodyText);
    } catch {
      return res.json({ data: null, error: 'Request body must be JSON.' }, 400);
    }
  }

  try {
    const data = await handler(ctx, payload ?? {});
    return res.json({ data: data ?? null, error: null });
  } catch (err) {
    if (err instanceof RuleError) {
      return res.json({ data: null, error: err.message }, err.status);
    }
    error(`${action} failed: ${err?.message ?? err}`);
    return res.json({ data: null, error: 'Unexpected server error.' }, 500);
  }
};

export { handlers, mapRow };
