// The art of every pet (pets.ts): each one has a sprite with two walk frames in the size the table says, its anchors lie inside that
// sprite, and the one place that draws pet gear (drawWorn in the art package) puts the test neckerchief on every pet.
import { beforeAll, describe, expect, it } from 'vitest';
import { PETS, PET_ANCHORS, PET_COSMETICS, PET_IDS } from '@lilla-garden/shared';

/** A canvas that only counts what is painted on it (the art draws with fillRect and image data; no browser is needed). */
let paints = 0;
const fakeCanvas = (): unknown => {
  const c: Record<string, unknown> = { width: 0, height: 0 };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => {
      if (k === 'fillRect' || k === 'putImageData' || k === 'drawImage') return () => void paints++;
      if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      if (k === 'canvas') return c;
      return k in t ? t[k] : () => {};
    },
    set: (t, k: string, v) => {
      t[k] = v;
      return true;
    },
  });
  c.getContext = () => ctx;
  return c;
};

type Art = typeof import('../../art/src/animals.ts');
let art: Art;

beforeAll(async () => {
  (globalThis as unknown as { document: unknown }).document = { createElement: fakeCanvas };
  await import('../../art/src/textures.ts'); // (the order the game loads the art in)
  art = await import('../../art/src/animals.ts');
});

const drawn = (f: () => unknown): number => {
  paints = 0;
  f();
  return paints;
};

describe('the art of the pets', () => {
  for (const id of PET_IDS) {
    it(`${id}: two walk frames drawn in a sprite of the species' size, with its anchors inside it`, () => {
      const d = PETS[id]!;
      const size = art.ANIMAL_SIZE[d.species];
      expect(size, `${d.species} has a size`).toBeTruthy();
      for (const f of [0, 1]) expect(drawn(() => art.drawAnimal(d.species, f, false, false)), `${d.species} frame ${f}`).toBeGreaterThan(20);
      for (const a of PET_ANCHORS)
        for (const [x, y] of d.anchors[a]) {
          expect(x).toBeLessThan(size!.w);
          expect(y).toBeLessThan(size!.h);
        }
    });

    it(`${id}: the test neckerchief is drawn on it, at its neck anchor, on both frames`, () => {
      const d = PETS[id]!;
      const item = Object.keys(PET_COSMETICS)[0]!;
      for (const f of [0, 1]) {
        const bare = drawn(() => art.drawAnimal(d.species, f, false, false));
        const worn = drawn(() => art.drawAnimal(d.species, f, false, false, 0, { [PET_COSMETICS[item]!.anchor]: item }));
        expect(worn, `${id} frame ${f}`).toBeGreaterThan(bare);
      }
    });
  }
});
