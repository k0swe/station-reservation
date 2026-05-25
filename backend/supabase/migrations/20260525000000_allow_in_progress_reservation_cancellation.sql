-- Migration: 20260525000000_allow_in_progress_reservation_cancellation.sql
-- Allows owners and club admins to cancel active reservations until the
-- reservation has ended, including while it is in progress.

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

  if v_reservation.ends_at <= now() then
    raise exception 'Cannot cancel a reservation that has already ended';
  end if;

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

  update public.reservations
  set status = 'cancelled'
  where id   = p_reservation_id
  returning * into v_reservation;

  insert into public.reservation_audit_events
    (reservation_id, event_type, actor_user_id, notes)
  values (p_reservation_id, 'cancelled', v_caller_id, p_notes);

  return v_reservation;
end;
$$;
