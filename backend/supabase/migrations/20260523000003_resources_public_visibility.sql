-- Migration: 20260523000003_resources_public_visibility.sql
-- Allows all authenticated users to browse active resources in clubs.
-- Club admins continue to see all resources via existing policies.

create policy "resources_select_public"
  on public.resources for select
  to authenticated
  using (is_active = true);
