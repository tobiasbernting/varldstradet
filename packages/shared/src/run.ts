// Runs (färdar): the data of GAME.md and GAME2.md. A run is one dungeon (a chapter) as a route of ten rows of stops in
// about 30 minutes; after a fight the party votes on a runa (a boon) and then walks onto one of up to three väg-runor
// to choose the next stop; sagafrön earned are planted at the Yggdrasil shoot as the sagaträd; the farm feeds the run with
// färdkost and companions. Data only: the route and its stops are built by runmap.ts, the rules are runsim.ts (which
// reuses sagasim.ts for every fight rule). Swedish names and texts are in sv.ts (RUN_NAMES, RUN_TEXT).
import type { ClassId, DungeonId, PathTraits, RunBuffs, SpellMod } from './saga.ts';
import { noBuffs } from './saga.ts';
import type { WeatherKind } from './types.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The 30 minutes is a target the numbers are tuned to, not a wall (owner, 2026-11-06: "should not be a hard cap, we can
 * adjust later"). Server time while someone is in the run: a gentle banner at RUN_WARN_MS, "Dags att gå hem?" at
 * RUN_MAX_MS and again every RUN_NUDGE_MS after that. Nothing ends a run because of the clock.
 */
export const RUN_MAX_MS = 30 * 60_000;
export const RUN_WARN_MS = 25 * 60_000;
export const RUN_NUDGE_MS = 10 * 60_000;
/**
 * The vote on a runa ends after this long at the latest (time to read for a child: 60 s on the two easiest levels, 30 s on the
 * others), and at once when every human has voted. `RUN_PICK_MS` is the longest.
 */
export const RUN_PICK_MS = 60_000;
export const RUN_PICK_MS_HARD = 30_000;
export const runPickMs = (level: number): number => (level <= 1 ? RUN_PICK_MS : RUN_PICK_MS_HARD);
/** The route (GAME2.md section 2): ten rows of stops, the mid-boss on row 5, the boss on row 10; wings of rows 1–4, 5–8 and 9–10. */
export const ROUTE_ROWS = 10;
export const ROUTE_MINI_ROW = 5;
export const ROUTE_REST_ROW = 9;
/** The vote on the way on ends this long after the first player stepped onto a rune (all online humans on a rune ends it at once). */
export const ROUTE_VOTE_MS = 20_000;
/** A player's step onto a rune counts as a vote after standing on it this long (so walking over one on the way to another is no vote). */
export const ROUTE_DWELL_MS = 1_000;
/** How far from the middle of a väg-runa (tiles) a player counts as standing on it. */
export const ROUTE_DISC_RADIUS = 1.0;
/** A Vilosten gives this fraction of everyone's health back when the party arrives, and gets up all who had fallen. */
export const VILOSTEN_HEAL = 0.4;
/** After the boss falls: time to open the chest, then everyone is carried home. */
export const RUN_VICTORY_MS = 90_000;
/** Family members this close to the arch (tiles) come along when it is used. */
export const RUN_JOIN_RADIUS = 6;
/** Players in a run: three, four with a longhouse. */
export const RUN_PARTY_MAX = 3;
export const RUN_PARTY_MAX_LONGHALL = 4;
/** A run whose last human has been offline this long ends. */
export const RUN_OFFLINE_END_MS = 60_000;
/** Offers of runor are this many cards. */
export const RUNA_CARDS = 3;

/**
 * The difficulty of a run (GAME2.md section 5.7): five levels chosen at the arch and fixed for the run. `0` Mycket lätt (kids
 * alone), `1` Lätt (kids with an adult: what Lätt was in R2), `2` Medel (what Vanlig was), `3` Svår, `4` Extrem.
 */
export type RunLevel = 0 | 1 | 2 | 3 | 4;
export const RUN_LEVEL_IDS: readonly RunLevel[] = [0, 1, 2, 3, 4];
export const RUN_LEVEL_MYCKET_LATT: RunLevel = 0;
export const RUN_LEVEL_LATT: RunLevel = 1;
export const RUN_LEVEL_MEDEL: RunLevel = 2;
export const RUN_LEVEL_SVAR: RunLevel = 3;
export const RUN_LEVEL_EXTREM: RunLevel = 4;
/** Left out of a start message, a run is Medel. */
export const RUN_LEVEL_DEFAULT: RunLevel = RUN_LEVEL_MEDEL;
/** A level from a message: a whole 0..4, left out is Medel; anything else is `null` (the server refuses it). */
export const parseRunLevel = (v: unknown): RunLevel | null => (v === undefined ? RUN_LEVEL_DEFAULT : v === 0 || v === 1 || v === 2 || v === 3 || v === 4 ? v : null);

/** What a level changes (the one table: the names and blurbs are in sv.ts `T.runLevelName`/`T.runLevelBlurb`). */
export interface RunLevelDef {
  id: RunLevel;
  /** Monster health (packs and bosses, and what a boss calls in), monster damage, the boss's warning times (a multiplier: longer is easier). */
  hp: number;
  dmg: number;
  warn: number;
  /** Sagafrön multiplier on everything a run pays. */
  seeds: number;
  /** Sagoandar: how many a run starts with, how many more each stop after the first brings, and the most at a time. */
  spirit: number;
  spiritPerStop: number;
  spiritMax: number;
  /** A wipe never ends the run (with none left everyone still gets up, free). */
  soft: boolean;
  /** The boss uses only its first n attacks (0: all of them). */
  bossMoves: number;
  /** Loot: the chance of the rare finds of a chest times this, and the extra weight of a rarer piece of gear per rarity step. */
  rare: number;
  rank: number;
  /** How many särdrag (affixes) the run has. */
  affixes: number;
}

export const RUN_LEVELS: Record<RunLevel, RunLevelDef> = {
  0: { id: 0, hp: 0.4, dmg: 0.3, warn: 1.8, seeds: 0.35, spirit: 5, spiritPerStop: 1, spiritMax: 5, soft: true, bossMoves: 2, rare: 0.6, rank: 0, affixes: 0 },
  1: { id: 1, hp: 0.6, dmg: 0.5, warn: 1.4, seeds: 0.5, spirit: 3, spiritPerStop: 1, spiritMax: 5, soft: true, bossMoves: 2, rare: 1, rank: 0, affixes: 0 },
  2: { id: 2, hp: 1, dmg: 1, warn: 1, seeds: 1, spirit: 1, spiritPerStop: 0, spiritMax: 1, soft: false, bossMoves: 0, rare: 1, rank: 0, affixes: 0 },
  3: { id: 3, hp: 1.65, dmg: 1.6, warn: 0.8, seeds: 1.5, spirit: 1, spiritPerStop: 0, spiritMax: 1, soft: false, bossMoves: 0, rare: 1.5, rank: 0.5, affixes: 1 },
  4: { id: 4, hp: 1.9, dmg: 1.6, warn: 0.65, seeds: 2, spirit: 0, spiritPerStop: 0, spiritMax: 0, soft: false, bossMoves: 0, rare: 2, rank: 1, affixes: 2 },
};
/** The boss attacks the easiest levels allow: its first two, whatever a first run's plan has locked. */
export const LATT = { bossMoves: 2 } as const;
export const SAGOANDAN_LATT_MAX = 5;
/** The Sagoandan (GAME2.md section 4.5): free "everyone gets up" on a wipe, so the run does not end. How many a run starts with, by level (`RUN_LEVELS[l].spirit`). */
export const SAGOANDAN: Record<RunLevel, number> = { 0: RUN_LEVELS[0].spirit, 1: RUN_LEVELS[1].spirit, 2: RUN_LEVELS[2].spirit, 3: RUN_LEVELS[3].spirit, 4: RUN_LEVELS[4].spirit };
/** Monster health, damage and warning multipliers for a level (the zone's own are multiplied by these). */
export const levelMuls = (level: RunLevel): { hp: number; dmg: number; warn: number; seeds: number } => {
  const l = RUN_LEVELS[level];
  return { hp: l.hp, dmg: l.dmg, warn: l.warn, seeds: l.seeds };
};
/** The two gentlest levels: fewer monsters in a pack and no Stark vakt. */
export const isEasy = (level: RunLevel): boolean => level <= 1;

/**
 * The rule of both votes of a run (the cards, the way on): a strict majority of the voters ends it at once (`majority`),
 * everyone having voted ends it, and so does the clock (`late`). Returns the options that share the most votes (several: a tie
 * for the caller to break; none: nobody voted, on the clock), or null while the vote goes on.
 */
export function tally(counts: readonly number[], voters: number, opts: { late: boolean; majority: boolean }): number[] | null {
  const total = counts.reduce((a, b) => a + b, 0);
  if (opts.majority) {
    const m = counts.findIndex((n) => n > voters / 2);
    if (m >= 0) return [m];
  }
  if (!opts.late && !(voters > 0 && total >= voters)) return null;
  const top = Math.max(0, ...counts);
  return top > 0 ? counts.flatMap((n, i) => (n === top ? [i] : [])) : [];
}

/** Sagafrön for what happens in a run (GAME2.md section 6): a pack 1, a stop cleared 3 (`zone`: the name is kept), the mid-boss 5 (`guard`), the boss 20 (12 on a replay). */
export const RUN_SEEDS = { pack: 1, zone: 3, chest: 2, guard: 5, bossFirst: 20, bossReplay: 12 } as const;
/** More sagafrön for each modifier (the särdrag of a level pay through the level's own multiplier instead). */
export const MODIFIER_SEEDS = 0.15;

// ---------------------------------------------------------------------------
// What a runa, a node, a dish or a companion adds
// ---------------------------------------------------------------------------

/**
 * Additions as fractions. The first block is combat (it ends up in `RunBuffs` and is read by sagasim.ts), the second
 * block is the rest of the run: potions handed out, more sagafrön, a new offer, a second dish slot, stronger dishes and
 * animals, a stronger companion and more sagafrön for the boss. (`coins`, more coins from the run's chests, is combat's.)
 */
export interface RunEffect extends Partial<Omit<RunBuffs, 'spell' | 'spellCd' | 'mods' | 'traits'>> {
  spell?: Record<string, number>;
  spellCd?: Record<string, number>;
  /** What a spell does more (SpellMod in saga.ts: burn, slow, chain, shields…), by spell id, and the traits of a path (thorns, aura, berserk). Numbers add up. */
  mods?: Record<string, SpellMod>;
  traits?: PathTraits;
  /** Luckier offers of runor (the sagaträd): rarer cards come up more often. */
  luck?: number;
  potions?: number;
  seeds?: number;
  reroll?: number;
  slots?: number;
  food?: number;
  animal?: number;
  companion?: number;
  bossSeeds?: number;
}

const COMBAT_KEYS = ['power', 'cd', 'hp', 'armor', 'taken', 'heal', 'potion', 'regen', 'rest', 'threat', 'leech', 'crit', 'down', 'reviveHp', 'coins'] as const;
const META_KEYS = ['potions', 'seeds', 'reroll', 'slots', 'food', 'animal', 'companion', 'bossSeeds', 'luck'] as const;
/** Every number an effect can carry (the tests make sure each one does something). */
export const EFFECT_KEYS: readonly string[] = [...COMBAT_KEYS, ...META_KEYS, 'spell', 'spellCd', 'mods', 'traits'];

/** `into` += `e` × `mul`. */
export function addEffect(into: RunEffect, e: RunEffect, mul = 1): RunEffect {
  const bag = into as Record<string, number | Record<string, number>>;
  for (const k of [...COMBAT_KEYS, ...META_KEYS]) {
    const v = (e as Record<string, number | undefined>)[k];
    if (v) bag[k] = ((bag[k] as number | undefined) ?? 0) + v * mul;
  }
  for (const k of ['spell', 'spellCd'] as const) {
    for (const [id, v] of Object.entries(e[k] ?? {})) {
      const m = ((bag[k] ??= {}) as Record<string, number>);
      m[id] = (m[id] ?? 0) + v * mul;
    }
  }
  // a spell's added effects and a path's traits: every number adds
  for (const [id, mod] of Object.entries(e.mods ?? {})) {
    const m = ((into.mods ??= {})[id] ??= {});
    for (const [k, v] of Object.entries(mod)) (m as Record<string, number>)[k] = ((m as Record<string, number>)[k] ?? 0) + (v as number) * mul;
  }
  for (const [k, v] of Object.entries(e.traits ?? {})) {
    const t = (into.traits ??= {}) as Record<string, number>;
    t[k] = (t[k] ?? 0) + (v as number) * mul;
  }
  return into;
}

/** The combat part of an effect as the fighter's buffs. */
export function buffsOf(e: RunEffect): RunBuffs {
  const b = noBuffs();
  for (const k of COMBAT_KEYS) b[k] = (e as Record<string, number | undefined>)[k] ?? 0;
  b.spell = { ...(e.spell ?? {}) };
  b.spellCd = { ...(e.spellCd ?? {}) };
  b.mods = Object.fromEntries(Object.entries(e.mods ?? {}).map(([id, m]) => [id, { ...m }]));
  b.traits = { ...(e.traits ?? {}) };
  return b;
}

// ---------------------------------------------------------------------------
// Modifiers (harder replays)
// ---------------------------------------------------------------------------

export interface ModifierDef {
  id: string;
  /** Monster health and damage, more members in a pack, notice you from further, followed further. */
  hpMul?: number;
  dmgMul?: number;
  extra?: number;
  sight?: number;
  leash?: number;
  /** The chapter's mid-boss guards the way to the boss. */
  guard?: boolean;
  /** The zones are drawn foggy. */
  fog?: boolean;
  /** A särdrag (affix) of the levels Svår and Extrem, not a replay modifier: it is chosen by the level (`RUN_LEVELS[l].affixes`). */
  affix?: boolean;
  /** Särdrag: monster health in packs; the health of a boss and a mid-boss; the damage of bosses; a monster below a quarter health is faster and hits quicker; when a pack member falls the rest hit harder (per fallen, fraction). */
  packHp?: number;
  bossHp?: number;
  bossDmg?: number;
  enrage?: boolean;
  grow?: number;
}

export const MODIFIERS: ModifierDef[] = [
  { id: 'fler', extra: 1 },
  { id: 'segare', hpMul: 1.25 },
  { id: 'harda', dmgMul: 1.2 },
  { id: 'vakten', guard: true },
  { id: 'snabba', sight: 1.4 },
  { id: 'dimma', leash: 6, fog: true },
];
/** The särdrag (GAME2.md 4.7, section 5.7): the ones the sim can express cheaply. A level of Svår has one of them, Extrem two, chosen by the seed. */
export const AFFIXES: ModifierDef[] = [
  { id: 'stalhud', affix: true, packHp: 1.2 },
  { id: 'stormig', affix: true, bossHp: 1.2, bossDmg: 1.1 },
  { id: 'starkande', affix: true, grow: 0.1 },
  { id: 'jakten', affix: true, enrage: true },
];
export const AFFIX_IDS: readonly string[] = AFFIXES.map((m) => m.id);
export const MAX_MODIFIERS = 3;
export const modifier = (id: string): ModifierDef | undefined => MODIFIERS.find((m) => m.id === id) ?? AFFIXES.find((m) => m.id === id);
// ---------------------------------------------------------------------------
// The sagaträd (the tree at the Yggdrasil shoot)
// ---------------------------------------------------------------------------

export type TreeBranch = 'hjalte' | 'gemenskap' | 'gard';

export interface TreeNode {
  id: string;
  branch: TreeBranch;
  cost: number;
  needs?: string;
  effect: RunEffect;
}

export const SEED_TREE: TreeNode[] = [
  { id: 'h1', branch: 'hjalte', cost: 10, effect: { power: 0.03 } },
  { id: 'h2', branch: 'hjalte', cost: 12, needs: 'h1', effect: { hp: 0.05 } },
  { id: 'h3', branch: 'hjalte', cost: 20, needs: 'h1', effect: { crit: 0.04 } },
  { id: 'h4', branch: 'hjalte', cost: 25, needs: 'h2', effect: { armor: 0.03 } },
  { id: 'h5', branch: 'hjalte', cost: 30, needs: 'h3', effect: { potion: 0.1 } },
  { id: 'h6', branch: 'hjalte', cost: 45, needs: 'h4', effect: { cd: 0.04 } },
  { id: 'h7', branch: 'hjalte', cost: 40, needs: 'h5', effect: { luck: 0.25 } },
  { id: 'g1', branch: 'gemenskap', cost: 10, effect: { rest: 0.25 } },
  { id: 'g2', branch: 'gemenskap', cost: 15, needs: 'g1', effect: { down: 0.2 } },
  { id: 'g3', branch: 'gemenskap', cost: 30, needs: 'g1', effect: { reroll: 1 } },
  { id: 'g4', branch: 'gemenskap', cost: 25, needs: 'g2', effect: { heal: 0.08 } },
  { id: 'g5', branch: 'gemenskap', cost: 35, needs: 'g3', effect: { companion: 0.2 } },
  { id: 'g6', branch: 'gemenskap', cost: 40, needs: 'g4', effect: { seeds: 0.1 } },
  { id: 'f1', branch: 'gard', cost: 15, effect: { slots: 1 } },
  { id: 'f2', branch: 'gard', cost: 20, needs: 'f1', effect: { food: 0.25 } },
  { id: 'f3', branch: 'gard', cost: 30, needs: 'f1', effect: { animal: 0.5 } },
  { id: 'f4', branch: 'gard', cost: 15, effect: { potions: 1 } },
  { id: 'f5', branch: 'gard', cost: 35, needs: 'f2', effect: { coins: 0.25 } },
  { id: 'f6', branch: 'gard', cost: 50, needs: 'f3', effect: { bossSeeds: 5 } },
];
export const treeNode = (id: string): TreeNode | undefined => SEED_TREE.find((n) => n.id === id);
export const TREE_TOTAL = SEED_TREE.reduce((n, t) => n + t.cost, 0);

/** The look of the shoot from the nodes the whole family has planted: 0 a shoot … 4 the Världsträd. */
export const TREE_STAGES: readonly number[] = [0, 3, 8, 14, 24];
export const treeStage = (planted: number): number => TREE_STAGES.reduce((s, from, i) => (planted >= from ? i : s), 0);

// ---------------------------------------------------------------------------
// What a player keeps from runs (saved with the player; the run itself is never saved)
// ---------------------------------------------------------------------------

export interface RunSave {
  /** Sagafrön to plant, and all that were ever earned. */
  seeds: number;
  earned: number;
  /** The nodes planted (SEED_TREE ids). */
  tree: string[];
  /** Runs started, won, ended by a wipe, runs that went past the 30-minute mark (`timeouts`: the name is kept so old saves load unchanged), and stops cleared (a Flock or the Mellanboss; `zones`, the name kept too). */
  runs: number;
  wins: number;
  wipes: number;
  timeouts: number;
  zones: number;
  /** The fastest win per chapter's boss (ms of run time), and how many times each was won. */
  best: Partial<Record<DungeonId, number>>;
  clears: Partial<Record<DungeonId, number>>;
}

export const newRunSave = (): RunSave => ({ seeds: 0, earned: 0, tree: [], runs: 0, wins: 0, wipes: 0, timeouts: 0, zones: 0, best: {}, clears: {} });

/** Why a node cannot be planted now (null: it can). */
export function plantError(save: RunSave | undefined, id: string): 'unknown' | 'planted' | 'needs' | 'seeds' | null {
  const n = treeNode(id);
  if (!n) return 'unknown';
  const s = save ?? newRunSave();
  if (s.tree.includes(id)) return 'planted';
  if (n.needs && !s.tree.includes(n.needs)) return 'needs';
  if (s.seeds < n.cost) return 'seeds';
  return null;
}

// ---------------------------------------------------------------------------
// Färdkost and companions (the farm feeds the run)
// ---------------------------------------------------------------------------

/** Dishes (bag items) handed in at the arch, and what they do for the run. The potions come as items. */
export const FARDKOST: Record<string, RunEffect> = {
  bread: { hp: 0.06 },
  pancakes: { cd: 0.05 },
  carrot_cake: { power: 0.05 },
  pumpkin_pie: { armor: 0.04 },
  strawberry_jam: { regen: 0.4 },
  fish_soup: { taken: 0.06 },
  truffle_pasta: { power: 0.08 },
  cloudberry_jam: { rest: 0.4 },
  blueberry_pie: { hp: 0.08, heal: 0.05 },
  healing_potion: { potions: 3 },
  styrkedryck: { power: 0.06 },
};
export const FOOD_SLOTS = 1;

/** A pet that follows, a mount that waits at the arch; an animal with this many hearts counts double. */
export const PET_EFFECT: RunEffect = { power: 0.03 };
export const MOUNT_EFFECT: RunEffect = { armor: 0.02, hp: 0.03 };
export const CARED_HEARTS = 4;
/** Gårdsglädje: health per average heart of the farm's animals. */
export const JOY_PER_HEART = 0.01;
export const SMITHY_EFFECT: RunEffect = { power: 0.04 };
export const HERB_EFFECT: RunEffect = { potions: 2, potion: 0.1 };

// ---------------------------------------------------------------------------
// Room layouts (the seven biome templates of v1: a Flock is built from four of their rooms; their ground, monsters and weather are gone: a run has the chapter's own look)
// ---------------------------------------------------------------------------

export type RunBiome = 'skog' | 'trask' | 'berg' | 'strand' | 'svamp' | 'is' | 'vulkan';
export const RUN_BIOMES: readonly RunBiome[] = ['skog', 'trask', 'berg', 'strand', 'svamp', 'is', 'vulkan'];
export const isRunBiome = (s: unknown): s is RunBiome => typeof s === 'string' && (RUN_BIOMES as readonly string[]).includes(s);

/** start, two rooms of packs, a rest stone, the exit (behind the gate) and a side room with a guarded chest. A Flock uses start, the two pack rooms and the exit. */
export type ZoneRole = 'start' | 'pack' | 'rest' | 'exit' | 'side';

export interface ZoneRoom {
  x: number;
  y: number;
  w: number;
  h: number;
  role: ZoneRole;
}

export interface ZoneTemplate {
  biome: RunBiome;
  /** Six rooms in the order start, pack, pack, rest, exit, side. A Flock uses start, the two rooms of packs and the exit. */
  rooms: [ZoneRoom, ZoneRoom, ZoneRoom, ZoneRoom, ZoneRoom, ZoneRoom];
  /** Corridors as [parent, child]; the exit is always a child (the gate stands in its corridor). */
  links: [number, number][];
}

const room = (x: number, y: number, w: number, h: number, role: ZoneRole): ZoneRoom => ({ x, y, w, h, role });

export const ZONE_TEMPLATES: Record<RunBiome, ZoneTemplate> = {
  skog: {
    biome: 'skog',
    // a zigzag west to east
    rooms: [room(3, 27, 10, 10, 'start'), room(18, 21, 12, 12, 'pack'), room(35, 26, 13, 12, 'pack'), room(52, 12, 9, 9, 'rest'), room(50, 42, 11, 11, 'exit'), room(36, 6, 12, 10, 'side')],
    links: [[0, 1], [1, 2], [2, 3], [2, 5], [2, 4]],
  },
  trask: {
    biome: 'trask',
    // a descent from the top, a side bog in the west
    rooms: [room(26, 3, 11, 9, 'start'), room(6, 16, 13, 12, 'pack'), room(30, 20, 14, 11, 'pack'), room(49, 14, 10, 10, 'rest'), room(28, 47, 12, 11, 'exit'), room(6, 40, 12, 11, 'side')],
    links: [[0, 1], [1, 2], [2, 3], [1, 5], [2, 4]],
  },
  berg: {
    biome: 'berg',
    // a climb from the bottom left to the top right
    rooms: [room(3, 50, 10, 10, 'start'), room(17, 42, 12, 11, 'pack'), room(31, 31, 13, 11, 'pack'), room(22, 17, 9, 9, 'rest'), room(48, 6, 12, 11, 'exit'), room(48, 34, 11, 12, 'side')],
    links: [[0, 1], [1, 2], [2, 3], [2, 5], [2, 4]],
  },
  strand: {
    biome: 'strand',
    // along the shore; the rest stone and the exit on the far side of the bay
    rooms: [room(3, 40, 10, 10, 'start'), room(17, 44, 12, 11, 'pack'), room(33, 40, 13, 12, 'pack'), room(33, 18, 10, 9, 'rest'), room(50, 14, 11, 11, 'exit'), room(50, 40, 10, 12, 'side')],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]],
  },
  svamp: {
    biome: 'svamp',
    // a cluster around a glade
    rooms: [room(4, 4, 10, 10, 'start'), room(20, 6, 12, 12, 'pack'), room(38, 10, 13, 12, 'pack'), room(22, 28, 9, 9, 'rest'), room(46, 44, 13, 11, 'exit'), room(4, 30, 11, 12, 'side')],
    links: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 5]],
  },
  is: {
    biome: 'is',
    // a spiral that ends high up
    rooms: [room(3, 48, 10, 10, 'start'), room(18, 48, 12, 11, 'pack'), room(36, 44, 13, 12, 'pack'), room(50, 26, 9, 9, 'rest'), room(28, 6, 14, 11, 'exit'), room(6, 24, 12, 12, 'side')],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5]],
  },
  vulkan: {
    biome: 'vulkan',
    // two roads round a lava lake that meet at the rest stone
    rooms: [room(4, 26, 10, 11, 'start'), room(20, 10, 12, 11, 'pack'), room(20, 40, 12, 12, 'pack'), room(38, 26, 9, 10, 'rest'), room(50, 8, 11, 12, 'exit'), room(50, 42, 11, 11, 'side')],
    links: [[0, 1], [0, 2], [1, 3], [3, 4], [2, 5]],
  },
};

/**
 * The fixed layouts of the other stops (GAME2.md section 2.3). The dungeon's own mid-boss and boss halls give the sizes of the
 * halls (`mini`, `hall`); the rest is here. A Vilosten is start, the stone's room and the exit room; the Mellanboss stop is start,
 * a room of packs, the hall and the exit room behind it; the boss stop is start, a room of packs and the hall.
 */
export const REST_STOP = {
  start: { x: 4, y: 26, w: 11, h: 11 },
  rest: { x: 24, y: 27, w: 10, h: 10 },
  exit: { x: 43, y: 26, w: 12, h: 11 },
};
export const MINI_STOP = {
  start: { x: 3, y: 46, w: 10, h: 10 },
  pack: { x: 18, y: 44, w: 12, h: 12 },
  /** Where the dungeon's mid-boss hall goes (its own width and height). */
  hall: { x: 33, y: 24 },
  exit: { x: 50, y: 5, w: 11, h: 11 },
};
export const BOSS_STOP = {
  start: { x: 3, y: 46, w: 10, h: 10 },
  pack: { x: 18, y: 44, w: 12, h: 12 },
  /** The guard (the replay modifier `vakten`): the mid-boss in a room before the hall. */
  guard: { x: 36, y: 22, w: 13, h: 13 },
  hall: { x: 4, y: 4, w: 24, h: 22 },
};

/** The route's kinds of stop (GAME2.md section 2.1; the others come in R4 and R5). */
export type NodeKind = 'flock' | 'mini' | 'rest' | 'boss' | 'shop' | 'event' | 'treasure' | 'elite';
export const NODE_KINDS: readonly NodeKind[] = ['flock', 'mini', 'rest', 'boss', 'shop', 'event', 'treasure', 'elite'];
/** The stops where nobody fights: a camp (the Köpman, a Händelse) and a Vilosten. */
export const isCamp = (k: NodeKind): boolean => k === 'rest' || k === 'shop' || k === 'event';
/** The stops that are a Flock's kind of fight: a Flock, a Stark vakt and a Skatt (a room of packs and then a gate). */
export const isFlockLike = (k: NodeKind): boolean => k === 'flock' || k === 'elite' || k === 'treasure';

/** Which wing (0: rows 1–4, 1: rows 5–8, 2: rows 9–10) a row is in. */
export const wingOf = (row: number): number => (row <= 4 ? 0 : row <= 8 ? 1 : 2);

/** Health of a stop's monsters by wing (GAME2.md section 5.3): the later wings are tougher. Tuned by the bots. */
export const WING_HP: readonly number[] = [1.6, 1.75, 1.95];

/** One human alone (with the hired companion, who counts as a fighter for the monsters' health): monsters tolerate this much less. */
export const SOLO_MERCY = 0.75;

/**
 * The class of the hired companion (Hirdmannen) for a party of these human classes, or null for none: one human gets
 * the class they lack (a healer for everyone but the healer, a tank for the healer); two humans get one only when the
 * pair lacks a healer, or else a tank; three or four never do.
 */
export function companionClass(classes: ClassId[]): ClassId | null {
  if (classes.length === 1) return classes[0] === 'helare' ? 'vaktare' : 'helare';
  if (classes.length === 2) return !classes.includes('helare') ? 'helare' : !classes.includes('vaktare') ? 'vaktare' : null;
  return null;
}

/**
 * Packs per room (and members) by wing: a Flock has two rooms of packs (`a` the first, `b` the second), the Mellanboss stop and
 * the boss stop one room each (`mini`, `boss`). `big` is the number of big monsters per room. Tuned by the bots (run.test.ts), see GAME2.md.
 */
export const FLOCK_PACKS = [
  { a: [3, 3], b: [3, 3], size: [4, 5], big: 0 },
  { a: [3, 3], b: [3, 3], size: [4, 5], big: 1 },
] as const;
export const MINI_PACKS = { count: [3, 3], size: [3, 4] } as const;
/** A Stark vakt: fewer but bigger packs, with big ones; tougher (`ELITE_HP`). A Skatt: one or two small packs guard it. */
export const ELITE_PACKS = { a: [1, 2], b: [2, 2], size: [4, 5], big: 2 } as const;
export const ELITE_HP = 1.25;
export const TREASURE_PACKS = { a: [1, 1], b: [1, 2], size: [3, 4], big: 0 } as const;
export const BOSS_PACKS = { count: [3, 3], size: [3, 4] } as const;
/**
 * Lätt's packs (GAME2.md section 5.3 wants a child through the route in about 20-28 minutes): fewer, smaller packs in a Flock and in the
 * rooms before the mid-boss and the boss, on top of the softer monsters. The same shape as above.
 */
export const LATT_FLOCK_PACKS = [
  { a: [2, 2], b: [2, 3], size: [3, 4], big: 0 },
  { a: [2, 3], b: [3, 3], size: [3, 4], big: 1 },
] as const;
export const LATT_MINI_PACKS = { count: [2, 2], size: [3, 4] } as const;
export const LATT_BOSS_PACKS = { count: [2, 2], size: [3, 3] } as const;

// ---------------------------------------------------------------------------
// What the clients are told (protocol.ts carries these)
// ---------------------------------------------------------------------------

export type RunOutcome = 'win' | 'wipe' | 'leave';
/** `stop` the party is in a stop (fighting, resting), `path` everyone chooses their path after the Mellanboss, `pick` the vote on a runa, `route` the vote on the way on (walk onto a rune). */
export type RunPhase = 'stop' | 'path' | 'pick' | 'event' | 'route' | 'victory' | 'ended';

/** A stop of the route as the clients draw it: its row (1..10), lane, kind and the stops of the next row it leads to. */
export interface RouteNodeSnap {
  id: number;
  row: number;
  lane: number;
  /** How many lanes this row has (to place the dot). */
  lanes: number;
  kind: NodeKind;
  next: number[];
}

/** A väg-runa on the floor of the exit room: where it is (tile), the stop it leads to and who stands on it. */
export interface RouteChoiceSnap {
  node: number;
  kind: NodeKind;
  x: number;
  y: number;
  /** The humans standing on it (player ids). */
  on: string[];
}

/** The run as the arch window, the HUD and the road picture need it. */
export interface RunSnap {
  id: string;
  phase: RunPhase;
  /** The stop now (its id in `route`), its row (1..10) and kind. */
  node: number;
  row: number;
  kind: NodeKind;
  /** The stops walked through so far, in order (the last is the one now). */
  path: number[];
  /** The whole route (the HUD's rail and the map overlay). */
  route: RouteNodeSnap[];
  /** The area key of the map now. */
  area: string;
  /** The chapter's dungeon (its boss, its look). */
  boss: DungeonId;
  weather: WeatherKind;
  modifiers: string[];
  /** Run time so far and the longest it may be (ms). */
  elapsed: number;
  max: number;
  party: { id: string; name: string; bot?: true }[];
  /** The Stigfinnare: the player who breaks a tie on the way on (a compass over their head), rotating each row. */
  finder: string | null;
  /** While the way on is being chosen: the runes and who stands on them, and the time left (ms; -1 until someone has stepped on one). */
  choices?: RouteChoiceSnap[];
  routeLeft?: number;
  /** The level (0 Lätt, 1 Vanlig), the Sagoandans left (the star on the HUD) and how many have been used so far. */
  level: RunLevel;
  spirit: number;
  spiritUsed: number;
  /** The runor taken so far, and the sagafrön each player has earned in this run. */
  runor: string[];
  earned: Record<string, number>;
  /** The path (väg, paths.ts) each hero has chosen, by player id (none before the Mellanboss has fallen). */
  paths: Record<string, string>;
  /** Every hero's own runor and how sharp they are (skärpa); `runor` above are the party-wide ones, which help everyone. */
  hold: Record<string, { id: string; up: number }[]>;
  /** While everyone chooses (phase `path` or `pick`): time left (ms) and the players who have chosen. */
  pick?: { kind: 'path' | 'runa'; left: number; done: string[] };
  /** Färdkassan: the Hacksilver the party has (shown to all), what the Köpman sells while the party is at one, and the Händelse being voted on (phase `event`). */
  purse: number;
  shop?: ShopSnap;
  event?: EventSnap;
  /** At a Vilosten: the heroes who may still choose between Vila and skärpa. */
  restChoice?: string[];
}

export interface ShopSlotSnap {
  id: string;
  rarity: string;
  price: number;
  bought: boolean;
}
/** The Köpman's wares: each hero's runor by player id, the gemensam runa, how many potions are left, and the Sagoandan (null: not sold here; true: for sale; false: bought). */
export interface ShopSnap {
  slots: Record<string, ShopSlotSnap[]>;
  party: ShopSlotSnap | null;
  potions: number;
  spirit: boolean | null;
}
export interface EventSnap {
  id: string;
  choices: { id: string; cost: number }[];
  votes: Record<string, number>;
  left: number;
}

/** One hero's own three cards (sent to them alone): what they have tapped, where the cards come from, the clock and who has chosen. */
export interface RunOfferSnap {
  /** The stop the party just cleared (the pick comes after it). */
  node: number;
  cards: string[];
  /** The card tapped so far (it can be changed until everyone has chosen or the clock ends). */
  picked?: number;
  source: 'flock' | 'stark' | 'skatt' | 'mini' | 'shop';
  /** Time left (ms), new offers this hero may still ask for, and the heroes who have chosen. */
  left: number;
  rerolls: number;
  done: string[];
}
