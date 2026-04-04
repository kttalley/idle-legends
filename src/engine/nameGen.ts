import type { ClassType, ZoneId } from '../data/types'

const OLLAMA_BASE = 'https://llm.kristiantalley.com'
const MODEL       = 'incept5/llama3.1-claude:latest'

export interface GeneratedNames {
  playerName: string
  zoneNames: Partial<Record<ZoneId, string>>
  traits: string[]
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
  sunhollow_meadows: 'peaceful sun-dappled starting meadow, level 1-10, home to wolves and boars',
  dustwind_plains:   'harsh arid plains swept by gritty winds, level 10-20, home to scorpids and bandits',
  grimshade_forest:  'dark haunted forest choked with shadow, level 20-30, home to undead and shadow beasts',
  thornvale_jungle:  'dense deadly jungle with ancient ruins, level 30-40, home to trolls and giant spiders',
  ashfire_peaks:     'volcanic mountain peaks shrouded in ash and flame, level 40-50, home to fire elementals and dragons',
}

async function ollamaGenerate(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.92, num_predict: 200 },
    }),
  })
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = await res.json()
  return (data.response ?? '').trim()
}

export async function generateNames(playerClass: ClassType): Promise<GeneratedNames> {
  const zoneDescriptions = Object.entries(ZONE_THEMES)
    .map(([id, theme]) => `    "${id}": "<unique 2-3 word evocative zone name for: ${theme}>"`)
    .join(',\n')

  const prompt = `You are generating unique fantasy names for a WoW-inspired idle RPG. Respond ONLY with valid JSON, no markdown, no commentary.

The player is ${CLASS_FLAVOR[playerClass]}.
Possible personality traits to draw from: ${CLASS_TRAIT_POOLS[playerClass]}.

Generate this exact JSON:
{
  "playerName": "<2-word fantasy name, format FirstName Epithet, e.g. 'Gorvain the Relentless'>",
  "traits": ["<trait 1>", "<trait 2>", "<trait 3>"],
  "zoneNames": {
${zoneDescriptions}
  }
}`.trim()

  const raw = await ollamaGenerate(prompt)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in Ollama response')

  const parsed = JSON.parse(match[0]) as {
    playerName: string
    traits: string[]
    zoneNames: Record<string, string>
  }

  return {
    playerName: parsed.playerName ?? 'The Wanderer',
    traits:     Array.isArray(parsed.traits) ? parsed.traits.slice(0, 3) : [],
    zoneNames:  (parsed.zoneNames ?? {}) as Partial<Record<ZoneId, string>>,
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
