-- Migration: 20260524000003_membership_request_rpc.sql
-- Adds an RPC function for listing all membership requests in a club.

-- ---------------------------------------------------------------------------
-- list_club_membership_requests
-- ---------------------------------------------------------------------------
-- Returns all memberships for the given club, enriched with the requesting
-- user's display_name and callsign. Only approved club admins may call this
-- function.

create or replace function public.list_club_membership_requests(p_club_id uuid)
returns table (
  id                uuid,
  club_id           uuid,
  user_id           uuid,
  role              public.membership_role,
  status            public.membership_status,
  user_display_name text,
  user_callsign     text,
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
    raise exception 'Only a club admin may view membership requests';
  end if;

  return query
    select
      m.id,
      m.club_id,
      m.user_id,
      m.role,
      m.status,
      u.display_name  as user_display_name,
      u.callsign      as user_callsign,
      m.created_at,
      m.updated_at
    from public.memberships m
    join public.users u on u.id = m.user_id
    where m.club_id = p_club_id
      and m.user_id != v_caller_id
    order by m.created_at asc;
end;
$$;
