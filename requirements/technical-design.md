# Station Reservation - Technical Design (MVP)

## 1. Overview

This document records the technical design and architecture decisions for the Station Reservation
MVP. It is meant to complement the product requirements document and give contributors a shared
reference for why specific technologies were chosen and how the system will be structured.

The app is a **mobile-friendly web app** targeting very low traffic. Free-tier and low-cost hosting
are explicit goals.

---

## 2. Frontend: Angular

### Decision

The frontend will be built with **Angular** in TypeScript.

### Reasoning

Angular is preferred for this project because:

- **Mental model**: Angular's opinionated structure — services, modules, route guards, reactive
  forms — fits how the team thinks about building applications.
- **Forms-heavy application**: The app involves many structured forms for club management,
  membership requests, resource access approvals, and reservation workflows. Angular's
  `ReactiveFormsModule` and form validation story is well-suited to this.
- **Structured domain entities**: The domain has well-defined entities (Club, User, Membership,
  Resource, ResourceAccessApproval, Reservation). Angular's service layer and typed models map
  cleanly to this kind of schema-driven app.
- **Route-based sections**: The app has distinct route-based sections (club dashboard, member views,
  admin views). Angular's router, route guards, and lazy-loaded modules handle this naturally.
- **Admin/member workflows**: Role-driven UI — showing different screens and actions to Club Admins
  vs Members — is a common Angular pattern and easy to implement with route guards and conditional
  directives.
- **Supabase compatibility**: Supabase provides a framework-agnostic JavaScript/TypeScript client
  (`@supabase/supabase-js`), and Angular is explicitly listed among Supabase's supported frontend
  options with an official getting-started tutorial.

### What this means in practice

- Angular CLI for project scaffolding and builds.
- `@supabase/supabase-js` initialized in an Angular `SupabaseService`.
- Auth/session state exposed via Angular services (with Signals or RxJS).
- Route guards for access control at the UI level.
- Client-side rendering (SPA); SSR is not required for this app.

---

## 3. Backend / Platform: Supabase

### Decision

The backend and platform will be **Supabase**: hosted Postgres, Auth, and generated APIs.

### Reasoning

#### The domain is naturally relational

The product's core domain maps directly to relational tables:

- `clubs`
- `users`
- `memberships` (User ↔ Club, with status)
- `resources` (belongs to Club)
- `resource_access_approvals` (Membership ↔ Resource, with status)
- `reservations` (Resource, Membership, start/end, status)
- `reservation_audit_events` (history of cancellations and changes)

These entities have:

- **Foreign key relationships** enforced at the database level.
- **Unique constraints** (one membership per user per club, one approval per member per resource).
- **Status transitions** that can cascade (denying a membership cancels upcoming reservations).
- **Overlap prevention** for reservations — straightforward with SQL constraints or
  transaction-level checks, non-trivial in a document store.

Postgres is a natural fit for this kind of structured, transactional, relational domain.

#### Why Supabase over Firebase

Firebase (Firestore) was seriously considered and remains a viable option — particularly for the
speed of setup and familiarity. However, it was not selected for this project because:

- The **reservation, approval, and audit model** is better aligned with a relational database.
  Overlap prevention, cascaded state changes (deny member → cancel reservations), and
  history/reporting queries are more naturally expressed in SQL.
- Firestore's cross-document transactional guarantees are limited compared with Postgres, which
  matters for the "always have at least one club admin" and "deny member and cancel all future
  reservations" rules.
- Reporting and history queries over audit events are significantly easier in SQL.
- Supabase is still free-tier friendly at the scale this app expects (very low traffic, small data
  volume).

Firebase remains a valid alternative if the team prioritizes familiarity and maximum MVP speed — the
reservation logic is doable with careful server-side Cloud Functions design.

#### Supabase provides the full platform stack

Supabase is not just a database host. It provides:

- **Hosted Postgres** as the system of record.
- **Supabase Auth** for user sign-in and session management (email/password, OAuth providers, etc.).
- **Auto-generated REST and GraphQL APIs** over Postgres tables.
- **Row Level Security (RLS)** for tenant/club isolation without a separate authorization service.
- **Edge Functions** (Deno-based TypeScript) for server-side workflows when needed.
- **Free tier** suitable for the expected traffic and data volume.

This means most of the infrastructure plumbing is handled by the platform.

---

## 4. High-Level Implementation Approach

### 4.1 Angular Frontend

- TypeScript throughout.
- `@supabase/supabase-js` client wrapped in an Angular `SupabaseService`.
- Supabase Auth manages session; Angular route guards protect authenticated and role-specific
  routes.
- Most read operations hit Supabase's generated API directly from the client, with RLS enforcing
  access.
- Write operations that enforce complex business rules are routed through Edge Functions or SQL RPC
  functions (see below).

### 4.2 Supabase Auth

- Supabase Auth handles sign-up, sign-in, and session tokens.
- The authenticated Supabase user maps to the `users` table.
- Club role (Club Admin vs Member) is stored in the `memberships` table and enforced via RLS.

### 4.3 Supabase Postgres as System of Record

- All data lives in Postgres.
- Schema is managed via Supabase migrations (SQL files in version control).
- Core tables: `clubs`, `users`, `memberships`, `resources`, `resource_access_approvals`,
  `reservations`, `reservation_audit_events`.
- Postgres constraints (foreign keys, unique constraints, check constraints) enforce as many
  invariants as possible at the database level.

### 4.4 Row Level Security for Club / Tenant Isolation

- RLS policies are applied to all tables to ensure members only see data from their own clubs.
- Club Admins have elevated RLS permissions for their club's data.
- RLS is the primary mechanism for tenant isolation; it is not the only line of defense
  (business-rule workflows also enforce it).

### 4.5 Server-Side Workflows

A small number of business-rule-heavy operations will be implemented as **Edge Functions** and/or
**SQL RPC functions** rather than direct client writes:

| Operation                        | Reason for server-side enforcement                                |
| -------------------------------- | ----------------------------------------------------------------- |
| Create reservation               | Prevent overlaps; enforce block alignment; verify access approval |
| Cancel reservation               | Audit trail; availability update                                  |
| Approve / deny membership        | May cascade to cancel future reservations if denying              |
| Approve / revoke resource access | Enforces member-resource relationship integrity                   |
| Promote / demote Club Admin      | Enforce "must always have at least one Club Admin" rule           |

All other operations (read availability, view reservation history, view club/resource details) can
be direct Supabase API calls from the client, secured by RLS.

### 4.6 Timestamp Handling

- All timestamps are stored in UTC in Postgres.
- The Angular frontend renders timestamps in the user's browser-local timezone.
- No club-level timezone setting is stored in the MVP (see product requirements section 5.7).

---

## 5. Tradeoffs and Consequences

### What we gain

- **Relational integrity**: foreign keys, unique constraints, and transactions handle the
  reservation/approval/audit logic cleanly.
- **Simpler business logic implementation**: overlap prevention and cascaded state changes are
  natural SQL operations.
- **Long-term maintainability**: the schema and authorization rules are explicit and auditable.
- **Reporting and history**: SQL queries over `reservation_audit_events` and related tables are
  straightforward.
- **Unified platform**: Supabase provides auth, database, API, and optional functions in one
  service.

### What we accept

- **More upfront schema and authorization design**: compared with Firebase, we invest more time
  defining tables, constraints, and RLS policies before writing application code.
- **Learning Supabase concepts**: the team will need to understand RLS, Supabase Auth session
  handling, and the Supabase client library. These are well-documented but are new concepts relative
  to Firebase.
- **Deno-based Edge Functions (if used)**: Supabase Edge Functions run on a Deno runtime with
  TypeScript. This differs from Node.js-based Cloud Functions. Teams that want to minimize Edge
  Function usage can lean more on SQL functions and RLS to reduce the Deno surface area.
- **Less Firebase familiarity**: teams already productive with Firebase will spend some time
  learning the Supabase model.

---

## 6. What Was Considered and Not Selected

| Option                                        | Summary                           | Why not selected                                                                                                                        |
| --------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase (Firestore + Auth + Cloud Functions) | Fast, familiar, proven free tier  | Reservation integrity and relational business rules are a less natural fit for Firestore; selected Supabase for cleaner domain modeling |
| Vercel + Neon / managed Postgres              | Great DX, relational DB, flexible | More moving parts to assemble; Supabase bundles auth + DB + APIs in one platform                                                        |
| Cloudflare Pages + Workers + D1               | Excellent free tier, edge hosting | More platform assembly required; D1 (SQLite-based) is less mature for relational scheduling integrity                                   |
| Render / Fly.io + Postgres                    | Conventional full-stack hosting   | More operational responsibility; free tiers have shifted; overkill for this MVP                                                         |

---

## 7. Consistency with Product Requirements

This design is consistent with the product requirements document:

- Multi-tenancy is enforced via RLS per club.
- Reservation overlap prevention is enforced server-side.
- Cancellation on membership denial is a server-side workflow.
- Minimum Club Admin enforcement is a server-side workflow.
- UTC timestamp storage with browser-local rendering matches section 5.7.
- Audit/history retention matches section 5.5.
- The design leaves room for notifications (section 5.6) by adding Edge Function triggers later.
- Future requirements in section 6 (usage caps, waitlists, blackouts) are easier to add with a
  relational schema.
