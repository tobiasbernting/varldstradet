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
  SPACEPORT,
  itemName,
  CATEGORY_ORDER,
  RECIPES,
  COOKING,
  PAINTED_SELL,
  T,
  SAGA_CHAPTERS,
  SAGA_QUESTS,
  RARITY_POWER,
  LEVEL_BONUS,
  POWER_CAP,
  ARMOR_CAP,
  CLASS_FIT,
  XP_LEVELS,
  FORGE_MAX,
  FORGE_COSTS,
  LEVEL_REWARDS,
  VOLVA_ID,
  NPC_TALK,
  JOKES,
  RIDDLES,
  RIGHT,
  WRONG,
  WEATHER_TALK,
  HOW_REPLY,
  PET_TALK,
  TOPIC_HINTS,
  BACK,
  TRANSPORT_PRICE,
  INTERIOR,
  FLOOR_ITEMS,
  RUNOR,
  SEED_TREE,
  MODIFIERS,
  ZONE_TEMPLATES,
  FARDKOST,
  TREE_STAGES,
  RUNA_NAMES,
  RUNA_TEXT,
  TREE_NAMES,
  TREE_TEXT,
  MODIFIER_NAMES,
  MODIFIER_TEXT,
  ZONE_NAMES,
  ZONE_INTROS,
  FOOD_TEXT,
  BRANCH_NAMES,
  RUN_SEEDS,
  RUN_MAX_MS,
  RUN_WARN_MS,
  RUN_PICK_MS,
  RUN_VICTORY_MS,
  RUN_JOIN_RADIUS,
  RUN_PARTY_MAX,
  RUN_PARTY_MAX_LONGHALL,
  RUNA_CARDS,
  ZONES_PER_RUN,
  MODIFIER_SEEDS,
  RUN_T,
  COMPANION_NAME,
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
const animals: Record<string, { growDays: number; pet?: true; wild?: true; predator?: true; mob?: true; product?: string; mount?: number }> = {};
for (const [id, a] of Object.entries(ANIMALS)) animals[id] = { growDays: a.growDays, ...(a.pet ? { pet: true as const } : {}), ...(a.wild ? { wild: true as const } : {}), ...(a.predator ? { predator: true as const } : {}), ...(a.mob ? { mob: true as const } : {}), ...(a.product ? { product: a.product } : {}), ...(a.mount ? { mount: a.mount.speed } : {}) };

/** The villagers: who they are and which map they live on (the sprite is npc_<id> in the atlas). */
const npcs: Record<string, { name: string; area: string; greeting: string[]; appearance?: unknown; outfit?: unknown }> = {};
for (const n of Object.values(NPCS)) {
  // the look is for the --people3d trial's figures (figure_3d.gd); the sprites come from the exported sheets
  npcs[n.id] = { name: n.name, area: n.area ?? 'farm', greeting: n.greeting, appearance: n.appearance, outfit: n.outfit };
}

const dungeons: Record<string, unknown> = {};
for (const id of DUNGEON_IDS) {
  const d = DUNGEONS[id];
  dungeons[id] = { name: d.name, chapter: d.chapter, intro: d.intro, floor: d.floor, bossFloor: d.bossFloor, wall: d.wall, ambient: d.ambient, decor: d.decor, mini: d.mini, boss: d.boss, portal: d.portal, ...(d.illusions ? { illusions: true } : {}) };
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
    ...(b.phaseAdds ? { phaseAdds: b.phaseAdds } : {}),
    ...(b.mini ? { mini: true } : {}),
    moves: b.moves.map((m) => ({ move: m.move, name: m.name, warn: m.warn, radius: m.radius, dmg: m.dmg, ...(m.arc !== undefined ? { arc: m.arc } : {}), ...(m.width !== undefined ? { width: m.width } : {}), ...(m.interrupt ? { interrupt: true } : {}), ...(m.linger !== undefined ? { linger: m.linger } : {}), ...(m.block ? { block: m.block } : {}), ...(m.heal !== undefined ? { heal: m.heal } : {}), ...(m.count !== undefined ? { count: m.count } : {}), ...(m.add ? { add: m.add } : {}), ...(m.phase ? { phase: m.phase } : {}), text: m.text })),
    yells: b.yells,
  };
}

const spells: Record<string, unknown> = {};
for (const [id, s] of Object.entries(SPELLS)) {
  spells[id] = { name: s.name, icon: s.icon, kind: s.kind, cd: s.cd, range: s.range, power: s.power, ...(s.radius !== undefined ? { radius: s.radius } : {}), ...(s.ms !== undefined ? { ms: s.ms } : {}), text: s.text, attack: ATTACK_KINDS.has(s.kind), friend: FRIEND_KINDS.has(s.kind) };
}

const classes: Record<string, unknown> = {};
for (const c of Object.values(CLASSES)) classes[c.id] = { name: c.name, roleName: c.roleName, emoji: c.emoji, hp: c.hp, color: c.color, outfit: c.outfit, spells: c.spells, blurb: c.blurb };

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
// M4c: what the shop, the sell box, the wardrobe and the gear window need to know about an item (prices, the shop's tab,
// the season it is sold in, what a placeable puts down, the slot of a piece of clothing, the gear's stats)
type Extra = { buy?: number; stars?: number; sell?: number; tab?: string; season?: string; species?: string; house?: string; places?: string; slot?: string; food?: number; stats?: { power?: number; hp?: number; armor?: number }; classes?: string[]; gearKind?: string; paint?: number };
const extras: Record<string, Extra> = {};
for (const id of Object.keys(ITEMS).sort()) {
  const d = ITEMS[id]!;
  const e: Extra = {};
  if (d.buy !== undefined) e.buy = d.buy;
  if (d.stars !== undefined) e.stars = d.stars;
  if (d.sell !== undefined) e.sell = d.sell;
  if (d.tab) e.tab = d.tab;
  if (d.season) e.season = d.season;
  if (d.species) {
    e.species = d.species;
    const house = ANIMALS[d.species]?.house;
    if (house) e.house = house;
  }
  if (d.places) e.places = d.places;
  if (d.clothing) e.slot = d.clothing.slot;
  if (d.food) e.food = d.food.boostMs;
  if (d.paint !== undefined) e.paint = d.paint;
  extras[id] = e;
}
for (const it of SAGA_ITEMS) {
  const e = extras[it.id] ?? {};
  if (it.stats) e.stats = it.stats;
  if (it.classes) e.classes = it.classes;
  if (it.kind === 'weapon' || it.kind === 'offhand' || it.kind === 'amulet') e.gearKind = it.kind;
  if (it.kind === 'hat' || it.kind === 'shirt') e.slot = it.kind;
  extras[it.id] = e;
}
for (const [id, e] of Object.entries(extras)) if (items[id]) Object.assign(items[id], e);

const recipe = (r: { id: string; in: { item: string; count: number }[]; out: { item: string; count: number } }) => ({ id: r.id, in: r.in.map((i) => ({ item: i.item, count: i.count })), out: { item: r.out.item, count: r.out.count } });
/** The shop's tabs, in the browser's order (menus.ts TABS) with their names. */
const SHOP_TABS = ['seeds', 'animals', 'vehicles', 'feed', 'materials', 'furniture', 'clothes', 'season', 'stars'];
const TAB_NAMES: Record<string, string> = { seeds: T.tabSeeds, animals: T.tabAnimals, feed: T.tabFeed, materials: T.tabMaterials, furniture: T.tabFurniture, clothes: T.tabClothes, season: T.tabSeason, stars: `⭐ ${T.tabStars}`, vehicles: T.tabVehicles };
const shopTabs = SHOP_TABS.map((id) => ({ id, name: TAB_NAMES[id] ?? id }));

/** Völvan's chapters (the story window) and the villagers' saga quests; the player's own progress is on the player record. */
const chapters = SAGA_CHAPTERS.map((c) => ({ dungeon: c.dungeon, title: c.title, tell: c.tell, done: c.done, goal: c.goal, ...(c.field ? { field: c.field } : {}), reward: c.reward }));
const sagaQuests = SAGA_QUESTS.map((q) => ({ id: q.id, npc: q.npc, dungeon: q.dungeon, title: q.title, tell: q.tell, done: q.done, goal: q.goal, kind: q.kind, target: q.target, count: q.count, reward: q.reward }));

/** The villagers' talk (dialogue.ts): the whole tree, so the native client plays the same conversations. */
const dialogue = { npcs: NPC_TALK, jokes: JOKES, riddles: RIDDLES, right: RIGHT, wrong: WRONG, weather: WEATHER_TALK, how: HOW_REPLY, pet: PET_TALK, hints: TOPIC_HINTS, back: BACK };
/** The bag's filter chips (shared/src/filters.ts): id, emoji, the categories it keeps lit, and its name. */
const filters = INVENTORY_FILTERS.map((f) => ({ id: f.id, emoji: f.emoji, categories: f.categories, name: FILTER_NAMES[f.id] ?? f.id }));

/** Runs (M5b, GAME.md): the runor with their pictures, names and one-line texts (the three big cards), the sagaträd, the
 * modifiers, the dishes, the zones' looks and the run's numbers. The effects are the server's business; the client shows names. */
const run = {
  constants: { maxMs: RUN_MAX_MS, warnMs: RUN_WARN_MS, pickMs: RUN_PICK_MS, victoryMs: RUN_VICTORY_MS, joinRadius: RUN_JOIN_RADIUS, partyMax: RUN_PARTY_MAX, partyMaxLonghall: RUN_PARTY_MAX_LONGHALL, cards: RUNA_CARDS, zones: ZONES_PER_RUN, modifierSeeds: MODIFIER_SEEDS },
  seeds: RUN_SEEDS,
  runor: RUNOR.map((r) => ({ id: r.id, ...(r.cls ? { cls: r.cls } : {}), icon: r.icon, name: RUNA_NAMES[r.id], text: RUNA_TEXT[r.id] })),
  tree: SEED_TREE.map((n) => ({ id: n.id, branch: n.branch, cost: n.cost, ...(n.needs ? { needs: n.needs } : {}), name: TREE_NAMES[n.id], text: TREE_TEXT[n.id] })),
  treeStages: TREE_STAGES,
  branches: BRANCH_NAMES,
  modifiers: MODIFIERS.map((m) => ({ id: m.id, name: MODIFIER_NAMES[m.id], text: MODIFIER_TEXT[m.id] })),
  food: Object.keys(FARDKOST).map((id) => ({ id, text: FOOD_TEXT[id] })),
  zones: Object.values(ZONE_TEMPLATES).map((t) => ({ biome: t.biome, name: ZONE_NAMES[t.biome], intro: ZONE_INTROS[t.biome], floor: t.floor, solid: t.solid, wall: t.wall, ambient: t.ambient, decor: t.decor, weather: t.weather })),
  companion: COMPANION_NAME,
  texts: { ...RUN_T },
};

const data = {
  _comment: 'Generated from packages/shared by `pnpm godot:data`. Do not edit; edit the shared data and run the script.',
  constants: { TILE, MAP_W, MAP_H, MAX_HEARTS, DAY_LENGTH_MS, EDGE_GAP, REACH, PICKUP_RADIUS, RIDE_SPEED_MUL, WATERING_CAN_CHARGES, HOTBAR_SIZE, INVENTORY_SIZE, CHEST_SIZE, MAX_STACK, SPACEPORT_AX: SPACEPORT.ax, SPACEPORT_AY: SPACEPORT.ay, PLAYER_SPEED, PLAYER_HALF_W, PLAYER_HALF_H, SLOW_MUL, GCD_MS, DOWN_MS, WIPE_MS, POTION_CD, CHAT_MAX_LEN, CHAT_BUBBLE_MS, EMOTE_MS },
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
  recipes: RECIPES.map(recipe),
  cooking: COOKING.map(recipe),
  shopTabs,
  /** What the shop lists, in the browser's order (the order items are defined in data.ts). */
  shopItems: Object.values(ITEMS).filter((d) => d.tab !== undefined).map((d) => d.id),
  paintedSell: PAINTED_SELL,
  transportPrice: TRANSPORT_PRICE,
  interior: INTERIOR,
  /** Placeables that change the ground instead of standing on it (FLOOR_ITEMS in sim.ts): the object kind they place. */
  floors: Object.keys(FLOOR_ITEMS),
  volva: VOLVA_ID,
  chapters,
  sagaQuests,
  gear: { rarityPower: RARITY_POWER, levelBonus: LEVEL_BONUS, powerCap: POWER_CAP, armorCap: ARMOR_CAP, classFit: CLASS_FIT, xpLevels: XP_LEVELS, forgeMax: FORGE_MAX, slots: ['weapon', 'offhand', 'amulet'] },
  levelRewards: LEVEL_REWARDS,
  dialogue,
  run,
};
fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log(`${path.relative(process.cwd(), out)}: ${Object.keys(objects).length} objects, ${DUNGEON_IDS.length} dungeons, ${Object.keys(mobs).length} creatures, ${Object.keys(spells).length} spells, ${Object.keys(items).length} items`);
