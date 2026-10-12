-- ── Funnel: the insert needs a SELECT policy to ignore a duplicate ───────────
--
-- `src/net/funnel.ts` inserts with `resolution=ignore-duplicates`, i.e. ON CONFLICT DO
-- NOTHING. Postgres checks the conflicting row against the table's SELECT policies, and
-- with none the whole insert fails RLS — even a row with no conflict at all. Measured
-- against the live project 2026-10-11: a plain insert 201s, the same row with
-- ignore-duplicates 403s. `user_blocks` never hit this because it already had a select-own
-- policy.
--
-- Reading back your own milestones discloses nothing, so the fix is the obvious one.

drop policy if exists funnel_events_own_select on public.funnel_events;
create policy funnel_events_own_select on public.funnel_events
  for select to authenticated using (auth.uid() = user_id);
