// Writes packages/godot/assets/game.json from the shared game data, so the native client reads object footprints
// and solidity, the dungeons' names and colours, the monsters' names and the classes from the same source as the
// server instead of a hand-copied table. Run `pnpm godot:data` (Node 22 with --experimental-transform-types, as the script in package.json does) and commit
// the result; the Godot workflow fails if the json is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLASSES,
  DUNGEONS,
  DUNGEON_IDS,
  MAP_H,
  MAP_W,
  OBJECTS,
  PLAYER_HALF_H,
  PLAYER_HALF_W,
  PLAYER_SPEED,
  SAGA_BOSSES,
  SAGA_MOBS,
  SLOW_MUL,
  TILE,
  WALL_TERRAIN,
} from '../../shared/src/index.ts';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/game.json');

const objects: Record<string, { w: number; h: number; solid: boolean; flat?: true; light?: true }> = {};
for (const [kind, d] of Object.entries(OBJECTS).sort(([a], [b]) => a.localeCompare(b))) {
  objects[kind] = { w: d.w, h: d.h, solid: d.solid, ...(d.flat ? { flat: true } : {}), ...(d.light ? { light: true } : {}) };
}

const dungeons: Record<string, unknown> = {};
for (const id of DUNGEON_IDS) {
  const d = DUNGEONS[id];
  dungeons[id] = { name: d.name, chapter: d.chapter, intro: d.intro, floor: d.floor, bossFloor: d.bossFloor, wall: d.wall, ambient: d.ambient, decor: d.decor, mini: d.mini, boss: d.boss, ...(d.illusions ? { illusions: true } : {}) };
}

const mobs: Record<string, { name: string; boss?: true; mini?: true }> = {};
for (const [species, m] of Object.entries(SAGA_MOBS)) mobs[species] = { name: m.name };
for (const [species, b] of Object.entries(SAGA_BOSSES)) mobs[species] = { name: b.name, ...(b.mini ? { mini: true } : { boss: true }) };

const classes: Record<string, unknown> = {};
for (const c of Object.values(CLASSES)) classes[c.id] = { name: c.name, roleName: c.roleName, hp: c.hp, color: c.color, outfit: c.outfit };

const data = {
  _comment: 'Generated from packages/shared by `pnpm godot:data`. Do not edit; edit the shared data and run the script.',
  constants: { TILE, MAP_W, MAP_H, PLAYER_SPEED, PLAYER_HALF_W, PLAYER_HALF_H, SLOW_MUL },
  wallTerrain: [...WALL_TERRAIN].sort(),
  objects,
  dungeons,
  mobs,
  classes,
};
fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log(`${path.relative(process.cwd(), out)}: ${Object.keys(objects).length} objects, ${DUNGEON_IDS.length} dungeons, ${Object.keys(mobs).length} creatures`);
