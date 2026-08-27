-- ── Moderation: blocks and reports ───────────────────────────────────────────
--
-- App Review rejected build 1.0(3) under guideline 1.2, which requires five things from an
-- app whose users can see each other's content:
--
--   1. a EULA with a no-tolerance clause, agreed before use   → src/moderation/terms.ts
--   2. a filter for objectionable content                     → src/moderation/wordFilter.ts
--   3. a way to FLAG objectionable content                    → this file, `content_reports`
--   4. a way to BLOCK an abusive user, taking effect instantly → this file, `user_blocks`
--   5. action on reports within 24 hours                      → store/MODERATION.md
--
-- The user-generated surface being moderated is narrow and worth stating plainly, because
-- it determines everything below: the only content one player can author and another can
-- see is a CHARACTER NAME, published to `roster_snapshots` and rendered on the ladder and
-- on ghosts in the world. Zone chat, party chat and whispers are generated locally and
-- never leave the device. There is no free-text message anywhere between two players.
--
-- Idempotent and additive, matching the house style of the other migrations here; safe to
-- re-run and safe on a project holding live rows.

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
