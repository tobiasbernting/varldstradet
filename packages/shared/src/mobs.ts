// The dungeons' ordinary monsters as families (DESIGN.md section 2.4): every dungeon has six species, two of each pack slot.
// The three a dungeon began with are the slots themselves (`dungeonMobs` in runmap.ts sorts them into small, medium and big);
// each has one archetype-mate here, a newcomer of another shape whose numbers stay within 10 % of its own, so a pack is as
// strong whichever of the two fills a slot. This file is data only (it imports nothing but types, and saga.ts spreads
// `NEW_SAGA_MOBS` into `SAGA_MOBS`); the pack picker and the skins are in mobpacks.ts.
import type { SagaMobDef } from './saga.ts';

/**
 * What a monster does in a pack. A `swarmer` is fast and light, a `brute` slow and tough (the natural Sköldbärare), a `shooter`
 * attacks from afar (reach above 2.5; the natural Skytt). Roles are put on species by this.
 */
export type MobArchetype = 'swarmer' | 'brute' | 'shooter';

export interface MobKin {
  species: string;
  archetype: MobArchetype;
  /** The original species whose pack slot this newcomer may fill; left out for the originals. */
  mate?: string;
}

/** The newcomers' numbers: each within 10 % of its mate's in every field (mobs.test.ts checks it). */
export const NEW_SAGA_MOBS: Record<string, SagaMobDef> = {
  // Draugkryptan: a flock of bats, a grave light that floats, a draug in a rusty helmet behind a round shield
  fladdermoss: { species: 'fladdermoss', name: 'Fladdermöss', hp: 66, dmg: 4, atkMs: 1050, reach: 1.2, speed: 3.6, aggro: 4.2 },
  gravljus: { species: 'gravljus', name: 'Gravljus', hp: 120, dmg: 6, atkMs: 1900, reach: 5, speed: 2.3, aggro: 6 },
  rostdraug: { species: 'rostdraug', name: 'Rostdraug', hp: 185, dmg: 7, atkMs: 1750, reach: 1.4, speed: 2.2, aggro: 4.5 },
  // Frostjättens borg: a snow owl, a frost giant's child that throws snowballs, a snowman that walks
  snouggla: { species: 'snouggla', name: 'Snöuggla', hp: 130, dmg: 6, atkMs: 1150, reach: 1.3, speed: 3.8, aggro: 5.4 },
  jatteunge: { species: 'jatteunge', name: 'Jätteunge', hp: 118, dmg: 6, atkMs: 2250, reach: 5, speed: 2, aggro: 6, slows: true },
  snogubbe: { species: 'snogubbe', name: 'Snögubbe', hp: 280, dmg: 10, atkMs: 2050, reach: 1.5, speed: 2, aggro: 4.5 },
  // Surts smedja: a fire salamander, a sooty smith's gnome with a glowing hammer, a lava snail
  eldsalamander: { species: 'eldsalamander', name: 'Eldsalamander', hp: 100, dmg: 5, atkMs: 1160, reach: 1.2, speed: 3.5, aggro: 5 },
  sotnisse: { species: 'sotnisse', name: 'Sotnisse', hp: 180, dmg: 8, atkMs: 1240, reach: 1.3, speed: 3.2, aggro: 5 },
  lavasnigel: { species: 'lavasnigel', name: 'Lavasnigel', hp: 390, dmg: 13, atkMs: 2380, reach: 1.6, speed: 1.65, aggro: 4 },
  // Helheim: a floating skull with a candle, a cat of bones, a coffin that walks
  ljusskalle: { species: 'ljusskalle', name: 'Ljusskalle', hp: 112, dmg: 6, atkMs: 1880, reach: 5, speed: 2.3, aggro: 6, slows: true },
  benkatt: { species: 'benkatt', name: 'Benkatt', hp: 140, dmg: 7, atkMs: 1130, reach: 1.3, speed: 3.8, aggro: 5 },
  kistgast: { species: 'kistgast', name: 'Kistgast', hp: 205, dmg: 8, atkMs: 1720, reach: 1.4, speed: 2.2, aggro: 4.5 },
  // Svartalfheims gruvor: a mole with a miner's lamp, a dark dwarf with a hammer, an ore cart that rolls by itself
  gruvmullvad: { species: 'gruvmullvad', name: 'Gruvmullvad', hp: 96, dmg: 5, atkMs: 1170, reach: 1.2, speed: 3.4, aggro: 5 },
  svartalf: { species: 'svartalf', name: 'Svartalf', hp: 215, dmg: 9, atkMs: 1600, reach: 1.5, speed: 2.4, aggro: 4.5 },
  malmvagn: { species: 'malmvagn', name: 'Malmvagn', hp: 400, dmg: 13, atkMs: 2420, reach: 1.6, speed: 1.8, aggro: 4 },
  // Havsormens tempel: a sea horse that spits bubbles, an angler fish on legs with a lantern, a giant turtle
  sjohast: { species: 'sjohast', name: 'Sjöhäst', hp: 104, dmg: 6, atkMs: 1980, reach: 5, speed: 2.1, aggro: 6, slows: true },
  marulk: { species: 'marulk', name: 'Marulk', hp: 215, dmg: 8, atkMs: 1720, reach: 1.4, speed: 2.2, aggro: 4.5 },
  jatteskoldpadda: { species: 'jatteskoldpadda', name: 'Jättesköldpadda', hp: 285, dmg: 10, atkMs: 2080, reach: 1.5, speed: 1.85, aggro: 4.5 },
  // Alvernas lund: a flower that spits seeds, a giant moth, a tree stump that walks
  spottblomma: { species: 'spottblomma', name: 'Spottblomma', hp: 170, dmg: 8, atkMs: 1600, reach: 5, speed: 2.4, aggro: 6 },
  nattfjaril: { species: 'nattfjaril', name: 'Nattfjäril', hp: 195, dmg: 9, atkMs: 1580, reach: 1.4, speed: 3.2, aggro: 5 },
  stubbgubbe: { species: 'stubbgubbe', name: 'Stubbgubbe', hp: 320, dmg: 11, atkMs: 2350, reach: 1.6, speed: 1.7, aggro: 4 },
  // Fenrisklyftan: a mountain ram, a warrior in a wolf's pelt, an aurochs with frost in its fur
  fjallbagge: { species: 'fjallbagge', name: 'Fjällbagge', hp: 180, dmg: 8, atkMs: 1270, reach: 1.3, speed: 3.6, aggro: 5.5 },
  ulvhedin: { species: 'ulvhedin', name: 'Ulvhedin', hp: 300, dmg: 12, atkMs: 1880, reach: 1.5, speed: 2.2, aggro: 4.5 },
  uroxe: { species: 'uroxe', name: 'Uroxe', hp: 480, dmg: 15, atkMs: 2670, reach: 1.8, speed: 1.5, aggro: 4 },
};

const old = (species: string, archetype: MobArchetype): MobKin => ({ species, archetype });
const kin = (species: string, archetype: MobArchetype, mate: string): MobKin => ({ species, archetype, mate });

/** The eight dungeons that have monsters of their own (Bifrost shows Loke's illusions of four of them and of their mates). */
export type MobDungeon = 'draug' | 'frost' | 'surt' | 'hel' | 'dvarg' | 'orm' | 'alv' | 'fenrir';

/** The six species of each dungeon: the three originals, then the newcomer that is the mate of each. */
export const MOB_FAMILIES: Record<MobDungeon, readonly MobKin[]> = {
  draug: [old('gravrotta', 'swarmer'), old('draugbage', 'shooter'), old('skelett', 'brute'), kin('fladdermoss', 'swarmer', 'gravrotta'), kin('gravljus', 'shooter', 'draugbage'), kin('rostdraug', 'brute', 'skelett')],
  frost: [old('isvarg', 'swarmer'), old('isande', 'shooter'), old('frosttroll', 'brute'), kin('snouggla', 'swarmer', 'isvarg'), kin('jatteunge', 'shooter', 'isande'), kin('snogubbe', 'brute', 'frosttroll')],
  surt: [old('eldimp', 'swarmer'), old('eldhund', 'swarmer'), old('lavagolem', 'brute'), kin('eldsalamander', 'swarmer', 'eldimp'), kin('sotnisse', 'swarmer', 'eldhund'), kin('lavasnigel', 'brute', 'lavagolem')],
  hel: [old('helhund', 'swarmer'), old('benspindel', 'shooter'), old('gengangare', 'brute'), kin('benkatt', 'swarmer', 'helhund'), kin('ljusskalle', 'shooter', 'benspindel'), kin('kistgast', 'brute', 'gengangare')],
  dvarg: [old('guldbagge', 'swarmer'), old('gruvtroll', 'brute'), old('stengolem', 'brute'), kin('gruvmullvad', 'swarmer', 'guldbagge'), kin('svartalf', 'brute', 'gruvtroll'), kin('malmvagn', 'brute', 'stengolem')],
  orm: [old('manet', 'shooter'), old('sjodraug', 'brute'), old('jattekrabba', 'brute'), kin('sjohast', 'shooter', 'manet'), kin('marulk', 'brute', 'sjodraug'), kin('jatteskoldpadda', 'brute', 'jattekrabba')],
  alv: [old('jattespindel', 'swarmer'), old('skuggalv', 'shooter'), old('svampvakt', 'brute'), kin('nattfjaril', 'swarmer', 'jattespindel'), kin('spottblomma', 'shooter', 'skuggalv'), kin('stubbgubbe', 'brute', 'svampvakt')],
  fenrir: [old('ulv', 'swarmer'), old('rimtroll', 'brute'), old('bergsjatte', 'brute'), kin('fjallbagge', 'swarmer', 'ulv'), kin('ulvhedin', 'brute', 'rimtroll'), kin('uroxe', 'brute', 'bergsjatte')],
};

const ALL_KIN: readonly MobKin[] = Object.values(MOB_FAMILIES).flat();

/** Every ordinary monster's archetype (not the bosses, not the ice block or the web). */
export const MOB_ARCHETYPE: Record<string, MobArchetype> = Object.fromEntries(ALL_KIN.map((k) => [k.species, k.archetype]));

/** The original species whose pack slot a species fills: itself for an original. */
export const mobBase = (species: string): string => ALL_KIN.find((k) => k.species === species)?.mate ?? species;

/** A species and its mates (the original first): what may stand in one pack slot. A boss or a block has only itself. */
export const mobKin = (species: string): readonly string[] => KIN_OF[mobBase(species)] ?? [species];
const KIN_OF: Record<string, string[]> = {};
for (const k of ALL_KIN) (KIN_OF[k.mate ?? k.species] ??= [k.mate ?? k.species]).push(...(k.mate ? [k.species] : []));

/**
 * The helpers a boss calls (`phaseAdds`, a summon move) that may also be the helper's mate, where it suits the boss: the grave
 * guard's rats and bats, the draug king's hird, the frost giant's spirits and children, the smiths' imps and salamanders, Hel's
 * dead, the iron guard's and Fafner's diggers, the sea's swimmers, the ice bear's hunters, and Loke's illusions of them.
 * Garm's hounds, the spider queen's spiders, the Nattmara's elves and the wolves of Fenrisklyftan stay as they are (their yells name them).
 */
export const ADD_KIN: ReadonlySet<string> = new Set(['gravrotta', 'skelett', 'isande', 'isvarg', 'eldimp', 'gengangare', 'guldbagge', 'manet', 'sjodraug']);

// ---------------------------------------------------------------------------
// Skins: the look of one monster (AnimalState.variant)
// ---------------------------------------------------------------------------

/** Every ordinary monster comes in this many skins (another helmet, weapon, horns, patches); the art draws them (sagamobs2.ts). */
export const MOB_SKINS = 3;
/** The skins a species has: `MOB_SKINS` for an ordinary monster, one for everything else. */
export const mobSkins = (species: string): number => (MOB_ARCHETYPE[species] ? MOB_SKINS : 1);
/** An animal's `variant` for a monster: its skin, and whether it is one of Loke's illusions (drawn pale and see-through). */
export const mobVariant = (skin: number, illusion = false): number => skin * 2 + (illusion ? 1 : 0);
export const mobSkinOf = (variant: number | undefined): number => (variant ?? 0) >> 1;
export const isIllusion = (variant: number | undefined): boolean => ((variant ?? 0) & 1) === 1;
