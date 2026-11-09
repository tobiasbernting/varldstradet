// Looks (cool gear that is only for show). A look is one piece of a set worn in a slot; it gives no power, no health and no armor.
// Looks come from completing a dungeon (any difficulty), and their shine grows with the number of completions, not with the
// difficulty: tier 1 plain, 2 trimmed, 3 glowing, 4 one particle effect, 5 the full effect with an aura. Svår and Extrem add one
// exclusive colourway per dungeon and a title (different, not flashier). A player's collection is permanent and lives in SagaProgress.
import type { ClassId, DungeonId, SagaProgress } from './saga.ts';
import type { PlayerState } from './types.ts';
import { CLASS_IDS, DUNGEONS, DUNGEON_IDS, newSagaProgress } from './saga.ts';
import { fmt } from './sv.ts';
import type { Change } from './protocol.ts';
import { playerChange } from './sim.ts';

export type LookSlot = 'hat' | 'shoulders' | 'shirt' | 'cloak' | 'weapon' | 'offhand' | 'amulet';
/** The slots in the order the wardrobe shows them (head to hand). */
export const LOOK_SLOTS: readonly LookSlot[] = ['hat', 'shoulders', 'shirt', 'cloak', 'weapon', 'offhand', 'amulet'];
export const isLookSlot = (s: unknown): s is LookSlot => typeof s === 'string' && (LOOK_SLOTS as readonly string[]).includes(s);

/** Shine tiers: 1 plain, 2 trimmed, 3 glowing, 4 one particle effect, 5 the full effect with an aura or a trail. */
export const LOOK_TIERS = [1, 2, 3, 4, 5] as const;
export const LOOK_TIER_MAX = 5;
export type LookTier = 1 | 2 | 3 | 4 | 5;
/** The tier at which a look starts to throw particles, and where it gets the full effect. */
export const FX_TIER = 4;
export const FX_FULL_TIER = 5;

/** The effect vocabulary of the client view (clientljs/src/looksfx.ts draws them). */
export type FxId = 'embers' | 'smoke' | 'frost' | 'lightning' | 'glitter' | 'runepulse' | 'dripping' | 'trail' | 'leaves' | 'tendrils' | 'aurora';
export const FX_IDS: readonly FxId[] = ['embers', 'smoke', 'frost', 'lightning', 'glitter', 'runepulse', 'dripping', 'trail', 'leaves', 'tendrils', 'aurora'];
/** Where on the figure an effect comes from. */
export type FxAnchor = 'tip' | 'head' | 'shoulders' | 'back' | 'feet' | 'chest' | 'hand';
export interface FxSpec {
  fx: FxId;
  at: FxAnchor;
}

/** The colours a set is drawn in (a colourway swaps them). */
export interface LookPal {
  main: string;
  dark: string;
  light: string;
  trim: string;
  glow: string;
  accent: string;
}
export type WayId = 'svar' | 'extrem';
export const WAY_IDS: readonly WayId[] = ['svar', 'extrem'];
export interface LookWay {
  name: string;
  /** Colours that replace the set's own. */
  pal: Partial<LookPal>;
}

export type WeaponShape = 'sword' | 'axe' | 'hammer' | 'staff' | 'spear';

export interface LookPiece {
  /** `<set>_<slot>`, or `sig_<name>` for a signature weapon. */
  id: string;
  set: string;
  slot: LookSlot;
  name: string;
  text: string;
  /** Weapons: the shape drawn. */
  shape?: WeaponShape;
  /** Tier 4 gives the first effect, tier 5 both. */
  fx: [FxSpec, FxSpec?];
}

export interface LookSet {
  id: string;
  name: string;
  dungeon: DungeonId;
  /** The class that wears it; null: any class. */
  cls: ClassId | null;
  pal: LookPal;
  /** What flies around it at tier 5 besides the pieces' own effects: a ground glow in the set's glow colour, or a trail. */
  aura: 'ring' | 'trail';
  ways: Record<WayId, LookWay>;
  pieces: LookPiece[];
}

const piece = (set: string, slot: LookSlot, name: string, text: string, fx: [FxSpec, FxSpec?], shape?: WeaponShape): LookPiece => ({ id: `${set}_${slot}`, set, slot, name, text, fx, ...(shape ? { shape } : {}) });
const F = (fx: FxId, at: FxAnchor): FxSpec => ({ fx, at });

export const LOOK_SETS: LookSet[] = [
  {
    id: 'draugvakt',
    name: 'Draugkungens vakt',
    dungeon: 'draug',
    cls: 'vaktare',
    pal: { main: '#7d8f84', dark: '#4a5a52', light: '#aebfb2', trim: '#d8c070', glow: '#9cff8a', accent: '#e8ffd8' },
    aura: 'ring',
    ways: {
      svar: { name: 'Gravnatt', pal: { main: '#4a5d8a', dark: '#2a3858', light: '#8aa0d0', trim: '#e0e0f0', glow: '#8ab8ff' } },
      extrem: { name: 'Benvit', pal: { main: '#d8d0b8', dark: '#9a9078', light: '#f4efe0', trim: '#c84a3a', glow: '#ff8a6a' } },
    },
    pieces: [
      piece('draugvakt', 'hat', 'Vaktens benkrona', 'En grågrön krona av gammalt järn. En kall grön låga svävar över den.', [F('smoke', 'head'), F('glitter', 'head')]),
      piece('draugvakt', 'shirt', 'Vaktens brynja', 'Ringar av grönskimrande järn från Draugkryptan.', [F('smoke', 'chest'), F('dripping', 'chest')]),
      piece('draugvakt', 'offhand', 'Vaktens sköld', 'En sköld som aldrig släpper taget om dig.', [F('smoke', 'hand'), F('runepulse', 'hand')]),
      piece('draugvakt', 'weapon', 'Vaktens svärd', 'Ett svärd som lyser blekgrönt i mörkret.', [F('smoke', 'tip'), F('glitter', 'tip')], 'sword'),
    ],
  },
  {
    id: 'frostbrost',
    name: 'Frostväktarens bröst',
    dungeon: 'frost',
    cls: 'vaktare',
    pal: { main: '#8ec8e8', dark: '#4a7ea8', light: '#dff4ff', trim: '#ffffff', glow: '#a8e8ff', accent: '#ffffff' },
    aura: 'ring',
    ways: {
      svar: { name: 'Skymningsis', pal: { main: '#5a6a9a', dark: '#323e68', light: '#a8b4e0', trim: '#d8c8ff', glow: '#b8a8ff' } },
      extrem: { name: 'Gröna isen', pal: { main: '#9ad8b8', dark: '#4a8a78', light: '#e0fff0', trim: '#ffd8a0', glow: '#80ffd0' } },
    },
    pieces: [
      piece('frostbrost', 'hat', 'Frostvaktens hjälm', 'En isblå hjälm. Det yr lite snö runt den.', [F('frost', 'head'), F('glitter', 'head')]),
      piece('frostbrost', 'shirt', 'Frostbröstet', 'Rustning av isplåt som aldrig blir kall mot dig.', [F('frost', 'chest'), F('runepulse', 'chest')]),
      piece('frostbrost', 'shoulders', 'Kristallaxlarna', 'Två stora iskristaller på axlarna.', [F('glitter', 'shoulders'), F('frost', 'shoulders')]),
      piece('frostbrost', 'offhand', 'Frostskölden', 'Kanten på skölden ryker av kall dimma.', [F('frost', 'hand'), F('glitter', 'hand')]),
    ],
  },
  {
    id: 'volvaljus',
    name: 'Völvans ljus',
    dungeon: 'alv',
    cls: 'helare',
    pal: { main: '#5fa86a', dark: '#2f6a3e', light: '#9fe0a0', trim: '#e8d27a', glow: '#fff0a0', accent: '#ffffff' },
    aura: 'ring',
    ways: {
      svar: { name: 'Rosenlund', pal: { main: '#d89aa8', dark: '#9a5a6e', light: '#ffd0dc', trim: '#fff0f0', glow: '#ffb8d0' } },
      extrem: { name: 'Höstlund', pal: { main: '#e0a848', dark: '#9a6a26', light: '#ffe090', trim: '#8a3a1e', glow: '#ffa84a' } },
    },
    pieces: [
      piece('volvaljus', 'hat', 'Ljuskransen', 'En krans av löv som lyser av sig själv.', [F('dripping', 'head'), F('leaves', 'head')]),
      piece('volvaljus', 'shirt', 'Ljusdräkten', 'En grön dräkt. Små ljusdroppar rinner av den.', [F('dripping', 'chest'), F('runepulse', 'chest')]),
      piece('volvaljus', 'cloak', 'Lövmanteln', 'En mantel av levande löv som fladdrar när du går.', [F('leaves', 'back'), F('dripping', 'back')]),
      piece('volvaljus', 'weapon', 'Ljusstaven', 'En stav med en lysande stjärna i toppen.', [F('dripping', 'tip'), F('glitter', 'tip')], 'staff'),
    ],
  },
  {
    id: 'havsvolva',
    name: 'Havets völva',
    dungeon: 'orm',
    cls: 'helare',
    pal: { main: '#3aa8a8', dark: '#1e6a78', light: '#8ae8e0', trim: '#f4f0e6', glow: '#a8fff0', accent: '#ffffff' },
    aura: 'ring',
    ways: {
      svar: { name: 'Djuphav', pal: { main: '#4a60c8', dark: '#2a3a8a', light: '#9ab0ff', trim: '#d8e4ff', glow: '#9ab8ff' } },
      extrem: { name: 'Korallrev', pal: { main: '#e0708a', dark: '#9a3a52', light: '#ffb8c8', trim: '#fff0e0', glow: '#ffa0b8' } },
    },
    pieces: [
      piece('havsvolva', 'hat', 'Pärlkronan', 'En krona av snäckor med en pärla som pulserar.', [F('runepulse', 'head'), F('glitter', 'head')]),
      piece('havsvolva', 'shirt', 'Havsdräkten', 'En dräkt som skimrar som vågor.', [F('runepulse', 'chest'), F('glitter', 'chest')]),
      piece('havsvolva', 'amulet', 'Vågamuletten', 'Håll den mot örat, så hör du havet.', [F('glitter', 'chest'), F('runepulse', 'chest')]),
      piece('havsvolva', 'weapon', 'Vågstaven', 'En stav med en pärla som lyser som månen på vattnet.', [F('runepulse', 'tip'), F('glitter', 'tip')], 'staff'),
    ],
  },
  {
    id: 'bjornbarsark',
    name: 'Björnbärsärken',
    dungeon: 'fenrir',
    cls: 'krigare',
    pal: { main: '#8a6a50', dark: '#5a4030', light: '#b8946a', trim: '#d0c8b8', glow: '#a8c8ff', accent: '#e8f0ff' },
    aura: 'trail',
    ways: {
      svar: { name: 'Gråulv', pal: { main: '#7a8088', dark: '#4a5058', light: '#b0b8c0', trim: '#e8ecf0', glow: '#c0d0ff' } },
      extrem: { name: 'Vitulv', pal: { main: '#e0e4ec', dark: '#9aa4b4', light: '#ffffff', trim: '#6a8ac8', glow: '#a8d8ff' } },
    },
    pieces: [
      piece('bjornbarsark', 'hat', 'Bärsärkshuvan', 'En huva med ulvöron. Ögonen glöder.', [F('smoke', 'head'), F('glitter', 'head')]),
      piece('bjornbarsark', 'shirt', 'Bärsärkspälsen', 'En tjock päls som doftar skog.', [F('trail', 'back'), F('smoke', 'chest')]),
      piece('bjornbarsark', 'shoulders', 'Pälsaxlarna', 'Stora lurviga axlar. Ingen vill brottas med dig.', [F('smoke', 'shoulders'), F('trail', 'back')]),
      piece('bjornbarsark', 'weapon', 'Bärsärkyxan', 'En yxa som en spöklik ulv följer efter.', [F('trail', 'tip'), F('smoke', 'tip')], 'axe'),
    ],
  },
  {
    id: 'smedensglod',
    name: 'Smedens glöd',
    dungeon: 'surt',
    cls: 'krigare',
    pal: { main: '#3a3640', dark: '#1e1c24', light: '#6a6470', trim: '#ff9a3a', glow: '#ffb84a', accent: '#fff0a0' },
    aura: 'ring',
    ways: {
      svar: { name: 'Rostglöd', pal: { main: '#6a2a20', dark: '#3a1410', light: '#a85a48', trim: '#ffcf6a', glow: '#ff8a4a' } },
      extrem: { name: 'Blåglöd', pal: { main: '#2a4a6a', dark: '#14263a', light: '#5a88b0', trim: '#6ad8ff', glow: '#6ad8ff' } },
    },
    pieces: [
      piece('smedensglod', 'hat', 'Glödhjälmen', 'En svart hjälm med glöd i ögonspringorna.', [F('embers', 'head'), F('smoke', 'head')]),
      piece('smedensglod', 'shirt', 'Glödrustningen', 'Svart järn med glödande sprickor.', [F('embers', 'chest'), F('smoke', 'chest')]),
      piece('smedensglod', 'shoulders', 'Glödaxlarna', 'Axelplåtar som ryker och gnistrar.', [F('smoke', 'shoulders'), F('embers', 'shoulders')]),
      piece('smedensglod', 'weapon', 'Glödhammaren', 'En smedshammare som aldrig kallnar.', [F('embers', 'tip'), F('smoke', 'tip')], 'hammer'),
    ],
  },
  {
    id: 'askmagiker',
    name: 'Åskmagikern',
    dungeon: 'dvarg',
    cls: 'magiker',
    pal: { main: '#6a3ab8', dark: '#3a1e80', light: '#a878f0', trim: '#ffd84a', glow: '#c8f0ff', accent: '#ffffff' },
    aura: 'ring',
    ways: {
      svar: { name: 'Stormblå', pal: { main: '#1e6aa8', dark: '#0e3a6a', light: '#6ab0e8', trim: '#e8f4ff', glow: '#a0e0ff' } },
      extrem: { name: 'Silverblixt', pal: { main: '#e0e0f0', dark: '#8a8aa8', light: '#ffffff', trim: '#6a3ab8', glow: '#e8d8ff' } },
    },
    pieces: [
      piece('askmagiker', 'hat', 'Åskhatten', 'En spetsig hatt där blixtar hoppar mellan spetsen och brättet.', [F('lightning', 'head'), F('glitter', 'head')]),
      piece('askmagiker', 'shirt', 'Åskkåpan', 'En lila kåpa. Det knastrar när du rör dig.', [F('lightning', 'chest'), F('glitter', 'chest')]),
      piece('askmagiker', 'amulet', 'Åskamuletten', 'En liten blixt i en bärnstenskula.', [F('lightning', 'chest'), F('glitter', 'chest')]),
      piece('askmagiker', 'weapon', 'Åskstaven', 'Blixtar slår från toppen på staven.', [F('lightning', 'tip'), F('glitter', 'tip')], 'staff'),
    ],
  },
  {
    id: 'skuggornas',
    name: 'Skuggornas hatt',
    dungeon: 'hel',
    cls: 'magiker',
    pal: { main: '#3a2a58', dark: '#1a1030', light: '#6a58a0', trim: '#d8d0c0', glow: '#b87aff', accent: '#e8d8ff' },
    aura: 'trail',
    ways: {
      svar: { name: 'Blågrön skugga', pal: { main: '#2a4a48', dark: '#142828', light: '#5a9a90', trim: '#d0f0e8', glow: '#6affd8' } },
      extrem: { name: 'Blodskugga', pal: { main: '#5a1a2a', dark: '#2e0c14', light: '#a04a5a', trim: '#f0d8d0', glow: '#ff6a7a' } },
    },
    pieces: [
      piece('skuggornas', 'hat', 'Skuggornas hatt', 'En mörk hatt som suger åt sig ljuset.', [F('tendrils', 'head'), F('smoke', 'head')]),
      piece('skuggornas', 'shirt', 'Skuggkåpan', 'Kåpan har ingen botten. Det syns inte var den slutar.', [F('tendrils', 'chest'), F('smoke', 'chest')]),
      piece('skuggornas', 'cloak', 'Skuggmanteln', 'En mantel av skuggor som ringlar sig bakom dig.', [F('tendrils', 'back'), F('smoke', 'back')]),
      piece('skuggornas', 'weapon', 'Skuggstaven', 'Mörka trådar slingrar sig runt toppen.', [F('tendrils', 'tip'), F('smoke', 'tip')], 'staff'),
    ],
  },
  {
    id: 'lokeslek',
    name: 'Lokes lek',
    dungeon: 'loke',
    cls: null,
    pal: { main: '#2eaa5a', dark: '#9a2a3a', light: '#7affb0', trim: '#ffd84a', glow: '#ff7ad8', accent: '#ffffff' },
    aura: 'trail',
    ways: {
      svar: { name: 'Lila lek', pal: { main: '#7a2ab8', dark: '#2a8a6a', light: '#c08af0', trim: '#fff0a0', glow: '#7affe0' } },
      extrem: { name: 'Guld och svart', pal: { main: '#ffd84a', dark: '#2a2a30', light: '#fff0a0', trim: '#2a2a30', glow: '#ffffff' } },
    },
    pieces: [
      piece('lokeslek', 'hat', 'Busmössan', 'Två horn, ett grönt och ett rött. Det skimrar åt alla håll.', [F('aurora', 'head'), F('glitter', 'head')]),
      piece('lokeslek', 'cloak', 'Dubbelmanteln', 'Grön på ena sidan och röd på andra. Vilken är den riktiga?', [F('aurora', 'back'), F('trail', 'back')]),
      piece('lokeslek', 'offhand', 'Skrattmasken', 'En mask som ler. Ibland blinkar den åt dig.', [F('aurora', 'hand'), F('glitter', 'hand')]),
      piece('lokeslek', 'amulet', 'Busringen', 'En ring som byter färg när ingen tittar.', [F('aurora', 'chest'), F('glitter', 'chest')]),
    ],
  },
  {
    id: 'huginmunin',
    name: 'Hugin och Munin',
    dungeon: 'hel',
    cls: null,
    pal: { main: '#2a2a38', dark: '#14121a', light: '#58587a', trim: '#8a8aa8', glow: '#c8c8ff', accent: '#ffffff' },
    aura: 'ring',
    ways: {
      svar: { name: 'Brun korp', pal: { main: '#5a3a28', dark: '#2e1a10', light: '#a07050', trim: '#e0c8a0', glow: '#ffd8a0' } },
      extrem: { name: 'Vit korp', pal: { main: '#e8e8f0', dark: '#9a9ab0', light: '#ffffff', trim: '#2a2a38', glow: '#c8d8ff' } },
    },
    pieces: [
      piece('huginmunin', 'hat', 'Korphatten', 'En bredbrättad hatt med en korpfjäder.', [F('leaves', 'head'), F('glitter', 'head')]),
      piece('huginmunin', 'shoulders', 'Fjäderaxlarna', 'Svarta fjädrar på axlarna. Några faller av.', [F('leaves', 'shoulders'), F('smoke', 'shoulders')]),
      piece('huginmunin', 'cloak', 'Korpmanteln', 'En mantel som fladdrar som vingar.', [F('leaves', 'back'), F('smoke', 'back')]),
      piece('huginmunin', 'amulet', 'Korpamuletten', 'En liten korp av svart sten. Den viskar ibland.', [F('glitter', 'chest'), F('runepulse', 'chest')]),
    ],
  },
];

/** A rare weapon of a dungeon's boss, wearable by any class: it already has its full effect and never changes. */
export interface SignatureWeapon extends LookPiece {
  dungeon: DungeonId;
  pal: LookPal;
}
const sig = (name: string, dungeon: DungeonId, shape: WeaponShape, title: string, text: string, pal: LookPal, fx: [FxSpec, FxSpec?]): SignatureWeapon => ({ id: `sig_${name}`, set: `sig_${name}`, slot: 'weapon', name: title, text, shape, fx, dungeon, pal });
export const SIGNATURE_WEAPONS: SignatureWeapon[] = [
  sig('mjolner', 'dvarg', 'hammer', 'Mjölner', 'Tors hammare. Det knastrar av blixtar om den.', { main: '#8a90a0', dark: '#4a5060', light: '#d0d8e8', trim: '#ffd84a', glow: '#9ad8ff', accent: '#ffffff' }, [F('lightning', 'tip'), F('glitter', 'tip')]),
  sig('gungner', 'hel', 'spear', 'Gungner', 'Odens spjut, som alltid träffar. Det lämnar ett gyllene streck.', { main: '#c8a848', dark: '#7a6020', light: '#fff0a0', trim: '#ffe27a', glow: '#ffe27a', accent: '#ffffff' }, [F('glitter', 'tip'), F('trail', 'tip')]),
  sig('frostbett', 'frost', 'sword', 'Frostbett', 'Ett svärd av evig is som aldrig smälter.', { main: '#a8e0f8', dark: '#4a88b0', light: '#f0fcff', trim: '#ffffff', glow: '#a8e8ff', accent: '#ffffff' }, [F('frost', 'tip'), F('glitter', 'tip')]),
  sig('surtsvard', 'surt', 'sword', 'Surts eldsvärd', 'Eldjättens eget svärd. Det brinner, men aldrig i din hand.', { main: '#d85a2a', dark: '#7a2410', light: '#ffd07a', trim: '#ffcf6a', glow: '#ff9a3a', accent: '#fff0a0' }, [F('embers', 'tip'), F('smoke', 'tip')]),
];

export const ALL_PIECES: LookPiece[] = [...LOOK_SETS.flatMap((s) => s.pieces), ...SIGNATURE_WEAPONS];
const PIECE_BY_ID = new Map(ALL_PIECES.map((p) => [p.id, p]));
const SET_BY_ID = new Map(LOOK_SETS.map((s) => [s.id, s]));
const SIG_BY_ID = new Map(SIGNATURE_WEAPONS.map((s) => [s.id, s]));
export const lookPiece = (id: string): LookPiece | undefined => PIECE_BY_ID.get(id);
export const lookSet = (id: string): LookSet | undefined => SET_BY_ID.get(id);
export const signatureOf = (id: string): SignatureWeapon | undefined => SIG_BY_ID.get(id);
/** The signature weapon of a dungeon's boss. */
export const signatureFor = (dungeon: DungeonId): SignatureWeapon | undefined => SIGNATURE_WEAPONS.find((s) => s.dungeon === dungeon);
/** The sets a dungeon gives pieces of (Helheim has two). */
export const setsOf = (dungeon: DungeonId): LookSet[] => LOOK_SETS.filter((s) => s.dungeon === dungeon);
/** The set a piece belongs to (a signature weapon has none). */
export const setOfPiece = (pieceId: string): LookSet | undefined => lookSet(lookPiece(pieceId)?.set ?? '');
/** The dungeon a piece comes from. */
export const dungeonOfPiece = (pieceId: string): DungeonId | undefined => setOfPiece(pieceId)?.dungeon ?? signatureOf(pieceId)?.dungeon;
/** May a hero of this class (undefined: no class yet) wear it? A class set only its own class, an any-class set and the signature weapons everyone. */
export const wearableBy = (pieceId: string, cls: ClassId | undefined): boolean => {
  const set = setOfPiece(pieceId);
  if (!set) return !!signatureOf(pieceId);
  return set.cls === null || set.cls === cls;
};

/** The clears of a dungeon that guarantee its signature weapon (a per-boss counter). */
export const SIGNATURE_AFTER = 8;
/** The chance of the signature weapon on any one clear before that. */
export const SIGNATURE_CHANCE = 0.1;
/** The difficulty levels (run levels 3 and 4) that unlock a colourway and a title. */
export const WAY_LEVELS: Record<WayId, number> = { svar: 3, extrem: 4 };

export const LOOK_TITLES: Record<DungeonId, Record<WayId, string>> = {
  draug: { svar: 'Kryptans mästare', extrem: 'Draugkungens skräck' },
  frost: { svar: 'Isens mästare', extrem: 'Frostjättens bane' },
  surt: { svar: 'Eldens mästare', extrem: 'Surts bane' },
  hel: { svar: 'Helheims mästare', extrem: 'Hels bane' },
  dvarg: { svar: 'Gruvans mästare', extrem: 'Fafners bane' },
  orm: { svar: 'Havets mästare', extrem: 'Ormens bane' },
  alv: { svar: 'Lundens mästare', extrem: 'Nattmarans bane' },
  fenrir: { svar: 'Klyftans mästare', extrem: 'Ulvens bane' },
  loke: { svar: 'Bifrosts mästare', extrem: 'Lokes bane' },
};

// ---------------------------------------------------------------------------
// The collection, what is worn, and how it is drawn
// ---------------------------------------------------------------------------

/** One owned look: its shine tier and the colourways it has (a colourway is owned per dungeon, see SagaProgress.lookWays). */
export interface LookOwn {
  tier: LookTier;
}
/** What is worn in a slot: the piece and the colourway (none: the set's own colours). */
export interface LookWorn {
  piece: string;
  way?: WayId;
}
export type LookWear = Partial<Record<LookSlot, LookWorn>>;

/** The tier of a piece a player owns (0: not owned). Signature weapons are always at the top. */
export const tierOf = (prog: SagaProgress | undefined, pieceId: string): number => (signatureOf(pieceId) ? (prog?.looks?.[pieceId] ? LOOK_TIER_MAX : 0) : (prog?.looks?.[pieceId]?.tier ?? 0));
export const ownsLook = (prog: SagaProgress | undefined, pieceId: string): boolean => tierOf(prog, pieceId) > 0;
/** Has the player unlocked this colourway for this dungeon? */
export const hasWay = (prog: SagaProgress | undefined, dungeon: DungeonId, way: WayId): boolean => !!prog?.lookWays?.includes(`${dungeon}:${way}`);
/** The colourways of a piece's dungeon that a player has. */
export const waysOf = (prog: SagaProgress | undefined, pieceId: string): WayId[] => {
  const d = dungeonOfPiece(pieceId);
  return d && !signatureOf(pieceId) ? WAY_IDS.filter((w) => hasWay(prog, d, w)) : [];
};

/** A piece's colours in a colourway (the set's own when the way is none). */
export function lookPalOf(pieceId: string, way?: WayId): LookPal {
  const sg = signatureOf(pieceId);
  if (sg) return sg.pal;
  const set = setOfPiece(pieceId)!;
  return way && set.ways[way] ? { ...set.pal, ...set.ways[way].pal } : set.pal;
}

/** The class whose looks are worn right now: the hero's class, or (before any class) the one last dressed in the wardrobe. */
export const wearClass = (prog: SagaProgress | undefined): ClassId | undefined => prog?.cls ?? prog?.lookCls;
/** What a hero of this class has on (only what they own, and may wear). */
export function wearOf(prog: SagaProgress | undefined, cls: ClassId | undefined): LookWear {
  const worn = (cls && prog?.lookWear?.[cls]) || {};
  const out: LookWear = {};
  for (const slot of LOOK_SLOTS) {
    const w = worn[slot];
    if (w && ownsLook(prog, w.piece) && lookPiece(w.piece)?.slot === slot && wearableBy(w.piece, cls)) out[slot] = w;
  }
  return out;
}

/** The code a worn look is carried in on the outfit (and drawn from): `piece|tier|way`. */
export const encodeLook = (pieceId: string, tier: number, way?: WayId): string => `${pieceId}|${tier}|${way ?? ''}`;
export interface DecodedLook {
  piece: LookPiece;
  tier: LookTier;
  way?: WayId;
  pal: LookPal;
}
export function decodeLook(code: string | undefined): DecodedLook | null {
  if (!code) return null;
  const [id, t, w] = code.split('|');
  const piece = lookPiece(id ?? '');
  if (!piece) return null;
  const tier = Math.max(1, Math.min(LOOK_TIER_MAX, Math.floor(Number(t) || 1))) as LookTier;
  const way = w === 'svar' || w === 'extrem' ? w : undefined;
  return { piece, tier, ...(way ? { way } : {}), pal: lookPalOf(piece.id, way) };
}

/** The outfit's look codes for a player (what is drawn): worn looks of the current class. */
export function looksOutfit(prog: SagaProgress | undefined): Partial<Record<LookSlot, string>> | undefined {
  const wear = wearOf(prog, wearClass(prog));
  const out: Partial<Record<LookSlot, string>> = {};
  for (const slot of LOOK_SLOTS) {
    const w = wear[slot];
    if (w) out[slot] = encodeLook(w.piece, tierOf(prog, w.piece), w.way && hasWay(prog, dungeonOfPiece(w.piece)!, w.way) ? w.way : undefined);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Puts the worn looks on the outfit that is sent to everyone (it is derived, so call it after anything that changes what is worn). */
export function syncLooks(p: PlayerState): void {
  const looks = looksOutfit(p.saga);
  if (looks) p.outfit = { ...p.outfit, looks };
  else if (p.outfit.looks) {
    const { looks: _gone, ...rest } = p.outfit;
    void _gone;
    p.outfit = rest;
  }
  // the clothes the hero switch swaps in and out carry no looks (they are put back by syncLooks)
  const prog = p.saga;
  if (prog?.farmOutfit?.looks) delete prog.farmOutfit.looks;
  if (prog?.heroOutfit?.looks) delete prog.heroOutfit.looks;
}

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------

/** What one completed dungeon gave a player, for the loot window. */
export interface LookDrop {
  piece: string;
  /** The tier it is at now. */
  tier: number;
  /** A new piece (else: +1 shine on a piece already owned). */
  isNew: boolean;
  /** A signature weapon: the rare one. */
  signature?: boolean;
}
export interface LookReward {
  drops: LookDrop[];
  /** Colourways unlocked by this clear (dungeon and way), and the titles that came with them. */
  ways: WayId[];
  titles: string[];
  /** Everything in the dungeon's sets is at the top already. */
  complete: boolean;
}

/** Are all pieces of a set owned at the top tier? */
export const setComplete = (prog: SagaProgress | undefined, set: LookSet): boolean => set.pieces.every((p) => tierOf(prog, p.id) >= LOOK_TIER_MAX);
/** How many shine steps a set has in all (pieces owned count 1, each tier above counts 1) and the most it can have. */
export const setProgress = (prog: SagaProgress | undefined, set: LookSet): { have: number; max: number } => ({ have: set.pieces.reduce((n, p) => n + tierOf(prog, p.id), 0), max: set.pieces.length * LOOK_TIER_MAX });

/** Picks one entry of a list with the random function. */
const pick = <T>(list: T[], rnd: () => number): T => list[Math.min(list.length - 1, Math.floor(rnd() * list.length))]!;

/**
 * A completed dungeon, at any difficulty (`level` 0..4 is only for the colourways): each member gets one thing from the
 * dungeon's sets, either a new piece or +1 shine on one they own, never a wasted one while a set still has something to give;
 * the dungeon's signature weapon with a small chance and for sure at the SIGNATURE_AFTER:th clear; and on Svår and Extrem
 * that level's colourway and title. The result is told with a `loot` change (the loot window shows the look and its effect).
 */
export function awardLooks(p: PlayerState, dungeon: DungeonId, level: number, rnd: () => number, out: Change[]): LookReward | null {
  if (p.bot) return null;
  const prog = (p.saga ??= newSagaProgress());
  const owned = (prog.looks ??= {});
  const clears = (prog.lookClears ??= {});
  const n = (clears[dungeon] = (clears[dungeon] ?? 0) + 1);
  const reward: LookReward = { drops: [], ways: [], titles: [], complete: false };

  // the set's own piece: a new one or +1 shine
  const open = setsOf(dungeon).filter((s) => !setComplete(prog, s));
  if (open.length) {
    const set = pick(open, rnd);
    const missing = set.pieces.filter((x) => !owned[x.id]);
    const upgradable = set.pieces.filter((x) => owned[x.id] && owned[x.id]!.tier < LOOK_TIER_MAX);
    const fresh = missing.length && (!upgradable.length || rnd() < missing.length / (missing.length + upgradable.length));
    if (fresh) {
      const x = pick(missing, rnd);
      owned[x.id] = { tier: 1 };
      reward.drops.push({ piece: x.id, tier: 1, isNew: true });
    } else {
      // the least shiny first, so a set grows evenly
      const low = Math.min(...upgradable.map((x) => owned[x.id]!.tier));
      const x = pick(
        upgradable.filter((u) => owned[u.id]!.tier === low),
        rnd,
      );
      const t = (owned[x.id]!.tier = Math.min(LOOK_TIER_MAX, owned[x.id]!.tier + 1) as LookTier);
      reward.drops.push({ piece: x.id, tier: t, isNew: false });
    }
  }
  reward.complete = open.length === 0;

  // the signature weapon
  const sg = signatureFor(dungeon);
  if (sg && !owned[sg.id] && (n >= SIGNATURE_AFTER || rnd() < SIGNATURE_CHANCE)) {
    owned[sg.id] = { tier: LOOK_TIER_MAX };
    reward.drops.push({ piece: sg.id, tier: LOOK_TIER_MAX, isNew: true, signature: true });
  }

  // the colourway and the title of a hard level
  for (const way of WAY_IDS) {
    if (level < WAY_LEVELS[way] || (way === 'svar' && level !== WAY_LEVELS.svar) || hasWay(prog, dungeon, way)) continue;
    (prog.lookWays ??= []).push(`${dungeon}:${way}`);
    reward.ways.push(way);
    const title = LOOK_TITLES[dungeon][way];
    if (!prog.titles.includes(title)) prog.titles.push(title);
    reward.titles.push(title);
  }

  syncLooks(p);
  if (reward.drops.length || reward.ways.length) out.push({ t: 'loot', to: p.id, from: DUNGEONS[dungeon].name, items: [], coins: 0, stars: 0, looks: { drops: reward.drops, ways: reward.ways, titles: reward.titles, dungeon, level } });
  out.push(playerChange(p));
  return reward;
}

// ---------------------------------------------------------------------------
// Wearing
// ---------------------------------------------------------------------------

export const LOOK_T = {
  worn: '{item} är på!',
  off: 'Du tog av dig {item}.',
  notYours: 'Du har inte den än.',
  notYourClass: '{item} är för {cls}.',
  noSlot: 'Den passar inte där.',
  wayNone: 'Du har inte den färgen än.',
  standPut: '{item} står på stället.',
  standEmpty: 'Du har inga coola saker att ställa upp än. Klara en färd!',
  dropNew: 'Ny!',
  dropUp: 'Skinar mer!',
};

/** Puts a look on (piece `null`: takes the slot's piece off) for a class (default: the hero's own). Free, instant, anywhere. */
export function equipLook(p: PlayerState, slot: unknown, pieceId: string | null, way: unknown, cls: unknown): Change[] {
  if (!isLookSlot(slot)) return [];
  const prog = (p.saga ??= newSagaProgress());
  const c: ClassId | undefined = typeof cls === 'string' && (CLASS_IDS as readonly string[]).includes(cls) ? (cls as ClassId) : wearClass(prog);
  if (!c) return [];
  const wear = ((prog.lookWear ??= {})[c] ??= {});
  if (pieceId === null) delete wear[slot];
  else {
    const piece = lookPiece(pieceId);
    if (!piece || piece.slot !== slot) return [];
    if (!ownsLook(prog, pieceId)) return [];
    if (!wearableBy(pieceId, c)) return [];
    const w = way === 'svar' || way === 'extrem' ? way : undefined;
    const dungeon = dungeonOfPiece(pieceId);
    wear[slot] = { piece: pieceId, ...(w && dungeon && hasWay(prog, dungeon, w) && !signatureOf(pieceId) ? { way: w } : {}) };
  }
  if (!prog.cls) prog.lookCls = c;
  syncLooks(p);
  return [playerChange(p)];
}

/** What a gear stand shows: `look:<piece>|<tier>|<way>` in its data (an old stand holds an item id instead). */
export const STAND_PREFIX = 'look:';
export const standLook = (data: string | undefined): DecodedLook | null => (data?.startsWith(STAND_PREFIX) ? decodeLook(data.slice(STAND_PREFIX.length)) : null);
/** Puts a look from the player's collection on a stand (data), or clears it (piece null). Returns the new data. */
export function standData(p: PlayerState, pieceId: string | null, way: unknown): string | null | undefined {
  if (pieceId === null) return null;
  const prog = p.saga;
  if (!prog || !ownsLook(prog, pieceId)) return undefined;
  const w = way === 'svar' || way === 'extrem' ? way : undefined;
  const dungeon = dungeonOfPiece(pieceId);
  const useWay = w && dungeon && hasWay(prog, dungeon, w) && !signatureOf(pieceId) ? w : undefined;
  return STAND_PREFIX + encodeLook(pieceId, tierOf(prog, pieceId), useWay);
}

/** Does a player have any look at all? */
export const hasLooks = (prog: SagaProgress | undefined): boolean => !!prog?.looks && Object.keys(prog.looks).length > 0;

/**
 * Development only (DEV_TELEPORT=1, `dev looks`): puts every piece of a set (every set when `setId` is left out) in the collection at
 * `tier` (1..5), and with `ways` the colourways and titles of every dungeon; `cls` makes that class the one the wardrobe dresses.
 */
export function devGrantLooks(p: PlayerState, setId: string | undefined, tier: number, ways: boolean, signature: boolean, cls?: string): Change[] {
  const prog = (p.saga ??= newSagaProgress());
  if (cls && (CLASS_IDS as readonly string[]).includes(cls) && !prog.cls) prog.lookCls = cls as ClassId;
  const owned = (prog.looks ??= {});
  const t = Math.max(1, Math.min(LOOK_TIER_MAX, Math.floor(tier) || LOOK_TIER_MAX)) as LookTier;
  for (const s of LOOK_SETS) {
    if (setId && s.id !== setId) continue;
    for (const x of s.pieces) owned[x.id] = { tier: t };
  }
  if (signature) for (const s of SIGNATURE_WEAPONS) owned[s.id] = { tier: LOOK_TIER_MAX };
  if (ways)
    for (const d of DUNGEON_IDS) {
      for (const w of WAY_IDS) {
        if (!hasWay(prog, d, w)) (prog.lookWays ??= []).push(`${d}:${w}`);
        const title = LOOK_TITLES[d][w];
        if (!prog.titles.includes(title)) prog.titles.push(title);
      }
    }
  syncLooks(p);
  return [playerChange(p)];
}

/** "Brynja (Glödande)": a look's name and its shine, for a toast. */
export const lookLabel = (pieceId: string, tier: number): string => fmt('{name} ({tier})', { name: lookPiece(pieceId)?.name ?? pieceId, tier: LOOK_TIER_NAMES[Math.max(1, Math.min(LOOK_TIER_MAX, tier)) - 1]! });
export const LOOK_TIER_NAMES: readonly string[] = ['Vanlig', 'Kantad', 'Glödande', 'Gnistrande', 'Strålande'];
export const LOOK_TIER_HINTS: readonly string[] = ['Enkel och slät.', 'Med fin kant av metall.', 'Den lyser av sig själv.', 'Gnistor och rök följer den.', 'Full effekt, med sken runt dig!'];
