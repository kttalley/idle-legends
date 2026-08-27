// ── Objectionable name filtering ──────────────────────────────────────────────
//
// App Review 1.2 requires "a method for filtering objectionable content" from an app whose
// users can see each other's content. In Stillmarch the entire user-generated surface is
// ONE field: the character name. Zone chat, party chat and whispers are all generated
// locally (`engine/chatGen.ts`) and no player's text ever reaches another player — but a
// character name is published to `roster_snapshots` and shown to strangers on the ladder
// and as ghosts standing in the world. So this is the filter, and it only has one job.
//
// ── Why a compiled list and not a service ────────────────────────────────────
// A network call cannot gate a name: character creation happens offline on a plane, and an
// idle game must never acquire a hard dependency on a moderation API to let someone play.
// The list runs locally, deterministically, in under a millisecond. The server-side half of
// the story is the REPORT queue (`moderation/reports.ts`) — filtering catches the obvious,
// reporting catches the creative, and Apple asks for both.
//
// ── Evasion normalisation ────────────────────────────────────────────────────
// A literal substring match is worth very little: leet spellings, letter-spaced spellings
// and Cyrillic-homoglyph spellings all sail through one. `normalise()` folds the three
// cheap evasions — homoglyphs, separators, and repeats — before any matching happens.

/** Leet and homoglyph folding. Deliberately aggressive; the cost of a false positive is a
 *  player picking a different name, and the cost of a miss is a slur on a public ladder. */
const FOLD: Record<string, string> = {
  '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's',
  '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '6': 'g',
  // Cyrillic and Greek lookalikes.
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y',
  'х': 'x', 'ѕ': 's', 'і': 'i', 'ј': 'j', 'к': 'k', 'м': 'm',
  'н': 'h', 'т': 't', 'в': 'b',
  'α': 'a', 'ε': 'e', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'ι': 'i',
  'κ': 'k', 'ν': 'v',
}

/**
 * Fold a display name down to a comparable core.
 *
 * Order matters: decompose accents first, then map homoglyphs, then drop everything that is
 * not a letter (which kills dotted and letter-spaced spellings together), then collapse
 * runs. The collapse is why the word list below must itself contain no doubled letters —
 * see the note there.
 */
export function normalise(input: string): string {
  const folded = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split('')
    .map(ch => FOLD[ch] ?? ch)
    .join('')
    .replace(/[^a-z]/g, '')
  return folded.replace(/(.)\1+/g, '$1')
}

/**
 * Terms that make a name unpublishable.
 *
 * **Every entry must be written with runs already collapsed** (`fuk` not `fukk`), because
 * `normalise` collapses repeats in the input before matching and a doubled letter here
 * could never match anything.
 *
 * Scope is deliberate: slurs and hate terms, sexual content, and impersonation of the
 * operator. It is NOT a general profanity list — this is a game about violence with a
 * combat log full of blood, and banning `hell` would be theatre. The bar is "content a
 * reasonable player would report", which is the bar guideline 1.2 actually sets.
 *
 * Redacted-by-construction: the substrings are assembled from fragments so that this source
 * file does not itself read as a list of slurs, while matching exactly the same strings.
 */
const HATE = [
  'n' + 'iger', 'n' + 'igr', 'f' + 'agot', 'f' + 'agt', 'k' + 'ike', 'sp' + 'ic',
  'ch' + 'ink', 'g' + 'ok', 'tr' + 'any', 'ret' + 'ard', 'nazi', 'hitler',
  'kklan', 'kkk', 'wh' + 'itepower', 'hei' + 'lhitler', 'lyn' + 'ch',
]
const SEXUAL = [
  'r' + 'ape', 'pe' + 'do', 'ped' + 'ophile', 'incest', 'be' + 'stiality', 'chi' + 'ldporn',
  'cp' + 'orn', 'cum', 'dildo', 'cl' + 'itoris', 'blow' + 'job', 'hand' + 'job',
]
/**
 * Strong profanity. A separate tier from HATE because the reasoning is different: none of
 * this is hateful, it is just not something to put on a public ladder next to a stranger's
 * name. Mild profanity is deliberately absent — see the scope note above.
 */
const PROFANITY = [
  'fuk', 'shit', 'cunt', 'twat', 'wank', 'bich', 'bitch', 'asole', 'ashole',
  'dick' + 'head', 'motherfuker', 'jerkof', 'jizm',
]
const IMPERSONATION = [
  'admin', 'moderator', 'gamemaster', 'stilmarch' /* 'stillmarch', runs collapsed */,
  'suport' /* 'support' */, 'oficial' /* 'official' */, 'developer',
]

/**
 * Words that are only objectionable standing alone.
 *
 * `cum` sits inside `cumbersome`, the ethnic slur spelled s-p-i-c inside `suspicious`, and
 * `g-o-k` inside plenty of coined fantasy names. Substring-matching those produces false
 * rejections that feel arbitrary and unexplainable to the player, so they are matched as
 * whole normalised names or as whole space-separated words instead. This is the difference
 * between a filter people accept and one they work around.
 */
const WHOLE_WORD_ONLY = new Set([
  'cum', 'sp' + 'ic', 'g' + 'ok', 'cp' + 'orn', 'kkk', 'dick',
  'admin', 'suport', 'oficial', 'developer',
])

const ALL = [...HATE, ...PROFANITY, ...SEXUAL, ...IMPERSONATION]

/** The longest a published name may be. */
export const NAME_MAX = 24

/**
 * Characters that must never reach a shared list: C0/C1 controls, the bidirectional
 * override family (which reverses the rendering of every name after it), and zero-width
 * joiners and spaces (which build names that are invisible, or that render as something
 * other than what was typed).
 */
const UNRENDERABLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/

/** Why a name was refused, phrased for the player. Null means the name is fine. */
export function nameRejection(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null   // empty falls back to a generated name; not a rejection.
  if (trimmed.length > NAME_MAX) return `That name is too long — ${NAME_MAX} characters at most.`
  if (UNRENDERABLE.test(trimmed)) return 'That name contains characters that cannot be displayed.'

  const flat = normalise(trimmed)
  if (!flat) return 'Please use at least a few letters.'

  const words = new Set(trimmed.toLowerCase().split(/\s+/).map(normalise))

  for (const term of ALL) {
    const hit = WHOLE_WORD_ONLY.has(term) ? (flat === term || words.has(term)) : flat.includes(term)
    if (hit) {
      // Never echo the matched term back. Quoting it turns the rejection message into a
      // probe for discovering exactly which spellings pass.
      return 'That name is not available. Please choose another.'
    }
  }
  return null
}

/** True when a name may be published and shown to other players. */
export function isNameAcceptable(raw: string): boolean {
  return nameRejection(raw) === null
}

/**
 * What to show INSTEAD of a name that should not be displayed.
 *
 * The filter runs at character creation, but `roster_snapshots` already holds rows written
 * before this file existed and nothing backfilled them — and a row is uploaded by another
 * client, which a modified build could skip the check in entirely. So every display path
 * masks as well as creation blocking. Belt and braces, and the braces are the load-bearing
 * half: creation-time checks only ever constrain honest clients.
 */
export function maskName(raw: string): string {
  return isNameAcceptable(raw) ? raw : 'Adventurer'
}
