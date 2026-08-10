-- ── Stillmarch — Track N schema ───────────────────────────────────────────────
--
-- Two tables. `roster_snapshots` is a character other players may fight; `duels` is the
-- record of a fight that happened. Everything else Track N needs is already local.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is idempotent — safe to re-run after editing.
--
-- ── The security model, stated once ──────────────────────────────────────────
--
-- Row-level security is the entire trust boundary. The anon key ships in the app and grants
-- nothing by itself; what a request may do is decided by the JWT it carries. Concretely:
--
--   * A player may write exactly one roster row — their own (`user_id = auth.uid()`).
--   * A player may READ every roster row, because that is what a leaderboard is.
--   * NOBODY may write `duels` from the client. Duel rows are inserted only by the Edge
--     Function, which uses the service_role key and bypasses RLS. This is what makes the
--     outcome authoritative: there is no client-side path to writing a win.
--
-- If you remember one thing: the `service_role` key must never appear in the app bundle or
-- in any `VITE_*` variable, because Vite inlines those into shipped JavaScript.

-- ── Roster snapshots ─────────────────────────────────────────────────────────

create table if not exists public.roster_snapshots (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  hero_name       text        not null check (char_length(hero_name) between 1 and 64),
  player_class    text        not null,
  level           int         not null check (level between 1 and 200),
  -- Ordering key for the leaderboard. Computed client-side by `powerScore` and recomputed
  -- nowhere else, so its definition lives in exactly one place (src/net/snapshot.ts).
  power           bigint      not null default 0,
  faction         text        not null default '',
  faction_name    text        not null default '',
  zone_circuit    int         not null default 0 check (zone_circuit >= 0),
  bosses_defeated int         not null default 0 check (bosses_defeated >= 0),
  -- The `HeroCombatant` plus display fields, verbatim. JSONB rather than columns because
  -- equipment and talents are the game's shapes, not the database's, and flattening them
  -- would create a second definition of a character that drifts from `engine/fight.ts`.
  snapshot        jsonb       not null,
  updated_at      timestamptz not null default now()
);

-- The leaderboard's only query: order by power, take the top N.
create index if not exists roster_snapshots_power_idx
  on public.roster_snapshots (power desc, level desc);

alter table public.roster_snapshots enable row level security;

drop policy if exists "roster readable by all authenticated" on public.roster_snapshots;
create policy "roster readable by all authenticated"
  on public.roster_snapshots for select
  to authenticated
  using (true);

-- Insert and update are separate policies on purpose. A single FOR ALL policy would also
-- grant DELETE, and there is no reason a client should be able to remove a roster row.
drop policy if exists "roster insert own" on public.roster_snapshots;
create policy "roster insert own"
  on public.roster_snapshots for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "roster update own" on public.roster_snapshots;
create policy "roster update own"
  on public.roster_snapshots for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep `updated_at` honest. A client-supplied timestamp is a client-controlled sort key,
-- and this column exists partly to rate-limit republishing.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists roster_snapshots_touch on public.roster_snapshots;
create trigger roster_snapshots_touch
  before insert or update on public.roster_snapshots
  for each row execute function public.touch_updated_at();

-- ── Duels ────────────────────────────────────────────────────────────────────

create table if not exists public.duels (
  id             uuid primary key default gen_random_uuid(),
  challenger_id  uuid not null references auth.users (id) on delete cascade,
  defender_id    uuid not null references auth.users (id) on delete cascade,
  -- The seed IS the fight. Both clients replay `runFight(seed, a, b)` and get the same
  -- event stream, so storing a fight log would be storing a derivable value.
  -- int8 because JS bitwise ops produce values up to 2^32-1, which overflows int4.
  seed           bigint not null,
  winner         smallint not null check (winner in (0, 1)),
  -- Copies, not references. A duel must stay replayable after either player levels up or
  -- re-gears; pointing at the live roster row would silently rewrite history.
  challenger_snapshot jsonb not null,
  defender_snapshot   jsonb not null,
  created_at     timestamptz not null default now(),
  constraint no_self_duel check (challenger_id <> defender_id)
);

create index if not exists duels_challenger_idx on public.duels (challenger_id, created_at desc);
create index if not exists duels_defender_idx   on public.duels (defender_id,   created_at desc);

alter table public.duels enable row level security;

-- Read your own duels, as either side. No INSERT/UPDATE/DELETE policy exists for clients,
-- and that absence is deliberate: with RLS enabled and no policy, the operation is denied.
-- The Edge Function writes with service_role, which bypasses RLS entirely.
drop policy if exists "duels readable by participants" on public.duels;
create policy "duels readable by participants"
  on public.duels for select
  to authenticated
  using (auth.uid() = challenger_id or auth.uid() = defender_id);

-- ── Duel rate limit ──────────────────────────────────────────────────────────
--
-- Called by the Edge Function before resolving. Without it, one client can spend an
-- afternoon duelling and fill the table; with it, the cost of abuse is bounded and the
-- defender is not spammed. Counts only duels this user *started*.
create or replace function public.recent_duel_count(uid uuid, window_minutes int default 10)
returns int language sql stable as $$
  select count(*)::int
    from public.duels
   where challenger_id = uid
     and created_at > now() - (window_minutes || ' minutes')::interval
$$;
