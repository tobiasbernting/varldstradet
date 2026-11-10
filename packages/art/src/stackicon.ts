// Icons of inventory stacks.
import { TROPHY_PREFIX } from '@varldstradet/shared';
import { Px } from './px.js';
import { getArt } from './textures.js';

/** Icon for an inventory stack: the item icon, and for a boss trophy the picture of the level it was won on. */
export function stackIconUrl(stack: { item: string; data?: string }): string {
  if (stack.data !== undefined && stack.item.startsWith(TROPHY_PREFIX)) return trophyIconUrl(stack.item, Number(stack.data));
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
