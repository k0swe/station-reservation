-- Migration: 20260524000002_resource_access_rpcs.sql
-- Adds RPC functions for querying resource access approval state.

-- ---------------------------------------------------------------------------
-- get_my_resource_approvals
-- ---------------------------------------------------------------------------
-- Returns the current user's resource_access_approvals rows for all resources
-- belonging to the given club. Used by the frontend to determine which
-- resources the user may book and which require an approval request.

create or replace function public.get_my_resource_approvals(p_club_id uuid)
returns table (
  id          uuid,
  resource_id uuid,
  status      public.resource_access_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
    select raa.id, raa.resource_id, raa.status
    from public.resource_access_approvals raa
    join public.memberships m on m.id = raa.membership_id
    join public.resources   r on r.id = raa.resource_id
    where r.club_id   = p_club_id
      and m.user_id   = v_caller_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_club_resource_access_requests
-- ---------------------------------------------------------------------------
-- Returns all resource_access_approvals rows for resources in the given club,
-- enriched with the resource name and the requesting user's display_name and
-- callsign. Only approved club admins may call this function.

create or replace function public.list_club_resource_access_requests(p_club_id uuid)
returns table (
  id                uuid,
  resource_id       uuid,
  resource_name     text,
  membership_id     uuid,
  user_display_name text,
  user_callsign     text,
  status            public.resource_access_status,
  created_at        timestamptz,
  updated_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_club_admin(p_club_id) then
    raise exception 'Only a club admin may view resource access requests';
  end if;

  return query
    select
      raa.id,
      raa.resource_id,
      res.name          as resource_name,
      raa.membership_id,
      u.display_name    as user_display_name,
      u.callsign        as user_callsign,
      raa.status,
      raa.created_at,
      raa.updated_at
    from public.resource_access_approvals raa
    join public.resources   res on res.id  = raa.resource_id
    join public.memberships m   on m.id    = raa.membership_id
    join public.users       u   on u.id    = m.user_id
    where res.club_id = p_club_id
    order by raa.created_at asc;
end;
$$;
