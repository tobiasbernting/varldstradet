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
/** The gear's size class: a large pet gets every piece one column and one row bigger (art/src/petlooks.ts). */
export type PetSize = 'small' | 'large';
/** A box on the sprite: x, y, width, height. */
export type PetBox = [number, number, number, number];
/** Empty rows the art puts above every pet sprite so a horn, a plume or a spike has room to stand up (the sprite is that much taller). */
export const PET_HEADROOM = 3;

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
  /** The size class gear is drawn in (small: katt, hund, räv, korp, lodjur; large: björn, varg, get). */
  size: PetSize;
  /** What gear must never cover, per walk frame: the eyes and the muzzle (a test checks every piece against these). */
  face: { eye: PetBox[]; muzzle: PetBox[] };
}

// The table is written in the pixels of the animal as it is drawn (art/src/petanimals.ts); the sprite has PET_HEADROOM empty rows on
// top, which the helpers add to every y. `bob` moves the neck and the back on the second walk frame (a hop), `headBob` the head.
const up = (a: [number, number], dy = 0): [number, number] => [a[0], a[1] + PET_HEADROOM + dy];
const A = (head: [number, number], neck: [number, number], back: [number, number], bob = 0, headBob = 0): PetDef['anchors'] => ({
  head: [up(head), up(head, headBob)],
  neck: [up(neck), up(neck, bob)],
  back: [up(back), up(back, bob)],
});
const box = (b: PetBox): PetBox => [b[0], b[1] + PET_HEADROOM, b[2], b[3]];
const F = (eye: PetBox, muzzle: PetBox): PetDef['face'] => ({ eye: [box(eye), box(eye)], muzzle: [box(muzzle), box(muzzle)] });

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
    anchors: A([11, 2], [9, 5], [5, 3]),
    size: 'small',
    face: F([12, 3, 3, 3], [13, 5, 3, 4]),
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
    anchors: A([11, 2], [8, 5], [5, 4]),
    size: 'small',
    face: F([11, 3, 3, 2], [11, 5, 3, 2]),
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
    anchors: A([13, 2], [10, 5], [7, 3]),
    size: 'small',
    face: F([13, 4, 2, 2], [14, 6, 4, 2]),
  },
  korp: {
    id: 'korp',
    name: 'Korp',
    blurb: 'Odens kloka fågel. Ser allt uppifrån.',
    trickText: 'Pekar ut ett monster så det tål mindre en stund.',
    howText: 'Kan ligga i Draugkungens kista.',
    species: 'pet_korp',
    emoji: '🐦',
    role: 'utility',
    rarity: 'rare',
    courage: 35,
    source: { kind: 'drop', boss: 'draugkung', chance: 0.3 },
    trick: { kind: 'mark', bonus: 0.2, ms: 6000, cd: 9000, range: 8 },
    anchors: A([14, 0], [11, 5], [7, 4], -1),
    size: 'small',
    face: F([14, 2, 2, 2], [16, 3, 4, 3]),
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
    anchors: A([17, 2], [12, 8], [7, 3]),
    size: 'large',
    face: F([16, 4, 2, 2], [17, 6, 5, 5]),
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
    anchors: A([14, 2], [11, 6], [7, 4]),
    size: 'large',
    face: F([15, 3, 2, 2], [16, 5, 4, 3]),
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
    anchors: A([12, 1], [10, 6], [6, 3]),
    size: 'large',
    face: F([12, 3, 2, 2], [13, 5, 3, 3]),
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
    anchors: A([14, 3], [10, 7], [6, 3]),
    size: 'small',
    face: F([13, 4, 2, 2], [14, 6, 3, 3]),
  },
};

export const PET_IDS: readonly string[] = Object.keys(PETS);
export const petDef = (id: string | undefined): PetDef | undefined => (id ? PETS[id] : undefined);
/** The pet kind a species is the sprite of (the kennel's dog and cat, and the tame bear, wolf...). */
export const petOfSpecies = (species: string): PetDef | undefined => Object.values(PETS).find((d) => d.species === species);

/** Pet strength by run level (0 Mycket lätt .. 4 Extrem): the hard levels get a smaller helper so they do not get easier. */
export const PET_LEVEL_MUL: readonly number[] = [1, 1, 1, 0.35, 0.15];
export const petLevelMul = (level: number | undefined): number => PET_LEVEL_MUL[Math.max(0, Math.min(4, level ?? 2))] ?? 1;

// ---- gear for pets ----
// Pet gear are looks (looks.ts: PET_LOOK_SETS) worn at an anchor of the animal: the table's `anchors` are all a kind needs for that.

/** What a pet wears as it is drawn and sent to everyone: a look code (`piece|tier|way`, see encodeLook) at each anchor. */
export type PetWear = Partial<Record<PetAnchor, string>>;
/** What a player has put on one of their pets: the piece (and colourway) at each anchor. */
export type PetDress = Partial<Record<PetAnchor, { piece: string; way?: 'svar' | 'extrem' }>>;

// ---- what a player's save holds ----

export interface PetsSave {
  /** The pets this player has, by kind: since when, and the name they gave it. */
  owned: Record<string, { name?: string; since: number }>;
  /** The one that comes along (chosen in the arch window or at the kennel). */
  active?: string;
  /** True when the pet is dismissed: it neither helps nor blocks, and is nowhere. */
  out: boolean;
  /** The pet gear this player owns (piece id: its shine tier 1..5), shared by all their pets. */
  gear?: Record<string, { tier: number }>;
  /** How many dungeon clears with a pet along have been counted, per dungeon (it seeds the dice and keeps them fair). */
  gearClears?: Record<string, number>;
  /** What each pet kind wears. */
  dress?: Record<string, PetDress>;
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
