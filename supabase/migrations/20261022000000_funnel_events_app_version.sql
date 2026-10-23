-- ── Funnel: which release a milestone was reached on ─────────────────────────
--
-- Added 2026-10-22. 1.3 changed the first minutes of play (newcomer grace, resting, the
-- auto-gather chip) precisely where the funnel showed players leaving, and the table had
-- no way to tell a 1.2 player from a 1.3 one except by date — which mixes in whoever had
-- not updated yet. The client now stamps each row with the store version it shipped as
-- (`VITE_APP_VERSION`, read from the native projects by vite.config.ts).
--
-- Nullable: every row written before this, and by any client older than 1.4, has none.
-- Additive and idempotent like the rest.

alter table public.funnel_events
  add column if not exists app_version text check (char_length(app_version) <= 16);

create index if not exists funnel_events_version_idx on public.funnel_events (app_version, event);
