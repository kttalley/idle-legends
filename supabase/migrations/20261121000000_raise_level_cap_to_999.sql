-- The Undermaw (docs/UNDERMAW.md) raises the level cap to 999, and 1.5.3's lap-gated
-- levelling already lets heroes pass 200 (a live circuit-68 save reached 246 on
-- 2026-11-21). The client clamps the column to 200 to satisfy the old check, which is
-- why the column under-reported that save. Relax the check to the new cap; nothing is
-- lost and existing rows all satisfy it.
alter table public.character_saves drop constraint if exists character_saves_level_check;
alter table public.character_saves add constraint character_saves_level_check check (level between 1 and 999);
