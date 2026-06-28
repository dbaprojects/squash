-- Storage policies for the `squash-photos` bucket (HCRR winners photos).
-- Run once in the Supabase SQL editor.
--
-- The app uses the anon/publishable key with no Supabase Auth, so these policies
-- are open (anon can read/write) — same security posture as the rest of the app
-- (app-level guard only: only super_admins see the upload UI). Also set the
-- bucket to PUBLIC in the dashboard (Storage → squash-photos → make public) so
-- getPublicUrl() links load without auth.
--
-- Optional hardening in the dashboard: restrict the bucket to image/* MIME types
-- and a max file size (e.g. 2 MB) — uploads are already resized to ~1080px client-side.

create policy "squash_photos_read"
  on storage.objects for select
  using (bucket_id = 'squash-photos');

create policy "squash_photos_insert"
  on storage.objects for insert
  with check (bucket_id = 'squash-photos');

create policy "squash_photos_update"
  on storage.objects for update
  using (bucket_id = 'squash-photos')
  with check (bucket_id = 'squash-photos');

create policy "squash_photos_delete"
  on storage.objects for delete
  using (bucket_id = 'squash-photos');
