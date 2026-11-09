// Test helpers only: the lobby is closed (no edges to walk off, no jumps), but the old wild maps are still generated for
// the run zones' looks, and their tests need a way to stand on one.
import { arrivalTile } from './worldgen.ts';
import { areaCoords, areaKey } from './biomes.ts';
import { farmOf, getArea, openTileNear, placeIn } from './sim.ts';
import type { Change } from './protocol.ts';
import { SPAWN, mapH, mapW } from './map.ts';
import type { WorldState } from './types.ts';

const DIRS = { n: { dx: 0, dy: -1, opposite: 's' as const }, s: { dx: 0, dy: 1, opposite: 'n' as const }, e: { dx: 1, dy: 0, opposite: 'w' as const }, w: { dx: -1, dy: 0, opposite: 'e' as const } };

/** Puts the player on the next map over, as if they had walked off the edge (no checks). */
export function travel(world: WorldState, playerId: string, dir: 'n' | 's' | 'e' | 'w'): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const c = p ? areaCoords(p.area) : null;
  if (!p || !c) return [];
  const d = DIRS[dir];
  const nx = c.ax + d.dx;
  const ny = c.ay + d.dy;
  const keyStr = nx === 0 && ny === 0 ? 'farm' : areaKey(nx, ny);
  const target = getArea(farm, keyStr);
  if (!target) return [];
  const arrive = arrivalTile(target, d.opposite);
  const out: Change[] = [];
  placeIn(farm, p, keyStr, arrive.x, arrive.y, dir === 'n' ? 'up' : dir === 's' ? 'down' : dir === 'e' ? 'right' : 'left', out);
  return out;
}

/** Jumps to a map by its key (or home). */
export function teleport(world: WorldState, playerId: string, keyStr: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p) return [];
  const out: Change[] = [];
  if (keyStr === 'farm') placeIn(farm, p, 'farm', SPAWN.x, SPAWN.y, 'down', out);
  else {
    const target = getArea(farm, keyStr);
    if (!target) return [];
    const at = openTileNear(target, mapW(target) / 2, mapH(target) / 2);
    placeIn(farm, p, keyStr, at.x, at.y, 'down', out);
  }
  return out;
}
