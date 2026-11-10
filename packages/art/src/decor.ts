// The decor the dungeons drop for the houses: lamps of crystal and mushroom, a wisp in a jar, a dragon egg.
// Light comes from the top-left; big rounded shapes are shaded pixel by pixel with a handful of tones.
import { Px } from './px.js';
import { OUTLINE } from './world.js';

interface Pal {
  d2: string;
  d: string;
  b: string;
  l: string;
  l2: string;
}

const pal = (d2: string, d: string, b: string, l: string, l2: string): Pal => ({ d2, d, b, l, l2 });

const rgbCache = new Map<string, [number, number, number]>();

const rgb = (c: string): [number, number, number] => {
  let v = rgbCache.get(c);
  if (!v) {
    const num = parseInt(c.slice(1, 7), 16);
    v = [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    rgbCache.set(c, v);
  }
  return v;
};

/** Colours every pixel of a box that `f` gives a colour (straight into the image data, so big shaded shapes stay quick). */

function paint(p: Px, x0: number, y0: number, w: number, h: number, f: (x: number, y: number) => string | null | undefined): Px {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(p.w, Math.ceil(x0 + w));
  const yb = Math.min(p.h, Math.ceil(y0 + h));
  if (xb <= xa || yb <= ya) return p;
  const img = p.ctx.getImageData(xa, ya, xb - xa, yb - ya);
  const d = img.data;
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      const c = f(x, y);
      if (!c) continue;
      const [r, g, b] = rgb(c);
      const i = ((y - ya) * (xb - xa) + x - xa) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  p.ctx.putImageData(img, xa, ya);
  return p;
}

/** Light falling on what is already drawn: pulls the pixels around (cx, cy) towards a colour, in three soft steps. */

// Light from the top-left and a little from the front (x right, y down, z towards the viewer).
const LX = -0.45;

const LY = -0.55;

const LZ = 0.7;

const light = (nx: number, ny: number, nz: number): number => (nx * LX + ny * LY + nz * LZ) / (Math.hypot(nx, ny, nz) || 1);
/** The palette's tone for an amount of light. */

const tone = (c: Pal, v: number): string => (v > 0.985 ? c.l2 : v > 0.86 ? c.l : v > 0.42 ? c.b : v > 0.05 ? c.d : c.d2);
/** Fixed per-pixel noise, -0.5..0.5. */

const twinkle = (p: Px, x: number, y: number, c = '#fff3b0', core = '#ffffff'): Px => p.px(x, y - 1, c).px(x - 1, y, c).px(x + 1, y, c).px(x, y + 1, c).px(x, y, core);

/** A crystal shard standing on (bx, by) (bottom middle), w wide and h tall, its tip leaning `lean` px. */

function shard(p: Px, bx: number, by: number, w: number, h: number, lean: number, c: Pal): Px {
  const tip = Math.max(2, Math.round(w * 0.75));
  return paint(p, bx - w - Math.abs(lean) - 1, by - h, 2 * w + 2 * Math.abs(lean) + 3, h + 1, (x, y) => {
    const i = by - y; // 0 on the bottom row
    if (i < 0 || i >= h) return null;
    const cx = bx + (lean * i) / h;
    const half = i >= h - tip ? (w / 2) * ((h - i) / (tip + 1)) : w / 2;
    const u = (x + 0.5 - cx) / Math.max(0.5, half);
    if (Math.abs(u) > 1) return null;
    if (i >= h - tip) return u < 0 ? c.l2 : c.l; // the facets of the tip catch the light
    return u < -0.4 ? c.l : u < 0.35 ? c.b : c.d;
  });
}

/** Inside an arch (straight sides, round top), `hw` the half width, `top` its highest row. */

const GOLD = pal('#8a5a10', '#b8861a', '#e8b830', '#ffe27a', '#fff6c8');

const CRYSTAL: Pal[] = [
  pal('#4a1a80', '#7a36c0', '#a860f0', '#d0a0ff', '#f6ecff'),
  pal('#1e5a8a', '#3a8ac0', '#70c8f0', '#b4ecff', '#ffffff'),
  pal('#14703a', '#28a050', '#56e07a', '#a4ffb8', '#f0fff4'),
  pal('#a03a70', '#d05a98', '#f08ac0', '#ffc4e2', '#fff4fa'),
];

export function crystalLamp(): Px {
  const p = new Px(16, 24);
  const c = CRYSTAL[0]!;
  // a carved stone foot
  p.rect(3, 17, 10, 6, '#8a8692').rect(3, 17, 10, 1, '#c4c0cc').rect(3, 17, 1, 6, '#aaa6b2').rect(12, 18, 1, 5, '#64606c').rect(2, 21, 12, 2, '#76727e').rect(2, 21, 12, 1, '#a8a4b0');
  p.rect(6, 19, 4, 1, '#64606c');
  shard(p, 5, 17, 3, 7, -2, c);
  shard(p, 11, 17, 3, 6, 2, c);
  shard(p, 8, 17, 5, 16, 0, c);
  p.px(7, 4, '#ffffff').px(7, 8, c.l2);
  p.outline(OUTLINE);
  twinkle(p, 13, 4, '#e8d4ff');
  return p.px(2, 9, '#d0a0ff');
}

export function mushroomLamp(): Px {
  const p = new Px(16, 24);
  const T = pal('#0e6a64', '#1a9a90', '#2ad0c0', '#7af8e8', '#e8fffb');
  p.ellipse(3, 20, 10, 4, '#6f4a26').ellipse(3, 19, 10, 4, '#9a6a3a').rect(5, 20, 6, 1, '#c58f55');
  p.rect(6, 11, 4, 9, '#dceee6').rect(6, 11, 1, 9, '#ffffff').rect(9, 11, 1, 9, '#a8c4b8');
  paint(p, 1, 2, 14, 11, (x, y) => {
    const dx = (x + 0.5 - 8) / 7;
    const dy = (y + 0.5 - 10) / 8;
    if (dy > 0.25 || dx * dx + dy * dy > 1) return null;
    if (dy > 0.1) return T.d;
    return tone(T, light(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.4));
  });
  for (const [x, y] of [[4, 6], [9, 4], [11, 8], [6, 9]] as const) p.rect(x, y, 2, 1, T.l2).px(x, y + 1, T.l);
  p.rect(2, 11, 12, 1, '#0a4a46');
  p.outline(OUTLINE);
  return p.px(1, 4, '#9af8ec').px(14, 3, '#9af8ec');
}

export function wispJar(): Px {
  const p = new Px(16, 20);
  // the glass, glowing from inside
  paint(p, 2, 6, 12, 14, (x, y) => {
    const u = (x + 0.5 - 8) / 6;
    const v = (y + 0.5 - 13) / 7;
    if (Math.abs(u) > 1 || Math.abs(v) > 1) return null;
    if (Math.abs(u) > 0.84 && Math.abs(v) > 0.82) return null;
    const r = Math.hypot(u * 1.1, v * 0.95);
    if (Math.abs(u) > 0.84 || Math.abs(v) > 0.86) return '#7ad8e8';
    return r < 0.32 ? '#ffffff' : r < 0.55 ? '#c8fbff' : r < 0.8 ? '#7ae8f8' : '#3ab8d8';
  });
  // the wisp's little face
  p.px(7, 12, '#1e5a6a').px(9, 12, '#1e5a6a').px(8, 9, '#ffffff').px(9, 8, '#e8ffff');
  // glass shine
  p.rect(3, 8, 1, 7, '#ffffff').px(4, 16, '#e8fbff').px(12, 8, '#e8fbff');
  // neck, cork and string
  p.rect(4, 4, 8, 2, '#a8e8f4').rect(4, 4, 8, 1, '#e8fbff');
  p.rect(5, 1, 6, 3, '#c8a070').rect(5, 1, 6, 1, '#e0c090').rect(10, 1, 1, 3, '#9a7448');
  p.rect(4, 5, 8, 1, '#c8b48a');
  p.outline(OUTLINE);
  return p.px(1, 10, '#a0f0ff').px(14, 13, '#c8fbff');
}

export function dragonEgg(): Px {
  const p = new Px(16, 16);
  const E = pal('#3e1060', '#5a2080', '#8a3ac0', '#b070e8', '#e0c0ff');
  const STRAW = pal('#7a5a20', '#a8822e', '#d0aa48', '#ecd070', '#fff0a8');
  // the back of the nest
  paint(p, 1, 9, 14, 3, (x, y) => (Math.abs(x + 0.5 - 8) < 7 - (11 - y) * 1.5 ? ((x + y) % 3 === 0 ? STRAW.b : STRAW.d) : null));
  // the egg: pointed on top, round below
  paint(p, 2, 1, 12, 14, (x, y) => {
    const v = (y + 0.5 - 9) / (y < 9 ? 8.2 : 6);
    if (Math.abs(v) >= 1) return null;
    const hw = 5.3 * Math.sqrt(1 - v * v);
    const u = (x + 0.5 - 8) / hw;
    if (Math.abs(u) > 1) return null;
    return tone(E, light(u * 0.9, v, Math.sqrt(Math.max(0, 1 - u * u * 0.8 - v * v * 0.6)) + 0.15));
  });
  for (const [x, y, big] of [[5, 5, 1], [9, 8, 1], [6, 10, 1], [9, 3, 0], [4, 8, 0], [11, 6, 0], [11, 11, 0], [7, 2, 0]] as const) {
    if (big) p.rect(x, y, 2, 2, GOLD.b).px(x, y, GOLD.l2).px(x + 1, y + 1, GOLD.d);
    else p.px(x, y, GOLD.l);
  }
  p.px(6, 3, E.l2).px(5, 4, E.l2);
  // the front of the nest, straw sticking out
  paint(p, 1, 11, 14, 5, (x, y) => {
    const dx = (x + 0.5 - 8) / 7.2;
    const dy = (y + 0.5 - 12.5) / 3.5;
    if (dx * dx + dy * dy > 1 || y < 11) return null;
    const s = (x * 2 + y) % 5;
    return y === 11 ? (s < 2 ? STRAW.l2 : STRAW.l) : s === 0 ? STRAW.l : s === 2 ? STRAW.d : y === 15 ? STRAW.d : STRAW.b;
  });
  p.px(1, 11, STRAW.l).px(14, 12, STRAW.b).px(2, 10, STRAW.b).px(13, 10, STRAW.l);
  p.outline(OUTLINE);
  return twinkle(p, 13, 2, '#f0d8ff');
}
