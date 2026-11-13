// Role gear: what a monster with a pack role carries, drawn as a small sprite on top of any monster's sprite at one of its
// anchors. The roles' rules are not here (they are a tag on a species in the fight sim); this is only the art, for whoever draws
// a role-tagged monster:
//
//   const g = roleGear('skytt', a.species, frame);        // { px, x, y }: a small outlined sprite and where its top-left goes,
//   sheet.blit(g.px, g.x, g.y)                            //   in the monster's own sprite pixels (x or y may be a little outside)
//   drawRoleGear(ctx, 'skytt', a.species, frame, ox, oy)  // or: straight onto a 2D context whose (ox, oy) is the sprite's top-left
//
//   Besvärjare (`besvarjare`, the healer to interrupt): a leafy green staff with a glowing rune in the hand, or, on a beast with
//     no hands, a crown of leaves with the rune over its head.
//   Skytt (`skytt`, the archer): a bow with a red-feathered arrow in the hand, or a quiver of red-feathered arrows on the back.
//   Sköldbärare (`skoldbarare`, the shield-bearer): a big round blue shield in front.
//
// `ROLE_ANCHOR` has the anchors of every dungeon monster; a species without an entry gets `roleAnchor`'s default from its sprite
// size, so a new monster works before anyone has placed its gear by hand.
import { Px } from './px.js';
import { IRON, SAGA_ANIMAL_SIZE, SAGA_HAT_POS, WOOD } from './sagaanimals.ts';
import { roundShield } from './sagamobs2.ts';
import { OUTLINE } from './world.js';

export type RoleGear = 'besvarjare' | 'skytt' | 'skoldbarare';
export const ROLE_GEARS: readonly RoleGear[] = ['besvarjare', 'skytt', 'skoldbarare'];

/** Where gear goes on a monster's sprite (pixels from its top-left, facing right). */
export interface RoleAnchor {
  /** The middle of the top of the head (a crown sits on it). */
  head: [number, number];
  /** The middle of what it holds in front of itself (a shield's centre). */
  front: [number, number];
  /** The middle of its back (a quiver's centre). */
  back: [number, number];
  /** The hand that can hold a staff or a bow; left out for a beast, which wears the crown or the quiver instead. */
  hand?: [number, number];
}

const A = (front: [number, number], back: [number, number], hand?: [number, number]): Omit<RoleAnchor, 'head'> => ({ front, back, ...(hand ? { hand } : {}) });

/** Front, back and hand for the dungeons' monsters (the head is where the Christmas hat sits: `SAGA_HAT_POS`). */
const PLACED: Record<string, Omit<RoleAnchor, 'head'>> = {
  // Draugkryptan
  skelett: A([13, 14], [3, 9], [16, 10]),
  draugbage: A([13, 14], [4, 8], [16, 12]),
  gravrotta: A([16, 8], [7, 3]),
  fladdermoss: A([17, 11], [8, 6]),
  gravljus: A([8, 11], [3, 10], [12, 10]),
  rostdraug: A([14, 15], [4, 10], [17, 12]),
  // Frostjättens borg
  isvarg: A([18, 9], [8, 5]),
  isande: A([10, 12], [3, 11], [14, 11]),
  frosttroll: A([15, 16], [3, 12], [17, 15]),
  snouggla: A([14, 12], [6, 9]),
  jatteunge: A([10, 14], [3, 12], [14, 13]),
  snogubbe: A([12, 20], [4, 14], [18, 15]),
  // Surts smedja
  eldimp: A([9, 11], [3, 8], [12, 10]),
  eldhund: A([18, 9], [8, 6]),
  lavagolem: A([14, 15], [3, 12], [21, 17]),
  eldsalamander: A([18, 7], [9, 6]),
  sotnisse: A([9, 13], [2, 11], [11, 13]),
  lavasnigel: A([22, 14], [10, 9]),
  // Helheim
  helhund: A([19, 13], [9, 10]),
  benspindel: A([20, 10], [10, 6]),
  gengangare: A([11, 14], [3, 12], [15, 13]),
  benkatt: A([18, 9], [9, 7]),
  ljusskalle: A([9, 15], [3, 12]),
  kistgast: A([11, 15], [4, 10], [16, 12]),
  // Svartalfheims gruvor
  guldbagge: A([12, 7], [6, 4]),
  gruvtroll: A([15, 16], [3, 12], [17, 15]),
  stengolem: A([14, 16], [3, 13], [21, 18]),
  gruvmullvad: A([15, 8], [7, 5]),
  svartalf: A([10, 13], [2, 10], [14, 12]),
  malmvagn: A([15, 11], [3, 9]),
  // Havsormens tempel
  manet: A([9, 8], [3, 6]),
  sjodraug: A([13, 15], [5, 10], [16, 13]),
  jattekrabba: A([15, 9], [6, 7]),
  sjohast: A([8, 12], [3, 10]),
  marulk: A([14, 11], [5, 9]),
  jatteskoldpadda: A([23, 11], [10, 8]),
  // Alvernas lund
  jattespindel: A([20, 10], [10, 6]),
  skuggalv: A([12, 14], [5, 10], [16, 12]),
  svampvakt: A([12, 18], [4, 17], [17, 16]),
  nattfjaril: A([11, 12], [4, 9]),
  spottblomma: A([8, 14], [3, 13], [13, 12]),
  stubbgubbe: A([12, 14], [4, 12], [20, 10]),
  // Fenrisklyftan
  ulv: A([21, 10], [10, 7]),
  rimtroll: A([17, 17], [5, 12], [20, 18]),
  bergsjatte: A([17, 20], [4, 16], [24, 14]),
  fjallbagge: A([17, 10], [7, 6]),
  ulvhedin: A([12, 15], [4, 11], [20, 15]),
  uroxe: A([24, 13], [10, 6]),
};

const sizeOf = (species: string): { w: number; h: number } => SAGA_ANIMAL_SIZE[species] ?? { w: 16, h: 16 };

/** A species' anchors: the placed ones, or (for a species nobody has placed) a guess from the sprite's size: no hand, so it wears the crown or the quiver. */
export function roleAnchor(species: string): RoleAnchor {
  const { w, h } = sizeOf(species);
  const placed = PLACED[species];
  const head: [number, number] = SAGA_HAT_POS[species] ?? [Math.round(w * 0.65), 0];
  return placed ? { head, ...placed } : { head, front: [Math.round(w * 0.7), Math.round(h * 0.6)], back: [Math.round(w * 0.3), Math.round(h * 0.4)] };
}

/** The anchors of every dungeon monster, by species (the table `roleAnchor` reads, with the heads filled in). */
export const ROLE_ANCHOR: Record<string, RoleAnchor> = Object.fromEntries(Object.keys(PLACED).map((s) => [s, roleAnchor(s)]));

const RUNE = '#b8ffb0';
const LEAF = ['#2e6e2a', '#48963a', '#6ebc52', '#a0de7c'] as const;

/** The pieces, each on its own small canvas with the point that goes on the anchor. */
const PIECES: Record<string, { w: number; h: number; at: [number, number]; draw: (p: Px, f: number) => void }> = {
  // a staff of green wood with leaves at its top round a rune that glows (held a third of the way down)
  staff: {
    w: 7,
    h: 17,
    at: [3, 11],
    draw: (p, f) => {
      p.rect(3, 5, 1, 11, '#5a7a30').rect(3, 5, 1, 5, '#7a9a44').px(3, 15, '#3e5a20');
      p.rect(1, 2, 5, 3, LEAF[1]).px(0, 3, LEAF[0]).px(6, 3, LEAF[0]).px(1, 1, LEAF[2]).px(5, 1, LEAF[2]).px(1, 5, LEAF[0]).px(5, 5, LEAF[0]).px(2, 2, LEAF[3]);
      p.rect(2, 2 - f, 3, 3, RUNE).px(3, 3 - f, '#ffffff').px(3, 0, f ? RUNE : '#ffffff');
    },
  },
  // a crown of leaves, the rune floating over it
  crown: {
    w: 9,
    h: 7,
    at: [4, 6],
    draw: (p, f) => {
      p.rect(1, 5, 7, 1, LEAF[1]).rect(1, 4, 7, 1, LEAF[2]);
      for (const x of [0, 2, 6, 8]) p.px(x, 4, LEAF[0]).px(x, 3, LEAF[2]);
      p.px(1, 3, LEAF[3]).px(7, 3, LEAF[1]);
      p.rect(3, 1 - f + 1, 3, 3, RUNE).px(4, 2 - f + 1, '#ffffff').px(4, 0, f ? '#ffffff' : RUNE);
    },
  },
  // a bow, strung, with a red-feathered arrow on it (held at its middle)
  bow: {
    w: 7,
    h: 13,
    at: [4, 6],
    draw: (p) => {
      p.line(3, 0, 5, 3, WOOD.l).line(5, 3, 5, 9, WOOD.b).line(5, 9, 3, 12, WOOD.l);
      p.line(3, 0, 2, 6, '#e8e0d0').line(2, 6, 3, 12, '#e8e0d0');
      p.rect(1, 6, 6, 1, WOOD.l2).px(6, 6, IRON.l2).rect(0, 6, 2, 1, '#e03a2a').px(0, 5, '#ff7a5a').px(0, 7, '#a82018');
    },
  },
  // a quiver on the back, three arrows with red feathers
  quiver: {
    w: 6,
    h: 11,
    at: [3, 6],
    draw: (p) => {
      p.rect(1, 4, 4, 7, WOOD.b).rect(1, 4, 1, 7, WOOD.l).rect(4, 4, 1, 7, WOOD.d).rect(1, 6, 4, 1, '#e8c040');
      for (const [x, y] of [[1, 2], [3, 1], [4, 3]] as const) p.rect(x, y, 1, 4 - (y - 1), '#e8e0d0').rect(x, y - 1, 1, 2, '#e03a2a').px(x, y - 1, '#ff7a5a');
      p.px(0, 1, '#e03a2a').px(5, 2, '#e03a2a');
    },
  },
  // a big round blue shield with a white ring and an iron boss
  shield: { w: 11, h: 11, at: [5, 5], draw: (p) => roundShield(p, 5, 5, 5, '#2e6ad8', '#eef4ff', 1) },
  // (a small monster carries a smaller one)
  shieldSmall: { w: 9, h: 9, at: [4, 4], draw: (p) => roundShield(p, 4, 4, 4, '#2e6ad8', '#eef4ff', 1) },
};

/** Which piece a role is on a species, and the anchor it goes on. */
function pieceOf(role: RoleGear, species: string): { piece: keyof typeof PIECES; at: [number, number] } {
  const a = roleAnchor(species);
  if (role === 'skoldbarare') return { piece: sizeOf(species).h >= 20 ? 'shield' : 'shieldSmall', at: a.front };
  if (role === 'besvarjare') return a.hand ? { piece: 'staff', at: a.hand } : { piece: 'crown', at: a.head };
  return a.hand ? { piece: 'bow', at: a.hand } : { piece: 'quiver', at: a.back };
}

const cache = new Map<string, Px>();

/**
 * The gear of `role` for a monster of `species` on walk frame `frame` (0 or 1): a small outlined sprite and where its
 * top-left goes, in the pixels of the monster's sprite (facing right; mirror both for a monster that faces left).
 */
export function roleGear(role: RoleGear, species: string, frame: number): { px: Px; x: number; y: number } {
  const { piece, at } = pieceOf(role, species);
  const d = PIECES[piece]!;
  const key = `${piece}-${frame ? 1 : 0}`;
  let px = cache.get(key);
  if (!px) {
    // (one pixel of room all round for the outline)
    px = new Px(d.w + 2, d.h + 2);
    const inner = new Px(d.w, d.h);
    d.draw(inner, frame ? 1 : 0);
    px.blit(inner, 1, 1).outline(OUTLINE);
    cache.set(key, px);
  }
  // the gear bobs a pixel with the monster's step
  return { px, x: at[0] - d.at[0] - 1, y: at[1] - d.at[1] - 1 + (frame && piece !== 'crown' ? 1 : 0) };
}

/** Draws a role's gear on a 2D context on which the monster's sprite has its top-left at (ox, oy), one sprite pixel per unit. */
export function drawRoleGear(ctx: CanvasRenderingContext2D, role: RoleGear, species: string, frame: number, ox = 0, oy = 0): void {
  const g = roleGear(role, species, frame);
  ctx.drawImage(g.px.canvas, ox + g.x, oy + g.y);
}
