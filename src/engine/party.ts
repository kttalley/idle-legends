// Party — grouping up with an ambient hero.
//
// This exists because the whisper system started *proposing* it unprompted. Ask a hero
// what they're doing and they'll offer to group, say they'll lead the way, tell you to
// stick close — and then, with nothing behind it, keep wandering their own seeded path.
// The conversation was writing cheques the simulation couldn't cash, and that gap is
// exactly where the illusion snaps.
//
// ── What a companion does ─────────────────────────────────────────────────────
// A companion follows you, talks to you, reacts to what you are doing, and FIGHTS WITH
// YOU — real damage to your target, resolved by the same `resolvePlayerAttack` you use,
// off their own compiled stats and their own seeded stream. They can be hit, and they can
// go down.
//
// This paragraph used to say the opposite, and the reasoning is worth keeping rather than
// deleting: a companion that adds free DPS raises your kills per minute, which makes it an
// economy change that `econSim` has to model. That was true, and it is still true — the
// call the owner made is that a party member who visibly swings and changes nothing reads
// as broken, and a measurable economy shift is the better problem to have. The harness
// grows a partied scenario; the feature does not get gutted to keep the harness simple.
//
// Combat state for a member lives in `GameState.allies`, not here. This module owns
// MEMBERSHIP — who is in the party, invites, chat, and the live behaviour status the HUD
// reads. Damage that the store does not own is damage `econSim` cannot see.
//
// ── Membership lifetime ───────────────────────────────────────────────────────
// A party lives within a zone. Travelling disbands it, with a line in chat, because the
// ambient crowd is regenerated per zone and a member would otherwise be silently recycled
// out from under you. That is also how it reads in an MMO: people go their own way.

import { canGroupWith, HOSTILE_MARK, isHostile, resolveFaction } from '../data/factions'
import type { ChatSpeaker } from './chatGen'
import { pushChat, resolveChat } from './chatLog'
import { isLlmReachable, llmGenerate, PRIORITY } from './llmClient'
import { entityKey } from './whisper'

export interface PartyMember {
  key: string
  speaker: ChatSpeaker
  joinedAt: number
}

/**
 * How many companions may travel with the player.
 *
 * Raised from 1 by C4. The cap was always soft; what actually made a second member inert
 * was that the companion supply was structurally single — one shared sparring-partner
 * slot, one shared spar cooldown (decremented once per follower, so it also drained N
 * times too fast) and one `followerIdx` that held whichever member the reconcile loop
 * touched last. Those are per-member now.
 *
 * Held at 3 rather than opened wide: the party frame stacks vertically in `.hud-tl`, and
 * beyond three frames that column starts fighting `.hud-bottom` for space on a short
 * landscape viewport.
 */
export const PARTY_MAX: number = 3

let members: PartyMember[] = []
const listeners = new Set<() => void>()
/** Invites awaiting a decision, so the button can show a pending state. */
const pendingInvites = new Set<string>()

function emit(): void {
  members = [...members]
  for (const l of listeners) l()
}

export function subscribeParty(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getParty(): PartyMember[] {
  return members
}

export function isInParty(key: string): boolean {
  return members.some(m => m.key === key)
}

export function isInvitePending(key: string): boolean {
  return pendingInvites.has(key)
}

/**
 * Add a hero to the party, synchronously, honouring the cap.
 *
 * Extracted from the invite flow's `settle` so the two cannot drift, and exported because
 * the headless economy harness needs a party WITHOUT an LLM round-trip — invites resolve
 * from a generated reply seconds later and can be declined, which is correct for a player
 * and useless for a measurement that has to be reproducible.
 *
 * Returns null when the party is full or they are already in it.
 */
export function joinParty(speaker: ChatSpeaker, playerFaction?: string): PartyMember | null {
  const key = entityKey(speaker)
  if (isInParty(key) || members.length >= PARTY_MAX) return null
  // ── The faction wall ────────────────────────────────────────────────────────
  // Enforced HERE rather than only at the invite, because this is the one door into the
  // party and the invite is not the only thing that walks through it: the economy harness
  // calls `joinParty` directly to build a party without an LLM round trip, and the accept
  // path calls it again asynchronously seconds after the invite's own check passed.
  //
  // A cross-faction group is not merely unusual, it is incoherent now that PvP exists —
  // the member would be simultaneously in your party frame and a legal target in your
  // rotation, and `mobs` would hold a body for someone standing in `allies`. Refusing at
  // the door is what keeps those two collections from ever describing the same person.
  //
  // `playerFaction` is optional so callers that genuinely have no faction context (the
  // harness) keep working; when it is absent no wall is applied, which is the old
  // behaviour rather than a silent failure.
  if (playerFaction !== undefined && !canGroupWith(speaker.faction, playerFaction)) return null
  const m: PartyMember = { key, speaker, joinedAt: Date.now() }
  members = [...members, m]
  emit()
  return m
}

/** Rules floor for the accept decision — also the fallback when the model is unavailable
 *  or answers in a shape we cannot read. Same faction says yes; the other side mostly
 *  does not, which is the whole point of having factions. */
function wouldAccept(speaker: ChatSpeaker, playerFaction: string): boolean {
  const same = speaker.faction.toLowerCase() === playerFaction.toLowerCase()
  // Deterministic in the hero's identity rather than random, so asking twice does not
  // reroll the dice until you get the answer you wanted.
  const h = entityKey(speaker).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)
  const roll = Math.abs(h % 100) / 100
  return same ? roll < 0.85 : roll < 0.15
}

/** What the other side says when you try to group with them. Trash talk, not a decline —
 *  there was never a decision to make. */
const HOSTILE_REFUSALS = [
  'lol no. wrong colour',
  'i dont group with your kind',
  'nice try. /spit',
  'come closer and say that',
  'ur faction is trash',
  'invite? ill send you a corpse run instead',
]

const CANNED_ACCEPT = ['sure, im down', 'yeah ok lets go', 'k inv', 'sounds good, following u']
const CANNED_DECLINE = ['nah im good', 'sorry, soloing rn', 'cant, waiting on a friend', 'not right now']

/**
 * Invite a hero to party. The decision is theirs, made in character.
 *
 * Posts the invite and a pending placeholder immediately; the answer arrives in chat.
 * A decline is a real outcome, not a failure — being turned down by a stranger is the
 * most MMO thing in the game.
 */
export function invitePartyMember(
  speaker: ChatSpeaker,
  playerName: string,
  playerFaction: string,
  zoneName: string,
  onAccepted?: (m: PartyMember) => void,
): void {
  const key = entityKey(speaker)
  if (isInParty(key) || pendingInvites.has(key)) return
  // Hostiles do not get an invite dialogue. The old flow sent the invite, waited ~4s for
  // a generated reply and then usually printed a decline — which spent a round trip and
  // four seconds of the player's attention to say something the rules already knew. Worse,
  // `wouldAccept` gave the enemy a 15% chance of saying YES, and that hole is precisely
  // the cross-faction party the wall in `joinParty` now refuses; the invite would have
  // resolved to nothing and read as a bug.
  //
  // What comes back instead is a hostile line, immediately. You can still TALK to the
  // other side (see `engine/whisper`) — you just cannot group with them.
  if (isHostile(speaker.faction, playerFaction)) {
    pushChat({
      channel: 'system', from: null, entityKey: key,
      text: `${HOSTILE_MARK} ${speaker.name} is of an enemy faction. You cannot group with them.`,
    })
    pushChat({
      channel: 'system', from: speaker.name, entityKey: key,
      faction: resolveFaction(speaker.faction),
      text: HOSTILE_REFUSALS[Math.abs(key.length * 13) % HOSTILE_REFUSALS.length],
    })
    return
  }
  if (members.length >= PARTY_MAX) {
    pushChat({
      channel: 'system', from: null,
      text: `You can only party with ${PARTY_MAX} ${PARTY_MAX === 1 ? 'hero' : 'heroes'} at a time.`,
    })
    return
  }

  pendingInvites.add(key)
  emit()
  pushChat({
    channel: 'system', from: null, entityKey: key,
    text: `You invite ${speaker.name} to a party.`,
  })
  // Channel is 'system', not 'whisper', on purpose: the player pressed a button on the
  // target card and is watching the main feed for an answer. Filing the reply into the
  // whisper thread would hide it behind a tab — which is exactly how the first cut of
  // this behaved, and it read as the invite silently doing nothing.
  const placeholder = pushChat({
    channel: 'system', from: speaker.name, entityKey: key,
    // Colour by the speaker's OWN faction, resolved to a key.
    //
    // It used to be "player's faction ? alliance : horde", i.e. blue when they matched you
    // and red when they did not — which meant an Ashmarch player saw their own allies
    // rendered in Concord blue. Name colour is a single global fact now (see
    // `data/factions`): Ashmarch red, Concord blue, in every surface, regardless of who
    // is looking.
    faction: resolveFaction(speaker.faction),
    text: '…', pending: true,
  })

  const settle = (accepted: boolean, line: string) => {
    resolveChat(placeholder.id, line)
    pendingInvites.delete(key)
    // Re-check the cap HERE, not only at invite time. Acceptance is asynchronous — it
    // waits on a generated reply — so the guard above passes for every invite sent while
    // the party is still empty, and they can all then accept. Measured: six invites fired
    // in quick succession put FIVE members in a party capped at three, which now matters
    // rather than merely looking untidy, because every member deals real damage.
    if (accepted && members.length >= PARTY_MAX) {
      pushChat({
        channel: 'system', from: null, entityKey: key,
        text: `${speaker.name} would have joined, but your party is full.`,
      })
      emit()
      return
    }
    if (accepted) {
      const m = joinParty(speaker, playerFaction)
      if (m) {
        pushChat({ channel: 'system', from: null, entityKey: key, text: `${speaker.name} joins your party.` })
        onAccepted?.(m)
      }
    } else {
      pushChat({ channel: 'system', from: null, entityKey: key, text: `${speaker.name} declines.` })
    }
    emit()
  }

  const fallback = () => {
    const accept = wouldAccept(speaker, playerFaction)
    const pool = accept ? CANNED_ACCEPT : CANNED_DECLINE
    settle(accept, pool[Math.abs(key.length * 7) % pool.length])
  }

  if (!isLlmReachable()) { setTimeout(fallback, 700); return }

  const specStr = speaker.spec ? `${speaker.spec} ${speaker.playerClass}` : speaker.playerClass
  const prompt = `You are a player character in a fantasy MMO. Someone just sent you a party invite.

You are ${speaker.name}, a level ${speaker.level} ${speaker.race} ${specStr} of ${speaker.faction}.
You are out in ${zoneName}, grinding mobs, with your own agenda.
${playerName} (of ${playerFaction}) invites you to group up.

Decide whether to accept.

- If they are of YOUR OWN faction (${playerFaction}): you almost always say yes. Grouping
  up is normal and useful, and you have no reason to snub a friendly. Only refuse if you
  have a specific in-character reason, and even then stay friendly about it.
- If they are of the ENEMY faction: you usually refuse, and you can be rude about it.

Being turned down constantly is not fun for anyone, so lean toward yes for allies.

Answer in EXACTLY this format, one line:
ACCEPT: <short chat message, max 10 words, lowercase>
or
DECLINE: <short chat message, max 10 words, lowercase>`

  void llmGenerate({
    prompt,
    // The player clicked a button and is watching for an answer.
    priority: PRIORITY.INTERACTIVE,
    numPredict: 40,
    stop: ['\n'],
    temperature: 0.9,
    timeoutMs: 20_000,
  })
    .then(raw => {
      const line = raw.split('\n').map(l => l.trim()).filter(Boolean)[0] ?? ''
      const m = /^(ACCEPT|DECLINE)\s*:\s*(.*)$/i.exec(line)
      if (!m) {
        // The model ignored the format. Rather than guess from prose — "no way" and
        // "no way, im in" invert on a single word — fall back to the rules floor and use
        // whatever it said as the flavour, if it is short enough to pass for chat.
        const text = line.replace(/^["'`]|["'`]$/g, '').slice(0, 80)
        const accept = wouldAccept(speaker, playerFaction)
        settle(accept, text.length >= 2 && text.length <= 80
          ? text
          : (accept ? CANNED_ACCEPT : CANNED_DECLINE)[0])
        return
      }
      const accepted = m[1].toUpperCase() === 'ACCEPT'
      const text = (m[2] || '').replace(/^["'`]|["'`]$/g, '').trim().slice(0, 80)
      settle(accepted, text || (accepted ? CANNED_ACCEPT[0] : CANNED_DECLINE[0]))
    })
    .catch(() => fallback())
}

/** Leave the party — from either side. */
export function leaveParty(key: string, reason?: string): void {
  const m = members.find(x => x.key === key)
  if (!m) return
  members = members.filter(x => x.key !== key)
  // Only blank the status if that was the LAST member. Clearing it unconditionally left
  // the party frame empty for every surviving member until the next 5Hz adapter tick.
  if (members.length === 0) setCompanionStatuses({})
  pushChat({
    channel: 'system', from: null,
    text: reason ?? `${m.speaker.name} has left your party.`,
  })
  emit()
}

// ── Live companion status ─────────────────────────────────────────────────────
// Membership lives here; the BODY lives in the render adapter. The party frame needs
// both — who they are, and what they are doing right now — so the adapter publishes a
// small status snapshot each behaviour tick and the UI subscribes to it. Kept as its own
// observable rather than pushed through the game store, for the same reason as
// everything else in this stack: ambient state must not travel through player state.

export interface CompanionStatus {
  name: string
  /** What they're up to, in words the party frame can show. */
  activity: 'following' | 'moving in' | 'fighting' | 'looting' | 'idle'
  /** True on the frames right after they swing, for a little frame flash. */
  attacking: boolean
}

/**
 * Status for EVERY companion, keyed by party key.
 *
 * Was a single `CompanionStatus`, which dated from a one-member party: the adapter
 * published member 0 and the frame rendered member 0, so members 1 and 2 were invisible
 * in the HUD even though C4 had made the roster plural in the simulation.
 *
 * `hpFrac` is gone from this type on purpose. It used to be scraped out of the ambient
 * fight-log playback, because a companion's health only existed inside a simulated fight.
 * Party members now carry real health in `GameState.allies`, so the frame reads it from
 * there and this channel is left to describe BEHAVIOUR only — which is the half the store
 * genuinely cannot see.
 */
export type CompanionStatusMap = Record<string, CompanionStatus>

const EMPTY_STATUSES: CompanionStatusMap = {}
let companions: CompanionStatusMap = EMPTY_STATUSES
const statusListeners = new Set<() => void>()

export function getCompanionStatuses(): CompanionStatusMap {
  return companions
}

/**
 * Publish the whole map at once.
 *
 * The identity guard matters more than it looks: this is called at the behaviour tick
 * rate and `useSyncExternalStore` re-renders on every changed snapshot identity, so
 * returning a fresh object each tick would re-render the party frame ~5× a second
 * forever — and, worse, a getter that allocates would make the store's own equality
 * check fail on every read and loop.
 */
export function setCompanionStatuses(next: CompanionStatusMap): void {
  const a = Object.keys(companions), b = Object.keys(next)
  if (a.length === b.length && b.every(k => {
    const x = companions[k], y = next[k]
    return x && y && x.name === y.name && x.activity === y.activity && x.attacking === y.attacking
  })) return
  companions = b.length ? next : EMPTY_STATUSES
  for (const l of statusListeners) l()
}

export function subscribeCompanionStatus(fn: () => void): () => void {
  statusListeners.add(fn)
  return () => { statusListeners.delete(fn) }
}

/** Disband everything — called on zone change, since the crowd is regenerated. */
export function disbandParty(reason?: string): void {
  setCompanionStatuses({})
  if (!members.length) { pendingInvites.clear(); return }
  const names = members.map(m => m.speaker.name).join(', ')
  members = []
  pendingInvites.clear()
  pushChat({
    channel: 'system', from: null,
    text: reason ?? `${names} left your party — you went your separate ways.`,
  })
  emit()
}
