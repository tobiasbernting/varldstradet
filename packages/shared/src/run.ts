// Runs (färdar): the data of GAME.md. A run is three zones and a boss in at most 30 minutes; between the zones the
// party votes on a runa (a boon); sagafrön earned are planted at the Yggdrasil shoot as the sagaträd; the farm
// feeds the run with färdkost and companions. Data only: the zones are built by runmap.ts, the rules are runsim.ts
// (which reuses sagasim.ts for every fight rule). Swedish names and texts are in sv.ts (RUN_NAMES, RUN_TEXT).
import type { ClassId, DungeonId, RunBuffs } from './saga.ts';
import { noBuffs } from './saga.ts';
import type { Terrain, WeatherKind } from './types.ts';

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
export const ZONES_PER_RUN = 3;
/** The vote on a runa ends after this long at the latest. */
export const RUN_PICK_MS = 20_000;
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

/** Sagafrön for what happens in a run (GAME.md section 3). */
export const RUN_SEEDS = { pack: 1, zone: 4, chest: 2, guard: 3, bossFirst: 20, bossReplay: 12 } as const;
/** More sagafrön for each modifier. */
export const MODIFIER_SEEDS = 0.15;

// ---------------------------------------------------------------------------
// What a runa, a node, a dish or a companion adds
// ---------------------------------------------------------------------------

/**
 * Additions as fractions. The first block is combat (it ends up in `RunBuffs` and is read by sagasim.ts), the second
 * block is the rest of the run: potions handed out, more sagafrön, a new offer, a second dish slot, stronger dishes and
 * animals, a stronger companion and more sagafrön for the boss. (`coins`, more coins from the run's chests, is combat's.)
 */
export interface RunEffect extends Partial<Omit<RunBuffs, 'spell' | 'spellCd'>> {
  spell?: Record<string, number>;
  spellCd?: Record<string, number>;
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
const META_KEYS = ['potions', 'seeds', 'reroll', 'slots', 'food', 'animal', 'companion', 'bossSeeds'] as const;
/** Every number an effect can carry (the tests make sure each one does something). */
export const EFFECT_KEYS: readonly string[] = [...COMBAT_KEYS, ...META_KEYS, 'spell', 'spellCd'];

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
  return into;
}

/** The combat part of an effect as the fighter's buffs. */
export function buffsOf(e: RunEffect): RunBuffs {
  const b = noBuffs();
  for (const k of COMBAT_KEYS) b[k] = (e as Record<string, number | undefined>)[k] ?? 0;
  b.spell = { ...(e.spell ?? {}) };
  b.spellCd = { ...(e.spellCd ?? {}) };
  return b;
}

// ---------------------------------------------------------------------------
// Runor
// ---------------------------------------------------------------------------

export interface RunaDef {
  id: string;
  /** Helps only this class (left out: the whole party). */
  cls?: ClassId;
  icon: string;
  effect: RunEffect;
}

const rn = (id: string, cls: ClassId | undefined, icon: string, effect: RunEffect): RunaDef => ({ id, ...(cls ? { cls } : {}), icon, effect });

export const RUNOR: RunaDef[] = [
  // Väktare
  rn('v_tjock', 'vaktare', '🛡️', { armor: 0.08 }),
  rn('v_hugg', 'vaktare', '🗡️', { spell: { hugg: 0.25 } }),
  rn('v_ropet', 'vaktare', '📣', { spellCd: { utmana: 0.3 } }),
  rn('v_mur', 'vaktare', '🧱', { spellCd: { skoldmur: 0.25 } }),
  rn('v_slag', 'vaktare', '💥', { spell: { skoldslag: 0.4 } }),
  rn('v_hjarta', 'vaktare', '❤️', { hp: 0.15 }),
  rn('v_trots', 'vaktare', '😤', { threat: 0.3 }),
  rn('v_lugn', 'vaktare', '🌊', { taken: 0.1 }),
  // Helare
  rn('h_runa', 'helare', '💚', { spell: { lakerunan: 0.25 } }),
  rn('h_ring', 'helare', '🌿', { spell: { lakekrets: 0.35 } }),
  rn('h_pil', 'helare', '✨', { spell: { ljuspil: 0.4 } }),
  rn('h_vack', 'helare', '🌅', { reviveHp: 0.25 }),
  rn('h_snabb', 'helare', '⚡', { cd: 0.12 }),
  rn('h_flod', 'helare', '💧', { heal: 0.15 }),
  rn('h_ro', 'helare', '🍃', { regen: 0.5 }),
  rn('h_skydd', 'helare', '🕊️', { armor: 0.06 }),
  // Krigare
  rn('k_yx', 'krigare', '🪓', { spell: { yxhugg: 0.3 } }),
  rn('k_storm', 'krigare', '💨', { spellCd: { stormsteg: 0.35 } }),
  rn('k_virvel', 'krigare', '🌪️', { spell: { virvelvind: 0.35 } }),
  rn('k_raseri', 'krigare', '🔥', { spellCd: { raseri: 0.3 } }),
  rn('k_glupsk', 'krigare', '🍖', { leech: 0.08 }),
  rn('k_hjarta', 'krigare', '💪', { hp: 0.12 }),
  rn('k_kraft', 'krigare', '⚔️', { power: 0.1 }),
  rn('k_egg', 'krigare', '🎯', { crit: 0.1 }),
  // Magiker
  rn('m_eld', 'magiker', '☄️', { spell: { eldboll: 0.3 } }),
  rn('m_is', 'magiker', '❄️', { spell: { isspjut: 0.35 } }),
  rn('m_ask', 'magiker', '⚡', { spell: { askregn: 0.35 } }),
  rn('m_blink', 'magiker', '🌀', { spellCd: { blink: 0.4 } }),
  rn('m_snabb', 'magiker', '🪄', { cd: 0.12 }),
  rn('m_kraft', 'magiker', '🔮', { power: 0.1 }),
  rn('m_tur', 'magiker', '🍀', { crit: 0.12 }),
  rn('m_skal', 'magiker', '🫧', { taken: 0.08 }),
  // The whole party
  rn('p_hjarta', undefined, '🧡', { hp: 0.1 }),
  rn('p_vila', undefined, '🪨', { rest: 0.6 }),
  rn('p_kraft', undefined, '🌟', { power: 0.08 }),
  rn('p_flaska', undefined, '🧪', { potions: 2, potion: 0.15 }),
  rn('p_vakna', undefined, '🌄', { down: 0.4 }),
  rn('p_fro', undefined, '🌱', { seeds: 0.25 }),
];

export const runa = (id: string): RunaDef | undefined => RUNOR.find((r) => r.id === id);

/**
 * Three cards for the party's vote: first one card each for up to two of the classes in the party (picked by the
 * random stream), then party-wide runor and the classes' runor to fill. `have` (runor already in the run) never come
 * again. Deterministic for a given `rnd`.
 */
export function offerRunor(rnd: () => number, classes: readonly ClassId[], have: readonly string[], size = RUNA_CARDS): string[] {
  const free = (r: RunaDef): boolean => !have.includes(r.id);
  const present = [...new Set(classes)];
  const shuffle = <T>(xs: T[]): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  const out: string[] = [];
  for (const c of shuffle(present).slice(0, Math.min(2, size - 1))) {
    const pick = shuffle(RUNOR.filter((r) => r.cls === c && free(r)))[0];
    if (pick) out.push(pick.id);
  }
  const rest = shuffle(RUNOR.filter((r) => free(r) && !out.includes(r.id) && (!r.cls || present.includes(r.cls))));
  // party-wide runor first, so a party never sees only one class's cards
  rest.sort((a, b) => (a.cls ? 1 : 0) - (b.cls ? 1 : 0));
  for (const r of rest) {
    if (out.length >= size) break;
    out.push(r.id);
  }
  return shuffle(out);
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
}

export const MODIFIERS: ModifierDef[] = [
  { id: 'fler', extra: 1 },
  { id: 'segare', hpMul: 1.25 },
  { id: 'harda', dmgMul: 1.2 },
  { id: 'vakten', guard: true },
  { id: 'snabba', sight: 1.4 },
  { id: 'dimma', leash: 6, fog: true },
];
export const MAX_MODIFIERS = 3;
export const modifier = (id: string): ModifierDef | undefined => MODIFIERS.find((m) => m.id === id);

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
  /** Runs started, won, ended by a wipe, runs that went past the 30-minute mark (`timeouts`: the name is kept so old saves load unchanged), and zones cleared. */
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
// Zone templates
// ---------------------------------------------------------------------------

export type RunBiome = 'skog' | 'trask' | 'berg' | 'strand' | 'svamp' | 'is' | 'vulkan';
export const RUN_BIOMES: readonly RunBiome[] = ['skog', 'trask', 'berg', 'strand', 'svamp', 'is', 'vulkan'];
export const isRunBiome = (s: unknown): s is RunBiome => typeof s === 'string' && (RUN_BIOMES as readonly string[]).includes(s);

/** start, two rooms of packs, a rest stone, the exit (behind the gate) and a side room with a guarded chest. */
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
  /** The dungeon whose arch stands in this biome: its treasure table and its look. */
  theme: DungeonId;
  /** Wall look (a `saga_wall` variant), the ground, what is outside the rooms, the light and the decor objects. */
  wall: number;
  floor: Terrain;
  solid: Terrain;
  ambient: [number, number, number];
  decor: string[];
  /** Six rooms in the order start, pack, pack, rest, exit, side. Rooms 1 and 5 may be dropped (4–6 rooms). */
  rooms: [ZoneRoom, ZoneRoom, ZoneRoom, ZoneRoom, ZoneRoom, ZoneRoom];
  /** Corridors as [parent, child]; the exit is always a child (the gate stands in its corridor). */
  links: [number, number][];
  /** The biome's monsters in three strengths (species in SAGA_MOBS). */
  mobs: { small: string[]; medium: string[]; big: string[] };
  weather: WeatherKind[];
}

const room = (x: number, y: number, w: number, h: number, role: ZoneRole): ZoneRoom => ({ x, y, w, h, role });

export const ZONE_TEMPLATES: Record<RunBiome, ZoneTemplate> = {
  skog: {
    biome: 'skog',
    theme: 'draug',
    wall: 6,
    floor: 'grass',
    solid: 'rock',
    ambient: [0.42, 0.55, 0.42],
    decor: ['saga_fairylight', 'saga_cobweb', 'saga_bones', 'saga_urn'],
    // a zigzag west to east
    rooms: [room(3, 27, 10, 10, 'start'), room(18, 21, 12, 12, 'pack'), room(35, 26, 13, 12, 'pack'), room(52, 12, 9, 9, 'rest'), room(50, 42, 11, 11, 'exit'), room(36, 6, 12, 10, 'side')],
    links: [[0, 1], [1, 2], [2, 3], [2, 5], [2, 4]],
    mobs: { small: ['gravrotta'], medium: ['skelett', 'draugbage', 'ulv'], big: ['rimtroll'] },
    weather: ['sun', 'cloudy', 'rain', 'fog', 'wind'],
  },
  trask: {
    biome: 'trask',
    theme: 'hel',
    wall: 3,
    floor: 'mud',
    solid: 'rock',
    ambient: [0.4, 0.55, 0.5],
    decor: ['saga_gravestone', 'saga_skullpile', 'saga_ghostlight', 'saga_deadtree'],
    // a descent from the top, a side bog in the west
    rooms: [room(26, 3, 11, 9, 'start'), room(6, 16, 13, 12, 'pack'), room(30, 20, 14, 11, 'pack'), room(49, 14, 10, 10, 'rest'), room(28, 47, 12, 11, 'exit'), room(6, 40, 12, 11, 'side')],
    links: [[0, 1], [1, 2], [2, 3], [1, 5], [2, 4]],
    mobs: { small: ['benspindel'], medium: ['helhund', 'gengangare'], big: ['gengangare'] },
    weather: ['fog', 'rain', 'cloudy'],
  },
  berg: {
    biome: 'berg',
    theme: 'dvarg',
    wall: 4,
    floor: 'gravel',
    solid: 'rock',
    ambient: [0.6, 0.5, 0.35],
    decor: ['saga_minecart', 'saga_goldpile', 'saga_dwarfstatue', 'saga_minelamp'],
    // a climb from the bottom left to the top right
    rooms: [room(3, 50, 10, 10, 'start'), room(17, 42, 12, 11, 'pack'), room(31, 31, 13, 11, 'pack'), room(22, 17, 9, 9, 'rest'), room(48, 6, 12, 11, 'exit'), room(48, 34, 11, 12, 'side')],
    links: [[0, 1], [1, 2], [2, 3], [2, 5], [2, 4]],
    mobs: { small: ['guldbagge'], medium: ['gruvtroll'], big: ['stengolem'] },
    weather: ['wind', 'cloudy', 'sun', 'hail'],
  },
  strand: {
    biome: 'strand',
    theme: 'orm',
    wall: 5,
    floor: 'sand',
    solid: 'water',
    ambient: [0.35, 0.55, 0.7],
    decor: ['saga_coral', 'saga_anchor', 'saga_seaweed', 'saga_pearl'],
    // along the shore; the rest stone and the exit on the far side of the bay
    rooms: [room(3, 40, 10, 10, 'start'), room(17, 44, 12, 11, 'pack'), room(33, 40, 13, 12, 'pack'), room(33, 18, 10, 9, 'rest'), room(50, 14, 11, 11, 'exit'), room(50, 40, 10, 12, 'side')],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]],
    mobs: { small: ['manet'], medium: ['sjodraug'], big: ['jattekrabba'] },
    weather: ['sun', 'wind', 'rain', 'storm'],
  },
  svamp: {
    biome: 'svamp',
    theme: 'alv',
    wall: 6,
    floor: 'moss',
    solid: 'rock',
    ambient: [0.45, 0.4, 0.65],
    decor: ['saga_glowshroom', 'saga_fairylight', 'saga_cobweb', 'saga_elfstatue'],
    // a cluster around a glade
    rooms: [room(4, 4, 10, 10, 'start'), room(20, 6, 12, 12, 'pack'), room(38, 10, 13, 12, 'pack'), room(22, 28, 9, 9, 'rest'), room(46, 44, 13, 11, 'exit'), room(4, 30, 11, 12, 'side')],
    links: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 5]],
    mobs: { small: ['skuggalv'], medium: ['jattespindel'], big: ['svampvakt'] },
    weather: ['fog', 'cloudy', 'rain'],
  },
  is: {
    biome: 'is',
    theme: 'frost',
    wall: 1,
    floor: 'snow',
    solid: 'rock',
    ambient: [0.55, 0.65, 0.85],
    decor: ['saga_icecrystal', 'saga_frozenpillar', 'saga_icecrystal', 'saga_snowdrift'],
    // a spiral that ends high up
    rooms: [room(3, 48, 10, 10, 'start'), room(18, 48, 12, 11, 'pack'), room(36, 44, 13, 12, 'pack'), room(50, 26, 9, 9, 'rest'), room(28, 6, 14, 11, 'exit'), room(6, 24, 12, 12, 'side')],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5]],
    mobs: { small: ['isande'], medium: ['isvarg'], big: ['frosttroll'] },
    weather: ['snow', 'wind', 'fog', 'hail'],
  },
  vulkan: {
    biome: 'vulkan',
    theme: 'surt',
    wall: 2,
    floor: 'ash',
    solid: 'basalt',
    ambient: [0.75, 0.42, 0.3],
    decor: ['saga_anvil', 'saga_brazier', 'saga_lavacrack', 'saga_brazier'],
    // two roads round a lava lake that meet at the rest stone
    rooms: [room(4, 26, 10, 11, 'start'), room(20, 10, 12, 11, 'pack'), room(20, 40, 12, 12, 'pack'), room(38, 26, 9, 10, 'rest'), room(50, 8, 11, 12, 'exit'), room(50, 42, 11, 11, 'side')],
    links: [[0, 1], [0, 2], [1, 3], [3, 4], [2, 5]],
    mobs: { small: ['eldimp'], medium: ['eldhund'], big: ['lavagolem'] },
    weather: ['wind', 'cloudy', 'sun'],
  },
};

/** The boss zone: start, a pack room, a rest stone, (the guard, with the modifier `vakten`) and the hall. */
export const BOSS_ZONE = {
  start: { x: 3, y: 46, w: 10, h: 10 },
  pack: { x: 18, y: 44, w: 12, h: 12 },
  rest: { x: 36, y: 48, w: 9, h: 9 },
  guard: { x: 36, y: 22, w: 13, h: 13 },
  hall: { x: 4, y: 4, w: 24, h: 22 },
};

/** Health of a zone's monsters by zone (0..2): the later zones are tougher. Tuned by the bots. */
export const ZONE_HP: readonly number[] = [1.35, 1.5, 1.7];

/** One human alone (with the hired companion, who counts as a fighter for the monsters' health): monsters tolerate this much less. */
export const SOLO_MERCY = 0.75;

/** Packs per room (and members), by zone. Tuned by the bots (run.test.ts), see GAME.md. */
export const ZONE_PACKS = [
  { a: [2, 2], b: [3, 3], size: [3, 4], big: 0 },
  { a: [2, 3], b: [3, 3], size: [3, 4], big: 0 },
  { a: [3, 3], b: [3, 3], size: [3, 4], big: 1 },
] as const;

// ---------------------------------------------------------------------------
// What the clients are told (protocol.ts carries these)
// ---------------------------------------------------------------------------

export type RunOutcome = 'win' | 'wipe' | 'leave';
export type RunPhase = 'zone' | 'pick' | 'victory' | 'ended';

/** The run as the arch window, the HUD and the road picture need it. */
export interface RunSnap {
  id: string;
  phase: RunPhase;
  /** The map now: 0..2 the zones, 3 the boss's. */
  zone: number;
  /** The area key of the map now. */
  area: string;
  /** The biome of each of the three zones (null for the boss). */
  biomes: (RunBiome | null)[];
  boss: DungeonId;
  weather: WeatherKind;
  modifiers: string[];
  /** Run time so far and the longest it may be (ms). */
  elapsed: number;
  max: number;
  party: { id: string; name: string; bot?: true }[];
  /** The runor taken so far, and the sagafrön each player has earned in this run. */
  runor: string[];
  earned: Record<string, number>;
}

/** The three cards being voted on. */
export interface RunOfferSnap {
  /** The map the party just left (the pick comes after it). */
  zone: number;
  cards: string[];
  /** Player id -> index of the card they tapped. */
  votes: Record<string, number>;
  /** Time left to vote (ms), and new offers the party may still ask for. */
  left: number;
  rerolls: number;
}
