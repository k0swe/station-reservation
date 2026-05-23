-- seed.sql
-- Local development seed data for Club Shack.
--
-- This file is applied automatically by `supabase db reset`.
-- Do NOT run against a production database.
--
-- Seed strategy:
--   - Insert directly into auth.users (bypasses email confirmation).
--   - The handle_new_user trigger creates matching public.users rows.
--   - Then use public RPC functions where possible so business-rule constraints
--     are exercised even in dev/test.

-- ---------------------------------------------------------------------------
-- Seed users
-- ---------------------------------------------------------------------------
-- Passwords are hashed using bcrypt for 'password123'.
-- In local dev, Supabase Studio can be used to create users via the UI too.

insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
) values
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'alice@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"display_name": "Alice Admin"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000002',
    'bob@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"display_name": "Bob Member"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000003',
    'carol@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"display_name": "Carol Pending"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed club
-- ---------------------------------------------------------------------------

insert into public.clubs (id, name) values
  ('cccccccc-0000-0000-0000-000000000001', 'Rocky Mountain Amateur Radio Club')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed memberships
-- ---------------------------------------------------------------------------
-- Alice is an approved admin, Bob is an approved member, Carol is pending.

insert into public.memberships (id, club_id, user_id, role, status) values
  (
    'dddddddd-0000-0000-0000-000000000001',
    'cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'admin',
    'approved'
  ),
  (
    'dddddddd-0000-0000-0000-000000000002',
    'cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002',
    'member',
    'approved'
  ),
  (
    'dddddddd-0000-0000-0000-000000000003',
    'cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000003',
    'member',
    'pending'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed resources
-- ---------------------------------------------------------------------------

insert into public.resources (id, club_id, name, description, block_size_minutes, is_active) values
  (
    'eeeeeeee-0000-0000-0000-000000000001',
    'cccccccc-0000-0000-0000-000000000001',
    'HF Station #1',
    'Yaesu FT-991A with 100W HF/VHF/UHF capability and dipole antenna.',
    60,
    true
  ),
  (
    'eeeeeeee-0000-0000-0000-000000000002',
    'cccccccc-0000-0000-0000-000000000001',
    'VHF Repeater Link Station',
    'Station used to access the club VHF/UHF repeater system.',
    30,
    true
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed resource access approvals
-- ---------------------------------------------------------------------------
-- Bob has approved access to HF Station #1, and a pending request for VHF.

insert into public.resource_access_approvals (id, membership_id, resource_id, status) values
  (
    'ffffffff-0000-0000-0000-000000000001',
    'dddddddd-0000-0000-0000-000000000002',
    'eeeeeeee-0000-0000-0000-000000000001',
    'approved'
  ),
  (
    'ffffffff-0000-0000-0000-000000000002',
    'dddddddd-0000-0000-0000-000000000002',
    'eeeeeeee-0000-0000-0000-000000000002',
    'pending'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed a reservation (Bob has one upcoming reservation on HF Station #1)
-- ---------------------------------------------------------------------------

insert into public.reservations (id, resource_id, membership_id, starts_at, ends_at, status) values
  (
    'aaaabbbb-0000-0000-0000-000000000001',
    'eeeeeeee-0000-0000-0000-000000000001',
    'dddddddd-0000-0000-0000-000000000002',
    -- Align to the next UTC midnight + 14 hours (2 PM UTC), one week from epoch
    date_trunc('week', now() at time zone 'UTC') at time zone 'UTC' + interval '7 days 14 hours',
    date_trunc('week', now() at time zone 'UTC') at time zone 'UTC' + interval '7 days 15 hours',
    'active'
  )
on conflict (id) do nothing;

-- Audit event for the seed reservation.
insert into public.reservation_audit_events (reservation_id, event_type, actor_user_id, notes) values
  (
    'aaaabbbb-0000-0000-0000-000000000001',
    'created',
    'aaaaaaaa-0000-0000-0000-000000000002',
    'Seeded for local development'
  )
on conflict do nothing;
