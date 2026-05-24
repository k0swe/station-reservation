-- Migration: 20260524000000_user_profile_fields.sql
-- Adds optional profile fields for callsign and phone number.

alter table public.users
  add column if not exists callsign text,
  add column if not exists phone_number text;

comment on column public.users.callsign is 'Optional amateur radio callsign for the user profile.';
comment on column public.users.phone_number is 'Optional phone number for the user profile.';
