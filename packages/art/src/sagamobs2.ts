// The dungeons' second families (shared/src/mobs.ts): for each of the three monsters a dungeon began with, a mate of another
// shape for the same pack slot, so a pack is not all skeletons and rats. Drawn like the others (side view facing right, two
// walk frames, drawAnimal outlines them; flames and glows come after the outline). Every ordinary monster, old and new, has
// three skins (the `v` of its draw function: another helmet, weapon, horns or hat as well as other colours), and each skin
// again as one of Loke's illusions; the bottom of this file puts both on (an animal's `variant` is `mobVariant(skin, illusion)`).
// Friendly-spooky: big round eyes, grins, nothing bleeds.
import { MOB_ARCHETYPE, MOB_SKINS, isIllusion, mobSkinOf } from '@varldstradet/shared';
import { Px, shade } from './px.js';
import { flame, halo, lump, pal, paint, shard, twinkle, type Pal } from './saga.ts';
import {
  BONE,
  FROST,
  GOLD,
  IRON,
  K,
  SAGA_AFTER,
  SAGA_ANIMAL_SIZE,
  SAGA_DRAW,
  SAGA_HAT_POS,
  SAGA_OUTLINE,
  SAGA_VARIANTS,
  SNOWFUR,
  WOOD,
  bone,
  eye,
  ghostify,
  skull,
  stride,
  tube,
  type Draw,
} from './sagaanimals.ts';

/** One of three by the skin. */
const by = <T>(v: number, a: T, b: T, c: T): T => (v === 1 ? b : v === 2 ? c : a);

/** Draws with `dy` pixels of room above (for a tall hat, ears, a flame's candle): `draw` gets a canvas that is blitted `dy` lower. */
function lowered(p: Px, dy: number, draw: (q: Px) => void): void {
  const q = new Px(p.w, p.h - dy);
  draw(q);
  p.blit(q, 0, dy);
}

const RUST = pal('#3e1c0c', '#6e3414', '#a0541e', '#c87a34', '#e6a45c');
const STONE = pal('#24262a', '#3a3e44', '#565c64', '#767e88', '#9aa2ac');

/** A round shield seen from the front at (cx, cy): an iron rim, a boss in the middle, and a painted pattern (quarters, a ring or a cross). */
export function roundShield(p: Px, cx: number, cy: number, r: number, a: string, b: string, pattern: number, rim: Pal = IRON): void {
  paint(p, cx - r, cy - r, r * 2 + 1, r * 2 + 1, (x, y) => {
    const dx = x + 0.5 - cx - 0.5;
    const dy = y + 0.5 - cy - 0.5;
    const d = Math.hypot(dx, dy);
    if (d > r + 0.3) return null;
    if (d > r - 0.8) return dx + dy < 0 ? rim.l : rim.b;
    if (d < 1.2) return dx + dy < 0 ? rim.l2 : rim.l;
    const lit = dx + dy < -r * 0.5;
    const c = pattern === 0 ? ((dx < 0) === (dy < 0) ? a : b) : pattern === 1 ? (d > r * 0.45 && d < r * 0.72 ? b : a) : Math.abs(dx) < 1 || Math.abs(dy) < 1 ? b : a;
    return lit ? shade(c, 1.25) : dx + dy > r * 0.7 ? shade(c, 0.78) : c;
  });
}

// ---------------------------------------------------------------------------
// Draugkryptan: a flock of bats, a grave light, a draug in a rusty helmet
// ---------------------------------------------------------------------------

/** One bat, its body's top-left at (x, y): a round body, pointed ears, two wings up or down, little glowing eyes and a fang. */
function bat(p: Px, x: number, y: number, up: boolean, fur: Pal, ears: number, big: boolean, eyes: string): void {
  const w = big ? 7 : 5;
  const h = big ? 6 : 5;
  const span = big ? 5 : 4;
  for (let i = 1; i <= span; i++) {
    const top = up ? y + 1 - Math.ceil(i * 0.8) : y + 1 + Math.floor(i / 2);
    const len = Math.max(1, span - i + (up ? 1 : 0));
    for (const wx of [x - i, x + w - 1 + i]) p.rect(wx, top, 1, len, i % 2 ? fur.d : fur.d2).px(wx, top, fur.b);
  }
  lump(p, x, y, w, h, fur, 0.15, 400 + x, 0.35);
  p.rect(x, y - ears, 1, ears + 1, fur.b).rect(x + w - 1, y - ears, 1, ears + 1, fur.d);
  if (ears > 2) p.px(x + 1, y - 1, fur.b).px(x + w - 2, y - 1, fur.d).px(x, y - ears + 1, '#d8909a');
  p.px(x + w - 4, y + 2, eyes).px(x + w - 2, y + 2, eyes);
  p.px(x + w - 3, y + h - 2, '#ffffff');
}

function fladdermoss(p: Px, f: number, v = 0): void {
  // three bats that always fly together, flapping out of step
  const fur = by(v, pal('#1e1424', '#34223c', '#503656', '#6e5074', '#907094'), pal('#22262e', '#3a4048', '#586068', '#7a828a', '#a0a8ae'), pal('#2a1810', '#48281a', '#6e4028', '#946040', '#b8845e'));
  const eyes = by(v, '#ffe14a', '#9cff8a', '#ff9a4a');
  const ears = by(v, 2, 4, 2);
  if (v === 2) {
    // one fat bat and its two small friends
    bat(p, 2, 4 + f, !f, fur, 1, false, eyes);
    bat(p, 4, 13 - f, !!f, fur, 1, false, eyes);
    bat(p, 12, 6 + (f ? 0 : 1), !!f, fur, ears, true, eyes);
    p.rect(14, 10 + (f ? 0 : 1), 3, 2, '#e8d0b0');
    return;
  }
  bat(p, 5, 4 + ears - 2 + f, !f, fur, ears, false, eyes);
  bat(p, 6, 13 - f, !!f, fur, ears, false, eyes);
  bat(p, 15, 7 + ears - 2 + (f ? 0 : 1), !!f, fur, ears, false, eyes);
  if (v === 1) p.px(7, 7 + ears - 2 + f, '#e8eef0').px(17, 10 + ears - 2 + (f ? 0 : 1), '#e8eef0');
}

function gravljus(p: Px, f: number, v = 0): void {
  // a grave light: a flame with a face that floats above a candle stub (or in a little lantern), its tip swaying
  const [outer, mid, core] = by(v, ['#1e9a6a', '#6af0a0', '#e8fff0'], ['#2a6ad8', '#6ac0ff', '#e8f8ff'], ['#8a4ad8', '#c89aff', '#f6eaff']);
  const lean = f ? 1.5 : -1.5;
  paint(p, 0, 0, 14, 16, (x, y) => {
    const t = (14 - y) / 13; // 0 at the round foot, 1 at the tip
    if (t < 0 || t > 1) return null;
    const cx = 7 + lean * t * t;
    const half = t < 0.35 ? 4.6 * Math.sqrt(1 - ((0.35 - t) / 0.36) ** 2) : 4.6 * (1 - (t - 0.35) / 0.65) ** 0.8;
    const u = Math.abs(x + 0.5 - cx) / Math.max(0.4, half);
    if (u > 1) return null;
    return u < 0.4 && t < 0.5 ? core : u < 0.75 && t < 0.8 ? mid : outer;
  });
  // the face: big dark eyes and a little round mouth
  p.rect(6, 9, 2, 2, K).px(6, 9, '#ffffff').rect(9, 9, 2, 2, K).px(9, 9, '#ffffff').px(8, 12, shade(outer, 0.6));
  if (v === 1) {
    // two little flames for hands, held up
    for (const [x, y] of [[1, 9 - f], [12, 8 + f]] as const) p.rect(x, y, 2, 2, mid).px(x, y - 1, outer).px(x + (x < 5 ? 0 : 1), y, core);
  }
  if (v === 2) {
    // an iron lantern around it: a ring on top, four bars, a foot
    p.rect(5, 0, 4, 1, IRON.l).px(4, 1, IRON.b).px(9, 1, IRON.b).rect(1, 2, 12, 1, IRON.b).rect(1, 2, 6, 1, IRON.l);
    for (const x of [1, 12]) p.rect(x, 3, 1, 13, x === 1 ? IRON.l : IRON.d);
    p.rect(1, 16, 12, 2, IRON.b).rect(1, 16, 12, 1, IRON.l).rect(3, 18, 8, 1, IRON.d);
    return;
  }
  // the candle stub it rose from, wax running down
  const wax = pal('#8a7c60', '#b8aa88', '#e2d6b8', '#f4ecd8', '#fffaf0');
  p.rect(5, 16, 4, 4, wax.b).rect(5, 16, 1, 4, wax.l).rect(8, 16, 1, 4, wax.d).px(6, 15, K).px(4, 17, wax.l).px(9, 18, wax.b).rect(4, 19, 6, 1, wax.d);
}

function rostdraug(p: Px, f: number, v = 0): void {
  // a draug: a stout dead warrior with blue-grey skin and a white beard, in a rusty helmet, behind a big round shield
  const skin = pal('#26323e', '#3c4e5e', '#587080', '#7c94a2', '#a4b8c2');
  const cloth = by(v, pal('#2a1c16', '#443024', '#624834', '#80644a', '#a08464'), pal('#1c2430', '#2c3a4a', '#405468', '#5a7088', '#7a90a6'), pal('#1e2a1c', '#30422c', '#486040', '#62805a', '#84a07a'));
  const [b, fr] = stride(f, 6, 12, 1);
  p.rect(b, 18, 3, 4, skin.d).rect(fr, 18, 3, 4, skin.b).rect(b - 1, 21, 5, 3, WOOD.d).rect(fr - 1, 21, 5, 3, WOOD.b).rect(fr - 1, 21, 5, 1, WOOD.l);
  // the weapon in the far hand, up over the shoulder: an axe, a spiked club or a notched sword
  if (v === 0) {
    p.line(5, 15, 3, 3, WOOD.b).line(6, 15, 4, 3, WOOD.d);
    paint(p, 0, 1, 6, 6, (x, y) => (x <= 2 + (y < 3 ? y : 5 - y) && y < 6 ? (x < 1 ? '#e4e8ee' : y < 3 ? RUST.l : RUST.b) : null));
  } else if (v === 1) {
    p.line(5, 15, 3, 5, WOOD.b).line(6, 15, 4, 5, WOOD.d);
    lump(p, 0, 0, 7, 7, WOOD, 0.2, 411, 0.3);
    for (const [x, y] of [[0, 1], [3, 0], [6, 2], [1, 5], [6, 5]] as const) p.px(x, y, IRON.l2);
  } else {
    p.line(4, 14, 2, 1, '#aeb8c4').line(5, 14, 3, 1, '#7e8896').px(2, 0, '#e4e8ee').px(4, 7, K).rect(3, 14, 4, 1, RUST.b);
  }
  // the body in a ragged tunic with a belt
  lump(p, 4, 9, 12, 11, cloth, 0.15, 412, 0.3);
  paint(p, 4, 18, 12, 3, (x, y) => (y === 20 && x % 2 === 0 ? null : (x + y) % 3 === 0 ? cloth.d : cloth.b));
  p.rect(4, 16, 12, 1, WOOD.d2).px(9, 16, GOLD.b);
  // the head: a heavy brow, a glowing eye, a round nose, the beard down over the chest
  lump(p, 7, 2, 10, 9, skin, 0.12, 413, 0.35);
  lump(p, 15, 6, 4, 4, skin, 0.1, 414, 0.5);
  p.rect(12, 5, 3, 2, K).px(13, 5, '#9cff8a').px(14, 5, '#e4ffe0').px(13, 6, '#5ac86a');
  paint(p, 8, 8, 9, 7, (x, y) => (Math.abs(x + 0.5 - 13) > 4.2 - (y - 8) * 0.55 ? null : (x + y) % 3 === 0 ? SNOWFUR.b : SNOWFUR.l));
  p.rect(12, 9, 4, 1, skin.d2);
  // the rusty helmet: a round one with a nose guard, a horned one, or a pointed one with a neck guard
  paint(p, 6, 0, 12, 6, (x, y) => {
    const dx = (x + 0.5 - 12) / 5.6;
    const dy = (y + 0.5 - 6) / (v === 2 ? 7 : 5.6);
    if (dx * dx + dy * dy > 1 || y > 4) return null;
    return y === 4 ? RUST.d : dx < -0.3 && dy < -0.5 ? RUST.l2 : (x * 5 + y * 3) % 7 === 0 ? RUST.d : dx < 0 ? RUST.l : RUST.b;
  });
  if (v === 0) p.rect(15, 5, 1, 3, RUST.b).px(15, 5, RUST.l);
  if (v === 1) p.line(7, 2, 5, 0, BONE.l).px(6, 2, BONE.b).line(16, 2, 18, 0, BONE.l).px(17, 2, BONE.b);
  if (v === 2) p.px(12, -1, RUST.l).rect(11, 0, 2, 1, RUST.l2).rect(6, 5, 2, 4, IRON.b).px(6, 6, IRON.l).px(7, 8, IRON.d);
  // the shield held in front, and the hand on its rim
  const [a, c2] = by(v, ['#b8402e', '#e8dcc0'], ['#2e5a9a', '#e8eef4'], ['#3e7a3a', '#e8c040']);
  roundShield(p, 14, 15, 5, a, c2, v, by(v, RUST, IRON, RUST));
}

// ---------------------------------------------------------------------------
// Frostjättens borg: a snow owl, the frost giant's child, a snowman
// ---------------------------------------------------------------------------

function snouggla(p: Px, f: number, v = 0): void {
  // a snow owl in flight: a round white body, a big round head with yellow eyes, wings that beat, a fan of a tail
  const fur = by(v, SNOWFUR, pal('#6a7a8c', '#92a2b4', '#bccad8', '#dfe8f0', '#ffffff'), pal('#8a8478', '#b4ac9c', '#dcd6c8', '#f2eee4', '#ffffff'));
  const fleck = by(v, '#8ea4bc', '#5a6a7c', '#6a5a48');
  const eyes = by(v, '#ffd23a', '#ffe98a', '#ff9a3a');
  // the far wing, then the tail
  const wing = (x: number, far: boolean): void => {
    paint(p, x - 5, 0, 11, 18, (px, py) => {
      const up = f === 0;
      // a wing is a long leaf from the shoulder (x, 9): up and back, or down and back
      const ty = up ? 9 - py : py - 9;
      if (ty < -1 || ty > 8) return null;
      const cx = x - ty * 0.45;
      const half = ty < 0 ? 2 : 3.4 - ty * 0.36;
      if (Math.abs(px + 0.5 - cx) > half) return null;
      const tip = ty > 5 && (px + py) % 2 === 0;
      return far ? (tip ? fleck : fur.d) : tip ? fleck : px + 0.5 < cx ? fur.l : fur.b;
    });
  };
  wing(6, true);
  p.rect(0, 10, 4, 2, fur.b).rect(0, 12, 3, 1, fur.d).px(0, 10, fleck).px(1, 12, fleck);
  // the body and the head
  lump(p, 3, 7, 11, 9, fur, 0.25, 421, 0.3);
  lump(p, 9, 3, 10, 10, fur, 0.15, 422, 0.35);
  for (const [x, y] of [[5, 10], [7, 12], [9, 13], [6, 14], [11, 14]] as const) p.px(x, y, fleck);
  if (v === 2) for (const [x, y] of [[4, 9], [8, 10], [10, 12], [12, 15], [7, 15], [11, 4], [13, 3]] as const) p.px(x, y, fleck);
  // talons tucked under
  p.rect(7, 16, 1, 2, '#c8a040').rect(10, 16, 1, 2, '#c8a040').px(8, 17, '#c8a040').px(11, 17, '#c8a040');
  wing(9, false);
  // the face: two big round eyes, a little beak, a pale disc
  for (const x of [11, 15]) p.rect(x, 6, 3, 3, eyes).rect(x + 1, 7, 2, 2, K).px(x + 1, 7, '#ffffff').px(x, 6, shade(eyes, 1.4));
  p.px(14, 9, '#4a4a56').px(14, 10, '#c8a040').px(15, 10, '#8a6a20');
  // horned-owl tufts
  if (v === 1) p.line(10, 3, 9, 0, fur.b).px(10, 2, fur.d).line(16, 3, 18, 0, fur.l).px(17, 2, fur.b);
  if (v === 2) p.rect(10, 5, 9, 1, fleck).px(14, 6, fleck);
}

function jatteunge(p: Px, f: number, v = 0): void {
  // the frost giant's child: a big round head on a small round body, ice-blue, in a fur nappy, holding a snowball up to throw
  const skin = pal('#2e5276', '#4a7aa4', '#74a4cc', '#a4cce6', '#d4ecf8');
  const fur = pal('#4a3a2e', '#6a5444', '#8e7460', '#b0967e', '#d0b89e');
  const [b, fr] = stride(f, 5, 9, 1);
  p.rect(b, 18, 3, 3, skin.d).rect(fr, 18, 3, 3, skin.b).rect(b - 1, 20, 4, 2, skin.d2).rect(fr, 20, 4, 2, skin.d);
  // the far arm, the round belly, the fur nappy
  p.rect(2, 12, 2, 4, skin.d);
  lump(p, 3, 10, 10, 9, skin, 0.1, 431, 0.3);
  paint(p, 3, 15, 10, 4, (x, y) => (y === 18 && x % 2 === 0 ? null : y === 15 ? fur.l : (x + y) % 3 === 0 ? fur.d : fur.b));
  // the near arm up, and the snowball in its hand
  const up = f ? 1 : 0;
  p.line(11, 11, 14, 6 - up, skin.b).line(12, 11, 15, 6 - up, skin.l).rect(14, 5 - up, 2, 2, skin.l);
  const r = by(v, 5, 6, 5);
  lump(p, 13 - (r - 5), 0, r, r, SNOWFUR, 0.2, 432, 0.35);
  // the head: round cheeks, big eyes, one tooth
  lump(p, 2, 2, 11, 10, skin, 0.1, 433, 0.35);
  eye(p, 8, 6, 2);
  eye(p, 11, 6, 2);
  p.px(7, 9, '#e8a0b8').rect(9, 9, 3, 1, skin.d2).px(10, 10, '#ffffff');
  if (v === 0) p.rect(6, 1, 1, 2, SNOWFUR.l).px(7, 0, SNOWFUR.l2).px(5, 1, SNOWFUR.b);
  if (v === 1) {
    // a play helmet of ice with two small horns
    paint(p, 2, 0, 11, 5, (x, y) => (((x + 0.5 - 7.5) / 5.5) ** 2 + ((y + 0.5 - 5) / 5) ** 2 > 1 || y > 3 ? null : y === 3 ? FROST.d2 : x < 6 ? FROST.l : FROST.b));
    p.line(3, 2, 1, 0, BONE.l).line(11, 2, 13, 0, BONE.l);
  }
  if (v === 2) {
    // a knitted cap with a bobble, and a scarf
    p.rect(3, 2, 9, 2, '#c83a3a').rect(4, 1, 7, 1, '#e05a4a').rect(3, 4, 9, 1, '#f4ecd8').rect(6, -1, 3, 2, '#f4ecd8');
    p.rect(4, 11, 8, 1, '#c83a3a').rect(4, 12, 2, 3, '#e05a4a');
  }
}

function snogubbe(p: Px, f: number, v = 0): void {
  lowered(p, 3, (q) => snogubbeBody(q, f, v));
  // the hat: a bucket, a tall hat, a horned helmet
  const sway = f ? 1 : 0;
  const scarf = by(v, '#c83a3a', '#3a8a4a', '#3a5ac8');
  if (v === 0) p.rect(7 + sway, 2, 8, 4, IRON.b).rect(7 + sway, 2, 2, 4, IRON.l).rect(6 + sway, 5, 10, 1, IRON.d).px(14 + sway, 2, IRON.d).px(6 + sway, 4, IRON.l);
  if (v === 1) p.rect(8 + sway, 0, 6, 5, '#2a2630').rect(8 + sway, 0, 1, 5, '#4a4654').rect(6 + sway, 5, 10, 1, '#2a2630').rect(8 + sway, 3, 6, 1, scarf);
  if (v === 2) {
    p.rect(7 + sway, 3, 8, 3, IRON.b).rect(7 + sway, 3, 8, 1, IRON.l).rect(7 + sway, 5, 8, 1, GOLD.b);
    p.line(7 + sway, 4, 5 + sway, 0, BONE.l).px(6 + sway, 3, BONE.b).line(14 + sway, 4, 16 + sway, 0, BONE.l).px(15 + sway, 3, BONE.b);
  }
}

function snogubbeBody(p: Px, f: number, v: number): void {
  // a snowman that has woken up: three balls of snow, coal eyes and a frown, a carrot nose, stick arms, a broom
  const snow = pal('#7c94b0', '#a8bcd2', '#d2e0ee', '#eef4fa', '#ffffff');
  const sway = f ? 1 : 0;
  lump(p, 2, 14, 16, 12, snow, 0.15, 441, 0.3);
  lump(p, 4 + sway, 7, 13, 10, snow, 0.15, 442, 0.3);
  // the far arm: a twig waving
  p.line(5 + sway, 11, 1, 8 - sway, WOOD.b).px(0, 7 - sway, WOOD.l).px(2, 7 - sway, WOOD.b);
  // the broom (or a spade) in the near arm
  p.line(15 + sway, 12, 19, 11, WOOD.b);
  if (v === 2) {
    p.rect(19, 4, 1, 20, WOOD.b).rect(18, 1, 3, 4, IRON.b).rect(18, 1, 1, 4, IRON.l);
  } else {
    p.rect(19, 5, 1, 19, WOOD.b).px(19, 5, WOOD.l);
    paint(p, 17, 0, 5, 6, (x, y) => ((x + y) % 2 ? '#c8a050' : '#a07a30'));
    p.rect(17, 5, 5, 1, '#6a4a20');
  }
  // the head, the scarf under it
  lump(p, 6 + sway, 1, 10, 9, snow, 0.12, 443, 0.35);
  const scarf = by(v, '#c83a3a', '#3a8a4a', '#3a5ac8');
  p.rect(6 + sway, 9, 10, 2, scarf).rect(6 + sway, 9, 10, 1, shade(scarf, 1.3)).rect(7 + sway, 11, 2, 4, scarf).px(7 + sway, 14, shade(scarf, 0.7));
  // coal eyes under coal brows, a carrot, a mouth of coal
  p.rect(11 + sway, 4, 2, 2, K).rect(14 + sway, 4, 2, 2, K).px(11 + sway, 4, '#5a5a6a').px(10 + sway, 3, K).px(16 + sway, 3, K);
  p.rect(14 + sway, 6, 4, 1, '#f08a2a').rect(14 + sway, 7, 2, 1, '#c8641a').px(18 + sway, 6, '#f8b060');
  p.px(11 + sway, 8, K).px(13 + sway, 8, K).px(15 + sway, 8, K);
  // buttons
  p.px(12 + sway, 12, K).px(12 + sway, 14, K).px(11, 18, K).px(11, 21, K);
}

// ---------------------------------------------------------------------------
// Surts smedja: a fire salamander, the smith's sooty gnome, a lava snail
// ---------------------------------------------------------------------------

const HOT = pal('#a02a0c', '#e0561a', '#ff9a2a', '#ffd060', '#fff6c8');

function eldsalamander(p: Px, f: number, v = 0): void {
  // a quick little lizard, low and long: a wagging tail, four short legs, a broad head with a big eye; fire along its back
  const c = by(v, pal('#0c0a10', '#1a161e', '#2c2630', '#443c48', '#5e5462'), pal('#5a100a', '#8e2010', '#c83c1c', '#f0683a', '#ffa070'), pal('#7a2a08', '#b84a10', '#f07a1e', '#ffae4a', '#ffe08a'));
  const sw = f ? 1 : -1;
  const [b, fr] = stride(f, 6, 14, 1);
  p.rect(b + 2, 9, 2, 2, c.d2).rect(fr - 2, 9, 2, 2, c.d2);
  tube(p, [[1, 5 - sw, 0.7], [3, 7, 1.2], [6, 8, 1.9], [10, 7.6, 2.5], [14, 7.4, 2.5]], c, 451);
  p.rect(b, 9, 2, 2, c.d).rect(b - 1, 11, 3, 1, c.b).rect(fr, 9, 2, 2, c.b).rect(fr, 11, 3, 1, c.l);
  // the head: a wide snout, a big round eye, a little smile
  lump(p, 14, 3, 7, 7, c, 0.1, 452, 0.35);
  p.rect(19, 6, 3, 3, c.b).rect(19, 6, 3, 1, c.l).px(21, 6, c.d2).rect(18, 9, 4, 1, c.d2);
  p.rect(16, 4, 3, 3, by(v, '#ffd23a', '#ffe98a', '#2a1408')).rect(17, 5, 2, 2, K).px(17, 5, '#ffffff');
  if (v === 0) for (const [x, y] of [[4, 7], [7, 8], [9, 6], [12, 8], [13, 6], [16, 8]] as const) p.rect(x, y, 2, 1, '#ffc23a').px(x, y, '#fff0a0');
  if (v === 1) {
    // a frill standing up behind the head
    paint(p, 10, 0, 6, 8, (x, y) => (Math.hypot(x + 0.5 - 15.5, y + 0.5 - 6.5) > 6 || x > 14 ? null : (x + y) % 2 ? HOT.b : HOT.l));
    p.px(10, 4, HOT.l2).px(12, 1, HOT.l2);
  }
  if (v === 2) for (const [x, h] of [[5, 2], [8, 3], [11, 3], [14, 2]] as const) shard(p, x, 5, 2, h + 1, -1, BASALT2);
}

const BASALT2 = pal('#100e12', '#1e1b22', '#2e2a33', '#433e4a', '#5a5462');
const LEATHER = pal('#2e1c10', '#4a2e1a', '#6e4828', '#906238', '#b4844e');

function sotnisse(p: Px, f: number, v = 0): void {
  // the smith's little helper, black with soot: big white eyes, a leather apron, and a tool from the forge that still glows
  const skin = pal('#1c1818', '#302a2a', '#4a4040', '#665a58', '#847672');
  const [b, fr] = stride(f, 4, 8, 1);
  p.rect(b, 15, 2, 3, skin.d).rect(fr, 15, 2, 3, skin.b).rect(b - 1, 18, 4, 2, LEATHER.d).rect(fr, 18, 4, 2, LEATHER.b);
  lump(p, 2, 9, 9, 8, skin, 0.1, 461, 0.3);
  paint(p, 4, 10, 6, 7, (x, y) => (y === 10 ? LEATHER.l : x === 4 ? LEATHER.l : (x + y) % 4 === 0 ? LEATHER.d : LEATHER.b));
  p.px(6, 12, GOLD.b);
  // the tool, held up in front: a hammer, tongs with a glowing bar, a poker
  if (v === 0) {
    p.line(10, 13, 13, 6, WOOD.b).line(11, 13, 14, 6, WOOD.d);
    p.rect(11, 2, 5, 4, IRON.b).rect(11, 2, 5, 1, IRON.l).rect(15, 2, 1, 4, HOT.b).px(15, 3, HOT.l2);
  } else if (v === 1) {
    p.line(10, 13, 13, 6, IRON.l).line(11, 14, 14, 7, IRON.b);
    p.rect(12, 3, 4, 3, HOT.b).rect(12, 3, 4, 1, HOT.l2).px(15, 5, HOT.d);
  } else {
    p.line(10, 14, 14, 2, IRON.b).line(11, 14, 15, 2, IRON.d).rect(14, 0, 2, 3, HOT.b).px(14, 0, HOT.l2);
  }
  p.rect(9, 12, 3, 2, skin.l);
  // the head: round, sooty, with white eyes and a grin
  lump(p, 2, 3, 10, 8, skin, 0.1, 462, 0.35);
  p.rect(7, 6, 2, 2, '#ffffff').px(8, 7, K).rect(10, 6, 2, 2, '#ffffff').px(11, 7, K);
  p.px(12, 8, '#b06a5a').rect(8, 9, 4, 1, K).px(9, 9, '#ffffff').px(11, 9, '#ffffff');
  if (v === 0) {
    // a pointed hood, its tip falling back
    const hood = pal('#3a0e0e', '#641818', '#8e2a22', '#b4443a', '#d86a5a');
    paint(p, 0, 0, 13, 6, (x, y) => (x < 1 + (5 - y) * 0.7 || x > 12 - (5 - y) * 1.3 ? null : y === 5 ? hood.d : x < 5 ? hood.l : hood.b));
    p.px(0, 2, hood.b).px(1, 1, hood.l);
  }
  if (v === 1) {
    // a leather cap and a pair of brass goggles pushed up
    p.rect(2, 2, 10, 2, LEATHER.b).rect(3, 1, 8, 1, LEATHER.l).rect(2, 4, 10, 1, LEATHER.d);
    for (const x of [6, 9]) p.rect(x, 2, 3, 3, GOLD.b).rect(x + 1, 3, 1, 1, '#9cd8f0').px(x, 2, GOLD.l2);
  }
  if (v === 2) {
    // a singed tuft of hair and a bushy grey beard
    p.px(5, 2, '#d8d0c8').px(6, 1, '#f0ece6').px(7, 2, '#d8d0c8').px(8, 1, HOT.b);
    paint(p, 5, 9, 8, 5, (x, y) => (Math.abs(x + 0.5 - 9.5) > 3.6 - (y - 9) * 0.6 ? null : (x + y) % 3 === 0 ? '#a8a098' : '#d8d0c8'));
    p.rect(8, 9, 4, 1, K);
  }
}

function lavasnigel(p: Px, f: number, v = 0): void {
  // a snail of lava: a soft glowing body, two eyes on stalks, and a house of black stone (round, spiked, or a small volcano)
  const body = pal('#7a1e08', '#b8400e', '#ec7a1c', '#ffb048', '#ffe490');
  const rock = BASALT2;
  const s = f ? 1 : 0;
  // the foot and the neck
  tube(p, [[2 + s, 19, 1.4], [8, 19, 2.4], [16, 19, 2.6], [21, 17, 2.4], [22, 12, 2.2]], body, 471);
  p.rect(3 + s, 21, 17, 1, body.d);
  for (const x of [6, 10, 14, 18]) p.px(x + s, 20, body.d);
  // the house on its back
  if (v === 2) {
    paint(p, 1, 2, 19, 17, (x, y) => {
      const t = (y - 2) / 16;
      const half = 2 + t * 7.4;
      const u = (x + 0.5 - 10.5) / half;
      if (Math.abs(u) > 1) return null;
      if (y < 4) return Math.abs(u) < 0.5 ? HOT.l2 : HOT.b;
      const run = (x === 9 && y < 10) || (x === 12 && y < 13) || (x === 7 && y > 8 && y < 12);
      return run ? HOT.b : u < -0.35 ? rock.l : u > 0.4 ? rock.d : (x * 3 + y * 5) % 7 === 0 ? rock.d : rock.b;
    });
  } else {
    lump(p, 2, 3, 17, 16, rock, 0.3, 472, 0.3);
    // the spiral, glowing
    let px0 = 10.5;
    let py0 = 11;
    for (let a = 0; a < 12.5; a += 0.25) {
      const r = 0.6 + a * 0.52;
      const x = 10.5 + Math.cos(a) * r;
      const y = 11 + Math.sin(a) * r * 0.95;
      if (a > 0) p.line(Math.round(px0), Math.round(py0), Math.round(x), Math.round(y), a < 4 ? HOT.l : HOT.b);
      px0 = x;
      py0 = y;
    }
    if (v === 1) {
      shard(p, 5, 6, 3, 6, -2, rock);
      shard(p, 10, 4, 3, 6, 0, rock);
      shard(p, 15, 6, 3, 5, 2, rock);
      shard(p, 18, 11, 2, 4, 2, rock);
    }
  }
  // the head and the eyes on their stalks
  lump(p, 19, 9, 7, 6, body, 0.1, 473, 0.4);
  p.rect(22, 13, 3, 1, body.d2);
  const lean = f ? 1 : 0;
  p.line(21, 9, 20 + lean, 5, body.b).line(24, 9, 24 + lean, 5, body.l);
  for (const x of [19 + lean, 23 + lean]) p.rect(x, 3, 3, 3, '#fffaf0').rect(x + 1, 4, 2, 2, K).px(x + 1, 4, '#ffffff');
}

// ---------------------------------------------------------------------------
// Helheim: a skull with a candle, a cat of bones, a coffin that walks
// ---------------------------------------------------------------------------

const HELGLOW = '#7aff6a';
const WAX = pal('#8a7c60', '#b8aa88', '#e2d6b8', '#f4ecd8', '#fffaf0');

function ljusskalle(p: Px, f: number, v = 0): void {
  // a skull that floats with a candle on its head (the flame comes after the outline) and a wisp of cold smoke under it
  const bob = f ? 1 : 0;
  const glow = by(v, HELGLOW, '#6ac8ff', '#c8a0ff');
  const top = 7 + bob;
  // the wisp trailing down
  for (let i = 0; i < 5; i++) {
    const x = 7 + Math.round(Math.sin(i * 0.9 + f * 1.6) * 1.6);
    p.rect(x, top + 11 + i, 3 - Math.floor(i / 2), 1, i % 2 ? shade(glow, 0.7) : glow);
  }
  // the skull, looking out at you a little to the right: a round top, a narrower jaw with teeth
  lump(p, 2, top, 13, 9, BONE, 0.1, 480, 0.35);
  p.rect(5, top + 8, 9, 3, BONE.b).rect(5, top + 8, 9, 1, BONE.l).rect(5, top + 10, 9, 1, BONE.d);
  for (const x of [6, 8, 10, 12]) p.px(x, top + 9, K);
  // two big eye holes with a light in each, a nose hole
  for (const x of [5, 10]) p.rect(x, top + 3, 3, 3, K).px(x + 2, top + 3, glow).px(x + 1, top + 4, glow).px(x + 2, top + 4, '#ffffff');
  p.px(9, top + 6, K).px(8, top + 7, K).px(9, top + 7, K);
  if (v === 1) {
    // two short horns
    p.line(3, top + 1, 1, top - 3, BONE.l).px(2, top, BONE.b).px(1, top - 3, BONE.l2).line(13, top + 1, 15, top - 3, BONE.l).px(14, top, BONE.b).px(15, top - 3, BONE.l2);
  }
  // the candle (three small ones on the third skull), wax running down the brow
  const candle = (x: number, h: number): void => {
    p.rect(x, top - h, 2, h + 1, WAX.b).rect(x, top - h, 1, h + 1, WAX.l2).px(x + 1, top, WAX.d);
  };
  if (v === 2) {
    candle(4, 1);
    candle(8, 3);
    candle(11, 2);
    p.px(4, top + 1, WAX.l2).px(9, top + 1, WAX.l2).px(9, top + 2, WAX.l).px(12, top + 1, WAX.l2).line(13, top + 3, 12, top + 6, BONE.d);
  } else {
    candle(8, 3);
    p.px(7, top + 1, WAX.l2).px(10, top + 1, WAX.l2).px(10, top + 2, WAX.l);
  }
}

function benkatt(p: Px, f: number, v = 0): void {
  // a cat of nothing but bones: an arched spine, ribs, a tail held high, a round skull with pointed ears and green eyes
  const c = by(v, BONE, BONE, pal('#5a6258', '#828c7c', '#b4bea8', '#d6dfca', '#f2f8e8'));
  const far = c.d;
  // the tail: up and curled, or straight with a kink
  if (v === 1) p.line(3, 8, 2, 4, c.l).line(2, 4, 4, 1, c.l).px(4, 0, c.l2);
  else p.line(3, 8, 1, 5, c.l).line(1, 5, 2, 2, c.l).px(3, 1, c.l).px(4, 2, c.l2);
  // the legs: the far pair behind
  const [b, fr] = stride(f, 4, 13, 1);
  p.line(6, 10, b + 2, 14, far).line(14, 10, fr - 2, 14, far);
  p.line(5, 10, b, 14, c.l).line(15, 10, fr, 14, c.l).rect(b - 1, 15, 3, 1, c.b).rect(fr, 15, 3, 1, c.l2).px(b + 2, 15, far).px(fr - 2, 15, far);
  // the spine, arched, and the ribs under it
  for (let x = 4; x <= 15; x++) {
    const y = 8 - Math.round(Math.sin(((x - 4) / 11) * Math.PI) * 2.2);
    p.px(x, y, x % 2 ? c.l2 : c.l).px(x, y + 1, c.b);
    if (x >= 7 && x <= 13 && x % 2) p.rect(x, y + 2, 1, 3, c.l).px(x - 1, y + 5, c.b);
  }
  p.rect(4, 8, 3, 3, c.b).px(4, 8, c.l).rect(13, 8, 3, 3, c.b).px(13, 8, c.l);
  // the skull: ears, a big eye, a nose, whiskers of bone
  lump(p, 14, 3, 8, 7, c, 0.1, 481, 0.35);
  p.rect(15, 1, 2, 3, c.b).px(15, 0, c.l).rect(19, 1, 2, 3, c.l).px(20, 0, c.l2);
  if (v === 2) p.clear(19, 0, 2, 2).px(19, 2, c.d);
  p.rect(17, 5, 3, 3, K).px(18, 5, HELGLOW).px(19, 6, HELGLOW).px(19, 5, '#e4ffe0');
  p.px(21, 8, K).rect(18, 9, 4, 1, c.d).px(19, 9, c.l2).px(21, 9, c.l2);
  if (v === 1) p.rect(13, 9, 3, 1, '#c83a3a').px(14, 10, GOLD.l).px(14, 11, GOLD.b);
  if (v === 2) {
    // a fish bone it found, in its mouth
    p.rect(20, 10, 4, 1, c.l2).px(21, 9, c.l).px(21, 11, c.l).px(22, 9, c.l).px(22, 11, c.l).px(23, 9, c.b).px(23, 11, c.b);
  }
}

function kistgast(p: Px, f: number, v = 0): void {
  // an old coffin on two bony feet; someone looks out from under the lid, and bony fingers hold it ajar
  const wood = by(v, WOOD, pal('#1c1210', '#30201a', '#4a3226', '#664834', '#846046'), STONE);
  const [b, fr] = stride(f, 6, 11, 1);
  p.rect(b, 20, 2, 3, BONE.b).rect(fr, 20, 2, 3, BONE.l).rect(b - 1, 23, 4, 1, BONE.b).rect(fr - 1, 23, 5, 1, BONE.l2);
  const tilt = f ? 0 : 1;
  paint(p, 1, 0, 18, 21, (x, y0) => {
    const y = y0 - tilt;
    if (y < 1 || y > 19) return null;
    // a coffin's six sides (the stone one has a round top)
    const half = v === 2 ? (y < 6 ? Math.sqrt(Math.max(0, 36 - (y - 6.5) ** 2)) + 0.8 : 6.8 - (y - 6) * 0.1) : y < 7 ? 3.6 + (y - 1) * 0.6 : 7.2 - (y - 7) * 0.25;
    const u = (x + 0.5 - 10) / half;
    if (Math.abs(u) > 1) return null;
    if (Math.abs(u) > 0.82 || y === 19) return wood.d;
    if (v !== 2 && (x === 7 || x === 13)) return wood.d;
    return u < -0.4 ? wood.l : y < 3 ? wood.l : (x * 5 + y * 3) % 11 === 0 ? wood.d : wood.b;
  });
  const y0 = tilt;
  // the dark gap under the lid, two eyes in it, fingers on the edge
  p.rect(9, 6 + y0, 7, 4, '#0c0a10').px(8, 7 + y0, '#0c0a10').px(8, 8 + y0, '#0c0a10');
  const eyes = by(v, HELGLOW, '#ffb040', '#6ac8ff');
  p.rect(10, 7 + y0, 2, 2, eyes).px(11, 7 + y0, '#ffffff').rect(13, 7 + y0, 2, 2, eyes).px(14, 7 + y0, '#ffffff');
  for (const x of [10, 12, 14]) p.rect(x, 10 + y0, 1, 2, BONE.l2).px(x, 11 + y0, BONE.b);
  if (v === 0) {
    // iron bands and a small cross
    p.rect(5, 4 + y0, 10, 1, IRON.l).rect(4, 15 + y0, 12, 1, IRON.l).px(5, 4 + y0, IRON.l2).rect(6, 13 + y0, 3, 1, GOLD.b).rect(7, 12 + y0, 1, 3, GOLD.b);
  }
  if (v === 1) {
    // a chain round it, and a padlock that did not help
    for (let i = 0; i < 12; i++) p.px(4 + i, 16 + y0 - Math.round(i * 0.35), i % 2 ? IRON.l2 : IRON.b).px(4 + i, 3 + y0 + Math.round(i * 0.1), i % 2 ? IRON.l2 : IRON.b);
    p.rect(8, 14 + y0, 3, 3, GOLD.b).px(9, 13 + y0, GOLD.l).px(9, 15 + y0, K);
  }
  if (v === 2) {
    // a rune that glows, moss in the cracks
    p.line(6, 13 + y0, 6, 17 + y0, eyes).line(6, 13 + y0, 8, 15 + y0, eyes).line(8, 15 + y0, 6, 16 + y0, eyes);
    for (const [x, y] of [[5, 3], [12, 2], [14, 14], [11, 17]] as const) p.px(x, y + y0, '#457434').px(x + 1, y + y0, '#629848');
  }
}

// ---------------------------------------------------------------------------
// Svartalfheims gruvor: a mole with a lamp, a dark dwarf, an ore cart that rolls by itself
// ---------------------------------------------------------------------------

const PINK = '#e8a0b0';
const CRYSTAL = pal('#2a5a9a', '#3a8ad0', '#6ac0f8', '#b0e4ff', '#f0fbff');

function gruvmullvad(p: Px, f: number, v = 0): void {
  // a plump mole: velvet fur, a pink snout, big digging paws, and a miner's lamp (or goggles and a candle, or crystals on its back)
  const fur = by(v, pal('#141218', '#26222c', '#3c3644', '#565060', '#746c7e'), pal('#2a1a10', '#44301c', '#644a2e', '#866846', '#a88a62'), pal('#2a2238', '#40365a', '#5c507e', '#7e72a0', '#a69cc4'));
  p.px(0, 9, PINK).px(1, 10, PINK);
  p.rect(4 + (f ? 1 : 0), 11, 3, 2, PINK).px(3 + (f ? 1 : 0), 12, '#ffd0d8');
  lump(p, 1, 3, 15, 9, fur, 0.2, 491, 0.3);
  lump(p, 11, 3, 8, 8, fur, 0.15, 492, 0.35);
  if (v === 2) {
    shard(p, 4, 4, 2, 4, -1, CRYSTAL);
    shard(p, 7, 4, 3, 5, 0, CRYSTAL);
    shard(p, 11, 4, 2, 3, 1, CRYSTAL);
  }
  // the snout, the tiny eye, two teeth
  p.rect(17, 6, 3, 3, PINK).px(19, 6, '#ffd0d8').px(19, 8, '#c87a8a').px(18, 9, '#ffffff');
  if (v === 2) p.px(20, 5, PINK).px(20, 7, '#ffd0d8').px(20, 9, PINK).px(18, 5, PINK);
  if (v === 1) p.rect(13, 4, 4, 4, GOLD.b).rect(14, 5, 2, 2, '#9cd8f0').px(14, 5, '#ffffff').rect(10, 5, 3, 1, LEATHER.b);
  else p.rect(15, 5, 1, 2, K).px(15, 5, '#ffffff');
  // the near paw: a pink spade with claws, digging
  const up = f ? 0 : 1;
  p.rect(12, 9 - up, 4, 3, PINK).rect(12, 9 - up, 4, 1, '#ffd0d8').px(16, 10 - up, '#ffffff').px(16, 11 - up, '#ffffff').px(15, 12 - up, '#ffffff').px(13, 12 - up, '#ffffff');
  if (v === 0) {
    // the helmet and its lamp
    paint(p, 10, 0, 9, 5, (x, y) => (((x + 0.5 - 14.5) / 4.5) ** 2 + ((y + 0.5 - 4.5) / 4.5) ** 2 > 1 || y > 3 ? null : y === 3 ? '#9a6a10' : x < 13 ? '#f0c040' : '#d8a020'));
    p.rect(17, 1, 2, 2, IRON.b).px(18, 1, '#fff6c8');
  }
  if (v === 1) p.rect(13, 0, 2, 3, WAX.b).px(13, 0, WAX.l2);
}

function svartalf(p: Px, f: number, v = 0): void {
  // a dark dwarf: as wide as he is tall, a beard down to his belt, a helmet, a glowing eye under a heavy brow, and a miner's tool
  const skin = pal('#2a2224', '#44383a', '#665456', '#887274', '#aa9496');
  const mail = pal('#1e2026', '#343840', '#50565e', '#6e747e', '#9096a0');
  const beard = by(v, pal('#3a1408', '#6a2a10', '#9a4a1c', '#c4743a', '#e6a468'), pal('#0c0a0e', '#1a171e', '#2c2832', '#44404c', '#5e5a68'), pal('#7e7a74', '#a8a49c', '#d2cec6', '#eceae4', '#ffffff'));
  const [b, fr] = stride(f, 4, 9, 1);
  p.rect(b, 15, 3, 3, mail.d).rect(fr, 15, 3, 3, mail.b).rect(b - 1, 18, 5, 2, WOOD.d).rect(fr - 1, 18, 5, 2, WOOD.b).rect(fr - 1, 18, 5, 1, WOOD.l);
  lump(p, 2, 8, 12, 9, mail, 0.2, 501, 0.3);
  p.rect(3, 14, 10, 1, LEATHER.d);
  // the tool over the near shoulder: a hammer, a pick, an axe
  p.line(12, 14, 15, 4, WOOD.b).line(13, 14, 16, 4, WOOD.d);
  if (v === 0) p.rect(12, 1, 6, 4, IRON.b).rect(12, 1, 6, 1, IRON.l2).rect(12, 4, 6, 1, IRON.d).px(12, 2, IRON.l);
  if (v === 1) p.line(11, 4, 14, 2, IRON.l2).line(14, 2, 17, 3, IRON.l).px(17, 4, IRON.b).px(10, 5, IRON.b).px(15, 3, IRON.b);
  if (v === 2) paint(p, 13, 0, 5, 7, (x, y) => (x - 13 > 4 - Math.abs(y - 3) * 0.6 || x < 14 + (Math.abs(y - 3) > 2 ? 1 : 0) ? null : x > 16 ? '#e4e8ee' : y < 3 ? IRON.l : IRON.b));
  lump(p, 11, 11, 4, 4, skin, 0.1, 502, 0.4);
  // the head: nose first, an eye that glows, the beard
  lump(p, 4, 3, 9, 8, skin, 0.1, 503, 0.35);
  lump(p, 11, 6, 4, 4, skin, 0.1, 504, 0.5);
  p.rect(8, 5, 4, 1, skin.d2).rect(9, 6, 2, 2, K).px(10, 6, '#ffb040').px(10, 7, '#ffe08a');
  paint(p, 4, 8, 10, 9, (x, y) => (Math.abs(x + 0.5 - 9.5) > 4.8 - (y - 8) * 0.5 ? null : (x * 2 + y) % 4 === 0 ? beard.d : x < 8 ? beard.l : beard.b));
  p.rect(9, 9, 4, 1, beard.d2);
  if (v === 1) {
    // two braids with gold rings
    p.rect(6, 15, 2, 3, beard.b).rect(10, 15, 2, 3, beard.b).rect(6, 17, 2, 1, GOLD.l).rect(10, 17, 2, 1, GOLD.l);
  }
  // the helmet: horned, spiked, or a leather cap with a candle
  const hat = v === 2 ? LEATHER : IRON;
  paint(p, 3, 0, 11, 5, (x, y) => (((x + 0.5 - 8.5) / 5.5) ** 2 + ((y + 0.5 - 5.5) / 5) ** 2 > 1 || y > 4 ? null : y === 4 ? hat.d : x < 7 ? hat.l : hat.b));
  if (v === 0) p.line(4, 2, 2, 0, BONE.l).px(3, 2, BONE.b).line(12, 2, 14, 0, BONE.l).px(13, 2, BONE.b);
  if (v === 1) p.rect(8, -1, 1, 2, IRON.l2).rect(4, 4, 2, 3, IRON.b).px(4, 4, IRON.l);
  if (v === 2) p.rect(7, -1, 2, 2, WAX.b).px(7, -1, WAX.l2);
}

function malmvagn(p: Px, f: number, v = 0): void {
  // an ore cart that rolls by itself: iron wheels, a box of planks with a face, a heap of ore that rattles
  const box = by(v, WOOD, pal('#241a14', '#3c2a20', '#584030', '#765844', '#96745a'), RUST);
  const band = by(v, IRON, IRON, pal('#2a1408', '#4a260e', '#6e3c18', '#8e5626', '#b0743a'));
  const jolt = f ? 1 : 0;
  // the heap
  if (v === 0) {
    lump(p, 4, 2 - jolt + 1, 8, 7, GOLD, 0.3, 511, 0.3);
    lump(p, 10, 0 + jolt + 1, 8, 8, GOLD, 0.3, 512, 0.3);
    lump(p, 15, 3 - jolt + 1, 6, 6, GOLD, 0.3, 513, 0.3);
  } else if (v === 1) {
    lump(p, 4, 4, 16, 6, STONE, 0.3, 514, 0.3);
    shard(p, 7, 6 - jolt, 3, 6, -1, CRYSTAL);
    shard(p, 12, 6 + jolt, 4, 7, 0, CRYSTAL);
    shard(p, 17, 6 - jolt, 3, 5, 1, CRYSTAL);
  } else {
    const coal = pal('#08080a', '#141418', '#24242a', '#3a3a42', '#55555e');
    lump(p, 4, 3 - jolt, 8, 6, coal, 0.35, 515, 0.3);
    lump(p, 10, 2 + jolt, 8, 7, coal, 0.35, 516, 0.3);
    lump(p, 15, 4 - jolt, 6, 5, coal, 0.35, 517, 0.3);
    // a pick someone left in it
    p.line(8, 6, 4, 0, WOOD.b).line(2, 2, 5, 0, IRON.l).line(5, 0, 7, 1, IRON.b);
  }
  // the box: planks and iron bands, wider at the top
  paint(p, 1, 7, 22, 9, (x, y) => {
    const inset = (y - 7) * 0.25;
    if (x + 0.5 < 1.5 + inset || x + 0.5 > 22.5 - inset) return null;
    if (y === 7) return band.l;
    if (x === 4 || x === 20) return y < 9 ? band.l : band.b;
    return (y - 8) % 3 === 2 ? box.d : y === 8 ? box.l : x < 6 ? box.l : box.b;
  });
  // the face on its front: two eyes and a mouth between the planks
  const eyes = by(v, '#ffc23a', '#6ad8ff', '#ff7a3a');
  for (const x of [12, 16]) p.rect(x, 9, 3, 3, K).rect(x + 1, 9, 2, 2, eyes).px(x + 2, 9, '#ffffff');
  p.rect(11, 13, 8, 1, K).px(12, 13, box.l2).px(14, 13, box.l2).px(16, 13, box.l2).px(18, 13, box.l2);
  // the wheels
  for (const cx of [6, 17]) {
    p.circle(cx + 0.5, 16.5, 3.5, band.d).circle(cx + 0.5, 16.5, 2.5, band.b).circle(cx + 0.5, 16.5, 1, band.l2);
    if (f) p.px(cx - 1, 15, band.l).px(cx + 2, 18, band.l);
    else p.px(cx + 2, 15, band.l).px(cx - 1, 18, band.l);
  }
  if (v === 1) p.rect(1, 1, 1, 6, IRON.b).rect(0, 0, 3, 1, IRON.l).rect(0, 1, 3, 3, GOLD.l).px(1, 2, '#fff6c8');
}

// ---------------------------------------------------------------------------
// Havsormens tempel: a sea horse, an angler fish, a giant turtle
// ---------------------------------------------------------------------------

function sjohast(p: Px, f: number, v = 0): void {
  // a sea horse: a crowned head with a long snout, a round belly, a tail that curls, a little fin that flutters on its back
  const c = by(v, pal('#8a5210', '#c07e1a', '#f0ae2e', '#ffd46a', '#fff2b8'), pal('#0e4a4a', '#16706a', '#2a9c8e', '#5cc8b4', '#a8eede'), pal('#6a2a6a', '#9a4a9a', '#c878c0', '#e8a8dc', '#fcd8f4'));
  const bob = f ? 1 : 0;
  const Y = (y: number): number => y + bob;
  // the back fin
  const fin = shade(c.l2, 0.95);
  p.rect(1, Y(9) + (f ? 0 : 1), 2, 3, fin).px(0, Y(10) + (f ? 0 : 1), fin).px(2, Y(8) + (f ? 0 : 1), c.l);
  tube(p, [[6.5, Y(5.5), 2.6], [5.5, Y(9), 2.6], [6, Y(12.5), 3], [7, Y(16), 1.8], [9, Y(18.6), 1.3], [11, Y(17.6), 1], [10, Y(16), 0.7]], c, 521);
  // belly ridges
  for (const y of [10, 12, 14]) p.rect(7, Y(y), 2, 1, c.l2);
  // the snout and the eye
  p.rect(8, Y(5), 5, 2, c.b).rect(8, Y(5), 5, 1, c.l).px(13, Y(5), c.d).px(13, Y(6), c.d2);
  p.rect(6, Y(3), 3, 3, '#fffaf0').rect(7, Y(4), 2, 2, K).px(7, Y(4), '#ffffff');
  // the crown: three points, a row of spines, or leaves
  if (v === 0) p.px(4, Y(2), c.l).px(4, Y(1), c.l2).px(6, Y(1), c.l).px(6, Y(0), c.l2).px(8, Y(2), c.l).px(8, Y(1), c.l2);
  if (v === 1) for (const [x, y] of [[5, 2], [7, 1], [3, 5], [2, 8], [2, 13], [4, 16]] as const) p.px(x, Y(y), c.d).px(x - (x < 5 ? 1 : 0), Y(y) - 1, c.l2);
  if (v === 2) {
    const leaf = pal('#1e4a26', '#2e6a34', '#46904a', '#6ab464', '#9ad68a');
    for (const [x, y] of [[5, 1], [2, 6], [1, 13], [10, 13]] as const) p.rect(x, Y(y), 2, 2, leaf.b).px(x, Y(y) - 1, leaf.l).px(x + 1, Y(y) + 2, leaf.d);
  }
}

function marulk(p: Px, f: number, v = 0): void {
  // an angler fish that walks on its fins: round, with a huge mouth of crooked teeth, and a little light on a stalk
  const c = by(v, pal('#0c2a36', '#16485a', '#266e82', '#4a98a8', '#84c4cc'), pal('#2a1630', '#462650', '#683e74', '#8c5e98', '#b488bc'), pal('#4a0e12', '#7c1c1e', '#b0342e', '#d85e4a', '#f49a80'));
  const [b, fr] = stride(f, 6, 13, 1);
  p.rect(b, 16, 3, 2, c.d).rect(fr, 16, 3, 2, c.b).rect(b - 1, 18, 5, 1, c.d).rect(fr - 1, 18, 5, 1, c.l);
  // the tail fin, the back spines
  paint(p, 0, 6, 5, 9, (x, y) => (Math.abs(y - 10) > 1 + (4 - x) * 0.8 ? null : (x + y) % 2 ? c.d : c.b));
  for (const [x, h] of [[6, 2], [9, 3], [12, 2]] as const) p.rect(x, 5 - h - (v === 2 ? 1 : 0), 1, h + 1 + (v === 2 ? 1 : 0), c.l).px(x + 1, 5 - h + 1, c.b);
  lump(p, 3, 4, 17, 13, c, 0.15, 531, 0.3);
  if (v === 1) for (const [x, y] of [[6, 8], [8, 12], [10, 7], [5, 12]] as const) p.px(x, y, c.l2);
  if (v === 2) for (const x of [6, 9]) p.rect(x, 6, 1, 8, c.d);
  // a side fin that paddles
  p.rect(8, 11 + (f ? 1 : 0), 3, 2, c.l).px(7, 12 + (f ? 1 : 0), c.l2);
  // the eye, the mouth with its underbite
  p.rect(13, 6, 4, 4, '#fffaf0').rect(15, 7, 2, 2, K).px(15, 7, '#ffffff');
  p.rect(11, 12, 9, 2, '#1a0e16').px(10, 12, '#1a0e16');
  for (const x of [12, 14, 16, 18]) p.px(x, 13, '#fffaf0');
  for (const x of [13, 17]) p.px(x, 12, '#fffaf0');
  p.rect(10, 14, 10, 1, c.l).px(20, 13, c.l);
  // the stalk and its light
  p.line(14, 5, 16, 1, c.b).line(16, 1, 19, 1, c.b).px(20, 2, c.b);
  const lure = by(v, '#ffe27a', '#8af0ff', '#ffb04a');
  if (v === 2) p.rect(19, 3, 3, 4, IRON.b).rect(20, 4, 1, 2, lure).rect(19, 3, 3, 1, IRON.l);
  else if (v === 1) p.px(20, 3, lure).rect(19, 4, 3, 1, lure).px(20, 5, lure).px(20, 4, '#ffffff');
  else p.rect(19, 3, 3, 3, lure).px(19, 3, '#ffffff').px(21, 5, shade(lure, 0.75));
}

function jatteskoldpadda(p: Px, f: number, v = 0): void {
  // a very old turtle: a thick domed shell (with corals, spikes or a bit of the temple on it), a wrinkled head, four stout legs
  const skin = by(v, pal('#1e3a2a', '#2e5a3e', '#468258', '#68a878', '#96cca0'), pal('#22344a', '#34506e', '#4c7094', '#7096b8', '#9cc0da'), pal('#4a3a22', '#6e5834', '#947a4c', '#b89c6c', '#d8c094'));
  const shell = by(v, pal('#1c3020', '#2c4a2c', '#42683c', '#5e8a52', '#84ae72'), pal('#1e2632', '#303c4c', '#485a70', '#687c94', '#90a4ba'), pal('#3a2c1c', '#5a462c', '#7e6440', '#a08658', '#c4aa7a'));
  const [b, fr] = stride(f, 4, 16, 1);
  p.rect(b + 4, 15, 3, 4, skin.d2).rect(fr - 4, 15, 3, 4, skin.d2);
  p.rect(b, 15, 4, 4, skin.d).rect(fr, 15, 4, 4, skin.b).rect(b, 19, 5, 1, skin.b).rect(fr, 19, 5, 1, skin.l);
  p.px(0, 14, skin.b).px(1, 13, skin.b).px(1, 14, skin.d);
  // the head on its neck
  p.rect(19, 10, 4, 4, skin.b).rect(19, 10, 4, 1, skin.l);
  lump(p, 20, 6, 8, 7, skin, 0.1, 541, 0.35);
  eye(p, 24, 8, 2);
  p.rect(24, 11, 4, 1, skin.d2).px(27, 9, skin.d2).px(21, 12, skin.d);
  // the shell: a dome with plates, a pale rim
  lump(p, 1, 5, 20, 13, shell, 0.15, 542, 0.3);
  p.rect(2, 14, 18, 2, shell.d).rect(2, 14, 18, 1, shell.l);
  for (const x of [6, 11, 16]) p.line(x, 8, x - 1, 13, shell.d2);
  p.line(3, 10, 18, 10, shell.d2).px(8, 7, shell.l2).px(13, 7, shell.l2);
  if (v === 0) {
    // corals
    const coral = pal('#8a2a4a', '#c04a6a', '#f07a90', '#ffaab8', '#ffd8e0');
    for (const [x, h] of [[5, 4], [9, 5], [14, 4]] as const) {
      p.rect(x, 7 - h, 1, h, coral.b).px(x - 1, 8 - h, coral.l).px(x + 1, 9 - h, coral.b).px(x - 1, 7 - h, coral.l2).px(x + 1, 8 - h, coral.l);
    }
  }
  if (v === 1) {
    shard(p, 5, 7, 3, 5, -1, shell);
    shard(p, 10, 6, 3, 6, 0, shell);
    shard(p, 15, 7, 3, 5, 1, shell);
  }
  if (v === 2) {
    // a stump of a temple pillar, and seaweed
    p.rect(8, 0, 5, 1, '#e8dcc0').rect(9, 1, 3, 5, '#c8bc9e').rect(9, 1, 1, 5, '#e8dcc0').rect(8, 5, 5, 1, '#a89c80').px(11, 2, '#a89c80');
    for (const [x, len] of [[4, 4], [16, 5]] as const) for (let i = 0; i < len; i++) p.px(x + ((i + f) % 2), 9 - i, i % 2 ? '#2e6a34' : '#46904a');
  }
}

// ---------------------------------------------------------------------------
// Alvernas lund: a flower that spits, a giant moth, a stump that walks
// ---------------------------------------------------------------------------

const LEAF = pal('#1e4a1e', '#2e6e2a', '#48963a', '#6ebc52', '#a0de7c');

function spottblomma(p: Px, f: number, v = 0): void {
  // a flower that pulled up its roots: a big head of petals round a face, a thin stem, two leaves for arms, roots for feet
  const petal = by(v, pal('#8a2a5a', '#c04a84', '#f07ab0', '#ffaad0', '#ffdcee'), pal('#2a3a8a', '#4460c0', '#6a8cf0', '#9cb8ff', '#d4e2ff'), pal('#8a3a08', '#c8640e', '#f8961e', '#ffc24a', '#ffe89a'));
  const [b, fr] = stride(f, 4, 10, 1);
  p.line(7, 18, b, 21, WOOD.b).line(8, 18, fr, 21, WOOD.l).px(b - 1, 21, WOOD.b).px(fr + 1, 21, WOOD.l).px(7, 20, WOOD.d);
  // the stem and the leaf arms
  p.rect(7, 10, 2, 9, LEAF.b).rect(7, 10, 1, 9, LEAF.l);
  const up = f ? 1 : 0;
  p.tpl(1, 12 + up, ['.###..', '######', '..###.'], { '#': LEAF.b }).rect(2, 12 + up, 3, 1, LEAF.l2);
  p.tpl(9, 11 - up, ['..###.', '######', '.###..'], { '#': LEAF.d }).rect(11, 11 - up, 3, 1, LEAF.l);
  // the head
  const cx = 8.5;
  const cy = 5.5;
  if (v === 1) {
    // a bell of three petals, closed round the face
    paint(p, 2, 0, 13, 12, (x, y) => {
      const u = (x + 0.5 - cx) / 6;
      const top = 1.5 + Math.abs(Math.sin(u * 4.6)) * 2.5;
      if (y < top || Math.abs(u) > 1 || y > 10.5 - u * u * 3) return null;
      return u < -0.45 ? petal.l : u > 0.55 ? petal.d : y < 4 ? petal.l2 : petal.b;
    });
  } else {
    const n = v === 2 ? 5 : 4;
    paint(p, 0, 0, 17, 12, (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const reach = v === 2 ? 3.4 + 3.4 * Math.max(0, Math.cos(a * n)) ** 3 : 4.4 + 1.9 * Math.abs(Math.cos(a * n));
      if (d > reach) return null;
      return dx + dy < -3 ? petal.l2 : dx + dy > 3 ? petal.d : (Math.floor((a + Math.PI) * n * 0.64) % 2 ? petal.b : petal.l);
    });
  }
  // the face in the middle
  const face = by(v, pal('#8a5a10', '#c08a1a', '#f0c030', '#ffe27a', '#fff6c8'), pal('#3a2a6a', '#5a48a0', '#8a78d0', '#b8a8f0', '#e4dcff'), pal('#2e1a0c', '#4e3018', '#74502c', '#987448', '#bc9a6a'));
  lump(p, 5, 2, 7, 7, face, 0.1, 551, 0.4);
  p.rect(7, 4, 1, 2, K).rect(10, 4, 1, 2, K).rect(9, 7, 2, 2, K).px(9, 7, '#5a2a3a');
}

function nattfjaril(p: Px, f: number, v = 0): void {
  // a big moth seen from behind as it flutters: a furry body, feathery feelers, four wings with an eye on each upper one
  const wing = by(v, pal('#3e2a1a', '#644830', '#8e6c48', '#b89468', '#dcc094'), pal('#3a6a4a', '#5a9a68', '#86c88c', '#b4e8b0', '#e0fbd8'), pal('#10143a', '#1c2460', '#2e3a8e', '#4c5cc0', '#7c8cea'));
  const fuzz = by(v, pal('#4a3a2a', '#6e5a44', '#968064', '#bca888', '#e0d0b4'), pal('#8a8468', '#b4ae8c', '#dcd6b4', '#f2eed4', '#ffffff'), pal('#1a1a2a', '#2c2c46', '#444468', '#62628c', '#8a8ab4'));
  const spot = by<[string, string]>(v, ['#1e1a22', '#ffd23a'], ['#6a2a5a', '#ffb0d8'], ['#fff3b0', '#ffffff']);
  // the wings: wide open, or half closed (the beat)
  const reach = f ? 7.2 : 10;
  const cx = 11;
  paint(p, 0, 2, 22, 16, (x, y) => {
    const dx = Math.abs(x + 0.5 - cx);
    if (dx > reach) return null;
    const u = dx / reach;
    // the upper pair: from the shoulders up and out to a round tip; the lower pair: smaller, down and out
    const upTop = 8 - u * 5.5 + Math.max(0, u - 0.75) * 14;
    const upBottom = 10 + u * 1.5 - Math.max(0, u - 0.8) * 10;
    const lowBottom = 15 - Math.abs(u - 0.45) * 7 + (v === 1 && u > 0.35 && u < 0.6 ? 3 : 0);
    const upper = y >= upTop && y <= upBottom;
    const lower = y > upBottom && y <= lowBottom && u < 0.8;
    if (!upper && !lower) return null;
    const left = x + 0.5 < cx;
    if (upper && (y - upTop < 1 || u > 0.9)) return wing.d;
    if (lower) return (x + y) % 3 === 0 ? wing.d : left ? wing.b : wing.d;
    return y - upTop < 2.2 ? (left ? wing.l2 : wing.l) : (x + y) % 4 === 0 ? wing.d : left ? wing.l : wing.b;
  });
  // the eye on each upper wing
  for (const sx of [-1, 1]) {
    const ex = Math.round(cx + sx * reach * 0.58) - 1;
    p.rect(ex, 6, 3, 3, spot[0]).px(ex + 1, 7, spot[1]).px(ex + 1, 6, spot[1]);
    if (v === 2) p.px(ex, 6, wing.b).px(ex + 2, 8, wing.b).px(ex + 2, 6, wing.b);
  }
  // the body and the head, big eyes, the feelers
  lump(p, 9, 7, 4, 10, fuzz, 0.3, 561, 0.3);
  lump(p, 8, 3, 6, 6, fuzz, 0.2, 562, 0.4);
  p.rect(9, 5, 2, 2, K).px(9, 5, '#ffffff').rect(12, 5, 2, 2, K).px(12, 5, '#ffffff');
  p.line(9, 3, 6, 0, fuzz.b).line(12, 3, 15, 0, fuzz.l);
  if (v !== 0) for (const [x, y] of [[6, 1], [8, 1], [5, 0], [14, 1], [16, 1], [16, 0]] as const) p.px(x, y, fuzz.l2);
  else p.px(5, 0, fuzz.l2).px(16, 0, fuzz.l2);
}

function stubbgubbe(p: Px, f: number, v = 0): void {
  // an old tree stump that got tired of standing still: roots for legs, a face in the bark, branches for arms
  const bark = by(v, pal('#22160e', '#3c2818', '#5c4028', '#7e5c3c', '#a07c56'), pal('#1e1a12', '#342e20', '#504832', '#6e6648', '#8e8662'), pal('#8a8a84', '#b4b4ac', '#dcdcd4', '#f0f0ea', '#ffffff'));
  const cut = pal('#7a5a34', '#a47e4e', '#cca870', '#e8cc98', '#f8e8c4');
  const [b, fr] = stride(f, 4, 12, 1);
  for (const [x, c] of [[b, bark.d], [fr, bark.b]] as const) p.rect(x, 19, 4, 3, c).rect(x - 1, 22, 7, 2, c).px(x - 2, 23, c).px(x + 6, 23, c);
  // the far arm: a twig with a leaf
  p.line(4, 13, 0, 10 + (f ? 1 : 0), bark.d).rect(0, 8 + (f ? 1 : 0), 2, 2, LEAF.b).px(0, 8 + (f ? 1 : 0), LEAF.l2);
  // the trunk and its cut top
  paint(p, 3, 5, 15, 16, (x, y) => {
    const u = (x + 0.5 - 10.5) / 7.2;
    if (Math.abs(u) > 1 || y < 6) return null;
    if (v === 2) return (x * 7 + y * 3) % 13 < 2 && y % 3 === 0 ? '#2a2a2e' : u < -0.5 ? bark.l2 : u > 0.55 ? bark.d : bark.b;
    return (x * 3 + (y >> 2)) % 4 === 0 ? bark.d : u < -0.5 ? bark.l : u > 0.55 ? bark.d : bark.b;
  });
  paint(p, 3, 3, 15, 6, (x, y) => {
    const dx = (x + 0.5 - 10.5) / 7.2;
    const dy = (y + 0.5 - 6) / 2.6;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    return d > 0.7 ? cut.b : d > 0.42 && d < 0.56 ? cut.d : d < 0.08 ? cut.d : dx + dy < -0.3 ? cut.l2 : cut.l;
  });
  // the face: hollow eyes with a light in each, a knot for a nose, a crooked mouth
  p.rect(9, 11, 3, 3, K).px(10, 11, '#ffe27a').px(11, 12, '#fff6c8').rect(14, 11, 3, 3, K).px(15, 11, '#ffe27a').px(16, 12, '#fff6c8');
  lump(p, 15, 14, 4, 3, bark, 0.1, 571, 0.5);
  p.rect(9, 17, 6, 1, K).px(8, 16, K).px(15, 16, K).px(11, 17, cut.l);
  // the near arm: a branch
  p.line(17, 13, 21, 9 - (f ? 1 : 0), bark.b).line(17, 14, 21, 10 - (f ? 1 : 0), bark.d).px(20, 8 - (f ? 1 : 0), bark.l).px(21, 7 - (f ? 1 : 0), bark.l);
  if (v === 0) {
    // a shoot with two leaves
    p.rect(10, 1, 1, 4, LEAF.d).tpl(7, 0, ['.##.', '####'], { '#': LEAF.b }).px(8, 0, LEAF.l2).tpl(11, 1, ['.##', '###'], { '#': LEAF.l }).px(21, 6 - (f ? 1 : 0), LEAF.b);
  }
  if (v === 1) {
    // a bird's nest with two eggs, and mushrooms on its side
    p.rect(7, 2, 8, 3, '#6a4a20').rect(7, 2, 8, 1, '#a07a30').px(6, 2, '#a07a30').px(15, 2, '#6a4a20');
    p.rect(9, 0, 2, 2, '#d8f0f4').rect(12, 0, 2, 2, '#bfe1f5').px(9, 0, '#ffffff');
    for (const [x, y] of [[3, 13], [4, 17]] as const) p.rect(x, y, 3, 1, '#d0342a').px(x + 1, y - 1, '#f0604a').px(x + 1, y + 1, '#f4ecd8');
  }
  if (v === 2) {
    // an axe someone left in it
    p.line(12, 4, 17, 0, WOOD.b).rect(9, 2, 4, 3, IRON.b).rect(9, 2, 4, 1, IRON.l2).px(9, 4, '#e4e8ee');
  }
}

// ---------------------------------------------------------------------------
// Fenrisklyftan: a mountain ram, a warrior in a wolf's pelt, an aurochs
// ---------------------------------------------------------------------------

const HORN = pal('#4a3a26', '#74603e', '#a08a5c', '#c8b482', '#e8dab0');

function fjallbagge(p: Px, f: number, v = 0): void {
  // a mountain ram: a cloud of wool on four thin legs, a dark face held low to butt, and horns (curled, long or huge)
  const wool = by(v, pal('#8a8272', '#b4ac98', '#dcd6c4', '#f2eee2', '#ffffff'), pal('#4a4e56', '#6c727c', '#949ba6', '#bcc2cc', '#e0e4ea'), pal('#1e1610', '#36281c', '#54402c', '#745a40', '#967a5a'));
  const face = pal('#161214', '#2a2426', '#443a3a', '#605454', '#807272');
  const [b, fr] = stride(f, 3, 12, 1);
  p.rect(b + 3, 11, 2, 5, face.d2).rect(fr - 3, 11, 2, 5, face.d2);
  p.rect(b, 11, 2, 5, face.d).rect(fr, 11, 2, 5, face.b).px(b, 16, K).px(b + 1, 16, K).px(fr, 16, K).px(fr + 1, 16, K);
  p.px(0, 7, wool.b).px(0, 8, wool.d);
  // the wool: a big lump with curls along its top and belly
  lump(p, 1, 3, 15, 10, wool, 0.35, 581, 0.3);
  for (const x of [2, 5, 8, 11]) p.rect(x, 3, 2, 1, wool.l2).px(x + 2, 12, wool.d);
  // the head, low
  lump(p, 14, 5, 6, 8, face, 0.1, 582, 0.35);
  p.rect(18, 10, 3, 3, face.b).rect(18, 10, 3, 1, face.l).px(20, 11, K).px(19, 13, face.d2);
  p.rect(16, 8, 2, 2, '#ffd23a').px(17, 8, K).px(16, 8, '#fff0a0');
  if (v === 1) p.rect(18, 13, 2, 3, wool.l).px(19, 15, wool.b);
  if (v === 2) p.px(15, 13, GOLD.l).px(15, 14, GOLD.b).rect(14, 12, 3, 1, '#c83a3a');
  // the horns
  if (v === 1) {
    // long ones swept back
    for (const [dy, c] of [[0, HORN.b], [1, HORN.d]] as const) p.line(17, 5 + dy, 12, 1 + dy, c).line(12, 1 + dy, 6, 0 + dy, c);
    p.px(5, 0, HORN.l2).px(17, 4, HORN.d2).px(9, 0, HORN.l).px(14, 2, HORN.l);
  } else {
    const r = v === 2 ? 4.6 : 3.6;
    const hx = 14.5;
    const hy = v === 2 ? 5 : 5.5;
    paint(p, hx - r - 1, hy - r - 1, r * 2 + 3, r * 2 + 3, (x, y) => {
      const dx = x + 0.5 - hx;
      const dy = y + 0.5 - hy;
      const d = Math.hypot(dx, dy);
      if (d > r || d < r - 2.1) return null;
      // open towards the muzzle: the tip of the curl
      if (dx > 0.5 && dy > 0 && dy < 2.2) return null;
      const ridge = Math.floor((Math.atan2(dy, dx) + Math.PI) * 2.6) % 2;
      return v === 2 && dx > 1 && dy < -1 ? '#e4f6ff' : ridge ? HORN.d : dx + dy < 0 ? HORN.l : HORN.b;
    });
  }
}

function ulvhedin(p: Px, f: number, v = 0): void {
  // an ulvhedin: a warrior who wears a wolf's pelt, its head for a hood and its fur down his back; a beard, a big weapon
  const pelt = by(v, pal('#2a2c34', '#464a56', '#6a707e', '#9298a6', '#c0c6d2'), pal('#8e98a8', '#b4bcc8', '#d8dee6', '#eef2f6', '#ffffff'), pal('#120e0c', '#241c18', '#3c302a', '#584840', '#766458'));
  const skin = pal('#6a4630', '#946646', '#be8a64', '#dcae88', '#f4d0b0');
  const hair = by(v, pal('#3a2410', '#5e3c1c', '#86582c', '#ae7c46', '#d0a468'), pal('#5a2a0c', '#8a4414', '#b8641e', '#de8c3a', '#f8b868'), pal('#141012', '#28201e', '#40342e', '#5c4c42', '#7a685a'));
  const [b, fr] = stride(f, 6, 11, 1);
  p.rect(b, 18, 3, 4, LEATHER.d).rect(fr, 18, 3, 4, LEATHER.b).rect(b - 1, 22, 5, 3, pelt.d).rect(fr - 1, 22, 5, 3, pelt.b).rect(fr - 1, 22, 5, 1, pelt.l);
  // the pelt down his back, ragged at the hem
  paint(p, 2, 6, 8, 15, (x, y) => (x < 3 + (y > 14 ? 0 : (14 - y) * 0.12) || (y === 20 && x % 2 === 0) ? null : (x * 3 + y) % 5 === 0 ? pelt.d : x < 5 ? pelt.l : pelt.b));
  // the body: a leather tunic, a belt, a bare arm
  lump(p, 5, 9, 11, 11, LEATHER, 0.15, 591, 0.3);
  p.rect(5, 16, 11, 1, K).px(11, 16, GOLD.b);
  lump(p, 13, 11, 5, 7, skin, 0.1, 593, 0.3);
  p.line(16, 13, 18, 15, skin.b);
  // his face under the wolf's jaw: an eye, a nose, the beard
  lump(p, 8, 5, 8, 7, skin, 0.1, 594, 0.35);
  p.rect(12, 7, 2, 2, K).px(13, 7, '#ffffff').px(15, 9, skin.d);
  if (v === 2) p.rect(10, 7, 2, 1, '#3a6ad8').rect(12, 9, 3, 1, '#3a6ad8');
  paint(p, 8, 10, 8, 5, (x, y) => (Math.abs(x + 0.5 - 12.5) > 3.8 - (y - 10) * 0.7 ? null : (x + y) % 3 === 0 ? hair.d : hair.b));
  p.rect(12, 10, 3, 1, hair.d2);
  // the wolf's head on top: ears, a closed eye, the snout out over his brow with two fangs
  lump(p, 5, 1, 11, 6, pelt, 0.25, 595, 0.35);
  p.rect(6, 0, 2, 2, pelt.b).px(6, 0, pelt.l).rect(10, 0, 2, 2, pelt.l).px(11, 0, pelt.l2);
  p.rect(13, 3, 5, 3, pelt.l).rect(13, 5, 5, 1, pelt.b).px(17, 3, K).rect(10, 3, 2, 1, K);
  p.px(14, 6, '#fffaf0').px(16, 6, '#fffaf0');
  // the weapon, upright in the near hand: a two-edged axe, a great club, a spear
  if (v === 0) {
    p.rect(20, 2, 1, 21, WOOD.b).px(20, 2, WOOD.l);
    paint(p, 17, 2, 7, 9, (x, y) => {
      const dx = Math.abs(x - 20);
      const dy = Math.abs(y - 6);
      if (dx === 0 || dx > 3 || dy > 1.5 + dx * 0.9) return null;
      return dx === 3 ? '#e4e8ee' : y < 6 ? IRON.l : IRON.b;
    });
  } else if (v === 1) {
    p.rect(19, 9, 2, 14, WOOD.b).rect(19, 9, 1, 14, WOOD.l);
    lump(p, 17, 1, 7, 9, WOOD, 0.25, 592, 0.3);
    for (const [x, y] of [[17, 3], [23, 4], [18, 8], [21, 1], [23, 8]] as const) p.px(x, y, BONE.l2);
  } else {
    p.rect(20, 3, 1, 21, WOOD.b).px(20, 9, WOOD.l);
    p.rect(19, 2, 3, 4, IRON.b).px(20, 0, '#e4e8ee').px(20, 1, IRON.l2).rect(19, 2, 1, 3, IRON.l).rect(19, 6, 3, 1, '#c83a3a');
  }
  p.rect(18, 14, 4, 3, skin.l).px(18, 14, skin.l2);
}

function uroxe(p: Px, f: number, v = 0): void {
  // an aurochs: a mountain of an ox with a hump over its shoulders, a shaggy chest, a head held low and long horns
  const fur = by(v, pal('#1e140e', '#38261a', '#56402c', '#785c42', '#9a7c5e'), pal('#08080a', '#16161a', '#28282e', '#40404a', '#5c5c68'), pal('#5e6a7a', '#8490a0', '#aeb8c6', '#d4dce6', '#f4f8fc'));
  const [b, fr] = stride(f, 4, 18, 2);
  for (const [x, c] of [[b + 4, fur.d2], [fr - 4, fur.d2], [b, fr === 18 ? fur.d : fur.d], [fr, fur.b]] as const) p.rect(x, 14, 3, 7, c).rect(x, 20, 4, 2, K);
  // the tail
  p.line(2, 6, 0, 11, fur.d).rect(0, 11, 1, 3, fur.b);
  // the body and the hump
  lump(p, 1, 4, 21, 12, fur, 0.2, 601, 0.3);
  lump(p, 12, 1, 12, 12, fur, 0.25, 602, 0.3);
  // frost on its back
  const frostN = v === 2 ? 14 : 6;
  for (let i = 0; i < frostN; i++) p.px(4 + ((i * 7) % 17), ((i * 7) % 17 > 9 ? 2 : 4) + (i % (v === 2 ? 3 : 2)), '#f4f8fc');
  if (v === 1) p.rect(4, 5, 12, 1, '#c8b89a').rect(13, 3, 6, 1, '#c8b89a');
  // the shaggy chest
  paint(p, 15, 12, 8, 6, (x, y) => (y > 14 + ((x * 3) % 3) ? null : (x + y) % 2 ? fur.d : fur.d2));
  // the head, low: a broad brow, a pale muzzle, a calm eye
  const face = pal(fur.d2, fur.d, fur.b, fur.l, fur.l2);
  lump(p, 20, 7, 9, 9, face, 0.1, 603, 0.35);
  lump(p, 25, 12, 5, 5, pal('#5a4a3e', '#84705e', '#b09a84', '#d4c0aa', '#f0e2d0'), 0.1, 604, 0.45);
  p.px(28, 14, K).px(27, 16, '#5a4a3e');
  eye(p, 24, 10, 2);
  if (v === 2) p.rect(27, 16, 2, 2, GOLD.l).px(28, 17, GOLD.d);
  // the horns: long and forward, a lyre standing up, or one broken off
  if (v === 0) {
    for (const [dy, c] of [[0, HORN.l2], [1, HORN.b]] as const) p.line(22, 7 + dy, 25, 3 + dy, c).line(25, 3 + dy, 29, 2 + dy, c);
    p.px(29, 1, '#ffffff').line(20, 7, 21, 4, HORN.d).px(22, 3, HORN.b);
  } else if (v === 1) {
    for (const [dx, c] of [[0, HORN.l2], [1, HORN.b]] as const) p.line(21 + dx, 7, 19 + dx, 3, c).line(19 + dx, 3, 21 + dx, 0, c).line(25 + dx, 7, 27 + dx, 3, c).line(27 + dx, 3, 25 + dx, 0, c);
  } else {
    for (const [dy, c] of [[0, HORN.l2], [1, HORN.b]] as const) p.line(22, 7 + dy, 26, 4 + dy, c).line(26, 4 + dy, 28, 6 + dy, c);
    p.rect(19, 5, 3, 2, HORN.b).px(19, 5, HORN.l2).px(21, 4, HORN.d);
  }
}

// ---------------------------------------------------------------------------
// The table: sizes, where a hat sits, the outlines, what comes after the outline
// ---------------------------------------------------------------------------

const SIZE: Record<string, { w: number; h: number }> = {
  fladdermoss: { w: 22, h: 18 },
  gravljus: { w: 14, h: 20 },
  rostdraug: { w: 20, h: 24 },
  snouggla: { w: 20, h: 18 },
  jatteunge: { w: 18, h: 22 },
  snogubbe: { w: 22, h: 29 },
  eldsalamander: { w: 22, h: 12 },
  sotnisse: { w: 16, h: 20 },
  lavasnigel: { w: 26, h: 22 },
  ljusskalle: { w: 17, h: 23 },
  benkatt: { w: 24, h: 16 },
  kistgast: { w: 20, h: 24 },
  gruvmullvad: { w: 21, h: 13 },
  svartalf: { w: 18, h: 20 },
  malmvagn: { w: 24, h: 20 },
  sjohast: { w: 14, h: 22 },
  marulk: { w: 22, h: 19 },
  jatteskoldpadda: { w: 28, h: 20 },
  spottblomma: { w: 17, h: 22 },
  nattfjaril: { w: 22, h: 18 },
  stubbgubbe: { w: 22, h: 24 },
  fjallbagge: { w: 22, h: 17 },
  ulvhedin: { w: 24, h: 25 },
  uroxe: { w: 30, h: 22 },
};

const DRAW: Record<string, Draw> = {
  fladdermoss,
  gravljus,
  rostdraug,
  snouggla,
  jatteunge,
  snogubbe,
  eldsalamander,
  sotnisse,
  lavasnigel,
  ljusskalle,
  benkatt,
  kistgast,
  gruvmullvad,
  svartalf,
  malmvagn,
  sjohast,
  marulk,
  jatteskoldpadda,
  spottblomma,
  nattfjaril,
  stubbgubbe,
  fjallbagge,
  ulvhedin,
  uroxe,
};

const AFTER: Record<string, Draw> = {
  gravljus: (p, f, v = 0) => {
    halo(p, 7, 9, 8, by(v, '#6af0a0', '#6ac0ff', '#c89aff'), 0.22);
    twinkle(p, f ? 2 : 11, f ? 3 : 2, '#e8fff0');
  },
  eldsalamander: (p, f, v = 0) => {
    if (v === 2) return void halo(p, 11, 7, 9, '#ff9a3a', 0.16);
    for (const [x, h] of [[6, 3], [9, 4], [12, 3]] as const) flame(p, x, 5, 3, h + (f ? 1 : 0), f ? -1 : 0.5, '#e04a14', '#ff9a2a', '#fff0a0');
    flame(p, 1, f ? 6 : 4, 2, 3, -0.5, '#e04a14', '#ff9a2a', '#fff0a0');
  },
  sotnisse: (p, f, v = 0) => halo(p, by(v, 15, 14, 15), by(v, 4, 4, 1), 5, '#ff9a3a', f ? 0.3 : 0.22),
  lavasnigel: (p, f, v = 0) => {
    halo(p, 12, 19, 12, '#ff7a2a', 0.14);
    if (v === 2) flame(p, 10, 3, 4, f ? 4 : 3, f ? 1 : -1, '#e04a14', '#ff9a2a', '#fff0a0');
  },
  ljusskalle: (p, f, v = 0) => {
    const top = 7 + (f ? 1 : 0);
    const cols = by<[string, string, string]>(v, ['#3ac84a', '#9cff8a', '#f0fff0'], ['#2a7ad8', '#6ac8ff', '#f0faff'], ['#8a4ad8', '#c8a0ff', '#f8f0ff']);
    const at: [number, number][] = v === 2 ? [[5, 1], [9, 3], [12, 2]] : [[9, 3]];
    for (const [x, h] of at) flame(p, x, top - h - 1, 3, f ? 4 : 3, f ? 0.8 : -0.8, ...cols);
    halo(p, 9, top - 4, 6, cols[1], 0.2);
  },
  gruvmullvad: (p, f, v = 0) => {
    if (v === 0) halo(p, 19, 2, 4, '#fff0a0', f ? 0.35 : 0.25);
    if (v === 1) flame(p, 14, 0, 2, 3, f ? 0.5 : -0.5, '#e04a14', '#ff9a2a', '#fff0a0');
  },
  malmvagn: (p, f, v = 0) => {
    if (v === 1) halo(p, 1, 2, 4, '#ffe27a', f ? 0.35 : 0.25);
  },
  marulk: (p, f, v = 0) => halo(p, 20, 4, 5, by(v, '#ffe27a', '#8af0ff', '#ffb04a'), f ? 0.4 : 0.28),
};

const HAT: Record<string, [number, number]> = {
  fladdermoss: [17, 5],
  gravljus: [7, 2],
  rostdraug: [12, 0],
  snouggla: [14, 3],
  jatteunge: [7, 2],
  snogubbe: [11, 1],
  eldsalamander: [17, 2],
  sotnisse: [7, 2],
  lavasnigel: [22, 8],
  ljusskalle: [8, 4],
  benkatt: [18, 2],
  kistgast: [10, 0],
  gruvmullvad: [15, 2],
  svartalf: [8, 0],
  malmvagn: [12, 1],
  sjohast: [7, 2],
  marulk: [11, 3],
  jatteskoldpadda: [24, 5],
  spottblomma: [8, 0],
  nattfjaril: [11, 3],
  stubbgubbe: [10, 3],
  fjallbagge: [16, 4],
  ulvhedin: [10, 0],
  uroxe: [24, 6],
};
const OUTLINES: Record<string, string> = { gravljus: '#1e4a4a', snogubbe: '#3a5a7a', snouggla: '#3a4a5e' };

Object.assign(SAGA_DRAW, DRAW);
Object.assign(SAGA_ANIMAL_SIZE, SIZE);
Object.assign(SAGA_AFTER, AFTER);
Object.assign(SAGA_HAT_POS, HAT);
Object.assign(SAGA_OUTLINE, OUTLINES);

/** The species drawn in this file (the dungeons' newcomers). */
export const SAGA2_SPECIES: readonly string[] = Object.keys(DRAW);

// Every ordinary monster, old and new: its draw function gets the skin, and an illusion (an odd variant) is made pale and
// see-through after the outline.
const ILLUSION_TINT = '#bfe0ff';
for (const s of Object.keys(MOB_ARCHETYPE)) {
  const draw = SAGA_DRAW[s];
  const after = SAGA_AFTER[s];
  if (!draw) continue;
  SAGA_DRAW[s] = (p, f, v) => draw(p, f, mobSkinOf(v));
  SAGA_AFTER[s] = (p, f, v) => {
    after?.(p, f, mobSkinOf(v));
    if (isIllusion(v)) ghostify(p, ILLUSION_TINT);
  };
  SAGA_VARIANTS[s] = MOB_SKINS * 2;
}
