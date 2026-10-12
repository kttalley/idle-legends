-- Where new players stop. Run with:
--   supabase db query --linked -f supabase/funnel.sql
--
-- One row per milestone: how many characters reached it, as a share of those created,
-- and the median minutes of play it took. Store builds only — `dev` and `web` are the
-- developer, the UI suites and the store shooters (see the funnel_events migration).
-- Widen `since` once there is enough data; narrow it to compare before/after a release.

with since as (select timestamptz '2026-10-11' as t),
real as (
  select * from public.funnel_events, since
  where not dev and platform in ('ios', 'android') and at >= since.t
),
born as (select count(*)::numeric n from real where event = 'created')
select event,
       count(*)                                                         as characters,
       round(100 * count(*) / nullif((select n from born), 0))          as pct_of_created,
       round((percentile_cont(0.5) within group (order by play_time) / 60)::numeric, 1)
                                                                        as median_min
from real
group by event
order by count(*) desc, median_min;
