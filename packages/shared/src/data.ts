import { DUNGEONS, SAGA_BOSSES, SAGA_ITEMS, SAGA_MOBS, VOLVA_ID, VOLVA_SPOT } from './saga.ts';
import { TILE, type Achievement, type AnimalDef, type ItemDef, type NpcDef, type ObjectDef } from './types.ts';

// ---------- Items ----------

const I = (
  id: string,
  category: ItemDef['category'],
  extra: Partial<ItemDef> = {},
): ItemDef => ({
  id,
  category,
  stack: category === 'tool' ? 1 : 99,
  icon: id,
  ...extra,
});

export const ITEMS: Record<string, ItemDef> = {};
const add = (d: ItemDef) => (ITEMS[d.id] = d);

// Tools
add(I('fur', 'material', { sell: 15 }));

// Materials
add(I('stone', 'material', { sell: 2, buy: 5, tab: 'materials' }));
// Found out in the world
add(I('mushroom', 'crop', { sell: 12 }));
add(I('shell', 'material', { sell: 8 }));
// Cave loot
add(I('gold', 'material', { sell: 10 }));
add(I('gem', 'material', { sell: 150 }));
// The wider world: found in the new biomes, their caves and on the moon
add(I('glowshroom', 'crop', { sell: 25 }));
add(I('fairy_dust', 'material', { sell: 50 }));
add(I('obsidian', 'material', { sell: 25 }));
add(I('crystal', 'material', { sell: 40 }));
add(I('fire_crystal', 'material', { sell: 80 }));
add(I('pearl', 'material', { sell: 90 }));
add(I('old_coin', 'material', { sell: 60 }));
add(I('star_crystal', 'material', { sell: 120 }));

// Animal products

// Dishes (cooked at the stove)
// Pizzeria menu (bought in the village, eaten for pizzapower)

// Fish

// Animals (catalogue)
// Vehicles (bought like animals, parked next to you at once, driven like a horse)

// Placeables (crafted or bought)
const place = (id: string, extra: Partial<ItemDef> = {}) =>
  add(I(id, 'placeable', { places: id, ...extra }));
// The run's buildings (M5b, GAME.md section 4): the forge house, the herb garden and the longhouse
// Furniture (Möbler) – crafted or bought, usable inside the house and outside
// Furniture: a new house starts with a bed, a table, a chair and a lamp, and the dungeons drop the rest (HOUSE_LOOT)
place('bench', { sell: 5 });
place('table', { sell: 6 });
place('flowerbox', { sell: 5 });
place('bed', { sell: 15, buy: 120, tab: 'furniture' });
place('rug', { sell: 5, buy: 40, tab: 'furniture' });
place('chair', { sell: 3, buy: 25, tab: 'furniture' });
place('sofa', { sell: 10, buy: 90, tab: 'furniture' });
place('bookshelf', { sell: 8, buy: 70, tab: 'furniture' });
place('lamp', { sell: 5, buy: 45, tab: 'furniture' });
place('plant', { sell: 4, buy: 30, tab: 'furniture' });
place('clock', { sell: 5, buy: 50, tab: 'furniture' });
place('crystal_lamp', { sell: 60 });
place('mushroom_lamp', { sell: 45 });
place('wisp_jar', { sell: 30 });
place('dragon_egg');
// Season decorations
// Souvenirs from the wider world (crafted from what you find, or found as they are)

// Clothing
const cloth = (
  id: string,
  slot: 'hat' | 'shirt' | 'pants' | 'shoes',
  style: string,
  color: string,
  buy: number,
  season?: ItemDef['season'],
) => add(I(id, 'clothing', { clothing: { slot, style, color }, buy, tab: season ? 'season' : 'clothes', season, stack: 1 }));
cloth('shirt_red', 'shirt', 'plain', '#d9453b', 60);
cloth('shirt_blue', 'shirt', 'plain', '#3b6fd9', 60);
cloth('shirt_green', 'shirt', 'plain', '#3ba35b', 60);
cloth('shirt_yellow', 'shirt', 'plain', '#e8c23a', 60);
// Dresses (worn in the shirt slot; they hide the pants)
cloth('pants_blue', 'pants', 'plain', '#2f4c8a', 50);
cloth('pants_brown', 'pants', 'plain', '#7a5230', 50);
cloth('shoes_boots', 'shoes', 'boots', '#3a3a3a', 40);
// Cave treasure clothes (not for sale)
// Found in the caves and on the moon (not for sale)
const found = (id: string, slot: 'hat' | 'shirt', style: string, color: string) => add(I(id, 'clothing', { clothing: { slot, style, color }, stack: 1 }));
// Dungeons (Sagan om Världsträdet): glowing weapons that work as tools too, Norse clothes, the classes'
// clothes, pets and mounts only the dungeons give, healing potions, what the villagers ask for, and the
// saga's keepsakes for home
for (const s of SAGA_ITEMS) {
  if (s.kind === 'weapon') add(I(s.id, 'tool', { tool: s.tool }));
  // offhands and amulets sit in the bag until they are put on in the gear window (they never place or swing)
  else if (s.kind === 'offhand' || s.kind === 'amulet') add(I(s.id, 'decor', { stack: 1 }));
  else if (s.kind === 'hat' || s.kind === 'shirt') found(s.id, s.kind, s.style!, s.color!);
  else if (s.kind === 'pet' || s.kind === 'mount') add(I(s.id, 'animal', { species: s.species, stack: 1 }));
  else if (s.kind === 'potion') add(I(s.id, 'material', { food: { boostMs: 0 }, sell: 10, stack: 20 }));
  else if (s.kind === 'quest') add(I(s.id, 'material'));
  // Smedjan's materials: they stack like the villagers' things, and Stina's customers pay a little for them
  else if (s.kind === 'material') add(I(s.id, 'material', { sell: s.rarity === 'rare' ? 20 : 5 }));
  else if (s.kind === 'decor') add(I(s.id, 'placeable', { places: s.id, stack: 1 }));
}

export const item = (id: string): ItemDef => {
  const d = ITEMS[id];
  if (!d) throw new Error(`unknown item ${id}`);
  return d;
};

// ---------- Crops ----------

// ---------- Objects ----------

const O = (kind: string, extra: Partial<ObjectDef> = {}): ObjectDef => ({
  kind,
  w: 1,
  h: 1,
  solid: true,
  breakWith: 'hammer',
  ...extra,
});

export const OBJECTS: Record<string, ObjectDef> = {};
const addO = (d: ObjectDef) => (OBJECTS[d.kind] = d);

// Natural resources
addO(O('tree', { breakWith: 'axe', drops: [{ item: 'wood', min: 3, max: 5 }], regrowDays: 4 }));
addO(O('tree_pine', { breakWith: 'axe', drops: [{ item: 'wood', min: 3, max: 5 }], regrowDays: 4 }));
addO(O('tree_apple', { breakWith: 'axe', drops: [{ item: 'wood', min: 3, max: 5 }], regrowDays: 4 }));
addO(O('stump', { breakWith: 'axe', drops: [{ item: 'wood', min: 1, max: 1 }] }));
addO(O('rock', { breakWith: 'pick', drops: [{ item: 'stone', min: 2, max: 4 }], regrowDays: 3 }));
addO(O('rock_small', { breakWith: 'pick', drops: [{ item: 'stone', min: 1, max: 2 }], regrowDays: 2 }));
addO(O('grass_tuft', { solid: false, flat: true, breakWith: 'scythe', drops: [{ item: 'fiber', min: 1, max: 2 }, { item: 'hay', min: 0, max: 1 }], regrowDays: 2 }));
addO(O('bush', { breakWith: 'axe', drops: [{ item: 'fiber', min: 2, max: 3 }], regrowDays: 3 }));
addO(O('flower', { solid: false, flat: true, breakWith: 'scythe', drops: [{ item: 'fiber', min: 1, max: 1 }], regrowDays: 3 }));
addO(O('wild_flower_mid', { solid: false, flat: true, harvest: true, drops: [{ item: 'fiber', min: 1, max: 1 }] }));
// Biome specials
addO(O('mushroom', { solid: false, flat: true, harvest: true, drops: [{ item: 'mushroom', min: 1, max: 2 }] }));
// The lobby: a signboard with a picture (variant) and the kennel where you pick your first pet
addO(O('lobby_sign', { breakWith: undefined }));
addO(O('kennel', { w: 2, h: 2, interact: 'kennel', breakWith: undefined }));
// The wider world (2026-10-29). Skogen: blueberries. Träsket: cloudberries, reeds, dead trees and will-o'-the-wisps
// Djungeln
// Vulkanen
// Svampskogen
// Dinodalen
// Godislandet
// Buried treasure: an X in the sand, dug up with the hoe (the loot depends on the biome)
// Landmarks. Cave mouths, the temple, the pyramid and the gingerbread house lead into caves.
// Rymdbasen and the moon
// Inside the caves
// Village
addO(O('house_small', { w: 3, h: 3, breakWith: undefined }));
addO(O('lantern', { solid: false, breakWith: undefined, light: true }));

// Built things (break -> same item back)
const built = (kind: string, extra: Partial<ObjectDef> = {}) =>
  addO(O(kind, { drops: [{ item: kind, min: 1, max: 1 }], ...extra }));
// A house's walls, windows and furniture (made by house.ts and the lobby, never built or broken by players)
addO(O('wall_wood', { breakWith: undefined }));
addO(O('window', { breakWith: undefined }));
built('bench');
built('table');
built('flowerbox');
built('bed', { w: 1, h: 2 });
built('rug', { w: 2, h: 2, solid: false, flat: true });
built('chair');
built('sofa', { w: 2, h: 1 });
built('bookshelf');
built('lamp', { light: true });
built('plant');
built('clock', { solid: false, flat: true });
built('crystal_lamp', { light: true });
built('mushroom_lamp', { light: true });
built('wisp_jar', { light: true });
built('dragon_egg');
built('door_out', { solid: false, flat: true, breakWith: undefined, drops: [] });
// Cave
// The city: streets, blocks and stops (interaction with stops/stations lives with the travel feature)
addO(O('street_lamp', { solid: false, breakWith: undefined, light: true }));
// Köpingen's Norse dressing (Saga III): a pole with a cloth banner (variant = colour 0–2), stacked barrels, a lit
// runestone by the well and a hay cart by the market. Decoration only: nothing to use or break.
addO(O('banner_pole', { breakWith: undefined }));
addO(O('barrel_stack', { breakWith: undefined }));
addO(O('runestone', { breakWith: undefined, light: true }));
addO(O('hay_cart', { w: 2, h: 1, breakWith: undefined }));
// Dungeons: walls and the gate after the mid-boss (one look per dungeon: variant), torches, the way out,
// rest stones, chests, the arches out in the world, Kämpastenen where you pick a class, and things to see
addO(O('saga_wall', { breakWith: undefined }));
addO(O('saga_gate', { breakWith: undefined }));
addO(O('saga_torch', { solid: false, breakWith: undefined, light: true }));
addO(O('saga_exit', { solid: false, flat: true, interact: 'exit', breakWith: undefined, light: true }));
addO(O('saga_rest', { interact: 'rest', breakWith: undefined, light: true }));
addO(O('saga_chest', { interact: 'sagachest', breakWith: undefined }));
addO(O('saga_stone', { interact: 'sagaclass', breakWith: undefined, light: true }));
// Runs (M5b): the arch on the farm that starts one, and the way on at the end of a zone
addO(O('fardport', { w: 3, h: 2, interact: 'fardport', breakWith: undefined, light: true }));
addO(O('run_exit', { solid: false, flat: true, interact: 'runexit', breakWith: undefined, light: true }));
addO(O('saga_coffin', { breakWith: undefined }));
addO(O('saga_bones', { solid: false, flat: true, breakWith: undefined }));
addO(O('saga_candles', { solid: false, breakWith: undefined, light: true }));
addO(O('saga_urn', { breakWith: undefined }));
addO(O('saga_icecrystal', { breakWith: undefined, light: true }));
addO(O('saga_frozenpillar', { breakWith: undefined }));
addO(O('saga_snowdrift', { solid: false, flat: true, breakWith: undefined }));
addO(O('saga_anvil', { breakWith: undefined }));
addO(O('saga_brazier', { breakWith: undefined, light: true }));
addO(O('saga_lavacrack', { solid: false, flat: true, breakWith: undefined, light: true }));
built('solruna', { light: true });
built('yggdrasil', { light: true, interact: 'yggdrasil' });
// Act II: the puzzle rooms' plates (variant 0 dark, 1 lit) and each new dungeon's things to see
addO(O('saga_plate', { solid: false, flat: true, breakWith: undefined, light: true }));
// Helheim
addO(O('saga_gravestone', { breakWith: undefined }));
addO(O('saga_skullpile', { solid: false, flat: true, breakWith: undefined }));
addO(O('saga_ghostlight', { solid: false, breakWith: undefined, light: true }));
addO(O('saga_deadtree', { breakWith: undefined }));
// Svartalfheims gruvor
addO(O('saga_minecart', { breakWith: undefined }));
addO(O('saga_goldpile', { breakWith: undefined, light: true }));
addO(O('saga_dwarfstatue', { breakWith: undefined }));
addO(O('saga_minelamp', { solid: false, breakWith: undefined, light: true }));
// Havsormens tempel
addO(O('saga_coral', { breakWith: undefined }));
addO(O('saga_anchor', { breakWith: undefined }));
addO(O('saga_seaweed', { solid: false, flat: true, breakWith: undefined }));
addO(O('saga_pearl', { breakWith: undefined, light: true }));
// Alvernas lund
addO(O('saga_glowshroom', { breakWith: undefined, light: true }));
addO(O('saga_fairylight', { solid: false, breakWith: undefined, light: true }));
addO(O('saga_cobweb', { solid: false, flat: true, breakWith: undefined }));
addO(O('saga_elfstatue', { breakWith: undefined }));
// Fenrisklyftan
addO(O('saga_chain', { solid: false, flat: true, breakWith: undefined }));
addO(O('saga_icefang', { breakWith: undefined }));
addO(O('saga_wolfstatue', { breakWith: undefined }));
addO(O('saga_bonepile', { solid: false, flat: true, breakWith: undefined }));
// Bifrost
addO(O('saga_rainbowshard', { breakWith: undefined, light: true }));
addO(O('saga_mirror', { breakWith: undefined }));
addO(O('saga_starlamp', { solid: false, breakWith: undefined, light: true }));
addO(O('saga_runepillar', { breakWith: undefined }));
// the Act II chapters' keepsakes for home (they all glow)
for (const s of SAGA_ITEMS) if (s.kind === 'decor' && !OBJECTS[s.id]) built(s.id, { light: true });

// A house to show off in (house.ts): a hearth, a stand for gear, Norse decor from the dungeons and a trophy for every dungeon boss.
addO(O('hearth', { w: 3, h: 1, breakWith: undefined, light: true }));
built('gear_stand', { interact: 'stand' });
place('gear_stand', { sell: 30 });
/** The Norse set, each a drop from a dungeon's chests (SAGA_LOOT, SAGA_TREASURE). */
export const NORSE_DECOR = ['viking_shield', 'rune_stone', 'weapon_rack', 'drinking_horn', 'viking_banner', 'bear_rug', 'mead_barrel', 'candle_stick', 'yggdrasil_sapling', 'raven_perch'] as const;
for (const id of NORSE_DECOR) {
  built(id, id === 'bear_rug' ? { w: 2, h: 2, solid: false, flat: true } : id === 'candle_stick' || id === 'yggdrasil_sapling' ? { light: true } : {});
  place(id, { stack: 20, sell: 40 });
}
/** One trophy per dungeon boss; `variant` (and the stack's `data`) is the highest difficulty level it was won on, 0..4. */
export const TROPHY_PREFIX = 'trophy_';
export const TROPHY_LEVELS = 5;
for (const b of Object.values(DUNGEONS)) {
  built(TROPHY_PREFIX + b.boss, { light: false });
  add(I(TROPHY_PREFIX + b.boss, 'placeable', { places: TROPHY_PREFIX + b.boss, stack: 1 }));
}

// Farmhouse fixtures (not breakable)
addO(O('house', { w: 5, h: 4, breakWith: undefined }));
addO(O('wardrobe', { interact: 'wardrobe', breakWith: undefined }));

export const objectDef = (kind: string): ObjectDef => {
  const d = OBJECTS[kind];
  if (!d) throw new Error(`unknown object ${kind}`);
  return d;
};

// ---------- Animals ----------

export const ANIMALS: Record<string, AnimalDef> = {
  // Pigs root up truffles in the morning
  // Horses give nothing but can be ridden by their owner once grown
  // Pets follow their owner and need no house
  dog: { species: 'dog', house: '', growDays: 0, speed: 70, pet: true },
  cat: { species: 'cat', house: '', growDays: 0, speed: 60, pet: true },
  // Wild animals, one kind per biome; they wander and like to be petted
  // The wider world: one or two kinds per new biome (all can be caught with the lasso)
  frog: { species: 'frog', house: '', growDays: 0, speed: 30, wild: 'trask', wildCount: [3, 5] },
  dino: { species: 'dino', house: '', growDays: 0, speed: 34, wild: 'dino', wildCount: [3, 5], tame: 0.4, variants: 3 },
  // Hatches from a dragon egg found in the volcano's cave; follows whoever put the egg down
  // Predators (mild): they chase you a little and bite one heart; a lasso makes them pets
  // Vehicles: city traffic drives around the blocks (speed in px/s) and always stops for people;
  // a bought car or moped stands where you park it and is driven at `ride` × walking speed
  // Cave monsters (gentle): slime, bat, troll and the boss troll
  slime: { species: 'slime', house: '', growDays: 0, speed: 22, mob: { hp: 2, drops: [{ item: 'gold', min: 1, max: 2, chance: 0.8 }, { item: 'heartberry', min: 1, max: 1, chance: 0.25 }] } },
  bat: { species: 'bat', house: '', growDays: 0, speed: 44, mob: { hp: 1, drops: [{ item: 'gold', min: 1, max: 1, chance: 0.6 }] } },
  troll: { species: 'troll', house: '', growDays: 0, speed: 26, mob: { hp: 4, drops: [{ item: 'gold', min: 2, max: 4, chance: 1 }, { item: 'heartberry', min: 1, max: 1, chance: 0.4 }] } },
  boss: { species: 'boss', house: '', growDays: 0, speed: 20, mob: { hp: 10, boss: true, drops: [{ item: 'gold', min: 8, max: 12, chance: 1 }] } },
};
// Dungeon monsters and bosses (they fight by the rules in sagasim.ts), and the animals only dungeons give
for (const m of [...Object.values(SAGA_MOBS), ...Object.values(SAGA_BOSSES)]) ANIMALS[m.species] = { species: m.species, house: '', growDays: 0, speed: m.speed * TILE, saga: true };
ANIMALS.korp = { species: 'korp', house: '', growDays: 0, speed: 72, pet: true };
// The tame sprites of pets.ts (a young bear, wolf, lynx, goat kid and fox)
ANIMALS.pet_korp = { species: 'pet_korp', house: '', growDays: 0, speed: 72, pet: true };
ANIMALS.pet_bear = { species: 'pet_bear', house: '', growDays: 0, speed: 60, pet: true };
ANIMALS.pet_wolf = { species: 'pet_wolf', house: '', growDays: 0, speed: 84, pet: true };
ANIMALS.pet_lynx = { species: 'pet_lynx', house: '', growDays: 0, speed: 78, pet: true };
ANIMALS.pet_goat = { species: 'pet_goat', house: '', growDays: 0, speed: 66, pet: true };
ANIMALS.pet_fox = { species: 'pet_fox', house: '', growDays: 0, speed: 76, pet: true };
ANIMALS.fenrisvalp = { species: 'fenrisvalp', house: '', growDays: 0, speed: 70, pet: true };
ANIMALS.sleipner = { species: 'sleipner', house: '', growDays: 0, speed: 30, mount: { speed: 1.75 } };
ANIMALS.gullinbursti = { species: 'gullinbursti', house: '', growDays: 0, speed: 30, mount: { speed: 1.6 } };
ANIMALS.garmvalp = { species: 'garmvalp', house: '', growDays: 0, speed: 70, pet: true };
ANIMALS.guldbagge_tam = { species: 'guldbagge_tam', house: '', growDays: 0, speed: 66, pet: true };
ANIMALS.manet_tam = { species: 'manet_tam', house: '', growDays: 0, speed: 60, pet: true };
ANIMALS.alvljus_fe = { species: 'alvljus_fe', house: '', growDays: 0, speed: 74, pet: true };
ANIMALS.ulvvalp = { species: 'ulvvalp', house: '', growDays: 0, speed: 70, pet: true };
ANIMALS.havshast = { species: 'havshast', house: '', growDays: 0, speed: 30, mount: { speed: 1.7 } };
ANIMALS.jattehjort = { species: 'jattehjort', house: '', growDays: 0, speed: 30, mount: { speed: 1.7 } };
ANIMALS.fenrisulv_ridbar = { species: 'fenrisulv_ridbar', house: '', growDays: 0, speed: 30, mount: { speed: 1.8 } };
ANIMALS.lokeshast = { species: 'lokeshast', house: '', growDays: 0, speed: 30, mount: { speed: 1.85 } };

// Act II: Loke's servants roam the open world, one kind per biome, and a world boss in the mountains and on the
// beach. They chase and bite like predators (hearts) and poof when beaten; hero mode's spells are made for them.
// Some are dungeon monsters too: inside a dungeon its own fight record wins (world.saga.mobs).
const roam = (species: string, wild: string, speed: number, hp: number, drops: [string, number][], opts: { boss?: boolean; count?: [number, number]; aggro?: number } = {}): void => {
  ANIMALS[species] = {
    ...(ANIMALS[species] ?? { species, house: '', growDays: 0, speed }),
    speed,
    wild,
    wildCount: opts.count ?? [2, 4],
    tame: 0,
    mob: { hp, ...(opts.boss ? { boss: true } : {}), ...(opts.aggro !== undefined ? { aggro: opts.aggro } : {}), drops: drops.map(([item, chance]) => ({ item, min: 1, max: 1, chance })) },
  };
};
roam('vandrardraug', 'skog', 30, 6, [['old_coin', 0.3]]);
roam('mosspoke', 'trask', 28, 5, [['crystal', 0.3]]);
roam('gruvtroll', 'berg', 30, 8, [['glimmersten', 0.6], ['gold', 0.2]]);
roam('sjodraug', 'strand', 32, 7, [['old_coin', 0.3], ['krabbklo', 0.4]]);
roam('skuggalv', 'svamp', 34, 6, [['alvdagg', 0.5]]);
roam('isvarg', 'is', 40, 6, [['ulvtand', 0.5]]);
roam('eldimp', 'vulkan', 40, 5, [['glodkol', 0.4], ['bifrostskarva', 0.3]]);
roam('bergatroll', 'berg', 22, 24, [], { boss: true, count: [1, 1] });
roam('kustjatte', 'strand', 22, 24, [], { boss: true, count: [1, 1] });
// Saga III: small, easy monsters all over the world (a sword beats one in two hits), worth a little experience each.
// Never in the city, on the farm or indoors. The meadow's gnome lives next door to the farm, so it only notices you close up.
const WILD_COUNT: [number, number] = [3, 5];
roam('angsvatte', 'ang', 28, 3, [['old_coin', 0.2], ['fiber', 0.4]], { count: WILD_COUNT, aggro: 3 });
roam('trollunge', 'skog|berg', 26, 4, [['stone', 0.4]], { count: WILD_COUNT });
roam('snotroll', 'is', 26, 4, [['iceberry', 0.4]], { count: WILD_COUNT });
roam('sandande', 'oken', 32, 4, [['gold', 0.2], ['cactus_fruit', 0.3]], { count: WILD_COUNT });
roam('djungelimp', 'djungel', 32, 4, [['fiber', 0.4]], { count: WILD_COUNT });
roam('benodla', 'dino', 30, 4, [['old_coin', 0.3]], { count: WILD_COUNT });
roam('sockerspoke', 'godis', 28, 3, [['lollipop', 0.5]], { count: WILD_COUNT });
roam('rymdkryp', 'mane', 30, 4, [['star_crystal', 0.2], ['moon_rock', 0.4]], { count: WILD_COUNT });
// The fifteenth hero level's mount: a pale, glowing cousin of the Jättehjort
ANIMALS.ljushjort = { species: 'ljushjort', house: '', growDays: 0, speed: 30, mount: { speed: 1.75 } };

// ---------- Recipes ----------

// ---------- Villagers ----------

export const NPCS: Record<string, NpcDef> = {};

NPCS.stina = {
  id: 'stina',
  name: 'Smed-Stina',
  x: 37,
  y: 17,
  appearance: { skin: '#b97a4e', hair: '#c43a2a', hairStyle: 'ponytail' },
  outfit: { shirt: 'shirt_overalls', pants: 'pants_blue', shoes: 'shoes_boots' },
  greeting: ['Hör du hammaren? Det är jag!', 'Sten och malm, det är mina favoriter.', 'Ädelstenar från bergen är underbara.'],
  routine: [{ at: 0, x: 37, y: 17 }],
};

/** Völvan Sigrun, the seeress who tells the saga, by Kämpastenen on the square. */
NPCS[VOLVA_ID] = {
  id: VOLVA_ID,
  name: 'Völvan Sigrun',
  x: VOLVA_SPOT.x,
  y: VOLVA_SPOT.y,
  appearance: { skin: '#eccdb0', hair: '#ece6da', hairStyle: 'long' },
  outfit: { hat: 'hat_volvakrans', shirt: 'shirt_volvadrakt', pants: 'pants_brown', shoes: 'shoes_boots' },
  greeting: ['Välkommen, lilla vän. Jag har väntat på dig.', 'Runorna viskar ditt namn…', 'Världsträdet behöver hjältar.'],
  routine: [{ at: 0, x: VOLVA_SPOT.x, y: VOLVA_SPOT.y }],
};

/** Context lines villagers say in their speech bubbles. {name} is the player's name. */
export const NPC_LINES: Record<string, { morning: string[]; day: string[]; evening: string[]; meet: string[] }> = {
  sigrun: {
    morning: ['Morgonsolen lyser på runorna.', 'God morgon, {name}. Jag drömde om dig.'],
    day: ['Yggdrasil darrar…', 'Hej {name}! Har du valt din väg?', 'Ingen hjälte går ensam.'],
    evening: ['Nu vaknar draugarna…', 'God kväll, {name}. Var försiktig i mörkret.'],
    meet: ['Hej Bo. Ditt bröd doftar ända hit.', 'Stina! Smid ett svärd åt hjältarna.', 'Fru Lind, rosorna viskar i natt.'],
  },
  stina: {
    morning: ['Smedjan är varm redan!', 'God morgon, {name}!'],
    day: ['Hej {name}! Har du sten med dig?', 'Klang, klang!'],
    evening: ['Jag släcker ässjan nu.', 'God kväll!'],
    meet: ['Hej Bo! Bröd till lunch?', 'Fru Lind, honung till kaffet?'],
  },
};

// ---------- Gårdsbok (achievements) ----------

const A = (id: string, stat: string, goal: number, stars: number, icon: string): Achievement => ({ id, stat, goal, stars, icon });
export const ACHIEVEMENTS: Achievement[] = [
  A('ride_1', 'ride', 1, 1, 'animal_horse'),
  A('ride_25', 'ride', 25, 2, 'stall'),
  A('loot_5', 'loot', 5, 2, 'old_coin'),
  A('loot_25', 'loot', 25, 4, 'idol'),
  A('saga_class', 'sagaClass', 1, 1, 'hat_vaktarhjalm'),
  A('saga_draug', 'sagaDraug', 1, 3, 'runsvard'),
  A('saga_frost', 'sagaFrost', 1, 4, 'frostbett'),
  A('saga_surt', 'sagaSurt', 1, 5, 'surtsvard'),
  A('saga_mobs_50', 'sagaMobs', 50, 2, 'draugyxa'),
  A('saga_quests_6', 'sagaQuests', 6, 3, 'healing_potion'),
  A('saga_hel', 'sagaHel', 1, 4, 'helsvard'),
  A('saga_dvarg', 'sagaDvarg', 1, 4, 'fafnerstand'),
  A('saga_orm', 'sagaOrm', 1, 5, 'korallspjut'),
  A('saga_alv', 'sagaAlv', 1, 5, 'alvklinga'),
  A('saga_fenrir', 'sagaFenrir', 1, 6, 'fenristand'),
  A('saga_loke', 'sagaLoke', 1, 8, 'heimdallshorn'),
  A('saga_act2', 'sagaAct2', 1, 10, 'bifrostbit'),
  A('saga_level_5', 'sagaLevel', 5, 3, 'amulet_vegvisir'),
  A('saga_level_10', 'sagaLevel', 10, 6, 'amulet_brisingamen'),
  A('saga_gear_legendary', 'sagaLegendary', 1, 4, 'offhand_tyrshandske'),
];
