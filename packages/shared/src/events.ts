// Händelser (events) and the Köpman (DESIGN.md sections 2.5 and 3.4): data and the pure rules. A Händelse is a small glade with a picture, a
// story line and two or three choices; the party votes (the same rule as every vote of a run), and what happens is one or more outcomes
// (Hacksilver, a runa for the whole party, healing, potions, a blessing, a free skärpa, cards for everyone). No choice ever takes health, a runa you
// hold or progress: a choice may cost Hacksilver, and every event has a free choice. The Köpman sells with the same prices every visit.
import type { RunEffect } from './run.ts';
import type { OfferSource, RunRarity, RunTag } from './runor.ts';
import { hashInts, mulberry32 } from './rng.ts';

export type EventOutcome =
  | { silver: number }
  /** A runa for the whole party: of at least this rarity, or of one of these tags (the first rarity found, tags preferred). */
  | { party: RunRarity; tags?: RunTag[] }
  | { heal: number }
  | { potions: number }
  /** A blessing for the rest of the run, for everyone. */
  | { effect: RunEffect }
  | { sharpen: true }
  | { cards: OfferSource }
  | { spirit: number }
  /** Skogen rör sig: the party defends the stone against waves of the dungeon's monsters (the one outcome that is a fight). */
  | { ambush: true };

export interface EventChoice {
  id: string;
  icon: string;
  /** Hacksilver it costs (0: free). */
  cost?: number;
  outcome: EventOutcome[];
}

export interface EventDef {
  id: string;
  icon: string;
  choices: EventChoice[];
}

/** Skogen rör sig (`bakhall`): the one Händelse with a fight. Three waves, one every `everyMs` (or when the last is down); what it pays. It comes instead of the stop's own event this often. */
export const AMBUSH = { waves: 3, everyMs: 20_000, silver: 25, chance: 1 / 11 } as const;
export const AMBUSH_EVENT: EventDef = { id: 'bakhall', icon: '🌲', choices: [
  { id: 'forsvara', icon: '⚔️', outcome: [{ ambush: true }] },
  { id: 'gom', icon: '🤫', outcome: [{ silver: 5 }] },
] };

export const EVENTS: EventDef[] = [
  { id: 'trollunge', icon: '🧌', choices: [
    { id: 'brod', icon: '🍞', cost: 20, outcome: [{ party: 'sallsynt' }] },
    { id: 'smyg', icon: '🤫', outcome: [{ silver: 10 }] },
  ] },
  { id: 'brunn', icon: '⛲', choices: [
    { id: 'mynt1', icon: '🪙', cost: 10, outcome: [{ party: 'vanlig' }] },
    { id: 'mynt3', icon: '💰', cost: 30, outcome: [{ party: 'sallsynt' }] },
    { id: 'gavidare', icon: '🚶', outcome: [{ silver: 5 }] },
  ] },
  { id: 'kraka', icon: '🐦‍⬛', choices: [
    { id: 'folj', icon: '👣', outcome: [{ silver: 30 }] },
    { id: 'jaga', icon: '👋', outcome: [{ silver: 10 }, { heal: 0.2 }] },
  ] },
  { id: 'runsten', icon: '🪨', choices: [
    { id: 'vanster', icon: '⬅️', outcome: [{ party: 'ovanlig', tags: ['liv', 'skold'] }] },
    { id: 'hoger', icon: '➡️', outcome: [{ party: 'ovanlig', tags: ['aska', 'tur'] }] },
  ] },
  { id: 'spoke', icon: '👻', choices: [
    { id: 'kista', icon: '📦', outcome: [{ cards: 'skatt' }] },
    { id: 'prata', icon: '💬', outcome: [{ heal: 0.25 }, { potions: 1 }] },
  ] },
  { id: 'smedja', icon: '🔨', choices: [
    { id: 'skarp', icon: '⚒️', outcome: [{ sharpen: true }] },
    { id: 'vapen', icon: '⚔️', outcome: [{ effect: { power: 0.06 } }] },
  ] },
  { id: 'lasning', icon: '🔒', choices: [
    { id: 'dyrk', icon: '🗝️', cost: 15, outcome: [{ cards: 'skatt' }] },
    { id: 'krossa', icon: '🔨', outcome: [{ silver: 25 }] },
  ] },
  { id: 'skald', icon: '🎶', choices: [
    { id: 'lyssna', icon: '👂', outcome: [{ effect: { cd: 0.05 } }] },
    { id: 'klappa', icon: '👏', outcome: [{ silver: 20 }] },
  ] },
  { id: 'ande', icon: '🌟', choices: [
    { id: 'skold', icon: '🛡️', outcome: [{ effect: { armor: 0.05 } }] },
    { id: 'hjarta', icon: '❤️', outcome: [{ effect: { hp: 0.08 } }] },
    { id: 'spara', icon: '🌠', outcome: [{ spirit: 1 }] },
  ] },
  { id: 'honung', icon: '🍯', choices: [
    { id: 'plocka', icon: '🐝', outcome: [{ potions: 2 }] },
    { id: 'bjorn', icon: '🐻', outcome: [{ heal: 1 }] },
  ] },
];
export const eventDef = (id: string): EventDef | undefined => EVENTS.find((e) => e.id === id) ?? (id === AMBUSH_EVENT.id ? AMBUSH_EVENT : undefined);

/** Which event a stop holds: by the seed and the stop, never one the run has met already (until all ten have been). */
export function pickEvent(seed: number, node: number, met: readonly string[]): string {
  const rnd = mulberry32(hashInts(seed, node, 0xe7e47));
  const fresh = EVENTS.filter((e) => !met.includes(e.id));
  const pool = fresh.length ? fresh : EVENTS;
  const id = pool[Math.floor(rnd() * pool.length)]!.id;
  // (dice of its own, so the events of a seed are what they were when the forest does not move)
  if (!met.includes(AMBUSH_EVENT.id) && mulberry32(hashInts(seed, node, 0xba4a11))() < AMBUSH.chance) return AMBUSH_EVENT.id;
  return id;
}

/** The choice an event takes when the clock runs out: the first free one (nobody is made to pay by being slow). */
export const defaultChoice = (e: EventDef): number => Math.max(0, e.choices.findIndex((c) => !(c.cost ?? 0)));

// ---------------------------------------------------------------------------
// Hacksilver and the Köpman
// ---------------------------------------------------------------------------

/** Hacksilver from a pack by its size (DESIGN.md 3.4: 3 to 6), and from the other stops. */
export const packSilver = (size: number): number => Math.max(3, Math.min(6, size));
export const SILVER = { elite: 12, treasure: 20, mini: 40 } as const;
/** Leftover Hacksilver turns into sagafrön at the end of a run: this many to one. */
export const SILVER_PER_SEED = 12;
export const seedsFromSilver = (purse: number): number => Math.floor(Math.max(0, purse) / SILVER_PER_SEED);

/** What the Köpman asks (the same every visit of a run). */
export const SHOP_PRICE = { runa: { vanlig: 40, ovanlig: 60, sallsynt: 90, legendarisk: 160 } as Record<RunRarity, number>, party: 110, potion: 25, spirit: 150, sharpen: 50 } as const;
/** The rarities of the three runor a hero is offered at the Köpman (the legendary one only past row 4), and how many potions he sells at a visit. */
export const SHOP_SLOTS: readonly RunRarity[] = ['vanlig', 'sallsynt', 'legendarisk'];
export const SHOP_LEGENDARY_ROW = 4;
export const SHOP_POTIONS = 3;
