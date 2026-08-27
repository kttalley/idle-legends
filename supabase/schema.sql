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

-- ── PvP honor ────────────────────────────────────────────────────────────────
-- Added after the table shipped, so it is an ALTER with a default rather than part of the
-- CREATE above: existing rows keep working and simply read as zero kills, which is exactly
-- what they are. Kept as its own column rather than left inside `snapshot` because the
-- honor board ORDERS by it, and ordering by a JSONB field means no usable index.
alter table public.roster_snapshots
  add column if not exists honor_kills int not null default 0 check (honor_kills >= 0);

-- The leaderboard's only query: order by power, take the top N.
create index if not exists roster_snapshots_power_idx
  on public.roster_snapshots (power desc, level desc);

-- The honor board's query. A separate index because it is a genuinely different ordering:
-- the strongest character on the board may have taken no kills at all.
create index if not exists roster_snapshots_honor_idx
  on public.roster_snapshots (honor_kills desc, power desc);

-- The GHOST ROSTER's query (src/net/ghostRoster.ts): "the opposing faction's characters,
-- nearest my power". It filters on faction and orders by power, and it runs on every zone
-- arrival — far more often than either board above, which is why it gets its own index
-- rather than riding on the power one and filtering after the fact.
create index if not exists roster_snapshots_faction_power_idx
  on public.roster_snapshots (faction, power desc);

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


-- ══ Moderation ═══════════════════════════════════════════════════════════════
--
-- Mirrors migrations/20260826000000_moderation_blocks_and_reports.sql, which carries the
-- full rationale (App Review guideline 1.2). The two must not drift: this file is the
-- paste-into-the-dashboard whole-schema copy, that one is what `supabase db push` applies.
-- Edit one, edit both.

-- ── Blocks ───────────────────────────────────────────────────────────────────
--
-- "Blocking should remove the content from the user's feed instantly." Kept server-side
-- rather than in localStorage so the block survives a reinstall and a device change —
-- a block that a fresh install silently forgets is not a block.
--
-- No foreign key to auth.users on `blocked_id`: the row must survive the blocked account
-- being deleted, and a FK would take the evidence with it.
create table if not exists public.user_blocks (
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null,
  -- The name as it appeared WHEN BLOCKED. The offender can rename; a report that reads
  -- "user 8f3a… was abusive" months later is unactionable without this.
  blocked_name text not null default '',
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  -- Blocking yourself is always a mistake or a probe, and it would hide your own row from
  -- your own ladder, which looks exactly like data loss.
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

-- A block list is private to the person who made it. Nobody may read whom another player
-- has blocked, and nobody may write a block on someone else's behalf.
drop policy if exists user_blocks_own_select on public.user_blocks;
create policy user_blocks_own_select on public.user_blocks
  for select using (auth.uid() = blocker_id);

drop policy if exists user_blocks_own_insert on public.user_blocks;
create policy user_blocks_own_insert on public.user_blocks
  for insert with check (auth.uid() = blocker_id);

-- Unblocking. Apple does not require it, but a block with no way out is a trap, and a
-- mis-tap on a list of strangers is easy.
drop policy if exists user_blocks_own_delete on public.user_blocks;
create policy user_blocks_own_delete on public.user_blocks
  for delete using (auth.uid() = blocker_id);

create index if not exists user_blocks_blocker_idx on public.user_blocks (blocker_id);
-- Supports the operator query "who has this account been blocked by, and how often" —
-- a repeatedly-blocked account is the strongest automatic signal available here.
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- ── Reports ──────────────────────────────────────────────────────────────────
--
-- The flag mechanism. One row per report; deliberately NOT deduplicated, because five
-- players reporting the same name is materially different information from one player
-- doing it, and collapsing them destroys exactly the signal worth having.
create table if not exists public.content_reports (
  id            uuid primary key default gen_random_uuid(),
  -- Nullable, and it must be: `on delete set null` cannot fire against a NOT NULL column,
  -- so declaring both would make deleting an account fail outright. A report outlives its
  -- reporter — the evidence is the reported name, not who noticed it.
  reporter_id   uuid references auth.users(id) on delete set null,
  -- Who and what is being reported. `reported_name` is the actual objectionable content in
  -- almost every case, so it is stored verbatim rather than referenced: the offender can
  -- change their name the moment they are reported, and then the queue holds no evidence.
  reported_id   uuid not null,
  reported_name text not null default '',
  -- A fixed vocabulary, not free text. Free-text report bodies are themselves
  -- user-generated content shown to a human, and an abuse vector of their own; a closed set
  -- is also far faster to triage against a 24-hour commitment.
  reason        text not null check (reason in (
                  'hate_or_slur', 'sexual', 'harassment', 'impersonation', 'other')),
  -- Where the reporter saw it, so the queue can tell a ladder name from a ghost nameplate.
  surface       text not null default 'ladder',
  status        text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at    timestamptz not null default now(),
  -- Stamped when a human resolves it. The 24-hour commitment in store/MODERATION.md is
  -- measured as `resolved_at - created_at`, so it has to be recorded to be auditable.
  resolved_at   timestamptz
);

alter table public.content_reports enable row level security;

-- Reporters may FILE reports and read back only their own. They may not read anyone else's
-- and may not change a report's status — triage is an operator action, performed with the
-- service role, which bypasses RLS.
drop policy if exists content_reports_own_insert on public.content_reports;
create policy content_reports_own_insert on public.content_reports
  for insert with check (auth.uid() = reporter_id and auth.uid() <> reported_id);

drop policy if exists content_reports_own_select on public.content_reports;
create policy content_reports_own_select on public.content_reports
  for select using (auth.uid() = reporter_id);

-- The triage query: oldest open report first, which is the order that keeps the 24-hour
-- promise honest.
create index if not exists content_reports_open_idx
  on public.content_reports (status, created_at) where status = 'open';
create index if not exists content_reports_target_idx
  on public.content_reports (reported_id, created_at desc);

-- ── Ejection ─────────────────────────────────────────────────────────────────
--
-- "The developer must act on objectionable content reports within 24 hours by removing the
-- content and ejecting the user who provided the offending content."
--
-- Removing the content and ejecting the user are one operation here, because the content
-- IS the roster row: delete it and the name leaves every ladder and every ghost roster
-- immediately, since both read from `roster_snapshots` and nothing else. `banned_until`
-- then stops the same account republishing the same name a second later, which deleting
-- the row alone does not.
alter table public.roster_snapshots
  add column if not exists banned_until timestamptz;

-- Publishing is blocked while a ban is live. Enforced in the database rather than in the
-- client for the obvious reason: a client-side ban is a suggestion.
--
-- The EXISTING policies are replaced by name ("roster insert own" / "roster update own",
-- from supabase/schema.sql) rather than added alongside. A policy set is OR-ed, so a
-- leftover permissive policy of the old name would grant precisely what these forbid.
drop policy if exists "roster insert own" on public.roster_snapshots;
create policy "roster insert own"
  on public.roster_snapshots for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.roster_snapshots r
      where r.user_id = auth.uid() and r.banned_until > now()
    )
  );

drop policy if exists "roster update own" on public.roster_snapshots;
create policy "roster update own"
  on public.roster_snapshots for update
  to authenticated
  -- USING gates which rows may be updated at all, and is evaluated against the row as it
  -- stands. A banned row therefore cannot be republished over — which is the whole point,
  -- since publishing is an upsert and would otherwise land here rather than on INSERT.
  using (auth.uid() = user_id and (banned_until is null or banned_until <= now()))
  with check (auth.uid() = user_id);

-- `banned_until` is operator state, and no client may write it in either direction.
--
-- This is a trigger rather than an RLS clause because RLS cannot see the OLD row: a WITH
-- CHECK can say what the new value must be, but not "must equal what it was", which is
-- exactly the rule needed. The trigger simply overwrites whatever the client sent with the
-- stored value, so an attempt to lift one's own ban silently does nothing.
create or replace function public.preserve_ban()
returns trigger language plpgsql as $$
begin
  new.banned_until := old.banned_until;
  return new;
end $$;

drop trigger if exists roster_snapshots_preserve_ban on public.roster_snapshots;
create trigger roster_snapshots_preserve_ban
  before update on public.roster_snapshots
  for each row execute function public.preserve_ban();
