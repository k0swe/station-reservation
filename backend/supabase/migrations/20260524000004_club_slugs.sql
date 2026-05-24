-- Migration: 20260524000004_club_slugs.sql
-- Adds optional slugs to clubs and extends create_club RPC to accept a slug.

alter table public.clubs
  add column slug text;

alter table public.clubs
  add constraint clubs_slug_format
  check (slug is null or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

create unique index clubs_slug_unique_idx
  on public.clubs (slug)
  where slug is not null;

comment on column public.clubs.slug is 'Optional URL-safe identifier for club routes.';

drop function public.create_club(p_name text);

create function public.create_club(
  p_name text,
  p_slug text default null
)
returns public.clubs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club    public.clubs;
  v_user_id uuid;
  v_slug    text;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_slug := nullif(btrim(p_slug), '');

  if v_slug is not null and v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid slug format: use lowercase letters, numbers, and hyphens only';
  end if;

  insert into public.clubs (name, slug)
  values (p_name, v_slug)
  returning * into v_club;

  insert into public.memberships (club_id, user_id, role, status)
  values (v_club.id, v_user_id, 'admin', 'approved');

  return v_club;
end;
$$;
