// ── Reporting objectionable content ───────────────────────────────────────────
//
// App Review 1.2: "a mechanism for users to flag objectionable content", and "the developer
// must act on objectionable content reports within 24 hours".
//
// This file is the first half. The second half is a person reading the queue — the runbook
// for that is `store/MODERATION.md`, and it is not optional: a report button that files into
// a table nobody opens satisfies the letter of the guideline and none of its point.
//
// What can be reported is exactly what one player can see of another: their character name,
// on the ladder or on a ghost in the world. There is no message anywhere between players to
// report, because there is no message anywhere between players.

import { cloudFetch } from '../net/cloudClient'
import { cloudEnabled, restUrl } from '../net/cloudConfig'
import { currentSession, ensureSession } from '../net/session'

const TABLE = 'content_reports'

/**
 * The reasons a player may pick.
 *
 * A closed vocabulary rather than a free-text box, for two reasons that both matter. A
 * free-text report body is itself user-generated content shown to a human, and therefore
 * an abuse vector of its own — the report queue would need moderating. And a fixed set can
 * be triaged in seconds, which is what makes a 24-hour commitment keepable by one person.
 */
export type ReportReason =
  | 'hate_or_slur' | 'sexual' | 'harassment' | 'impersonation' | 'other'

export const REPORT_REASONS: ReadonlyArray<{ id: ReportReason; label: string }> = [
  { id: 'hate_or_slur',  label: 'Hate speech or a slur' },
  { id: 'sexual',        label: 'Sexual or explicit content' },
  { id: 'harassment',    label: 'Harassment or threats' },
  { id: 'impersonation', label: 'Impersonating staff or another player' },
  { id: 'other',         label: 'Something else objectionable' },
]

export interface ReportInput {
  /** The reported account. */
  userId: string
  /** The name AS SEEN. Stored verbatim: it is the objectionable content in almost every
   *  case, and the offender can rename the moment they are reported. */
  name: string
  reason: ReportReason
  /** Where the reporter saw it — 'ladder', 'world', or 'block' for the report that a
   *  block files automatically. */
  surface?: 'ladder' | 'world' | 'block'
}

/**
 * File a report. Never throws, and never blocks the UI on the network.
 *
 * Returns false when the report could not be filed — which the UI deliberately does NOT
 * surface as a failure. Telling someone who has just reported a slur "that didn't work"
 * invites them to sit there re-tapping it, and the action they actually care about (the
 * block, which is local and instant) has already happened. The honest handling is to
 * confirm the report and let the retry be the next launch.
 */
export async function fileReport(input: ReportInput): Promise<boolean> {
  if (!cloudEnabled()) return false
  if (!(await ensureSession())) return false
  const me = currentSession()?.userId
  if (!me || !input.userId || input.userId === me) return false

  const res = await cloudFetch(restUrl(TABLE), {
    method: 'POST',
    body: {
      reporter_id: me,
      reported_id: input.userId,
      reported_name: input.name.slice(0, 24),
      reason: input.reason,
      surface: input.surface ?? 'ladder',
    },
  })
  if (!res.ok) console.warn('[moderation] report could not be filed:', res.reason)
  return res.ok
}
