-- Migration: 20260522000000_initial_schema.sql
-- Creates all core tables, enums, indexes, and triggers for the Club Shack app.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- btree_gist enables GiST indexes on scalar types (needed for tstzrange overlap
-- indexes used by reservation overlap queries).
create extension if not exists "btree_gist";

-- ---------------------------------------------------------------------------
-- Custom Enum Types
-- ---------------------------------------------------------------------------

create type public.membership_status as enum ('pending', 'approved', 'denied');
create type public.membership_role   as enum ('admin', 'member');

create type public.resource_access_status as enum ('pending', 'approved', 'denied');

create type public.reservation_status as enum ('active', 'cancelled');

create type public.audit_event_type as enum ('created', 'cancelled');

-- ---------------------------------------------------------------------------
-- Helper: update updated_at on every UPDATE
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Table: clubs
-- ---------------------------------------------------------------------------

create table public.clubs (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null    default now()
);

comment on table  public.clubs      is 'A ham radio club that manages its own members and resources.';
comment on column public.clubs.name is 'Human-readable club name; not required to be unique at the DB level.';

-- ---------------------------------------------------------------------------
-- Table: users
-- ---------------------------------------------------------------------------
-- Stores a public profile for every authenticated user. Kept in sync with
-- auth.users via the handle_new_user trigger below.

create table public.users (
  id           uuid        primary key references auth.users on delete cascade,
  display_name text,
  email        text,
  created_at   timestamptz not null default now()
);

comment on table public.users is 'Public user profiles, one per auth.users row.';

-- ---------------------------------------------------------------------------
-- Table: memberships
-- ---------------------------------------------------------------------------

create table public.memberships (
  id         uuid                    primary key default gen_random_uuid(),
  club_id    uuid                    not null references public.clubs   on delete cascade,
  user_id    uuid                    not null references public.users   on delete cascade,
  role       public.membership_role   not null default 'member',
  status     public.membership_status not null default 'pending',
  created_at timestamptz             not null default now(),
  updated_at timestamptz             not null default now(),

  -- One membership record per user per club.
  unique (club_id, user_id)
);

comment on table public.memberships is 'Tracks each user''s membership in a club, including their role and approval status.';

create trigger set_memberships_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: resources
-- ---------------------------------------------------------------------------

create table public.resources (
  id                  uuid        primary key default gen_random_uuid(),
  club_id             uuid        not null references public.clubs on delete cascade,
  name                text        not null,
  description         text,
  block_size_minutes  integer     not null check (block_size_minutes > 0),
  is_active           boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table  public.resources                     is 'A reservable resource (e.g., a radio station) belonging to a club.';
comment on column public.resources.block_size_minutes  is 'Reservation block size in minutes. Reservations must be whole multiples of this value.';

create trigger set_resources_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: resource_access_approvals
-- ---------------------------------------------------------------------------

create table public.resource_access_approvals (
  id            uuid                         primary key default gen_random_uuid(),
  membership_id uuid                         not null references public.memberships on delete cascade,
  resource_id   uuid                         not null references public.resources   on delete cascade,
  status        public.resource_access_status not null default 'pending',
  created_at    timestamptz                  not null default now(),
  updated_at    timestamptz                  not null default now(),

  -- One approval record per member per resource.
  unique (membership_id, resource_id)
);

comment on table public.resource_access_approvals is 'Tracks whether a club member has been approved to use a specific resource.';

create trigger set_resource_access_approvals_updated_at
  before update on public.resource_access_approvals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: reservations
-- ---------------------------------------------------------------------------

create table public.reservations (
  id            uuid                      primary key default gen_random_uuid(),
  resource_id   uuid                      not null references public.resources   on delete restrict,
  membership_id uuid                      not null references public.memberships on delete restrict,
  starts_at     timestamptz               not null,
  ends_at       timestamptz               not null,
  status        public.reservation_status  not null default 'active',
  created_at    timestamptz               not null default now(),
  updated_at    timestamptz               not null default now(),

  constraint reservations_time_check check (ends_at > starts_at)
);

comment on table  public.reservations           is 'A time-block reservation of a resource by a club member.';
comment on column public.reservations.starts_at is 'UTC start time; must be aligned to the resource''s block boundary.';
comment on column public.reservations.ends_at   is 'UTC end time; duration must be a whole multiple of the resource block size.';

-- Partial GiST index on active reservations only, for efficient overlap queries.
create index reservations_active_range_idx
  on public.reservations using gist (resource_id, tstzrange(starts_at, ends_at, '[)'))
  where status = 'active';

create trigger set_reservations_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: reservation_audit_events
-- ---------------------------------------------------------------------------

create table public.reservation_audit_events (
  id             uuid                    primary key default gen_random_uuid(),
  reservation_id uuid                    not null references public.reservations on delete restrict,
  event_type     public.audit_event_type  not null,
  actor_user_id  uuid                    not null references auth.users          on delete restrict,
  notes          text,
  created_at     timestamptz             not null default now()
);

comment on table public.reservation_audit_events is 'Immutable audit trail for reservation lifecycle events (created, cancelled).';

-- ---------------------------------------------------------------------------
-- Trigger: auto-create a public.users profile when a new auth user signs up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
