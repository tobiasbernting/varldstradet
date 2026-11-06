// The run generator: a seeded chain of three zones and a boss, built from the zone templates in run.ts with the same
// builder as the saga's dungeons (sagamap.ts), so a zone has the object kinds the client already draws: walls, gates,
// torches, rest stones, chests, decor, and one new thing, the exit (`run_exit`) with the biome's floor under it.
import { objectAt, removeObject } from './map.ts';
import { hashInts, mulberry32, randInt } from './rng.ts';
import { DUNGEONS, DUNGEON_IDS, SAGA_BOSSES, type DungeonId, type SagaDungeonDef, type SagaRoom } from './saga.ts';
import { SOLID, buildDungeon } from './sagamap.ts';
import { addObject } from './map.ts';
import {
  BOSS_ZONE,
  MAX_MODIFIERS,
  MODIFIERS,
  RUN_BIOMES,
  ZONES_PER_RUN,
  ZONE_HP,
  ZONE_PACKS,
  ZONE_TEMPLATES,
  modifier,
  type RunBiome,
  type ZoneRoom,
  type ZoneTemplate,
} from './run.ts';
import { ZONE_INTROS, ZONE_NAMES } from './sv.ts';
import { MAP_H, MAP_W, type Terrain, type WeatherKind, type WorldState } from './types.ts';

/** One map of a run: the dungeon plan it is built from and the numbers that make it a zone. */
export interface ZonePlan {
  /** 0..2 the zones, 3 the boss's. */
  index: number;
  kind: 'zone' | 'boss';
  biome: RunBiome | null;
  name: string;
  intro: string;
  weather: WeatherKind;
  flipX: boolean;
  flipY: boolean;
  def: SagaDungeonDef;
  solid: Terrain;
  /** The packs (indices in the map's packs) that must fall before the gate opens; empty when the mid-boss opens it. */
  required: number[];
  /** What opens the gate in front of the exit room (or the boss's hall). */
  gate: 'packs' | 'mini';
  /** The room (index in `def.rooms`) that holds the exit (zones) or the boss (the boss zone). */
  endRoom: number;
  hpMul: number;
  dmgMul: number;
  bossMul: number;
  sight: number;
  leash: number;
}

export interface RunPlan {
  seed: number;
  /** The chapter's boss (a dungeon id; the boss is that dungeon's boss). */
  boss: DungeonId;
  replay: boolean;
  modifiers: string[];
  /** The boss's attacks that are unlocked (indices into its moves); left out: all of them. */
  moves?: number[];
  zones: ZonePlan[];
}

export interface RunOptions {
  boss: DungeonId;
  /** The boss was beaten before: all attacks, and a modifier for each earlier clear. */
  replay?: boolean;
  /** How many times the starter has cleared this chapter (a replay's number of modifiers; at most 3). */
  clears?: number;
  /** Modifiers chosen by the caller instead of by the seed. */
  modifiers?: string[];
}

const pick = <T>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

/** Mirrors a room left-right and/or top-bottom on the 64 × 64 map. */
function flip(r: { x: number; y: number; w: number; h: number }, fx: boolean, fy: boolean): { x: number; y: number; w: number; h: number } {
  return { x: fx ? MAP_W - r.x - r.w : r.x, y: fy ? MAP_H - r.y - r.h : r.y, w: r.w, h: r.h };
}

/** A pack for a zone: `size` members out of the biome's monsters by tier, one big one when asked. */
function pack(t: ZoneTemplate, tier: number, size: number, big: boolean, rnd: () => number): string[] {
  const m: string[] = [];
  if (big) m.push(pick(rnd, t.mobs.big));
  while (m.length < size) {
    const smallChance = tier === 0 ? 0.6 : tier === 1 ? 0.3 : 0.15;
    m.push(pick(rnd, rnd() < smallChance ? t.mobs.small : t.mobs.medium));
  }
  return m;
}

/** Chooses the modifiers of a run: the caller's, or one more for every earlier clear (up to three), by the seed. */
function pickModifiers(rnd: () => number, opts: RunOptions): string[] {
  if (opts.modifiers) return opts.modifiers.filter((id) => !!modifier(id)).slice(0, MAX_MODIFIERS);
  const n = opts.replay ? Math.min(MAX_MODIFIERS, Math.max(1, opts.clears ?? 1)) : 0;
  const pool = MODIFIERS.map((m) => m.id);
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  return out;
}

/** The attacks of the chapter's boss that are unlocked: all on a replay, else one of the later ones is left out. */
function pickMoves(rnd: () => number, boss: DungeonId, replay: boolean): number[] | undefined {
  const def = SAGA_BOSSES[DUNGEONS[boss].boss]!;
  if (replay || def.moves.length < 3) return undefined;
  const keep = new Set([0]);
  const kick = def.moves.findIndex((m) => m.interrupt);
  if (kick >= 0) keep.add(kick);
  const lockable = def.moves.map((_, i) => i).filter((i) => !keep.has(i));
  const locked = pick(rnd, lockable);
  return def.moves.map((_, i) => i).filter((i) => i !== locked);
}

/** Drops optional rooms of a template: the children of a dropped room are tied to its parent. */
function dropRooms(rooms: ZoneRoom[], links: [number, number][], drop: number[]): { rooms: ZoneRoom[]; links: [number, number][]; newIndex: number[] } {
  let ls = links.map((l) => [...l] as [number, number]);
  for (const d of drop) {
    const parent = ls.find(([, c]) => c === d)?.[0];
    ls = ls.filter(([, c]) => c !== d).map(([p, c]) => [p === d && parent !== undefined ? parent : p, c] as [number, number]);
  }
  const newIndex: number[] = [];
  const kept: ZoneRoom[] = [];
  rooms.forEach((r, i) => {
    if (drop.includes(i)) newIndex.push(-1);
    else {
      newIndex.push(kept.length);
      kept.push(r);
    }
  });
  return { rooms: kept, links: ls.map(([p, c]) => [newIndex[p]!, newIndex[c]!] as [number, number]), newIndex };
}

/** The plan of one ordinary zone. */
function planZone(seed: number, index: number, t: ZoneTemplate, mods: string[]): ZonePlan {
  const rnd = mulberry32(hashInts(seed, index, 0x20ae));
  const fx = rnd() < 0.5;
  const fy = rnd() < 0.5;
  const mod = mods.map((id) => modifier(id)!);
  const extra = mod.reduce((n, m) => n + (m.extra ?? 0), 0);
  // 4–6 rooms: the first zone is sometimes short (its first pack room goes), a side room is kept most of the time
  const drop: number[] = [];
  if (index === 0 && rnd() < 0.35) drop.push(1);
  if (rnd() < 0.3) drop.push(5);
  const cut = dropRooms(t.rooms as ZoneRoom[], t.links, drop);
  const spec = ZONE_PACKS[index]!;
  const rooms: SagaRoom[] = [];
  let packIndex = 0;
  const required: number[] = [];
  let endRoom = 0;
  let order = 0;
  cut.rooms.forEach((r, i) => {
    const f = flip(r, fx, fy);
    const base = { x: f.x, y: f.y, w: f.w, h: f.h };
    const members = (lo: number, hi: number, big: boolean): string[] => pack(t, index, Math.min(6, randInt(rnd, lo, hi) + extra), big, rnd);
    const n = (range: readonly number[]): number => randInt(rnd, range[0]!, range[1]!);
    switch (r.role) {
      case 'start':
        rooms.push({ ...base, kind: 'start' });
        break;
      case 'pack': {
        // two pack rooms: the first is the easier; a lone one (the first was dropped) is the second kind
        const roomA = order++ === 0 && cut.rooms.filter((q) => q.role === 'pack').length === 2;
        const count = n(roomA ? spec.a : spec.b);
        const bigAt = !roomA && spec.big > 0 ? randInt(rnd, 0, count - 1) : -1;
        const packs = Array.from({ length: count }, (_, k) => members(spec.size[0]!, spec.size[1]!, k === bigAt));
        for (let k = 0; k < count; k++) required.push(packIndex + k);
        packIndex += count;
        rooms.push({ ...base, kind: 'pack', packs });
        break;
      }
      case 'side':
        // a guarded chest: this pack is not needed to open the gate
        rooms.push({ ...base, kind: 'treasure', packs: [members(2, 3, false)] });
        packIndex += 1;
        break;
      case 'rest':
        rooms.push({ ...base, kind: 'rest' });
        break;
      case 'exit':
        rooms.push({ ...base, kind: 'pack', gated: true });
        endRoom = i;
        break;
    }
  });
  const weather = pick(rnd, t.weather);
  const fog = mod.some((m) => m.fog);
  const def: SagaDungeonDef = {
    id: t.theme,
    name: ZONE_NAMES[t.biome] ?? t.biome,
    chapter: DUNGEONS[t.theme].chapter,
    intro: ZONE_INTROS[t.biome] ?? '',
    portal: DUNGEONS[t.theme].portal,
    floor: t.floor,
    bossFloor: t.floor,
    wall: t.wall,
    ambient: t.ambient,
    rooms,
    links: cut.links,
    mini: DUNGEONS[t.theme].mini,
    boss: DUNGEONS[t.theme].boss,
    decor: t.decor,
  };
  return {
    index,
    kind: 'zone',
    biome: t.biome,
    name: def.name,
    intro: def.intro,
    weather: fog ? 'fog' : weather,
    flipX: fx,
    flipY: fy,
    def,
    solid: t.solid,
    required,
    gate: 'packs',
    endRoom,
    hpMul: (ZONE_HP[index] ?? 1) * mod.reduce((m, x) => m * (x.hpMul ?? 1), 1),
    dmgMul: mod.reduce((m, x) => m * (x.dmgMul ?? 1), 1),
    bossMul: 1,
    sight: mod.reduce((m, x) => m * (x.sight ?? 1), 1),
    leash: mod.reduce((n, x) => n + (x.leash ?? 0), 0),
  };
}

/** The plan of the boss's map: start, a pack room, a rest stone, (the guard) and the boss's hall. */
function planBoss(seed: number, boss: DungeonId, mods: string[]): ZonePlan {
  const rnd = mulberry32(hashInts(seed, 3, 0xb055));
  const d = DUNGEONS[boss];
  const fx = rnd() < 0.5;
  const fy = rnd() < 0.5;
  const mod = mods.map((id) => modifier(id)!);
  const extra = mod.reduce((n, m) => n + (m.extra ?? 0), 0);
  const guard = mod.some((m) => m.guard);
  // the dungeon's own monsters, as the packs it has
  const species = [...new Set(d.rooms.flatMap((r) => (r.packs ?? []).flat()))];
  const mk = (size: number): string[] => Array.from({ length: Math.min(6, size + extra) }, () => pick(rnd, species));
  const z = BOSS_ZONE;
  const at = (r: { x: number; y: number; w: number; h: number }) => flip(r, fx, fy);
  const rooms: SagaRoom[] = [
    { ...at(z.start), kind: 'start' },
    { ...at(z.pack), kind: 'pack', packs: [mk(3), mk(3)] },
    { ...at(z.rest), kind: 'rest' },
  ];
  const links: [number, number][] = [[0, 1], [1, 2]];
  if (guard) {
    rooms.push({ ...at(z.guard), kind: 'mini' });
    links.push([1, 3]);
  }
  const hall = rooms.length;
  rooms.push({ ...at(z.hall), kind: 'boss', gated: true });
  links.push([guard ? 3 : 1, hall]);
  const def: SagaDungeonDef = { ...d, rooms, links };
  return {
    index: ZONES_PER_RUN,
    kind: 'boss',
    biome: null,
    name: d.name,
    intro: d.intro,
    weather: 'cloudy',
    flipX: fx,
    flipY: fy,
    def,
    solid: SOLID[boss],
    required: guard ? [] : [0, 1],
    gate: guard ? 'mini' : 'packs',
    endRoom: hall,
    hpMul: mod.reduce((m, x) => m * (x.hpMul ?? 1), 1),
    dmgMul: mod.reduce((m, x) => m * (x.dmgMul ?? 1), 1),
    bossMul: mod.reduce((m, x) => m * (x.hpMul ?? 1), 1),
    sight: mod.reduce((m, x) => m * (x.sight ?? 1), 1),
    leash: mod.reduce((n, x) => n + (x.leash ?? 0), 0),
  };
}

/** A run's whole chain, from a seed: deterministic, so the same seed gives the same run. */
export function generateRun(seed: number, opts: RunOptions): RunPlan {
  const rnd = mulberry32(hashInts(seed, 0x7a11));
  const modifiers = pickModifiers(rnd, opts);
  const replay = !!opts.replay;
  const pool: RunBiome[] = [...RUN_BIOMES];
  const biomes: RunBiome[] = [];
  while (biomes.length < ZONES_PER_RUN) biomes.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  const zones = biomes.map((b, i) => planZone(seed, i, ZONE_TEMPLATES[b], modifiers));
  zones.push(planBoss(seed, opts.boss, modifiers));
  const moves = pickMoves(rnd, opts.boss, replay);
  return { seed, boss: opts.boss, replay, modifiers, ...(moves ? { moves } : {}), zones };
}

/** The first dungeon a player has not cleared: the chapter's boss for a run. Null when every dungeon is cleared. */
export function chapterBoss(cleared: readonly DungeonId[]): DungeonId | null {
  return DUNGEON_IDS.find((id) => !cleared.includes(id)) ?? null;
}

/** Builds map `i` of the plan as a world with its monsters; `key` is its area key. */
export function buildZone(plan: RunPlan, i: number, key: string): WorldState {
  const z = plan.zones[i]!;
  const rnd = mulberry32(hashInts(plan.seed, i, 0xdec0));
  const world = buildDungeon(z.def, rnd, z.solid, key);
  const inst = world.saga!;
  if (z.kind === 'zone') {
    // the dungeon's way out is gone (a run is left with `leave`); the way on is the exit in the last room
    const old = objectAt(world, inst.exit.x, inst.exit.y);
    if (old?.kind === 'saga_exit') removeObject(world, old.id);
    const r = z.def.rooms[z.endRoom]!;
    const ex = r.x + Math.floor(r.w / 2);
    const ey = r.y + Math.floor(r.h / 2);
    addObject(world, 'run_exit', ex, ey, { variant: z.def.wall });
    inst.exit = { x: ex, y: ey };
  } else {
    const old = objectAt(world, inst.exit.x, inst.exit.y);
    if (old?.kind === 'saga_exit') removeObject(world, old.id);
  }
  return world;
}

/** Where the boss waits, in pixels (for tests and the client). */
export const bossSpot = (world: WorldState): { x: number; y: number } => {
  const a = world.animals[world.saga!.boss];
  return a ? { x: a.x, y: a.y } : { x: 0, y: 0 };
};
