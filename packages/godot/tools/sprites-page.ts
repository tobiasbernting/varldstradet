// The browser side of export-sprites.mts: bundled by Vite, run in Playwright's Chromium, draws the game's pixel art
// (packages/client/src/art, which needs a canvas) and hands back PNG data for every sheet. Nothing here runs in Node.
import { CLASSES, DUNGEONS, SAGA_BOSSES, SAGA_LOOT, SAGA_TREASURE, SPELLS, T, sagaItem, type ClassId } from '@lilla-garden/shared';
// (the world's art first: the art modules form a cycle, and the browser's own entry loads them in this order)
import { EMOTE_GLYPH } from '../../client/src/art/world.ts';
import { getArt } from '../../client/src/art/textures.ts';
import { drawAnimal, ANIMAL_SIZE } from '../../client/src/art/animals.ts';
import { CHAR_H, CHAR_W, drawCharacter, HEADROOM, lookOf, SKIN_TONES, type Dir } from '../../client/src/art/characters.ts';
import { Px } from '../../client/src/art/px.js';

export interface Sheet {
  file: string;
  frame_w: number;
  frame_h: number;
  columns: number;
  frames: string[];
  /** Empty rows over the figure (a hero's 8 rows for tall hats); 0 for creatures. */
  headroom: number;
  png: string;
}

/** 4 directions × 3 frames (stand, walk 1, walk 2) in one row; left is right mirrored, as in the browser. */
const HERO_FRAMES: [string, Dir | 'left', number][] = [];
for (const dir of ['down', 'up', 'left', 'right'] as const) for (let f = 0; f < 3; f++) HERO_FRAMES.push([`${dir}${f}`, dir, f]);

function heroSheet(cls: ClassId, skinIndex: number): Sheet {
  const c = CLASSES[cls];
  const look = lookOf({ skin: SKIN_TONES[skinIndex]!, hair: '#5a3a1e', hairStyle: 'short' }, { hat: c.outfit.hat, shirt: c.outfit.shirt, pants: 'pants_brown', shoes: 'shoes_boots' });
  const sheet = new Px(CHAR_W * HERO_FRAMES.length, CHAR_H);
  HERO_FRAMES.forEach(([, dir, f], i) => {
    const frame = drawCharacter(look, dir === 'left' ? 'right' : dir, f);
    sheet.blit(frame, i * CHAR_W, 0, dir === 'left');
  });
  const file = `hero_${cls}_${skinIndex}.png`;
  return { file, frame_w: CHAR_W, frame_h: CHAR_H, columns: HERO_FRAMES.length, frames: HERO_FRAMES.map(([n]) => n), headroom: HEADROOM, png: sheet.dataUrl() };
}

/** Two walk frames facing right, the creature's own size, outlined like the browser draws it. */
function mobSheet(species: string): Sheet {
  const size = ANIMAL_SIZE[species] ?? { w: 16, h: 16 };
  const sheet = new Px(size.w * 2, size.h);
  sheet.blit(drawAnimal(species, 0, false, false, 0), 0, 0).blit(drawAnimal(species, 1, false, false, 0), size.w, 0);
  return { file: `mob_${species}.png`, frame_w: size.w, frame_h: size.h, columns: 2, frames: ['right0', 'right1'], headroom: 0, png: sheet.dataUrl() };
}

/** Every creature a dungeon can show: its packs, the mid-boss and boss, and the helpers they call. */
export function speciesOf(dungeonId: keyof typeof DUNGEONS): string[] {
  const d = DUNGEONS[dungeonId];
  const set = new Set<string>();
  for (const r of d.rooms) for (const pack of r.packs ?? []) for (const s of pack) set.add(s);
  for (const b of [d.mini, d.boss]) {
    set.add(b);
    const adds = SAGA_BOSSES[b]?.phaseAdds;
    if (adds) set.add(adds.species);
    for (const mv of SAGA_BOSSES[b]?.moves ?? []) if (mv.block) set.add(mv.block);
  }
  return [...set].sort();
}

// ---------------------------------------------------------------------------
// icons.png: the spells' emoji, the emotes' glyphs, the loot items' pictures and a few HUD glyphs (M3b)
// ---------------------------------------------------------------------------

/** One square in the icon sheet (emoji are drawn at this size; the 16 px item pictures are blown up ×2). */
const ICON = 32;
export interface IconEntry {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** The emoji the browser's loot window shows for an item without a picture of its own (ui/saga.ts, KIND_EMOJI). */
const KIND_EMOJI: Record<string, string> = { weapon: '⚔️', offhand: '🛡️', amulet: '📿', hat: '🪖', shirt: '👕', pet: '🐾', mount: '🐎', potion: '🧪', decor: '✨', quest: '📦', material: '💠' };
/** Glyphs the HUD uses (the browser's: the boss bar's crown and skull, the frozen and webbed overlays, and so on). */
const UI_GLYPHS: Record<string, string> = { potion: '🧪', coin: '🪙', star: '⭐', chest: '🎁', box: '📦', skull: '💀', ice: '🧊', web: '🕸️', shield: '🛡️', warn: '⚠️', crown: '👑', chat: '💬', aim: '🎯', sword: '⚔️' };

/** An emoji drawn by the browser's own font (Noto Color Emoji in the build sandbox), centred in a square. */
function emoji(glyph: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ICON;
  c.height = ICON;
  const ctx = c.getContext('2d')!;
  ctx.font = `${ICON - 6}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, ICON / 2, ICON / 2 + 1);
  return c;
}

/** Every item a dungeon's chests can give (its treasure room, the mid-boss and the boss), plus the chest extras. */
function lootItemsOf(dungeonId: keyof typeof DUNGEONS): string[] {
  const d = DUNGEONS[dungeonId];
  const set = new Set<string>(['healing_potion', 'monsteressens', 'drakfjall']);
  for (const table of [SAGA_TREASURE[dungeonId], SAGA_LOOT[d.mini], SAGA_LOOT[d.boss]]) {
    if (!table) continue;
    for (const g of table.gear) set.add(g.item);
    for (const r of table.rare ?? []) set.add(r.item);
  }
  return [...set].sort();
}

/** Has this item a picture of its own (not empty, nor the magenta square of art still to be drawn)? The browser's hasIcon. */
function hasIcon(p: Px | undefined): boolean {
  if (!p) return false;
  const d = p.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, p.canvas.width, p.canvas.height).data;
  let solid = 0;
  let magenta = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 128) continue;
    solid++;
    if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) magenta++;
  }
  return solid > 12 && magenta < solid / 2;
}

function iconSheet(dungeons: (keyof typeof DUNGEONS)[]): { sheet: Sheet; icons: Record<string, IconEntry> } {
  const art = getArt();
  const cells: [string, HTMLCanvasElement][] = [];
  for (const [id, sp] of Object.entries(SPELLS)) cells.push([`spell_${id}`, emoji(sp.icon)]);
  for (const id of T.emotes) cells.push([`emote_${id}`, emoji(EMOTE_GLYPH[id] ?? id)]);
  for (const [name, glyph] of Object.entries(UI_GLYPHS)) cells.push([`ui_${name}`, emoji(glyph)]);
  for (const id of [...new Set(dungeons.flatMap(lootItemsOf))].sort()) {
    const p = art.icons[id];
    if (hasIcon(p)) {
      const c = document.createElement('canvas');
      c.width = ICON;
      c.height = ICON;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(p!.canvas, 0, 0, ICON, ICON);
      cells.push([`item_${id}`, c]);
    } else cells.push([`item_${id}`, emoji(KIND_EMOJI[sagaItem(id)?.kind ?? ''] ?? '🎁')]);
  }
  const columns = 8;
  const rows = Math.ceil(cells.length / columns);
  const sheet = new Px(columns * ICON, rows * ICON);
  const icons: Record<string, IconEntry> = {};
  cells.forEach(([name, c], i) => {
    const x = (i % columns) * ICON;
    const y = Math.floor(i / columns) * ICON;
    sheet.blit(c, x, y);
    icons[name] = { x, y, w: ICON, h: ICON };
  });
  return { sheet: { file: 'icons.png', frame_w: ICON, frame_h: ICON, columns, frames: cells.map(([n]) => n), headroom: 0, png: sheet.dataUrl() }, icons };
}

export function render(dungeons: (keyof typeof DUNGEONS)[]): { sheets: Sheet[]; heroes: Record<string, string[]>; skins: string[]; species: string[]; icons: Record<string, IconEntry> } {
  const sheets: Sheet[] = [];
  const heroes: Record<string, string[]> = {};
  for (const cls of Object.keys(CLASSES) as ClassId[]) {
    heroes[cls] = [];
    SKIN_TONES.forEach((_, i) => {
      const s = heroSheet(cls, i);
      sheets.push(s);
      heroes[cls]!.push(s.file);
    });
  }
  const species = [...new Set(dungeons.flatMap(speciesOf))].sort();
  for (const s of species) sheets.push(mobSheet(s));
  const { sheet, icons } = iconSheet(dungeons);
  sheets.push(sheet);
  return { sheets, heroes, skins: [...SKIN_TONES], species, icons };
}
