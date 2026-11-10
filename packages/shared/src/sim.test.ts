import { describe, expect, it } from 'vitest';
import * as shared from './index.ts';
import {
  DAY_LENGTH_MS,
  SPAWN,
  NPCS,
  T,
  objectDef,
  adoptPet,
  TILE,
  dummyAnimal,
  type AnimalState,
  addItem,
  placeIn,
  homeKey,
  applyMove,
  reachableFrom,
  PLAYER_SPEED,
  RUN_SPEED_MUL,
  RIDE_SPEED_MUL,
  MOVE_CREDIT_S,
  MOVE_SLACK,
  createPlayer,
  emote,
  generateWorld,
  isPetAnimal,
  mulberry32,
  nameAnimal,
  objectAt,
  performAction,
  resolveMove,
  mapH,
  mapW,
  seasonForDate,
  setOnline,
  stepPlayer,
  BOOST_SPEED_MUL,
  sortSlots,
  tick,
  tileIndex,
  type Change,
  type PlayerState,
  type SimCtx,
  type WorldState,
} from './index.ts';

/** A grown animal (tests only). */
function addAnimal(world: WorldState, species: string, homeId: number, name?: string): AnimalState {
  const a: AnimalState = { ...dummyAnimal, id: world.nextId++, species, homeId, name: name ?? '', named: !!name, age: 10 };
  world.animals[a.id] = a;
  return a;
}

const ctx = (season: SimCtx['season'] = 'none'): SimCtx => ({ season, rnd: mulberry32(7), now: 1_000_000 });

function setup(): { world: WorldState; p: PlayerState } {
  const world = generateWorld(1);
  const p = createPlayer(world, 'Test', { skin: '#f0c0a0', hair: '#553322', hairStyle: 'short' });
  setOnline(world, p.id, true);
  // an open road along row 20 for the walking tests
  for (let x = 0; x < 60; x++) clearTile(world, x, 20);
  return { world, p };
}

/** Puts the player at a tile and clears that tile and its neighbour for actions. */
function standAt(world: WorldState, p: PlayerState, tx: number, ty: number): void {
  p.x = tx * TILE + TILE / 2;
  p.y = ty * TILE + TILE / 2;
  p.facing = 'right';
}

function clearTile(world: WorldState, tx: number, ty: number): void {
  const o = objectAt(world, tx, ty);
  if (o) {
    delete world.objects[o.id];
    for (const [k, id] of Object.entries(world.occupancy)) if (id === o.id) delete world.occupancy[k];
  }
  world.terrain[tileIndex(world, tx, ty)] = 'grass';
}

const select = (p: PlayerState, itemId: string): void => {
  const i = p.inventory.findIndex((s) => s?.item === itemId);
  if (i < 0) throw new Error(`not holding ${itemId}`);
  p.selected = i;
};

const toasts = (ch: Change[]): string[] => ch.filter((c) => c.t === 'toast').map((c) => (c as { text: string }).text);

describe('movement', () => {
  it('slides along solids and stays in bounds', () => {
    const solid = (tx: number, ty: number) => tx === 5 || ty < 0 || tx < 0;
    // Moving right into column 5 is blocked, vertical still allowed
    const r = resolveMove(solid, 4 * TILE + 2, 40, 5 * TILE + 2, 48);
    expect(r.x).toBe(4 * TILE + 2);
    expect(r.y).toBe(48);
    const b = resolveMove(solid, 20, 20, -100, -100);
    expect(b.x).toBeGreaterThanOrEqual(5);
    expect(b.y).toBeGreaterThanOrEqual(3);
  });

  it('stepPlayer moves at PLAYER_SPEED and faces the direction', () => {
    const { world, p } = setup();
    const x0 = p.x;
    stepPlayer(world, p, 1, 0, 500);
    expect(p.x).toBeCloseTo(x0 + 32, 3);
    expect(p.facing).toBe('right');
    expect(p.moving).toBe(true);
    stepPlayer(world, p, 0, 0, 100);
    expect(p.moving).toBe(false);
  });

  describe('applyMove bounds the walk (server clock `now`)', () => {
    /** A client that predicts with stepPlayer at `mul` and reports every `dt` ms; returns the server's and its own x. */
    function walk(world: WorldState, p: PlayerState, mul: number, ms: number, dt: number, t0: number): { client: PlayerState; t: number } {
      const client = structuredClone(p);
      let t = t0;
      for (let i = 0; i < ms / dt; i++) {
        t += dt;
        stepPlayer(world, client, 1, 0, dt, mul);
        applyMove(world, p.id, client.x, client.y, client.facing, client.moving, t);
      }
      return { client, t };
    }

    it('never pulls back a walking or running client (20 messages a second)', () => {
      for (const mul of [1, RUN_SPEED_MUL]) {
        const { world, p } = setup();
        standAt(world, p, 10, 20);
        applyMove(world, p.id, p.x, p.y, 'right', false, 1000); // (the first message: the allowance starts full)
        const x0 = p.x;
        const { client } = walk(world, p, mul, 3000, 50, 1000);
        expect(p.x).toBeCloseTo(client.x, 6);
        expect(p.x - x0).toBeCloseTo((PLAYER_SPEED * mul * 3000) / 1000, 3);
      }
    });

    it('takes a burst after a stall (three messages at once, 150 ms of running)', () => {
      const { world, p } = setup();
      standAt(world, p, 10, 20);
      applyMove(world, p.id, p.x, p.y, 'right', false, 1000);
      const client = structuredClone(p);
      for (let i = 0; i < 3; i++) {
        stepPlayer(world, client, 1, 0, 50, RUN_SPEED_MUL);
        applyMove(world, p.id, client.x, client.y, 'right', true, 1150); // all arrive together
      }
      expect(p.x).toBeCloseTo(client.x, 6);
    });

    it('cuts a teleport-sized move to what the legs allow', () => {
      const { world, p } = setup();
      standAt(world, p, 10, 20);
      applyMove(world, p.id, p.x, p.y, 'right', false, 1000);
      const x0 = p.x;
      applyMove(world, p.id, x0 + 20 * TILE, p.y, 'right', true, 1050);
      expect(p.x).toBeGreaterThan(x0);
      expect(p.x - x0).toBeLessThanOrEqual(PLAYER_SPEED * RUN_SPEED_MUL * MOVE_SLACK * (MOVE_CREDIT_S + 0.05) + 0.001);
    });

    it('cannot be beaten by a flood of small moves either', () => {
      const { world, p } = setup();
      standAt(world, p, 10, 20);
      applyMove(world, p.id, p.x, p.y, 'right', false, 1000);
      const x0 = p.x;
      for (let i = 1; i <= 1000; i++) applyMove(world, p.id, p.x + 10, p.y, 'right', true, 1000 + i); // 10 px a millisecond
      const allowed = PLAYER_SPEED * RUN_SPEED_MUL * MOVE_SLACK * (MOVE_CREDIT_S + 1);
      expect(p.x - x0).toBeLessThanOrEqual(allowed + 0.001);
    });

    it('lets a boosted runner and a rider go as fast as they legitimately can, and only them', () => {
      const boosted = setup();
      standAt(boosted.world, boosted.p, 10, 20);
      boosted.p.boostUntil = 1_000_000;
      applyMove(boosted.world, boosted.p.id, boosted.p.x, boosted.p.y, 'right', false, 1000);
      const w1 = walk(boosted.world, boosted.p, RUN_SPEED_MUL * BOOST_SPEED_MUL, 3000, 50, 1000);
      expect(boosted.p.x).toBeCloseTo(w1.client.x, 6);
      // three times the walking speed with no boost or horse is more than the legs allow: the server falls behind
      const plain = setup();
      standAt(plain.world, plain.p, 10, 20);
      applyMove(plain.world, plain.p.id, plain.p.x, plain.p.y, 'right', false, 1000);
      const w2 = walk(plain.world, plain.p, 3, 3000, 50, 1000);
      expect(plain.p.x).toBeLessThan(w2.client.x - 5);
      // riding: the mount's speed
      const rider = setup();
      standAt(rider.world, rider.p, 10, 20);
      const horse = addAnimal(rider.world, 'horse', 0);
      rider.p.riding = horse.id;
      applyMove(rider.world, rider.p.id, rider.p.x, rider.p.y, 'right', false, 1000);
      const w3 = walk(rider.world, rider.p, RIDE_SPEED_MUL, 3000, 50, 1000);
      expect(rider.p.x).toBeCloseTo(w3.client.x, 6);
    });

    it('a warp the server did (travel, a door, a bus) starts the allowance over', () => {
      const { world, p } = setup();
      standAt(world, p, 10, 20);
      applyMove(world, p.id, p.x, p.y, 'right', false, 1000);
      standAt(world, p, 30, 20); // (the server put the player there)
      const x0 = p.x;
      applyMove(world, p.id, x0 + 8, p.y, 'right', true, 1050);
      expect(p.x).toBeCloseTo(x0 + 8, 6);
    });

    it('without a clock (the bots in the tests) a move is taken as it comes', () => {
      const { world, p } = setup();
      standAt(world, p, 10, 20);
      const x0 = p.x;
      applyMove(world, p.id, x0 + 6 * TILE, p.y, 'right', true);
      expect(p.x).toBeGreaterThan(x0 + 3 * TILE);
    });

    it('the speeds are ordered: walk < run < ride, boost on top is bounded', () => {
      expect(RUN_SPEED_MUL).toBeGreaterThan(1);
      expect(RUN_SPEED_MUL).toBeLessThan(RIDE_SPEED_MUL);
      expect(RUN_SPEED_MUL * BOOST_SPEED_MUL).toBeLessThan(3);
    });
  });

});

describe('tick', () => {
  it('time only passes when someone is online and days roll over', () => {
    const { world, p } = setup();
    setOnline(world, p.id, false);
    const t0 = world.timeMs;
    tick(world, 1000, ctx());
    expect(world.timeMs).toBe(t0);
    setOnline(world, p.id, true);
    tick(world, 1000, ctx());
    expect(world.timeMs).toBe(t0 + 1000);
    const ch = tick(world, DAY_LENGTH_MS, ctx());
    expect(world.day).toBe(2);
    expect(ch.some((c) => c.t === 'day')).toBe(true);
    expect(world.timeMs).toBeLessThan(2000);
  });

  it('emotes expire', () => {
    const { world, p } = setup();
    const c = ctx();
    emote(world, p.id, 'hjärta', c);
    expect(p.emote?.id).toBe('hjärta');
    tick(world, 10, { ...c, now: c.now + 5000 });
    expect(p.emote).toBeUndefined();
  });

});

describe('season calendar', () => {
  it('detects holiday seasons in Stockholm time', () => {
    expect(seasonForDate(new Date('2026-10-24T10:00:00+02:00'))).toBe('halloween');
    expect(seasonForDate(new Date('2026-11-02T10:00:00+01:00'))).toBe('none');
    expect(seasonForDate(new Date('2026-12-24T10:00:00+01:00'))).toBe('jul');
    expect(seasonForDate(new Date('2027-01-06T10:00:00+01:00'))).toBe('jul');
    expect(seasonForDate(new Date('2027-01-07T10:00:00+01:00'))).toBe('none');
    // Easter 2026 is 5 April: Palm Sunday 29 March, Easter Monday 6 April
    expect(seasonForDate(new Date('2026-03-29T10:00:00+02:00'))).toBe('pask');
    expect(seasonForDate(new Date('2026-04-06T10:00:00+02:00'))).toBe('pask');
    expect(seasonForDate(new Date('2026-04-07T10:00:00+02:00'))).toBe('none');
    // Midsummer day 2026 is Saturday 20 June
    expect(seasonForDate(new Date('2026-06-15T10:00:00+02:00'))).toBe('midsommar');
    expect(seasonForDate(new Date('2026-06-21T10:00:00+02:00'))).toBe('midsommar');
    expect(seasonForDate(new Date('2026-06-22T10:00:00+02:00'))).toBe('none');
  });
});

describe('the house door', () => {
  it('the farmhouse door is walkable and asks whose house to enter (house.ts takes it from there)', () => {
    const { world, p } = setup();
    standAt(world, p, 10, 9);
    for (let i = 0; i < 4; i++) stepPlayer(world, p, 0, -1, 50);
    expect([Math.floor(p.x / 16), Math.floor(p.y / 16)]).toEqual([10, 8]);
    delete p.moveLock;
    expect(tick(world, 50, ctx()).some((c) => c.t === 'open' && c.ui === 'houses' && c.to === p.id)).toBe(true);
  });

});

describe('riding', () => {
  it('a mount carries its owner and is left behind in front of the door when they go into a house', () => {
    const { world, p } = setup();
    const mount = addAnimal(world, 'sleipner', 0, 'Sleipner');
    mount.owner = p.id;
    mount.petted = true;
    mount.x = 34 * TILE + 8;
    mount.y = 34 * TILE + 8;
    standAt(world, p, 33, 34);
    performAction(world, p.id, 34, 34, ctx());
    expect(p.riding).toBe(mount.id);
    placeIn(world, p, homeKey(p.id), 5, 5, 'down', []);
    expect(p.area).toBe(homeKey(p.id));
    expect(p.riding).toBeUndefined();
  });
});

describe('sorting the bag', () => {
  it('sortSlots sorts only the backpack and keeps hotbar and selected', () => {
    const { world, p } = setup();
    const hotbar = p.inventory.slice(0, 8).map((s) => (s ? { ...s } : null));
    p.selected = 2;
    for (let i = 8; i < 32; i++) p.inventory[i] = null;
    p.inventory[20] = { item: 'healing_potion', count: 3 };
    p.inventory[9] = { item: 'healing_potion', count: 4 };
    p.inventory[15] = { item: 'jarnsvard', count: 1 };
    const out = sortSlots(world, p.id);
    expect(p.inventory.slice(0, 8)).toEqual(hotbar);
    expect(p.selected).toBe(2);
    expect(p.inventory[8]?.item).toBe('jarnsvard');
    expect(p.inventory[9]).toEqual({ item: 'healing_potion', count: 7 });
    expect(p.inventory[10]).toBeNull();
    expect(toasts(out)).toContain('Sorterat!');
    expect(out.some((c) => c.t === 'player')).toBe(true);
  });

  it('sortSlots keeps the held backpack stack selected', () => {
    const { world, p } = setup();
    for (let i = 8; i < 32; i++) p.inventory[i] = null;
    p.inventory[9] = { item: 'healing_potion', count: 4 };
    p.inventory[20] = { item: 'jarnsvard', count: 1 };
    p.inventory[25] = { item: 'styrkedryck', count: 2 };
    p.selected = 25;
    sortSlots(world, p.id);
    expect(p.inventory[p.selected]).toEqual({ item: 'styrkedryck', count: 2 });
    expect(p.selected).toBeGreaterThanOrEqual(8);
    // a merged stack is followed by item id
    for (let i = 8; i < 32; i++) p.inventory[i] = null;
    p.inventory[9] = { item: 'healing_potion', count: 4 };
    p.inventory[20] = { item: 'healing_potion', count: 3 };
    p.selected = 20;
    sortSlots(world, p.id);
    expect(p.inventory[p.selected]?.item).toBe('healing_potion');
  });

});

describe('the lobby (Gården)', () => {
  const fronts = (world: WorldState) =>
    Object.values(world.objects)
      .filter((o) => ['fardport', 'yggdrasil', 'saga_stone', 'kennel', 'wardrobe', 'house'].includes(o.kind))
      .map((o) => ({ kind: o.kind, x: o.x + Math.floor((objectDef(o.kind).w - 1) / 2), y: o.y + objectDef(o.kind).h }));

  it('has the arch, the shoot, Kämpastenen, the kennel, the wardrobe and the house, and everything is reachable from the spawn', () => {
    const world = generateWorld(1);
    const seen = reachableFrom(world, SPAWN);
    const kinds = new Set(fronts(world).map((f) => f.kind));
    for (const k of ['fardport', 'yggdrasil', 'saga_stone', 'kennel', 'wardrobe', 'house']) expect(kinds.has(k)).toBe(true);
    for (const f of fronts(world)) expect(seen[tileIndex(world, f.x, f.y)], `${f.kind} at ${f.x},${f.y}`).toBe(1);
    // Völvan and Stina can be walked up to
    for (const id of ['sigrun', 'stina']) {
      const n = NPCS[id]!;
      expect(seen[tileIndex(world, n.x, n.y + 1)], id).toBe(1);
    }
    // the door of the house works
    expect(seen[tileIndex(world, 10, 9)]).toBe(1);
  });

  it('has no fields, animals, shop, sell box, cave or bus, and a new player has nothing in the bag', () => {
    const { world, p } = setup();
    expect(Object.keys(world.animals)).toHaveLength(0);
    for (const o of Object.values(world.objects)) expect(['mailbox', 'sellbox', 'start_chest', 'start_bench', 'cave', 'bus_stop']).not.toContain(o.kind);
    expect(p.inventory.filter(Boolean)).toHaveLength(0);
    expect(Object.values(NPCS).map((n) => n.id).sort()).toEqual(['sigrun', 'stina']);
  });

  it('cannot be changed: no chopping, digging, planting or building, whatever is held', () => {
    const { world, p } = setup();
    for (const tool of ['jarnsvard', 'healing_potion', 'viking_shield']) {
      addItem(p.inventory, tool, 1);
      p.selected = p.inventory.findIndex((s) => s?.item === tool);
      standAt(world, p, 20, 25);
      clearTile(world, 21, 25);
      const before = JSON.stringify([world.terrain.slice(0, 4096), Object.keys(world.objects).length]);
      for (const [tx, ty] of [[21, 25], [20, 26], [6, 18], [24, 14]] as const) {
        p.x = (tx - 1) * TILE + TILE / 2;
        p.y = ty * TILE + TILE / 2;
        performAction(world, p.id, tx, ty, ctx());
      }
      expect(JSON.stringify([world.terrain.slice(0, 4096), Object.keys(world.objects).length])).toBe(before);
    }
  });

  it('is closed: nothing to travel to, no edge to cross', () => {
    const world = generateWorld(1);
    // (the functions that walked a player off a map's edge, jumped, or boarded a bus are gone)
    for (const name of ['travel', 'teleport', 'ride', 'transportDestinations', 'flyRocket']) expect(name in shared).toBe(false);
    const seen = reachableFrom(world, SPAWN);
    for (let i = 0; i < seen.length; i++) {
      const x = i % mapW(world);
      const y = Math.floor(i / mapW(world));
      if (seen[i]) expect(x >= 2 && y >= 2 && x <= mapW(world) - 3 && y <= mapH(world) - 3 && x <= 48 && y <= 36, `${x},${y}`).toBe(true);
    }
  });

  it('gives one free first pet at the kennel, which follows its owner', () => {
    const { world, p } = setup();
    const k = Object.values(world.objects).find((o) => o.kind === 'kennel')!;
    standAt(world, p, k.x, k.y + 2);
    expect(adoptPet(world, p.id, 'cow', ctx())).toEqual([]);
    const got = adoptPet(world, p.id, 'cat', ctx());
    expect(got.some((c) => c.t === 'open' && c.ui === 'nameAnimal')).toBe(true);
    const pet = Object.values(world.animals)[0]!;
    expect([pet.species, pet.owner]).toEqual(['cat', p.id]);
    expect(isPetAnimal(pet)).toBe(true);
    // once only
    expect(Object.values(adoptPet(world, p.id, 'dog', ctx())).some((c) => c.t === 'toast' && c.text === T.kennelOnce)).toBe(true);
    expect(Object.values(world.animals)).toHaveLength(1);
    // it follows
    standAt(world, p, 30, 25);
    for (let i = 0; i < 400; i++) tick(world, 50, ctx());
    expect(Math.hypot(pet.x - p.x, pet.y - p.y)).toBeLessThan(2 * TILE);
  });
});
