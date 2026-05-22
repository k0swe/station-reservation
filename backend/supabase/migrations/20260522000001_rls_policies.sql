-- Migration: 20260522000001_rls_policies.sql
-- Enables Row Level Security on all public tables and creates access policies.
--
-- Design principles:
--   - Use `(select auth.uid())` (subquery form) rather than `auth.uid()` directly
--     to avoid per-row function evaluation and improve performance.
--   - RLS is the primary mechanism for club/tenant isolation.
--   - Complex state-changing operations go through SECURITY DEFINER RPC functions
--     (see migration 20260522000002) which bypass RLS and enforce business rules
--     explicitly; those tables only allow SELECT through RLS.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
-- These are SECURITY DEFINER so they always run as the table owner and can
-- read memberships freely. They are "stable" (no side effects) so Postgres
-- can cache the result within a single statement.

-- Returns true if the authenticated user is an approved admin of the given club.
create or replace function public.is_club_admin(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where club_id  = p_club_id
      and user_id  = (select auth.uid())
      and role     = 'admin'
      and status   = 'approved'
  );
$$;

-- Returns true if the authenticated user has an approved membership in the given club.
create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where club_id = p_club_id
      and user_id = (select auth.uid())
      and status  = 'approved'
  );
$$;

-- ---------------------------------------------------------------------------
-- clubs
-- ---------------------------------------------------------------------------

alter table public.clubs enable row level security;

-- Any authenticated user can browse clubs so they can discover and request membership.
create policy "clubs_select"
  on public.clubs for select
  to authenticated
  using (true);

-- Any authenticated user can create a club; the RPC function create_club() also
-- creates an admin membership in the same transaction.
create policy "clubs_insert"
  on public.clubs for insert
  to authenticated
  with check (true);

-- Only an approved admin of the club may update it.
create policy "clubs_update"
  on public.clubs for update
  to authenticated
  using  (public.is_club_admin(id))
  with check (public.is_club_admin(id));

-- No DELETE on clubs in MVP.

-- ---------------------------------------------------------------------------
-- users (public profiles)
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;

-- Any authenticated user can read any user profile.
create policy "users_select"
  on public.users for select
  to authenticated
  using (true);

-- Profiles are inserted automatically by the handle_new_user trigger (SECURITY
-- DEFINER), so no direct INSERT from the client is needed.

-- A user may update only their own profile.
create policy "users_update"
  on public.users for update
  to authenticated
  using  (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------

alter table public.memberships enable row level security;

-- A user can see their own memberships; a club admin can see all memberships
-- in their club.
create policy "memberships_select"
  on public.memberships for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_club_admin(club_id)
  );

-- An authenticated user may insert a pending membership for themselves.
-- Status and role are enforced to their defaults by the WITH CHECK.
create policy "memberships_insert"
  on public.memberships for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and role   = 'member'
  );

-- Updates to memberships (approve, deny, role changes) go through RPC functions
-- only. No direct UPDATE allowed from clients.

-- ---------------------------------------------------------------------------
-- resources
-- ---------------------------------------------------------------------------

alter table public.resources enable row level security;

-- Approved members of the club can see all resources (active and inactive visible
-- to admins; only active visible to regular members).
create policy "resources_select_admin"
  on public.resources for select
  to authenticated
  using (public.is_club_admin(club_id));

create policy "resources_select_member"
  on public.resources for select
  to authenticated
  using (is_active = true and public.is_club_member(club_id));

-- Only club admins can create or update resources.
create policy "resources_insert"
  on public.resources for insert
  to authenticated
  with check (public.is_club_admin(club_id));

create policy "resources_update"
  on public.resources for update
  to authenticated
  using  (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

-- ---------------------------------------------------------------------------
-- resource_access_approvals
-- ---------------------------------------------------------------------------

alter table public.resource_access_approvals enable row level security;

-- A member sees their own approvals; a club admin sees all approvals for their
-- club's resources.
create policy "resource_access_approvals_select"
  on public.resource_access_approvals for select
  to authenticated
  using (
    -- member's own approval
    exists (
      select 1 from public.memberships m
      where m.id      = membership_id
        and m.user_id = (select auth.uid())
    )
    or
    -- club admin
    exists (
      select 1 from public.resources r
      where r.id = resource_id
        and public.is_club_admin(r.club_id)
    )
  );

-- An approved member may submit an access request for a resource in their club.
create policy "resource_access_approvals_insert"
  on public.resource_access_approvals for insert
  to authenticated
  with check (
    status = 'pending'
    and exists (
      select 1 from public.memberships m
      where m.id      = membership_id
        and m.user_id = (select auth.uid())
        and m.status  = 'approved'
    )
    and exists (
      select 1
      from public.resources r
      join public.memberships m2
        on m2.club_id  = r.club_id
       and m2.id       = membership_id
      where r.id        = resource_id
        and r.is_active = true
    )
  );

-- Status changes go through RPC functions only; no direct UPDATE from clients.

-- ---------------------------------------------------------------------------
-- reservations
-- ---------------------------------------------------------------------------

alter table public.reservations enable row level security;

-- A member sees their own reservations; a club admin sees all in their club.
create policy "reservations_select"
  on public.reservations for select
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id      = membership_id
        and m.user_id = (select auth.uid())
    )
    or
    exists (
      select 1 from public.resources r
      where r.id = resource_id
        and public.is_club_admin(r.club_id)
    )
  );

-- INSERT and UPDATE are handled exclusively by SECURITY DEFINER RPC functions.

-- ---------------------------------------------------------------------------
-- reservation_audit_events
-- ---------------------------------------------------------------------------

alter table public.reservation_audit_events enable row level security;

-- Club admins can see all audit events for their club; a member can see events
-- for their own reservations.
create policy "reservation_audit_events_select"
  on public.reservation_audit_events for select
  to authenticated
  using (
    exists (
      select 1 from public.reservations rsv
      where rsv.id = reservation_id
        and (
          -- actor is the member who owns the reservation
          exists (
            select 1 from public.memberships m
            where m.id      = rsv.membership_id
              and m.user_id = (select auth.uid())
          )
          or
          -- caller is a club admin for the resource's club
          exists (
            select 1 from public.resources r
            where r.id = rsv.resource_id
              and public.is_club_admin(r.club_id)
          )
        )
    )
  );

-- Audit events are INSERT-only, written by SECURITY DEFINER functions.
-- No direct INSERT/UPDATE/DELETE from clients.
