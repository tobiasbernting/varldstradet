// The art of the dungeons' monsters (shared/src/mobs.ts): every species of every family has a sprite with two walk frames in
// each of its skins and as an illusion, a size, and anchors for the role gear that lie inside its sprite; the gear itself
// (staff or crown, bow or quiver, shield) is drawn for every species and touches the sprite.
import { beforeAll, describe, expect, it } from 'vitest';
import { MOB_ARCHETYPE, MOB_FAMILIES, MOB_SKINS, mobVariant } from '@varldstradet/shared';

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
type Gear = typeof import('../../art/src/rolegear.ts');
let art: Art;
let gear: Gear;

beforeAll(async () => {
  (globalThis as unknown as { document: unknown }).document = { createElement: fakeCanvas };
  await import('../../art/src/textures.ts'); // (the order the game loads the art in)
  art = await import('../../art/src/animals.ts');
  gear = await import('../../art/src/rolegear.ts');
});

const drawn = (f: () => unknown): number => {
  paints = 0;
  f();
  return paints;
};

describe('the art of the dungeons’ monsters', () => {
  for (const [d, fam] of Object.entries(MOB_FAMILIES)) {
    it(`${d}: six species, each drawn on both walk frames in three skins and as an illusion`, () => {
      expect(fam).toHaveLength(6);
      for (const k of fam) {
        const size = art.ANIMAL_SIZE[k.species];
        expect(size, `${k.species} has a size`).toBeTruthy();
        expect(size!.w).toBeGreaterThanOrEqual(12);
        expect(size!.h).toBeGreaterThanOrEqual(12);
        // every skin, plain and as an illusion, is a variant the client can ask for
        expect(art.ANIMAL_VARIANTS[k.species]).toBe(MOB_SKINS * 2);
        expect(MOB_SKINS).toBeGreaterThanOrEqual(3);
        for (let skin = 0; skin < MOB_SKINS; skin++)
          for (const ill of [false, true])
            for (const f of [0, 1]) expect(drawn(() => art.drawAnimal(k.species, f, false, false, mobVariant(skin, ill))), `${k.species} skin ${skin} frame ${f}`).toBeGreaterThan(10);
      }
    });
  }

  it('role gear: every species has anchors inside its sprite, and each role’s gear is drawn on both frames and touches the sprite', () => {
    const species = Object.keys(MOB_ARCHETYPE);
    expect(Object.keys(gear.ROLE_ANCHOR).sort()).toEqual([...species].sort());
    let hands = 0;
    for (const s of species) {
      const { w, h } = art.ANIMAL_SIZE[s]!;
      const a = gear.ROLE_ANCHOR[s]!;
      expect(a).toEqual(gear.roleAnchor(s));
      for (const [name, at] of Object.entries(a) as [string, [number, number]][]) {
        expect(at[0], `${s}.${name}.x`).toBeGreaterThanOrEqual(0);
        expect(at[0], `${s}.${name}.x`).toBeLessThan(w);
        expect(at[1], `${s}.${name}.y`).toBeGreaterThanOrEqual(0);
        expect(at[1], `${s}.${name}.y`).toBeLessThan(h);
      }
      if (a.hand) hands++;
      for (const role of gear.ROLE_GEARS)
        for (const f of [0, 1]) {
          const g = gear.roleGear(role, s, f);
          expect(g.px.w).toBeLessThanOrEqual(14);
          expect(g.px.h).toBeLessThanOrEqual(20);
          // it overlaps the sprite's box
          expect(g.x < w && g.x + g.px.w > 0 && g.y < h && g.y + g.px.h > 0, `${role} on ${s}`).toBe(true);
          expect(drawn(() => gear.drawRoleGear((fakeCanvas() as HTMLCanvasElement).getContext('2d')!, role, s, f))).toBe(1);
        }
    }
    // some hold a staff or a bow, the beasts wear the crown or the quiver
    expect(hands).toBeGreaterThan(15);
    expect(hands).toBeLessThan(species.length);
  });

  it('a species nobody has placed gets anchors from its sprite’s size, so its gear is drawn too', () => {
    const a = gear.roleAnchor('some_new_monster');
    expect(a.hand).toBeUndefined();
    for (const at of [a.head, a.front, a.back]) {
      expect(at[0]).toBeGreaterThanOrEqual(0);
      expect(at[0]).toBeLessThan(16);
      expect(at[1]).toBeLessThan(16);
    }
    for (const role of gear.ROLE_GEARS) expect(gear.roleGear(role, 'some_new_monster', 0).px.w).toBeGreaterThan(4);
  });
});
