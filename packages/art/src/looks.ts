// The looks' pixel art (shared/src/looks.ts): cool gear drawn over the 16x24 hero by the character composer (characters.ts) and,
// for weapons, as held icons. A piece has a base shape in the set's palette and five shine tiers that share it:
// 1 plain, 2 trimmed (a metal edge), 3 glowing (a lit gem or rune), 4 the same with glints (the client adds its one particle
// effect), 5 the full look (a bigger silhouette, glowing edges; the client adds its aura and the second effect).
import type { DecodedLook, LookPal } from '@lilla-garden/shared';
import { Px, shade } from './px.js';

type Dir = 'down' | 'up' | 'right';

/** The base clothes a set's pieces are drawn on (the composer's own hat and shirt styles), so each set keeps one silhouette. */
export const SET_STYLES: Record<string, { hat: string; shirt?: string }> = {
  draugvakt: { hat: 'draugcrown', shirt: 'chainmail' },
  frostbrost: { hat: 'nasal', shirt: 'tabard' },
  volvaljus: { hat: 'circlet', shirt: 'robe' },
  havsvolva: { hat: 'crown_sea', shirt: 'gown' },
  bjornbarsark: { hat: 'wolfhood', shirt: 'bearpelt' },
  smedensglod: { hat: 'viking', shirt: 'chainmail' },
  askmagiker: { hat: 'runehat', shirt: 'robe' },
  skuggornas: { hat: 'witch', shirt: 'robe' },
  lokeslek: { hat: 'horns', shirt: 'tabard' },
  huginmunin: { hat: 'wanderer', shirt: 'tabard' },
};

/** Sets whose top tiers stay calm (a few clear marks, no sprinkle of glints). */
const QUIET = new Set(['lokeslek', 'huginmunin']);
const T2 = 2;
const T3 = 3;
const T4 = 4;
const T5 = 5;

/** A glint: a pixel of the accent colour with a dimmer one beside it (tier 4 and up). */
const glint = (p: Px, x: number, y: number, pal: LookPal): void => {
  p.px(x, y, pal.accent).px(x - 1, y, pal.glow).px(x + 1, y, pal.glow).px(x, y - 1, pal.glow).px(x, y + 1, pal.glow);
};

// ---------------------------------------------------------------------------
// Hats
// ---------------------------------------------------------------------------

/** What a hat adds to the composer's base hat (head's top-left at hx, hy; the rows above the head are free up to 7). */
export function decorHat(p: Px, set: string, l: DecodedLook, dir: Dir, hx: number, hy: number): void {
  const { tier, pal } = l;
  const side = dir === 'right';
  // tier 1: a rim light on the dark sets, so the plain look still reads against the grass
  if (tier === 1) {
    if (set === 'skuggornas') p.rect(hx - 3, hy - 1, 14, 1, pal.light).px(hx + 1, hy - 5, pal.light).px(hx + 2, hy - 7, pal.light);
    else if (set === 'huginmunin') p.rect(hx - 4, hy, 16, 1, pal.light).px(hx + 1, hy - 4, pal.light);
    else if (set === 'smedensglod') p.rect(hx, hy - 4, 8, 1, pal.light).px(hx - 1, hy - 2, pal.light);
  }
  // tier 2: a metal band at the brow and a bright edge on the top
  if (tier >= T2) {
    if (set === 'lokeslek' || set === 'smedensglod') p.rect(hx - 1, hy + 1, 10, 1, pal.trim);
    else if (set !== 'bjornbarsark') p.rect(side ? hx - 1 : hx - 1, hy, 10, 1, pal.trim);
    else p.px(hx - 1, hy + 2, pal.trim).px(hx + 8, hy + 2, pal.trim); // (a wolf hood: the teeth)
    p.px(hx + 1, hy - 3, pal.trim).px(hx + 6, hy - 3, pal.trim);
  }
  // tier 3: a lit gem in the front of the band (and two rune dots), none seen from behind
  if (tier >= T3 && dir !== 'up') {
    const gx = side ? hx + 6 : hx + 3;
    p.rect(gx, hy - 1, 2, 2, pal.glow).px(gx, hy - 1, pal.accent);
    p.px(hx - 1, hy + 1, pal.glow).px(hx + 8, hy + 1, pal.glow);
  }
  if (tier >= T3 && dir === 'up') p.px(hx + 3, hy, pal.glow).px(hx + 4, hy, pal.glow);
  // tier 4: glints on the crown
  if (tier >= T4 && !QUIET.has(set)) {
    glint(p, hx - 2, hy - 4, pal);
    if (!side && tier >= T5) glint(p, hx + 9, hy - 3, pal);
  }
  // tier 5: a plume of the set's own sort standing off the head: it makes the head bigger from far away
  if (tier >= T5) plume(p, set, pal, dir, hx, hy);
}

/** The tier 5 head flourish: a different silhouette for each set, drawn beside and above the head. */
function plume(p: Px, set: string, pal: LookPal, dir: Dir, hx: number, hy: number): void {
  const side = dir === 'right';
  const xs = side ? [hx - 2] : [hx - 3, hx + 10];
  const dx = (x: number): number => (x < hx + 4 ? -1 : 1);
  for (const x of xs) {
    switch (set) {
      case 'draugvakt':
      case 'smedensglod': {
        // flames standing up from the helmet's sides
        const c = set === 'draugvakt' ? [pal.glow, pal.accent, shade(pal.glow, 0.7)] : [pal.trim, pal.accent, shade(pal.trim, 0.7)];
        p.rect(x, hy - 3, 1, 4, c[2]!).rect(x + dx(x), hy - 5, 1, 4, c[0]!).px(x + dx(x), hy - 6, c[1]!).px(x, hy - 4, c[0]!);
        break;
      }
      case 'frostbrost':
      case 'havsvolva': {
        // crystals or shells fanning out
        p.rect(x, hy - 4, 1, 5, pal.light).px(x, hy - 5, pal.accent).rect(x + dx(x), hy - 2, 1, 3, pal.glow).px(x + dx(x) * 2, hy, pal.light);
        break;
      }
      case 'volvaljus':
      case 'huginmunin': {
        // leaves, or the black feathers of a raven, drooping from the temples
        const c = set === 'volvaljus' ? [pal.main, pal.light] : [pal.main, pal.trim];
        p.rect(x, hy - 2, 1, 6, c[0]!).px(x + dx(x), hy - 3, c[1]!).px(x + dx(x), hy + 4, c[1]!).px(x, hy - 3, c[1]!);
        break;
      }
      case 'bjornbarsark': {
        p.rect(x, hy - 3, 2, 4, pal.main).rect(x + (dx(x) > 0 ? 0 : -1), hy - 5, 2, 2, pal.light).px(x, hy - 6, pal.accent);
        break;
      }
      case 'askmagiker': {
        // a bolt of lightning over each side
        p.px(x + 1, hy - 6, pal.accent).px(x, hy - 5, pal.glow).px(x + 1, hy - 4, pal.accent).px(x, hy - 3, pal.glow).px(x + 1, hy - 2, pal.accent);
        break;
      }
      case 'skuggornas': {
        // wisps of dark smoke curling up
        p.px(x, hy - 1, pal.light).px(x + dx(x), hy - 2, pal.main).px(x, hy - 3, pal.light).px(x + dx(x), hy - 4, pal.glow).px(x, hy - 5, pal.accent);
        break;
      }
      default: {
        // Lokes lek: two little curled horns of the other colour
        p.rect(x, hy - 3, 1, 4, pal.dark).px(x + dx(x), hy - 4, pal.dark).px(x + dx(x) * 2, hy - 5, pal.glow).px(x + dx(x), hy - 3, pal.trim);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Shirts and robes
// ---------------------------------------------------------------------------

/** What a shirt adds to the composer's base (the torso is rows 10..17; a robe or gown hangs to the hem at row 21 or 22). */
export function decorShirt(p: Px, set: string, l: DecodedLook, dir: Dir, frame: number): void {
  const { tier, pal } = l;
  const side = dir === 'right';
  const gown = SET_STYLES[set]?.shirt === 'robe' || SET_STYLES[set]?.shirt === 'gown';
  const hem = SET_STYLES[set]?.shirt === 'gown' ? 22 : 21;
  const sway = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  // each set's own mark on the chest
  const mark = (x: number, y: number, c: string, c2: string): void => {
    switch (set) {
      case 'draugvakt': // a skull
        p.rect(x, y, 3, 2, c).px(x, y + 1, c2).px(x + 2, y + 1, c2).px(x + 1, y + 2, c);
        break;
      case 'frostbrost': // a snowflake
        p.px(x + 1, y, c).px(x, y + 1, c).px(x + 1, y + 1, c2).px(x + 2, y + 1, c).px(x + 1, y + 2, c);
        break;
      case 'volvaljus': // a leaf
        p.px(x + 2, y, c).px(x + 1, y + 1, c).px(x + 2, y + 1, c2).px(x, y + 2, c).px(x + 1, y + 2, c);
        break;
      case 'havsvolva': // a wave
        p.px(x, y + 1, c).px(x + 1, y, c).px(x + 2, y + 1, c2).px(x + 3, y, c).px(x + 3, y + 2, c);
        break;
      case 'bjornbarsark': // a claw
        p.px(x, y, c).px(x + 1, y + 1, c2).px(x + 1, y, c).px(x + 2, y + 1, c).px(x + 2, y + 2, c).px(x, y + 2, c);
        break;
      case 'smedensglod': // an anvil
        p.rect(x, y, 3, 1, c).px(x + 1, y + 1, c2).rect(x, y + 2, 3, 1, c);
        break;
      case 'askmagiker': // a bolt
        p.px(x + 2, y, c).px(x + 1, y + 1, c2).px(x + 2, y + 1, c).px(x + 1, y + 2, c);
        break;
      case 'skuggornas': // an eye
        p.px(x, y + 1, c).px(x + 1, y, c).px(x + 2, y + 1, c).px(x + 1, y + 1, c2).px(x + 1, y + 2, c);
        break;
      case 'lokeslek': // a harlequin diamond
        p.px(x + 1, y, c).px(x, y + 1, c).px(x + 2, y + 1, c).px(x + 1, y + 1, c2).px(x + 1, y + 2, c);
        break;
      case 'huginmunin': // a little raven
        p.px(x, y, c).px(x + 1, y, c).px(x + 1, y + 1, c2).px(x + 2, y + 1, c).px(x + 3, y + 2, c).px(x + 1, y + 2, c);
        break;
      default:
        p.rect(x, y, 2, 2, c).px(x + 1, y + 1, c2);
    }
  };
  if (tier >= T2) {
    // a collar and a belt in the trim colour, and the hem or cuffs
    if (side) p.rect(5, 10, 6, 1, pal.trim).rect(5, 15, 6, 1, pal.trim);
    else p.rect(3, 10, 10, 1, pal.trim).rect(3, 15, 10, 1, pal.trim);
    if (gown) {
      const half = SET_STYLES[set]?.shirt === 'gown' ? 8 : 7;
      p.rect(side ? 3 : 8 - half, hem, side ? 9 : half * 2, 1, pal.trim);
    } else p.rect(3, 17, 10, 1, pal.trim);
    if (dir !== 'up') {
      p.px(2, 15, pal.trim).px(13, 15, pal.trim);
    }
  }
  if (tier >= T3) {
    if (dir === 'down') mark(6, 12, pal.glow, pal.accent);
    else if (side) mark(7, 12, pal.glow, pal.accent);
    else mark(6, 12, shade(pal.glow, 0.8), pal.glow); // a dim one on the back
    // the glow runs down the middle of a robe
    if (gown && dir === 'down') for (let y = 17; y < hem; y += 2) p.px(8 + (y % 4 === 1 ? -1 : 0), y, pal.glow);
  }
  if (tier >= T4 && !QUIET.has(set)) {
    // one deliberate sparkle (two at the top tier), not a sprinkle
    glint(p, side ? 6 : 4, 13, pal);
    if (!side && tier >= T5) glint(p, 11, 12, pal);
  }
  if (tier >= T5) {
    // glowing cuffs and hem, and a small lit shoulder on each side
    if (dir !== 'up') p.rect(2, 15, 2, 1, pal.glow).rect(12, 15, 2, 1, pal.glow);
    if (gown) for (let x = side ? 3 : 1; x < (side ? 12 : 15); x += 3) p.px(x + (x > 8 ? sway : 0), hem, pal.glow);
    else for (let x = 3; x < 13; x += 3) p.px(x, 17, pal.glow);
    p.px(side ? 6 : 3, 10, pal.accent).px(side ? 8 : 12, 10, pal.accent);
  }
}

// ---------------------------------------------------------------------------
// Shoulders
// ---------------------------------------------------------------------------

/** Pauldrons over the shoulders (rows 8..12): crystals, shaggy fur, spiked plates or feathers, bigger at tier 5. */
export function drawShoulders(p: Px, set: string, l: DecodedLook, dir: Dir, frame: number): void {
  const { tier, pal } = l;
  const big = tier >= T5 ? 1 : 0;
  const side = dir === 'right';
  const pad = (x: number, dx: number): void => {
    // x is the outer edge of the pauldron, dx the way it grows inwards
    const o = (n: number): number => x + dx * n - (dx < 0 ? 0 : 0);
    switch (set) {
      case 'frostbrost': {
        // an ice crystal: a base and two spikes
        for (let i = 0; i < 4; i++) p.rect(Math.min(o(i), o(i)), 11, 1, 2, i % 2 ? pal.main : pal.light);
        p.rect(o(0), 8 - big, 1, 3 + big, pal.light).px(o(0), 7 - big, pal.accent).rect(o(2), 9 - big, 1, 2 + big, pal.main).px(o(2), 8 - big, pal.accent);
        if (tier >= T2) p.rect(o(0), 13, 4, 1, pal.trim);
        break;
      }
      case 'bjornbarsark': {
        // shaggy fur, lumpy on top and ragged below
        for (let i = 0; i < 4; i++) {
          p.rect(o(i), 9 - ((i + dx) % 2 ? 0 : 1) - big, 1, 4 + ((i + dx) % 2 ? 1 : 0) + big, i % 2 ? pal.main : pal.light);
        }
        p.rect(o(0), 12, 1, 2, pal.dark).px(o(3), 12, pal.dark);
        for (let i = 0; i < 4; i += 2) p.px(o(i), 8 - big, pal.trim);
        if (tier >= T2) p.px(o(1), 13, pal.trim).px(o(3), 13, pal.trim);
        break;
      }
      case 'smedensglod': {
        // a dark plate with a spike
        p.rect(Math.min(o(0), o(3)), 10, 4, 3, pal.main).rect(Math.min(o(0), o(3)), 10, 4, 1, pal.light);
        p.rect(o(1), 7 - big, 1, 3 + big, pal.dark).px(o(1), 6 - big, pal.light).px(o(2), 9, pal.dark);
        if (tier >= T2) p.rect(Math.min(o(0), o(3)), 12, 4, 1, pal.trim);
        break;
      }
      default: {
        // Hugin och Munin: a tall raven perched on each shoulder, outside the head: beak outwards, a pale eye, a long tail
        const r = (n: number, y: number, c: string): void => void p.px(o(n), y, c);
        const y0 = 5 - big;
        r(1, y0, pal.main);
        r(2, y0, pal.main);
        r(0, y0, tier >= T2 ? pal.trim : pal.light);
        r(1, y0 - 1, pal.main);
        r(1, y0, pal.accent);
        for (let y = 1; y <= 4; y++) for (let n = 0; n <= 3; n++) if (!(n === 0 && y > 2)) r(n, y0 + y, n === 2 && y < 4 ? pal.light : pal.main);
        for (let y = 5; y <= 7 + big; y++) for (let n = 0; n <= 2; n++) r(n, y0 + y, y > 6 ? pal.light : pal.main);
        if (tier >= T2) p.px(o(0), y0 + 7 + big, pal.trim).px(o(2), y0 + 7 + big, pal.trim);
      }
    }
    if (tier >= T3) p.px(o(1), 11, pal.glow).px(o(1), 12, pal.accent);
    if (tier >= T4 && !QUIET.has(set)) glint(p, o(0) + dx * -1, 8 - big, pal);
    if (tier >= T5 && !QUIET.has(set)) p.px(o(3), 10, pal.glow).px(o(2), 13, pal.glow);
    void frame;
  };
  if (side) pad(5, 1);
  else {
    pad(1, 1);
    pad(14, -1);
  }
}

// ---------------------------------------------------------------------------
// Cloaks
// ---------------------------------------------------------------------------

/**
 * A cloak. Seen from the front or the side it hangs behind the body (drawn before it: only the edges show); from behind it
 * covers the whole back (drawn over it).
 */
export function drawCloak(p: Px, set: string, l: DecodedLook, dir: Dir, frame: number): void {
  const { tier, pal } = l;
  const sway = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const long = tier >= T5 ? 2 : 0;
  const hem = 21 + long;
  const c = pal.main;
  const cl = pal.light;
  const cd = pal.dark;
  // Lokes lek's cloak is green on one side and red on the other
  const left = set === 'lokeslek' ? pal.main : c;
  const right = set === 'lokeslek' ? pal.dark : c;
  const ragged = (x: number, y: number): boolean => (set === 'huginmunin' ? (x % 2 === 0 && y > hem - 3) || (x % 4 === 1 && y > hem - 4) : set === 'skuggornas' && (x + y + (x % 3)) % 3 === 0);
  const calm = QUIET.has(set);
  const trimAt = (x: number, y: number): void => {
    if (tier >= T2) p.px(x, y, pal.trim);
  };
  if (dir === 'up') {
    for (let y = 10; y <= hem; y++) {
      for (let x = 2; x < 14; x++) {
        if (y > 17 && ragged(x, y)) continue;
        const col = x < 8 ? left : right;
        p.px(x, y, y === 10 ? cl : x === 13 || x === 2 ? cd : (x + y) % 5 === 0 ? shade(col, 0.85) : col);
      }
    }
    // a hem in the trim colour, and the clasp's gem at the neck
    for (let x = 2; x < 14; x++) if (!ragged(x, hem)) trimAt(x, hem);
    if (tier >= T3) {
      p.px(7, 12, pal.glow).px(8, 12, pal.glow).px(7, 11, pal.accent);
      if (set === 'volvaljus') for (let x = 3; x < 13; x += 3) p.px(x, hem - 1, pal.glow);
      else if (!calm) for (let x = 3; x < 13; x += 3) p.px(x, 16 + (x % 2), pal.glow);
    }
    if (tier >= T4 && !calm) glint(p, 4, 14, pal);
    if (tier >= T5 && !calm) {
      for (let y = 11; y <= hem; y += 3) p.px(2, y, pal.glow).px(13, y, pal.glow);
    }
    if (calm && tier >= T3) for (const [x, y] of [[4, 14], [11, 17]] as [number, number][]) p.px(x, y, pal.trim).px(x - 1, y + 1, pal.trim).px(x + 1, y + 1, pal.trim).px(x, y + 2, pal.trim);
    return;
  }
  const side = dir === 'right';
  if (side) {
    // hanging behind the back (to the left of a figure that faces right), swaying with the walk
    for (let y = 10; y <= hem; y++) {
      const back = y > 14 ? sway * (y > 18 ? 2 : 1) : 0;
      const w = 4 + (y > 17 ? 1 : 0) + (tier >= T5 ? 1 : 0);
      for (let i = 0; i < w; i++) {
        const x = 5 - i - back;
        if (y > 17 && ragged(x, y)) continue;
        p.px(x, y, y === 10 ? cl : i === 0 ? cd : (i + y) % 4 === 0 ? shade(c, 0.85) : c);
      }
      if (y === hem) for (let i = 0; i < w; i++) if (!ragged(5 - i - back, y)) trimAt(5 - i - back, y);
    }
    if (tier >= T3) p.px(4, 11, pal.glow).px(4, 12, pal.accent);
    if (tier >= T5 && !calm) for (let y = 11; y <= hem; y += 3) p.px(1 - (y > 17 ? sway : 0), y, pal.glow);
    return;
  }
  // from the front: a cloak hangs on both sides of the body
  for (let y = 10; y <= hem; y++) {
    const flare = y > 16 ? 1 : 0;
    const out = y > 18 ? sway : 0;
    for (const [x0, col, dx] of [[1 - flare + (out < 0 ? out : 0), left, 1], [12 + flare + (out > 0 ? out : 0), right, 1]] as [number, string, number][]) {
      const w = 3 + (tier >= T5 ? 1 : 0);
      for (let i = 0; i < w; i++) {
        const x = x0 + (x0 > 8 ? -(tier >= T5 ? 1 : 0) : 0) + i * dx;
        if (y > 17 && ragged(x, y)) continue;
        p.px(x, y, y === 10 ? cl : (i === 0 && x0 < 8) || (i === w - 1 && x0 > 8) ? cd : (i + y) % 4 === 0 ? shade(col, 0.85) : col);
      }
    }
    if (y === hem) for (let x = 0; x < 16; x++) if (!ragged(x, y) && (x < 5 || x > 10)) trimAt(x, y);
  }
  // the clasp across the chest
  p.rect(2, 10, 12, 1, cl);
  if (tier >= T3) p.px(7, 10, pal.glow).px(8, 10, pal.glow);
  if (tier >= T5 && !calm) for (let y = 12; y <= hem; y += 3) p.px(1, y, pal.glow).px(14, y, pal.glow);
  if (calm && tier >= T3) for (const [x, y] of [[2, 14], [13, 17]] as [number, number][]) p.px(x, y, pal.trim).px(x - 1, y + 1, pal.trim).px(x + 1, y + 1, pal.trim).px(x, y + 2, pal.trim);
  if (set === 'volvaljus') for (const [x, y] of [[2, 14], [13, 16], [2, 19], [13, 20]] as [number, number][]) p.px(x, y, pal.light).px(x + 1, y, pal.glow);
}

// ---------------------------------------------------------------------------
// Offhand (a shield or a mask) and amulet
// ---------------------------------------------------------------------------

/** The offhand: on the left hand side of the picture from the front, the far side from behind. */
export function drawOffhand(p: Px, set: string, l: DecodedLook, dir: Dir, frame: number): void {
  const { tier, pal } = l;
  const bob = frame === 1 ? 1 : 0;
  let x = dir === 'up' ? 11 : dir === 'right' ? 3 : 0;
  const y = 12 + bob;
  if (set === 'lokeslek') {
    // a mask on a stick: half green, half red, a grin
    p.rect(x + 1, y + 1, 4, 5, pal.main).rect(x + 3, y + 1, 2, 5, pal.dark).rect(x + 2, y + 6, 1, 4, '#6a4a2a');
    if (dir !== 'up') p.px(x + 2, y + 2, '#14121a').px(x + 4, y + 2, '#14121a').rect(x + 2, y + 4, 3, 1, '#ffffff').px(x + 1, y + 4, '#14121a').px(x + 5, y + 4, '#14121a');
    if (tier >= T2) p.rect(x + 1, y, 4, 1, pal.trim).px(x, y + 2, pal.trim).px(x + 5, y + 2, pal.trim);
    if (tier >= T3) p.px(x + 3, y + 3, pal.glow);
    if (tier >= T4) glint(p, x + 1, y - 1, pal);
    if (tier >= T5) p.rect(x, y + 1, 1, 4, pal.glow).rect(x + 6, y + 1, 1, 4, pal.glow);
    return;
  }
  if (dir === 'up') x = 11;
  // a round shield: a rim, a field, a boss
  const w = tier >= T5 ? 6 : 5;
  const h = tier >= T5 ? 7 : 6;
  p.rect(x, y, w, h, shade(pal.main, 0.8)).rect(x + 1, y + 1, w - 2, h - 2, pal.main).rect(x + 1, y + 1, w - 2, 1, pal.light);
  p.px(x, y, 'rgba(0,0,0,0)');
  if (dir !== 'up') {
    p.rect(x + Math.floor(w / 2) - 1, y + 2, 2, 2, pal.dark);
    if (set === 'frostbrost') p.px(x + 2, y + 1, pal.accent).px(x + 3, y + 4, pal.accent);
    else p.px(x + 1, y + 2, pal.light);
  }
  if (tier >= T2) p.rect(x, y, w, 1, pal.trim).rect(x, y + h - 1, w, 1, pal.trim).rect(x, y, 1, h, pal.trim).rect(x + w - 1, y, 1, h, pal.trim);
  if (tier >= T3 && dir !== 'up') p.rect(x + Math.floor(w / 2) - 1, y + 2, 2, 2, pal.glow).px(x + Math.floor(w / 2) - 1, y + 2, pal.accent);
  if (tier >= T3 && dir === 'up') p.px(x + 2, y + 2, pal.glow);
  if (tier >= T4) glint(p, x - 1, y, pal);
  if (tier >= T5) for (let i = 0; i < h; i += 2) p.px(x - 1, y + i, pal.glow).px(x + w, y + i, pal.glow);
}

/** The amulet: a pendant on the chest from the front, small from the side, a chain from behind. */
export function drawAmulet(p: Px, set: string, l: DecodedLook, dir: Dir): void {
  const { tier, pal } = l;
  const chain = tier >= T2 ? pal.trim : pal.light;
  if (dir === 'up') {
    p.px(6, 10, chain).px(9, 10, chain).px(7, 9, chain).px(8, 9, chain);
    return;
  }
  const x = dir === 'right' ? 8 : 7;
  p.px(x - 1, 10, chain).px(x + 2, 10, chain).px(x - 1, 11, chain).px(x + 2, 11, chain);
  // the stone: the set's own shape (a pearl, a bolt-stone, a raven, a ring)
  const stone = tier >= T3 ? pal.glow : pal.main;
  p.rect(x, 12, 2, 2, stone).px(x, 12, tier >= T3 ? pal.accent : pal.light).px(x + 1, 13, tier >= T3 ? pal.light : pal.dark);
  if (set === 'huginmunin') p.px(x - 1, 12, pal.main).px(x + 2, 12, pal.main).px(x, 11, pal.main);
  if (set === 'lokeslek') p.px(x + 2, 12, pal.dark).px(x - 1, 13, pal.main);
  if (tier >= T4) glint(p, x + 3, 11, pal);
  if (tier >= T5) p.px(x - 1, 14, pal.glow).px(x + 2, 14, pal.glow).px(x, 14, pal.accent).px(x + 1, 14, pal.accent);
}

// ---------------------------------------------------------------------------
// Weapons (16x16 icons, held in the hero's hand)
// ---------------------------------------------------------------------------

/** A weapon's icon at a tier: the shape of its piece in its colours (a signature weapon is always at tier 5). */
export function drawWeapon(l: DecodedLook): Px {
  const { tier, pal } = l;
  const shape = l.piece.shape ?? 'sword';
  const p = new Px(16, 16);
  const WOOD = '#8a5a30';
  const WOOD_D = '#5a3a1c';
  const steel = shade(pal.main, 1.05);
  switch (shape) {
    case 'sword': {
      p.line(3, 13, 12, 4, pal.light).line(4, 13, 13, 4, steel).line(3, 12, 12, 3, shade(pal.main, 0.7));
      p.line(5, 13, 13, 5, pal.main);
      p.rect(2, 11, 2, 2, WOOD_D).rect(1, 13, 3, 2, WOOD);
      p.rect(4, 9, 2, 2, tier >= T2 ? pal.trim : '#c8c8d0').rect(2, 9, 2, 1, tier >= T2 ? pal.trim : '#c8c8d0').rect(5, 11, 1, 2, tier >= T2 ? pal.trim : '#c8c8d0');
      if (tier >= T3) p.line(6, 10, 12, 4, pal.glow).px(7, 9, pal.accent).px(10, 6, pal.accent);
      if (tier >= T5) p.px(13, 3, pal.accent).px(14, 2, pal.glow).px(12, 2, pal.glow).px(14, 4, pal.glow);
      break;
    }
    case 'axe': {
      p.line(3, 14, 11, 6, WOOD).line(4, 14, 12, 6, WOOD_D);
      p.rect(8, 2, 6, 6, '#a8aeb8').rect(11, 2, 3, 8, '#a8aeb8').rect(8, 2, 6, 1, '#e8ecf2').rect(12, 4, 2, 4, '#7d828c');
      p.rect(8, 7, 2, 1, pal.dark);
      if (tier >= T2) p.rect(8, 2, 1, 6, pal.trim).rect(13, 3, 1, 6, pal.trim).px(7, 8, pal.trim).px(6, 9, pal.trim);
      if (tier >= T3) p.px(10, 4, pal.glow).px(10, 5, pal.accent).px(11, 4, pal.glow);
      if (tier >= T5) p.rect(14, 3, 1, 5, pal.glow).px(7, 1, pal.accent);
      break;
    }
    case 'hammer': {
      p.rect(7, 7, 2, 8, WOOD).rect(8, 7, 1, 8, WOOD_D).rect(7, 13, 2, 1, tier >= T2 ? pal.trim : '#c8c8d0');
      p.rect(3, 2, 10, 5, pal.dark).rect(3, 2, 10, 3, pal.main).rect(3, 2, 10, 1, pal.light);
      p.rect(2, 3, 1, 3, pal.dark).rect(13, 3, 1, 3, pal.dark);
      if (tier >= T2) p.rect(3, 6, 10, 1, pal.trim).rect(3, 2, 1, 5, pal.trim).rect(12, 2, 1, 5, pal.trim);
      if (tier >= T3) p.rect(6, 3, 4, 2, pal.glow).px(7, 3, pal.accent).px(8, 4, pal.accent);
      if (tier >= T5) p.px(2, 1, pal.accent).px(13, 1, pal.accent).px(8, 1, pal.glow);
      break;
    }
    case 'spear': {
      p.line(3, 14, 11, 6, WOOD).line(4, 14, 12, 6, WOOD_D);
      p.tpl(9, 1, ['.....L..', '....LLL.', '...LMMM.', '..LMMMD.', '.LMMDD..', '.MMD....', '..D.....'].map((r) => r), { L: pal.light, M: pal.main, D: pal.dark });
      p.rect(8, 7, 3, 1, tier >= T2 ? pal.trim : '#c8c8d0').px(7, 8, tier >= T2 ? pal.trim : '#c8c8d0');
      if (tier >= T3) p.px(12, 3, pal.glow).px(11, 4, pal.accent);
      if (tier >= T5) p.px(14, 1, pal.accent).px(13, 2, pal.glow).px(7, 9, pal.glow);
      break;
    }
    default: {
      // a staff: a long shaft, a cradle at the top holding an orb
      p.line(3, 15, 10, 4, WOOD).line(4, 15, 11, 4, WOOD_D);
      const orb = tier >= T3 ? pal.glow : pal.main;
      p.rect(9, 1, 4, 4, orb).rect(10, 0, 2, 1, orb).rect(10, 5, 2, 1, orb).px(10, 1, tier >= T3 ? pal.accent : pal.light).px(12, 4, tier >= T3 ? pal.light : pal.dark);
      p.rect(8, 3, 1, 4, tier >= T2 ? pal.trim : '#b8a888').rect(13, 3, 1, 4, tier >= T2 ? pal.trim : '#b8a888').rect(9, 6, 4, 1, tier >= T2 ? pal.trim : '#b8a888');
      if (tier >= T4) p.px(8, 0, pal.accent).px(14, 2, pal.accent);
      if (tier >= T5) p.px(7, 2, pal.glow).px(14, 4, pal.glow).px(6, 3, pal.trim).px(15, 3, pal.trim).px(11, -1, pal.glow);
    }
  }
  return p.outline('#2a2420');
}

/** A weapon's icon in the wardrobe is its own drawing; the other pieces are shown on a plain mannequin (see characters.ts lookIcon). */
export const isWeaponLook = (l: DecodedLook): boolean => l.piece.slot === 'weapon';
