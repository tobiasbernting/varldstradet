// Everyone's own house: a small map of its own (an "area" keyed `house:<player id>`), made the first time anyone goes in,
// saved with the other areas. The owner decorates it; visitors may walk and look. Also here: the boss trophies, and the
// stand that shows a weapon, shield or amulet.
import { HOUSE_DOOR, addObject, emptyWorld, objectAt, removeObject } from './map.ts';
import { ITEMS, NORSE_DECOR, TROPHY_LEVELS, TROPHY_PREFIX } from './data.ts';
import { DUNGEONS, HOUSE_LOOT, sagaItem } from './saga.ts';
import { hasLooks, lookPiece, standData, standLook } from './looks.ts';
import { HOUSE_ROOM, HOUSE_EXIT, HOUSE_H, HOUSE_W, homeKey, isHomeKey, ownerOfHome } from './homekeys.ts';
import { TILE } from './types.ts';
import { HOUSE_T, ITEM_TEXTS, LOOK_T, T, TROPHY_LEVEL_NAMES, TROPHY_TEXT, fmt, houseTitle, itemName } from './sv.ts';
import { REACH, farmOf, fx, getArea, giveItems, giveStack, placeIn, playerChange, tileOf, toast } from './sim.ts';
import type { Change } from './protocol.ts';
import type { ItemStack, PlayerState, WorldObject, WorldState } from './types.ts';

/** The builder id of the house's own structure (walls, door, hearth): nobody can take those down. */
export const HOUSE_FIXED = '_house';

/** The dungeon bosses that leave a trophy (each dungeon's last one), by boss id. */
export const TROPHY_BOSSES: readonly string[] = Object.values(DUNGEONS).map((d) => d.boss);
export const isTrophyKind = (kind: string): boolean => kind.startsWith(TROPHY_PREFIX);
export const clampTrophyLevel = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(TROPHY_LEVELS - 1, Math.floor(n))) : 1);
/** The level a trophy stack or object remembers (0..4). */
export const trophyLevelOf = (data: string | undefined): number => clampTrophyLevel(data === undefined ? 0 : Number(data));

const floorBox = () => ({ x0: HOUSE_ROOM.x + 1, y0: HOUSE_ROOM.y + 1, x1: HOUSE_ROOM.x + HOUSE_ROOM.w - 2, y1: HOUSE_ROOM.y + HOUSE_ROOM.h - 2 });
/** Is (tx, ty) floor inside the house (not a wall, not the dark around the room)? */
export const inHouseFloor = (tx: number, ty: number): boolean => {
  const b = floorBox();
  return tx >= b.x0 && tx <= b.x1 && ty >= b.y0 && ty <= b.y1;
};

/** A new house: a longhouse of wooden walls round a wood floor, a hearth at the back, and a starter set of furniture. */
export function generateHome(ownerId: string): WorldState {
  const world = emptyWorld(HOUSE_W, HOUSE_H);
  world.area = homeKey(ownerId);
  world.biome = 'house';
  world.terrain.fill('floor_wood');
  const R = HOUSE_ROOM;
  const windows = [R.x + 4, R.x + R.w - 5];
  for (let y = R.y; y < R.y + R.h; y++)
    for (let x = R.x; x < R.x + R.w; x++) {
      const edge = x === R.x || y === R.y || x === R.x + R.w - 1 || y === R.y + R.h - 1;
      if (!edge) continue;
      if (x === HOUSE_EXIT.x && y === HOUSE_EXIT.y) addObject(world, 'door_out', x, y, { by: HOUSE_FIXED });
      else if (y === R.y && windows.includes(x)) addObject(world, 'window', x, y, { by: HOUSE_FIXED });
      else addObject(world, 'wall_wood', x, y, { by: HOUSE_FIXED });
    }
  addObject(world, 'hearth', HOUSE_EXIT.x - 1, R.y + 1, { by: HOUSE_FIXED });
  // the starter set, once (it is theirs: they may pick it up and move it)
  addObject(world, 'bed', R.x + 2, R.y + 2, { by: ownerId });
  addObject(world, 'table', HOUSE_EXIT.x - 1, R.y + 6, { by: ownerId });
  addObject(world, 'chair', HOUSE_EXIT.x - 2, R.y + 6, { by: ownerId });
  addObject(world, 'lamp', R.x + R.w - 3, R.y + 2, { by: ownerId });
  return world;
}

// ---------------------------------------------------------------------------
// Going in and out
// ---------------------------------------------------------------------------

/** Standing on the lobby's door? Each player is asked once per visit to the tile. */
const atDoor = new WeakMap<WorldState, Set<string>>();

/** The lobby's house door asks whose house to go into (a window on the client, its list from the characters it knows). */
export function tickHouseDoor(farm: WorldState, out: Change[]): void {
  let seen = atDoor.get(farm);
  if (!seen) atDoor.set(farm, (seen = new Set()));
  for (const p of Object.values(farm.players)) {
    if (!p.online || p.bot || p.area !== 'farm') {
      seen.delete(p.id);
      continue;
    }
    const here = tileOf(p.x) === HOUSE_DOOR.x && tileOf(p.y) === HOUSE_DOOR.y;
    if (!here) seen.delete(p.id);
    else if (!seen.has(p.id) && !p.moveLock) {
      seen.add(p.id);
      out.push({ t: 'open', to: p.id, ui: 'houses' });
    }
  }
}

/** Into a house (yours unless `ownerId` says another character's). Made on the first visit. */
export function enterHouse(world: WorldState, playerId: string, ownerId?: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || p.bot || p.sleeping) return [];
  if (p.area !== 'farm' || Math.hypot(p.x - (HOUSE_DOOR.x + 0.5) * 16, p.y - (HOUSE_DOOR.y + 0.5) * 16) > 4 * 16) return [];
  const owner = farm.players[ownerId ?? p.id];
  if (!owner || owner.bot) return [];
  const key = homeKey(owner.id);
  const out: Change[] = [];
  if (!getArea(farm, key) || !placeIn(farm, p, key, HOUSE_EXIT.x, HOUSE_EXIT.y - 1, 'up', out)) return [];
  out.push(toast(p.id, owner.id === p.id ? HOUSE_T.welcomeOwn : fmt(HOUSE_T.welcomeGuest, { name: owner.name })));
  return out;
}

/** Back out through the door to the lobby. */
export function leaveHouse(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !isHomeKey(p.area)) return [];
  const out: Change[] = [];
  placeIn(farm, p, 'farm', HOUSE_DOOR.x, HOUSE_DOOR.y + 1, 'down', out);
  return out;
}

/** Walking onto the door in the bottom wall leaves. */
export function tickHome(house: WorldState, out: Change[]): void {
  for (const p of Object.values(house.players)) {
    if (!p.online || p.moveLock) continue;
    if (tileOf(p.x) === HOUSE_EXIT.x && tileOf(p.y) === HOUSE_EXIT.y) out.push(...leaveHouse(house, p.id));
  }
}

export const isGuestHere = (world: WorldState, p: PlayerState): boolean => isHomeKey(world.area) && ownerOfHome(world.area!) !== p.id;
export const houseName = (farm: WorldState, key: string): string => {
  const o = farm.players[ownerOfHome(key)];
  return o ? houseTitle(o.name) : HOUSE_T.myHouse;
};

/**
 * What an action in a house may do: a visitor only looks (their action is a toast); the owner may act on the floor, never on the
 * walls and the dark beyond them. Null: carry on as usual.
 */
export function houseAct(world: WorldState, p: PlayerState, tx: number, ty: number): Change[] | null {
  if (!isHomeKey(world.area)) return null;
  if (isGuestHere(world, p)) return [toast(p.id, HOUSE_T.guestLook)];
  return inHouseFloor(tx, ty) ? null : [];
}

// ---------------------------------------------------------------------------
// Moving furniture
// ---------------------------------------------------------------------------

/** The item a placed object goes back into the bag as, with what it remembers. */
function stackFor(obj: WorldObject): ItemStack | null {
  const it = ITEMS[obj.kind];
  if (!it || it.places !== obj.kind) return null;
  const s: ItemStack = { item: obj.kind, count: 1 };
  if (isTrophyKind(obj.kind)) s.data = String(trophyLevelOf(obj.data));
  return s;
}

/** Picks a piece of furniture up into the bag and selects it (so one tap on the floor puts it down again). Owner, own house only. */
export function pickUpFurniture(world: WorldState, playerId: string, tx: number, ty: number): Change[] {
  const p = world.players[playerId];
  if (!p || !isHomeKey(world.area) || isGuestHere(world, p) || p.sleeping) return [];
  if (Math.abs(tx - tileOf(p.x)) > REACH + 1 || Math.abs(ty - tileOf(p.y)) > REACH + 1 || !inHouseFloor(tx, ty)) return [];
  const obj = objectAt(world, tx, ty);
  if (!obj || obj.by === HOUSE_FIXED) return [];
  const stack = stackFor(obj);
  if (!stack) return [toast(p.id, HOUSE_T.cantMove)];
  if (p.inventory.indexOf(null) < 0) return [toast(p.id, T.inventoryFull)];
  const out: Change[] = [];
  // what a chest held, and what a stand showed, goes back into the bag first
  if (obj.items) for (const s of obj.items) if (s) giveStack(world, p, s, out);
  if (obj.kind === 'gear_stand' && obj.data) giveStack(world, p, { item: obj.data, count: 1 }, out);
  removeObject(world, obj.id);
  out.push({ t: 'object', id: obj.id, obj: null }, fx(obj.x, obj.y, 'poof'));
  const where = p.inventory.indexOf(null);
  giveStack(world, p, stack, out);
  if (where >= 0) p.selected = where; // (the bag's slots can be held too; the name shows over the hotbar)
  out.push(playerChange(p), toast(p.id, fmt(HOUSE_T.pickedUp, { item: itemName(obj.kind) })));
  return out;
}

/** Extra fields a newly placed piece carries from its stack: a trophy's level, a painting's pixels. */
export function placedExtra(kind: string, data: string | undefined): Partial<WorldObject> {
  if (data === undefined) return {};
  if (isTrophyKind(kind)) return { data: String(trophyLevelOf(data)), variant: trophyLevelOf(data) };
  return { data };
}

/** An item's name as a stack shows it: a trophy says the level it was won on. */
export const stackName = (s: { item: string; data?: string }): string =>
  isTrophyKind(s.item) && s.data !== undefined ? `${itemName(s.item)} (${TROPHY_LEVEL_NAMES[trophyLevelOf(s.data)]})` : itemName(s.item);

/** One kid-friendly sentence about an item: a dungeon find's own text, a trophy's, or the plain things'. Empty when there is none. */
export const itemText = (id: string): string => sagaItem(id)?.text ?? (isTrophyKind(id) ? TROPHY_TEXT : (ITEM_TEXTS[id] ?? ''));

// ---------------------------------------------------------------------------
// The gear stand
// ---------------------------------------------------------------------------

/** Weapons, shields and amulets can stand on it (clothes live in the wardrobe). */
export const displayable = (id: string): boolean => {
  const k = sagaItem(id)?.kind;
  return k === 'weapon' || k === 'offhand' || k === 'amulet';
};

/** Press on the stand holding a weapon, a shield or an amulet: it stands there (what was on it comes back). Empty-handed: take it back. */
export function standAct(world: WorldState, p: PlayerState, obj: WorldObject, held: ItemStack | null, out: Change[]): void {
  const shown = obj.data;
  const look = standLook(shown);
  // a look from the collection (Garderoben) stands there without taking anything out of a bag: empty-handed, the owner picks which
  if (!(held && displayable(held.item)) && (look || (!shown && hasLooks(p.saga))) && !isGuestHere(world, p)) {
    out.push({ t: 'open', to: p.id, ui: 'looks', id: obj.id });
    return;
  }
  if (look) return; // (a guest only looks)
  if (held && displayable(held.item)) {
    const mine = held.item;
    held.count -= 1;
    if (held.count <= 0) p.inventory[p.selected] = null;
    if (shown) giveStack(world, p, { item: shown, count: 1 }, out);
    obj.data = mine;
    out.push({ t: 'object', id: obj.id, obj }, toast(p.id, fmt(HOUSE_T.standPut, { item: itemName(mine) })), playerChange(p));
    return;
  }
  if (shown) {
    delete obj.data;
    giveStack(world, p, { item: shown, count: 1 }, out);
    out.push({ t: 'object', id: obj.id, obj }, toast(p.id, fmt(HOUSE_T.standTake, { item: itemName(shown) })), playerChange(p));
    return;
  }
  out.push(toast(p.id, HOUSE_T.standNone));
}

/** The owner picks a look from their collection for a gear stand of their house (piece null: the stand is emptied). */
export function setStandLook(world: WorldState, playerId: string, objId: number, pieceId: string | null, way: unknown): Change[] {
  const p = world.players[playerId];
  const obj = world.objects[objId];
  if (!p || !obj || obj.kind !== 'gear_stand' || !isHomeKey(world.area) || isGuestHere(world, p)) return [];
  const data = standData(p, pieceId, way);
  if (data === undefined) return [];
  if (data === null) delete obj.data;
  else obj.data = data;
  const name = pieceId ? (lookPiece(pieceId)?.name ?? '') : '';
  return [{ t: 'object', id: obj.id, obj }, ...(pieceId ? [toast(p.id, fmt(LOOK_T.toastStand, { item: name }))] : [])];
}

// ---------------------------------------------------------------------------
// Boss trophies
// ---------------------------------------------------------------------------

/** What a win gave: the trophy's kind, its level, and whether it is new in the bag, stands in the house (full bag) or an old one got finer. */
export interface TrophyAward {
  item: string;
  level: number;
  where: 'bag' | 'home' | 'up';
}

/**
 * A boss beaten at difficulty `level` (0..4): the player's trophy for that boss is made, or made finer when this level beats
 * the best one so far (the one in the bag or standing in their house is upgraded, never a second one). Nothing for a lower level.
 */
export function awardTrophy(world: WorldState, p: PlayerState, bossOrDungeon: string, level: number, out: Change[]): TrophyAward | null {
  // (a run knows its chapter by the dungeon's id, a dungeon's boss by its own)
  const bossId = DUNGEONS[bossOrDungeon as keyof typeof DUNGEONS]?.boss ?? bossOrDungeon;
  if (p.bot || !TROPHY_BOSSES.includes(bossId)) return null;
  const lv = clampTrophyLevel(level);
  const rec = (p.trophies ??= {});
  const best = rec[bossId];
  if (best !== undefined && best >= lv) return null;
  rec[bossId] = lv;
  const kind = TROPHY_PREFIX + bossId;
  const bossName = itemName(kind).replace('Trofé: ', '');
  let upgraded = false;
  let where: TrophyAward['where'] = 'bag';
  if (best !== undefined) {
    for (const s of p.inventory) if (s?.item === kind) { s.data = String(lv); upgraded = true; }
    const farm = farmOf(world);
    const key = homeKey(p.id);
    const house = farm.areas?.[key];
    if (house)
      for (const o of Object.values(house.objects))
        if (o.kind === kind) {
          o.data = String(lv);
          o.variant = lv;
          out.push({ t: 'object', id: o.id, obj: o, area: key });
          upgraded = true;
        }
  }
  if (upgraded) out.push(toast(p.id, fmt(HOUSE_T.trophyUp, { boss: bossName, level: TROPHY_LEVEL_NAMES[lv]! })));
  else if (p.inventory.indexOf(null) < 0 && standInHouse(world, p, kind, lv, out)) {
    where = 'home';
    out.push(toast(p.id, fmt(HOUSE_T.trophyHome, { boss: bossName })));
  }
  else {
    giveStack(world, p, { item: kind, count: 1, data: String(lv) }, out);
    out.push(toast(p.id, fmt(HOUSE_T.trophyNew, { boss: bossName })));
  }
  out.push(playerChange(p));
  return { item: kind, level: lv, where: upgraded ? 'up' : where };
}

/** A trophy with nowhere to go (a full bag) stands in the owner's house instead: along the back wall, the first free spot. */
function standInHouse(world: WorldState, p: PlayerState, kind: string, level: number, out: Change[]): boolean {
  const farm = farmOf(world);
  const key = homeKey(p.id);
  const house = getArea(farm, key);
  if (!house) return false;
  const b = floorBox();
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      if (objectAt(house, x, y)) continue;
      const o = addObject(house, kind, x, y, { by: p.id, data: String(level), variant: level });
      if (!o) continue;
      out.push({ t: 'object', id: o.id, obj: o, area: key });
      return true;
    }
  return false;
}

/** Development only (DEV_TELEPORT=1): the trophy of boss `id` at `level`, as a win would give it. */
export function devTrophy(world: WorldState, playerId: string, id: string, level: number): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p || !TROPHY_BOSSES.includes(id)) return [];
  const out: Change[] = [];
  awardTrophy(world, p, id, level, out);
  return out;
}

/** Development only (DEV_TELEPORT=1): one of every piece of decor a dungeon can drop (HOUSE_LOOT and the Norse set), the starter furniture, a gear stand and three pieces of gear, into the bag. */
export function devDecor(world: WorldState, playerId: string): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p) return [];
  const out: Change[] = [];
  const decor = new Set<string>([...NORSE_DECOR, 'gear_stand', 'bed', 'table', 'chair', 'lamp']);
  for (const d of Object.values(HOUSE_LOOT)) for (const [id] of [...d.boss, ...d.treasure]) decor.add(id);
  for (const id of [...decor, 'runsvard', 'offhand_helskold', 'amulet_vegvisir']) giveItems(world, p, id, 1, out);
  out.push(playerChange(p));
  return out;
}

/** Development only (DEV_TELEPORT=1): stand on tile (tx, ty) of the map you are in (for checks that would take long to walk). */
export function devWarp(world: WorldState, playerId: string, tx: number, ty: number): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p || !Number.isFinite(tx) || !Number.isFinite(ty)) return [];
  p.x = (Math.floor(tx) + 0.5) * TILE;
  p.y = (Math.floor(ty) + 0.5) * TILE;
  p.moveLock = 30;
  return [{ t: 'warp', id: p.id, x: p.x, y: p.y, ...(p.area !== 'farm' ? { area: p.area } : {}) }];
}
