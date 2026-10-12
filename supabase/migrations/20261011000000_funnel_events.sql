-- ── Funnel: where a new player stops ─────────────────────────────────────────
--
-- Written 2026-10-11, after a look at `character_saves` showed the shape of the problem
-- without its cause: real post-launch players reach level 1–8 in Sunhollow Meadows inside
-- 2–30 minutes and do not come back, and nothing recorded WHICH step they stopped at.
--
-- One row per (player, character, milestone), never more. A milestone is a one-way door —
-- first kill, level 5, first quest, came back on day 1 — so the table is bounded at a few
-- dozen rows per character however long they play, and the client can fire on every
-- autosave without accumulating anything. The primary key does the deduplication;
-- `src/net/funnel.ts` inserts with `resolution=ignore-duplicates`.
--
-- Nothing here is user-generated and nothing identifies a person: the user id is the same
-- anonymous Supabase id `character_saves` already holds. It IS new collected data for the
-- store labels, though — Apple "Usage Data → Product Interaction" and Play "App activity →
-- App interactions", linked to the user id, for Analytics, not tracking. Update both before
-- the build carrying `funnel.ts` ships.
--
-- Idempotent and additive, like the other migrations here.

create table if not exists public.funnel_events (
  user_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  slot_id   text        not null check (char_length(slot_id) between 1 and 64),
  -- A short slug from a closed vocabulary in the client. Not a check constraint: adding a
  -- milestone should be a client release, not a migration, and an unknown slug costs one
  -- harmless row.
  event     text        not null check (event ~ '^[a-z0-9_]{1,40}$'),
  at        timestamptz not null default now(),
  -- 'ios' | 'android' | 'web'. Web is mostly the developer and the store shooters, which
  -- is why this and `dev` exist: the save table can't tell a seeded level-55 screenshot
  -- hero from a player, and this one has to.
  platform  text        not null default 'web' check (char_length(platform) <= 16),
  dev       boolean     not null default false,
  -- Seconds of `totalPlayTime` when the milestone fired, so "how long did it take to reach
  -- level 5" is a column read rather than a join against a save that has since moved on.
  play_time int         not null default 0 check (play_time >= 0),
  primary key (user_id, slot_id, event)
);

alter table public.funnel_events enable row level security;

-- Insert own rows only. Reading the funnel is an operator query with the service role.
-- (A select-own policy is added in 20261011001000 — ignore-duplicates needs one.)
drop policy if exists funnel_events_own_insert on public.funnel_events;
create policy funnel_events_own_insert on public.funnel_events
  for insert to authenticated with check (auth.uid() = user_id);

create index if not exists funnel_events_event_idx on public.funnel_events (event, at);
