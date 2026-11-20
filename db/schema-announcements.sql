-- Announcements / News
-- One row per announcement. Shown on the home "Announcements" tile (super_admin
-- only for now) and managed from Admin → News. Expired rows (expiry_date in the
-- past) are hidden from the tile but remain visible/editable in the admin list.

create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text    not null,
  body        text    not null,
  sequence    integer not null default 0,   -- display order, ascending
  expiry_date date,                          -- null = never expires
  created_by  uuid references players(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists announcements_sequence_idx on announcements (sequence);
create index if not exists announcements_expiry_idx    on announcements (expiry_date);

-- RLS: same open-anon pattern as the rest of the app (admin checks are enforced
-- in the client JS; the anon key has no Supabase Auth JWT).
alter table announcements enable row level security;

drop policy if exists announcements_read  on announcements;
drop policy if exists announcements_write on announcements;

create policy announcements_read  on announcements for select using (true);
create policy announcements_write on announcements for all    using (true) with check (true);
