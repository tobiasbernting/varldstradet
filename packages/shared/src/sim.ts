// Authoritative world simulation. Pure functions over WorldState; no I/O.
// The server runs this; the client reuses movement for prediction.

import { ACHIEVEMENTS, ANIMALS, ITEMS, LOOT, NPCS, item, objectDef } from './data.ts';
import { MAX_HEARTS, } from './dungeon.ts';
import { BIOME_EMOJI, BIOME_NAMES, DISCOVERABLE, arrivalTile, areaCoords, generateArea, isBiome, placeName, } from './biomes.ts';
import { entranceFront, generateCave, isCaveKey, isUnderground, parseCaveKey, themeOfEntrance } from './caves.ts';
import { generateMoon, isMoonKey, } from './space.ts';
import { reachableFrom } from './worldgen.ts';
import { SWIM_SPEED_MUL, generateBath, isBathKey, isIndoorKey, villageOfBath } from './bath.ts';
import { driveVehicle, isVehicle, vehicleBlocks } from './city.ts';
import { DUNGEONS, VOLVA_ID, dungeonOfKey, isSagaKey, sagaItem } from './saga.ts';
import { generateSaga } from './sagamap.ts';
import { } from './explore.ts';
import { openFardport, openYggdrasil, tickRuns } from './runsim.ts';
import { HOUSE_FIXED, generateHome, houseAct, houseName, isGuestHere, placedExtra, standAct, tickHome, tickHouseDoor } from './house.ts';
import { homeKey, isHomeKey, ownerOfHome } from './homekeys.ts';
import { grantPet, petAnimalOf, syncPet, renamePet } from './petsim.ts';
import { ensureSagaPlaces, idleSaga, killXp, roamingDown, sagaAct, sagaRooted, tickSaga } from './sagasim.ts';
import { addItem, makeInventory, moveStack, quickStack, removeItem, sortInventory, takeFromSlot } from './inventory.ts';
import { SPAWN, addObject, inBounds, isHouseDoor, mapH, mapW, objectAt, removeObject, tileIndex } from './map.ts';
import { randInt } from './rng.ts';
import { isValidPainting } from './paint.ts';
import { ACHIEVEMENT_TEXT, DEFAULT_ANIMAL_NAMES, HOUSE_T, SPECIES_NAMES, T, fmt, itemName } from './sv.ts';
import type { Change, SlotRef } from './protocol.ts';
import { tickWeather } from './weather.ts';
import { WALL_TERRAIN, } from './types.ts';
import type {
  AnimalState,
  Appearance,
  ClothingSlot,
  
  DropState,
  Facing,
  Inventory,
  ItemStack,
  NpcDef,
  NpcState,
  PlayerState,
  MapSize,
  
  Season,
  
  WorldObject,
  WorldState,
} from './types.ts';
import {
  
  HOTBAR_SIZE,
  DAY_LENGTH_MS,
  INVENTORY_SIZE,
  
  PLAYER_SPEED,
  START_COINS,
  TILE,
  RIDE_SPEED_MUL,
  RUN_SPEED_MUL,
  
  key,
} from './types.ts';

export interface SimCtx {
  season: Season;
  rnd: () => number;
  /** Wall clock, ms since epoch (for emote expiry). */
  now: number;
  /** The highest run level (0..4) a character may play; the parent page sets it per character. Left out: all levels. */
  levelCap?: (playerId: string) => number;
}

export const PLAYER_HALF_W = 5;
export const PLAYER_HALF_H = 3;
export const ANIMAL_HALF_W = 5;
export const ANIMAL_HALF_H = 3;
export const PICKUP_RADIUS = 12;
export const EMOTE_MS = 2500;
/** How many tiles away from the player's own tile an action may reach (Chebyshev). */
export const REACH = 1;

export const tileOf = (px: number): number => Math.floor(px / TILE);

// ---------------------------------------------------------------------------
// Collision & movement
// ---------------------------------------------------------------------------

/** Current villager state, created from the routine on first use. */
export function npcState(world: WorldState, id: string): NpcState {
  if (!world.npcs) world.npcs = {};
  let st = world.npcs[id];
  if (!st) {
    const def = NPCS[id]!;
    const wp = routineTarget(def, world.timeMs);
    st = { x: wp.x * TILE + TILE / 2, y: wp.y * TILE + TILE / 2, facing: 'down', moving: false, stuckMs: 0 };
    world.npcs[id] = st;
  }
  return st;
}

export const routineTarget = (def: { routine: { at: number; x: number; y: number }[]; x: number; y: number }, timeMs: number) => {
  const f = timeMs / DAY_LENGTH_MS;
  let best = { x: def.x, y: def.y };
  for (const w of def.routine) if (f >= w.at) best = w;
  return best;
};

export const isFarm = (world: WorldState): boolean => !world.area;

/** Villagers who live on this map. */
export const npcsIn = (world: WorldState): NpcDef[] => (world.area === 'dungeon' ? [] : Object.values(NPCS).filter((n) => (n.area ?? 'farm') === (world.area ?? 'farm')));

export const npcAt = (world: WorldState, tx: number, ty: number) =>
  npcsIn(world).find((n) => {
    const st = npcState(world, n.id);
    return tileOf(st.x) === tx && tileOf(st.y) === ty;
  });

/** Hit points and drops for anything that can be fought: cave monsters and untamed predators. */
export const combatDef = (a: AnimalState): { hp: number; boss?: boolean; drops: { item: string; min: number; max: number; chance: number }[] } | undefined => {
  const def = ANIMALS[a.species];
  if (!def) return undefined;
  if (def.mob) return def.mob;
  if (def.predator && !a.owner) return { hp: def.predator.hp, drops: [{ item: 'fur', min: 1, max: 1, chance: 1 }] };
  return undefined;
};
/** Monsters and wild predators that chase and bite players. */
export const isHostile = (a: AnimalState): boolean => !!combatDef(a);
/** Pets follow their owner: dogs and cats, and wild animals caught with a lasso. */
export const isPetAnimal = (a: AnimalState): boolean => {
  const def = ANIMALS[a.species];
  return !!def && (!!def.pet || (!!def.wild && !!a.owner));
};

/** Animals that listen to their owner's "stay" and whistle: pets and the owner's horses. */
export const isCallable = (a: AnimalState): boolean => !!a.owner && !a.petKind && !isVehicle(a) && (isPetAnimal(a) || isMount(a));
/** Horses, and Sleipner and Gullinbursti from the dungeons. */
export const isMount = (a: AnimalState): boolean => a.species === 'horse' || !!ANIMALS[a.species]?.mount;

/** Cars, mopeds (and city traffic): parked where they stand, driven like a horse. */

/** Maps you may drive or ride in: any overworld map, not the cave, the bath house or indoors. */
const canRideIn = (world: WorldState, tx: number, ty: number): boolean =>
  !isUnderground(world.area) && !isIndoorKey(world.area) && !isSagaKey(world.area);

/** Speed multiplier while riding or driving: horses are steady, vehicles love roads and hate mud. */
export function rideSpeedMul(world: WorldState, p: { x: number; y: number; riding?: number }): number {
  if (p.riding === undefined) return 1;
  const a = world.animals[p.riding];
  if (!a) return 1;
  const v = ANIMALS[a.species]?.vehicle;
  if (!v) return ANIMALS[a.species]?.mount?.speed ?? RIDE_SPEED_MUL;
  const t = world.terrain[tileIndex(world, tileOf(p.x), tileOf(p.y))] as string | undefined;
  const ground = t === 'road' || t === 'crossing' ? 1.3 : t === 'soil' || t === 'soil_wet' || t === 'sand' || t === 'gravel' ? 0.7 : 1;
  return (v.ride ?? RIDE_SPEED_MUL) * ground;
}

export function isSolidForPlayer(world: WorldState, tx: number, ty: number): boolean {
  if (!inBounds(world, tx, ty)) return true;
  if (WALL_TERRAIN.has(world.terrain[tileIndex(world, tx, ty)]!)) return true;
  if (npcAt(world, tx, ty)) return true;
  if (vehicleBlocks(world, tx, ty)) return true;
  if (world.area === 'dungeon') {
    for (const a of Object.values(world.animals)) if (tileOf(a.x) === tx && tileOf(a.y) === ty) return true;
  } else if (isFarm(world) && isHouseDoor(tx, ty)) return false;
  const obj = objectAt(world, tx, ty);
  return !!obj && objectDef(obj.kind).solid;
}

export function isSolidForAnimal(world: WorldState, tx: number, ty: number): boolean {
  if (!inBounds(world, tx, ty)) return true;
  const t = world.terrain[tileIndex(world, tx, ty)]!;
  if (WALL_TERRAIN.has(t) || t === 'pool' || t === 'soil' || t === 'soil_wet') return true; // animals stay off the fields (and out of the pool)
  if (world.crops[key(tx, ty)]) return true;
  if (npcAt(world, tx, ty) || (isFarm(world) && isHouseDoor(tx, ty))) return true;
  const obj = objectAt(world, tx, ty);
  if (!obj) return false;
  const def = objectDef(obj.kind);
  return def.solid || obj.kind === 'gate' || obj.kind === 'door' || obj.kind === 'door_out';
}

const boxBlocked = (
  solid: (tx: number, ty: number) => boolean,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
): boolean => {
  const x0 = tileOf(cx - hw);
  const x1 = tileOf(cx + hw - 0.01);
  const y0 = tileOf(cy - hh);
  const y1 = tileOf(cy + hh - 0.01);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) return true;
  return false;
};

/** Moves a box from (x,y) towards (nx,ny), sliding along solids and staying inside the map `m`. Returns the reachable position. */
export function resolveMove(
  solid: (tx: number, ty: number) => boolean,
  x: number,
  y: number,
  nx: number,
  ny: number,
  hw = PLAYER_HALF_W,
  hh = PLAYER_HALF_H,
  m: MapSize = {},
): { x: number; y: number } {
  const clampX = (v: number) => Math.min(mapW(m) * TILE - hw, Math.max(hw, v));
  const clampY = (v: number) => Math.min(mapH(m) * TILE - hh, Math.max(hh, v));
  let rx = clampX(nx);
  let ry = y;
  if (boxBlocked(solid, rx, ry, hw, hh)) rx = x;
  ry = clampY(ny);
  if (boxBlocked(solid, rx, ry, hw, hh)) ry = y;
  return { x: rx, y: ry };
}

/** One step of player input (used by the client for prediction and by tests). */
export function stepPlayer(
  world: WorldState,
  p: { x: number; y: number; facing: Facing; moving: boolean },
  dx: number,
  dy: number,
  dtMs: number,
  speedMul = 1,
): void {
  const len = Math.hypot(dx, dy);
  if (len < 0.01) {
    p.moving = false;
    return;
  }
  const ux = dx / len;
  const uy = dy / len;
  if (inPool(world, p)) speedMul *= SWIM_SPEED_MUL;
  const dist = (PLAYER_SPEED * speedMul * dtMs) / 1000;
  const r = resolveMove((tx, ty) => isSolidForPlayer(world, tx, ty), p.x, p.y, p.x + ux * dist, p.y + uy * dist, PLAYER_HALF_W, PLAYER_HALF_H, world);
  p.moving = r.x !== p.x || r.y !== p.y;
  p.x = r.x;
  p.y = r.y;
  p.facing = Math.abs(ux) > Math.abs(uy) ? (ux > 0 ? 'right' : 'left') : uy > 0 ? 'down' : 'up';
}

/** Standing in the bath house pool? */
export const inPool = (world: WorldState, p: { x: number; y: number }): boolean => world.terrain[tileIndex(world, tileOf(p.x), tileOf(p.y))] === 'pool';

/** The tile in front of the player (for the context action button). */
export function facingTile(p: { x: number; y: number; facing: Facing }): { tx: number; ty: number } {
  const tx = tileOf(p.x);
  const ty = tileOf(p.y);
  switch (p.facing) {
    case 'up':
      return { tx, ty: ty - 1 };
    case 'down':
      return { tx, ty: ty + 1 };
    case 'left':
      return { tx: tx - 1, ty };
    case 'right':
      return { tx: tx + 1, ty };
    default:
      return { tx, ty: ty + 1 };
  }
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export const STARTER_WARDROBE = ['shirt_red', 'shirt_blue', 'shirt_green', 'shirt_yellow', 'pants_blue', 'pants_brown', 'shoes_boots'];

export function createPlayer(world: WorldState, name: string, appearance: Appearance, shirt = 'shirt_blue'): PlayerState {
  const id = `p${world.nextId++}`;
  const inventory = makeInventory(INVENTORY_SIZE);
  const p: PlayerState = {
    id,
    name: name.trim().slice(0, 16) || 'Spelare',
    appearance,
    outfit: { shirt: STARTER_WARDROBE.includes(shirt) ? shirt : 'shirt_blue', pants: 'pants_blue', shoes: 'shoes_boots' },
    wardrobe: [...STARTER_WARDROBE],
    x: SPAWN.x * TILE + TILE / 2,
    y: SPAWN.y * TILE + TILE / 2,
    facing: 'down',
    moving: false,
    coins: START_COINS,
    inventory,
    selected: 0,
    online: false,
    orders: [],
    questsDone: [],
    stars: 0,
    stats: {},
    achievements: [],
    area: 'farm',
    visited: ['farm'],
    hearts: MAX_HEARTS,
  };
  world.players[id] = p;
  return p;
}

export const heldItem = (p: PlayerState): ItemStack | null => p.inventory[p.selected] ?? null;

export const toast = (to: string | null, text: string): Change => ({ t: 'toast', to, text });
export const playerChange = (p: PlayerState): Change => ({ t: 'player', id: p.id, player: p });
export const fx = (tx: number, ty: number, kind: 'heart' | 'sparkle' | 'water' | 'chop' | 'poof' | 'coin' | 'hit' | 'boom' | 'splash' | 'honk'): Change => ({
  t: 'fx',
  x: tx * TILE + TILE / 2,
  y: ty * TILE + TILE / 2,
  kind,
});

/** Gives items to a player; whatever does not fit lands on the ground at the player's feet. */
export function giveItems(world: WorldState, p: PlayerState, id: string, count: number, out: Change[]): void {
  if (count <= 0) return;
  const left = addItem(p.inventory, id, count);
  if (left > 0) {
    const d = spawnDrop(world, id, left, p.x, p.y);
    out.push({ t: 'drop', id: d.id, drop: d });
    out.push(toast(p.id, T.inventoryFull));
  }
}

/** Gives a single stack that must not merge (a painted tavla); lands on the ground if there is no free slot. */
export function giveStack(world: WorldState, p: PlayerState, stack: ItemStack, out: Change[]): void {
  const free = p.inventory.indexOf(null);
  if (free >= 0) {
    p.inventory[free] = { ...stack };
    return;
  }
  const d = spawnDrop(world, stack.item, stack.count, p.x, p.y);
  if (stack.data !== undefined) d.data = stack.data;
  out.push({ t: 'drop', id: d.id, drop: d });
  out.push(toast(p.id, T.inventoryFull));
}

export function spawnDrop(world: WorldState, id: string, count: number, x: number, y: number, ignore?: string): DropState {
  const d: DropState = { id: world.nextId++, item: id, count, x, y };
  if (ignore) d.ignore = { player: ignore, ticks: 60 };
  world.drops[d.id] = d;
  return d;
}

// ---------------------------------------------------------------------------
// Gårdsbok: stats and achievements
// ---------------------------------------------------------------------------

/** Adds to a lifetime counter and unlocks any achievement it completes. */
export function bump(p: PlayerState, stat: string, n: number, out: Change[]): void {
  if (!p.stats) p.stats = {};
  if (!p.achievements) p.achievements = [];
  p.stats[stat] = (p.stats[stat] ?? 0) + n;
  for (const a of ACHIEVEMENTS) {
    if (a.stat !== stat || p.achievements.includes(a.id) || (p.stats[stat] ?? 0) < a.goal) continue;
    p.achievements.push(a.id);
    p.stars += a.stars;
    out.push(toast(p.id, fmt(T.achievement, { title: ACHIEVEMENT_TEXT[a.id]?.title ?? a.id, stars: a.stars })), fx(tileOf(p.x), tileOf(p.y), 'sparkle'), fx(tileOf(p.x), tileOf(p.y), 'coin'));
  }
}

// ---------------------------------------------------------------------------
// Actions on a tile
// ---------------------------------------------------------------------------

export const animalAt = (world: WorldState, tx: number, ty: number): AnimalState | undefined => {
  for (const a of Object.values(world.animals)) if (tileOf(a.x) === tx && tileOf(a.y) === ty) return a;
  return undefined;
};

export const animalDisplayName = (a: AnimalState): string => a.name || SPECIES_NAMES[a.species] || a.species;

export function performAction(world: WorldState, playerId: string, tx: number, ty: number, ctx: SimCtx): Change[] {
  const p = world.players[playerId];
  const out: Change[] = [];
  if (!p || !inBounds(world, tx, ty)) return out;
  const ptx = tileOf(p.x);
  const pty = tileOf(p.y);
  if (Math.abs(tx - ptx) > REACH || Math.abs(ty - pty) > REACH) return out;
  if (p.riding !== undefined) {
    dismount(world, p, out);
    return out;
  }
  if (p.sleeping) {
    wakeUp(p, out, true);
    return out;
  }
  if (isSagaKey(world.area)) return sagaAct(world, p, tx, ty, ctx);
  // in a house a visitor only looks, and the owner works on the floor
  const home = houseAct(world, p, tx, ty);
  if (home) return home;
  if (isHomeKey(world.area)) return homeFloorAct(world, p, tx, ty, ctx, out);
  if (isFarm(world)) return lobbyAct(world, p, tx, ty, ctx, out);
  // (the old wild maps, caves and villages cannot be reached any more: nothing to do on them)
  return out;
}

/** In your own house: put a placeable piece down on the floor, use the gear stand. (Picking a piece up is the house message, in house.ts.) */
function homeFloorAct(world: WorldState, p: PlayerState, tx: number, ty: number, ctx: SimCtx, out: Change[]): Change[] {
  const held = heldItem(p);
  const obj = objectAt(world, tx, ty);
  if (obj) {
    if (objectDef(obj.kind).interact === 'stand') standAct(world, p, obj, held, out);
    return out;
  }
  const def = held ? item(held.item) : null;
  if (!held || !def || def.category !== 'placeable' || !def.places) return out;
  if (footprintBlocked(world, tx, ty, def.places)) return out;
  const extra: Partial<WorldObject> = { by: p.id };
  Object.assign(extra, placedExtra(def.places, held.data));
  const placed = addObject(world, def.places, tx, ty, extra);
  if (!placed) return [toast(p.id, T.cantPlaceHere)];
  takeFromSlot(p.inventory, p.selected, 1);
  out.push({ t: 'object', id: placed.id, obj: placed }, fx(tx, ty, 'poof'), playerChange(p));
  void ctx;
  return out;
}

/** Is a player or a pet standing where a piece would go? */
function footprintBlocked(world: WorldState, tx: number, ty: number, kind: string): boolean {
  const d = objectDef(kind);
  const inside = (px: number, py: number) => px + 5 > tx * TILE && px - 5 < (tx + d.w) * TILE && py + 3 > ty * TILE && py - 3 < (ty + d.h) * TILE;
  for (const q of Object.values(world.players)) if (q.online && q.area === world.area && inside(q.x, q.y)) return true;
  for (const a of Object.values(world.animals)) if (inside(a.x, a.y)) return true;
  return false;
}

/** What can be used in the lobby: people, the wardrobe, the arch, the sagaträd, Kämpastenen, the kennel and your own pets. Nothing can be changed. */
const LOBBY_USES = new Set(['wardrobe', 'fardport', 'yggdrasil', 'sagaclass', 'kennel']);

function lobbyAct(world: WorldState, p: PlayerState, tx: number, ty: number, ctx: SimCtx, out: Change[]): Change[] {
  const npc = npcAt(world, tx, ty);
  if (npc) {
    out.push({ t: 'open', to: p.id, ui: npc.id === VOLVA_ID ? 'saga' : 'npc', npc: npc.id });
    return out;
  }
  const held = heldItem(p);
  const kind = held ? sagaItem(held.item)?.kind : undefined;
  // a pet or mount from the dungeons: out of the bag and by your side
  if (held && (kind === 'pet' || kind === 'mount') && !objectAt(world, tx, ty) && !animalAt(world, tx, ty)) {
    summonFromBag(world, p, held.item, out);
    return out;
  }
  const animal = animalAt(world, tx, ty);
  if (animal && animal.owner === p.id && (isPetAnimal(animal) || isMount(animal))) {
    actOnAnimal(world, p, animal, held, ctx, out);
    return out;
  }
  const obj = objectAt(world, tx, ty);
  if (obj && LOBBY_USES.has(objectDef(obj.kind).interact ?? '')) interactObject(world, p, obj, held, ctx, out);
  return out;
}

function actOnAnimal(world: WorldState, p: PlayerState, a: AnimalState, held: ItemStack | null, ctx: SimCtx, out: Change[]): void {
  const atx = tileOf(a.x);
  const aty = tileOf(a.y);
  const name = animalDisplayName(a);
  const heldDef = held ? item(held.item) : null;
  if (a.route !== undefined) {
    // city traffic: you cannot take the bus driver's seat, but you may honk
    out.push(fx(atx, aty, 'honk'), toast(p.id, fmt(T.vehicleHonk, { name })));
    return;
  }
  if (riderOf(world, a)) {
    out.push(toast(p.id, fmt(T.horseBusy, { name })));
    return;
  }
  if (isVehicle(a)) {
    mount(world, p, a, out);
    return;
  }
  if (held?.item === 'hay' && !ANIMALS[a.species]?.wild) {
    if (a.fed) {
      out.push(toast(p.id, fmt(T.alreadyFed, { name })));
      return;
    }
    removeItem(p.inventory, 'hay', 1);
    a.fed = true;
    bump(p, 'fed', 1, out);
    out.push(fx(atx, aty, 'heart'), toast(p.id, fmt(T.fed, { name })), playerChange(p), { t: 'animal', id: a.id, animal: a });
    return;
  }
  if (heldDef?.tool === 'brush') {
    if (!a.brushed) {
      a.brushed = true;
      out.push(fx(atx, aty, 'sparkle'), toast(p.id, fmt(T.brushed, { name })));
    } else out.push(fx(atx, aty, 'heart'));
    out.push({ t: 'animal', id: a.id, animal: a });
    return;
  }
  if (a.hasProduct) {
    const def = ANIMALS[a.species];
    let product = def?.product;
    if (product === 'egg' && ctx.season === 'pask') product = 'egg_pask';
    if (product) {
      a.hasProduct = false;
      giveItems(world, p, product, 1, out);
      bump(p, 'product', 1, out);
      if (product === 'truffle') bump(p, 'truffle', 1, out);
      out.push(fx(atx, aty, 'sparkle'), toast(p.id, fmt(T.collected, { item: itemName(product), name })), playerChange(p), {
        t: 'animal',
        id: a.id,
        animal: a,
      });
      return;
    }
  }
  // Pet
  const wild = !!ANIMALS[a.species]?.wild && !a.owner;
  if (wild && !a.petted) bump(p, 'wildpet', 1, out);
  if (wild) {
    a.petted = true;
    out.push(fx(atx, aty, 'heart'), toast(p.id, fmt(T.wildPetted, { name })), { t: 'animal', id: a.id, animal: a }, playerChange(p));
    return;
  }
  if (isMount(a) && a.petted && a.named) {
    mount(world, p, a, out);
    return;
  }
  a.petted = true;
  out.push(fx(atx, aty, 'heart'), toast(p.id, fmt(T.petted, { name })), { t: 'animal', id: a.id, animal: a });
  if (!a.named) out.push({ t: 'open', to: p.id, ui: 'nameAnimal', id: a.id });
}

// ---------------------------------------------------------------------------
// Riding
// ---------------------------------------------------------------------------

/** The player currently riding this animal, if any. */
export function riderOf(world: WorldState, a: AnimalState): PlayerState | undefined {
  for (const p of Object.values(world.players)) if (p.riding === a.id) return p;
  return undefined;
}

function mount(world: WorldState, p: PlayerState, a: AnimalState, out: Change[]): void {
  const name = animalDisplayName(a);
  if (isBaby(a)) {
    out.push(toast(p.id, fmt(T.horseTooYoung, { name })));
    return;
  }
  if (a.owner && a.owner !== p.id) {
    out.push(toast(p.id, fmt(T.notYourHorse, { name, owner: farmOf(world).players[a.owner]?.name ?? '?' })));
    return;
  }
  const vehicle = isVehicle(a);
  const anywhere = vehicle || !!ANIMALS[a.species]?.mount;
  if (anywhere ? !canRideIn(world, tileOf(p.x), tileOf(p.y)) : !isFarm(world)) {
    out.push(toast(p.id, T.notNow));
    return;
  }
  p.riding = a.id;
  delete p.fishing;
  delete a.stay;
  a.x = p.x;
  a.y = p.y;
  a.facing = p.facing;
  a.moving = false;
  delete a.tx;
  delete a.ty;
  bump(p, vehicle ? 'drive' : 'ride', 1, out);
  out.push(toast(p.id, fmt(vehicle ? T.drive : T.mounted, { name })), fx(tileOf(p.x), tileOf(p.y), 'sparkle'), playerChange(p), { t: 'animal', id: a.id, animal: a });
}

/** Gets off the horse; the horse stays just behind the player (or on their tile). */
export function dismount(world: WorldState, p: PlayerState, out: Change[]): void {
  const here = areaOf(farmOf(world), p);
  const a = p.riding !== undefined ? here.animals[p.riding] : undefined;
  delete p.riding;
  out.push(playerChange(p));
  if (!a) return;
  const d = DIR_VEC[p.facing] ?? { dx: 0, dy: 1 };
  const btx = tileOf(p.x) - d.dx;
  const bty = tileOf(p.y) - d.dy;
  const behindFree = inBounds(here, btx, bty) && !isSolidForAnimal(here, btx, bty);
  a.x = behindFree ? btx * TILE + TILE / 2 : p.x;
  a.y = behindFree ? bty * TILE + TILE / 2 : p.y;
  a.moving = false;
  a.waitMs = 1500;
  delete a.tx;
  delete a.ty;
  const change: Change = { t: 'animal', id: a.id, animal: a };
  if (!isFarm(here)) change.area = here.area;
  out.push(toast(p.id, fmt(isVehicle(a) ? T.parked : T.dismounted, { name: animalDisplayName(a) })), change);
}

/** Beep beep: a little horn fx for everyone nearby (only while driving). */
export function honk(world: WorldState, playerId: string): Change[] {
  const p = world.players[playerId];
  if (!p || p.riding === undefined) return [];
  const a = world.animals[p.riding];
  if (!a || !isVehicle(a)) return [];
  return [fx(tileOf(p.x), tileOf(p.y), 'honk')];
}

/** "Ann, Bo och Cecilia" */
const joinNames = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${T.and} ${names[names.length - 1]}`);

/**
 * 2D game: tell your pets and horses to stay where they are, or whistle so they come back and follow you.
 * Only the animals on your map can hear "stay"; a whistle reaches pets left on any map (not in the cave).
 */
export function callPets(world: WorldState, playerId: string, cmd: 'stay' | 'come', ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || (cmd !== 'stay' && cmd !== 'come')) return [];
  const out: Change[] = [];
  if (cmd === 'come') p.emote = { id: 'vissla', until: ctx.now + EMOTE_MS };
  if (p.area === 'dungeon') {
    out.push(toast(p.id, cmd === 'come' ? T.petsCantHear : T.noPetsHere));
    return out;
  }
  const here = areaOf(farm, p);
  const hereKey = p.area ?? 'farm';
  const near: string[] = [];
  const waiting: string[] = [];
  const maps = [farm, ...Object.values(farm.areas ?? {})];
  for (const m of maps) {
    const mk = m.area ?? 'farm';
    for (const a of Object.values(m.animals)) {
      if (a.owner !== p.id || !isCallable(a) || riderOf(m, a)) continue;
      const tag = (c: Change): Change => {
        if (mk !== 'farm' && (c.t === 'animal' || c.t === 'fx')) c.area = mk;
        return c;
      };
      const name = animalDisplayName(a);
      if (cmd === 'stay') {
        if (mk !== hereKey) continue;
        a.stay = { x: a.x, y: a.y };
        delete a.follow;
        delete a.tx;
        delete a.ty;
        a.moving = false;
        a.waitMs = 2000;
        near.push(name);
        out.push(tag({ t: 'animal', id: a.id, animal: a }), tag(fx(tileOf(a.x), tileOf(a.y), 'heart')));
        continue;
      }
      delete a.stay;
      if (a.species === 'horse') {
        // horses stay on the farm: one whistled for elsewhere waits there and follows you once you are home
        a.follow = true;
        out.push(tag({ t: 'animal', id: a.id, animal: a }));
        if (mk === hereKey) near.push(name);
        else waiting.push(name);
        continue;
      }
      if (mk !== hereKey) moveAnimalAlong(m, here, hereKey, a, p, out);
      else out.push(tag({ t: 'animal', id: a.id, animal: a }));
      near.push(name);
    }
  }
  if (near.length) out.push(toast(p.id, fmt(cmd === 'stay' ? T.petsStay : T.petsCome, { names: joinNames(near) })));
  if (waiting.length) out.push(toast(p.id, fmt(T.horseWaitsHome, { names: joinNames(waiting) })));
  if (!near.length && !waiting.length) out.push(toast(p.id, cmd === 'stay' ? T.noPetsHere : T.noPets));
  out.push(playerChange(p));
  return out;
}

const DIR_VEC: Record<Facing, { dx: number; dy: number }> = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };

/** Ridden horses sit under their rider; riders that vanished free their horse. */
function tickRiding(world: WorldState, out: Change[]): void {
  const here = world.area ?? 'farm';
  for (const p of Object.values(world.players)) {
    if (p.riding === undefined) continue;
    const a = world.animals[p.riding];
    if (!a || !p.online || p.area !== here || !canRideIn(world, tileOf(p.x), tileOf(p.y))) {
      delete p.riding;
      out.push(playerChange(p));
      continue;
    }
    if (isVehicle(a)) {
      // odometer: whole tiles driven count towards Långfärd
      if (!p.stats) p.stats = {};
      const px = (p.stats.drive_px ?? 0) + Math.hypot(p.x - a.x, p.y - (a.y + 1));
      const tiles = Math.floor(px / TILE);
      p.stats.drive_px = px - tiles * TILE;
      if (tiles > 0) bump(p, 'drive_tiles', tiles, out);
    }
    a.x = p.x;
    a.y = p.y + 1;
    a.facing = p.facing;
    a.moving = p.moving;
    delete a.tx;
    delete a.ty;
  }
}

function interactObject(world: WorldState, p: PlayerState, obj: WorldObject, _held: ItemStack | null, _ctx: SimCtx, out: Change[]): void {
  switch (objectDef(obj.kind).interact) {
    case 'wardrobe':
      out.push({ t: 'open', to: p.id, ui: 'looks' });
      return;
    case 'fardport':
      out.push(...openFardport(world, p));
      return;
    case 'yggdrasil':
      out.push(...openYggdrasil(world, p));
      return;
    case 'sagaclass':
      out.push({ t: 'open', to: p.id, ui: 'sagaClass', id: obj.id });
      return;
    case 'stand':
      standAct(world, p, obj, _held, out);
      return;
    case 'kennel':
      out.push({ t: 'open', to: p.id, ui: 'kennel', id: obj.id });
      return;
  }
}

// ---------------------------------------------------------------------------
// Inventory / economy / misc messages
// ---------------------------------------------------------------------------

const chestNear = (world: WorldState, p: PlayerState, chestId: number): WorldObject | null => {
  const obj = world.objects[chestId];
  if (!obj || !obj.items) return null;
  const def = objectDef(obj.kind);
  if (def.interact !== 'chest') return null;
  const dx = Math.abs(obj.x + 0.5 - p.x / TILE);
  const dy = Math.abs(obj.y + 0.5 - p.y / TILE);
  return dx <= REACH + 1.5 && dy <= REACH + 1.5 ? obj : null;
};

export function swapSlots(world: WorldState, playerId: string, a: SlotRef, b: SlotRef): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  const out: Change[] = [];
  const resolve = (r: SlotRef): Inventory | null => {
    if (r.chest === undefined) return p.inventory;
    const c = chestNear(world, p, r.chest);
    return c?.items ?? null;
  };
  const ia = resolve(a);
  const ib = resolve(b);
  if (!ia || !ib) return out;
  moveStack(ia, a.slot, ib, b.slot);
  out.push(playerChange(p));
  if (a.chest !== undefined) out.push({ t: 'object', id: a.chest, obj: world.objects[a.chest]! });
  if (b.chest !== undefined && b.chest !== a.chest) out.push({ t: 'object', id: b.chest, obj: world.objects[b.chest]! });
  return out;
}

/** Cheap structural fingerprint of an inventory, to tell whether a sort changed anything. */
const inventoryKey = (inv: Inventory): string =>
  JSON.stringify(inv.map((s) => (s ? [s.item, s.count, s.data ?? null, s.charges ?? null] : null)));

/** Sorts the backpack (slots 8..31, hotbar untouched) or, with a chestId in reach, that chest. */
export function sortSlots(world: WorldState, playerId: string, chestId?: number): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  if (chestId === undefined) {
    const before = inventoryKey(p.inventory);
    const heldSlot = p.selected;
    const held = p.inventory[heldSlot] ?? null;
    sortInventory(p.inventory, HOTBAR_SIZE, INVENTORY_SIZE);
    if (heldSlot >= HOTBAR_SIZE) {
      // The held backpack stack moved: follow it (same object, else same item, else slot 0).
      let at = held ? p.inventory.indexOf(held, HOTBAR_SIZE) : -1;
      if (at < 0 && held) at = p.inventory.findIndex((s, i) => i >= HOTBAR_SIZE && s?.item === held.item);
      p.selected = at >= 0 ? at : 0;
    }
    if (inventoryKey(p.inventory) === before) return [toast(p.id, T.sorted)];
    return [playerChange(p), toast(p.id, T.sorted)];
  }
  const c = chestNear(world, p, chestId);
  if (!c?.items) return [];
  const before = inventoryKey(c.items);
  sortInventory(c.items);
  if (inventoryKey(c.items) === before) return [toast(p.id, T.sorted)];
  return [{ t: 'object', id: chestId, obj: c }, toast(p.id, T.sorted)];
}

/** Moves backpack items (slots 8..31, except the held one) that already exist in the chest into it. */
export function quickStackToChest(world: WorldState, playerId: string, chestId: number): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  const c = chestNear(world, p, chestId);
  if (!c?.items) return [];
  const n = quickStack(p.inventory, HOTBAR_SIZE, INVENTORY_SIZE, c.items, p.selected);
  if (n <= 0) return [toast(p.id, T.nothingToStack)];
  const text = n === 1 ? T.quickStackedOne : fmt(T.quickStacked, { n });
  return [{ t: 'object', id: chestId, obj: c }, playerChange(p), toast(p.id, text)];
}

export function selectSlot(world: WorldState, playerId: string, slot: number): Change[] {
  const p = world.players[playerId];
  if (!p || slot < 0 || slot >= INVENTORY_SIZE) return [];
  p.selected = slot;
  return [];
}

export function equip(world: WorldState, playerId: string, slot: ClothingSlot, id: string | null): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  if (id === null) {
    if (slot === 'hat') delete p.outfit.hat;
    else return []; // shirts, pants and shoes always stay on
  } else {
    const d = ITEMS[id];
    if (!d?.clothing || d.clothing.slot !== slot || !p.wardrobe.includes(id)) return [];
    p.outfit[slot] = id;
  }
  return [playerChange(p)];
}

export function emote(world: WorldState, playerId: string, id: string, ctx: SimCtx): Change[] {
  const p = world.players[playerId];
  if (!p || !T.emotes.includes(id)) return [];
  p.emote = { id, until: ctx.now + EMOTE_MS };
  return [];
}

/** Turns one paper into a painted tavla (the drawing screen's "Klar"). */
export function paint(world: WorldState, playerId: string, pixels: string): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  if (!isValidPainting(pixels)) return [toast(p.id, T.paintEmpty)];
  if (!removeItem(p.inventory, 'paper', 1)) return [toast(p.id, T.notNow)];
  const out: Change[] = [];
  giveStack(world, p, { item: 'painting', count: 1, data: pixels }, out);
  bump(p, 'paint', 1, out);
  out.push(fx(tileOf(p.x), tileOf(p.y), 'sparkle'), toast(p.id, T.paintDone), playerChange(p));
  return out;
}

export function nameAnimal(world: WorldState, playerId: string, id: number, name: string): Change[] {
  const a = world.animals[id];
  const p = world.players[playerId];
  if (!a || !p || a.owner !== p.id) return [];
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 14);
  if (!clean) return [];
  const old = animalDisplayName(a);
  a.name = clean;
  a.named = true;
  renamePet(p, a, clean);
  return [{ t: 'animal', id, animal: a }, toast(null, fmt(T.renamed, { name: old, newName: clean }))];
}

export function setOnline(world: WorldState, playerId: string, online: boolean): Change[] {
  const p = world.players[playerId];
  if (!p) return [];
  p.online = online;
  p.moving = false;
  const out = [playerChange(p)];
  syncPet(world, p, out); // the pet is with its owner while they are in the game, and nowhere else
  return out;
}

/**
 * A player's allowance for `applyMove` (server only, not saved): `credit` pixels of walking that have built up since
 * the last accepted position, `x`/`y`/`t` that position and its time. If the player is somewhere else than `x`/`y`
 * (a warp, a travel, a bus, a respawn: the server moved them) the allowance starts over.
 */
const moveCredit = new WeakMap<PlayerState, { x: number; y: number; t: number; credit: number }>();
/** How much walking a player may save up (seconds at top speed): a stall and a burst of packets, never a teleport. */
export const MOVE_CREDIT_S = 0.5;
/** Room on the top speed for the server's clock against the client's (20 messages a second, jitter, a boost that just ended). */
export const MOVE_SLACK = 1.15;

/** The fastest this player can legitimately go, in pixels a second: the mount's speed, or running, times the boost. */
export function maxPlayerSpeed(world: WorldState, p: PlayerState, now: number): number {
  const base = p.riding !== undefined ? Math.max(1, rideSpeedMul(world, p), RUN_SPEED_MUL) : RUN_SPEED_MUL;
  // (a boost that ended a second ago may still be in the client's step: the snapshot has not reached it yet)
  const boost = p.boostUntil !== undefined && p.boostUntil + 1000 > now ? BOOST_SPEED_MUL : 1;
  return PLAYER_SPEED * base * boost * MOVE_SLACK;
}

/**
 * The client's walk: it predicts its own steps and says where it stands. The server follows it, but never farther than
 * the player could walk since the last message (`now`, in ms; leave it out to take any distance, as the tests'
 * bots do): top speed times the time that passed, with `MOVE_CREDIT_S` saved up. A normal or running player is never
 * pulled back; a teleport is cut to what the legs allow.
 */
export function applyMove(world: WorldState, playerId: string, x: number, y: number, facing: Facing, moving: boolean, now?: number): void {
  const p = world.players[playerId];
  if (!p || now === undefined) {
    applyMoveInner(world, playerId, x, y, facing, moving);
    return;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const top = maxPlayerSpeed(world, p, now);
  let rec = moveCredit.get(p);
  if (!rec || rec.x !== p.x || rec.y !== p.y) rec = { x: p.x, y: p.y, t: now, credit: top * MOVE_CREDIT_S };
  else rec.credit = Math.min(top * MOVE_CREDIT_S, rec.credit + (top * Math.max(0, now - rec.t)) / 1000);
  rec.t = now;
  const credit = rec.credit;
  const x0 = p.x;
  const y0 = p.y;
  // (a portal's exit is the map's doing, not walked: applyMoveInner only cuts the steps that are walked)
  applyMoveInner(world, playerId, x, y, facing, moving, (cx, cy) => {
    const want = Math.hypot(cx - x0, cy - y0);
    if (want <= credit || want === 0) return [cx, cy];
    const k = credit / want;
    return [x0 + (cx - x0) * k, y0 + (cy - y0) * k];
  });
  const walked = Math.hypot(p.x - x0, p.y - y0);
  // (more than the allowance can only be a portal: that is not walked, and the allowance starts over)
  rec.credit = walked > credit + 0.001 ? top * MOVE_CREDIT_S : Math.max(0, credit - walked);
  rec.x = p.x;
  rec.y = p.y;
  moveCredit.set(p, rec);
}

function applyMoveInner(world: WorldState, playerId: string, x: number, y: number, facing: Facing, moving: boolean, clamp?: (x: number, y: number) => [number, number]): void {
  const p = world.players[playerId];
  if (!p || !Number.isFinite(x) || !Number.isFinite(y) || p.sleeping) return;
  if (isSagaKey(world.area) && sagaRooted(world, p)) return;
  if (p.moveLock && p.moveLock > 0) {
    // just arrived on another map: the client's old positions are meaningless; accept only nearby ones
    if (Math.hypot(x - p.x, y - p.y) > 3 * TILE) return;
    delete p.moveLock;
  }
  if (clamp) [x, y] = clamp(x, y);
  const r = resolveMove((tx, ty) => isSolidForPlayer(world, tx, ty), p.x, p.y, x, y, PLAYER_HALF_W, PLAYER_HALF_H, world);
  const moved = r.x !== p.x || r.y !== p.y;
  p.x = r.x;
  p.y = r.y;
  p.facing = facing;
  p.moving = moving;
  if (moved && p.fishing) delete p.fishing;
}

// ---------------------------------------------------------------------------
// Fishing
// ---------------------------------------------------------------------------

const NPC_SPEED = 28;

/** Villagers walk their daily routine, pausing to chat when a player stands close. */
export function tickNpcs(world: WorldState, dtMs: number): void {
  for (const def of npcsIn(world)) {
    const st = npcState(world, def.id);
    const wp = routineTarget(def, farmOf(world).timeMs);
    const tx = wp.x * TILE + TILE / 2;
    const ty = wp.y * TILE + TILE / 2;
    const dx = tx - st.x;
    const dy = ty - st.y;
    const dist = Math.hypot(dx, dy);
    // Someone nearby? Stop and face them.
    let near: PlayerState | null = null;
    let nearD = 2.5 * TILE;
    for (const p of Object.values(world.players)) {
      if (!p.online) continue;
      const d = Math.hypot(p.x - st.x, p.y - st.y);
      if (d < nearD) {
        nearD = d;
        near = p;
      }
    }
    if (near) {
      const ex = near.x - st.x;
      const ey = near.y - st.y;
      st.facing = Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? 'right' : 'left') : ey > 0 ? 'down' : 'up';
      st.moving = false;
      continue;
    }
    if (dist < 2) {
      st.moving = false;
      st.stuckMs = 0;
      continue;
    }
    const step = Math.min(dist, (NPC_SPEED * dtMs) / 1000);
    const nx = st.x + (dx / dist) * step;
    const ny = st.y + (dy / dist) * step;
    const r = resolveMove((x, y) => isSolidForNpc(world, x, y), st.x, st.y, nx, ny, ANIMAL_HALF_W, ANIMAL_HALF_H, world);
    const moved = Math.hypot(r.x - st.x, r.y - st.y);
    st.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (moved < step * 0.5) {
      st.stuckMs += dtMs;
      if (st.stuckMs > 2500) {
        // Something is in the way (a rock, a fence): hop over to the next spot
        st.x = tx;
        st.y = ty;
        st.stuckMs = 0;
      }
      st.moving = false;
      continue;
    }
    st.x = r.x;
    st.y = r.y;
    st.moving = true;
  }
}

const isSolidForNpc = (world: WorldState, tx: number, ty: number): boolean => {
  if (!inBounds(world, tx, ty)) return true;
  const t = world.terrain[tileIndex(world, tx, ty)];
  if (t === 'water' || t === 'pool' || t === 'soil' || t === 'soil_wet') return true;
  if (world.crops[key(tx, ty)] || (isFarm(world) && isHouseDoor(tx, ty))) return true;
  const obj = objectAt(world, tx, ty);
  return !!obj && objectDef(obj.kind).solid;
};

function tickFishing(world: WorldState, ctx: SimCtx, out: Change[]): void {
  for (const p of Object.values(world.players)) {
    const f = p.fishing;
    if (!f) continue;
    if (!f.bite && ctx.now >= f.biteAt) {
      f.bite = true;
      f.until = ctx.now + 1300;
      p.emote = { id: 'napp', until: f.until };
      out.push(...tagArea([fx(f.x, f.y, 'water')], p.area), toast(p.id, T.fishingBite));
    } else if (f.bite && ctx.now >= f.until) {
      delete p.fishing;
      delete p.emote;
      out.push(toast(p.id, T.fishingLost));
    }
  }
}

// ---------------------------------------------------------------------------
// Villagers and quests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The cave
// ---------------------------------------------------------------------------

/** The world a player is currently in. */
export const areaOf = (world: WorldState, p: PlayerState): WorldState => {
  if (p.area === 'dungeon') return world.dungeon ?? world;
  if (p.area !== 'farm') return world.areas?.[p.area] ?? world;
  return world;
};

/** The farm world that owns a dungeon or area world (they keep a non-enumerable back reference). */
export const farmOf = (world: WorldState): WorldState => (!isFarm(world) ? ((world as WorldState & { farm?: WorldState }).farm ?? world) : world);

const linkToFarm = (child: WorldState, farm: WorldState): void => {
  Object.defineProperty(child, 'farm', { value: farm, enumerable: false, writable: true, configurable: true });
};

/** Generates the overworld map at (ax, ay). */
export const buildArea = (ax: number, ay: number): WorldState => generateArea(ax, ay);

/** Loads (or generates) an overworld area. The server may pre-fill world.areas from the database. */
export function getArea(world: WorldState, keyStr: string): WorldState | null {
  const farm = farmOf(world);
  if (keyStr === 'farm') return farm;
  if (keyStr === 'dungeon') return farm.dungeon ?? null;
  if (!farm.areas) farm.areas = {};
  let a = farm.areas[keyStr];
  if (!a) {
    if (isBathKey(keyStr)) {
      if (!getArea(farm, villageOfBath(keyStr))) return null;
      a = generateBath(villageOfBath(keyStr));
    } else if (isSagaKey(keyStr)) {
      const id = dungeonOfKey(keyStr);
      if (!id) return null;
      a = generateSaga(id);
    } else if (isHomeKey(keyStr)) {
      const owner = farm.players[ownerOfHome(keyStr)];
      if (!owner || owner.bot) return null;
      a = generateHome(owner.id);
    } else if (isMoonKey(keyStr)) a = generateMoon();
    else if (isCaveKey(keyStr)) {
      // a cave is built from its entrance: the theme from the entrance, the way out in front of it
      const ck = parseCaveKey(keyStr);
      const parent = ck ? getArea(farm, ck.parent) : null;
      const mouth = ck && parent ? parent.objects[ck.mouth] : undefined;
      const theme = mouth ? themeOfEntrance(mouth) : null;
      if (!ck || !mouth || !theme) return null;
      a = generateCave(keyStr, theme, ck.parent, entranceFront(mouth));
    } else {
      const c = areaCoords(keyStr);
      if (!c) return null;
      a = buildArea(c.ax, c.ay);
    }
    farm.areas[keyStr] = a;
  }
  linkToFarm(a, farm);
  if (!sagaChecked.has(a)) {
    sagaChecked.add(a);
    ensureSagaPlaces(keyStr, a);
  }
  return a;
}
/** Maps already checked for their dungeon arch and Kämpastenen. */
const sagaChecked = new WeakSet<WorldState>();

export const areaName = (keyStr: string, world?: WorldState): string => {
  if (keyStr === 'farm' || keyStr === 'dungeon') return BIOME_NAMES[keyStr];
  if (isBathKey(keyStr)) return T.bathhouseName;
  if (isHomeKey(keyStr)) return world ? houseName(farmOf(world), keyStr) : T.enteredHouse;
  const sagaId = dungeonOfKey(keyStr);
  if (sagaId) return DUNGEONS[sagaId].name;
  const a = world ? getArea(world, keyStr) : null;
  return placeName(a?.biome);
};

/** Moves a player to another map at a given tile. */
export function placeIn(world: WorldState, p: PlayerState, keyStr: string, tx: number, ty: number, facing: Facing, out: Change[]): boolean {
  const farm = farmOf(world);
  const target = getArea(farm, keyStr);
  if (!target) return false;
  const current = areaOf(farm, p);
  const ridden = p.riding !== undefined ? current.animals[p.riding] : undefined;
  const drove = ridden && (isVehicle(ridden) || ANIMALS[ridden.species]?.mount) ? ridden : undefined;
  if (p.riding !== undefined) dismount(current, p, out);
  if (current !== farm) delete current.players[p.id];
  p.area = keyStr;
  p.x = tx * TILE + TILE / 2;
  p.y = ty * TILE + TILE / 2;
  p.facing = facing;
  p.moving = false;
  delete p.fishing;
  if (target !== farm) target.players[p.id] = p;
  p.moveLock = 30;
  if (current !== target) {
    movePetsAlong(current, target, keyStr, p, out);
    syncPet(farm, p, out);
    if (drove && canRideIn(target, tx, ty)) {
      moveAnimalAlong(current, target, keyStr, drove, p, out);
      p.riding = drove.id;
      drove.x = p.x;
      drove.y = p.y + 1;
      drove.facing = p.facing;
    }
  }
  if (!p.visited) p.visited = ['farm'];
  // dungeons greet you themselves and are not places on the world map
  const firstVisit = !isSagaKey(keyStr) && !isHomeKey(keyStr) && !p.visited.includes(keyStr);
  if (firstVisit) {
    p.visited.push(keyStr);
    if (isCaveKey(keyStr)) bump(p, 'caves', 1, out);
    else if (!isIndoorKey(keyStr)) bump(p, 'areas', 1, out);
  }
  if (target !== farm) out.push({ t: 'areaData', to: p.id, key: keyStr, world: target });
  out.push(playerChange(p));
  // the first time somewhere: a cheer for a new kind of place, else a hello (caves and buildings greet you themselves)
  if (firstVisit && keyStr !== 'farm' && !discoverBiome(farm, p, target, out) && !isCaveKey(keyStr) && !isIndoorKey(keyStr)) out.push(toast(p.id, fmt(T.newArea, { name: areaName(keyStr, farm) })));
  if (firstVisit && keyStr !== 'farm') out.push(fx(tx, ty, 'sparkle'));
  return true;
}

/** Pets (and lasso-tamed animals) follow their owner from map to map; they get a fresh id in the new map. */
function movePetsAlong(from: WorldState, to: WorldState, toKey: string, p: PlayerState, out: Change[]): void {
  if (to.area === 'dungeon') return;
  for (const a of Object.values(from.animals)) {
    // pets follow, and the dungeons' mounts when whistled for (but they wait outside a dungeon)
    const mount = !!ANIMALS[a.species]?.mount && !!a.follow && !isSagaKey(toKey) && !isIndoorKey(toKey);
    if (a.owner !== p.id || !(isPetAnimal(a) || mount) || a.stay || a.petKind) continue; // (a pets.ts pet is made anew on the new map: syncPet)
    moveAnimalAlong(from, to, toKey, a, p, out);
  }
}

/** Moves one animal into the player's new map (fresh id there) and tells both maps. */
function moveAnimalAlong(from: WorldState, to: WorldState, toKey: string, a: AnimalState, p: PlayerState, out: Change[]): void {
  const fromKey = from.area ?? 'farm';
  delete from.animals[a.id];
  const gone: Change = { t: 'animal', id: a.id, animal: null };
  if (fromKey !== 'farm') gone.area = fromKey;
  a.id = to.nextId++;
  a.x = p.x;
  a.y = p.y + 3;
  a.moving = false;
  delete a.tx;
  delete a.ty;
  delete a.haunt; // (its coordinates were the other map's)
  delete a.startled;
  to.animals[a.id] = a;
  const here: Change = { t: 'animal', id: a.id, animal: a };
  if (toKey !== 'farm') here.area = toKey;
  out.push(gone, here);
}

/** The open tile nearest (x, y) that you can walk to from the map's openings (else just any open tile). */
export function openTileNear(world: WorldState, x: number, y: number): { x: number; y: number } {
  const reach = reachableFrom(world, arrivalTile(world, 'n'));
  let fallback: { x: number; y: number } | null = null;
  for (let r = 0; r < Math.max(mapW(world), mapH(world)); r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(world, tx, ty) || isSolidForPlayer(world, tx, ty)) continue;
        if (reach[tileIndex(world, tx, ty)]) return { x: tx, y: ty };
        fallback ??= { x: tx, y: ty };
      }
  return fallback ?? { x, y };
}

/** Hits a cave monster, a wild predator or one of Loke's roaming servants (the sword, arrows, rockets, hero spells). */
export function attackMob(d: WorldState, p: PlayerState, mob: AnimalState, dmg: number, ctx: SimCtx, out: Change[]): void {
  const def = combatDef(mob);
  if (!def) return;
  const predator = !ANIMALS[mob.species]?.mob;
  mob.hp = (mob.hp ?? def.hp) - dmg;
  const mtx = tileOf(mob.x);
  const mty = tileOf(mob.y);
  out.push(fx(mtx, mty, 'hit'));
  if (mob.hp > 0) {
    out.push({ t: 'animal', id: mob.id, animal: mob });
    return;
  }
  delete d.animals[mob.id];
  out.push({ t: 'animal', id: mob.id, animal: null }, fx(mtx, mty, 'poof'));
  for (const drop of def.drops) {
    if (ctx.rnd() > drop.chance) continue;
    const n = randInt(ctx.rnd, drop.min, drop.max);
    const dr = spawnDrop(d, drop.item, n, mob.x + (ctx.rnd() - 0.5) * 10, mob.y + (ctx.rnd() - 0.5) * 10);
    out.push({ t: 'drop', id: dr.id, drop: dr });
  }
  bump(p, predator ? 'predators' : 'mobs', 1, out);
  // experience for everyone close by, whatever beat it (SAGA_XP: roaming monsters, predators, the cave's monsters)
  killXp(d, p, mob, out);
  if (predator) {
    out.push(toast(p.id, fmt(T.predatorDown, { name: mob.name })), playerChange(p));
    return;
  }
  // Loke's servants out in the world: the saga's field tasks, quests and experience, and a world boss's chest
  if (d.area !== 'dungeon' && roamingDown(d, p, mob, ctx, out)) return;
  if (def.boss) {
    bump(p, 'boss', 1, out);
    const chest = addObject(d, 'treasure', mtx, mty) ?? addObject(d, 'treasure', mtx + 1, mty) ?? addObject(d, 'treasure', mtx, mty + 1);
    if (chest) out.push({ t: 'object', id: chest.id, obj: chest });
    out.push(toast(null, T.bossDown));
  } else out.push(toast(p.id, fmt(T.mobDown, { name: mob.name })));
  out.push(playerChange(p));
}

// ---------------------------------------------------------------------------
// The wider world: discoveries, caves, treasure, fairy rings and the rocket to the moon
// ---------------------------------------------------------------------------

/** First time in a map of a new biome: +1 star and a cheer (returns whether it was new). The count is rebuilt from the maps visited. */
function discoverBiome(farm: WorldState, p: PlayerState, target: WorldState, out: Change[]): boolean {
  const b = target.biome;
  if (!isBiome(b)) return false;
  const seen = new Set<string>();
  for (const k of p.visited ?? []) {
    if (k === 'farm' || isCaveKey(k) || isIndoorKey(k)) continue;
    const bm = farm.areas?.[k]?.biome;
    if (isBiome(bm)) seen.add(bm);
  }
  const before = p.stats?.biomes ?? 0;
  if (seen.size <= before) return false; // nothing new (or counted already)
  if (!p.stats) p.stats = {};
  p.stats.biomes = seen.size - 1;
  bump(p, 'biomes', 1, out);
  p.stars += 1;
  out.push(toast(p.id, fmt(T.newBiome, { emoji: BIOME_EMOJI[b], name: BIOME_NAMES[b], n: seen.size, total: DISCOVERABLE.length })), playerChange(p));
  return true;
}

/** Rolls a loot table and gives it to the player; returns what they got, for the toast. */
export function grantLoot(world: WorldState, p: PlayerState, table: string, ctx: SimCtx, out: Change[]): string[] {
  const lt = LOOT[table];
  if (!lt) return [];
  const got: string[] = [];
  if (lt.coins) {
    const kr = randInt(ctx.rnd, lt.coins[0], lt.coins[1]);
    p.coins += kr;
    bump(p, 'earned', kr, out);
    got.push(`${kr} ${T.coins}`);
  }
  const total = lt.pool.reduce((n, e) => n + e.weight, 0);
  for (let k = 0; k < lt.picks; k++) {
    let r = ctx.rnd() * total;
    let pick = lt.pool[0]!;
    for (const e of lt.pool) {
      r -= e.weight;
      if (r <= 0) {
        pick = e;
        break;
      }
    }
    if (!pick.item) continue;
    const n = randInt(ctx.rnd, pick.min, pick.max);
    if (ITEMS[pick.item]?.category === 'clothing') {
      // clothes go to the wardrobe; one you already have becomes a gem
      if (!p.wardrobe.includes(pick.item)) {
        p.wardrobe.push(pick.item);
        got.push(`${itemName(pick.item)} (${T.inWardrobe})`);
      } else {
        giveItems(world, p, 'gem', 1, out);
        got.push(itemName('gem'));
      }
      continue;
    }
    giveItems(world, p, pick.item, n, out);
    got.push(n > 1 ? `${n} ${itemName(pick.item).toLowerCase()}` : itemName(pick.item));
    if (pick.item === 'fossil') bump(p, 'fossil', n, out);
  }
  if (lt.stars) {
    p.stars += lt.stars;
    got.push(`${lt.stars} ⭐`);
  }
  out.push(playerChange(p));
  return got;
}

/** Morning: dragon eggs that spent the night somewhere hatch into a little dragon for whoever put them down. */
/** A pet or mount from the dungeons comes out of the bag: it follows you from now on. */
function summonFromBag(world: WorldState, p: PlayerState, itemId: string, out: Change[]): void {
  const s = sagaItem(itemId);
  if (!s?.species) return;
  if (isUnderground(world.area) || isIndoorKey(world.area) || isSagaKey(world.area)) {
    out.push(toast(p.id, T.notNow));
    return;
  }
  if (!removeItem(p.inventory, itemId, 1)) return;
  const a: AnimalState = { ...dummyAnimal, id: world.nextId++, species: s.species, name: s.name, x: p.x, y: p.y + 4, owner: p.id, age: 10, named: true, petted: true, waitMs: 500 };
  if (s.kind === 'mount') a.follow = true;
  world.animals[a.id] = a;
  const tx = tileOf(p.x);
  const ty = tileOf(p.y);
  out.push({ t: 'animal', id: a.id, animal: a }, fx(tx, ty, 'sparkle'), fx(tx, ty + 1, 'heart'), toast(p.id, fmt(T.sagaPetCome, { name: s.name })), playerChange(p));
}

// ---------------------------------------------------------------------------
// Lasso, predators and hearts outside the cave
// ---------------------------------------------------------------------------

/** Knocked out outdoors: wake up at home with full hearts (inventory kept). */
function faintHome(world: WorldState, p: PlayerState, out: Change[]): void {
  const farm = farmOf(world);
  placeIn(farm, p, 'farm', SPAWN.x, SPAWN.y, 'down', out);
  p.hearts = MAX_HEARTS;
  delete p.hurtUntil;
  delete p.healAt;
  out.push(playerChange(p), toast(p.id, T.fainted));
}

/** One bite or hit on a player; returns true when they went down. */
function hurtPlayer(world: WorldState, target: PlayerState, ctx: SimCtx, out: Change[]): boolean {
  const held = heldItem(target);
  if (held && item(held.item).tool === 'shield') {
    out.push(fx(tileOf(target.x), tileOf(target.y), 'hit'), toast(target.id, T.blocked));
    return false;
  }
  if (ctx.now < (target.hurtUntil ?? 0)) return false;
  target.hearts -= 1;
  target.hurtUntil = ctx.now + 900;
  if (target.healAt === undefined) target.healAt = ctx.now + HEAL_MS;
  out.push(fx(tileOf(target.x), tileOf(target.y), 'hit'));
  if (target.hearts <= 0) {
    faintHome(world, target, out);
    return true;
  }
  out.push(playerChange(target));
  return false;
}

// ---------------------------------------------------------------------------
// Sleeping: crawl into a bed; the night passes as soon as everyone online sleeps.
// ---------------------------------------------------------------------------
const SLEEP_FADE_MS = 2500;
const onlinePlayers = (world: WorldState): PlayerState[] => Object.values(farmOf(world).players).filter((p) => p.online);

function wakeUp(p: PlayerState, out: Change[], tell: boolean): void {
  if (!p.sleeping) return;
  delete p.sleeping;
  out.push(playerChange(p));
  if (tell) out.push(toast(p.id, T.wokeUp));
}

/** Every online player asleep → it is morning. Offline sleepers wake up too, so nobody is stuck in bed. */
function tickSleep(world: WorldState, ctx: SimCtx, out: Change[]): void {
  const online = onlinePlayers(world);
  if (!online.length || !online.every((p) => p.sleeping)) {
    for (const p of Object.values(world.players)) if (!p.online && p.sleeping) wakeUp(p, out, false);
    delete world.nightAt;
    return;
  }
  // a short night so everyone sees the lights go out before the new day
  if (world.nightAt === undefined) world.nightAt = ctx.now + SLEEP_FADE_MS;
  if (ctx.now < world.nightAt) return;
  delete world.nightAt;
  newDay(world, ctx, out);
  world.timeMs = 1000;
  for (const p of Object.values(world.players)) wakeUp(p, out, false);
  out.push(toast(null, T.goodMorning));
}

/** Hearts grow back one per game hour outside the cave. */
const HEAL_MS = DAY_LENGTH_MS / 24;
function tickHearts(world: WorldState, ctx: SimCtx, out: Change[]): void {
  for (const p of Object.values(world.players)) {
    if (!p.online || p.area === 'dungeon' || p.hearts >= MAX_HEARTS) {
      if (p.hearts >= MAX_HEARTS && p.healAt !== undefined) delete p.healAt;
      continue;
    }
    if (p.healAt === undefined) p.healAt = ctx.now + HEAL_MS;
    if (ctx.now < p.healAt) continue;
    p.hearts = Math.min(MAX_HEARTS, p.hearts + 1);
    if (p.hearts >= MAX_HEARTS) delete p.healAt;
    else p.healAt = ctx.now + HEAL_MS;
    out.push(playerChange(p), fx(tileOf(p.x), tileOf(p.y), 'heart'));
  }
}

/**
 * M7b: the wild animals (not predators, monsters, pets, mounts or traffic) startle when a hero who is MOVING comes within
 * STARTLE_TILES of them: they bolt away from the hero for BOLT_MS, then wait, then walk back to where they were first
 * startled (`haunt`). A hero who stands still never startles anything, so waiting quietly lets an animal come near again
 * (petting and the lasso work as before), and an animal that has been startled before and has caught its breath creeps up
 * to a hero who stands still within CURIOUS_TILES; an animal that has been petted today knows you. Deterministic: no random numbers.
 */
export const STARTLE_TILES = 4;
export const BOLT_MS = 1800;
const BOLT_SPEED_MUL = 2.2;
const CALM_MS = 2000;
/** A startled animal that has calmed down comes to a hero who stands still within this many tiles. */
export const CURIOUS_TILES = 7;
function tickStartle(world: WorldState, a: AnimalState, ctx: SimCtx, players: PlayerState[]): void {
  const def = ANIMALS[a.species];
  if (!def?.wild || a.owner || a.petted || def.mob || def.predator || isVehicle(a) || isMount(a) || a.stay) return;
  if (world.area === 'dungeon' || isIndoorKey(world.area) || a.fleeUntil !== undefined) return;
  let near: PlayerState | undefined;
  let best = STARTLE_TILES * TILE;
  for (const p of players) {
    if (!p.moving) continue;
    const dist = Math.hypot(p.x - a.x, p.y - a.y);
    if (dist < best) {
      best = dist;
      near = p;
    }
  }
  if (!near) {
    // an animal that has been startled before, and has caught its breath, sidles up to a hero who stands quietly near it
    if (!a.haunt || a.waitMs > 0) return;
    let quiet: PlayerState | undefined;
    let nearest = CURIOUS_TILES * TILE;
    for (const p of players) {
      if (p.moving) continue;
      // beside a quiet hero (in the tile they face, or any of the three others next to theirs, not a diagonal one) it stays put:
      // that is where it can be petted, and it must not wander off again while they stand there
      if (Math.abs(tileOf(a.x) - tileOf(p.x)) + Math.abs(tileOf(a.y) - tileOf(p.y)) === 1) {
        a.waitMs = Math.max(a.waitMs, 500);
        delete a.tx;
        delete a.ty;
        return;
      }
      const dist = Math.hypot(p.x - a.x, p.y - a.y);
      if (dist < nearest) {
        nearest = dist;
        quiet = p;
      }
    }
    if (!quiet) return;
    // it creeps to the middle of the tile next to the hero's on its own side (the one along the longer of the two distances, or
    // the other axis if that tile is blocked): a point 1.1 tiles along the line to it, as this once was, is often in a *diagonal* tile,
    // where the hero cannot face it and so cannot pet it
    const dx = a.x - quiet.x;
    const dy = a.y - quiet.y;
    const ptx = tileOf(quiet.x);
    const pty = tileOf(quiet.y);
    const horizontal = { x: ptx + Math.sign(dx || 1), y: pty };
    const vertical = { x: ptx, y: pty + Math.sign(dy || 1) };
    const [first, second] = Math.abs(dx) >= Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
    const spot = [first, second].find((c) => inBounds(world, c.x, c.y) && !isSolidForAnimal(world, c.x, c.y));
    if (!spot) return;
    a.tx = (spot.x + 0.5) * TILE;
    a.ty = (spot.y + 0.5) * TILE;
    return;
  }
  a.haunt ??= { x: a.x, y: a.y };
  a.startled = true;
  a.fleeUntil = ctx.now + BOLT_MS;
  a.fleeX = near.x;
  a.fleeY = near.y;
  delete a.tx;
  delete a.ty;
  a.waitMs = 0;
}

/** Scared animals run away from where the lasso came from. */
function tickFlee(world: WorldState, a: AnimalState, dtMs: number, ctx: SimCtx): boolean {
  if (a.fleeUntil === undefined || ctx.now >= a.fleeUntil) {
    if (a.fleeUntil !== undefined) {
      delete a.fleeUntil;
      delete a.fleeX;
      delete a.fleeY;
      if (a.haunt) {
        // a startled animal catches its breath, then walks back to where it was (a spot of its own near it)
        a.waitMs = CALM_MS + (a.id % 5) * 250;
        a.tx = a.haunt.x + ((a.id % 3) - 1) * 6;
        a.ty = a.haunt.y + (((a.id >> 2) % 3) - 1) * 6;
      }
    }
    delete a.startled;
    return false;
  }
  const dx = a.x - (a.fleeX ?? a.x);
  const dy = a.y - (a.fleeY ?? a.y);
  const dist = Math.hypot(dx, dy) || 1;
  const speed = (ANIMALS[a.species]?.speed ?? 20) * (a.startled ? BOLT_SPEED_MUL : 1.5);
  const step = (speed * dtMs) / 1000;
  const r = resolveMove((tx, ty) => isSolidForAnimal(world, tx, ty), a.x, a.y, a.x + (dx / dist) * step, a.y + (dy / dist) * step, ANIMAL_HALF_W, ANIMAL_HALF_H, world);
  a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  a.moving = r.x !== a.x || r.y !== a.y;
  a.x = r.x;
  a.y = r.y;
  return true;
}

const MOB_SIGHT = 7 * TILE;
/** Loke's roaming servants notice you this close (they are meant to be found, not to ambush). */
const ROAM_SIGHT = 4.5 * TILE;
/** A taunted monster keeps after its hero this far. */
const HUNT_RANGE = 14 * TILE;
/** The longest pause between two bites; a later attackAt means the monster is dazed. */
export const ATTACK_GAP = 1500;

/** True when no wall or rock lies on the straight tile line between two points. */
export function lineOfSight(d: WorldState, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = tileOf(x0 + (x1 - x0) * t);
    const ty = tileOf(y0 + (y1 - y0) * t);
    if (!inBounds(d, tx, ty) || d.terrain[tileIndex(d, tx, ty)] === 'water') return false;
    const o = objectAt(d, tx, ty);
    if (o && objectDef(o.kind).solid) return false;
  }
  return true;
}

/** Monsters (cave) and wild predators (outdoors) chase and bite players; everything else wanders. */
function tickMob(d: WorldState, a: AnimalState, dtMs: number, ctx: SimCtx, out: Change[]): boolean {
  const def = ANIMALS[a.species];
  const predator = def?.predator;
  // predators and Loke's roaming servants notice you closer than cave monsters do, and keep chasing a bit further
  // (a roaming monster may have its own, shorter reach: the meadow's Ängsvätte next to the farm)
  const roaming = !!def?.mob && !!def.wild;
  const sight = predator ? predator.aggroRange * TILE : roaming ? (def.mob!.aggro !== undefined ? def.mob!.aggro * TILE : ROAM_SIGHT) : MOB_SIGHT;
  const keep = predator || roaming ? (a.moving ? sight * 1.5 : sight) : MOB_SIGHT;
  const areaKeyStr = d.area ?? 'farm';
  let target: PlayerState | null = null;
  let best = keep;
  // taunted by a hero (Utmana! out in the world): it goes for them while it lasts
  const hunter = a.hunt && ctx.now < (a.huntUntil ?? 0) ? d.players[a.hunt] : undefined;
  if (hunter && hunter.online && hunter.area === areaKeyStr && Math.hypot(hunter.x - a.x, hunter.y - a.y) < HUNT_RANGE) {
    target = hunter;
    best = Math.hypot(hunter.x - a.x, hunter.y - a.y);
  } else {
    if (a.hunt) {
      delete a.hunt;
      delete a.huntUntil;
    }
    for (const p of Object.values(d.players)) {
      if (!p.online || p.area !== areaKeyStr) continue;
      const dist = Math.hypot(p.x - a.x, p.y - a.y);
      if (dist < best) {
        best = dist;
        target = p;
      }
    }
  }
  if (!target || (!hunter && !lineOfSight(d, a.x, a.y, target.x, target.y))) return false;
  // dazed by a hero's shield bash: it stands still a moment
  if (ctx.now < (a.attackAt ?? 0) - ATTACK_GAP) {
    a.moving = false;
    return true;
  }
  const dx = target.x - a.x;
  const dy = target.y - a.y;
  a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  if (best <= 1.4 * TILE) {
    a.moving = false;
    if (ctx.now >= (a.attackAt ?? 0)) {
      a.attackAt = ctx.now + (predator ? 1500 : 1300);
      hurtPlayer(d, target, ctx, out);
    }
    return true;
  }
  const speed = ANIMALS[a.species]?.speed ?? 20;
  const step = (speed * dtMs) / 1000;
  const nx = a.x + (dx / best) * step;
  const ny = a.y + (dy / best) * step;
  const r = resolveMove((tx, ty) => isSolidForAnimal(d, tx, ty), a.x, a.y, nx, ny, ANIMAL_HALF_W, ANIMAL_HALF_H, d);
  a.moving = r.x !== a.x || r.y !== a.y;
  a.x = r.x;
  a.y = r.y;
  return true;
}

/** Marks changes as belonging to a map so clients apply them to the right one. */
export function tagArea(changes: Change[], keyStr: string): Change[] {
  if (keyStr === 'farm') return changes;
  for (const c of changes) {
    if (c.t === 'terrain' || c.t === 'crop' || c.t === 'object' || c.t === 'animal' || c.t === 'drop' || c.t === 'fx') c.area = keyStr;
  }
  return changes;
}
const areaOccupied = (a: WorldState): boolean => Object.values(a.players).some((p) => p.online);

// ---------------------------------------------------------------------------
// Badhuset
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export const anyoneOnline = (world: WorldState): boolean => Object.values(world.players).some((p) => p.online);

/** The maps people are on besides the lobby (a run's stops): their monsters, fights and drops. */
function tickOtherAreas(world: WorldState, dtMs: number, ctx: SimCtx, out: Change[]): void {
  for (const [k, a] of Object.entries(world.areas ?? {})) {
    if (!areaOccupied(a)) {
      // an empty dungeon starts over after a while
      if (a.saga && idleSaga(world, k, a, ctx.now)) delete world.areas![k];
      continue;
    }
    const local: Change[] = [];
    if (a.saga) tickSaga(a, k, dtMs, ctx, out);
    tickAnimals(a, dtMs, ctx, local);
    tickDrops(a, local);
    if (isHomeKey(k)) tickHome(a, out);
    out.push(...tagArea(local, k));
  }
}

export function tick(world: WorldState, dtMs: number, ctx: SimCtx): Change[] {
  const out: Change[] = [];
  if (!anyoneOnline(world)) return out;
  world.timeMs += dtMs;
  tickAnimals(world, dtMs, ctx, out);
  tickNpcs(world, dtMs);
  tickDrops(world, out);
  tickBoosts(world, ctx.now, out);
  tickFishing(world, ctx, out);
  tickHearts(world, ctx, out);
  tickSleep(world, ctx, out);
  tickWeather(world, ctx, out);
  tickOtherAreas(world, dtMs, ctx, out);
  tickHouseDoor(world, out);
  out.push(...tickRuns(world, dtMs, ctx));
  for (const p of Object.values(world.players)) {
    if (p.emote && p.emote.until < ctx.now) delete p.emote;
    if (p.moveLock && --p.moveLock <= 0) delete p.moveLock;
  }
  if (world.timeMs >= DAY_LENGTH_MS) {
    world.timeMs -= DAY_LENGTH_MS;
    newDay(world, ctx, out);
  }
  return out;
}

const homeCenter = (world: WorldState, a: AnimalState): { x: number; y: number } => {
  const home = world.objects[a.homeId];
  if (!home) return { x: a.x, y: a.y };
  const def = objectDef(home.kind);
  return { x: (home.x + def.w / 2) * TILE, y: (home.y + def.h + 1) * TILE };
};

const LEASH = 7 * TILE;

const PET_FOLLOW = 26;
const PET_TELEPORT = 7 * TILE;
/** A called horse trots after its owner (its wandering speed is a slow walk). */
const HORSE_FOLLOW_SPEED = 60;
/** How far a staying animal potters around the spot it was told to stay on. */
const STAY_LEASH = 1.5 * TILE;

function tickPet(world: WorldState, a: AnimalState, dtMs: number): boolean {
  const owner = a.owner ? world.players[a.owner] : undefined;
  if (!owner || !owner.online || owner.area !== (world.area ?? 'farm')) return false;
  const horse = isMount(a);
  // a horse waits outside while you are indoors
  const dx = owner.x - a.x;
  const dy = owner.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist > PET_TELEPORT) {
    // Lost (fence, house door…): pop up at the owner's feet (never inside a tree or wall)
    a.x = owner.x;
    a.y = owner.y + 3;
    a.moving = false;
    return true;
  }
  if (dist <= PET_FOLLOW) {
    a.moving = false;
    delete a.tx;
    delete a.ty;
    return true;
  }
  const speed = horse ? HORSE_FOLLOW_SPEED : (ANIMALS[a.species]?.speed ?? 60);
  const step = Math.min(dist - PET_FOLLOW + 1, (speed * dtMs) / 1000);
  const nx = a.x + (dx / dist) * step;
  const ny = a.y + (dy / dist) * step;
  const r = resolveMove((tx, ty) => isSolidForPlayer(world, tx, ty), a.x, a.y, nx, ny, ANIMAL_HALF_W, ANIMAL_HALF_H, world);
  a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  a.moving = r.x !== a.x || r.y !== a.y;
  a.x = r.x;
  a.y = r.y;
  return true;
}

function tickAnimals(world: WorldState, dtMs: number, ctx: SimCtx, out: Change[]): void {
  if (world.area !== 'dungeon' && !isIndoorKey(world.area)) tickRiding(world, out);
  const walkers = world.biome === 'by' ? npcsIn(world).map((n) => npcState(world, n.id)) : [];
  // the players the wild animals watch (online, on this map), collected once for all of them
  const here = world.area ?? 'farm';
  const watchers = Object.values(world.players).filter((p) => p.online && p.area === here);
  for (const a of Object.values(world.animals)) {
    if ((isMount(a) || isVehicle(a)) && riderOf(world, a)) continue;
    if (world.saga?.mobs[a.id]) continue; // dungeon monsters fight by their own rules (tickSaga)
    if (a.petKind && world.saga) continue; // and so do the pets there (tickPets)
    if (isVehicle(a)) {
      // city traffic follows its route; a player's own vehicle stays parked
      if (a.route !== undefined) {
        if (driveVehicle(world, a, dtMs, ctx.now, walkers).honk) out.push(fx(tileOf(a.x), tileOf(a.y), 'honk'));
      } else a.moving = false;
      continue;
    }
    if (!a.stay && (isPetAnimal(a) || (isMount(a) && a.follow)) && tickPet(world, a, dtMs)) continue;
    tickStartle(world, a, ctx, watchers);
    if (tickFlee(world, a, dtMs, ctx)) continue;
    if (isHostile(a) && tickMob(world, a, dtMs, ctx, out)) continue;
    if (a.waitMs > 0) {
      a.waitMs -= dtMs;
      a.moving = false;
      continue;
    }
    if (a.tx === undefined || a.ty === undefined) {
      const c = a.stay ?? a.haunt ?? homeCenter(world, a);
      const ang = ctx.rnd() * Math.PI * 2;
      const r = ctx.rnd() * (a.stay ? STAY_LEASH : LEASH);
      a.tx = Math.min(mapW(world) * TILE - 8, Math.max(8, c.x + Math.cos(ang) * r));
      a.ty = Math.min(mapH(world) * TILE - 8, Math.max(8, c.y + Math.sin(ang) * r));
    }
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const dist = Math.hypot(dx, dy);
    const speed = ANIMALS[a.species]?.speed ?? 16;
    const step = (speed * dtMs) / 1000;
    if (dist <= step) {
      // it has arrived: it stands on its target, not up to one step short of it (a step is 10 px when a starved server catches up in
      // 250 ms ticks, which can be a whole tile short, so that a creeping animal never reached the tile beside the hero)
      const there = resolveMove((tx, ty) => isSolidForAnimal(world, tx, ty), a.x, a.y, a.tx, a.ty, ANIMAL_HALF_W, ANIMAL_HALF_H, world);
      a.x = there.x;
      a.y = there.y;
      a.moving = false;
      delete a.tx;
      delete a.ty;
      a.waitMs = 1000 + ctx.rnd() * 4000;
      continue;
    }
    const nx = a.x + (dx / dist) * step;
    const ny = a.y + (dy / dist) * step;
    const r = resolveMove((tx, ty) => isSolidForAnimal(world, tx, ty), a.x, a.y, nx, ny, ANIMAL_HALF_W, ANIMAL_HALF_H, world);
    const moved = Math.hypot(r.x - a.x, r.y - a.y);
    if (moved < step * 0.5) {
      // Blocked (fence, water, another building): give up and rest a bit
      a.moving = false;
      delete a.tx;
      delete a.ty;
      a.waitMs = 500 + ctx.rnd() * 2000;
      continue;
    }
    a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    a.x = r.x;
    a.y = r.y;
    a.moving = true;
  }
}

/** Speed multiplier while pizzapower lasts (client prediction uses the same number). */
export const BOOST_SPEED_MUL = 1.3;

function tickBoosts(world: WorldState, now: number, out: Change[]): void {
  for (const p of Object.values(world.players)) {
    if (p.boostUntil !== undefined && now >= p.boostUntil) {
      delete p.boostUntil;
      out.push(playerChange(p));
    }
  }
}

function tickDrops(world: WorldState, out: Change[]): void {
  for (const d of Object.values(world.drops)) {
    if (d.ignore && --d.ignore.ticks <= 0) delete d.ignore;
    for (const p of Object.values(world.players)) {
      if (!p.online) continue;
      if (d.ignore?.player === p.id) continue;
      if (Math.hypot(p.x - d.x, p.y - d.y) > PICKUP_RADIUS) continue;
      if (d.item === 'heartberry' && world.area === 'dungeon' && p.hearts < MAX_HEARTS) {
        p.hearts = Math.min(MAX_HEARTS, p.hearts + d.count);
        delete world.drops[d.id];
        out.push({ t: 'drop', id: d.id, drop: null }, playerChange(p), toast(p.id, T.heartsFull), fx(tileOf(p.x), tileOf(p.y), 'heart'));
        break;
      }
      if (d.data !== undefined) {
        const free = p.inventory.indexOf(null);
        if (free < 0) continue;
        p.inventory[free] = { item: d.item, count: 1, data: d.data };
        delete world.drops[d.id];
        out.push({ t: 'drop', id: d.id, drop: null }, playerChange(p));
        break;
      }
      const left = addItem(p.inventory, d.item, d.count);
      if (left === d.count) continue;
      out.push(playerChange(p));
      if (left === 0) {
        delete world.drops[d.id];
        out.push({ t: 'drop', id: d.id, drop: null });
      } else {
        d.count = left;
        out.push({ t: 'drop', id: d.id, drop: d });
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Day rollover
// ---------------------------------------------------------------------------

export function newDay(world: WorldState, _ctx: SimCtx, out: Change[] = []): Change[] {
  world.day++;
  world.timeMs = Math.min(world.timeMs, 1000);
  out.push({ t: 'day', day: world.day });
  // pets are happy to be petted again tomorrow
  for (const a of Object.values(world.animals)) a.petted = false;
  return out;
}

export const dummyAnimal: AnimalState = {
  id: 0,
  species: 'hen',
  name: '',
  x: 0,
  y: 0,
  facing: 'down',
  moving: false,
  hearts: 0,
  heartProgress: 0,
  fed: false,
  petted: false,
  brushed: false,
  hasProduct: false,
  named: false,
  age: 0,
  homeId: 0,
  waitMs: 0,
};

/** The animals the kennel gives away: one free pet for every player, once. */
export const KENNEL_SPECIES = ['dog', 'cat'] as const;

/** Picks the first pet at the kennel in the lobby: free, once per player. The pet follows its owner from then on (see tickPet and movePetsAlong). */
export function adoptPet(world: WorldState, playerId: string, species: string, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || p.area !== 'farm' || !(KENNEL_SPECIES as readonly string[]).includes(species)) return [];
  const kennel = Object.values(farm.objects).find((o) => o.kind === 'kennel');
  if (!kennel || Math.hypot((kennel.x + 1) * TILE - p.x, (kennel.y + 1) * TILE - p.y) > 5 * TILE) return [];
  if ((p.stats.petAdopted ?? 0) > 0) return [toast(p.id, T.kennelOnce)];
  const out: Change[] = [];
  bump(p, 'petAdopted', 1, out);
  // the pet is kept with the player (pets.ts) and shows as an animal next to them
  grantPet(farm, p, species === 'dog' ? 'hund' : 'katt', out, { quiet: true, now: ctx.now });
  const a = petAnimalOf(farm, p);
  if (a) out.push(fx(tileOf(p.x), tileOf(p.y), 'heart'), toast(p.id, fmt(T.kennelGot, { name: a.name })), { t: 'open', to: p.id, ui: 'nameAnimal', id: a.id });
  out.push(playerChange(p));
  return out;
}

/** Convenience for tests and the admin page: add a grown animal next to a house. */
export function addAnimal(world: WorldState, species: string, homeId: number, name?: string): AnimalState {
  const a: AnimalState = { ...dummyAnimal, id: world.nextId++, species, homeId, name: name ?? '', named: !!name, age: 10 };
  const c = homeCenter(world, a);
  a.x = c.x;
  a.y = c.y;
  world.animals[a.id] = a;
  return a;
}

export const isBaby = (a: AnimalState): boolean => a.age < (ANIMALS[a.species]?.growDays ?? 3);

