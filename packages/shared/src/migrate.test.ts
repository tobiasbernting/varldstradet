import { describe, expect, it } from 'vitest';
import { generateWorld, rebuildOccupancy } from './map.ts';
import { REMOVED_ACHIEVEMENTS, REMOVED_STATS, isRemovedAreaKey, scrubArea, scrubPlayer } from './migrate.ts';
import { createPlayer } from './sim.ts';
import { key } from './types.ts';

describe('saves from before the minigames went (2026-11-01)', () => {
  it('drops a player\'s scores, tickets, garage, minigame counters, achievements and prizes, and nothing else', () => {
    const world = generateWorld(1);
    const p = createPlayer(world, 'Nisse', { skin: '#fff', hair: '#000', hairStyle: 'short' });
    const old = p as unknown as Record<string, unknown>;
    old.arcade = { best: { golf: 1200 }, tickets: 40, games: ['rally'], day: 3, won: 10 };
    old.garage = { cars: [{ id: 1, body: 'hatch' }], active: 1, best: {}, roam: { day: 0, coins: 0 } };
    p.stats = { harvest: 12, tickets: 200, rallyWins: 3, arcade: 5 };
    p.achievements = ['harvest_1', 'tickets_200', 'rally_1'];
    p.stars = 9;
    p.inventory[0] = { item: 'carrot', count: 3 };
    p.inventory[1] = { item: 'plush_cow', count: 1 };
    p.inventory[2] = { item: 'tv', count: 1 };
    expect(scrubPlayer(p)).toBe(true);
    expect('arcade' in old).toBe(false);
    expect('garage' in old).toBe(false);
    expect(p.stats).toEqual({ harvest: 12 });
    expect(p.achievements).toEqual(['harvest_1']);
    expect(p.stars).toBe(9);
    expect(p.inventory[0]?.item).toBe('carrot');
    expect(p.inventory[1]).toBeNull();
    expect(p.inventory[2]).toBeNull();
    // a second pass finds nothing, and a fresh player is left alone
    expect(scrubPlayer(p)).toBe(false);
    expect(scrubPlayer(createPlayer(world, 'Lisa', { skin: '#fff', hair: '#000', hairStyle: 'short' }))).toBe(false);
    for (const s of REMOVED_STATS) expect(p.stats[s]).toBeUndefined();
    for (const a of REMOVED_ACHIEVEMENTS) expect(p.achievements).not.toContain(a);
  });

  it('takes the TV, the garage and the prizes out of a saved map and leaves the rest standing', () => {
    const world = generateWorld(1);
    const before = Object.keys(world.objects).length;
    const put = (kind: string, x: number, y: number, extra: Record<string, unknown> = {}): number => {
      const id = world.nextId++;
      world.objects[id] = { id, kind, x, y, ...extra };
      world.occupancy[key(x, y)] = id;
      return id;
    };
    put('tv', 30, 10);
    put('rally_garage', 20, 8);
    put('lava_lamp', 31, 10);
    const chest = put('chest', 32, 10, { items: [{ item: 'wood', count: 5 }, { item: 'trophy', count: 1 }] });
    world.drops[world.nextId++] = { id: world.nextId - 1, item: 'plush_hen', count: 1, x: 10, y: 10 };
    world.drops[world.nextId++] = { id: world.nextId - 1, item: 'carrot', count: 1, x: 11, y: 10 };
    expect(scrubArea(world)).toBe(true);
    expect(Object.keys(world.objects).length).toBe(before + 1);
    expect(Object.values(world.objects).map((o) => o.kind)).not.toContain('tv');
    expect(world.occupancy[key(30, 10)]).toBeUndefined();
    expect(world.occupancy[key(32, 10)]).toBe(chest);
    expect(world.objects[chest]!.items).toEqual([{ item: 'wood', count: 5 }, null]);
    expect(Object.values(world.drops).map((d) => d.item)).toEqual(['carrot']);
    expect(() => rebuildOccupancy(world)).not.toThrow();
    expect(scrubArea(world)).toBe(false);
  });

  it('knows which saved maps were only there for Spelhallen', () => {
    expect(isRemovedAreaKey('arcade:a:1,0')).toBe(true);
    expect(isRemovedAreaKey('bath:a:1,0')).toBe(false);
    expect(isRemovedAreaKey('a:1,0')).toBe(false);
  });
});
