# Backend — Supabase

This directory contains the Supabase backend for the Club Shack app: SQL migrations, RLS
policies, SQL RPC functions, and local-dev configuration.

## Layout

```
backend/
└── supabase/
    ├── config.toml          # Supabase CLI local-dev configuration
    ├── seed.sql             # Local dev seed data (applied by `supabase db reset`)
    ├── migrations/
    │   ├── 20260522000000_initial_schema.sql   # Tables, enums, indexes, triggers
    │   ├── 20260522000001_rls_policies.sql     # Row Level Security policies
    │   └── 20260522000002_rpc_functions.sql    # SQL RPC functions (business rules)
    └── functions/           # Edge Functions (reserved for future use)
```

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running locally
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started)
  ```bash
  npm install supabase --save-dev   # or: brew install supabase/tap/supabase
  ```

## Local Development

### First-time setup

```bash
cd backend

# Start local Supabase (Postgres, Auth, Studio, etc.)
supabase start
```

On first run the CLI pulls Docker images; this takes a few minutes.

Once running, note the credentials printed to the terminal:

| Key             | Value                                                     |
| --------------- | --------------------------------------------------------- |
| Project URL     | `http://127.0.0.1:54321`                                  |
| Publishable Key | (shown in terminal)                                       |
| Secret Key      | (shown in terminal, keep private)                         |
| Studio UI       | `http://127.0.0.1:54323`                                  |
| DB URL          | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Use the **Publishable Key** and **Project URL** in the Angular frontend's `environment.ts`.

### Reset and reseed the database

```bash
supabase db reset
```

This drops and recreates the local database, replays all migrations, and applies `seed.sql`.

### Stop local services

```bash
supabase stop          # stops containers; data is preserved
supabase stop --no-backup  # stops and deletes all local data
```

## Seed Accounts

After `supabase db reset` the following test accounts are available:

| Email             | Password    | Role in club    |
| ----------------- | ----------- | --------------- |
| alice@example.com | password123 | Club Admin      |
| bob@example.com   | password123 | Approved Member |
| carol@example.com | password123 | Pending Member  |

Club: **Rocky Mountain Amateur Radio Club**

## Database Schema

### Tables

| Table                       | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `clubs`                     | Ham radio clubs (tenants)                            |
| `users`                     | Public user profiles, mirroring `auth.users`         |
| `memberships`               | User ↔ Club relationship with role and status        |
| `resources`                 | Reservable resources (stations) belonging to a club  |
| `resource_access_approvals` | Per-member, per-resource access grants               |
| `reservations`              | Time-block reservations                              |
| `reservation_audit_events`  | Immutable audit log for reservation lifecycle events |

### Enums

| Type                     | Values                          |
| ------------------------ | ------------------------------- |
| `membership_status`      | `pending`, `approved`, `denied` |
| `membership_role`        | `admin`, `member`               |
| `resource_access_status` | `pending`, `approved`, `denied` |
| `reservation_status`     | `active`, `cancelled`           |
| `audit_event_type`       | `created`, `cancelled`          |

### Key constraints

- `memberships`: UNIQUE `(club_id, user_id)` — one membership per user per club.
- `resource_access_approvals`: UNIQUE `(membership_id, resource_id)`.
- `reservations`: CHECK `ends_at > starts_at`; GiST index on active reservation ranges for efficient
  overlap detection.

## Row Level Security

RLS is enabled on all public tables. The design follows two helper functions:

- `is_club_admin(club_id)` — true if the caller is an approved admin of that club.
- `is_club_member(club_id)` — true if the caller has an approved membership.

| Table                       | Who can SELECT                  | Who can INSERT   | Who can UPDATE   |
| --------------------------- | ------------------------------- | ---------------- | ---------------- |
| `clubs`                     | Any auth user                   | Any auth user    | Club admins only |
| `users`                     | Any auth user                   | Trigger only     | Own profile only |
| `memberships`               | Own + club admins               | Self (pending)   | RPC functions    |
| `resources`                 | Any auth user (active) + admins (all) | Club admins      | Club admins      |
| `resource_access_approvals` | Own + club admins               | Approved members | RPC functions    |
| `reservations`              | Own + club admins               | RPC functions    | RPC functions    |
| `reservation_audit_events`  | Own + club admins               | RPC functions    | —                |

## SQL RPC Functions

Complex writes are handled by `SECURITY DEFINER` SQL functions called via the PostgREST API at
`POST /rest/v1/rpc/<function_name>`.

| Function                                              | Description                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `create_club(name)`                                   | Creates a club and makes the caller an approved admin                      |
| `approve_deny_membership(membership_id, new_status)`  | Approves or denies a membership; denying cancels all upcoming reservations |
| `set_member_role(membership_id, new_role)`            | Promotes or demotes a member; prevents removing the last admin             |
| `set_resource_access_status(approval_id, new_status)` | Approves, denies, or revokes resource access                               |
| `create_reservation(resource_id, starts_at, ends_at)` | Creates a reservation after enforcing all business rules                   |
| `cancel_reservation(reservation_id, notes?)`          | Cancels a reservation and writes an audit event                            |

### Reservation rules enforced by `create_reservation`

1. Caller must have an **approved membership** in the resource's club.
2. Caller must have an **approved resource access approval** for the resource.
3. The **resource must be active**.
4. `ends_at > starts_at`.
5. Duration must be a **whole multiple** of `block_size_minutes`.
6. `starts_at` must be **aligned to a block boundary** (multiples of `block_size_minutes` from Unix
   epoch, i.e., UTC midnight).
7. No **overlap** with existing active reservations (enforced with a row-level `FOR UPDATE` lock to
   prevent race conditions).

## Deploying to a Hosted Supabase Project

```bash
# One-time: link to your remote project
supabase login
supabase link --project-ref <YOUR_PROJECT_ID>

# Push all pending migrations
supabase db push

# (Optional) seed production — only for test/staging, never for real production
# supabase db reset --linked
```

## Future Work

- **Edge Functions**: The `supabase/functions/` directory is reserved for Deno-based Edge Functions.
  These would be useful for adding email or push notifications on membership approvals, reservation
  reminders, etc.
- **Usage caps**: per-member daily/weekly hour limits (schema-ready per section 6 of the product
  requirements).
- **Realtime subscriptions**: availability calendar can subscribe to the `reservations` table
  changes for live updates.
