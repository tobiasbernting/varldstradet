// The browser side of export-sprites.mts: bundled by Vite, run in Playwright's Chromium, draws the game's pixel art
// (packages/client/src/art, which needs a canvas) and hands back PNG data for every sheet. Nothing here runs in Node.
import { CLASSES, DUNGEONS, SAGA_BOSSES, type ClassId } from '@lilla-garden/shared';
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
  }
  return [...set].sort();
}

export function render(dungeons: (keyof typeof DUNGEONS)[]): { sheets: Sheet[]; heroes: Record<string, string[]>; skins: string[]; species: string[] } {
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
  return { sheets, heroes, skins: [...SKIN_TONES], species };
}
