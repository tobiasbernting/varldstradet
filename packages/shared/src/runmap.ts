// The run generator (DESIGN.md section 2): a run is one dungeon (a chapter) as a route, a graph of stops in ten rows, up to
// three lanes wide. `generateRoute` makes the graph from a seed; `generateRun` adds the plan of every stop (rooms, packs,
// the numbers that make it a stop of a run); `buildStop` builds one stop's map with the same builder as the saga's dungeons
// (sagamap.ts), so a stop has the object kinds the client already draws: walls, gates, torches, rest stones, decor. It has the
// chapter's own look (floor, walls, light, decor, monsters), and the seven biome templates of v1 serve as the layouts of a Flock.
// The väg-runor on the floor of the exit room are put there by runsim.ts when the stop is cleared.
import { hashInts, mulberry32, randInt } from './rng.ts';
import { DUNGEONS, DUNGEON_IDS, SAGA_BOSSES, SAGA_MOBS, type DungeonId, type SagaDungeonDef, type SagaRoom } from './saga.ts';
import { SOLID, buildDungeon } from './sagamap.ts';
import { addObject, objectAt, removeObject } from './map.ts';
import {
  BOSS_PACKS,
  BOSS_STOP,
  FLOCK_PACKS,
  LATT_BOSS_PACKS,
  LATT_FLOCK_PACKS,
  LATT_MINI_PACKS,
  MAX_MODIFIERS,
  AFFIXES,
  RUN_LEVELS,
  isEasy,
  MINI_PACKS,
  MINI_STOP,
  MODIFIERS,
  REST_STOP,
  ROUTE_MINI_ROW,
  ROUTE_REST_ROW,
  ROUTE_ROWS,
  RUN_BIOMES,
  WING_HP,
  ZONE_TEMPLATES,
  ELITE_HP,
  ELITE_PACKS,
  TREASURE_PACKS,
  modifier,
  wingOf,
  type NodeKind,
  type RouteNodeSnap,
  type RunBiome,
  type RunLevel,
  type ZoneRoom,
} from './run.ts';
import { STOP_INTROS, STOP_NAMES } from './sv.ts';
import { MAP_H, MAP_W, type Terrain, type WeatherKind, type WorldState } from './types.ts';

// ---------------------------------------------------------------------------
// The route: a graph of stops
// ---------------------------------------------------------------------------

/** A stop on the route: row 1..10, lane 0..lanes-1, its kind and the stops of the next row it leads to (by id). */
export interface RouteNode {
  id: number;
  row: number;
  lane: number;
  lanes: number;
  kind: NodeKind;
  next: number[];
}

export interface RoutePlan {
  seed: number;
  dungeon: DungeonId;
  level: RunLevel;
  /** Row-major: the ids are the indices; node 0 is the only stop of row 1 and the last node is the boss. */
  nodes: RouteNode[];
}

/** Rows with one stop only: the start, the mid-boss, the last rest and the boss. */
const SINGLE_ROWS = new Set([1, ROUTE_MINI_ROW, ROUTE_REST_ROW, ROUTE_ROWS]);
/** Rows where one lane is always a Vilosten (the safe lane), reachable from every stop of the row before. */
const SAFE_ROWS = new Set([4, 8]);

/**
 * The route of a run, deterministic from the seed (like every generator here). The hard rules (DESIGN.md section 2.1, for the
 * kinds there are in R3): row 1 a Flock, row 5 the Mellanboss, row 9 a Vilosten, row 10 the Boss; rows 2–4 and 6–8 have two or three
 * lanes; rows 4 and 8 always have a Vilosten lane that every stop before can walk to; a Vilosten also turns up now and then on rows
 * 2 and 6 (never on 3 and 7: no two in a row); every stop has a way in and a way on, so all of them can be reached from the start
 * and all of them lead to the boss.
 */
export function generateRoute(seed: number, opts: { dungeon: DungeonId; level: RunLevel }): RoutePlan {
  const rnd = mulberry32(hashInts(seed, 0x2007e, DUNGEON_IDS.indexOf(opts.dungeon)));
  const rows: RouteNode[][] = [];
  let id = 0;
  for (let row = 1; row <= ROUTE_ROWS; row++) {
    const lanes = SINGLE_ROWS.has(row) ? 1 : rnd() < 0.45 ? 3 : 2;
    const kinds: NodeKind[] = Array.from({ length: lanes }, () => 'flock');
    if (row === ROUTE_MINI_ROW) kinds[0] = 'mini';
    else if (row === ROUTE_REST_ROW) kinds[0] = 'rest';
    else if (row === ROUTE_ROWS) kinds[0] = 'boss';
    else if (SAFE_ROWS.has(row)) kinds[randInt(rnd, 0, lanes - 1)] = 'rest';
    else if ((row === 2 || row === 6) && rnd() < 0.3) kinds[randInt(rnd, 0, lanes - 1)] = 'rest';
    // the free lanes are not all fights (DESIGN.md 2.1): a Händelse, a Skatt, a Stark vakt (not before row 3 and not on the two easiest levels) or a Köpman
    if (!SINGLE_ROWS.has(row))
      kinds.forEach((k, lane) => {
        if (k !== 'flock') return;
        const roll = rnd() * 100;
        const elite = row >= 3;
        const wanted: NodeKind = roll < 18 ? 'event' : roll < 28 ? 'treasure' : roll < 40 ? (elite ? 'elite' : 'flock') : roll < 47 ? 'shop' : 'flock';
        // never two Händelser in one row, and one lane of every row is a plain fight (the party can always choose to fight, and a row is never all surprises)
        if (wanted === 'event' && kinds.includes('event')) return;
        kinds[lane] = wanted;
      });
    // (one roll for the fix, used or not, so the map does not depend on the level)
    const fixAt = rnd();
    if (!SINGLE_ROWS.has(row) && !kinds.some((k) => k === 'flock' || k === 'rest')) kinds[Math.floor(fixAt * lanes)] = 'flock';
    // (the two easiest levels have no Stark vakt: it is a plain Flock there, after everything else has been decided)
    if (isEasy(opts.level)) kinds.forEach((k, i) => { if (k === 'elite') kinds[i] = 'flock'; });
    rows.push(kinds.map((kind, lane) => ({ id: id++, row, lane, lanes, kind, next: [] })));
  }
  // a Köpman on every route, in each of the first two wings (rows 2-4 and 6-8): the party can spend what it earns
  for (const [lo, hi] of [[2, 4], [6, 8]] as const) {
    const inWing = rows.slice(lo - 1, hi).flat();
    const pickAt = rnd();
    if (inWing.some((n) => n.kind === 'shop')) continue;
    // a surprise lane makes way for it; else a fight lane in a row that keeps another fight or a Vilosten
    // (a Stark vakt counts as a Flock here, so the map is the same on every level)
    const fight = (k: NodeKind): boolean => k === 'flock' || k === 'elite';
    const surprise = inWing.filter((n) => n.kind === 'event' || n.kind === 'treasure');
    const free = inWing.filter((n) => fight(n.kind) && rows[n.row - 1]!.filter((m) => fight(m.kind) || m.kind === 'rest').length >= 2);
    const from = surprise.length ? surprise : free;
    from[Math.floor(pickAt * from.length)]!.kind = 'shop';
  }
  for (let r = 0; r + 1 < rows.length; r++) {
    const from = rows[r]!;
    const to = rows[r + 1]!;
    const pos = (n: RouteNode): number => (n.lane + 0.5) / n.lanes;
    const link = (a: RouteNode, b: RouteNode): void => {
      if (!a.next.includes(b.id)) a.next.push(b.id);
    };
    const nearest = (a: RouteNode, xs: RouteNode[]): RouteNode[] => [...xs].sort((p, q) => Math.abs(pos(p) - pos(a)) - Math.abs(pos(q) - pos(a)) || rnd() - 0.5);
    for (const a of from) {
      const near = nearest(a, to);
      link(a, near[0]!);
      if (near[1] && rnd() < 0.35) link(a, near[1]);
    }
    for (const b of to) if (!from.some((a) => a.next.includes(b.id))) link(nearest(b, from)[0]!, b);
    // the safe lane: every stop of the row before can walk to it
    if (SAFE_ROWS.has(r + 2)) for (const a of from) link(a, to.find((n) => n.kind === 'rest')!);
    for (const a of from) a.next.sort((p, q) => p - q);
  }
  return { seed, dungeon: opts.dungeon, level: opts.level, nodes: rows.flat() };
}

/** The route as the clients need it (RunSnap.route). */
export const routeSnap = (route: RoutePlan): RouteNodeSnap[] => route.nodes.map((n) => ({ id: n.id, row: n.row, lane: n.lane, lanes: n.lanes, kind: n.kind, next: [...n.next] }));

// ---------------------------------------------------------------------------
// The plan of a stop
// ---------------------------------------------------------------------------

/** One map of a run: the dungeon plan it is built from and the numbers that make it a stop. */
export interface StopPlan {
  /** The stop's id in the route. */
  node: number;
  row: number;
  kind: NodeKind;
  /** The biome template whose rooms a Flock is laid out in (the other kinds have a layout of their own). */
  layout?: RunBiome;
  name: string;
  intro: string;
  weather: WeatherKind;
  flipX: boolean;
  flipY: boolean;
  def: SagaDungeonDef;
  solid: Terrain;
  /** The packs (indices in the map's packs) that must fall before the gate opens; empty when the mid-boss opens it (or nothing closes it). */
  required: number[];
  /** What opens the gate in front of the exit room (or the boss's hall). */
  gate: 'packs' | 'mini';
  /** The room (index in `def.rooms`) that holds the väg-runor (every kind but the boss's) or the boss. */
  endRoom: number;
  hpMul: number;
  /** Särdrag: bosses hit harder, a monster below a quarter health enrages, the rest of a pack hit harder for each fallen member (fraction). */
  bossDmg?: number;
  enrage?: boolean;
  grow?: number;
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
  route: RoutePlan;
  /** The plan of every stop, by the stop's id. */
  stops: StopPlan[];
}

export interface RunOptions {
  boss: DungeonId;
  /** The boss was beaten before: all attacks, and a modifier for each earlier clear. */
  replay?: boolean;
  /** How many times the starter has cleared this chapter (a replay's number of modifiers; at most 3). */
  clears?: number;
  /** Modifiers chosen by the caller instead of by the seed. */
  modifiers?: string[];
  /** 0 Lätt or 1 Vanlig (the default). The route is the same for both. */
  level?: RunLevel;
}

const pick = <T>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

/** Mirrors a room left-right and/or top-bottom on the 64 × 64 map. */
function flip(r: { x: number; y: number; w: number; h: number }, fx: boolean, fy: boolean): { x: number; y: number; w: number; h: number } {
  return { x: fx ? MAP_W - r.x - r.w : r.x, y: fy ? MAP_H - r.y - r.h : r.y, w: r.w, h: r.h };
}

/** The dungeon's monsters in three strengths (by health): the weakest, those between, the strongest. */
export function dungeonMobs(d: DungeonId): { small: string[]; medium: string[]; big: string[] } {
  const species = [...new Set(DUNGEONS[d].rooms.flatMap((r) => (r.packs ?? []).flat()))].sort((a, b) => (SAGA_MOBS[a]?.hp ?? 0) - (SAGA_MOBS[b]?.hp ?? 0));
  if (species.length <= 2) return { small: [species[0]!], medium: [species[species.length - 1]!], big: [species[species.length - 1]!] };
  return { small: [species[0]!], medium: species.slice(1, -1), big: [species[species.length - 1]!] };
}

/** A pack: `size` members out of the dungeon's monsters, one big one when asked; the later wings have fewer of the small ones. */
function pack(mobs: ReturnType<typeof dungeonMobs>, wing: number, size: number, big: boolean, rnd: () => number): string[] {
  const m: string[] = [];
  if (big) m.push(pick(rnd, mobs.big));
  while (m.length < size) {
    const smallChance = wing === 0 ? 0.5 : 0.3;
    m.push(pick(rnd, rnd() < smallChance ? mobs.small : mobs.medium));
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
  const moves = SAGA_BOSSES[DUNGEONS[boss].boss]!.moves;
  if (replay || moves.length < 3) return undefined;
  const keep = new Set([0]);
  const kick = moves.findIndex((m) => m.interrupt);
  if (kick >= 0) keep.add(kick);
  const lockable = moves.map((_, i) => i).filter((i) => !keep.has(i));
  const locked = pick(rnd, lockable);
  return moves.map((_, i) => i).filter((i) => i !== locked);
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

/** The plan of one stop. */
function planStop(seed: number, node: RouteNode, boss: DungeonId, mods: string[], level: RunLevel): StopPlan {
  const rnd = mulberry32(hashInts(seed, node.id, 0x20ae));
  const fx = rnd() < 0.5;
  const fy = rnd() < 0.5;
  const mod = mods.map((id) => modifier(id)!);
  const extra = mod.reduce((n, m) => n + (m.extra ?? 0), 0);
  const d = DUNGEONS[boss];
  const mobs = dungeonMobs(boss);
  const wing = wingOf(node.row);
  const members = (lo: number, hi: number, big: boolean): string[] => pack(mobs, wing, Math.min(6, randInt(rnd, lo, hi) + extra), big, rnd);
  const n = (range: readonly number[]): number => randInt(rnd, range[0]!, range[1]!);
  const at = (r: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } => flip(r, fx, fy);
  const rooms: SagaRoom[] = [];
  let links: [number, number][] = [];
  const required: number[] = [];
  let endRoom = 0;
  let gate: StopPlan['gate'] = 'packs';
  let layout: RunBiome | undefined;
  let packIndex = 0;
  const packRoom = (r: { x: number; y: number; w: number; h: number }, count: number, size: readonly number[], bigAt = -1): void => {
    const packs = Array.from({ length: count }, (_, k) => members(size[0]!, size[1]!, k === bigAt));
    for (let k = 0; k < count; k++) required.push(packIndex + k);
    packIndex += count;
    rooms.push({ ...r, kind: 'pack', packs });
  };
  switch (node.kind) {
    case 'elite':
    case 'treasure':
    case 'flock': {
      // a layout of one of the seven biome templates: start, the two rooms of packs and the exit room (the rest stone and the side room go)
      const t = ZONE_TEMPLATES[pick(rnd, RUN_BIOMES)];
      layout = t.biome;
      const cut = dropRooms(t.rooms as ZoneRoom[], t.links, [3, 5]);
      const table = isEasy(level) ? LATT_FLOCK_PACKS : FLOCK_PACKS;
      const spec = node.kind === 'elite' ? ELITE_PACKS : node.kind === 'treasure' ? TREASURE_PACKS : table[Math.min(wing, table.length - 1)]!;
      let order = 0;
      cut.rooms.forEach((r, i) => {
        const f = at(r);
        if (r.role === 'start') rooms.push({ ...f, kind: 'start' });
        else if (r.role === 'pack') {
          const a = order++ === 0;
          const range = a ? spec.a : spec.b;
          const count = n(range);
          packRoom(f, count, spec.size, !a && spec.big > 0 ? randInt(rnd, 0, count - 1) : -1);
        } else if (r.role === 'exit') {
          rooms.push({ ...f, kind: 'pack', gated: true });
          endRoom = i;
        }
      });
      links = cut.links;
      break;
    }
    case 'rest': {
      rooms.push({ ...at(REST_STOP.start), kind: 'start' }, { ...at(REST_STOP.rest), kind: 'rest' }, { ...at(REST_STOP.exit), kind: 'pack' });
      links = [[0, 1], [1, 2]];
      endRoom = 2;
      break;
    }
    case 'shop':
    case 'event': {
      // a camp: start, a glade in the middle (no stone, no packs) and the exit room; nobody fights here
      rooms.push({ ...at(REST_STOP.start), kind: 'start' }, { ...at(REST_STOP.rest), kind: 'pack', packs: [] }, { ...at(REST_STOP.exit), kind: 'pack' });
      links = [[0, 1], [1, 2]];
      endRoom = 2;
      break;
    }
    case 'mini': {
      const hall = d.rooms.find((r) => r.kind === 'mini')!;
      rooms.push({ ...at(MINI_STOP.start), kind: 'start' });
      const mp = isEasy(level) ? LATT_MINI_PACKS : MINI_PACKS;
      packRoom(at(MINI_STOP.pack), n(mp.count), mp.size);
      rooms.push({ ...at({ x: MINI_STOP.hall.x, y: MINI_STOP.hall.y, w: hall.w, h: hall.h }), kind: 'mini' }, { ...at(MINI_STOP.exit), kind: 'pack', gated: true });
      links = [[0, 1], [1, 2], [2, 3]];
      endRoom = 3;
      gate = 'mini';
      // (the packs before the mini-boss are not what opens the gate behind it)
      required.length = 0;
      break;
    }
    case 'boss': {
      const guard = mod.some((m) => m.guard);
      const hall = d.rooms.find((r) => r.kind === 'boss')!;
      rooms.push({ ...at(BOSS_STOP.start), kind: 'start' });
      const bp = isEasy(level) ? LATT_BOSS_PACKS : BOSS_PACKS;
      packRoom(at(BOSS_STOP.pack), n(bp.count), bp.size);
      links = [[0, 1]];
      if (guard) {
        rooms.push({ ...at(BOSS_STOP.guard), kind: 'mini' });
        links.push([1, 2]);
        required.length = 0;
        gate = 'mini';
      }
      const hallAt = { x: BOSS_STOP.hall.x, y: BOSS_STOP.hall.y, w: Math.min(hall.w, BOSS_STOP.hall.w), h: Math.min(hall.h, BOSS_STOP.hall.h) };
      links.push([guard ? 2 : 1, rooms.length]);
      endRoom = rooms.length;
      rooms.push({ ...at(hallAt), kind: 'boss', gated: true });
      break;
    }
  }
  const def: SagaDungeonDef = { ...d, rooms, links };
  const fog = mod.some((m) => m.fog);
  return {
    node: node.id,
    row: node.row,
    kind: node.kind,
    ...(layout ? { layout } : {}),
    name: node.kind === 'boss' ? d.name : STOP_NAMES[node.kind]!,
    intro: node.kind === 'boss' ? d.intro : STOP_INTROS[node.kind]!,
    weather: fog ? 'fog' : 'cloudy',
    flipX: fx,
    flipY: fy,
    def,
    solid: SOLID[boss],
    required,
    gate,
    endRoom,
    hpMul: (WING_HP[wing] ?? 1) * (node.kind === 'elite' ? ELITE_HP : 1) * mod.reduce((m, x) => m * (x.hpMul ?? 1) * (x.packHp ?? 1), 1),
    dmgMul: mod.reduce((m, x) => m * (x.dmgMul ?? 1), 1),
    bossMul: (node.kind === 'boss' ? mod.reduce((m, x) => m * (x.hpMul ?? 1), 1) : 1) * (node.kind === 'boss' || node.kind === 'mini' ? mod.reduce((m, x) => m * (x.bossHp ?? 1), 1) : 1),
    ...(mod.some((m) => m.bossDmg) ? { bossDmg: mod.reduce((m, x) => m * (x.bossDmg ?? 1), 1) } : {}),
    ...(mod.some((m) => m.enrage) ? { enrage: true } : {}),
    ...(mod.some((m) => m.grow) ? { grow: mod.reduce((m, x) => m + (x.grow ?? 0), 0) } : {}),
    sight: mod.reduce((m, x) => m * (x.sight ?? 1), 1),
    leash: mod.reduce((s, x) => s + (x.leash ?? 0), 0),
  };
}

/** A run's whole plan, from a seed: deterministic, so the same seed gives the same run. */
export function generateRun(seed: number, opts: RunOptions): RunPlan {
  const rnd = mulberry32(hashInts(seed, 0x7a11));
  const modifiers = pickModifiers(rnd, opts);
  // the särdrag of Svår and Extrem, by the seed (after the replay's modifiers, so those stay as they were)
  if (!opts.modifiers) {
    const pool = AFFIXES.map((m) => m.id);
    const n = RUN_LEVELS[opts.level ?? 2].affixes;
    for (let i = 0; i < n && pool.length; i++) modifiers.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  }
  const replay = !!opts.replay;
  const route = generateRoute(seed, { dungeon: opts.boss, level: opts.level ?? 1 });
  const stops = route.nodes.map((n) => planStop(seed, n, opts.boss, modifiers, route.level));
  const moves = pickMoves(rnd, opts.boss, replay);
  return { seed, boss: opts.boss, replay, modifiers, ...(moves ? { moves } : {}), route, stops };
}

/** The first dungeon a player has not cleared: the chapter's boss for a run. Null when every dungeon is cleared. */
export function chapterBoss(cleared: readonly DungeonId[]): DungeonId | null {
  return DUNGEON_IDS.find((id) => !cleared.includes(id)) ?? null;
}

/** Builds the map of stop `node` of the plan as a world with its monsters; `key` is its area key. */
export function buildStop(plan: RunPlan, node: number, key: string): WorldState {
  const z = plan.stops[node]!;
  const rnd = mulberry32(hashInts(plan.seed, node, 0xdec0));
  const world = buildDungeon(z.def, rnd, z.solid, key);
  const inst = world.saga!;
  // the dungeon's way out is gone (a run is left with `leave`); the way on is the väg-runor of the exit room
  const old = objectAt(world, inst.exit.x, inst.exit.y);
  if (old?.kind === 'saga_exit') removeObject(world, old.id);
  if (z.kind !== 'boss') {
    const r = z.def.rooms[z.endRoom]!;
    inst.exit = { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
  }
  return world;
}

/**
 * Puts a väg-runa (`run_exit`) on the floor of the exit room for each stop the next row leads to, side by side along the
 * room's long side: returns them with the stop each leads to. The variant of the object is the kind of the stop it leads to.
 */
export function placeRunes(world: WorldState, z: StopPlan, route: RoutePlan, nextIds: readonly number[]): { node: number; kind: NodeKind; x: number; y: number; id: number }[] {
  const r = z.def.rooms[z.endRoom]!;
  const out: { node: number; kind: NodeKind; x: number; y: number; id: number }[] = [];
  const horizontal = r.w >= r.h;
  // along the long side, two tiles in from the walls and as far apart as the room allows (at least ~2.5 tiles)
  nextIds.forEach((nid, i) => {
    const f = nextIds.length === 1 ? 0.5 : i / (nextIds.length - 1);
    const x = horizontal ? r.x + 2 + Math.round((r.w - 5) * f) : r.x + Math.floor(r.w / 2);
    const y = horizontal ? r.y + Math.floor(r.h / 2) : r.y + 2 + Math.round((r.h - 5) * f);
    const kind = route.nodes[nid]!.kind;
    const o = addObject(world, 'run_exit', x, y, { variant: NODE_KIND_CODE[kind] });
    if (o) out.push({ node: nid, kind, x, y, id: o.id });
  });
  return out;
}

/** The variant of a väg-runa object: which stop's picture it carries. */
export const NODE_KIND_CODE: Record<NodeKind, number> = { flock: 0, rest: 1, mini: 2, boss: 3, shop: 4, event: 5, treasure: 6, elite: 7 };
