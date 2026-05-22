-- Migration: 20260522000002_rpc_functions.sql
-- SECURITY DEFINER RPC functions that enforce business rules.
--
-- All functions here run as the Postgres superuser (function owner), bypassing
-- RLS. They explicitly re-implement the necessary authorization checks so that
-- callers cannot circumvent business rules by crafting direct API requests.
--
-- Clients invoke these via PostgREST: POST /rest/v1/rpc/<function_name>

-- ---------------------------------------------------------------------------
-- create_club
-- ---------------------------------------------------------------------------
-- Creates a club and immediately makes the caller an approved admin of that
-- club. Both writes happen in one transaction.

create or replace function public.create_club(p_name text)
returns public.clubs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club   public.clubs;
  v_user_id uuid;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Create the club.
  insert into public.clubs (name)
  values (p_name)
  returning * into v_club;

  -- Create an approved admin membership for the creator.
  insert into public.memberships (club_id, user_id, role, status)
  values (v_club.id, v_user_id, 'admin', 'approved');

  return v_club;
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_deny_membership
-- ---------------------------------------------------------------------------
-- Sets a membership's status to 'approved' or 'denied'.
--
-- If the new status is 'denied', all upcoming active reservations belonging to
-- that membership are cancelled and audit events are written for each one.

create or replace function public.approve_deny_membership(
  p_membership_id uuid,
  p_new_status    public.membership_status
)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership    public.memberships;
  v_caller_id     uuid;
  v_reservation   record;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Fetch the membership; lock the row to avoid concurrent modifications.
  select * into v_membership
  from public.memberships
  where id = p_membership_id
  for update;

  if not found then
    raise exception 'Membership not found';
  end if;

  -- Caller must be an approved admin of the same club.
  if not exists (
    select 1 from public.memberships
    where club_id = v_membership.club_id
      and user_id = v_caller_id
      and role    = 'admin'
      and status  = 'approved'
  ) then
    raise exception 'Only a club admin may approve or deny memberships';
  end if;

  -- Only 'approved' and 'denied' are valid target statuses for this function.
  if p_new_status not in ('approved', 'denied') then
    raise exception 'Invalid status: must be approved or denied';
  end if;

  -- Update the membership status.
  update public.memberships
  set status = p_new_status
  where id   = p_membership_id
  returning * into v_membership;

  -- If denying, cancel all upcoming active reservations for this membership.
  if p_new_status = 'denied' then
    for v_reservation in
      select id
      from public.reservations
      where membership_id = p_membership_id
        and status        = 'active'
        and starts_at     > now()
    loop
      update public.reservations
      set status = 'cancelled'
      where id   = v_reservation.id;

      insert into public.reservation_audit_events
        (reservation_id, event_type, actor_user_id, notes)
      values (
        v_reservation.id,
        'cancelled',
        v_caller_id,
        'Cancelled because membership was denied'
      );
    end loop;
  end if;

  return v_membership;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_member_role  (promote / demote Club Admin)
-- ---------------------------------------------------------------------------
-- Changes a membership's role between 'admin' and 'member'.
--
-- Rules enforced:
--   - Caller must be an approved admin of the same club.
--   - Caller cannot change their own role (prevents self-demotion).
--   - Demoting the last admin in a club is rejected.

create or replace function public.set_member_role(
  p_membership_id uuid,
  p_new_role      public.membership_role
)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership    public.memberships;
  v_caller_id     uuid;
  v_admin_count   integer;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_membership
  from public.memberships
  where id = p_membership_id
  for update;

  if not found then
    raise exception 'Membership not found';
  end if;

  -- Caller must be an approved admin of the same club.
  if not exists (
    select 1 from public.memberships
    where club_id = v_membership.club_id
      and user_id = v_caller_id
      and role    = 'admin'
      and status  = 'approved'
  ) then
    raise exception 'Only a club admin may change member roles';
  end if;

  -- Caller may not change their own role.
  if v_membership.user_id = v_caller_id then
    raise exception 'A club admin cannot change their own role';
  end if;

  -- If demoting from admin, verify at least one other admin remains.
  if v_membership.role = 'admin' and p_new_role = 'member' then
    select count(*) into v_admin_count
    from public.memberships
    where club_id = v_membership.club_id
      and role    = 'admin'
      and status  = 'approved'
      and id      != p_membership_id;

    if v_admin_count < 1 then
      raise exception 'Cannot demote the last club admin';
    end if;
  end if;

  update public.memberships
  set role = p_new_role
  where id = p_membership_id
  returning * into v_membership;

  return v_membership;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_resource_access_status  (approve / deny / revoke resource access)
-- ---------------------------------------------------------------------------
-- Sets the status on a resource_access_approvals row.

create or replace function public.set_resource_access_status(
  p_approval_id uuid,
  p_new_status  public.resource_access_status
)
returns public.resource_access_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval  public.resource_access_approvals;
  v_resource  public.resources;
  v_caller_id uuid;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_approval
  from public.resource_access_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception 'Approval record not found';
  end if;

  -- Look up the resource to get the club_id for admin check.
  select * into v_resource
  from public.resources
  where id = v_approval.resource_id;

  -- Caller must be an approved admin of the resource's club.
  if not exists (
    select 1 from public.memberships
    where club_id = v_resource.club_id
      and user_id = v_caller_id
      and role    = 'admin'
      and status  = 'approved'
  ) then
    raise exception 'Only a club admin may change resource access approvals';
  end if;

  update public.resource_access_approvals
  set status = p_new_status
  where id   = p_approval_id
  returning * into v_approval;

  return v_approval;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_reservation
-- ---------------------------------------------------------------------------
-- Creates a reservation after validating all business rules:
--   1. Caller has an approved membership in the resource's club.
--   2. Caller has an approved resource access approval for this resource.
--   3. The resource is active.
--   4. starts_at and ends_at are aligned to the resource's block_size_minutes.
--   5. No overlap with existing active reservations (advisory lock prevents races).

create or replace function public.create_reservation(
  p_resource_id uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id      uuid;
  v_resource       public.resources;
  v_membership     public.memberships;
  v_block_secs     bigint;
  v_duration_secs  bigint;
  v_reservation    public.reservations;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Fetch and lock the resource.
  select * into v_resource
  from public.resources
  where id = p_resource_id
  for share;

  if not found then
    raise exception 'Resource not found';
  end if;

  if not v_resource.is_active then
    raise exception 'Resource is not active';
  end if;

  -- Verify the caller has an approved membership in the resource's club.
  select * into v_membership
  from public.memberships
  where club_id = v_resource.club_id
    and user_id = v_caller_id
    and status  = 'approved';

  if not found then
    raise exception 'You do not have an approved membership in this club';
  end if;

  -- Verify the caller has approved resource access.
  if not exists (
    select 1 from public.resource_access_approvals
    where membership_id = v_membership.id
      and resource_id   = p_resource_id
      and status        = 'approved'
  ) then
    raise exception 'You do not have approved access to this resource';
  end if;

  -- Validate that ends_at is after starts_at.
  if p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at';
  end if;

  v_block_secs    := v_resource.block_size_minutes * 60;
  v_duration_secs := extract(epoch from (p_ends_at - p_starts_at))::bigint;

  -- Duration must be a whole multiple of the block size.
  if v_duration_secs % v_block_secs != 0 then
    raise exception
      'Reservation duration must be a whole multiple of the block size (% minutes)',
      v_resource.block_size_minutes;
  end if;

  -- starts_at must fall on a block boundary (aligned to Unix epoch, i.e. UTC midnight).
  if extract(epoch from p_starts_at)::bigint % v_block_secs != 0 then
    raise exception
      'Reservation start time must be aligned to a block boundary (% minutes)',
      v_resource.block_size_minutes;
  end if;

  -- Check for overlapping active reservations; use FOR UPDATE to serialize
  -- concurrent attempts on the same resource.
  if exists (
    select 1
    from public.reservations
    where resource_id = p_resource_id
      and status      = 'active'
      and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    for update
  ) then
    raise exception 'The requested time slot overlaps with an existing reservation';
  end if;

  -- All checks passed — create the reservation and its audit event.
  insert into public.reservations (resource_id, membership_id, starts_at, ends_at)
  values (p_resource_id, v_membership.id, p_starts_at, p_ends_at)
  returning * into v_reservation;

  insert into public.reservation_audit_events
    (reservation_id, event_type, actor_user_id)
  values (v_reservation.id, 'created', v_caller_id);

  return v_reservation;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_reservation
-- ---------------------------------------------------------------------------
-- Cancels an active reservation and writes an audit event.
--
-- Rules:
--   - Caller is the member who owns the reservation, OR
--   - Caller is an approved admin of the reservation's club.
--   - Only upcoming (starts_at > now()) reservations can be cancelled.
--   - Cancelled reservations remain in the database for history/audit purposes.

create or replace function public.cancel_reservation(
  p_reservation_id uuid,
  p_notes          text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id  uuid;
  v_reservation public.reservations;
  v_resource    public.resources;
  v_membership  public.memberships;
  v_is_owner    boolean;
  v_is_admin    boolean;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found';
  end if;

  if v_reservation.status != 'active' then
    raise exception 'Only active reservations can be cancelled';
  end if;

  if v_reservation.starts_at <= now() then
    raise exception 'Cannot cancel a reservation that has already started';
  end if;

  -- Look up the membership and resource for authorization.
  select * into v_membership
  from public.memberships
  where id = v_reservation.membership_id;

  select * into v_resource
  from public.resources
  where id = v_reservation.resource_id;

  v_is_owner := (v_membership.user_id = v_caller_id);
  v_is_admin := exists (
    select 1 from public.memberships
    where club_id = v_resource.club_id
      and user_id = v_caller_id
      and role    = 'admin'
      and status  = 'approved'
  );

  if not (v_is_owner or v_is_admin) then
    raise exception 'You do not have permission to cancel this reservation';
  end if;

  -- Cancel the reservation.
  update public.reservations
  set status = 'cancelled'
  where id   = p_reservation_id
  returning * into v_reservation;

  -- Write the audit event.
  insert into public.reservation_audit_events
    (reservation_id, event_type, actor_user_id, notes)
  values (p_reservation_id, 'cancelled', v_caller_id, p_notes);

  return v_reservation;
end;
$$;
