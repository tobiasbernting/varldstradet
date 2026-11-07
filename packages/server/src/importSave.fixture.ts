// A realistic save of the browser game (lilla-garden, after migration 0003), built with the real game code, for the
// importer's tests: three players, a farm with a barn and animals, pets that follow, an explored map, a mid-saga
// player, and the minigames' leftovers that migration 0004 must remove.
import { SPAWN, TILE, addAnimal, addItem, addObject, createPlayer, generateArea, generateWorld, type PlayerState, type WorldState } from '../../shared/src/index.ts';
import type { SourceTables } from './importSave.ts';

/** Puts a stack in the first free slot without asking the item table (the minigames' items have no definition any more). */
const putRaw = (p: PlayerState, item: string, count: number): void => {
  const i = p.inventory.findIndex((s) => !s);
  p.inventory[i] = { item, count };
};

const look = { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' } as const;

export interface Fixture {
  src: SourceTables;
  world: WorldState;
  ids: { astrid: string; bo: string; cecilia: string };
}

export function lillaGardenSave(): Fixture {
  const world = generateWorld(1337);
  world.day = 41;
  /** The first free spot for a building of this kind, scanning the farm. */
  const place = (kind: string, extra = {}) => {
    for (let y = 8; y < 60; y++) for (let x = 8; x < 60; x++) { const o = addObject(world, kind, x, y, extra); if (o) return o; }
    throw new Error(`no room for ${kind}`);
  };
  const barn = place('barn');
  const chest = place('chest', { items: Array(8).fill(null) });
  chest.items![0] = { item: 'plush_dragon', count: 1 };
  chest.items![1] = { item: 'carrot', count: 12 };
  // the minigames' decor on the farm
  for (const [i, kind] of ['tv', 'arcade_hall', 'prize_counter', 'rally_garage', 'plush_cow', 'lava_lamp'].entries()) {
    const id = world.nextId++;
    world.objects[id] = { id, kind, x: 2 + i, y: 2 };
  }
  world.drops[world.nextId] = { id: world.nextId, item: 'trophy', count: 1, x: 100, y: 100 } as never;
  world.nextId++;
  world.drops[world.nextId] = { id: world.nextId, item: 'wood', count: 3, x: 120, y: 100 } as never;
  world.nextId++;

  // Astrid: the grown-up, rich, mid-saga, owns a dog and a horse
  const astrid = createPlayer(world, 'Astrid', look);
  astrid.coins = 4210;
  astrid.stars = 37;
  astrid.stats = { harvest: 340, chop: 120, arcade: 55, tickets: 900, rallyWins: 4 };
  astrid.achievements = ['harvest_1', 'arcade_1', 'rally_1', 'chop_1'];
  putRaw(astrid, 'cart_rally', 1);
  addItem(astrid.inventory, 'carrot', 30);
  astrid.saga = { cls: 'krigare', chapter: 2, heard: true, cleared: ['draug', 'frost'], titles: ['Draugdräparen'], quests: { q1: 2 }, done: ['q0'], found: ['dog'] } as never;
  (astrid as unknown as Record<string, unknown>).arcade = { best: { rally: 123 }, tickets: 900 };
  (astrid as unknown as Record<string, unknown>).garage = { car: 'red' };
  astrid.visited = ['farm', 'a:-1,-1', 'arcade:hall'];

  // Bo (7): few coins, minigame prizes in the bag, no saga yet
  const bo = createPlayer(world, 'Bo', { ...look, hairStyle: 'long' });
  bo.coins = 85;
  bo.stars = 6;
  putRaw(bo, 'plush_cow', 1);
  putRaw(bo, 'trophy', 1);
  addItem(bo.inventory, 'wheat', 5);

  // Cecilia: was inside Spelhallen when the game was stopped
  const cecilia = createPlayer(world, 'Cecilia', look);
  cecilia.area = 'arcade:hall';
  cecilia.x = 3 * TILE;
  cecilia.y = 5 * TILE;
  cecilia.coins = 640;
  cecilia.stars = 12;

  const cow = addAnimal(world, 'cow', barn.id, 'Mu');
  const dog = addAnimal(world, 'dog', barn.id, 'Fido');
  dog.owner = astrid.id;
  const cat = addAnimal(world, 'cat', barn.id, 'Misse');
  cat.owner = bo.id;
  void cow;
  world.crops['10,40'] = { kind: 'carrot', stage: 2, watered: true, plantedDay: 40 } as never;

  // an explored map that the family built on (a Spelhallen map and a dungeon came with the save too)
  const area = generateArea(-1, -1);
  area.area = 'a:-1,-1';
  const extra = world.nextId++;
  area.objects[extra] = { id: extra, kind: 'neon_sign', x: 5, y: 5 };
  area.drops[extra + 1] = { id: extra + 1, item: 'disco_ball', count: 1, x: 10, y: 10 } as never;

  const row = (p: PlayerState) => ({ id: p.id, name: p.name, data: structuredClone(p), created_at: '2026-10-20 18:00:00.123+00' });
  const src: SourceTables = {
    world: [{ id: 1, day: world.day, time_ms: 123456, next_id: world.nextId + 10, season_override: null, terrain: world.terrain, drops: world.drops, saga_best: null, updated_at: '2026-10-31 20:00:00+00' }],
    objects: Object.values(world.objects).map((o) => ({ id: o.id, kind: o.kind, x: o.x, y: o.y, data: structuredClone(o) })),
    crops: Object.entries(world.crops).map(([k, data]) => ({ k, data })),
    animals: Object.values(world.animals).map((a) => ({ id: a.id, species: a.species, name: a.name, data: structuredClone(a) })),
    players: [row(astrid), row(bo), row(cecilia)],
    areas: [
      { key: 'a:-1,-1', biome: area.biome ?? 'skog', data: area, updated_at: '2026-10-31 19:00:00+00' },
      { key: 'arcade:hall', biome: 'arcade', data: { objects: {}, drops: {} }, updated_at: '2026-10-31 19:00:00+00' },
      { key: 'saga:draug', biome: 'dungeon', data: { objects: {}, drops: {} }, updated_at: '2026-10-31 19:00:00+00' },
    ],
    devices: [{ id: 'dev1', data: { id: 'dev1', tokenHash: 'abc', name: 'Annas surfplatta' } }, { id: 'dev2', data: { id: 'dev2' } }],
    invites: [{ id: 'inv1', data: { id: 'inv1', label: 'Kusin Anna' } }],
    settings: [{ key: 'access', value: '{"mode":"family","from":null,"to":null,"totpSecret":null}' }],
  };
  return { src, world, ids: { astrid: astrid.id, bo: bo.id, cecilia: cecilia.id } };
}

export { SPAWN };
