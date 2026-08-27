-- Remove the rows written while smoke-testing the moderation migration against the live
-- project on 2026-08-26.
--
-- The tests were run against production because that is where the RLS policies actually
-- live, and the questions being asked were about RLS: can a client still publish through
-- the new insert/update policies, can a client set its own `banned_until` (it must not),
-- can a client block on someone else's behalf (it must not), can a client read another
-- player's reports (it must not). All four answered correctly. This removes the debris.
--
-- The roster rows were never visible to anyone: their `snapshot` is `{}`, which
-- `sanityCheck` (src/net/snapshot.ts) rejects, so they were filtered out of the
-- leaderboard, the honor board and the ghost roster. They are deleted because junk in a
-- live table is junk in a live table, not because anything was showing.
--
-- Written as a migration because the CLI offers no ad-hoc SQL path, and an idempotent
-- DELETE is harmless to re-run: all four statements are scoped to values that only the
-- smoke test could have produced.

delete from public.roster_snapshots where hero_name in ('ZZTestHero', 'ZZTestHero2');

-- The sentinel targets used by the test, which are not real accounts.
delete from public.content_reports
  where reported_id in (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002');

delete from public.user_blocks
  where blocked_id in (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003');
