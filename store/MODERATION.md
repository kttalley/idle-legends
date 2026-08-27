# Moderation runbook

App Review rejected build **1.0 (3)** under guideline **1.2 — Safety, User-Generated
Content**. The guideline lists five obligations. This file records where each one lives and,
for the fifth, exactly how to discharge it — because that one is not code, it is a promise
to act, and a promise nobody wrote down is a promise nobody keeps.

| # | Obligation | Where it lives |
|---|---|---|
| 1 | EULA with a no-tolerance clause, agreed before use | `src/moderation/terms.ts`, `src/components/game/TermsGate.tsx` |
| 2 | A method for filtering objectionable content | `src/moderation/wordFilter.ts` |
| 3 | A mechanism to flag objectionable content | `src/components/game/ReportDialog.tsx` → `content_reports` |
| 4 | A mechanism to block abusive users, instantly | `src/moderation/blocks.ts` → `user_blocks` |
| 5 | Act on reports within 24 hours | **This file.** |

## What is actually user-generated here

One field: the **character name**. It is published to `roster_snapshots` and rendered on the
ladder and on ghosts standing in the world.

Zone chat, party chat and whispers are generated on-device (`src/engine/chatGen.ts`) and
never leave it. **No text a player types is ever shown to another player.** Worth knowing
before triaging a report that says "harassment": there is no message to have sent.

Apple's age-rating question is separate and answered differently — the app *has* a chat
interface, so **Messaging and Chat must be set to "Yes"** in App Store Connect (guideline
2.3.6, the other half of this rejection). That the chat is synthetic does not matter to the
rating; what the user can see on screen does.

## The 24-hour loop

Reports arrive in `public.content_reports` with `status = 'open'`. A block files one
automatically, so the queue also carries every block anyone makes.

**Check it daily.** One query, in the Supabase SQL editor:

```sql
select id, created_at, reported_id, reported_name, reason, surface,
       now() - created_at as age
from public.content_reports
where status = 'open'
order by created_at        -- oldest first: that is the one closest to breaching 24h
limit 100;
```

Repeat offenders and pile-ons, which are the strongest automatic signal available:

```sql
select reported_id, reported_name, count(*) as reports,
       count(distinct reporter_id) as distinct_reporters
from public.content_reports
where created_at > now() - interval '7 days'
group by reported_id, reported_name
having count(distinct reporter_id) > 1
order by distinct_reporters desc;
```

### Actioning a report

Apple's wording is "removing the content and ejecting the user who provided the offending
content". Both, in one transaction. **Update the roster row — do not delete it**: the ban
lives on that row, so deleting it removes the ban along with the name and the account can
republish the same name seconds later.

```sql
-- Replace <UUID> with reported_id.
begin;

-- Remove the content. The name leaves every ladder and every ghost roster immediately —
-- both read this table and nothing else.
update public.roster_snapshots
   set hero_name    = 'Adventurer',
       snapshot     = jsonb_set(snapshot, '{combatant,name}', '"Adventurer"'),
       banned_until = now() + interval '100 years'
 where user_id = '<UUID>';

-- Close every open report against them, not just the one you were reading.
update public.content_reports
   set status = 'actioned', resolved_at = now()
 where reported_id = '<UUID>' and status = 'open';

commit;
```

`banned_until` is enforced by RLS and by the `preserve_ban` trigger: the account cannot
publish, cannot update its row, and cannot clear its own ban.

A report that is mistaken or malicious gets closed too — an unresolved queue is
indistinguishable from an unread one:

```sql
update public.content_reports
   set status = 'dismissed', resolved_at = now()
 where id = '<REPORT-UUID>';
```

### Lifting a ban

```sql
update public.roster_snapshots set banned_until = null where user_id = '<UUID>';
```

### Auditing the promise

The commitment is measurable, and should be measured — Apple may ask, and a number is a
better answer than an assurance:

```sql
select count(*) filter (where resolved_at - created_at > interval '24 hours') as breached,
       count(*)                                                              as total,
       max(resolved_at - created_at)                                         as worst
from public.content_reports
where resolved_at is not null;
```

## Contact

Abuse reports from outside the app (email, App Store review replies) go to
**talleykristian@gmail.com**, which is the address printed in the terms and on the terms
gate. Treat those on the same 24-hour clock and record them in `content_reports` by hand so
the audit query above stays honest.

## What Apple asked to see

> Reply to this message with a screen recording captured on a physical device that
> demonstrates: the EULA presented before registering or logging in; the mechanism to flag
> objectionable content; the mechanism to block abusive users.

Capture, in one take on a device:

1. **Delete and reinstall** (or clear the app) so the terms gate is unseen — it only shows
   on first launch, or when `TERMS_VERSION` is bumped. Launch: the gate is the first screen,
   and the no-tolerance clause is the first clause on it, above the fold.
2. Tap **I agree**, create or continue a character.
3. Open the **Ladder**, and tap the **⚑** on another player's row.
4. Show the reason list, tap **Report only**, show the confirmation.
5. Open the flag again on the same player, tap **Block and report** — and show that the row
   **disappears from the list immediately**. That last beat is the one the reviewer is
   looking for and the one a recording can prove.

Paste the same steps into **App Review Information → Notes** in App Store Connect, as they
asked, so the next reviewer does not have to find any of it.
