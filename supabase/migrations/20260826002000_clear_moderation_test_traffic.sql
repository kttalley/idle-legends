-- Clear the reports and blocks generated while driving the moderation UI end-to-end on
-- 2026-08-26.
--
-- The verification run opened the ladder on a throwaway anonymous account and used the
-- flag control for real: "Report only" and then "Block and report" against whichever
-- player was at the top of the live board. Those rows are indistinguishable from genuine
-- reports in the triage queue described in store/MODERATION.md, and acting on them would
-- mean ejecting a real player over a test. They have to go.
--
-- Emptying the tables wholesale rather than matching individual ids is the correct scope
-- here and only here: both were created hours earlier by
-- 20260826000000_moderation_blocks_and_reports.sql and have never been reachable by a
-- shipped build, so every row in them is test traffic. This is a one-time cleanup and must
-- NOT be copied forward — after the next release these tables hold real safety data.

delete from public.content_reports;
delete from public.user_blocks;
