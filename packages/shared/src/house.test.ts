import { describe, expect, it } from 'vitest';
import {
  HOUSE_DOOR,
  HOUSE_EXIT,
  HOUSE_ROOM,
  TILE,
  TROPHY_BOSSES,
  addItem,
  awardTrophy,
  createPlayer,
  enterHouse,
  generateWorld,
  getArea,
  homeKey,
  isHomeKey,
  mulberry32,
  objectAt,
  performAction,
  pickUpFurniture,
  devGrantLooks,
  setOnline,
  setStandLook,
  standLook,
  tick,
  type Change,
  type PlayerState,
  type SimCtx,
  type WorldState,
} from './index.ts';

const ctx = (): SimCtx => ({ season: 'none', rnd: mulberry32(7), now: 1_000_000 });
const look = { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' as const };

function lobby(): { farm: WorldState; a: PlayerState; b: PlayerState } {
  const farm = generateWorld(1);
  const a = createPlayer(farm, 'Astrid', look);
  const b = createPlayer(farm, 'Bo', look);
  setOnline(farm, a.id, true);
  setOnline(farm, b.id, true);
  for (const p of [a, b]) {
    p.x = (HOUSE_DOOR.x + 0.5) * TILE;
    p.y = (HOUSE_DOOR.y + 0.5) * TILE;
  }
  return { farm, a, b };
}

/** Puts a player in a spot on the floor of the house they are in, facing right. */
const standIn = (p: PlayerState, tx: number, ty: number): void => {
  p.x = (tx + 0.5) * TILE;
  p.y = (ty + 0.5) * TILE;
  p.facing = 'right';
  delete p.moveLock;
};

describe('houses', () => {
  it('the door asks whose house; going in makes your own house once, with a starter set', () => {
    const { farm, a } = lobby();
    const asked = tick(farm, 50, ctx()).filter((c: Change) => c.t === 'open' && c.ui === 'houses');
    expect(asked.map((c) => (c as { to: string }).to).sort()).toEqual([...Object.keys(farm.players)].sort());
    expect(tick(farm, 50, ctx()).some((c) => c.t === 'open' && c.ui === 'houses')).toBe(false); // (once per visit)
    const out = enterHouse(farm, a.id);
    expect(out.some((c) => c.t === 'areaData' && c.key === homeKey(a.id))).toBe(true);
    expect(a.area).toBe(homeKey(a.id));
    const house = farm.areas![homeKey(a.id)]!;
    expect(house.w).toBeGreaterThan(0);
    expect(Math.floor(a.x / TILE)).toBe(HOUSE_EXIT.x);
    const kinds = Object.values(house.objects).map((o) => o.kind);
    for (const k of ['bed', 'table', 'chair', 'lamp', 'hearth']) expect(kinds).toContain(k);
    // the second visit does not give a second starter set
    walkOut(farm, a);
    enterHouse(farm, a.id);
    expect(Object.values(house.objects).filter((o) => o.kind === 'bed')).toHaveLength(1);
  });

  const walkOut = (farm: WorldState, p: PlayerState): void => {
    standIn(p, HOUSE_EXIT.x, HOUSE_EXIT.y);
    tick(farm, 50, ctx());
    expect(p.area).toBe('farm');
    p.x = (HOUSE_DOOR.x + 0.5) * TILE;
    p.y = (HOUSE_DOOR.y + 0.5) * TILE;
  };

  it('every character has a house of their own', () => {
    const { farm, a, b } = lobby();
    enterHouse(farm, a.id);
    enterHouse(farm, b.id);
    expect(a.area).not.toBe(b.area);
    expect(farm.areas![homeKey(a.id)]).not.toBe(farm.areas![homeKey(b.id)]);
  });

  it('the owner places, picks up and moves furniture; the walls stay', () => {
    const { farm, a } = lobby();
    enterHouse(farm, a.id);
    const house = farm.areas![homeKey(a.id)]!;
    addItem(a.inventory, 'viking_shield', 1);
    a.selected = a.inventory.findIndex((s) => s?.item === 'viking_shield');
    standIn(a, 8, 8);
    performAction(house, a.id, 9, 8, ctx());
    expect(objectAt(house, 9, 8)?.kind).toBe('viking_shield');
    expect(objectAt(house, 9, 8)?.by).toBe(a.id);
    // take it up again: it is in the bag and selected
    const out = pickUpFurniture(house, a.id, 9, 8);
    expect(objectAt(house, 9, 8)).toBeUndefined();
    expect(out.some((c) => c.t === 'object' && c.obj === null)).toBe(true);
    expect(a.inventory[a.selected]?.item).toBe('viking_shield');
    // the wall and the hearth cannot be picked up, nor the dark beyond the wall built on
    expect(pickUpFurniture(house, a.id, HOUSE_ROOM.x, 8)).toEqual([]);
    standIn(a, HOUSE_EXIT.x, HOUSE_ROOM.y + 2);
    expect(pickUpFurniture(house, a.id, HOUSE_EXIT.x, HOUSE_ROOM.y + 1)).toEqual([]);
    expect(objectAt(house, HOUSE_EXIT.x, HOUSE_ROOM.y + 1)?.kind).toBe('hearth');
    standIn(a, HOUSE_ROOM.x + 1, 8);
    addItem(a.inventory, 'viking_shield', 1);
    a.selected = a.inventory.findIndex((s) => s?.item === 'viking_shield');
    performAction(house, a.id, HOUSE_ROOM.x, 8, ctx()); // onto the wall: nothing
    performAction(house, a.id, HOUSE_ROOM.x - 1, 8, ctx()); // into the dark beyond it: nothing
    expect(objectAt(house, HOUSE_ROOM.x - 1, 8)).toBeUndefined();
  });

  it('a visitor can walk and look but not place, move or remove anything; the owner is not affected', () => {
    const { farm, a, b } = lobby();
    enterHouse(farm, a.id);
    enterHouse(farm, b.id, a.id);
    expect(b.area).toBe(homeKey(a.id));
    const house = farm.areas![homeKey(a.id)]!;
    expect(house.players[b.id]).toBeDefined();
    addItem(b.inventory, 'viking_shield', 1);
    b.selected = b.inventory.findIndex((s) => s?.item === 'viking_shield');
    standIn(b, 8, 8);
    const before = Object.keys(house.objects).length;
    performAction(house, b.id, 9, 8, ctx());
    expect(Object.keys(house.objects)).toHaveLength(before);
    // not the furniture either: the bed (sleep), the chair, a pick up
    const chair = Object.values(house.objects).find((o) => o.kind === 'chair')!;
    standIn(b, chair.x - 1, chair.y);
    expect(performAction(house, b.id, chair.x, chair.y, ctx()).every((c) => c.t === 'toast')).toBe(true);
    expect(pickUpFurniture(house, b.id, chair.x, chair.y)).toEqual([]);
    expect(objectAt(house, chair.x, chair.y)?.kind).toBe('chair');
    // with a weapon in hand too
    addItem(b.inventory, 'jarnsvard', 1);
    b.selected = b.inventory.findIndex((s) => s?.item === 'jarnsvard');
    performAction(house, b.id, chair.x, chair.y, ctx());
    expect(objectAt(house, chair.x, chair.y)?.kind).toBe('chair');
    // the owner may
    standIn(a, chair.x - 1, chair.y);
    expect(pickUpFurniture(house, a.id, chair.x, chair.y).length).toBeGreaterThan(0);
    expect(objectAt(house, chair.x, chair.y)).toBeUndefined();
  });

  it('you cannot go into a house from far away, nor into the house of a character that does not exist', () => {
    const { farm, a } = lobby();
    expect(enterHouse(farm, a.id, 'nobody')).toEqual([]);
    a.x = 30 * TILE;
    a.y = 30 * TILE;
    expect(enterHouse(farm, a.id)).toEqual([]);
    expect(isHomeKey(a.area)).toBe(false);
  });

  it('getArea refuses a house with no owner', () => {
    const { farm } = lobby();
    expect(getArea(farm, homeKey('ghost'))).toBeNull();
  });
});

describe('boss trophies', () => {
  const boss = TROPHY_BOSSES[0]!;

  it('one per boss, kept at the highest level; a higher level upgrades it and a lower one changes nothing', () => {
    const { farm, a } = lobby();
    const out: Change[] = [];
    awardTrophy(farm, a, boss, 1, out);
    const held = a.inventory.filter((s) => s?.item === `trophy_${boss}`);
    expect(held).toHaveLength(1);
    expect(held[0]!.data).toBe('1');
    awardTrophy(farm, a, boss, 0, out);
    expect(held[0]!.data).toBe('1');
    awardTrophy(farm, a, boss, 3, out);
    expect(a.inventory.filter((s) => s?.item === `trophy_${boss}`)).toHaveLength(1);
    expect(held[0]!.data).toBe('3');
    expect(a.trophies![boss]).toBe(3);
    // one for every boss
    for (const b of TROPHY_BOSSES) awardTrophy(farm, a, b, 2, out);
    expect(a.inventory.filter((s) => s?.item.startsWith('trophy_'))).toHaveLength(TROPHY_BOSSES.length);
  });

  it('a placed trophy keeps its level, is upgraded where it stands, and comes back up with its level', () => {
    const { farm, a } = lobby();
    enterHouse(farm, a.id);
    const house = farm.areas![homeKey(a.id)]!;
    awardTrophy(farm, a, boss, 2, []);
    a.selected = a.inventory.findIndex((s) => s?.item === `trophy_${boss}`);
    standIn(a, 8, 8);
    performAction(house, a.id, 9, 8, ctx());
    const t = objectAt(house, 9, 8)!;
    expect(t.kind).toBe(`trophy_${boss}`);
    expect(t.variant).toBe(2);
    const out: Change[] = [];
    awardTrophy(farm, a, boss, 4, out);
    expect(a.inventory.some((s) => s?.item === `trophy_${boss}`)).toBe(false); // (no second one)
    expect(t.variant).toBe(4);
    expect(out.some((c) => c.t === 'object' && c.area === homeKey(a.id))).toBe(true);
    pickUpFurniture(house, a.id, 9, 8);
    expect(a.inventory.find((s) => s?.item === `trophy_${boss}`)!.data).toBe('4');
  });

  it('with a full bag the trophy stands in the house instead of falling on the ground', () => {
    const { farm, a } = lobby();
    for (let i = 0; i < a.inventory.length; i++) a.inventory[i] = { item: 'wood', count: 1 };
    const out: Change[] = [];
    awardTrophy(farm, a, boss, 3, out);
    const house = farm.areas![homeKey(a.id)]!;
    const t = Object.values(house.objects).find((o) => o.kind === `trophy_${boss}`)!;
    expect(t.variant).toBe(3);
    expect(Object.keys(farm.drops)).toHaveLength(0);
    expect(out.some((c) => c.t === 'object' && c.area === homeKey(a.id))).toBe(true);
  });

  it('a gear stand shows what is put on it and gives it back', () => {
    const { farm, a } = lobby();
    enterHouse(farm, a.id);
    const house = farm.areas![homeKey(a.id)]!;
    addItem(a.inventory, 'gear_stand', 1);
    a.selected = a.inventory.findIndex((s) => s?.item === 'gear_stand');
    standIn(a, 8, 8);
    performAction(house, a.id, 9, 8, ctx());
    const stand = objectAt(house, 9, 8)!;
    addItem(a.inventory, 'runsvard', 1);
    a.selected = a.inventory.findIndex((s) => s?.item === 'runsvard');
    performAction(house, a.id, 9, 8, ctx());
    expect(stand.data).toBe('runsvard');
    expect(a.inventory.some((s) => s?.item === 'runsvard')).toBe(false);
    a.selected = a.inventory.findIndex((s) => s === null);
    performAction(house, a.id, 9, 8, ctx());
    expect(stand.data).toBeUndefined();
    expect(a.inventory.some((s) => s?.item === 'runsvard')).toBe(true);
  });

  it('a gear stand can show a look from the collection: pressing it opens the wardrobe, the owner picks, a guest only looks', () => {
    const { farm, a, b } = lobby();
    enterHouse(farm, a.id);
    const house = farm.areas![homeKey(a.id)]!;
    addItem(a.inventory, 'gear_stand', 1);
    a.selected = a.inventory.findIndex((s) => s?.item === 'gear_stand');
    standIn(a, 8, 8);
    performAction(house, a.id, 9, 8, ctx());
    const stand = objectAt(house, 9, 8)!;
    a.selected = a.inventory.findIndex((s) => s === null);
    // nothing in the collection yet: the stand just says so
    expect(performAction(house, a.id, 9, 8, ctx()).some((c) => c.t === 'open')).toBe(false);
    devGrantLooks(a, 'draugvakt', 3, false, false);
    const asked = performAction(house, a.id, 9, 8, ctx());
    expect(asked.some((c) => c.t === 'open' && c.ui === 'looks' && c.id === stand.id)).toBe(true);
    // the owner picks one (it stays in the collection: nothing is taken out of a bag) at the tier it is now
    house.players[a.id] ??= a;
    const put = setStandLook(house, a.id, stand.id, 'draugvakt_hat', undefined);
    expect(put.some((c) => c.t === 'object')).toBe(true);
    expect(stand.data).toBe('look:draugvakt_hat|3|');
    expect(standLook(stand.data)?.tier).toBe(3);
    expect(a.saga!.looks!.draugvakt_hat).toEqual({ tier: 3 });
    // a look not owned is refused; an empty piece clears the stand
    expect(setStandLook(house, a.id, stand.id, 'frostbrost_hat', undefined)).toEqual([]);
    expect(stand.data).toBe('look:draugvakt_hat|3|');
    // a guest cannot change it, and pressing it does not open the wardrobe for them
    b.area = a.area;
    house.players[b.id] = b;
    devGrantLooks(b, 'draugvakt', 1, false, false);
    expect(setStandLook(house, b.id, stand.id, 'draugvakt_hat', undefined)).toEqual([]);
    expect(performAction(house, b.id, 9, 8, ctx()).some((c) => c.t === 'open')).toBe(false);
    setStandLook(house, a.id, stand.id, null, undefined);
    expect(stand.data).toBeUndefined();
  });
});
