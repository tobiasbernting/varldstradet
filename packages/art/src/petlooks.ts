// The pixel art of pet gear (shared/src/looks.ts: PET_LOOK_SETS): a piece is drawn on the animal's own sprite at one of its three
// anchors (pets.ts: head, neck, back), per walk frame, in the set's palette.
//
// Readability rules, for every piece on every pet (a test in client/src/pets.art.test.ts checks what can be checked):
//  - never over the eyes or the muzzle (pets.ts: `face`);
//  - a head piece sits on the top of the head: its anchor is the top row of the skull between the ears, it covers at most the two
//    rows y and y+1 of the head, and everything else (horns, spikes, a feather) stands up above it;
//  - a neck piece is a thin band (two wide, three tall) with one small tag or knot hanging under it;
//  - a back piece is a blanket or cape over the back and rump (six wide and about four deep, trailing back to the left): the legs, the
//    head and the tail tip stay free;
//  - every piece has a one pixel dark edge, and at most three colours (main, dark, and one light that turns into the set's trim
//    colour from tier 2) plus one gem pixel that glows from tier 3.
// Shine tiers add polish, never noise: 1 plain; 2 the trim line; 3 the gem pixel glows; 4 and 5 are the client's (looksfx.ts: one small
// particle effect at tier 4, the same effect and a soft ground glow at tier 5): the sprite itself does not change after tier 3.
// A pet of the large size class (pets.ts: `size`) gets every piece one column and one row bigger, made from the same drawing.
//
// To draw a new piece: add an entry to PIECES (a picture in letters, see `put`) and an icon; a test draws every piece on every pet.
import type { DecodedLook, PetAnchor } from '@varldstradet/shared';
import { Px, shade } from './px.js';
import { OUTLINE } from './world.js';

/**
 * One piece as a picture of letters. m main, d dark edge, l light (the trim colour from tier 2), t a trim line (plain main on tier 1),
 * g the gem (plain main until tier 3, then it glows), . nothing. (ox, oy) is the cell that sits on the anchor; `grow` is the row that is
 * doubled on a large pet (the middle column is always doubled); `alt` is the picture on the second walk frame, if it moves.
 */
interface Piece {
  rows: string[];
  ox: number;
  oy: number;
  grow?: number;
  alt?: string[];
  /** The icon: a 7x7 picture of the piece on its own, drawn twice as big. */
  icon: string[];
}

const PIECES: Record<string, Piece> = {
  // ---- on the head: the anchor is the top row of the skull ----
  // Benhjälmen: a dome of old bone with a crest down its middle
  pet_draug_head: { ox: 2, oy: 2, rows: ['..d..', '.dld.', 'dmlmd', 'dtgtd'], icon: ['.ddddd.', 'dmmgmmd', 'dmmlmmd', 'dmmlmmd', 'dmdddmd', 'dm.d.md', '.d...d.'] },
  // Isdiademet: a thin circlet with three ice spikes, the middle one tallest
  pet_frost_head: { ox: 2, oy: 2, rows: ['..l..', 'l.l.l', 'lmlml', 'dmgmd'], icon: ['...l...', 'l..l..l', 'l.lll.l', 'lllllll', 'lmmgmml', 'dmmmmmd', 'ddddddd'] },
  // Korpfjädern: a plain band with one tall feather leaning back
  pet_hel_head: { ox: 2, oy: 3, rows: ['ml...', 'dml..', '.dmd.', 'dmgmd', '.ddd.'], icon: ['.....mm', '...mmmd', '..mlmd.', '.mlmd..', 'mlmd...', 'lmd....', 'gd.....'] },
  // Lövkransen: a low wreath of leaves, wider than the head, with a berry
  pet_alv_head: { ox: 3, oy: 1, rows: ['.l...l.', 'lmmgmml', '.dmmmd.'], icon: ['..lml..', '.m...m.', 'l.....l', 'm.....m', 'l.....l', '.mlmlm.', '..mgm..'] },
  // Hornhjälmen: a round helmet with a big horn on each side
  pet_fenrir_head: { ox: 3, oy: 3, rows: ['l.....l', '.l...l.', 'llmmmll', 'dmmgmmd', '.ddddd.'], icon: ['l.....l', 'll...ll', 'l.ddd.l', '.dmmmd.', 'dmmgmmd', 'dmdddmd', '.d...d.'] },

  // ---- on the neck: the anchor is the top of the band; a tag or knot hangs under it ----
  // Draugkragen: a collar of iron links and a square rune tag
  pet_draug_neck: { ox: 1, oy: 0, grow: 1, rows: ['ldl', 'dld', 'ldl', '.dd', '.gd', '.dd'], icon: ['.dldld.', 'dl...ld', 'ld...dl', 'dl...ld', '.ldldl.', '..dgd..', '..ddd..'] },
  // Glödbrickan: a black cord with a round ember coin
  pet_surt_neck: { ox: 1, oy: 0, grow: 1, rows: ['ddd', 'dtd', 'ddd', '.d.', 'dgd', '.d.'], icon: ['d.....d', 'd.....d', '.d...d.', '..ddd..', '.dmgmd.', '..dmd..', '...d...'] },
  // Ljusbandet: a green ribbon with a drop of light hanging on a thread
  pet_alv_neck: { ox: 1, oy: 0, grow: 1, rows: ['mlm', 'lml', 'mlm', '.d.', '.g.', '.d.'], icon: ['mmmmmmm', 'lmlmlml', '...d...', '..dgd..', '.dgmgd.', '..dgd..', '...d...'] },
  // Tyrs halsduk: a red scarf with a knot and one long end that flutters
  pet_fenrir_neck: { ox: 1, oy: 0, grow: 1, rows: ['mmd', 'tmm', 'mmd', 'mgd', '.md', '.d.'], alt: ['mmd', 'tmm', 'mmd', 'mgd', '..m', '..d'], icon: ['dmmmmmd', 'mtttttm', 'dmmmmmd', '..dmm..', '.dmmmd.', '.dm.md.', '.d...d.'] },

  // ---- on the back: the anchor is the top of the back, in the middle of the piece; it trails to the left ----
  // Frostmanteln: a blue cape with a white fur edge and a long pointed tail
  pet_frost_back: { ox: 4, oy: 0, grow: 2, rows: ['.lllll.', 'mmmgmmm', 'dmmmmmd', '.d.dd.d'], alt: ['.lllll.', 'mmmgmmm', 'dmmmmmd', 'd.dd.d.'], icon: ['.lllll.', 'lmmmmml', 'mmmgmmm', 'mmmmmmm', 'dmmmmmd', 'dm.d.md', 'd..d..d'] },
  // Glödfilten: a stiff blanket with a bright stripe and tassels along the hem
  pet_surt_back: { ox: 3, oy: 0, grow: 1, rows: ['dddddd', 'dtttmd', 'dmmgmd', '.d.d.d'], icon: ['ddddddd', 'dtttttd', 'dmmgmmd', 'dtttttd', 'dmmmmmd', 'd.d.d.d', '.......'] },
  // Korpmanteln: a cloak of black feathers, ragged along the edge
  pet_hel_back: { ox: 4, oy: 0, grow: 2, rows: ['.lllll.', 'dmlmmmd', 'mmlmgm.', 'm.m.m..', '.d.d...'], alt: ['.lllll.', 'dmlmmmd', 'mmlmgm.', '.m.m.m.', '..d.d..'], icon: ['.dmmmd.', 'dmmlmmd', 'mmlmlmm', 'mmlmlmm', 'mlmmmlm', 'm.m.m.m', '.d.d.d.'] },
};

/** The letters of a picture, turned into the colours of a look. */
function colours(l: DecodedLook): Record<string, string | null> {
  const { tier, pal } = l;
  const lt = tier >= 2 ? pal.trim : pal.light;
  return { m: pal.main, d: shade(pal.dark, 0.6), l: lt, t: tier >= 2 ? lt : pal.main, g: tier >= 5 ? pal.accent : tier >= 3 ? pal.glow : pal.main, '.': null, ' ': null };
}

/** A large pet's version of a picture: the middle column and the `grow` row doubled. */
function grown(rows: string[], ox: number, grow: number | undefined): string[] {
  const out: string[] = [];
  rows.forEach((r, i) => {
    const w = r.slice(0, ox + 1) + r.slice(ox);
    out.push(w);
    if (i === grow) out.push(w);
  });
  return out;
}

function put(p: Px, rows: string[], c: Record<string, string | null>, x0: number, y0: number, scale = 1): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = c[row[i]!];
      if (col) p.rect(x0 + i * scale, y0 + j * scale, scale, scale, col);
    }
  });
}

/** One piece of pet gear on a sprite: at `anchor` (x, y) on walk frame `frame`; `big` for a pet of the large size class. */
export function drawPetLook(p: Px, l: DecodedLook, anchor: PetAnchor, x: number, y: number, frame: number, big = false): void {
  if (l.piece.petSlot !== anchor) return;
  const pc = PIECES[l.piece.id];
  if (!pc) return;
  let rows = frame && pc.alt ? pc.alt : pc.rows;
  let ox = pc.ox;
  if (big) {
    rows = grown(rows, ox, pc.grow);
    ox += 0;
  }
  put(p, rows, colours(l), x - ox, y - pc.oy);
}

/** The cells (x, y) a piece covers: for tests and tools that need to know where gear lies without painting it. */
export function petLookCells(pieceId: string, anchor: [number, number], frame: number, big: boolean): [number, number][] {
  const pc = PIECES[pieceId];
  if (!pc) return [];
  let rows = frame && pc.alt ? pc.alt : pc.rows;
  if (big) rows = grown(rows, pc.ox, pc.grow);
  const cells: [number, number][] = [];
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] !== '.' && row[i] !== ' ') cells.push([anchor[0] - pc.ox + i, anchor[1] - pc.oy + j]);
  });
  return cells;
}

/** A piece of pet gear as an icon (16x16): its own 7x7 picture drawn twice as big, with a dark outline. */
export function petLookIcon(l: DecodedLook): Px {
  const out = new Px(16, 16);
  const pc = PIECES[l.piece.id];
  if (pc) put(out, pc.icon, colours(l), 1, 1, 2);
  out.outline(OUTLINE);
  return out;
}
