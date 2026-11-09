// Things for a house to show off: a longhouse hearth, a stand for gear, the Norse decor the dungeons give, and a trophy for every
// dungeon boss (the rim says the hardest level it was won on). Drawn in code like everything else.
import { DUNGEONS, TROPHY_LEVELS, TROPHY_PREFIX } from '@lilla-garden/shared';
import { Px, shade } from './px.js';

type SetArt = (kind: string, frames: Px[], ox?: number, oy?: number, animated?: boolean) => void;

const OUTLINE = '#2b2419';
const WOOD = '#9a6a3a';
const WOOD_D = '#6f4a26';
const WOOD_L = '#c58f55';
const STONE = '#9d9a92';
const STONE_D = '#6f6c66';
const STONE_L = '#c9c6bd';
const IRON = '#8d939c';
const IRON_L = '#c4cad2';
const IRON_D = '#5a6068';
const GOLD = '#e2b43a';
const GOLD_L = '#ffe27a';
const RED = '#b5413a';
const CREAM = '#efe4c8';

// ---------------------------------------------------------------------------
// The hearth: a long stone-ringed fire pit at the back wall of the longhouse (48×28 on three tiles, two flickering frames)
// ---------------------------------------------------------------------------

const hearth = (f: number): Px => {
  const p = new Px(48, 28);
  // the chimney hood against the wall
  p.rect(6, 0, 36, 4, STONE_D).rect(6, 0, 36, 1, STONE).rect(8, 4, 32, 3, STONE_D);
  // the stone ring and the dark pit
  p.rect(1, 10, 46, 17, STONE).rect(1, 10, 46, 2, STONE_L).rect(1, 25, 46, 2, STONE_D);
  for (let x = 1; x < 46; x += 6) p.rect(x, 12, 1, 13, STONE_D);
  p.rect(5, 13, 38, 9, '#241a14');
  // logs and embers
  p.rect(8, 19, 14, 3, WOOD_D).rect(8, 19, 14, 1, WOOD).rect(26, 18, 14, 4, WOOD_D).rect(26, 18, 14, 1, WOOD);
  for (let i = 0; i < 9; i++) p.px(7 + i * 4 + (f ? 1 : 0), 21, i % 2 ? '#ff7a2a' : '#ffb347');
  // flames: three tongues that sway between frames
  const tongue = (cx: number, h: number, lean: number) => {
    for (let y = 0; y < h; y++) {
      const w = Math.max(1, Math.round((h - y) * 0.45 + 1));
      const x = cx + Math.round((y / h) * lean);
      p.rect(x - w, 21 - y - 1, w * 2, 1, y < h * 0.4 ? '#ffe27a' : y < h * 0.75 ? '#ff9a2a' : '#e2501f');
    }
  };
  tongue(14, f ? 9 : 11, f ? 1 : -1);
  tongue(24, f ? 13 : 10, f ? -1 : 1);
  tongue(34, f ? 10 : 12, f ? 1 : -1);
  return p.outline(OUTLINE);
};

// ---------------------------------------------------------------------------
// The gear stand
// ---------------------------------------------------------------------------

const gearStand = (): Px => {
  const p = new Px(16, 24);
  p.rect(7, 4, 2, 17, WOOD_D).rect(7, 4, 1, 17, WOOD);
  p.rect(2, 8, 12, 2, WOOD).rect(2, 8, 12, 1, WOOD_L).rect(1, 7, 2, 4, WOOD_D).rect(13, 7, 2, 4, WOOD_D);
  p.rect(6, 1, 4, 3, WOOD_L).rect(6, 1, 4, 1, '#e0b070');
  p.rect(3, 21, 10, 2, WOOD_D).rect(3, 21, 10, 1, WOOD).rect(5, 19, 6, 2, WOOD_D);
  return p.outline(OUTLINE);
};

// ---------------------------------------------------------------------------
// The Norse set
// ---------------------------------------------------------------------------

const vikingShield = (): Px => {
  const p = new Px(16, 22);
  p.rect(6, 14, 4, 6, WOOD_D).rect(6, 14, 1, 6, WOOD).rect(3, 19, 10, 2, WOOD_D).rect(3, 19, 10, 1, WOOD);
  p.circle(8, 7, 7, RED);
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    if (a % 2 === 0) p.px(8 + Math.cos(ang) * 5.6, 7 + Math.sin(ang) * 5.6, CREAM);
  }
  p.circle(8, 7, 4, shade(RED, 0.8)).circle(8, 7, 2.5, IRON).px(7, 6, IRON_L).px(8, 6, IRON_L).px(8, 8, IRON_D);
  p.rect(7, 1, 2, 12, shade(CREAM, 0.95)).rect(2, 6, 12, 2, shade(CREAM, 0.95));
  p.circle(8, 7, 2.5, IRON).px(7, 6, IRON_L).px(8, 6, IRON_L).px(8, 8, IRON_D);
  return p.outline(OUTLINE);
};

const runeStone = (f: number): Px => {
  const p = new Px(16, 24);
  const G = '#8a8a8e';
  p.ellipse(2, 1, 12, 10, G).rect(2, 6, 12, 15, G).ellipse(1, 16, 14, 7, G);
  p.rect(3, 6, 2, 14, '#a4a4a8').ellipse(4, 2, 5, 4, '#a4a4a8').rect(12, 7, 2, 14, '#6a6a70').px(9, 13, '#76767c');
  p.rect(1, 21, 14, 2, '#4f8a35').px(0, 22, '#5a9a40').px(15, 21, '#5a9a40');
  const g = f ? '#9fe0ff' : '#4fb6f0';
  p.tpl(5, 5, ['.|.|.', '|/|.|', '.|`|.', '|.|/|', '.`|.|', '|.|`.', '.|/|.', '|`.|.'], { '|': g, '/': g, '`': g });
  if (f) p.px(4, 4, '#dff6ff').px(11, 10, '#dff6ff').px(4, 15, '#dff6ff');
  return p.outline(OUTLINE);
};

const weaponRack = (): Px => {
  const p = new Px(16, 24);
  p.rect(1, 3, 2, 20, WOOD_D).rect(13, 3, 2, 20, WOOD_D).rect(1, 3, 1, 20, WOOD);
  p.rect(1, 8, 14, 2, WOOD).rect(1, 8, 14, 1, WOOD_L).rect(1, 16, 14, 2, WOOD).rect(1, 16, 14, 1, WOOD_L);
  p.rect(0, 22, 4, 2, WOOD_D).rect(12, 22, 4, 2, WOOD_D);
  // a sword with a gold hilt, an axe, a spear
  p.rect(5, 0, 2, 12, IRON_L).rect(5, 0, 1, 12, '#e6eaf0').rect(4, 12, 4, 1, GOLD).rect(5, 13, 2, 4, WOOD_D).px(5, 17, GOLD);
  p.line(9, 5, 9, 19, WOOD_L).tpl(9, 3, ['.##', '###', '###', '.#.'], { '#': IRON_L }).px(10, 4, '#e6eaf0');
  p.line(11, 14, 11, 4, WOOD).tpl(10, 0, ['.#.', '###', '.#.'], { '#': IRON_L });
  return p.outline(OUTLINE);
};

const drinkingHorn = (): Px => {
  const p = new Px(16, 16);
  // a little wooden cradle, and the horn curling from its wide gold-rimmed mouth (top right) down to the tip (left)
  p.rect(2, 12, 12, 2, WOOD_D).rect(2, 12, 12, 1, WOOD).rect(3, 10, 2, 2, WOOD_D).rect(10, 10, 2, 2, WOOD_D);
  const pt = (t: number): [number, number, number] => [(1 - t) ** 2 * 13 + 2 * (1 - t) * t * 12 + t * t * 2.5, (1 - t) ** 2 * 3.5 + 2 * (1 - t) * t * 14 + t * t * 8.5, 3.4 - 2.6 * t];
  for (let t = 0; t <= 1.001; t += 0.025) {
    const [x, y, r] = pt(t);
    p.circle(x, y, r, '#cfc09a');
  }
  for (let t = 0.05; t <= 1.001; t += 0.025) {
    const [x, y, r] = pt(t);
    p.circle(x - 0.5, y - 0.6, Math.max(0.6, r - 1.4), '#efe4c8');
  }
  for (let t = 0.4; t <= 1.001; t += 0.05) {
    const [x, y, r] = pt(t);
    p.px(x + r * 0.5, y + r * 0.6, '#9a8a64');
  }
  // the mouth: dark inside, a gold rim
  p.ellipse(10.6, 0.6, 5.6, 5.6, GOLD).ellipse(11.4, 1.4, 4, 4, '#3a2a1a').px(11, 1, GOLD_L).px(15, 3, GOLD_L);
  p.px(2, 9, '#7a6a48').px(3, 9, '#7a6a48');
  return p.outline(OUTLINE);
};

const vikingBanner = (): Px => {
  const p = new Px(16, 40);
  p.rect(7, 3, 2, 34, WOOD_D).rect(7, 3, 1, 34, WOOD);
  p.rect(6, 0, 4, 3, GOLD).rect(7, 0, 1, 2, GOLD_L);
  p.rect(2, 5, 12, 2, WOOD_D).rect(2, 5, 12, 1, WOOD_L).px(2, 7, GOLD).px(13, 7, GOLD);
  p.rect(3, 7, 10, 20, RED).rect(3, 7, 10, 1, shade(RED, 0.7)).rect(3, 8, 1, 19, shade(RED, 1.2)).rect(12, 8, 1, 19, shade(RED, 0.75));
  p.rect(3, 27, 4, 3, RED).rect(9, 27, 4, 3, RED).rect(7, 27, 2, 5, shade(RED, 0.85)).px(7, 32, shade(RED, 0.85)).px(8, 32, shade(RED, 0.85));
  p.rect(4, 9, 8, 1, GOLD).rect(4, 24, 8, 1, GOLD);
  // a raven in white and a rune
  p.tpl(5, 12, ['..##....', '.####...', '#######.', '.######.', '..####..', '...##...', '..#..#..'], { '#': CREAM });
  p.px(6, 13, OUTLINE);
  p.rect(5, 36, 6, 4, STONE_D).rect(5, 36, 6, 1, STONE_L).rect(6, 37, 4, 2, STONE);
  return p.outline(OUTLINE);
};

const bearRug = (): Px => {
  const p = new Px(32, 32);
  const B = '#7a4f2e';
  const L = '#9a6a40';
  const D = '#573620';
  // paws, body, head with ears and a pale snout
  for (const [x, y] of [[2, 3], [22, 3], [2, 21], [22, 21]] as const) p.ellipse(x, y, 8, 8, B).px(x + 2, y + 6, D).px(x + 4, y + 6, D).px(x + 6, y + 6, D);
  p.ellipse(4, 5, 24, 24, B).ellipse(7, 8, 18, 14, L);
  p.circle(9, 4, 3, B).circle(23, 4, 3, B).circle(9, 4, 1.5, D).circle(23, 4, 1.5, D);
  p.ellipse(8, 0, 16, 14, B).ellipse(11, 1, 10, 6, L);
  p.ellipse(11, 7, 10, 7, '#d9b88a').rect(14, 8, 4, 2, OUTLINE).px(12, 4, OUTLINE).px(19, 4, OUTLINE);
  p.rect(15, 11, 2, 1, D);
  for (let i = 0; i < 18; i++) p.px(6 + ((i * 7) % 20), 14 + ((i * 5) % 13), D);
  return p.outline(OUTLINE);
};

const meadBarrel = (): Px => {
  const p = new Px(16, 20);
  p.ellipse(1, 2, 14, 17, WOOD).rect(2, 4, 12, 12, WOOD).rect(3, 3, 3, 15, WOOD_L).rect(11, 3, 2, 15, WOOD_D);
  p.rect(1, 5, 14, 2, GOLD).rect(1, 14, 14, 2, GOLD).rect(1, 5, 14, 1, GOLD_L).rect(1, 14, 14, 1, GOLD_L);
  p.rect(7, 9, 3, 2, IRON_D).rect(6, 11, 5, 1, IRON).px(8, 12, '#e8b84a').px(8, 13, '#e8b84a');
  p.rect(5, 1, 6, 2, WOOD_L);
  return p.outline(OUTLINE);
};

const candleStick = (f: number): Px => {
  const p = new Px(16, 24);
  const BRASS = '#c9a03a';
  p.rect(7, 8, 2, 12, BRASS).rect(4, 20, 8, 2, BRASS).rect(5, 19, 6, 1, GOLD_L).rect(3, 7, 10, 1, BRASS).rect(3, 5, 1, 3, BRASS).rect(12, 5, 1, 3, BRASS).rect(7, 5, 2, 3, BRASS);
  for (const x of [2, 7, 12]) {
    const top = x === 7 ? 2 : 3;
    p.rect(x, top + 2, 2, 5 - (x === 7 ? 0 : 1), CREAM).rect(x, top + 2, 1, 5, '#fff8e4');
    const lean = (f + x) % 2;
    p.rect(x, top - 1, 2, 2, '#ffb347').px(x + lean, top - 2, '#ff8a2a').px(x, top, '#ffe27a');
  }
  return p.outline(OUTLINE);
};

const yggdrasilSapling = (f: number): Px => {
  const p = new Px(16, 24);
  p.rect(4, 17, 8, 6, '#a5593a').rect(4, 17, 8, 1, '#c97a52').rect(5, 22, 6, 1, '#7a3e26');
  p.rect(7, 8, 2, 10, WOOD_D).rect(7, 8, 1, 10, WOOD);
  const leaf = f ? '#9cff8a' : '#7fe070';
  p.ellipse(2, 1, 12, 9, '#3f9a4a').ellipse(4, 0, 8, 6, leaf).ellipse(3, 3, 5, 4, '#56b85a').ellipse(9, 4, 5, 4, '#56b85a');
  p.px(5, 2, '#dfffc8').px(10, 5, '#dfffc8').px(7, 1, '#dfffc8');
  p.line(7, 12, 4, 9, WOOD_D).line(8, 13, 11, 10, WOOD_D);
  return p.outline(OUTLINE);
};

const ravenPerch = (): Px => {
  const p = new Px(16, 24);
  p.rect(7, 8, 2, 14, WOOD_D).rect(7, 8, 1, 14, WOOD).rect(3, 21, 10, 2, WOOD_D).rect(3, 21, 10, 1, WOOD);
  p.rect(1, 9, 14, 2, WOOD).rect(1, 9, 14, 1, WOOD_L);
  // the raven: black, with a sheen on the wing and a yellow beak
  const K = '#1f1f2a';
  p.ellipse(4, 3, 9, 7, K).circle(11, 3, 3, K).rect(1, 6, 4, 2, K).rect(1, 8, 2, 1, K);
  p.rect(14, 3, 2, 1, '#e8c23a').px(11, 2, '#ffffff').rect(6, 5, 5, 1, '#3d3d55').rect(5, 6, 4, 1, '#3d3d55');
  p.px(7, 10, K).px(9, 10, K);
  return p.outline(OUTLINE);
};

// ---------------------------------------------------------------------------
// Trophies: a round plaque on a post, the rim (and the plate on the base) bronze, silver or gold by the level it was won on
// ---------------------------------------------------------------------------

interface Rim {
  rim: string;
  light: string;
  dark: string;
}
const RIMS: Rim[] = [
  { rim: '#8a5a2e', light: '#b07a44', dark: '#5a3a1c' }, // 0 Mycket lätt: plain wood
  { rim: '#c98a4a', light: '#e8b078', dark: '#8a5424' }, // 1 Lätt: bronze
  { rim: '#c6ced8', light: '#f2f5f9', dark: '#8a93a0' }, // 2 Medel: silver
  { rim: '#f2c744', light: '#fff0a0', dark: '#b98a1c' }, // 3 Svår: gold
  { rim: '#f2c744', light: '#fff0a0', dark: '#b98a1c' }, // 4 Extrem: gold with gems
];

/** Each boss's emblem (8 columns), its colour, in a few rows. '#' is the colour, 'o' a lighter dot. */
const EMBLEMS: Record<string, { col: string; rows: string[] }> = {
  // a crown
  draugkung: { col: '#9cff8a', rows: ['#..##..#', '##.##.##', '########', '########', '.oooooo.', '.######.'] },
  // a snowflake
  rimturs: { col: '#bfe9ff', rows: ['...##...', '.#.##.#.', '..####..', '########', '..####..', '.#.##.#.', '...##...'] },
  // a flame
  surt: { col: '#ff8a3a', rows: ['...#....', '..##..#.', '.###.##.', '.######.', '########', '###oo###', '.######.', '..####..'] },
  // a skull
  hel: { col: '#e8ecea', rows: ['.######.', '########', '##.##.##', '##.##.##', '########', '.######.', '.#.##.#.'] },
  // a gem from the hoard
  fafner: { col: '#ffd23f', rows: ['..####..', '.######.', '########', '#oo###o#', '.######.', '..####..', '...##...'] },
  // a serpent ring
  jormungand: { col: '#5fd0c8', rows: ['..####..', '.##..##.', '##....##', '#...o..#', '##....##', '.##..##.', '..####..'] },
  // a crescent moon
  nattmara: { col: '#d8c8ff', rows: ['..####..', '.###....', '###..o..', '###.....', '###.....', '.###....', '..####..'] },
  // a wolf's head
  fenrisulven: { col: '#cfe8ff', rows: ['#......#', '##....##', '########', '#.####.#', '########', '.######.', '..####..', '...##...'] },
  // Loke's horned mask
  loke: { col: '#3ac878', rows: ['#......#', '##....##', '.######.', '##.##.##', '.######.', '..#..#..', '...##...'] },
};

const trophy = (boss: string, level: number): Px => {
  const p = new Px(16, 24);
  const r = RIMS[level] ?? RIMS[0]!;
  // the post and the base with a plate in the rim's metal
  p.rect(7, 17, 2, 4, WOOD_D).rect(7, 17, 1, 4, WOOD);
  p.rect(2, 20, 12, 4, WOOD_D).rect(2, 20, 12, 1, WOOD).rect(4, 21, 8, 2, r.rim).rect(4, 21, 8, 1, r.light).rect(4, 22, 8, 1, r.dark);
  // the plaque
  p.circle(8, 8.5, 8, r.dark).circle(8, 8.5, 7.2, r.rim).circle(8, 8.5, 5.7, '#2a2420');
  p.px(3, 4, r.light).px(4, 3, r.light).px(5, 2, r.light).px(6, 2, r.light);
  const e = EMBLEMS[boss];
  if (e) {
    const w = 8;
    const x0 = Math.round(8 - w / 2);
    const y0 = Math.round(8.5 - e.rows.length / 2);
    p.tpl(x0, y0, e.rows, { '#': e.col, o: '#ffffff' });
  }
  if (level >= 4) {
    // the extreme level: four gems on the rim
    p.px(8, 1, '#e0344a').px(8, 16, '#3a8fe8').px(1, 8, '#3ac878').px(15, 8, '#b84fe8');
    p.px(8, 0, '#ff9aa8').px(0, 8, '#9affc0').px(15, 7, '#e0a8ff');
  }
  return p.outline(OUTLINE);
};

export function drawHouse(set: SetArt): void {
  set('hearth', [hearth(0), hearth(1)], 0, -12, true);
  set('gear_stand', [gearStand()], 0, -8);
  set('viking_shield', [vikingShield()], 0, -6);
  set('rune_stone', [runeStone(0), runeStone(1)], 0, -8, true);
  set('weapon_rack', [weaponRack()], 0, -8);
  set('drinking_horn', [drinkingHorn()]);
  set('viking_banner', [vikingBanner()], 0, -24);
  set('bear_rug', [bearRug()]);
  set('mead_barrel', [meadBarrel()], 0, -4);
  set('candle_stick', [candleStick(0), candleStick(1)], 0, -8, true);
  set('yggdrasil_sapling', [yggdrasilSapling(0), yggdrasilSapling(1)], 0, -8, true);
  set('raven_perch', [ravenPerch()], 0, -8);
  for (const d of Object.values(DUNGEONS)) set(TROPHY_PREFIX + d.boss, Array.from({ length: TROPHY_LEVELS }, (_, lv) => trophy(d.boss, lv)), 0, -8);
}
