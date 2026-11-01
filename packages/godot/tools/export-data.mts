// Writes packages/godot/assets/game.json from the shared game data, so the native client reads object footprints
// and solidity, the dungeons' names and colours, the monsters' names and the classes from the same source as the
// server instead of a hand-copied table. M3b adds what a fight needs: the spells, the bosses' moves (for the
// telegraphs and the cast bar), the monsters' reach and speed, the saga's items (for the loot window), the chat
// phrases and the timing constants. Run `pnpm godot:data` (Node 22 with --experimental-transform-types, as the
// script in package.json does) and commit the result; the Godot workflow fails if the json is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANIMALS,
  ATTACK_KINDS,
  BLOCK_SPECIES,
  CHAT_BUBBLE_MS,
  CHAT_MAX_LEN,
  CHEST_SIZE,
  CHAT_PHRASES,
  CLASSES,
  CROPS,
  DAY_LENGTH_MS,
  DOWN_MS,
  DUNGEONS,
  DUNGEON_IDS,
  EDGE_GAP,
  EMOTE_MS,
  FRIEND_KINDS,
  GCD_MS,
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  ITEMS,
  MAP_H,
  MAP_W,
  MAX_HEARTS,
  MAX_STACK,
  NPCS,
  OBJECTS,
  PLAYER_HALF_H,
  PLAYER_HALF_W,
  PLAYER_SPEED,
  PICKUP_RADIUS,
  PORTALS,
  POTION_CD,
  REACH,
  RIDE_SPEED_MUL,
  RARITY_COLORS,
  RARITY_NAMES,
  SAGA_BOSSES,
  SAGA_ITEMS,
  SAGA_MOBS,
  SAGA_PORTAL,
  SLOW_MUL,
  SPELLS,
  TILE,
  WALL_TERRAIN,
  WATERING_CAN_CHARGES,
  WIPE_MS,
  INVENTORY_FILTERS,
  FILTER_NAMES,
  itemName,
  CATEGORY_ORDER,
} from '../../shared/src/index.ts';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/game.json');

const objects: Record<string, { w: number; h: number; solid: boolean; flat?: true; light?: true; interact?: string; breakWith?: string; harvest?: true }> = {};
for (const [kind, d] of Object.entries(OBJECTS).sort(([a], [b]) => a.localeCompare(b))) {
  objects[kind] = { w: d.w, h: d.h, solid: d.solid, ...(d.flat ? { flat: true } : {}), ...(d.light ? { light: true } : {}), ...(d.interact ? { interact: d.interact } : {}), ...(d.breakWith ? { breakWith: d.breakWith } : {}), ...(d.harvest ? { harvest: true as const } : {}) };
}

/** The crops: how many growth stages before ripe (a crop at stage >= stages is ripe) and what it gives. */
const crops: Record<string, { stages: number; produce: string }> = {};
for (const [id, c] of Object.entries(CROPS)) crops[id] = { stages: c.stages.length, produce: c.produce };

/** How long a baby animal stays a baby (isBaby: age < growDays), by species; M4b adds what the farm tells apart: pets
 * (they follow their owner), what it gives, wild ones, and the speed of a mount (a horse has none of its own: RIDE_SPEED_MUL). */
const animals: Record<string, { growDays: number; pet?: true; wild?: true; product?: string; mount?: number }> = {};
for (const [id, a] of Object.entries(ANIMALS)) animals[id] = { growDays: a.growDays, ...(a.pet ? { pet: true as const } : {}), ...(a.wild ? { wild: true as const } : {}), ...(a.product ? { product: a.product } : {}), ...(a.mount ? { mount: a.mount.speed } : {}) };

/** The villagers: who they are and which map they live on (the sprite is npc_<id> in the atlas). */
const npcs: Record<string, { name: string; area: string }> = {};
for (const n of Object.values(NPCS)) npcs[n.id] = { name: n.name, area: n.area ?? 'farm' };

const dungeons: Record<string, unknown> = {};
for (const id of DUNGEON_IDS) {
  const d = DUNGEONS[id];
  dungeons[id] = { name: d.name, chapter: d.chapter, intro: d.intro, floor: d.floor, bossFloor: d.bossFloor, wall: d.wall, ambient: d.ambient, decor: d.decor, mini: d.mini, boss: d.boss, ...(d.illusions ? { illusions: true } : {}) };
}

/** Every creature: its name, and for a fight its reach, speed and whether it shoots (reach above 2.5). */
const mobs: Record<string, { name: string; boss?: true; mini?: true; hp: number; reach: number; speed: number; aggro: number; block?: true }> = {};
for (const [species, m] of Object.entries(SAGA_MOBS)) mobs[species] = { name: m.name, hp: m.hp, reach: m.reach, speed: m.speed, aggro: m.aggro, ...(BLOCK_SPECIES.has(species) ? { block: true as const } : {}) };
for (const [species, b] of Object.entries(SAGA_BOSSES)) mobs[species] = { name: b.name, ...(b.mini ? { mini: true as const } : { boss: true as const }), hp: b.hp, reach: b.reach, speed: b.speed, aggro: 5 };

/** The bosses' moves: what the cast bar and the telegraphs show (the browser's MOVE_COLOUR lives in the client). */
const bosses: Record<string, unknown> = {};
for (const [species, b] of Object.entries(SAGA_BOSSES)) {
  bosses[species] = {
    name: b.name,
    title: b.title,
    phases: b.phases,
    ...(b.mini ? { mini: true } : {}),
    moves: b.moves.map((m) => ({ move: m.move, name: m.name, warn: m.warn, radius: m.radius, dmg: m.dmg, ...(m.arc !== undefined ? { arc: m.arc } : {}), ...(m.width !== undefined ? { width: m.width } : {}), ...(m.interrupt ? { interrupt: true } : {}), ...(m.linger !== undefined ? { linger: m.linger } : {}), ...(m.block ? { block: m.block } : {}), text: m.text })),
    yells: b.yells,
  };
}

const spells: Record<string, unknown> = {};
for (const [id, s] of Object.entries(SPELLS)) {
  spells[id] = { name: s.name, icon: s.icon, kind: s.kind, cd: s.cd, range: s.range, power: s.power, ...(s.radius !== undefined ? { radius: s.radius } : {}), ...(s.ms !== undefined ? { ms: s.ms } : {}), text: s.text, attack: ATTACK_KINDS.has(s.kind), friend: FRIEND_KINDS.has(s.kind) };
}

const classes: Record<string, unknown> = {};
for (const c of Object.values(CLASSES)) classes[c.id] = { name: c.name, roleName: c.roleName, emoji: c.emoji, hp: c.hp, color: c.color, outfit: c.outfit, spells: c.spells };

/** The saga's items (the loot window), plus the farm items a chest can hold (potions, materials). */
const items: Record<string, { name: string; rarity: string; kind: string; text: string; category?: string; stack?: number; tool?: string; food?: true }> = {};
for (const it of SAGA_ITEMS) items[it.id] = { name: it.name, rarity: it.rarity, kind: it.kind, text: it.text };
for (const id of ['healing_potion', 'styrkedryck']) if (!items[id] && ITEMS[id]) items[id] = { name: itemName(id), rarity: 'common', kind: 'potion', text: '' };
// M4b: every item the farm knows (the bag, the hotbar and the pick-up lines name and sort them)
for (const id of Object.keys(ITEMS).sort()) {
  const d = ITEMS[id]!;
  const base = items[id] ?? { name: itemName(id), rarity: 'common', kind: d.category, text: '' };
  items[id] = { ...base, category: d.category, stack: d.stack, ...(d.tool ? { tool: d.tool } : {}), ...(d.food ? { food: true as const } : {}) };
}
/** The bag's filter chips (shared/src/filters.ts): id, emoji, the categories it keeps lit, and its name. */
const filters = INVENTORY_FILTERS.map((f) => ({ id: f.id, emoji: f.emoji, categories: f.categories, name: FILTER_NAMES[f.id] ?? f.id }));

const data = {
  _comment: 'Generated from packages/shared by `pnpm godot:data`. Do not edit; edit the shared data and run the script.',
  constants: { TILE, MAP_W, MAP_H, MAX_HEARTS, DAY_LENGTH_MS, EDGE_GAP, REACH, PICKUP_RADIUS, RIDE_SPEED_MUL, WATERING_CAN_CHARGES, HOTBAR_SIZE, INVENTORY_SIZE, CHEST_SIZE, MAX_STACK, PLAYER_SPEED, PLAYER_HALF_W, PLAYER_HALF_H, SLOW_MUL, GCD_MS, DOWN_MS, WIPE_MS, POTION_CD, CHAT_MAX_LEN, CHAT_BUBBLE_MS, EMOTE_MS },
  /** The fighter flags in a saga snapshot (sagasim.ts, SagaSnap.f). */
  flags: { down: 1, wall: 2, rage: 4, hot: 8, slow: 16, frozen: 32 },
  /** Spells that stop a boss's big attack (the browser's INTERRUPTS). */
  interruptKinds: ['bash', 'charge', 'lance'],
  wallTerrain: [...WALL_TERRAIN].sort(),
  /** Walking onto `from` on the farm moves you to `to` (the farmhouse door and the way out of the room). */
  portals: PORTALS,
  /** The size of a dungeon's arch out in the world (saga_portal). */
  sagaPortal: SAGA_PORTAL,
  objects,
  crops,
  animals,
  npcs,
  dungeons,
  mobs,
  bosses,
  spells,
  classes,
  items,
  filters,
  /** The category order the server sorts a bag by (shared/src/inventory.ts). */
  categoryOrder: CATEGORY_ORDER,
  rarity: { colors: RARITY_COLORS, names: RARITY_NAMES },
  chatPhrases: CHAT_PHRASES,
};
fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log(`${path.relative(process.cwd(), out)}: ${Object.keys(objects).length} objects, ${DUNGEON_IDS.length} dungeons, ${Object.keys(mobs).length} creatures, ${Object.keys(spells).length} spells, ${Object.keys(items).length} items`);
