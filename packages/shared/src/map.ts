import { NPCS, objectDef } from './data.ts';
import { mulberry32, randInt } from './rng.ts';
import type { MapSize, Terrain, WorldObject, WorldState } from './types.ts';
import { MAP_H, MAP_W, key } from './types.ts';

/** A map's width and height in tiles (64 unless the map says otherwise). */
export const mapW = (m: MapSize): number => m.w ?? MAP_W;
export const mapH = (m: MapSize): number => m.h ?? MAP_H;
/** Is (x, y) a tile of this map? */
export const inBounds = (m: MapSize, x: number, y: number): boolean => x >= 0 && y >= 0 && x < mapW(m) && y < mapH(m);
/** Index of tile (x, y) in this map's terrain array (rows of mapW tiles). */
export const tileIndex = (m: MapSize, x: number, y: number): number => y * mapW(m) + x;

/** The spot new characters appear at (tile coords). */
export const SPAWN = { x: 26, y: 21 };

/** Add an object to the world, registering its footprint. Returns null if blocked. */
export function addObject(
  world: WorldState,
  kind: string,
  x: number,
  y: number,
  extra: Partial<WorldObject> = {},
): WorldObject | null {
  const def = objectDef(kind);
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (!inBounds(world, tx, ty)) return null;
      if (world.occupancy[key(tx, ty)] !== undefined) return null;
      if (world.terrain[tileIndex(world, tx, ty)] === 'water') return null;
      if (world.crops[key(tx, ty)]) return null;
    }
  const id = world.nextId++;
  const obj: WorldObject = { id, kind, x, y, ...extra };
  world.objects[id] = obj;
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) world.occupancy[key(x + dx, y + dy)] = id;
  return obj;
}

export function removeObject(world: WorldState, id: number): WorldObject | undefined {
  const obj = world.objects[id];
  if (!obj) return undefined;
  const def = objectDef(obj.kind);
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) delete world.occupancy[key(obj.x + dx, obj.y + dy)];
  delete world.objects[id];
  return obj;
}

export const objectAt = (world: WorldState, x: number, y: number): WorldObject | undefined => {
  const id = world.occupancy[key(x, y)];
  return id === undefined ? undefined : world.objects[id];
};

/** Rebuild occupancy from objects (after loading from DB). */
export function rebuildOccupancy(world: WorldState): void {
  world.occupancy = {};
  for (const obj of Object.values(world.objects)) {
    const def = objectDef(obj.kind);
    for (let dy = 0; dy < def.h; dy++)
      for (let dx = 0; dx < def.w; dx++) world.occupancy[key(obj.x + dx, obj.y + dy)] = obj.id;
  }
}

/** The inside of the farmhouse lives in a walled-off room in the forest corner of the map. */
export const INTERIOR = { x: 52, y: 55, w: 10, h: 6 };
export const inInterior = (tx: number, ty: number): boolean =>
  tx >= INTERIOR.x - 1 && tx <= INTERIOR.x + INTERIOR.w && ty >= INTERIOR.y - 1 && ty <= INTERIOR.y + INTERIOR.h;

/** Walking onto `from` teleports to `to`. */
export const PORTALS: { from: { x: number; y: number }; to: { x: number; y: number }; facing: 'up' | 'down' }[] = [
  { from: { x: 10, y: 8 }, to: { x: 57, y: 59 }, facing: 'up' }, // farmhouse door -> inside
  { from: { x: 57, y: 61 }, to: { x: 10, y: 9 }, facing: 'down' }, // inside exit -> outside the door
];
export const portalAt = (tx: number, ty: number) => PORTALS.find((p) => p.from.x === tx && p.from.y === ty);

/** Builds (or repairs) the farmhouse interior and makes room for the villagers. Idempotent. */
const NATURAL = new Set(['tree', 'tree_pine', 'tree_apple', 'stump', 'rock', 'rock_small', 'grass_tuft', 'bush', 'flower', 'wild_pumpkin', 'wild_flower_mid']);

export function ensureInterior(world: WorldState): boolean {
  const x0 = INTERIOR.x - 1;
  const y0 = INTERIOR.y - 1;
  const x1 = INTERIOR.x + INTERIOR.w;
  const y1 = INTERIOR.y + INTERIOR.h;
  // Nothing wild inside the room, nor in a margin around it (tree tops would poke through the walls)
  for (const o of Object.values(world.objects)) if (NATURAL.has(o.kind) && o.x >= x0 - 1 && o.x <= x1 + 1 && o.y >= y0 - 1 && o.y <= y1 + 2) removeObject(world, o.id);
  if (Object.values(world.objects).some((o) => o.kind === 'door_out')) return false;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const o = objectAt(world, x, y);
      if (o) removeObject(world, o.id);
      delete world.crops[key(x, y)];
      const wall = x === x0 || x === x1 || y === y0 || y === y1;
      world.terrain[tileIndex(world, x, y)] = wall ? 'floor_stone' : 'floor_wood';
      if (wall) {
        if (x === 57 && y === y1) addObject(world, 'door_out', x, y);
        else addObject(world, 'wall_wood', x, y);
      }
    }
  // Starter furniture
  addObject(world, 'bed', INTERIOR.x, INTERIOR.y);
  addObject(world, 'rug', INTERIOR.x + 4, INTERIOR.y + 2);
  addObject(world, 'table', INTERIOR.x + 7, INTERIOR.y + 1);
  addObject(world, 'chair', INTERIOR.x + 6, INTERIOR.y + 1);
  addObject(world, 'chair', INTERIOR.x + 8, INTERIOR.y + 1);
  addObject(world, 'stove', INTERIOR.x + 9, INTERIOR.y);
  addObject(world, 'bookshelf', INTERIOR.x + 2, INTERIOR.y);
  addObject(world, 'plant', INTERIOR.x + 9, INTERIOR.y + 4);
  return true;
}

/** A blank map of grass; any size other than 64×64 is written on the map. */
export function emptyWorld(w = MAP_W, h = MAP_H): WorldState {
  const world: WorldState = {
    quests: [],
    questsDay: 0,
    npcs: {},
    day: 1,
    timeMs: 2 * 60 * 1000, // start mid-morning
    terrain: new Array<Terrain>(w * h).fill('grass'),
    crops: {},
    objects: {},
    occupancy: {},
    animals: {},
    drops: {},
    players: {},
    nextId: 1,
    seasonOverride: null,
  };
  if (w !== MAP_W || h !== MAP_H) {
    world.w = w;
    world.h = h;
  }
  return world;
}


/** Where things stand in the lobby ("Gården"), all in tile coordinates. */
export const LOBBY = {
  /** The playable yard; everything outside it is forest. */
  x0: 3,
  y0: 3,
  x1: 46,
  y1: 33,
  plaza: { x: 26, y: 18, r: 6 },
  arch: { x: 25, y: 11 },
  shoot: { x: 31, y: 12 },
  volva: { x: 21, y: 15 },
  stone: { x: 22, y: 15 },
  smith: { x: 37, y: 17 },
  kennel: { x: 18, y: 21 },
  wardrobe: { x: 7, y: 9 },
};

/** Builds the lobby: a Norse homestead where everyone meets between runs. Deterministic for a given seed. */
export function generateWorld(seed = 1337): WorldState {
  const world = emptyWorld();
  const rnd = mulberry32(seed);
  const T = world.terrain;
  const set = (x: number, y: number, t: Terrain) => {
    if (inBounds(world, x, y)) T[tileIndex(world, x, y)] = t;
  };
  const L = LOBBY;
  const inYard = (x: number, y: number) => x >= L.x0 && x <= L.x1 && y >= L.y0 && y <= L.y1;
  /** A path `w` tiles wide between two points (straight, horizontal or vertical). */
  const line = (x0: number, y0: number, x1: number, y1: number, t: Terrain, w = 2) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / (n || 1));
      const y = Math.round(y0 + ((y1 - y0) * i) / (n || 1));
      for (let k = 0; k < w; k++) set(y0 === y1 ? x : x + k, y0 === y1 ? y + k : y, t);
    }
  };

  // Pond in the south-east, with a sand ring
  const pond = { cx: 39, cy: 28, rx: 5, ry: 3 };
  for (let y = L.y0; y <= L.y1; y++)
    for (let x = L.x0; x <= L.x1; x++) {
      const d = ((x - pond.cx) / pond.rx) ** 2 + ((y - pond.cy) / pond.ry) ** 2;
      if (d <= 1) set(x, y, 'water');
      else if (d <= 1.7) set(x, y, 'sand');
    }

  // The plaza: round, stone, with a dirt rim
  const P = L.plaza;
  for (let y = P.y - P.r - 2; y <= P.y + P.r + 2; y++)
    for (let x = P.x - P.r - 2; x <= P.x + P.r + 2; x++) {
      const d = Math.hypot(x - P.x, (y - P.y) * 1.15);
      if (d <= P.r) set(x, y, 'path_stone');
      else if (d <= P.r + 1.2) set(x, y, 'path_dirt');
    }
  // paths: house door -> plaza, plaza -> smithy, plaza -> pond
  line(10, 9, 10, 15, 'path_dirt');
  line(10, 15, 21, 15, 'path_dirt', 2);
  line(32, 18, 36, 18, 'path_dirt', 2);
  line(26, 24, 26, 30, 'path_dirt');
  for (let x = 6; x <= 14; x++) set(x, 9, 'path_stone');
  for (let y = 15; y <= 19; y++) for (let x = 33; x <= 40; x++) set(x, y, 'path_stone');

  // The farmhouse (its door is the way to your own house)
  addObject(world, 'house', 8, 5);
  addObject(world, 'wardrobe', L.wardrobe.x, L.wardrobe.y);
  // The färdport arch, with the Yggdrasil shoot beside it
  addObject(world, 'fardport', L.arch.x, L.arch.y);
  addObject(world, 'yggdrasil', L.shoot.x, L.shoot.y);
  // a stone terrace under the arch, with a brazier on each side
  for (let y = L.arch.y - 1; y <= L.arch.y + 3; y++) for (let x = L.arch.x - 4; x <= L.arch.x + 8; x++) set(x, y, 'path_stone');
  addObject(world, 'saga_brazier', L.arch.x - 2, L.arch.y + 1);
  addObject(world, 'saga_brazier', L.arch.x + 4, L.arch.y + 1);
  // Kämpastenen beside Völvan Sigrun
  addObject(world, 'saga_stone', L.stone.x, L.stone.y);
  addObject(world, 'runestone', L.volva.x - 2, L.volva.y - 3, { variant: 1 });
  // Smedjan: a hut, an anvil, a fire
  const S = L.smith;
  addObject(world, 'house_small', S.x - 2, S.y - 5, { variant: 1 });
  addObject(world, 'saga_anvil', S.x + 1, S.y - 1);
  addObject(world, 'saga_brazier', S.x - 3, S.y - 1);
  addObject(world, 'barrel_stack', S.x + 3, S.y - 2);
  // the kennel: pick your first pet
  addObject(world, 'kennel', L.kennel.x, L.kennel.y);

  // Banners, lamps and benches
  for (const [dx, dy, v] of [[-6, -3, 0], [6, -3, 1], [-5, 4, 2], [5, 4, 0], [0, 7, 1]] as const) addObject(world, 'banner_pole', P.x + dx, P.y + dy, { variant: v });
  for (const [x, y] of [[21, 13], [20, 19], [32, 21], [23, 24], [10, 14], [15, 14], [36, 20], [26, 28]] as const) addObject(world, 'street_lamp', x, y);
  for (const [x, y] of [[24, 24], [28, 24], [35, 26]] as const) addObject(world, 'bench', x, y);
  addObject(world, 'hay_cart', 14, 18);
  addObject(world, 'barrel_stack', 8, 11);

  // Signs with pictures (variant = picture): arch, tree, home, wardrobe, anvil, scroll, paw
  const signs: [number, number, number][] = [
    [24, 14, 0], // the färdport
    [33, 14, 1], // the sagaträd
    [12, 10, 2], // home
    [9, 10, 3], // wardrobe
    [32, 16, 4], // Smedjan
    [20, 16, 5], // Völvan
    [19, 22, 6], // the kennel
  ];
  for (const [x, y, v] of signs) addObject(world, 'lobby_sign', x, y, { variant: v });

  // Trees in clumps and along the yard's edge; flowers, tufts and a few stones
  const clumps: [number, number][] = [[6, 18], [7, 27], [14, 29], [20, 30], [31, 6], [38, 7], [43, 14], [44, 22], [12, 23], [43, 31], [17, 8]];
  for (let y = L.y0; y <= L.y1; y++)
    for (let x = L.x0; x <= L.x1; x++) {
      if (T[tileIndex(world, x, y)] !== 'grass' || objectAt(world, x, y)) continue;
      const nearHouse = x >= 6 && x <= 14 && y >= 3 && y <= 10;
      const edge = Math.min(x - L.x0, L.x1 - x, y - L.y0, L.y1 - y);
      const clump = clumps.some(([a, b]) => Math.hypot(a - x, b - y) < 3.2) && rnd() < 0.55;
      if (!nearHouse && (edge <= 1 || clump)) addObject(world, rnd() < 0.4 ? 'tree_pine' : rnd() < 0.2 ? 'tree_apple' : 'tree', x, y);
      else if (rnd() < 0.06) addObject(world, 'grass_tuft', x, y, { variant: randInt(rnd, 0, 2) });
      else if (rnd() < 0.05) addObject(world, 'flower', x, y, { variant: randInt(rnd, 0, 3) });
      else if (rnd() < 0.012) addObject(world, 'rock_small', x, y);
    }

  // Forest all round the yard (the rest of the map): nobody can leave
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      if (inYard(x, y) || inInterior(x, y) || objectAt(world, x, y)) continue;
      const outside = Math.max(L.x0 - x, x - L.x1, L.y0 - y, y - L.y1);
      if (outside <= 11) addObject(world, rnd() < 0.45 ? 'tree_pine' : 'tree', x, y);
      else set(x, y, 'rock');
    }
  ensureInterior(world);
  ensureNpcSpots(world);
  return world;
}

/** Clears the tiles the lobby's villagers stand on (and one around) so they are reachable. Idempotent. */
export function ensureNpcSpots(world: WorldState): void {
  for (const n of Object.values(NPCS)) {
    if (n.area && n.area !== 'farm') continue;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = n.x + dx;
        const y = n.y + dy;
        if (!inBounds(world, x, y)) continue;
        const o = objectAt(world, x, y);
        const d = o ? objectDef(o.kind) : undefined;
        if (o && d && d.solid && !d.interact && !d.houses && o.kind !== 'house' && o.kind !== 'house_small') removeObject(world, o.id);
        if (world.terrain[tileIndex(world, x, y)] === 'water') world.terrain[tileIndex(world, x, y)] = 'sand';
      }
  }
}
