-- Migration: 20260524000001_list_club_reservations.sql
-- Adds a SECURITY DEFINER RPC function that returns all active reservations for
-- a club's resources within a given time window. Approved club members may call
-- this function to populate the reservation grid on the club detail page.
-- The function bypasses RLS (which would otherwise restrict members to seeing
-- only their own reservations) while re-implementing the membership check.

create or replace function public.list_club_reservations(
  p_club_id uuid,
  p_from    timestamptz,
  p_to      timestamptz
)
returns table (
  id            uuid,
  resource_id   uuid,
  membership_id uuid,
  starts_at     timestamptz,
  ends_at       timestamptz,
  status        public.reservation_status,
  callsign      text,
  display_name  text
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

  -- Only approved club members (including admins) may view the grid.
  if not public.is_club_member(p_club_id) then
    raise exception 'You are not an approved member of this club';
  end if;

  return query
    select
      rsv.id,
      rsv.resource_id,
      rsv.membership_id,
      rsv.starts_at,
      rsv.ends_at,
      rsv.status,
      u.callsign,
      u.display_name
    from public.reservations rsv
    join public.memberships  m   on m.id       = rsv.membership_id
    join public.users        u   on u.id        = m.user_id
    join public.resources    res on res.id      = rsv.resource_id
    where res.club_id   = p_club_id
      and rsv.status    = 'active'
      and rsv.starts_at < p_to
      and rsv.ends_at   > p_from;
end;
$$;
