-- ── PvP: honor, and the ghost roster ─────────────────────────────────────────
--
-- Everything here is additive and idempotent, so it is safe on a project that already
-- holds live rows and safe to re-run. `supabase/schema.sql` carries the same statements
-- (it is the whole-schema, paste-into-the-dashboard copy); this file is the migration the
-- CLI applies with `supabase db push`. The two must not drift — if you edit one, edit both.
--
-- ── What the app does without this ───────────────────────────────────────────
-- It keeps working. `publishSnapshot` retries without `honor_kills` when the column is
-- missing, so the leaderboard never goes dark on an un-migrated project — honor simply
-- cannot be ORDERED server-side, and is read out of the JSON payload instead. Applying
-- this is what turns the honor board into a real ranking.

-- Enemy-faction players killed, all time. Added rather than created, because the table
-- shipped before PvP existed; existing rows read as zero kills, which is what they are.
-- Kept as its own column rather than left inside `snapshot` because the honor board ORDERS
-- by it, and ordering by a JSONB field means no usable index.
alter table public.roster_snapshots
  add column if not exists honor_kills int not null default 0 check (honor_kills >= 0);

-- The honor board's ordering. Separate from the power index because it is a genuinely
-- different ranking: the strongest character on the board may have taken no kills at all.
create index if not exists roster_snapshots_honor_idx
  on public.roster_snapshots (honor_kills desc, power desc);

-- The GHOST ROSTER's query (src/net/ghostRoster.ts): "the opposing faction's characters,
-- nearest my power". It filters on faction and orders by power, and unlike either board it
-- runs on every zone arrival — so it gets its own index rather than scanning the power one
-- and discarding half the rows.
create index if not exists roster_snapshots_faction_power_idx
  on public.roster_snapshots (faction, power desc);

-- No RLS change is needed and none is made. Ghosts are read through the existing
-- "roster readable by all authenticated" policy — the same rows the leaderboard already
-- shows to every signed-in player. Nothing about a ghost is ever written back to its owner:
-- being fought is a read, and the fight happens entirely on the attacker's client.
