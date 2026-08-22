# Backend — Appwrite

This directory contains the Appwrite backend for the Club Shack app: the project configuration
(database tables, columns, indexes) and the Node function that enforces all business rules.

## Layout

```
backend/
└── appwrite/
    ├── appwrite.config.json      # Appwrite CLI project config: tables, columns, indexes, function
    └── functions/
        └── api/                  # "Club Shack API" function — all reads and writes go through it
            ├── src/main.js       # Action router and handlers
            ├── src/rules.js      # Pure business rules (slugs, reservation windows, overlaps)
            └── test/             # node:test unit tests
```

The checked-in `appwrite.config.json` targets the `station-reservation` project and the configured
self-hosted endpoint. Update those values if deploying to a different Appwrite project.

## Prerequisites

- An Appwrite project (Appwrite Cloud or a self-hosted instance)
- [Appwrite CLI](https://appwrite.io/docs/tooling/command-line/installation)
  ```bash
  npm install -g appwrite-cli
  ```

## Deploying

```bash
cd backend/appwrite

appwrite login
appwrite push settings      # project settings
appwrite push tables        # database, tables, columns, and indexes
appwrite push functions     # the "Club Shack API" function
```

The function defaults to the checked-in database ID:

| Variable               | Value       |
| ---------------------- | ----------- |
| `APPWRITE_DATABASE_ID` | `clubshack` |

Set `APPWRITE_DATABASE_ID` as a function variable only if deploying with a different database ID.
The Appwrite CLI schema used by this project does not accept inline function variables in
`appwrite.config.json`.

The function is executed with a
[dynamic API key](https://appwrite.io/docs/products/functions/develop#dynamic-api-key) (the
`x-appwrite-key` header), so no static key has to be stored. When running the function locally with
`appwrite run functions`, set `APPWRITE_API_KEY` in `backend/appwrite/functions/api/.env` instead.

## Running the function's tests

```bash
cd backend/appwrite/functions/api
npm ci
npm test
```

## Authentication

Appwrite Auth handles sign-up, sign-in, password recovery, and Google OAuth2. Configure the
redirect/success URLs and enable the Google provider in **Auth → Settings** of the Appwrite console.

A profile row in the `users` table is created lazily, keyed by the Appwrite account ID, the first
time a signed-in user loads their profile or joins a club.

## Database Schema

Database `clubshack`:

| Table                       | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `clubs`                     | Ham radio clubs (tenants)                            |
| `users`                     | Public user profiles, keyed by the Appwrite user ID  |
| `memberships`               | User ↔ Club relationship with role and status        |
| `resources`                 | Reservable resources (stations) belonging to a club  |
| `resource_access_approvals` | Per-member, per-resource access grants               |
| `reservations`              | Time-block reservations                              |
| `reservation_audit_events`  | Immutable audit log for reservation lifecycle events |

Constrained string columns:

| Column                                | Values                          |
| ------------------------------------- | ------------------------------- |
| `memberships.status`                  | `pending`, `approved`, `denied` |
| `memberships.role`                    | `admin`, `member`               |
| `resource_access_approvals.status`    | `pending`, `approved`, `denied` |
| `reservations.status`                 | `active`, `cancelled`           |
| `reservation_audit_events.event_type` | `created`, `cancelled`          |

Appwrite TablesDB config does not currently accept an `enum` column type, so these are stored as
strings and validated by the API function before writes.

Key indexes:

- `memberships`: unique `(club_id, user_id)` — one membership per user per club.
- `resource_access_approvals`: unique `(membership_id, resource_id)`.
- `clubs`: unique `slug`.
- `reservations`: `(resource_id, status, starts_at)` for overlap lookups.

## Authorization

Appwrite has no row-level policy language, so none of the tables grant any permission to end users:
every table is reachable only with an API key. The web client therefore performs all reads and
writes through the `api` function, which runs with a server key, identifies the caller from the
`x-appwrite-user-id` header that Appwrite injects, and re-implements the authorization rules that
used to live in Postgres RLS policies and `SECURITY DEFINER` functions.

## API Function Actions

The client calls the function with the action as the request path and a JSON body, e.g.
`POST /createReservation`. Every response is `{ "data": ..., "error": ... }`.

| Action                                                       | Description                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `listClubs`                                                  | All clubs, ordered by name                                       |
| `createClub`                                                 | Creates a club and makes the caller an approved admin            |
| `getClub`                                                    | Looks a club up by slug, falling back to row ID                  |
| `isClubAdmin`                                                | Whether the caller is an approved admin of a club                |
| `listClubResources`                                          | Club resources; members see active ones, admins see all          |
| `createResource` / `updateResource` / `deleteResource`       | Club admin resource management                                   |
| `requestMembership` / `getUserMembership`                    | Self-service membership request and lookup                       |
| `listClubMembershipRequests` / `setMembershipStatus`         | Admin membership review; denial cancels upcoming reservations    |
| `setMemberRole`                                              | Promote/demote a member; refuses self-changes and the last admin |
| `getMyResourceApprovals` / `applyForResourceAccess`          | Member resource-access requests                                  |
| `listClubResourceAccessRequests` / `setResourceAccessStatus` | Admin resource-access review                                     |
| `listClubReservations`                                       | Active reservations for a club within a time window              |
| `createReservation` / `cancelReservation`                    | Reservation lifecycle, with audit events                         |
| `getCurrentProfile` / `saveCurrentProfile`                   | The caller's profile row                                         |
| `listCurrentMemberships`                                     | The caller's memberships with club names                         |

### Reservation rules enforced by `createReservation`

1. Caller must have an **approved membership** in the resource's club.
2. Caller must have an **approved resource access approval** for the resource.
3. The **resource must be active**.
4. `ends_at > starts_at`.
5. Duration must be a **whole multiple** of `block_size_minutes`.
6. `starts_at` must be **aligned to a block boundary** (multiples of `block_size_minutes` from the
   Unix epoch, i.e., UTC midnight).
7. No **overlap** with existing active reservations.

## Future Work

- **Overlap races**: Postgres serialized overlapping bookings with row locks. Appwrite checks for
  conflicts before inserting, which leaves a small race window between two simultaneous bookings of
  the same slot.
- **Messaging**: Appwrite Messaging could send email or push notifications on membership approvals
  and reservation reminders.
- **Usage caps**: per-member daily/weekly hour limits.
- **Realtime subscriptions**: the availability calendar could subscribe to `reservations` changes
  for live updates.
