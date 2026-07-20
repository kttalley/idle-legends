import type { ClassType, ZoneId, FactionType, TownId } from '../data/types'

const OLLAMA_BASE = import.meta.env.LLM_URL || 'http://localhost:11434'
const MODEL       = 'incept5/llama3.1-claude:latest'

export interface GeneratedNames {
  playerName: string
  zoneNames: Partial<Record<ZoneId, string>>
  traits: string[]
  factionNames: Record<FactionType, string>
  townNames: Record<TownId, string>
}

// ── Faction name fallback pools ───────────────────────────────────────────────
// Light faction (maps to 'alliance') — noble, ordered, ancient
const LIGHT_PREFIXES = ['Iron', 'Silver', 'Dawnward', 'Goldspire', 'Stone', 'Ashborn', 'Starfall', 'Frostmantle', 'Crystalhall', 'Stormridge', 'Whiteveil', 'Embercrown', 'Gilded', 'Ardent', 'Highwatch']
const LIGHT_SUFFIXES = ['Covenant', 'Accord', 'Vigil', 'Conclave', 'Bastion', 'Order', 'Bulwark', 'Pact', 'Oath', 'Wardens', 'Vanguard', 'Sanctum', 'Compact', 'Brotherhood', 'Assembly']

// Shadow faction (maps to 'horde') — brutal, primal, tribal
const SHADOW_PREFIXES = ['Bloodmaw', 'Ashfang', 'Ironjaw', 'Boneclaw', 'Grimtide', 'Scarwar', 'Venomspur', 'Emberscar', 'Duskrend', 'Warspine', 'Skullbreak', 'Darkroar', 'Gorewind', 'Felbrand', 'Crushmarrow']
const SHADOW_SUFFIXES = ['Clan', 'Warband', 'Legion', 'Pack', 'Host', 'Reavers', 'March', 'Surge', 'Tide', 'Rend', 'Dominion', 'Horde', 'Throng', 'Descent', 'Phalanx']

// Neutral faction
const NEUTRAL_PREFIXES = ['Gray', 'Wandering', 'Free', 'Open', 'Crossroads', 'Drifting', 'Between']
const NEUTRAL_SUFFIXES = ['Circle', 'Exchange', 'Conclave', 'Forum', 'Compact', 'Market', 'Accord']

function seededPick<T>(arr: T[], seed: number, offset: number): T {
  const x = Math.sin(seed * 9301 + offset * 49297 + 233) * 16807
  const idx = Math.abs(Math.floor((x - Math.floor(x)) * arr.length))
  return arr[idx % arr.length]
}

export function generateFactionNamesFallback(seed: number): Record<FactionType, string> {
  return {
    alliance: `The ${seededPick(LIGHT_PREFIXES, seed, 1)} ${seededPick(LIGHT_SUFFIXES, seed, 2)}`,
    horde:    `The ${seededPick(SHADOW_PREFIXES, seed, 3)} ${seededPick(SHADOW_SUFFIXES, seed, 4)}`,
    neutral:  `The ${seededPick(NEUTRAL_PREFIXES, seed, 5)} ${seededPick(NEUTRAL_SUFFIXES, seed, 6)}`,
  }
}

// ── Player-name fallback (synchronous) ────────────────────────────────────────
// Instant, seeded, class-flavoured — used by character creation so "reroll" is
// immediate and the field is editable. The async LLM generator still runs after the
// game starts to enrich traits/zone names, but it must not overwrite a chosen name.
const NAME_STARTS = ['Gor', 'Bran', 'Kael', 'Thal', 'Vor', 'Dra', 'Mor', 'Syl', 'Aer', 'Grim', 'Fen', 'Rho', 'Ulf', 'Var', 'Zar', 'Eld', 'Hroth', 'Kor', 'Mal', 'Ryn', 'Tor', 'Vael', 'Wyn', 'Cael', 'Dain', 'Ser', 'Fael', 'Bael', 'Nyx', 'Oren']
const NAME_ENDS   = ['van', 'dor', 'ric', 'gar', 'wyn', 'thas', 'mir', 'ok', 'ash', 'en', 'wald', 'rin', 'mund', 'oth', 'ael', 'gorn', 'dris', 'vek', 'nar', 'wen']

const CLASS_EPITHETS: Record<ClassType, string[]> = {
  warrior: ['the Relentless', 'the Unbroken', 'Ironheart', 'the Wrathful', 'Bloodsworn', 'the Stalwart', 'Oathkeeper'],
  mage:    ['the Frostborn', 'the Arcane', 'Coldmind', 'Wintertongue', 'the Calculating', 'the Unseen', 'Riftwatcher'],
  rogue:   ['the Silent', 'Poisonhand', 'the Patient', 'Nightblade', 'the Vengeful', 'Shadowstep', 'the Quick'],
  warlock: ['the Hollow', 'Voidsworn', 'the Cursed', 'Duskcaller', 'the Haunted', 'Felbound', 'the Nameless'],
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function generatePlayerNameFallback(seed: number, playerClass: ClassType): string {
  const first = cap(seededPick(NAME_STARTS, seed, 7) + seededPick(NAME_ENDS, seed, 8))
  const epithet = seededPick(CLASS_EPITHETS[playerClass] ?? CLASS_EPITHETS.warrior, seed, 9)
  return `${first} ${epithet}`
}

const CLASS_FLAVOR: Record<ClassType, string> = {
  warrior: 'a battle-scarred Arms Warrior who fights with massive two-handed weapons',
  mage:    'a Frost Mage who wields ice and arcane magic',
  rogue:   'an Assassination Rogue who strikes from the shadows with poison-tipped blades',
  warlock: 'an Affliction Warlock who commands shadow curses and void corruption',
}

const CLASS_TRAIT_POOLS: Record<ClassType, string> = {
  warrior: 'stoic, bloodthirsty, relentless, stubborn, honorable, wrathful, protective, fatalistic',
  mage:    'calculating, curious, arrogant, methodical, cold, obsessive, detached, sardonic',
  rogue:   'paranoid, patient, mercenary, cynical, precise, opportunistic, vengeful, amused',
  warlock: 'nihilistic, ambitious, contemptuous, unsettling, power-hungry, sardonic, haunted, patient',
}

const ZONE_THEMES: Record<ZoneId, string> = {
  sunhollow_meadows:  'peaceful sun-dappled starting meadow, level 1-10, home to wolves and boars',
  dustwind_plains:    'harsh arid plains swept by gritty winds, level 10-20, home to scorpids and bandits',
  grimshade_forest:   'dark haunted forest choked with shadow, level 20-30, home to undead and shadow beasts',
  thornvale_jungle:   'dense deadly jungle with ancient ruins, level 30-40, home to trolls and giant spiders',
  ashfire_peaks:      'volcanic mountain peaks shrouded in ash and flame, level 40-50, home to fire elementals and dragons',
  shattered_crossing: 'ruined bridge-town where two factions battle, levels 45-55',
  the_bloodfields:    'open war-torn plains littered with the dead, levels 50-60',
  ironcrag_badlands:  'jagged iron-red badlands, first Horde stronghold, levels 55-70',
  venom_hollows:      'fetid troll swamps reeking of poison, levels 65-80',
  warsong_mesa:       'red stone plateaus echoing with orc war-drums, levels 75-90',
  cinderfall_wastes:  'ash-choked ruins of a city burned in war, levels 85-100',
  the_maw_eternal:    'the world-edge abyss, final Horde fortress, levels 95-100',
}

async function ollamaGenerate(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.92, num_predict: 700 },
    }),
  })
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = await res.json()
  return (data.response ?? '').trim()
}

const TOWN_THEMES: Record<string, string> = {
  sunhollow_village: 'a threatened farming village in sun-dappled meadows, level 1-10',
  dustwind_post:     'a fortified military outpost on harsh arid plains, level 10-20',
  grimshade_refuge:  'a survivor encampment in a dark cursed forest, level 20-30',
  crossroads_market: 'a neutral war-profiteer trading hub at a ruined bridge-town, levels 45-55',
  ironcrag_hold:     'the seat of the first Horde clan in jagged iron-red badlands, levels 55-70',
  warsong_bastion:   'an orcish military bastion on red stone plateaus with war-drums, levels 75-90',
}

export async function generateNames(playerClass: ClassType, seed: number): Promise<GeneratedNames> {
  const zoneDescriptions = Object.entries(ZONE_THEMES)
    .map(([id, theme]) => `    "${id}": "<unique 2-3 word evocative zone name for: ${theme}>"`)
    .join(',\n')

  const townDescriptions = Object.entries(TOWN_THEMES)
    .map(([id, theme]) => `    "${id}": "<evocative 2-4 word town name for: ${theme}>"`)
    .join(',\n')

  const prompt = `You are generating unique fantasy names for an idle RPG. Respond ONLY with valid JSON, no markdown, no commentary.

The player is ${CLASS_FLAVOR[playerClass]}.
Possible personality traits to draw from: ${CLASS_TRAIT_POOLS[playerClass]}.

This world has two opposing factions at war. The light faction is noble and ordered (humans, dwarves, elves). The shadow faction is primal and brutal (orcs, trolls, goblins). Do NOT use "Alliance" or "Horde" — invent original names that feel like they belong to a living world with history. Each name should be 2-4 words using "The" as a prefix.

Generate this exact JSON:
{
  "playerName": "<2-word fantasy name, format FirstName Epithet, e.g. 'Gorvain the Relentless'>",
  "traits": ["<trait 1>", "<trait 2>", "<trait 3>"],
  "factionNames": {
    "alliance": "<original name for the light/noble faction>",
    "horde": "<original name for the shadow/primal faction>",
    "neutral": "<original name for the neutral/wanderer faction>"
  },
  "zoneNames": {
${zoneDescriptions}
  },
  "townNames": {
${townDescriptions}
  }
}`.trim()

  const raw = await ollamaGenerate(prompt)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in Ollama response')

  const parsed = JSON.parse(match[0]) as {
    playerName: string
    traits: string[]
    factionNames: Record<FactionType, string>
    zoneNames: Record<string, string>
    townNames: Record<string, string>
  }

  const fallbackFactions = generateFactionNamesFallback(seed)

  return {
    playerName:   parsed.playerName ?? 'The Wanderer',
    traits:       Array.isArray(parsed.traits) ? parsed.traits.slice(0, 3) : [],
    factionNames: {
      alliance: parsed.factionNames?.alliance ?? fallbackFactions.alliance,
      horde:    parsed.factionNames?.horde    ?? fallbackFactions.horde,
      neutral:  parsed.factionNames?.neutral  ?? fallbackFactions.neutral,
    },
    zoneNames:  (parsed.zoneNames  ?? {}) as Partial<Record<ZoneId, string>>,
    townNames:  (parsed.townNames  ?? {}) as Record<TownId, string>,
  }
}

// ── Thought generation ────────────────────────────────────────────────────────

export type ThoughtEvent =
  | 'mob_kill'
  | 'elite_kill'
  | 'boss_kill'
  | 'near_death'
  | 'player_death'
  | 'level_up'
  | 'boss_spawn'
  | 'long_fight'
  | 'dot_proc'
  | 'crit'

const EVENT_CONTEXT: Record<ThoughtEvent, string> = {
  mob_kill:     'just killed an enemy in combat',
  elite_kill:   'just slew a powerful elite enemy',
  boss_kill:    'just defeated a mighty boss',
  near_death:   'is critically wounded and near death',
  player_death: 'has just been defeated and fallen in battle',
  level_up:     'just grew stronger — leveled up',
  boss_spawn:   'a powerful boss has just appeared before them',
  long_fight:   'has been fighting the same enemy for a long time',
  dot_proc:     'their damage-over-time effect just triggered',
  crit:         'just landed a devastating critical strike',
}

export async function generateThought(
  playerName: string,
  playerClass: ClassType,
  traits: string[],
  event: ThoughtEvent,
  extra?: string,
): Promise<string> {
  const traitStr = traits.length > 0 ? traits.join(', ') : CLASS_TRAIT_POOLS[playerClass].split(', ').slice(0, 2).join(', ')
  const eventDesc = EVENT_CONTEXT[event] ?? event
  const extraCtx = extra ? ` (${extra})` : ''

  const prompt = `You are roleplaying the inner voice of ${playerName}, ${CLASS_FLAVOR[playerClass]}.
Their personality: ${traitStr}.
Situation: they ${eventDesc}${extraCtx}.

Write ONE internal thought of 3 to 7 words. Gritty, in-character, no quotes, no explanation. Only the thought itself.`.trim()

  const raw = await ollamaGenerate(prompt)
  // Take just the first line, strip quotes, trim
  return raw.split('\n')[0].replace(/^["']|["']$/g, '').trim()
}
