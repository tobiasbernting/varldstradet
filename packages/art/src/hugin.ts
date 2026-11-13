// Hugin, the raven who teaches: the pet raven's own picture (petanimals.ts), with what tells him from a pet korp: a gold ring
// on his leg and a gold rune on his chest. Three frames, facing right: landed, and flying with the wings up and down.
import { PET_DRAW, PET_ANIMAL_SIZE } from './petanimals.ts';
import { Px } from './px.ts';

export type HuginPose = 'land' | 'up' | 'down';
const GOLD = '#ffd23f';
const GOLD_D = '#c8901a';
/** Room above and below the raven's own box for the spread wings. */
const PAD = 3;

const cache = new Map<HuginPose, HTMLCanvasElement>();

/** Hugin's picture in a pose (cached; draw it scaled up with `image-rendering: pixelated`). */
export function huginCanvas(pose: HuginPose): HTMLCanvasElement {
  let c = cache.get(pose);
  if (c) return c;
  const size = PET_ANIMAL_SIZE.pet_korp ?? { w: 20, h: 15 };
  const body = new Px(size.w, size.h);
  PET_DRAW.pet_korp!(body, pose === 'land' ? 0 : 1);
  const p = new Px(size.w, size.h + PAD * 2);
  p.ctx.drawImage(body.canvas, 0, PAD);
  const y = (v: number): number => v + PAD;
  if (pose === 'land') {
    // the gold ring round his near leg
    p.rect(11, y(12), 3, 1, GOLD).px(12, y(13), GOLD_D);
  } else {
    p.px(12, y(12), GOLD).px(13, y(12), GOLD_D);
    const wing = ['#1c1a30', '#2e2c4e', '#4a4878'] as const;
    if (pose === 'up') {
      // the wings high over the back
      p.rect(4, y(-2), 7, 3, wing[1]).rect(5, y(-3), 5, 1, wing[1]).rect(5, y(-1), 5, 1, wing[2]).px(4, y(-2), wing[0]).px(10, y(-2), wing[0]);
    } else {
      // the wings swept down past the belly
      p.rect(3, y(3), 8, 3, wing[1]).rect(4, y(8), 7, 5, wing[1]).rect(5, y(12), 5, 2, wing[1]).rect(5, y(9), 5, 1, wing[2]).rect(6, y(13), 3, 1, wing[0]);
    }
  }
  // the rune on his chest (a small gold Hagal: two staves and a bar)
  p.px(12, y(7), GOLD).px(12, y(8), GOLD).px(12, y(9), GOLD).px(14, y(7), GOLD).px(14, y(8), GOLD).px(14, y(9), GOLD).px(13, y(8), GOLD_D);
  c = p.canvas;
  cache.set(pose, c);
  return c;
}
