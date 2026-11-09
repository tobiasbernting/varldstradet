// Pets (husdjur) that come along on runs and help: the table of every kind, and the little a player's save needs.
//
// HOW TO ADD A PET (a new animal needs only these three things, and the test in pets.test.ts checks all of them):
//   1. One entry in PETS below: id, Swedish name and blurb, the `species` key, a role, courage, a rarity, how it is obtained and
//      one `trick` (pick one of the trick kinds in PetTrick and fill in its numbers; the sim implements each kind once, in petsim.ts).
//   2. The art: draw `species` in packages/art (animals.ts or petanimals.ts: ANIMAL_SIZE, a draw function with two walk frames
//      facing right, and DRAW), and give the entry its `anchors` (where a head, a neck and a back are on each walk frame: pet gear
//      is drawn there, see drawWorn in packages/art/src/animals.ts).
//   3. The species in ANIMALS (data.ts) with `pet: true`, and its name in SPECIES_NAMES (sv.ts).
// Nothing else changes: the kennel, the arch window's row, the HUD frame, the drops and the saves all read this table.
//
// The numbers are for Vanlig and a hero of level 3: a pet is worth roughly a tenth of a hero (a Krigare's axe does about 22 damage a
// second, so a biting pet does about 3). PET_LEVEL_MUL scales them down on Svår and Extrem so those do not get easier.
import type { DungeonId } from './saga.ts';

export type PetRole = 'attack' | 'heal' | 'guard' | 'utility';
export type PetRarity = 'common' | 'rare' | 'epic';
export type PetAnchor = 'head' | 'neck' | 'back';
export const PET_ANCHORS: readonly PetAnchor[] = ['head', 'neck', 'back'];

/** What a pet does on its own in a fight. One small set of kinds, each implemented once in petsim.ts. */
export type PetTrick =
  /** Bites the monster its owner is fighting. */
  | { kind: 'bite'; dmg: number; cd: number; range: number }
  /** Purrs a little health into the most hurt hero near it. */
  | { kind: 'purr'; heal: number; cd: number; range: number; below: number }
  /** Stands in front and soaks a share of the hits on its owner; roars at a monster that is after a weak friend. */
  | { kind: 'guard'; soak: number; roarCd: number; range: number }
  /** Marks a monster so it takes more damage for a while. */
  | { kind: 'mark'; bonus: number; ms: number; cd: number; range: number }
  /** Digs up extra sagafrön after the fights of a run (a fraction on top of what the run pays). */
  | { kind: 'find'; seeds: number }
  /** Rams one monster: a little damage and a short stun (a boss only takes the damage). */
  | { kind: 'ram'; dmg: number; stunMs: number; cd: number; range: number }
  /** A fast biter whose howl gives the whole party a short attack buff. */
  | { kind: 'howl'; dmg: number; cd: number; range: number; buff: number; buffMs: number; howlCd: number }
  /** Waits hidden, then pounces with one big hit at the start of a fight, and bites a little after that. */
  | { kind: 'ambush'; first: number; dmg: number; cd: number; range: number; hideMs: number };

export type PetTrickKind = PetTrick['kind'];
export const PET_TRICK_KINDS: readonly PetTrickKind[] = ['bite', 'purr', 'guard', 'mark', 'find', 'ram', 'howl', 'ambush'];

/** How a pet is got: the kennel in the lobby (free), the first clear of a dungeon (guaranteed), or a boss's chest (a chance, never twice). */
export type PetSource = { kind: 'kennel' } | { kind: 'clear'; dungeon: DungeonId } | { kind: 'drop'; boss: string; chance: number };

export interface PetDef {
  id: string;
  /** Swedish name and one line for the info card. */
  name: string;
  blurb: string;
  /** The text for what its trick does, in a kid's words (the info card). */
  trickText: string;
  /** Where it can be had, in words. */
  howText: string;
  /** Key in ANIMALS (data.ts) and in the art package. */
  species: string;
  emoji: string;
  role: PetRole;
  rarity: PetRarity;
  /** How much it takes before it gets scared and runs to its owner (nothing ever hurts it). */
  courage: number;
  source: PetSource;
  trick: PetTrick;
  /** Where its head, neck and back are on each of the two walk frames (pixels of the sprite facing right): gear is drawn there. */
  anchors: Record<PetAnchor, [number, number][]>;
}

const A = (head: [number, number], neck: [number, number], back: [number, number], bob = 0): PetDef['anchors'] => ({
  head: [head, [head[0], head[1] + bob]],
  neck: [neck, [neck[0], neck[1] + bob]],
  back: [back, [back[0], back[1] + bob]],
});

export const PETS: Record<string, PetDef> = {
  hund: {
    id: 'hund',
    name: 'Hund',
    blurb: 'En glad vän som alltid vill leka.',
    trickText: 'Biter monstret du slåss med.',
    howText: 'Hundkojan i lobbyn, gratis.',
    species: 'dog',
    emoji: '🐶',
    role: 'attack',
    rarity: 'common',
    courage: 60,
    source: { kind: 'kennel' },
    trick: { kind: 'bite', dmg: 6, cd: 1800, range: 1.5 },
    anchors: A([12, 3], [10, 6], [6, 3], 0),
  },
  katt: {
    id: 'katt',
    name: 'Katt',
    blurb: 'Mjuk och varm. Spinner när någon har ont.',
    trickText: 'Spinner och läker den som har mest ont.',
    howText: 'Hundkojan i lobbyn, gratis.',
    species: 'cat',
    emoji: '🐱',
    role: 'heal',
    rarity: 'common',
    courage: 40,
    source: { kind: 'kennel' },
    trick: { kind: 'purr', heal: 10, cd: 4500, range: 6, below: 0.85 },
    anchors: A([11, 3], [9, 5], [5, 3], 0),
  },
  rav: {
    id: 'rav',
    name: 'Räv',
    blurb: 'Nyfiken nos som hittar saker som ingen annan ser.',
    trickText: 'Gräver fram extra sagafrön efter varje strid.',
    howText: 'Du får den när du klarat Draugkryptan första gången.',
    species: 'pet_fox',
    emoji: '🦊',
    role: 'utility',
    rarity: 'rare',
    courage: 40,
    source: { kind: 'clear', dungeon: 'draug' },
    trick: { kind: 'find', seeds: 0.12 },
    anchors: A([12, 3], [10, 5], [6, 3], 0),
  },
  korp: {
    id: 'korp',
    name: 'Korp',
    blurb: 'Odens kloka fågel. Ser allt uppifrån.',
    trickText: 'Pekar ut ett monster så det tål mindre en stund.',
    howText: 'Kan ligga i Draugkungens kista.',
    species: 'korp',
    emoji: '🐦',
    role: 'utility',
    rarity: 'rare',
    courage: 35,
    source: { kind: 'drop', boss: 'draugkung', chance: 0.3 },
    trick: { kind: 'mark', bonus: 0.2, ms: 6000, cd: 9000, range: 8 },
    anchors: A([15, 5], [12, 7], [8, 5], 0),
  },
  bjorn: {
    id: 'bjorn',
    name: 'Björn',
    blurb: 'Stor, mjuk och orädd. Ställer sig framför sina vänner.',
    trickText: 'Tar emot en del av smällarna och ryter åt monster som jagar en svag vän.',
    howText: 'Kan ligga i Isbjörnens kista i Frostklyftan.',
    species: 'pet_bear',
    emoji: '🐻',
    role: 'guard',
    rarity: 'epic',
    courage: 130,
    source: { kind: 'drop', boss: 'isbjorn', chance: 0.3 },
    trick: { kind: 'guard', soak: 0.3, roarCd: 9000, range: 3 },
    anchors: A([15, 5], [12, 7], [7, 4], 0),
  },
  varg: {
    id: 'varg',
    name: 'Varg',
    blurb: 'Snabb och trogen. Yl så hör alla att gänget är här.',
    trickText: 'Bits fort, och ylar så hela laget slår hårdare en stund.',
    howText: 'Kan ligga i Sköll-kistan i Fenrisklyftan.',
    species: 'pet_wolf',
    emoji: '🐺',
    role: 'attack',
    rarity: 'epic',
    courage: 55,
    source: { kind: 'drop', boss: 'skoll', chance: 0.3 },
    trick: { kind: 'howl', dmg: 7, cd: 1500, range: 1.5, buff: 0.1, buffMs: 6000, howlCd: 24000 },
    anchors: A([14, 3], [11, 5], [6, 3], 0),
  },
  get: {
    id: 'get',
    name: 'Get',
    blurb: 'Envis get i Tors anda. Stångas för att hjälpa till.',
    trickText: 'Stångar ett monster så det blir yrt en stund.',
    howText: 'Kan ligga i Surts kista i Smedjan.',
    species: 'pet_goat',
    emoji: '🐐',
    role: 'utility',
    rarity: 'rare',
    courage: 90,
    source: { kind: 'drop', boss: 'surt', chance: 0.3 },
    trick: { kind: 'ram', dmg: 12, stunMs: 1500, cd: 12000, range: 4 },
    anchors: A([13, 3], [10, 5], [6, 3], 0),
  },
  lodjur: {
    id: 'lodjur',
    name: 'Lodjur',
    blurb: 'Tyst som en skugga. Hoppar fram när ingen ser.',
    trickText: 'Gömmer sig och hoppar fram med ett stort anfall i början av en strid.',
    howText: 'Kan ligga i Nattmarans kista i Alvernas lund.',
    species: 'pet_lynx',
    emoji: '🐆',
    role: 'attack',
    rarity: 'epic',
    courage: 50,
    source: { kind: 'drop', boss: 'nattmara', chance: 0.3 },
    trick: { kind: 'ambush', first: 28, dmg: 3, cd: 2200, range: 1.6, hideMs: 6000 },
    anchors: A([13, 3], [10, 5], [6, 3], 0),
  },
};

export const PET_IDS: readonly string[] = Object.keys(PETS);
export const petDef = (id: string | undefined): PetDef | undefined => (id ? PETS[id] : undefined);
/** The pet kind a species is the sprite of (the kennel's dog and cat, and the tame bear, wolf...). */
export const petOfSpecies = (species: string): PetDef | undefined => Object.values(PETS).find((d) => d.species === species);

/** Pet strength by run level (0 Mycket lätt .. 4 Extrem): the hard levels get a smaller helper so they do not get easier. */
export const PET_LEVEL_MUL: readonly number[] = [1, 1, 1, 0.7, 0.5];
export const petLevelMul = (level: number | undefined): number => PET_LEVEL_MUL[Math.max(0, Math.min(4, level ?? 2))] ?? 1;

// ---- cosmetic gear for pets (prepared: one test item, no collection or drops yet) ----

export interface PetCosmetic {
  id: string;
  name: string;
  anchor: PetAnchor;
}
/** Pet gear: an item sits at one anchor of the pet. Only the test item exists (a dev message puts it on or off). */
export const PET_COSMETICS: Record<string, PetCosmetic> = {
  halsduk_rod: { id: 'halsduk_rod', name: 'Röd halsduk', anchor: 'neck' },
};
/** What a pet wears: the item at each anchor (anchors left out are bare). */
export type PetWear = Partial<Record<PetAnchor, string>>;

// ---- what a player's save holds ----

export interface PetsSave {
  /** The pets this player has, by kind: since when, and the name they gave it. */
  owned: Record<string, { name?: string; since: number }>;
  /** The one that comes along (chosen in the arch window or at the kennel). */
  active?: string;
  /** True when the pet is dismissed: it neither helps nor blocks, and is nowhere. */
  out: boolean;
  /** Gear per pet kind. */
  wear?: Record<string, PetWear>;
}

export const newPetsSave = (): PetsSave => ({ owned: {}, out: false });
export const petsOf = (p: { pets?: PetsSave }): PetsSave => (p.pets ??= newPetsSave());
export const ownsPet = (p: { pets?: PetsSave }, id: string): boolean => !!p.pets?.owned[id];
export const ownedPetIds = (p: { pets?: PetsSave }): string[] => Object.keys(p.pets?.owned ?? {}).filter((id) => PETS[id]);
/** The pet that is with the player now (chosen, owned and not dismissed). */
export const activePet = (p: { pets?: PetsSave }): PetDef | undefined => {
  const s = p.pets;
  return s && !s.out && s.active && s.owned[s.active] ? PETS[s.active] : undefined;
};
