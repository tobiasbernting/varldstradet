// Pictures of paintings drawn by players (16×16 palette-index strings).
import { PAINT_SIZE, TROPHY_PREFIX, paintColor } from '@lilla-garden/shared';
import { Px } from './px.js';
import { getArt } from './textures.js';

const FRAME = '#a5733a';
const FRAME_D = '#6b4420';
const PAPER = '#f6efdc';

/** A framed tavla: 20×20 with a 2px wooden frame around the drawing. */
export function paintingPx(pixels: string): Px {
  const p = new Px(PAINT_SIZE + 4, PAINT_SIZE + 4);
  p.rect(0, 0, PAINT_SIZE + 4, PAINT_SIZE + 4, FRAME).box(0, 0, PAINT_SIZE + 4, PAINT_SIZE + 4, FRAME_D);
  p.rect(2, 2, PAINT_SIZE, PAINT_SIZE, PAPER);
  for (let i = 0; i < pixels.length && i < PAINT_SIZE * PAINT_SIZE; i++) {
    const c = paintColor(pixels[i]!);
    if (c) p.px(2 + (i % PAINT_SIZE), 2 + Math.floor(i / PAINT_SIZE), c);
  }
  return p;
}

const urls = new Map<string, string>();
/** Data URL of a framed thumbnail for inventory slots (cached). */
export function paintingIconUrl(pixels: string): string {
  let u = urls.get(pixels);
  if (!u) {
    u = paintingPx(pixels).dataUrl();
    urls.set(pixels, u);
  }
  return u;
}

/** Icon for an inventory stack: the drawing for a painted tavla, the item icon otherwise. */
export function stackIconUrl(stack: { item: string; data?: string }): string {
  // a boss trophy's icon wears the rim of the level it was won on
  if (stack.data !== undefined && stack.item.startsWith(TROPHY_PREFIX)) return trophyIconUrl(stack.item, Number(stack.data));
  if (stack.data !== undefined) return paintingIconUrl(stack.data);
  return getArt().iconUrl[stack.item] ?? '';
}

const trophyUrls = new Map<string, string>();
/** Data URL of a trophy's picture at a level (the object's frame for that level, as an icon). */
export function trophyIconUrl(item: string, level: number): string {
  const k = `${item}#${level}`;
  let u = trophyUrls.get(k);
  if (!u) {
    const f = getArt().objects[item]?.frames[Math.max(0, Math.min(4, Math.floor(level) || 0))];
    if (!f) return getArt().iconUrl[item] ?? '';
    const p = new Px(16, 16);
    p.blitScaled(f, 0, 0, 16, 16 * (f.h / f.w) > 16 ? 16 : 16 * (f.h / f.w));
    u = p.dataUrl();
    trophyUrls.set(k, u);
  }
  return u;
}
