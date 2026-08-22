# Club Shack - Technical Design (MVP)

## 1. Overview

This document records the technical design and architecture decisions for the Club Shack MVP. It is
meant to complement the product requirements document and give contributors a shared reference for
why specific technologies were chosen and how the system will be structured.

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
- **Appwrite compatibility**: Appwrite ships a framework-agnostic JavaScript/TypeScript Web SDK
  (`appwrite`), which drops straight into an Angular service layer.

### What this means in practice

- Angular CLI for project scaffolding and builds.
- The `appwrite` Web SDK initialized in Angular services (`AuthService`, `ApiService`).
- Auth/session state exposed via Angular services (with Signals or RxJS).
- Route guards for access control at the UI level.
- Client-side rendering (SPA); SSR is not required for this app.

---

## 3. Backend / Platform: Appwrite

### Decision

The backend and platform will be **Appwrite**: Appwrite Auth, the Appwrite database (TablesDB), and
an Appwrite Function that owns the business rules.

The project originally ran on Supabase. It was migrated to Appwrite so that this app matches the
consistent, self-hostable app platform used across the other projects in this portfolio. There was
no operational data to preserve, so the stacked SQL migrations were flattened into a single starting
schema expressed as Appwrite tables.

### Reasoning

#### The domain is naturally relational

The product's core domain maps directly to tables:

- `clubs`
- `users`
- `memberships` (User <-> Club, with status)
- `resources` (belongs to Club)
- `resource_access_approvals` (Membership <-> Resource, with status)
- `reservations` (Resource, Membership, start/end, status)
- `reservation_audit_events` (history of cancellations and changes)

These entities have:

- **Referential relationships** between tables, maintained by the API function.
- **Unique indexes** (one membership per user per club, one approval per member per resource).
- **Status transitions** that can cascade (denying a membership cancels upcoming reservations).
- **Overlap prevention** for reservations, checked before a reservation row is written.

#### Appwrite provides the full platform stack

- **Appwrite Auth** for sign-up, sign-in, password recovery, and OAuth2 providers such as Google.
- **Appwrite Databases (TablesDB)** as the system of record, with typed columns and indexes.
- **Appwrite Functions** (Node.js) for server-side workflows and business-rule enforcement.
- **Self-hostable**, with Appwrite Cloud available for hosted deployments.
- Project configuration (tables, columns, indexes, functions) is version controlled in
  `backend/appwrite/appwrite.config.json` and deployed with the Appwrite CLI.

---

## 4. High-Level Implementation Approach

### 4.1 Angular Frontend

- TypeScript throughout.
- The `appwrite` Web SDK wrapped in Angular services: `AuthService` for accounts and sessions, and
  `ApiService` for calling the backend function.
- Appwrite Auth manages the session; Angular route guards protect authenticated and role-specific
  routes.
- Reads and writes are performed by calling the `api` function, which applies the authorization
  rules for the signed-in caller.

### 4.2 Appwrite Auth

- Appwrite Auth handles sign-up, sign-in, password recovery, and session cookies.
- The authenticated Appwrite account maps to a row in the `users` table, keyed by the account ID and
  created lazily on first use.
- Club role (Club Admin vs Member) is stored in the `memberships` table and enforced by the API
  function.

### 4.3 Appwrite Databases as System of Record

- All data lives in the `clubshack` database.
- The schema is version controlled in `backend/appwrite/appwrite.config.json` and pushed with
  `appwrite push tables`.
- Core tables: `clubs`, `users`, `memberships`, `resources`, `resource_access_approvals`,
  `reservations`, `reservation_audit_events`.
- Column types, required flags, enum values, and unique indexes enforce the invariants that the
  platform can express directly.

### 4.4 Authorization for Club / Tenant Isolation

- Appwrite has no row-level policy language, so no table grants permissions to end users; every
  table is reachable only with a server API key.
- The `api` function runs with a server key, identifies the caller from the `x-appwrite-user-id`
  header injected by Appwrite, and applies the club membership and role checks that used to be
  expressed as Postgres RLS policies.
- Because clients cannot reach tables directly, the function is the single enforcement point for
  tenant isolation.

### 4.5 Server-Side Workflows

All operations are implemented as actions of the `api` function. The business-rule-heavy ones are:

| Operation                        | Reason for server-side enforcement                                |
| -------------------------------- | ----------------------------------------------------------------- |
| Create reservation               | Prevent overlaps; enforce block alignment; verify access approval |
| Cancel reservation               | Audit trail; availability update                                  |
| Approve / deny membership        | May cascade to cancel future reservations if denying              |
| Approve / revoke resource access | Enforces member-resource relationship integrity                   |
| Promote / demote Club Admin      | Enforce "must always have at least one Club Admin" rule           |

Read operations (availability, reservation history, club/resource details) are also served by the
function, which filters them to what the caller is allowed to see.

### 4.6 Timestamp Handling

- All timestamps are stored in UTC.
- The Angular frontend renders timestamps in the user's browser-local timezone.
- No club-level timezone setting is stored in the MVP (see product requirements section 5.7).

---

## 5. Tradeoffs and Consequences

### What we gain

- **Platform consistency**: the same self-hostable platform as the other projects in this portfolio,
  with one set of concepts to learn and operate.
- **Explicit business rules**: reservation, approval, and audit logic lives in one reviewable,
  unit-tested Node module instead of being split across SQL policies and functions.
- **Single enforcement point**: clients cannot bypass the rules, because they have no direct table
  access.
- **Version-controlled configuration**: tables, indexes, and the function are declared in
  `appwrite.config.json` and deployed with the CLI.

### What we accept

- **No row-level policy language**: authorization is code in the API function rather than
  declarative database policies, so it must be covered by tests and reviewed carefully.
- **No database transactions across the whole workflow**: cascading updates (deny a member, cancel
  their upcoming reservations) are applied one row at a time, and overlap detection has a small race
  window compared with a Postgres row lock.
- **Fewer relational guarantees**: foreign keys and cross-row check constraints are enforced by
  application code instead of the database.
- **An extra hop for reads**: list operations execute a function rather than hitting a generated
  database API directly.

---

## 6. What Was Considered and Not Selected

| Option                                        | Summary                             | Why not selected                                                                                      |
| --------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Supabase (Postgres + Auth + RLS)              | Relational integrity, RLS, SQL RPCs | The original choice; replaced by Appwrite for a consistent, self-hostable platform across projects    |
| Firebase (Firestore + Auth + Cloud Functions) | Fast, familiar, proven free tier    | Not self-hostable; reservation integrity rules are a less natural fit for Firestore                   |
| Vercel + Neon / managed Postgres              | Great DX, relational DB, flexible   | More moving parts to assemble; Appwrite bundles auth, database, and functions in one platform         |
| Cloudflare Pages + Workers + D1               | Excellent free tier, edge hosting   | More platform assembly required; D1 (SQLite-based) is less mature for relational scheduling integrity |
| Render / Fly.io + Postgres                    | Conventional full-stack hosting     | More operational responsibility; overkill for this MVP                                                |

---

## 7. Consistency with Product Requirements

This design is consistent with the product requirements document:

- Multi-tenancy is enforced per club by the API function.
- Reservation overlap prevention is enforced server-side.
- Cancellation on membership denial is a server-side workflow.
- Minimum Club Admin enforcement is a server-side workflow.
- UTC timestamp storage with browser-local rendering matches section 5.7.
- Audit/history retention matches section 5.5.
- The design leaves room for notifications (section 5.6) by adding Appwrite Messaging or
  event-triggered functions later.
- Future requirements in section 6 (usage caps, waitlists, blackouts) fit the existing tables and
  API function.
