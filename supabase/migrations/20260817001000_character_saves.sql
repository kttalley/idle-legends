-- ── Cloud saves ──────────────────────────────────────────────────────────────
--
-- The save layer is localStorage with an IndexedDB mirror, and `storagePersistence.ts` is
-- blunt about the limit: the mirror does NOT survive a whole-origin eviction, because
-- WebKit clears IndexedDB alongside localStorage. It caps script-writable storage at seven
-- days without user interaction — which is precisely the play pattern of an idle game.
-- "I did not open it for a week" is the core loop, not an edge case, and today a character
-- can evaporate with nothing able to bring it back.
--
-- This table is that backstop. It is deliberately NOT authoritative: the local save stays
-- the thing the game plays from, and this is a copy the client pushes and can pull back.
-- Making the server the source of truth would mean the server simulating progression,
-- which is a different and much larger game — the same reasoning `net/snapshot` gives for
-- the leaderboard.
--
-- ── How this differs from `roster_snapshots` ─────────────────────────────────
-- That table is PUBLIC by design: every signed-in player reads every row, because that is
-- what a leaderboard is (and now, what the ghost roster is). This one is the opposite —
-- own-row-only for read as well as write. A save blob is a player's whole character
-- including their bags, and nobody else has any business reading it.

create table if not exists public.character_saves (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- The client's own slot id. Part of the key so one account can hold all five characters,
  -- and so a restored slot keeps the identity it had locally rather than being re-minted.
  slot_id    text        not null check (char_length(slot_id) between 1 and 64),
  -- Card fields, mirrored out of the blob so the select screen can list what is in the
  -- cloud without downloading every character.
  hero_name  text        not null default '',
  level      int         not null default 1 check (level between 1 and 200),
  -- `totalPlayTime`, in seconds. This is the DIVERGENCE signal, and the reason it is a
  -- column: deciding "which of these two saves is further along" on wall-clock time alone
  -- is wrong, because a device that merely opened the game later has a newer timestamp and
  -- less progress. Time actually played is the honest comparison.
  play_time  int         not null default 0 check (play_time >= 0),
  -- The slot's own creation time (epoch ms, client clock). Preserved so a restore does not
  -- reset how old the character is.
  created_at bigint      not null default 0,
  saved_at   timestamptz not null default now(),
  -- The save blob, minus everything derived or cosmetic — see `stripForCloud`. jsonb
  -- rather than text so it is inspectable in the dashboard; Postgres TOASTs and compresses
  -- large values on its own, so this is not the storage cost it looks like.
  state      jsonb       not null,
  summary    jsonb       not null,
  primary key (user_id, slot_id)
);

alter table public.character_saves enable row level security;

-- Own rows only, for every verb. Stated as four policies rather than one `for all` so that
-- each is legible in the dashboard and so tightening one later does not require rewriting
-- the others.
drop policy if exists "saves readable by owner" on public.character_saves;
create policy "saves readable by owner"
  on public.character_saves for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "saves insertable by owner" on public.character_saves;
create policy "saves insertable by owner"
  on public.character_saves for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "saves updatable by owner" on public.character_saves;
create policy "saves updatable by owner"
  on public.character_saves for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "saves deletable by owner" on public.character_saves;
create policy "saves deletable by owner"
  on public.character_saves for delete
  to authenticated
  using (user_id = auth.uid());

-- The only query the client makes: "my slots, newest first".
create index if not exists character_saves_owner_idx
  on public.character_saves (user_id, saved_at desc);
