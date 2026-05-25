create policy "resources_delete"
  on public.resources for delete
  to authenticated
  using (public.is_club_admin(club_id));
