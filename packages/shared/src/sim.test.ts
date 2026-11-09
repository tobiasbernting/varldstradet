import { describe, expect, it, vi } from 'vitest';
import * as shared from './index.ts';
import {
  CROPS,
  DAY_LENGTH_MS,
  SPAWN,
  NPCS,
  T,
  objectDef,
  adoptPet,
  TILE,
  addAnimal,
  addItem,
  addObject,
  CAVE_EXIT_TILE,
  MAX_HEARTS,
  applyMove,
  ensureCity,
  ensureTownDress,
  SAGA_XP,
  isCity,
  reachableFrom,
  removeObject,
  isVehicle,
  areaOf,
  getArea,
  BATH_EXIT,
  BATH_POOL,
  SWIM_SPEED_MUL,
  PLAYER_SPEED,
  RUN_SPEED_MUL,
  RIDE_SPEED_MUL,
  MOVE_CREDIT_S,
  MOVE_SLACK,
  inPool,
  ensureBathhouse,
  ensureFarmBusStop,
  ensureTransport,
  FARM_BUS_STOP,
  CITY_BUS_STOP,
  CITY_STATION,
  arrivalTile,
  biomeAt,
  generateArea,
  spawnDrop,
  rideSpeedMul,
  honk,
  bump,
  dungeonStart,
  generateDungeon,
  spawnMob,
  npcAt,
  npcState,
  npcsIn,
  countItem,
  createPlayer,
  emote,
  equip,
  generateWorld,
  isSolidForPlayer,
  isHostile,
  isPetAnimal,
  ANIMALS,
  key,
  mulberry32,
  nameAnimal,
  newDay,
  objectAt,
  performAction,
  resolveMove,
  mapH,
  mapW,
  WILD_MAP,
  seasonForDate,
  setOnline,
  stepPlayer,
  BOOST_SPEED_MUL,
  ensurePizzeria,
  swapSlots,
  sortSlots,
  quickStackToChest,
  tick,
  tileIndex,
  paint,
  swapSlots as swap,
  PAINT_EMPTY,
  findRooms,
  type Change,
  type PlayerState,
  type SimCtx,
  type WorldState,
} from './index.ts';
import { teleport, travel } from './testtravel.ts';

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
  delete world.crops[key(tx, ty)];
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


  it('animals wander but never through fences', () => {
    const { world, p } = setup();
    for (let y = 28; y < 40; y++) for (let x = 28; x < 40; x++) clearTile(world, x, y);
    const hutch = addObject(world, 'hutch', 33, 33)!;
    const rabbit = addAnimal(world, 'rabbit', hutch.id, 'Skutt');
    // Fence a 5x5 pen around (31..35, 31..35)
    for (let i = 30; i <= 36; i++) {
      addObject(world, 'fence', i, 30);
      addObject(world, 'fence', i, 36);
      addObject(world, 'fence', 30, i);
      addObject(world, 'fence', 36, i);
    }
    rabbit.x = 32 * TILE + 8;
    rabbit.y = 35 * TILE + 8;
    const c = ctx();
    for (let i = 0; i < 20 * 120; i++) tick(world, 50, c);
    expect(rabbit.x).toBeGreaterThan(31 * TILE);
    expect(rabbit.x).toBeLessThan(36 * TILE);
    expect(rabbit.y).toBeGreaterThan(31 * TILE);
    expect(rabbit.y).toBeLessThan(36 * TILE);
    void p;
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

describe('house, villagers, fishing', () => {
  it('the farmhouse door is walkable and asks whose house to enter (house.ts takes it from there)', () => {
    const { world, p } = setup();
    standAt(world, p, 10, 9);
    for (let i = 0; i < 4; i++) stepPlayer(world, p, 0, -1, 50);
    expect([Math.floor(p.x / 16), Math.floor(p.y / 16)]).toEqual([10, 8]);
    delete p.moveLock;
    expect(tick(world, 50, ctx()).some((c) => c.t === 'open' && c.ui === 'houses' && c.to === p.id)).toBe(true);
  });




});

describe('grottan', () => {
  const weapons = (p: PlayerState) => {
    addItem(p.inventory, 'sword', 1);
    addItem(p.inventory, 'bow', 1);
    addItem(p.inventory, 'shield', 1);
  };

  it('generates a cave with rooms, an exit, monsters and a boss', () => {
    const d = generateDungeon(42);
    expect(d.area).toBe('dungeon');
    const kinds = Object.values(d.objects).map((o) => o.kind);
    expect(kinds).toContain('cave_exit');
    expect(kinds).toContain('cave_wall');
    expect(kinds).toContain('cave_torch');
    const mobs = Object.values(d.animals);
    expect(mobs.filter((a) => a.species === 'boss').length).toBe(1);
    expect(mobs.length).toBeGreaterThan(3);
    const start = dungeonStart(d);
    expect(isSolidForPlayer(d, start.x, start.y)).toBe(false);
    // the start tile and the boss room are connected floor (walk a flood fill)
    const seen = new Set<string>([key(start.x, start.y)]);
    const stack: [number, number][] = [[start.x, start.y]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const k = key(x + dx, y + dy);
        if (seen.has(k) || d.terrain[(y + dy) * 64 + x + dx] !== 'floor_stone' || objectAt(d, x + dx, y + dy)?.kind === 'cave_wall') continue;
        seen.add(k);
        stack.push([x + dx, y + dy]);
      }
    }
    const br = d.dungeonInfo!.bossRoom;
    expect(seen.has(key(br.x + 1, br.y + 1))).toBe(true);
  });





});

describe('världen utanför', () => {
  it('biomes follow geography: cold north, dry south, mountains east, coast west', () => {
    // far north it is cold, far south hot, east mountainous, west by the sea (with a mix in between)
    const share = (cells: [number, number][], kinds: string[]) => cells.filter(([x, y]) => kinds.includes(biomeAt(x, y))).length / cells.length;
    const row = (y: number) => Array.from({ length: 21 }, (_, i) => [i - 10, y] as [number, number]);
    const col = (x: number) => Array.from({ length: 21 }, (_, i) => [x, i - 10] as [number, number]);
    expect(share(row(-9), ['is', 'berg', 'skog', 'by'])).toBeGreaterThan(0.8);
    expect(share(row(9), ['oken', 'dino', 'djungel', 'vulkan', 'trask', 'strand', 'by', 'godis'])).toBeGreaterThan(0.8);
    expect(share(col(9), ['berg', 'skog', 'svamp', 'ang', 'is', 'vulkan', 'oken', 'dino', 'by', 'godis'])).toBeGreaterThan(0.8);
    expect(share(col(-9), ['strand', 'trask', 'ang', 'skog', 'is', 'djungel', 'by', 'godis', 'berg'])).toBeGreaterThan(0.8);
    expect(biomeAt(1, 0)).toBe(biomeAt(1, 0)); // deterministic
  });

  it('generates areas with open edges and biome specials', () => {
    const a = generateArea(0, -2); // the ice right north of the forest
    expect(a.biome).toBe('is');
    expect(a.terrain.filter((t) => t === 'snow').length).toBeGreaterThan(a.terrain.length / 2);
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const t = arrivalTile(a, side);
      expect(isSolidForPlayer(a, t.x, t.y)).toBe(false);
    }
    expect(Object.values(a.objects).some((o) => o.kind === 'iceberry')).toBe(true);
    const b = generateArea(-4, 1);
    if (b.biome === 'strand') expect(b.terrain.includes('water')).toBe(true);
  });


  it('ticks animals and drops in occupied areas and tags their changes', () => {
    const { world, p } = setup();
    standAt(world, p, 32, 0);
    travel(world, p.id, 'n');
    const north = areaOf(world, p);
    spawnDrop(north, 'iceberry', 1, p.x, p.y);
    const ch = tick(world, 50, ctx());
    const drop = ch.find((c) => c.t === 'drop');
    expect(drop && 'area' in drop && drop.area).toBe('a:0,-1');
    expect(countItem(p.inventory, 'iceberry')).toBe(1);
  });
});

describe('hästar', () => {
  const stable = () => {
    const { world, p } = setup();
    for (let y = 28; y < 38; y++) for (let x = 28; x < 40; x++) clearTile(world, x, y);
    const stall = addObject(world, 'stall', 30, 28)!;
    const horse = addAnimal(world, 'horse', stall.id, 'Blixten');
    horse.owner = p.id;
    horse.petted = true;
    horse.x = 34 * TILE + 8;
    horse.y = 34 * TILE + 8;
    standAt(world, p, 33, 34);
    return { world, p, stall, horse };
  };




  it('gets off the horse when leaving the farm', () => {
    const { world, p, horse } = stable();
    performAction(world, p.id, 34, 34, ctx());
    expect(p.riding).toBe(horse.id);
    standAt(world, p, 32, 0);
    travel(world, p.id, 'n');
    expect(p.area).not.toBe('farm');
    expect(p.riding).toBeUndefined();
    expect(horse.y).toBeLessThan(3 * TILE);
    expect(Object.values(areaOf(world, p).animals).some((a) => a.species === 'horse')).toBe(false);
  });
});

describe('badhuset', () => {
  const toVillage = () => {
    const { world, p } = setup();
    standAt(world, p, 63, 32);
    travel(world, p.id, 'e');
    expect(p.area).toBe('a:1,0');
    const village = areaOf(world, p);
    expect(village.biome).toBe('by');
    return { world, p, village };
  };

  it('every village has a bath house, also villages saved before it existed', () => {
    const { village } = toVillage();
    const bath = Object.values(village.objects).filter((o) => o.kind === 'bathhouse');
    expect(bath).toHaveLength(1);
    // a village without one gets one on load
    delete village.objects[bath[0]!.id];
    expect(ensureBathhouse(village)).toBe(true);
    expect(ensureBathhouse(village)).toBe(false);
    expect(Object.values(village.objects).filter((o) => o.kind === 'bathhouse')).toHaveLength(1);
  });

});

describe('vilda djur skräms och kommer tillbaka (M7b)', () => {
  const at = (now: number): SimCtx => ({ season: 'none', rnd: () => 0.5, now });
  function outdoors(species: string, dx = 3) {
    const { world, p } = setup();
    standAt(world, p, 32, 0);
    travel(world, p.id, 'n');
    const area = areaOf(world, p);
    for (const a of Object.values(area.animals)) delete area.animals[a.id];
    standAt(world, p, 30, 30);
    for (let x = 14; x <= 50; x++) for (let y = 24; y <= 36; y++) clearTile(area, x, y);
    const a = spawnMob(area, species, 30 + dx, 30);
    a.hp = 1;
    return { world, p, area, a };
  }

  it('an animal runs from a hero who walks at it, and walks back once the hero has stopped', () => {
    const { world, p, area, a } = outdoors('hare');
    const home = { x: a.x, y: a.y };
    p.moving = true;
    let now = 1_000_000;
    tick(world, 100, at((now += 100)));
    expect(a.fleeUntil).toBeDefined();
    expect(a.haunt).toEqual(home);
    // a few steps of running: farther from the hero each time
    let last = Math.hypot(a.x - p.x, a.y - p.y);
    for (let i = 0; i < 6; i++) {
      tick(world, 100, at((now += 100)));
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      expect(d).toBeGreaterThan(last);
      last = d;
    }
    expect(a.moving).toBe(true);
    expect(a.x).toBeGreaterThan(home.x + 2 * TILE);
    // the hero stops: nothing startles it again, and after a while it is back where it was
    p.moving = false;
    let closest = Infinity;
    let farthest = 0;
    for (let i = 0; i < 400; i++) {
      tick(world, 100, at((now += 100)));
      const d = Math.hypot(a.x - home.x, a.y - home.y);
      if (i > 30) closest = Math.min(closest, d);
      if (i > 150) farthest = Math.max(farthest, d);
    }
    expect(closest).toBeLessThan(0.7 * TILE); // it came back to its spot...
    expect(farthest).toBeLessThan(8 * TILE); // ...and then potters about it, as before
    expect(a.startled).toBeUndefined();
    expect(a.fleeUntil).toBeUndefined();
  });

  it('a startled animal that has calmed down creeps up to a hero who stands still, so it can be petted', () => {
    const { world, p, a } = outdoors('hare', 2);
    p.moving = true;
    let now = 1_000_000;
    for (let i = 0; i < 10; i++) tick(world, 100, at((now += 100)));
    expect(a.fleeUntil).toBeDefined();
    p.moving = false;
    let closest = Infinity;
    for (let i = 0; i < 300; i++) {
      tick(world, 100, at((now += 100)));
      if (i > 40) closest = Math.min(closest, Math.hypot(a.x - p.x, a.y - p.y));
    }
    expect(closest).toBeLessThan(2 * TILE); // it came within petting reach
    // one that was never startled just goes about its business
    const other = outdoors('hare', 5);
    for (let i = 0; i < 20; i++) tick(other.world, 100, at(1_000_000 + i * 100));
    expect(other.a.haunt).toBeUndefined();
  });

  it('it takes the other side of the hero when the tile on its own side is blocked', () => {
    const { world, p, area, a } = outdoors('hare', 2);
    a.x = p.x + 4 * TILE; // straight to the right of the hero, who faces the water on that side
    a.y = p.y + 1.5 * TILE;
    a.haunt = { x: a.x, y: a.y };
    area.terrain[tileIndex(area, Math.floor(p.x / TILE) + 1, Math.floor(p.y / TILE))] = 'water';
    p.moving = false;
    for (let i = 0; i < 400; i++) tick(world, 100, at(1_000_000 + i * 100));
    expect([Math.floor(a.x / TILE) - Math.floor(p.x / TILE), Math.floor(a.y / TILE) - Math.floor(p.y / TILE)]).toEqual([0, 1]);
  });


  it('only online players on the animal\'s own map startle it (the watchers are collected once per tick)', () => {
    let t = outdoors('hare');
    t.p.moving = true;
    t.p.online = false;
    tick(t.world, 100, at(1_000_100));
    expect(t.a.fleeUntil).toBeUndefined();
    t = outdoors('hare');
    t.p.moving = true;
    t.p.area = 'farm'; // (elsewhere, though standing at the same coordinates)
    tick(t.world, 100, at(1_000_100));
    expect(t.a.fleeUntil).toBeUndefined();
  });

  it('it is the same every time (no random numbers) and a lasso scare still ends as before', () => {
    const run = () => {
      const { world, p, a } = outdoors('deer');
      p.moving = true;
      for (let i = 0; i < 20; i++) tick(world, 100, { season: 'none', rnd: () => 0.5, now: 1_000_000 + i * 100 });
      return [a.x, a.y, a.fleeUntil];
    };
    expect(run()).toEqual(run());
  });
});

describe('lasso och rovdjur', () => {
  const at = (now: number, r: number): SimCtx => ({ season: 'none', rnd: () => r, now });
  /** Player in the area north of the farm with a lasso in hand and a wild animal two tiles to the right. */
  function outdoors(species: string) {
    const { world, p } = setup();
    standAt(world, p, 32, 0);
    travel(world, p.id, 'n');
    const area = areaOf(world, p);
    for (const a of Object.values(area.animals)) delete area.animals[a.id];
    standAt(world, p, 30, 30);
    for (let x = 28; x <= 36; x++) for (let y = 27; y <= 33; y++) clearTile(area, x, y);
    const a = spawnMob(area, species, 32, 30);
    a.hp = ANIMALS[species]?.predator?.hp ?? 1;
    addItem(p.inventory, 'lasso', 1);
    p.selected = p.inventory.findIndex((s) => s?.item === 'lasso');
    return { world, p, area, a };
  }

  it('predators bite one heart with a cooldown, tamed ones do not, and fainting sends you home', () => {
    const { world, p, area, a } = outdoors('bear');
    a.x = p.x + TILE; // right next to the player
    a.y = p.y;
    expect(isHostile(a)).toBe(true);
    tick(world, 50, at(2_000_000, 0.5));
    expect(p.hearts).toBe(MAX_HEARTS - 1);
    tick(world, 50, at(2_000_100, 0.5));
    expect(p.hearts).toBe(MAX_HEARTS - 1); // still on cooldown
    tick(world, 50, at(2_001_700, 0.5));
    expect(p.hearts).toBe(MAX_HEARTS - 2);
    // hearts grow back after a game hour outdoors (and the bear bites again)
    tick(world, 50, at(2_001_700 + DAY_LENGTH_MS / 24 + 1, 0.5));
    expect(p.hearts).toBe(MAX_HEARTS - 2);
    // a tamed bear is a friend
    a.owner = p.id;
    p.hearts = 3;
    delete p.healAt;
    const quiet = tick(world, 50, at(2_100_000, 0.5));
    expect(p.hearts).toBe(3);
    expect(quiet.some((c) => c.t === 'fx' && c.kind === 'hit')).toBe(false);
    expect(isHostile(a)).toBe(false);
    // fainting: last heart lost outdoors wakes you up at home with everything you carried
    delete a.owner;
    a.x = p.x + TILE;
    a.y = p.y;
    p.hearts = 1;
    p.healAt = 9_000_000; // no heart grows back before the bite
    addItem(p.inventory, 'fur', 2);
    const ch = tick(world, 50, at(2_200_000, 0.5));
    expect(p.area).toBe('farm');
    expect(p.hearts).toBe(MAX_HEARTS);
    expect(countItem(p.inventory, 'fur')).toBe(2);
    expect(toasts(ch).some((t) => t.includes('svimmade'))).toBe(true);
  });

});


describe('staden', () => {
  const tileOfPx = (v: number) => Math.floor(v / TILE);
  const DIRS: Record<string, [number, number]> = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };

  it('has streets with sidewalks and crossings, a square, a station with rails, and traffic on the streets', () => {
    const city = generateArea(1, 0);
    expect(city.biome).toBe('by');
    const T = city.terrain;
    expect(T.filter((t) => t === 'road').length).toBeGreaterThan(200);
    for (const t of ['sidewalk', 'crossing', 'rail', 'path_stone'] as const) expect(T).toContain(t);
    const kinds = Object.values(city.objects).map((o) => o.kind);
    for (const k of ['bus_stop', 'train_station', 'apartment', 'shop', 'traffic_light', 'street_lamp', 'parked_car', 'pizzeria', 'bathhouse', 'market', 'sellstall', 'town_well'])
      expect(kinds).toContain(k);
    expect(kinds.filter((k) => k === 'house_small').length).toBeGreaterThanOrEqual(8);
    const species = Object.values(city.animals).map((a) => a.species);
    expect(species.filter((s) => s === 'car')).toHaveLength(4);
    expect(species.filter((s) => s === 'motorcycle')).toHaveLength(2);
    expect(species.filter((s) => s === 'bus')).toHaveLength(2);
    expect(species.filter((s) => s === 'train')).toHaveLength(1);
    for (const a of Object.values(city.animals)) if (isVehicle(a)) expect(['road', 'crossing', 'rail']).toContain(T[tileIndex(city, tileOfPx(a.x), tileOfPx(a.y))]);
    // the openings in the edges lead straight onto the main streets
    expect(T[tileIndex(city, 32, 1)]).toBe('road');
    expect(T[tileIndex(city, 1, 33)]).toBe('road');
    expect(T[tileIndex(city, 62, 34)]).toBe('road');
    // the villagers' spots are on walkable ground, off the streets
    for (const n of npcsIn(city))
      for (const w of [n, ...n.routine]) {
        expect(objectAt(city, w.x, w.y)).toBeUndefined();
        expect(['road', 'crossing']).not.toContain(T[tileIndex(city, w.x, w.y)]);
      }
  });

  it('is dressed as a Norse market town, and a city saved before that gets dressed once, still walkable', () => {
    const DRESS = ['banner_pole', 'barrel_stack', 'runestone', 'hay_cart'];
    const counts = (w: WorldState): Record<string, number> => Object.fromEntries(DRESS.map((k) => [k, Object.values(w.objects).filter((o) => o.kind === k).length]));
    const walkable = (w: WorldState): void => {
      const reach = reachableFrom(w, arrivalTile(w, 'w'));
      for (const side of ['n', 's', 'e'] as const) expect(reach[tileIndex(w, arrivalTile(w, side).x, arrivalTile(w, side).y)], side).toBe(1);
      // the villagers' spots, the doors, and every open tile of the square
      for (const n of npcsIn(w)) for (const wp of [n, ...n.routine]) expect(reach[tileIndex(w, wp.x, wp.y)], `${n.id} ${wp.x},${wp.y}`).toBe(1);
      for (const o of Object.values(w.objects))
        if (['pizzeria', 'bathhouse', 'train_station'].includes(o.kind)) expect(reach[tileIndex(w, o.x + 1, o.y + 2)], o.kind).toBe(1);
      for (let y = 20; y <= 31; y++) for (let x = 34; x <= 47; x++) if (!isSolidForPlayer(w, x, y)) expect(reach[tileIndex(w, x, y)], `square ${x},${y}`).toBe(1);
    };
    const city = generateArea(1, 0);
    expect(counts(city)).toEqual({ banner_pole: 2, barrel_stack: 3, runestone: 1, hay_cart: 1 });
    walkable(city);
    expect(ensureTownDress(city)).toBe(false);
    // a city saved before Saga III
    for (const o of Object.values(city.objects)) if (DRESS.includes(o.kind)) removeObject(city, o.id);
    expect(counts(city)).toEqual({ banner_pole: 0, barrel_stack: 0, runestone: 0, hay_cart: 0 });
    expect(ensureTownDress(city)).toBe(true);
    expect(counts(city)).toEqual({ banner_pole: 2, barrel_stack: 3, runestone: 1, hay_cart: 1 });
    expect(ensureTownDress(city)).toBe(false);
    walkable(city);
    // a spot the kids have built on is left alone
    const stone = Object.values(city.objects).find((o) => o.kind === 'runestone')!;
    removeObject(city, stone.id);
    addObject(city, 'chest', stone.x, stone.y);
    expect(ensureTownDress(city)).toBe(false);
    expect(objectAt(city, stone.x, stone.y)?.kind).toBe('chest');
    // not a city: nothing
    expect(ensureTownDress(generateWorld(1))).toBe(false);
  });

  it('a village saved before the streets existed is rebuilt as a city, once', () => {
    const old = generateArea(1, 0);
    old.terrain = old.terrain.map((t) => (t === 'road' || t === 'sidewalk' || t === 'crossing' || t === 'rail' ? 'grass' : t));
    old.animals = {};
    expect(isCity(old)).toBe(false);
    expect(ensureCity(old)).toBe(true);
    expect(isCity(old)).toBe(true);
    expect(Object.values(old.animals).some((a) => a.species === 'bus')).toBe(true);
    expect(Object.values(old.objects).some((o) => o.kind === 'train_station')).toBe(true);
    expect(ensureCity(old)).toBe(false);
  });
});


describe('sort and quick stack', () => {
  function placeChest(world: WorldState, p: PlayerState) {
    addItem(p.inventory, 'chest', 1);
    standAt(world, p, 20, 20);
    clearTile(world, 21, 20);
    select(p, 'chest');
    performAction(world, p.id, 21, 20, ctx());
    return objectAt(world, 21, 20)!;
  }

  it('sortSlots sorts only the backpack and keeps hotbar and selected', () => {
    const { world, p } = setup();
    const hotbar = p.inventory.slice(0, 8).map((s) => (s ? { ...s } : null));
    p.selected = 2;
    for (let i = 8; i < 32; i++) p.inventory[i] = null;
    p.inventory[20] = { item: 'carrot', count: 3 };
    p.inventory[9] = { item: 'carrot', count: 4 };
    p.inventory[15] = { item: 'hoe', count: 1 };
    const out = sortSlots(world, p.id);
    expect(p.inventory.slice(0, 8)).toEqual(hotbar);
    expect(p.selected).toBe(2);
    expect(p.inventory[8]?.item).toBe('hoe');
    expect(p.inventory[9]).toEqual({ item: 'carrot', count: 7 });
    expect(p.inventory[10]).toBeNull();
    expect(toasts(out)).toContain('Sorterat!');
    expect(out.some((c) => c.t === 'player')).toBe(true);
  });



  it('sortSlots keeps the held backpack stack selected', () => {
    const { world, p } = setup();
    for (let i = 8; i < 32; i++) p.inventory[i] = null;
    p.inventory[9] = { item: 'carrot', count: 4 };
    p.inventory[20] = { item: 'hoe', count: 1 };
    p.inventory[25] = { item: 'potato', count: 2 };
    p.selected = 25;
    sortSlots(world, p.id);
    expect(p.inventory[p.selected]).toEqual({ item: 'potato', count: 2 });
    expect(p.selected).toBeGreaterThanOrEqual(8);
    // a merged stack is followed by item id
    for (let i = 8; i < 32; i++) p.inventory[i] = null;
    p.inventory[9] = { item: 'carrot', count: 4 };
    p.inventory[20] = { item: 'carrot', count: 3 };
    p.selected = 20;
    sortSlots(world, p.id);
    expect(p.inventory[p.selected]?.item).toBe('carrot');
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
    expect(Object.keys(world.crops)).toHaveLength(0);
    expect(Object.keys(world.animals)).toHaveLength(0);
    for (const o of Object.values(world.objects)) expect(['mailbox', 'sellbox', 'start_chest', 'start_bench', 'cave', 'bus_stop']).not.toContain(o.kind);
    expect(p.inventory.filter(Boolean)).toHaveLength(0);
    expect(Object.values(NPCS).map((n) => n.id).sort()).toEqual(['sigrun', 'stina']);
  });

  it('cannot be changed: no chopping, digging, planting or building, whatever is held', () => {
    const { world, p } = setup();
    for (const tool of ['axe', 'hoe', 'hammer', 'pick', 'fence', 'carrot_seed']) {
      addItem(p.inventory, tool, 1);
      p.selected = p.inventory.findIndex((s) => s?.item === tool);
      standAt(world, p, 20, 25);
      clearTile(world, 21, 25);
      const before = JSON.stringify([world.terrain.slice(0, 4096), Object.keys(world.objects).length, world.crops]);
      for (const [tx, ty] of [[21, 25], [20, 26], [6, 18], [24, 14]] as const) {
        p.x = (tx - 1) * TILE + TILE / 2;
        p.y = ty * TILE + TILE / 2;
        performAction(world, p.id, tx, ty, ctx());
      }
      expect(JSON.stringify([world.terrain.slice(0, 4096), Object.keys(world.objects).length, world.crops])).toBe(before);
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
