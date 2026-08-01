// Party — grouping up with an ambient hero.
//
// This exists because the whisper system started *proposing* it unprompted. Ask a hero
// what they're doing and they'll offer to group, say they'll lead the way, tell you to
// stick close — and then, with nothing behind it, keep wandering their own seeded path.
// The conversation was writing cheques the simulation couldn't cash, and that gap is
// exactly where the illusion snaps.
//
// ── What a companion does, and deliberately does not do ───────────────────────
// A companion follows you, talks to you, reacts to what you are doing, and fights the
// monsters IT finds along the way — resolved by the same `runFight` every other ambient
// hero uses, with its own numbers.
//
// It never touches YOUR fight. No damage to your target, no XP, no loot, no gold. That is
// the standing rule for every ambient hero and a party member is the first thing that
// really tests it, so it is worth being explicit: a companion that added free DPS would
// raise your kills per minute, which makes it an economy change — something `econSim`
// would have to model and the whole balance pass would have to absorb. A companion is
// company, not a damage buff.
//
// ── Membership lifetime ───────────────────────────────────────────────────────
// A party lives within a zone. Travelling disbands it, with a line in chat, because the
// ambient crowd is regenerated per zone and a member would otherwise be silently recycled
// out from under you. That is also how it reads in an MMO: people go their own way.

import type { ChatSpeaker } from './chatGen'
import { pushChat, resolveChat } from './chatLog'
import { isLlmReachable, llmGenerate, PRIORITY } from './llmClient'
import { entityKey } from './whisper'

export interface PartyMember {
  key: string
  speaker: ChatSpeaker
  joinedAt: number
}

/** One companion at a time. A crowd of followers is a different feature (and a perf
 *  problem); one is enough to make the world feel social. */
export const PARTY_MAX = 1

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
  if (members.length >= PARTY_MAX) {
    pushChat({ channel: 'system', from: null, text: `You can only party with ${PARTY_MAX} hero at a time.` })
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
    // Colour by whether they match the player's faction; the literal name is generated
    // per run, so matching on a hardcoded substring never worked.
    faction: speaker.faction.trim().toLowerCase() === playerFaction.trim().toLowerCase() ? 'alliance' : 'horde',
    text: '…', pending: true,
  })

  const settle = (accepted: boolean, line: string) => {
    resolveChat(placeholder.id, line)
    pendingInvites.delete(key)
    if (accepted) {
      const m: PartyMember = { key, speaker, joinedAt: Date.now() }
      members = [...members, m]
      pushChat({ channel: 'system', from: null, entityKey: key, text: `${speaker.name} joins your party.` })
      onAccepted?.(m)
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
  setCompanionStatus(null)
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
  /** Health fraction 0–1 while they're in a fight; 1 the rest of the time. */
  hpFrac: number
  /** True on the frames right after they swing, for a little frame flash. */
  attacking: boolean
}

let companion: CompanionStatus | null = null
const statusListeners = new Set<() => void>()

export function getCompanionStatus(): CompanionStatus | null {
  return companion
}

export function setCompanionStatus(s: CompanionStatus | null): void {
  // Cheap equality guard: this is called at the behaviour tick rate, and a new object
  // identity every tick would re-render the party frame 5× a second for nothing.
  if (s === null && companion === null) return
  if (s && companion && s.name === companion.name && s.activity === companion.activity
      && Math.abs(s.hpFrac - companion.hpFrac) < 0.01 && s.attacking === companion.attacking) return
  companion = s
  for (const l of statusListeners) l()
}

export function subscribeCompanionStatus(fn: () => void): () => void {
  statusListeners.add(fn)
  return () => { statusListeners.delete(fn) }
}

/** Disband everything — called on zone change, since the crowd is regenerated. */
export function disbandParty(reason?: string): void {
  setCompanionStatus(null)
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
