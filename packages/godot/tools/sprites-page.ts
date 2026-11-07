// The browser side of export-sprites.mts: bundled by Vite, run in Playwright's Chromium, draws the game's pixel art
// (packages/art/src, which needs a canvas) and hands back PNG data for every sheet. Nothing here runs in Node.
import { ANIMALS, CLASSES, DUNGEONS, ITEMS, NPCS, SAGA_BOSSES, SAGA_MOBS, SAGA_LOOT, SAGA_TREASURE, SPELLS, T, sagaItem, type Appearance, type ClassId, type Outfit } from '@lilla-garden/shared';
// (the world's art first: the art modules form a cycle, and the browser's own entry loads them in this order)
import { EMOTE_GLYPH } from '../../art/src/world.ts';
import { getArt } from '../../art/src/textures.ts';
import { drawAnimal, ANIMAL_SIZE, ANIMAL_VARIANTS, RIDE_LIFT } from '../../art/src/animals.ts';
import { CHAR_H, CHAR_LAYERS, CHAR_W, drawCharacter, HAIR_COLORS, HAIR_STYLES, HEADROOM, isDress, lookOf, SKIN_TONES, type CharLayer, type Dir } from '../../art/src/characters.ts';
import { Px } from '../../art/src/px.js';

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
function mobSheet(species: string, variant = 0): Sheet {
  const size = ANIMAL_SIZE[species] ?? { w: 16, h: 16 };
  const sheet = new Px(size.w * 2, size.h);
  sheet.blit(drawAnimal(species, 0, false, false, variant), 0, 0).blit(drawAnimal(species, 1, false, false, variant), size.w, 0);
  return { file: `mob_${species}${variant ? `_v${variant}` : ''}.png`, frame_w: size.w, frame_h: size.h, columns: 2, frames: ['right0', 'right1'], headroom: 0, png: sheet.dataUrl() };
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
    // (a freeze holds its friend in an ice block unless the move names a web, as sagasim's freeze() does)
    for (const mv of SAGA_BOSSES[b]?.moves ?? []) if (mv.move === 'freeze') set.add(mv.block ?? 'isblock');
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
/** What an item with no picture of its own is drawn as, by its category. */
const CATEGORY_EMOJI: Record<string, string> = { tool: '🔧', seed: '🌱', crop: '🥕', animal_product: '🥚', fish: '🐟', feed: '🌾', material: '🪵', placeable: '🏠', clothing: '👕', animal: '🐾', decor: '🪴' };
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
  for (const id of new Set([...T.emotes, ...Object.keys(EMOTE_GLYPH)])) cells.push([`emote_${id}`, emoji(EMOTE_GLYPH[id] ?? id)]); // (M4b: the glyphs that are not on the wheel too: fiske, napp, vissla)
  for (const [name, glyph] of Object.entries(UI_GLYPHS)) cells.push([`ui_${name}`, emoji(glyph)]);
  // (M4b) the loot items, and every item the farm knows: the bag, the hotbar and the pick-up lines draw them all
  for (const id of [...new Set([...dungeons.flatMap(lootItemsOf), ...Object.keys(ITEMS)])].sort()) {
    const p = art.icons[id];
    if (hasIcon(p)) {
      const c = document.createElement('canvas');
      c.width = ICON;
      c.height = ICON;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(p!.canvas, 0, 0, ICON, ICON);
      cells.push([`item_${id}`, c]);
    } else cells.push([`item_${id}`, emoji(KIND_EMOJI[sagaItem(id)?.kind ?? ''] ?? CATEGORY_EMOJI[ITEMS[id]?.category ?? ''] ?? '🎁')]);
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

// ---------------------------------------------------------------------------
// The farm's people (M4a): layers that Godot composes, villagers, and the animals
// ---------------------------------------------------------------------------

type Look = ReturnType<typeof lookOf>;
type Slot = 'hat' | 'shirt' | 'pants' | 'shoes';
const FRAME_NAMES = HERO_FRAMES.map(([n]) => n);
const OUTLINE_COLOR = '#2a2420';
const BASE_APPEARANCE: Appearance = { skin: SKIN_TONES[0]!, hair: HAIR_COLORS[3]!, hairStyle: 'short' };
/** A glass helmet tucks long hair and a ponytail in (drawCharacter turns them into 'short' under hat style 'space'). */
const TUCKING_HATS = new Set(['space']);

/** One layer's 12 frames in a row, as the hero sheets lay them out (left is right mirrored). */
function layerRow(look: Look, layer: CharLayer): Px {
  const row = new Px(CHAR_W * HERO_FRAMES.length, CHAR_H);
  HERO_FRAMES.forEach(([, dir, f], i) => {
    let frame = drawCharacter(look, dir === 'left' ? 'right' : dir, f, layer);
    if (layer === 'hat_erase') frame = eraseMask(frame);
    row.blit(frame, i * CHAR_W, 0, dir === 'left');
  });
  return row;
}

/** The hat_erase canvas starts opaque and the hat's clears make holes in it: the mask is those holes, drawn opaque. */
function eraseMask(p: Px): Px {
  const d = p.ctx.getImageData(0, 0, p.w, p.h);
  for (let i = 0; i < d.data.length; i += 4) {
    const erased = d.data[i + 3] === 0;
    d.data.set([0, 0, 0, erased ? 255 : 0], i);
  }
  const out = new Px(p.w, p.h);
  out.ctx.putImageData(d, 0, 0);
  return out;
}

const alphaOf = (p: Px): Uint8ClampedArray => p.ctx.getImageData(0, 0, p.w, p.h).data;
const isEmpty = (p: Px): boolean => alphaOf(p).every((v, i) => i % 4 !== 3 || v === 0);

export interface FarmMeta {
  frame_w: number;
  frame_h: number;
  columns: number;
  headroom: number;
  frames: string[];
  layer_order: string[];
  outline: { color: string };
  skins: string[];
  hair_colors: string[];
  hair_styles: string[];
  files: Record<string, { file: string; width: number; height: number; rows: number }>;
  layers: Record<string, Record<string, unknown>>;
  items: Record<string, { slot: Slot; style: string; color: string; layer: string }>;
  fallback: Record<string, string>;
  rules: string[];
}

interface PackedRow {
  key: string;
  row: Px;
  extra: Record<string, unknown>;
}

/** Every look's layer rows, per kind. Rows that draw nothing (a plain shirt adds nothing over the hands) are left out. */
function farmLayers(): { meta: FarmMeta; files: { file: string; png: string }[]; canvases: Record<string, Px> } {
  const clothes = (slot: Slot) =>
    Object.values(ITEMS)
      .filter((i) => i.clothing?.slot === slot)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  const packs: Record<string, PackedRow[]> = {};
  for (const k of [...CHAR_LAYERS, 'hat_erase']) packs[k] = [];
  const put = (kind: CharLayer, key: string, look: Look, extra: Record<string, unknown> = {}): boolean => {
    const row = layerRow(look, kind);
    if (isEmpty(row)) return false;
    packs[kind]!.push({ key: `${kind}_${key}`, row, extra });
    return true;
  };
  // the slots' items, and the fallbacks `lookOf` uses for an empty slot (id 'default')
  for (const id of ['default', ...clothes('pants').map((i) => i.id)]) put('pants', id, lookOf(BASE_APPEARANCE, id === 'default' ? {} : { pants: id }));
  for (const id of ['default', ...clothes('shoes').map((i) => i.id)]) {
    put('shoes', id, lookOf(BASE_APPEARANCE, id === 'default' ? {} : { shoes: id }));
    put('shoes', `${id}_dress`, lookOf(BASE_APPEARANCE, id === 'default' ? { shirt: 'dress_pink' } : { shirt: 'dress_pink', shoes: id }));
  }
  for (const id of ['default', ...clothes('shirt').map((i) => i.id)]) {
    const look = lookOf(BASE_APPEARANCE, id === 'default' ? {} : { shirt: id });
    const extra = { dress: isDress(look.shirt.style) };
    put('shirt', id, look, extra);
    put('shirt_over', id, look);
    put('shirt_shade', id, look);
  }
  SKIN_TONES.forEach((_, i) => {
    const look = lookOf({ ...BASE_APPEARANCE, skin: SKIN_TONES[i]! }, {});
    put('hands', String(i), look);
    put('head', String(i), look);
    put('head_shade', String(i), look);
  });
  for (const style of HAIR_STYLES.filter((s) => s !== 'bald')) HAIR_COLORS.forEach((c, ci) => put('hair', `${style}_${ci}`, lookOf({ skin: SKIN_TONES[0]!, hair: c, hairStyle: style }, {})));
  for (const it of clothes('hat')) {
    const look = lookOf(BASE_APPEARANCE, { hat: it.id });
    const erase = put('hat_erase', it.id, look);
    put('hat', it.id, look, { ...(erase ? { erase: `hat_erase_${it.id}` } : {}), ...(TUCKING_HATS.has(it.clothing!.style) ? { tucks_hair: true } : {}) });
  }
  // pack each kind into one PNG: a row of 12 frames per layer
  const files: { file: string; png: string }[] = [];
  const canvases: Record<string, Px> = {};
  const meta: FarmMeta = {
    frame_w: CHAR_W,
    frame_h: CHAR_H,
    columns: HERO_FRAMES.length,
    headroom: HEADROOM,
    frames: FRAME_NAMES,
    layer_order: [...CHAR_LAYERS],
    outline: { color: OUTLINE_COLOR },
    skins: [...SKIN_TONES],
    hair_colors: [...HAIR_COLORS],
    hair_styles: [...HAIR_STYLES],
    files: {},
    layers: {},
    items: {},
    fallback: { shirt: 'default', pants: 'default', shoes: 'default' },
    rules: [],
  };
  for (const [kind, rows] of Object.entries(packs)) {
    if (!rows.length) continue;
    const sheet = new Px(CHAR_W * HERO_FRAMES.length, CHAR_H * rows.length);
    const file = `farm_${kind}.png`;
    rows.forEach((r, i) => {
      sheet.blit(r.row, 0, i * CHAR_H);
      meta.layers[r.key] = { file, x: 0, y: i * CHAR_H, ...r.extra };
    });
    canvases[kind] = sheet;
    meta.files[kind] = { file, width: sheet.w, height: sheet.h, rows: rows.length };
    files.push({ file, png: sheet.dataUrl() });
  }
  for (const slot of ['hat', 'shirt', 'pants', 'shoes'] as const)
    for (const it of clothes(slot)) meta.items[it.id] = { slot, style: it.clothing!.style, color: it.clothing!.color, layer: it.id };
  return { meta, files, canvases };
}

/** The layer keys to compose, bottom to top, for a player's look: the rule in ART.md, written once more as code. */
function layerKeys(meta: FarmMeta, app: Appearance, outfit: Outfit): { key: string; erase?: string }[] {
  const has = (slot: Slot, id: string | undefined): string => (id && meta.items[id]?.slot === slot ? id : 'default');
  const skin = SKIN_TONES.indexOf(app.skin);
  const colour = HAIR_COLORS.indexOf(app.hair);
  if (skin < 0 || colour < 0) throw new Error(`appearance outside the lists: ${JSON.stringify(app)}`);
  const shirt = has('shirt', outfit.shirt);
  const dress = meta.layers[`shirt_${shirt}`]!['dress'] === true;
  const hatId = outfit.hat && meta.items[outfit.hat]?.slot === 'hat' ? outfit.hat : undefined;
  const hat = hatId ? meta.layers[`hat_${hatId}`] : undefined;
  let style = app.hairStyle;
  if (hat?.['tucks_hair'] && (style === 'long' || style === 'ponytail')) style = 'short';
  const keys: { key: string; erase?: string }[] = [];
  if (!dress) keys.push({ key: `pants_${has('pants', outfit.pants)}` });
  keys.push({ key: `shoes_${has('shoes', outfit.shoes)}${dress ? '_dress' : ''}` });
  keys.push({ key: `shirt_${shirt}` }, { key: `hands_${skin}` }, { key: `shirt_over_${shirt}` }, { key: `head_${skin}` });
  if (style !== 'bald') keys.push({ key: `hair_${style}_${colour}` });
  keys.push({ key: `shirt_shade_${shirt}` }, { key: `head_shade_${skin}` });
  if (hatId) keys.push({ key: `hat_${hatId}`, erase: hat!['erase'] as string | undefined });
  return keys.filter((k) => {
    if (meta.layers[k.key]) return true;
    if (k.key.startsWith('shirt_over_')) return false; // a plain shirt adds nothing over the hands
    throw new Error(`missing layer ${k.key}`);
  });
}

/** Composes a look's frame from the exported layers (source-over, the hat's erase mask first), then outlines it. */
function composeFrame(meta: FarmMeta, cells: Record<string, CanvasImageSource>, app: Appearance, outfit: Outfit, frame: number): Px {
  const out = new Px(CHAR_W, CHAR_H);
  const cell = (key: string, op: GlobalCompositeOperation) => {
    const e = meta.layers[key]!;
    out.ctx.globalCompositeOperation = op;
    out.ctx.drawImage(cells[e['file'] as string]!, (e['x'] as number) + frame * CHAR_W, e['y'] as number, CHAR_W, CHAR_H, 0, 0, CHAR_W, CHAR_H);
    out.ctx.globalCompositeOperation = 'source-over';
  };
  for (const k of layerKeys(meta, app, outfit)) {
    if (k.erase) cell(k.erase, 'destination-out');
    cell(k.key, 'source-over');
  }
  return out.outline(OUTLINE_COLOR);
}

async function decodeAll(files: { file: string; png: string }[]): Promise<Record<string, CanvasImageSource>> {
  const cells: Record<string, CanvasImageSource> = {};
  for (const f of files) {
    const img = new Image();
    img.src = f.png;
    await img.decode();
    // through a canvas, so the pixels are the ones a PNG decoder hands back
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    cells[f.file] = c;
  }
  return cells;
}

/** A small seeded generator, so the sample of looks is the same on every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Compares the composed layers with `drawCharacter` pixel for pixel on a sample of looks (every item in every slot, all
 * hair styles, all skin tones, dresses, horns, wizard points, bald, ponytail, the space helmet over long hair) and
 * throws on the first mismatches.
 */
async function verifyFarm(meta: FarmMeta, files: { file: string; png: string }[]): Promise<{ looks: number; frames: number; glassMaxDiff: number }> {
  const cells = await decodeAll(files);
  const ids = (slot: Slot) => Object.keys(meta.items).filter((id) => meta.items[id]!.slot === slot);
  const rand = rng(4242);
  const pick = <T>(a: readonly (T | undefined)[]): T | undefined => a[Math.floor(rand() * a.length)];
  const hats = ids('hat');
  const shirts = ids('shirt');
  const pants = ids('pants');
  const shoes = ids('shoes');
  const dresses = shirts.filter((id) => meta.layers[`shirt_${id}`]!['dress'] === true);
  const looks: { app: Appearance; outfit: Outfit }[] = [];
  let n = 0;
  const add = (o: Partial<Outfit>) => {
    n++;
    looks.push({
      app: { skin: SKIN_TONES[n % SKIN_TONES.length]!, hair: HAIR_COLORS[(n * 3) % HAIR_COLORS.length]!, hairStyle: HAIR_STYLES[n % HAIR_STYLES.length]! },
      outfit: { shirt: pick(shirts), pants: pick(pants), shoes: pick(shoes), ...o },
    });
  };
  const addAll = (ids: string[], reps: number, f: (id: string) => Partial<Outfit>) => {
    for (const id of ids) for (let i = 0; i < reps; i++) add(f(id));
  };
  addAll(hats, HAIR_STYLES.length, (hat) => ({ hat })); // every hat over every hair style
  addAll(shirts, SKIN_TONES.length, (shirt) => ({ shirt })); // every shirt on every skin tone
  addAll(pants, 2, (pants) => ({ pants }));
  addAll(shoes, 2, (shoes) => ({ shoes }));
  addAll(shoes, 1, (shoes) => ({ shoes, shirt: pick(dresses) }));
  addAll(hats, 1, (hat) => ({ hat, shirt: pick(dresses) }));
  add({});
  add({ hat: undefined, shirt: undefined, pants: undefined, shoes: undefined });
  // every skin tone and every hair colour and style, bare and hatted
  for (const skin of SKIN_TONES) for (const style of HAIR_STYLES) HAIR_COLORS.forEach((hair) => looks.push({ app: { skin, hair, hairStyle: style }, outfit: { hat: pick(hats), shirt: pick(shirts) } }));
  for (let i = 0; i < 300; i++)
    looks.push({
      app: { skin: pick(SKIN_TONES)!, hair: pick(HAIR_COLORS)!, hairStyle: pick(HAIR_STYLES)! },
      outfit: { hat: rand() < 0.7 ? pick(hats) : undefined, shirt: rand() < 0.9 ? pick(shirts) : undefined, pants: rand() < 0.9 ? pick(pants) : undefined, shoes: rand() < 0.9 ? pick(shoes) : undefined },
    });
  // the cases the task names, spelled out so a renamed item cannot silently drop them
  const named = (style: string) => {
    const id = hats.find((h) => meta.items[h]!.style === style);
    if (!id) throw new Error(`no hat with style ${style}`);
    return id;
  };
  for (const hat of [named('horns'), named('witch'), named('runehat'), named('space'), named('frog'), named('dino'), named('wolfhood'), named('valkyrie')])
    for (const hairStyle of HAIR_STYLES) looks.push({ app: { skin: SKIN_TONES[2]!, hair: HAIR_COLORS[0]!, hairStyle }, outfit: { hat, shirt: 'dress_pink' } });
  let frames = 0;
  let glass = 0;
  const bad: string[] = [];
  for (const { app, outfit } of looks) {
    const look = lookOf(app, outfit);
    for (let i = 0; i < HERO_FRAMES.length; i++) {
      const [name, dir, f] = HERO_FRAMES[i]!;
      const want = new Px(CHAR_W, CHAR_H).blit(drawCharacter(look, dir === 'left' ? 'right' : dir, f), 0, 0, dir === 'left');
      const got = composeFrame(meta, cells, app, outfit, i);
      frames++;
      const a = want.ctx.getImageData(0, 0, CHAR_W, CHAR_H).data;
      const b = got.ctx.getImageData(0, 0, CHAR_W, CHAR_H).data;
      let diff = 0;
      let first = '';
      // the astronaut helmet's glass is translucent (alpha .3 to .92): a canvas stores it premultiplied, a PNG not, so
      // its colours may come back one or two levels off; anything else must be identical
      const tol = outfit.hat && meta.items[outfit.hat]?.style === 'space' ? 2 : 0;
      for (let k = 0; k < a.length; k += 4) {
        const d = Math.max(Math.abs(a[k]! - b[k]!), Math.abs(a[k + 1]! - b[k + 1]!), Math.abs(a[k + 2]! - b[k + 2]!));
        if (d > 0 && d <= tol && a[k + 3] === b[k + 3]) glass = Math.max(glass, d);
        else if (d > 0 || a[k + 3] !== b[k + 3]) {
          if (!diff) first = `pixel ${(k / 4) % CHAR_W},${Math.floor(k / 4 / CHAR_W)} want ${[...a.slice(k, k + 4)]} got ${[...b.slice(k, k + 4)]}`;
          diff++;
        }
      }
      if (diff) bad.push(`${name} ${JSON.stringify(app)} ${JSON.stringify(outfit)}: ${diff} px differ, first ${first}`);
    }
  }
  if (bad.length) throw new Error(`farm layers do not reproduce drawCharacter in ${bad.length} of ${frames} frames:\n${bad.slice(0, 12).join('\n')}`);
  return { looks: looks.length, frames, glassMaxDiff: glass };
}

/** The villagers, drawn as the browser draws them (view.ts: characterSprites of their appearance and outfit). */
function npcSheets(): { sheets: Sheet[]; npcs: Record<string, { sheet: string; name: string; area: string }> } {
  const sheets: Sheet[] = [];
  const npcs: Record<string, { sheet: string; name: string; area: string }> = {};
  for (const npc of Object.values(NPCS)) {
    const look = lookOf(npc.appearance, npc.outfit);
    const sheet = new Px(CHAR_W * HERO_FRAMES.length, CHAR_H);
    HERO_FRAMES.forEach(([, dir, f], i) => sheet.blit(drawCharacter(look, dir === 'left' ? 'right' : dir, f), i * CHAR_W, 0, dir === 'left'));
    const name = `npc_${npc.id}`;
    sheets.push({ file: `${name}.png`, frame_w: CHAR_W, frame_h: CHAR_H, columns: HERO_FRAMES.length, frames: FRAME_NAMES, headroom: HEADROOM, png: sheet.dataUrl() });
    npcs[npc.id] = { sheet: name, name: npc.name, area: npc.area ?? 'farm' };
  }
  return { sheets, npcs };
}

export interface FarmAnimal {
  kinds: string[];
  frame_w: number;
  frame_h: number;
  frames: string[];
  variants: number;
  baby: boolean;
  jul: boolean;
  ride_lift?: number;
  sheets: string[];
}

/**
 * The pets, farm animals, mounts, wild animals and roaming monsters (not the vehicles): side view facing right, the
 * browser's two walk frames as `right0 right1`, for every variant, as a baby where the browser has one, and with the
 * winter tomteluva. Each with the name the browser's `animalKey` would give it.
 */
function animalSheets(): { sheets: Sheet[]; animals: Record<string, FarmAnimal> } {
  const sheets: Sheet[] = [];
  const animals: Record<string, FarmAnimal> = {};
  for (const def of Object.values(ANIMALS).sort((a, b) => (a.species < b.species ? -1 : 1))) {
    if (def.vehicle) continue;
    const kinds = [def.house && 'farm', def.pet && 'pet', def.mount && 'mount', def.wild && 'wild', def.predator && 'predator', def.mob && 'mob'].filter((k): k is string => !!k);
    if (!kinds.length) continue; // dungeon-only monsters have their mob_ sheets
    const s = def.species;
    const size = ANIMAL_SIZE[s];
    if (!size) throw new Error(`no size for ${s}`);
    const variants = ANIMAL_VARIANTS[s] ?? 1;
    const babies = def.growDays > 0 ? [false, true] : [false];
    const entry: FarmAnimal = { kinds, frame_w: size.w, frame_h: size.h, frames: ['right0', 'right1'], variants, baby: babies.length > 1, jul: true, sheets: [] };
    if (def.mount) entry.ride_lift = RIDE_LIFT[s] ?? 7;
    for (const baby of babies)
      for (const jul of [false, true])
        for (let v = 0; v < variants; v++) {
          const sheet = new Px(size.w * 2, size.h);
          sheet.blit(drawAnimal(s, 0, baby, jul, v), 0, 0).blit(drawAnimal(s, 1, baby, jul, v), size.w, 0);
          if (isEmpty(sheet)) throw new Error(`${s} draws nothing`);
          const name = `animal_${s}${baby ? '_baby' : ''}${jul ? '_jul' : ''}${v ? `_v${v}` : ''}`;
          sheets.push({ file: `${name}.png`, frame_w: size.w, frame_h: size.h, columns: 2, frames: ['right0', 'right1'], headroom: 0, png: sheet.dataUrl() });
          entry.sheets.push(name);
        }
    animals[s] = entry;
  }
  return { sheets, animals };
}

export interface RenderResult {
  sheets: Sheet[];
  heroes: Record<string, string[]>;
  skins: string[];
  species: string[];
  icons: Record<string, IconEntry>;
  farm: FarmMeta;
  farmFiles: { file: string; png: string }[];
  farmCheck: { looks: number; frames: number; glassMaxDiff: number };
  farmAnimals: Record<string, FarmAnimal>;
  npcs: Record<string, { sheet: string; name: string; area: string }>;
}

export async function render(dungeons: (keyof typeof DUNGEONS)[]): Promise<RenderResult> {
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
  // every mob and boss gets a sheet, also those no dungeon room lists (the voxel bodies need them all)
  const species = [...new Set([...dungeons.flatMap(speciesOf), ...Object.keys(SAGA_MOBS), ...Object.keys(SAGA_BOSSES)])].sort();
  for (const s of species) sheets.push(mobSheet(s));
  // M6c: Loke's illusions are drawn ghostly (variant 1, sagamap.ts): every monster of a dungeon with `illusions` that is not a boss
  for (const id of dungeons) if (DUNGEONS[id as keyof typeof DUNGEONS]?.illusions) for (const s of speciesOf(id as keyof typeof DUNGEONS)) if (!SAGA_BOSSES[s]) sheets.push(mobSheet(s, 1));
  const { sheet, icons } = iconSheet(dungeons);
  sheets.push(sheet);
  const { meta: farm, files: farmFiles } = farmLayers();
  farm.rules = FARM_RULES;
  const farmCheck = await verifyFarm(farm, farmFiles);
  const a = animalSheets();
  sheets.push(...a.sheets);
  const n = npcSheets();
  sheets.push(...n.sheets);
  return { sheets, heroes, skins: [...SKIN_TONES], species, icons, farm, farmFiles, farmCheck, farmAnimals: a.animals, npcs: n.npcs };
}

/** How Godot puts a look together from `farm.layers` (also in ART.md). */
const FARM_RULES = [
  'Frame i of a figure is the cell at (x + i * frame_w, y) of its layer in the layer file; draw the layers in layer_order, source-over, into one frame_w x frame_h image.',
  'pants: pants_<item> (pants_default without one), skipped when the shirt is a dress (layers[shirt_<item>].dress). shoes: shoes_<item> or shoes_default, with the suffix _dress when the shirt is a dress.',
  'shirt, shirt_over, shirt_shade: the keys shirt_<item>, shirt_over_<item>, shirt_shade_<item> (shirt_default without a shirt); a key that is absent (shirt_over of a plain shirt) draws nothing.',
  'hands, head, head_shade: hands_<skin>, head_<skin>, head_shade_<skin> with skin the index in skins.',
  'hair: hair_<style>_<colour> with colour the index in hair_colors; none for bald; under a hat whose layer has tucks_hair, long and ponytail are drawn as short.',
  'hat: if hat_<item> has an erase key, first make every pixel transparent where the erase layer is opaque, then draw hat_<item>.',
  'After the hat, outline: every fully transparent pixel with a 4-neighbour of alpha > 0 (inside the frame only) becomes outline.color. Do this per frame, on the composed image.',
  'Appearance colours outside skins / hair_colors take the nearest entry. The item must be in its own slot (hat in hat, ...); anything else is the default.',
];
