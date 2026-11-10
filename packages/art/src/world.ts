// Terrain tiles, world objects, crops and effects — all drawn in code.
import { type Terrain } from '@varldstradet/shared';
import { Px, hash2, shade } from './px.js';
import { drawSaga } from './saga.ts';
import { crystalLamp, dragonEgg, mushroomLamp, wispJar } from './decor.ts';
import { drawHouse } from './house.ts';
import { addBiomeTerrain, edgeGroup } from './terrain2.ts';

export const OUTLINE = '#2b2419';
const WOOD = '#9a6a3a';
const WOOD_D = '#6f4a26';
const WOOD_L = '#c58f55';
const STONE = '#9d9a92';
const STONE_D = '#6f6c66';
const STONE_L = '#c9c6bd';
const LEAF = '#4f9a3a';
const LEAF_D = '#357028';
const LEAF_L = '#7fc35a';

// ---------------------------------------------------------------------------
// Terrain (16x16). Index order matters: see TERRAIN_INDEX.
// ---------------------------------------------------------------------------

export interface TerrainTiles {
  canvas: HTMLCanvasElement;
  /** frame index per terrain (+variant). `mask` = sides with a different kind of ground (1 up, 2 right, 4 down, 8 left). */
  index: (t: Terrain, x: number, y: number, snow: boolean, mask?: number, frame?: number) => number;
  waterFrames: [number, number];
  rock: number;
  count: number;
  /** Which neighbours count as the same ground for a tile's edges (null: it has none). */
  edgeGroup: (t: Terrain) => ((n: Terrain | undefined) => boolean) | null;
}

export function drawTerrainTiles(): TerrainTiles {
  const tiles: Px[] = [];
  const add = (p: Px) => tiles.push(p) - 1;
  const speck = (p: Px, seed: number, n: number, c: string, len = 1) => {
    for (let i = 0; i < n; i++) {
      const h = hash2(seed * 31 + i, seed * 17 + i * 7);
      const x = h % 16;
      const y = Math.floor(h / 16) % 16;
      p.rect(x, y, 1, len, c);
    }
  };

  // grass x8: soft patches, tiny flowers, pebbles
  const grass: number[] = [];
  const GRASS = '#64a848';
  for (let v = 0; v < 8; v++) {
    const p = new Px(16, 16).rect(0, 0, 16, 16, GRASS);
    // soft, organic grass: short tufts in two greens, a few lighter blades, the odd flower or pebble
    const h = hash2(v * 13, v * 7);
    const tuftAt = (x: number, y: number, c: string) => p.rect(x, y, 1, 2, c).rect(x + 1, y + 1, 1, 1, c);
    for (let i = 0; i < 3 + (v % 3); i++) {
      const t = hash2(h + i * 29, v * 11 + i);
      tuftAt(t % 14, Math.floor(t / 16) % 13, i % 2 ? '#578f3c' : '#5a9a40');
    }
    speck(p, 200 + v, 2 + (v % 2), '#7cc05a', 1);
    if (v === 2) p.rect(4, 4, 4, 3, '#5c9c40').rect(5, 3, 2, 1, '#5c9c40');
    if (v === 4) p.rect(9, 9, 5, 3, '#5c9c40').rect(10, 8, 3, 1, '#5c9c40');
    if (v === 5) p.rect(3, 4, 1, 1, '#ffffff').rect(11, 10, 1, 1, '#ffe66a');
    if (v === 6) p.rect(7, 12, 2, 1, '#8f8a80');
    if (v === 7) p.rect(12, 3, 1, 1, '#ff9ac8');
    grass.push(add(p));
  }
  // snow grass x2
  const snow: number[] = [];
  for (let v = 0; v < 2; v++) {
    const p = new Px(16, 16).rect(0, 0, 16, 16, '#eef2f7');
    speck(p, 300 + v, 4, '#d6dfe9', 1);
    speck(p, 400 + v, 2, '#ffffff', 1);
    snow.push(add(p));
  }
  // soil, soil_wet: 16 edge variants each, with a rounded grass fringe on open sides
  const soilTile = (base: string, dark: string, mask: number) => {
    const p = new Px(16, 16).rect(0, 0, 16, 16, base);
    for (let y = 2; y < 16; y += 4) p.rect(0, y, 16, 1, dark);
    speck(p, 500 + mask, 6, dark, 1);
    const g = GRASS;
    const gd = '#4f8a35';
    if (mask & 1) p.rect(0, 0, 16, 2, g).rect(0, 2, 16, 1, gd).rect(3, 2, 2, 1, g).rect(10, 2, 3, 1, g);
    if (mask & 4) p.rect(0, 14, 16, 2, g).rect(0, 13, 16, 1, gd).rect(5, 13, 3, 1, g).rect(12, 13, 2, 1, g);
    if (mask & 8) p.rect(0, 0, 2, 16, g).rect(2, 0, 1, 16, gd).rect(2, 4, 1, 2, g).rect(2, 11, 1, 2, g);
    if (mask & 2) p.rect(14, 0, 2, 16, g).rect(13, 0, 1, 16, gd).rect(13, 3, 1, 3, g).rect(13, 10, 1, 2, g);
    // rounded corners
    if (mask & 1 && mask & 8) p.rect(0, 0, 4, 4, g).px(3, 3, gd);
    if (mask & 1 && mask & 2) p.rect(12, 0, 4, 4, g).px(12, 3, gd);
    if (mask & 4 && mask & 8) p.rect(0, 12, 4, 4, g).px(3, 12, gd);
    if (mask & 4 && mask & 2) p.rect(12, 12, 4, 4, g).px(12, 12, gd);
    return add(p);
  };
  const soilVariants: number[] = [];
  const soilWetVariants: number[] = [];
  for (let m = 0; m < 16; m++) {
    soilVariants.push(soilTile('#9a6a3a', '#7a5028', m));
    soilWetVariants.push(soilTile('#5f3d1d', '#452a12', m));
  }
  const soilI = soilVariants[0]!;
  const soilWetI = soilWetVariants[0]!;
  // water: 2 frames; 16 shore variants x 2 frames with shallow water and foam on land sides
  const water: number[] = [];
  const waterShore: number[][] = [];
  const waterTile = (f: number, mask: number) => {
    const deep = '#3a80d0';
    const p = new Px(16, 16).rect(0, 0, 16, 16, deep);
    const o = f * 2;
    p.rect(2 + o, 3, 4, 1, '#7fb6ee').rect(9 + o, 8, 4, 1, '#7fb6ee').rect(4 - o, 12, 3, 1, '#7fb6ee').rect(11 - o, 1, 3, 1, '#2d6cb8');
    if (mask) {
      const shallow = '#6fb3ea';
      const foam = f === 0 ? '#dff2ff' : '#b9dcf7';
      if (mask & 1) p.rect(0, 0, 16, 3, shallow).rect(0, 0, 16, 1, foam).rect(4 + o, 1, 3, 1, foam);
      if (mask & 4) p.rect(0, 13, 16, 3, shallow).rect(0, 15, 16, 1, foam).rect(8 - o, 14, 3, 1, foam);
      if (mask & 8) p.rect(0, 0, 3, 16, shallow).rect(0, 0, 1, 16, foam).rect(1, 5 + o, 1, 3, foam);
      if (mask & 2) p.rect(13, 0, 3, 16, shallow).rect(15, 0, 1, 16, foam).rect(14, 9 - o, 1, 3, foam);
      if (mask & 1 && mask & 8) p.rect(0, 0, 5, 5, shallow).rect(0, 0, 5, 1, foam).rect(0, 0, 1, 5, foam);
      if (mask & 1 && mask & 2) p.rect(11, 0, 5, 5, shallow).rect(11, 0, 5, 1, foam).rect(15, 0, 1, 5, foam);
      if (mask & 4 && mask & 8) p.rect(0, 11, 5, 5, shallow).rect(0, 15, 5, 1, foam).rect(0, 11, 1, 5, foam);
      if (mask & 4 && mask & 2) p.rect(11, 11, 5, 5, shallow).rect(11, 15, 5, 1, foam).rect(15, 11, 1, 5, foam);
    }
    return add(p);
  };
  for (let m = 0; m < 16; m++) {
    const frames = [waterTile(0, m), waterTile(1, m)];
    waterShore.push(frames);
    if (m === 0) water.push(...frames);
  }
  // pool (the bath house): bright turquoise, 2 frames; a pale stone rim on the open sides
  const poolTile = (f: number, mask: number) => {
    const p = new Px(16, 16).rect(0, 0, 16, 16, '#4fc0e6');
    const o = f * 2;
    p.rect(2 + o, 3, 4, 1, '#bff0ff').rect(9 + o, 8, 4, 1, '#bff0ff').rect(4 - o, 12, 3, 1, '#bff0ff').rect(11 - o, 1, 3, 1, '#2fa0d0');
    speck(p, 700 + f, 3, '#8fe0f8', 1);
    if (mask) {
      const rim = '#d8d4c8';
      const rimD = '#a9a59a';
      if (mask & 1) p.rect(0, 0, 16, 2, rim).rect(0, 2, 16, 1, rimD);
      if (mask & 4) p.rect(0, 14, 16, 2, rim).rect(0, 13, 16, 1, rimD);
      if (mask & 8) p.rect(0, 0, 2, 16, rim).rect(2, 0, 1, 16, rimD);
      if (mask & 2) p.rect(14, 0, 2, 16, rim).rect(13, 0, 1, 16, rimD);
    }
    return add(p);
  };
  const pool: number[][] = [];
  for (let m = 0; m < 16; m++) pool.push([poolTile(0, m), poolTile(1, m)]);
  // the market town: cobbles worn lighter down the middle of a street, flagstone pavements, pale slabs to cross on.
  // Every cobble tile has the same stones in the same places (rows of 3-pixel stones over 1 pixel of mortar,
  // wrapping at the tile edge) so neighbours run on; only their colours change between the variants.
  const COBBLES = ['#a39a8c', '#978d80', '#ab9f90', '#9c9184', '#a09a92', '#a8998a'];
  const COBBLE_ROWS: [number, number[]][] = [
    [0, [6, 5, 5]],
    [3, [5, 6, 5]],
    [1, [5, 5, 6]],
    [4, [6, 5, 5]],
  ];
  const cobbles = (p: Px, seed: number, worn: (x: number, y: number) => number) => {
    p.rect(0, 0, 16, 16, '#6a6056');
    COBBLE_ROWS.forEach(([start, widths], r) => {
      let x = start;
      widths.forEach((w, i) => {
        const base = COBBLES[hash2(r * 7 + i * 3 + seed * 11, seed * 5 + r + i) % COBBLES.length]!;
        const sw = w - 1;
        for (let sy = 0; sy < 3; sy++)
          for (let sx = 0; sx < sw; sx++) {
            if (sy === 0 && (sx === 0 || sx === sw - 1)) continue; // rounded tops
            const px = (x + sx) % 16;
            const py = r * 4 + sy;
            const c = sy === 0 ? shade(base, 1.14) : sy === 2 ? shade(base, 0.8) : sx === sw - 1 ? shade(base, 0.9) : base;
            const k = worn(px, py);
            p.px(px, py, k > 0 ? shade(c, 1 + 0.28 * k) : c);
          }
        x += w;
      });
    });
    return p;
  };
  const roadTile = (mask: number, v: number) => {
    // the worn middle sits where the dashes were: along the edge between the two lanes of a street
    const up = mask & 1;
    const right = mask & 2;
    const down = mask & 4;
    const left = mask & 8;
    const along = (d: number) => (d < 5 ? 1 - d / 6 : 0);
    const worn = (x: number, y: number): number => {
      if (up && !down && !left && !right) return along(15 - y);
      if (down && !up && !left && !right) return along(y);
      if (left && !right && !up && !down) return along(15 - x);
      if (right && !left && !up && !down) return along(x);
      return 0;
    };
    const p = cobbles(new Px(16, 16), v * 7 + mask, worn);
    // a darker kerb row along the pavement
    if (up) p.rect(0, 0, 16, 1, '#4e463e');
    if (down) p.rect(0, 15, 16, 1, '#4e463e');
    if (left) p.rect(0, 0, 1, 16, '#4e463e');
    if (right) p.rect(15, 0, 1, 16, '#4e463e');
    return add(p);
  };
  const road = Array.from({ length: 16 }, (_, m) => [0, 1, 2].map((v) => roadTile(m, v)));
  // flagstones: mortar along the top and left edge of every tile, the slabs inside split differently per variant
  const FLAGS: [number, number, number, number][][] = [
    [[1, 1, 8, 6], [10, 1, 6, 6], [1, 8, 4, 8], [6, 8, 10, 8]],
    [[1, 1, 7, 9], [9, 1, 7, 4], [9, 6, 7, 10], [1, 11, 7, 5]],
    [[1, 1, 15, 8], [1, 10, 5, 6], [7, 10, 9, 6]],
    [[1, 1, 10, 5], [12, 1, 4, 15], [1, 7, 10, 9]],
  ];
  const SLABS = ['#c2baa8', '#b8b09e', '#cbc4b2', '#b4ad9d', '#bfb5a0'];
  const sidewalk = FLAGS.map((slabs, v) => {
    const p = new Px(16, 16).rect(0, 0, 16, 16, '#8a8478');
    slabs.forEach(([x, y, w, h], i) => {
      const c = SLABS[(v * 3 + i * 2) % SLABS.length]!;
      p.rect(x, y, w, h, c).rect(x, y, w, 1, shade(c, 1.1)).rect(x, y + h - 1, w, 1, shade(c, 0.9)).rect(x + w - 1, y, 1, h, shade(c, 0.92));
    });
    speck(p, 1200 + v, 3, '#a8a090', 1);
    if (v === 1) p.px(4, 4, '#9a9284').px(5, 5, '#9a9284').px(5, 6, '#9a9284'); // a hairline crack
    return add(p);
  });
  // two big pale slabs per tile, laid across the street the way people walk over it
  const crossingTile = (vertical: boolean) => {
    const p = cobbles(new Px(16, 16), 40 + (vertical ? 1 : 0), () => 0);
    for (const o of [1, 9]) {
      const [x, y, w, h] = vertical ? [o, 2, 6, 12] : [2, o, 12, 6];
      p.rect(x, y, w, h, '#ddd6c4').rect(x, y, w, 1, '#efe9d9').rect(x, y + h - 1, w, 1, '#a9a191').rect(x + w - 1, y, 1, h, '#b9b1a0');
      p.px(x, y, '#6a6056').px(x + w - 1, y, '#6a6056').px(x, y + h - 1, '#6a6056').px(x + w - 1, y + h - 1, '#6a6056');
      p.px(x + 2, y + 2, '#c9c2b0').px(x + w - 3, y + h - 3, '#c9c2b0');
    }
    return add(p);
  };
  const crossing = [crossingTile(false), crossingTile(true)];
  const railP = new Px(16, 16).rect(0, 0, 16, 16, '#8f8a80');
  speck(railP, 1300, 5, '#7a766d', 1);
  for (let x = 1; x < 16; x += 4) railP.rect(x, 3, 2, 10, '#5a3d20');
  railP.rect(0, 5, 16, 1, '#b8b8c0').rect(0, 6, 16, 1, '#6e6e78').rect(0, 10, 16, 1, '#b8b8c0').rect(0, 11, 16, 1, '#6e6e78');
  const railI = add(railP);
  // sand
  const sandP = new Px(16, 16).rect(0, 0, 16, 16, '#e3d08f');
  speck(sandP, 600, 5, '#cdb878', 1);
  const sandI = add(sandP);
  // path_stone
  const ps = new Px(16, 16).rect(0, 0, 16, 16, '#8d8a82');
  for (const [x, y, w, h] of [
    [1, 1, 6, 5],
    [8, 1, 7, 4],
    [1, 7, 4, 4],
    [6, 6, 9, 5],
    [1, 12, 7, 3],
    [9, 12, 6, 3],
  ] as const)
    ps.rect(x, y, w, h, '#b5b2a8').rect(x, y, w, 1, '#cbc8bf');
  const pathStoneI = add(ps);
  // path_dirt
  const pd = new Px(16, 16).rect(0, 0, 16, 16, '#c9a978');
  speck(pd, 700, 7, '#a98858', 1);
  speck(pd, 800, 3, '#e0c48f', 1);
  const pathDirtI = add(pd);
  // floor_wood
  const fw = new Px(16, 16).rect(0, 0, 16, 16, '#b07a44');
  for (let y = 0; y < 16; y += 4) fw.rect(0, y, 16, 1, '#8a5c30').rect(y % 8 === 0 ? 7 : 2, y + 1, 1, 3, '#8a5c30');
  const floorWoodI = add(fw);
  // floor_stone
  const fs = new Px(16, 16).rect(0, 0, 16, 16, '#b9b6ad');
  fs.rect(0, 0, 16, 1, '#8e8b83').rect(0, 8, 16, 1, '#8e8b83').rect(0, 0, 1, 16, '#8e8b83').rect(8, 0, 1, 8, '#8e8b83').rect(4, 8, 1, 8, '#8e8b83').rect(12, 8, 1, 8, '#8e8b83');
  const floorStoneI = add(fs);

  // gravel and ice
  const gravelP = new Px(16, 16).rect(0, 0, 16, 16, '#8f8a80');
  speck(gravelP, 950, 7, '#6f6a62', 1);
  speck(gravelP, 960, 4, '#aaa59b', 1);
  const gravelI = add(gravelP);
  const iceP = new Px(16, 16).rect(0, 0, 16, 16, '#bfe3f5').rect(2, 3, 5, 1, '#ffffff').rect(9, 9, 4, 1, '#ffffff').rect(5, 12, 3, 1, '#9fcfe8');
  const iceI = add(iceP);
  // cave rock (solid darkness with a faint texture)
  const rockP = new Px(16, 16).rect(0, 0, 16, 16, '#1d1c22');
  speck(rockP, 900, 4, '#26252c', 2);
  const rockI = add(rockP);
  // the wider world: cliffs, lava, swamp, moss, candy, the moon…
  const biome = addBiomeTerrain(add);

  // several rows: a single row would exceed the GPU's texture width limit
  const cols = 32;
  const sheet = new Px(16 * cols, 16 * Math.ceil(tiles.length / cols));
  tiles.forEach((t, i) => sheet.blit(t, (i % cols) * 16, Math.floor(i / cols) * 16));
  return {
    canvas: sheet.canvas,
    count: tiles.length,
    rock: rockI,
    edgeGroup,
    waterFrames: [water[0]!, water[1]!],
    index: (t, x, y, snowy, mask = 0, frame = 0) => {
      const h = hash2(x, y);
      const wider = biome.index(t, x, y, snowy, mask, frame);
      if (wider !== null) return wider;
      switch (t) {
        case 'grass':
          return snowy ? snow[h % 2]! : grass[h % grass.length]!;
        case 'soil':
          return soilVariants[mask % soilVariants.length] ?? soilI;
        case 'soil_wet':
          return soilWetVariants[mask % soilWetVariants.length] ?? soilWetI;
        case 'water':
          return waterShore[mask % waterShore.length]![frame]!;
        case 'sand':
          return snowy ? snow[h % 2]! : sandI;
        case 'path_stone':
          return pathStoneI;
        case 'path_dirt':
        case 'dirt': // (3D game only)
          return pathDirtI;
        case 'floor_wood':
          return floorWoodI;
        case 'floor_stone':
          return floorStoneI;
        case 'snow':
          return snow[h % 2]!;
        case 'gravel':
        case 'stone': // (3D game only)
          return gravelI;
        case 'ice':
          return iceI;
        case 'pool':
          return pool[mask % pool.length]![frame]!;
        case 'road':
          return road[mask & 15]![h % 3]!;
        case 'sidewalk':
          return sidewalk[h % sidewalk.length]!;
        case 'crossing':
          return crossing[mask & 5 ? 0 : 1]!;
        case 'rail':
          return railI;
        default:
          return grass[0]!;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Objects. Each kind -> list of variant/frames canvases + anchor info.
// ---------------------------------------------------------------------------

export interface ObjectArt {
  frames: Px[];
  /** Pixel offset of the sprite's top-left relative to the object's tile origin. */
  ox: number;
  oy: number;
  /** Sort offset in pixels added to the footprint's bottom edge. */
  animated?: boolean;
}

const tree = (kind: 'round' | 'pine' | 'apple', v: number): Px => {
  const p = new Px(24, 36);
  if (kind === 'pine') {
    p.rect(10, 28, 4, 8, '#5a3d20').rect(10, 28, 1, 8, '#3e2a14');
    const layers: [number, number, number][] = [
      [4, 20, 20],
      [6, 13, 16],
      [8, 6, 12],
      [10, 1, 6],
    ];
    for (const [, y, w] of layers) {
      const h = 10;
      for (let yy = 0; yy < h; yy++) {
        const half = Math.round((w / 2) * (yy / h)) + 1;
        const c = yy < 2 ? '#4f9a48' : yy < h - 3 ? '#2f7a3a' : '#215a2a';
        p.rect(12 - half, y + yy, half * 2, 1, c);
        if (yy >= 2 && half > 2) p.rect(12 - half, y + yy, Math.max(1, Math.floor(half / 2)), 1, yy < h - 3 ? '#245f2d' : '#19461f');
        if (yy >= 2 && half > 1) p.rect(12 + half - 1, y + yy, 1, 1, yy < h - 3 ? '#4f9a48' : '#2f7a3a');
      }
    }
    p.rect(11, 0, 2, 2, '#6fc060');
  } else {
    p.rect(10, 24, 4, 12, '#8a5a2a').rect(10, 24, 1, 12, '#5a3d20').rect(13, 24, 1, 12, '#a5733a').rect(8, 33, 8, 3, '#5a3d20');
    p.ellipse(2, 6, 20, 18, '#2c6b2e'); // dark base
    p.ellipse(3, 3, 18, 18, '#3f8f3a');
    p.ellipse(5, 2, 12, 11, '#55aa48');
    p.ellipse(7 + (v % 2) * 2, 3, 6, 4, '#8ad66a').ellipse(13 - (v % 2) * 3, 9, 4, 3, '#8ad66a');
    p.ellipse(2, 15, 9, 7, '#2c6b2e').ellipse(14, 14, 8, 7, '#2c6b2e');
    if (kind === 'apple') {
      for (const [x, y] of [
        [6, 11],
        [13, 7],
        [16, 15],
        [9, 18],
      ] as const)
        p.rect(x, y, 2, 2, '#d8363a').px(x, y, '#ff8a8a');
    }
  }
  return p.outline('#1f2a18');
};

const rock = (big: boolean): Px => {
  const p = new Px(16, 16);
  if (big) {
    p.ellipse(1, 4, 14, 11, STONE_D).ellipse(2, 3, 12, 10, STONE).ellipse(4, 4, 5, 3, STONE_L);
  } else {
    p.ellipse(4, 8, 9, 7, STONE_D).ellipse(5, 7, 7, 6, STONE).rect(6, 8, 2, 1, STONE_L);
  }
  return p.outline(OUTLINE);
};

const tuft = (v: number): Px => {
  const p = new Px(16, 16);
  const c = '#3f8a2e';
  const l = '#6cb84a';
  const xs = v === 0 ? [3, 6, 9, 12] : v === 1 ? [2, 5, 8, 11, 13] : [4, 7, 10];
  xs.forEach((x, i) => {
    p.rect(x, 9 + (i % 2) * 2, 1, 6 - (i % 2) * 2, c).px(x, 9 + (i % 2) * 2, l);
    p.px(x + 1, 11 + (i % 2), c);
  });
  return p;
};

const flower = (v: number, mid = false): Px => {
  const p = new Px(16, 16);
  const cols = mid ? ['#5aa0e8', '#f5e04a', '#ffffff', '#e87ab8'] : ['#e8502a', '#f5d94a', '#e87ab8', '#ffffff'];
  const c = cols[v % cols.length]!;
  const stem = '#3f8a2e';
  const pts: [number, number][] = mid ? [[3, 8], [9, 5], [12, 11], [6, 12]] : [[4, 7], [10, 9]];
  for (const [x, y] of pts) {
    p.rect(x + 1, y + 2, 1, 5, stem).px(x, y + 4, stem);
    p.rect(x, y + 1, 3, 1, c).rect(x + 1, y, 1, 3, c).px(x + 1, y + 1, '#f7c948');
  }
  return p;
};

const bush = (): Px => new Px(16, 16).ellipse(0, 3, 16, 13, LEAF_D).ellipse(2, 2, 12, 11, LEAF).ellipse(4, 4, 4, 3, LEAF_L).outline(OUTLINE);

/** Paint colours; index 0 = unpainted (natural wood / stone / the farmhouse's cream). */
export const PAINT_COLORS = ['', '#c9433c', '#f0d060', '#6a9fd8', '#7fb86a', '#f4f2ec', '#f0a8c8'];

const building = (w: number, h: number, wallC: string, roofC: string, door = true, opts: { windows?: number; roofH?: number; label?: string } = {}): Px => {
  const roofH = opts.roofH ?? Math.round(h * 0.45);
  const p = new Px(w, h);
  const wallTop = roofH;
  p.rect(1, wallTop, w - 2, h - wallTop - 1, wallC).rect(1, wallTop, w - 2, 1, shade(wallC, 1.2));
  for (let x = 1; x < w - 1; x += 5) p.rect(x, wallTop, 1, h - wallTop - 1, shade(wallC, 0.85));
  // roof: trapezoid
  for (let y = 0; y < roofH; y++) {
    const inset = Math.max(0, Math.round(((roofH - 1 - y) / (roofH - 1)) * (w / 2 - 4)));
    p.rect(inset, y, w - inset * 2, 1, y % 3 === 0 ? shade(roofC, 0.85) : roofC);
  }
  p.rect(0, roofH - 1, w, 2, shade(roofC, 0.7));
  if (door) {
    const dw = Math.min(10, Math.max(6, Math.round(w / 5)));
    const dx = Math.round(w / 2 - dw / 2);
    p.rect(dx, h - 2 - Math.round(h * 0.3), dw, Math.round(h * 0.3) + 1, WOOD_D).rect(dx + 1, h - 1 - Math.round(h * 0.3), dw - 2, Math.round(h * 0.3), WOOD);
    p.rect(dx + dw - 3, h - Math.round(h * 0.15) - 1, 1, 1, '#f2d35a');
  }
  const windows = opts.windows ?? 0;
  for (let i = 0; i < windows; i++) {
    const wx = Math.round(((i + 1) * w) / (windows + 1)) - 3;
    const wy = wallTop + 4;
    p.rect(wx, wy, 6, 6, '#8fd0f0').rect(wx + 2, wy, 1, 6, WOOD_D).rect(wx, wy + 2, 6, 1, WOOD_D).box(wx - 1, wy - 1, 8, 8, WOOD_D);
  }
  return p.outline(OUTLINE);
};

const BEAM = '#4a3020';
const IRON = '#3a3a40';
const IRON_L = '#6e6e78';
const BRASS = '#d9a640';
const BRASS_D = '#9a6a20';
const BRASS_L = '#f2d27a';
const FLAME = '#ffd45a';
const FLAME_L = '#fff1a0';
const RUNE = '#3a9cff';
const RUNE_L = '#8ac8ff';

/** An iron lantern on a wooden post with a stone foot. */
const streetLamp = (): Px => {
  const p = new Px(16, 24);
  p.rect(7, 8, 2, 14, WOOD_D).rect(7, 8, 1, 14, WOOD).rect(5, 21, 6, 3, STONE_D).rect(5, 21, 6, 1, STONE_L);
  p.rect(5, 8, 6, 1, IRON).px(5, 9, IRON).px(10, 9, IRON);
  p.rect(7, 0, 2, 1, IRON).rect(6, 1, 4, 1, IRON).rect(4, 2, 8, 1, IRON);
  p.rect(5, 3, 6, 5, IRON).rect(6, 3, 4, 4, FLAME).rect(6, 3, 2, 2, FLAME_L).rect(8, 3, 1, 4, shade(IRON, 1.3));
  p.rect(5, 7, 6, 1, IRON);
  return p.outline(OUTLINE);
};

/** A wooden cart wheel: rim, four spokes (turned a little on odd frames), an iron hub. */
const spokeWheel = (p: Px, cx: number, cy: number, r: number, f = 0): void => {
  p.circle(cx, cy, r, BEAM).circle(cx, cy, r - 1, WOOD).circle(cx, cy, r - 2, '#2a1a10');
  const k = Math.max(1, Math.round(r - 2));
  const x = Math.round(cx - 0.5);
  const y = Math.round(cy - 0.5);
  if (f % 2 === 0) p.rect(x - k, y, k * 2 + 1, 1, WOOD).rect(x, y - k, 1, k * 2 + 1, WOOD);
  else for (let i = -k + 1; i < k; i++) p.px(x + i, y + i, WOOD).px(x + i, y - i, WOOD);
  p.px(x, y, IRON_L);
};
const barrel = (p: Px, x: number, y: number, w = 6, h = 7): void => {
  p.ellipse(x, y, w, h, '#9a6a3a').rect(x + 1, y, w - 2, h, '#9a6a3a').rect(x + 1, y + 1, 1, h - 2, '#c58f55');
  p.rect(x, y + 1, w, 1, IRON).rect(x, y + h - 2, w, 1, IRON).rect(x + w - 2, y + 1, 1, h - 2, '#6f4a26');
  p.rect(x + 1, y, w - 2, 1, '#c58f55');
};
const hay = (p: Px, x: number, y: number, w: number, h: number): void => {
  p.ellipse(x, y, w, h + 3, '#d8b04a').rect(x, y + Math.floor(h / 2) + 1, w, Math.ceil(h / 2) + 1, '#d8b04a');
  for (let i = 0; i < w; i += 2) p.rect(x + i, y + 2 + ((i * 3) % 4), 1, 2, i % 4 ? '#f0d070' : '#b8902a');
  p.px(x + 2, y + 1, '#f0d070').px(x + w - 3, y + 2, '#f0d070');
};

/** A tall pole with a cloth banner (16×40, standing on its tile): red with a gold knot, blue with a raven, green with a tree. */
const BANNERS: { c: string; e: string; rows: string[] }[] = [
  { c: '#b8302a', e: '#f0c040', rows: ['.###.', '#.#.#', '###.#', '#.###', '#.#.#', '.###.'] },
  { c: '#2f5aa8', e: '#1a1a22', rows: ['..##.', '.####', '####.', '.###.', '..#..', '.#.#.'] },
  { c: '#2e7a3a', e: '#f0c040', rows: ['.###.', '#####', '.###.', '..#..', '..#..', '.###.'] },
];
const bannerPole = (v: number): Px => {
  const b = BANNERS[v % BANNERS.length]!;
  const p = new Px(16, 40);
  p.rect(7, 3, 2, 34, WOOD_D).rect(7, 3, 1, 34, WOOD);
  p.rect(6, 0, 4, 3, BRASS).rect(7, 0, 1, 2, BRASS_L).px(6, 0, BRASS_D).px(9, 0, BRASS_D);
  p.rect(2, 5, 12, 2, WOOD_D).rect(2, 5, 12, 1, WOOD_L).px(2, 7, BRASS).px(13, 7, BRASS);
  // the cloth with a swallowtail hem and a gold border
  p.rect(3, 7, 10, 18, b.c).rect(3, 7, 10, 1, shade(b.c, 0.7)).rect(3, 8, 1, 17, shade(b.c, 1.2)).rect(12, 8, 1, 17, shade(b.c, 0.75));
  p.rect(3, 25, 4, 3, b.c).rect(9, 25, 4, 3, b.c).px(3, 28, b.c).px(12, 28, b.c);
  p.rect(4, 9, 8, 1, BRASS).rect(4, 23, 8, 1, BRASS);
  p.tpl(6, 13, b.rows, { '#': b.e });
  p.rect(5, 36, 6, 4, STONE_D).rect(5, 36, 6, 1, STONE_L).rect(6, 37, 4, 2, STONE);
  return p.outline(OUTLINE);
};

/** Three barrels stacked on their ends, two below and one on top (16×20). */
const barrelStack = (): Px => {
  const p = new Px(16, 20);
  barrel(p, 4, 0, 8, 9);
  barrel(p, 0, 9, 8, 10);
  barrel(p, 8, 9, 8, 10);
  p.rect(9, 10, 2, 1, '#5a3d20');
  return p.outline(OUTLINE);
};

/** A runestone (16×28): grey granite carved with a serpent band, its runes glowing blue, brighter on frame 1. */
const runestone = (f: number): Px => {
  const p = new Px(16, 28);
  const G = '#8a8a8e';
  p.ellipse(2, 1, 11, 10, G).rect(2, 6, 12, 18, G).ellipse(1, 20, 14, 7, G).px(13, 4, G).px(13, 5, G);
  p.rect(3, 6, 2, 15, '#a4a4a8').ellipse(4, 2, 5, 4, '#a4a4a8').rect(12, 7, 2, 17, '#6a6a70').px(9, 13, '#76767c').px(6, 19, '#76767c');
  p.rect(1, 25, 14, 2, '#4f8a35').px(0, 26, '#5a9a40').px(15, 25, '#5a9a40').rect(4, 24, 1, 2, '#6aaa4a').rect(11, 24, 1, 2, '#6aaa4a');
  // the serpent band, painted red the old way, running round the stone and biting its tail at the foot
  const band = '#b8483a';
  p.line(5, 4, 10, 4, band).line(10, 4, 12, 7, band).line(12, 7, 12, 21, band).line(5, 4, 4, 7, band).line(4, 7, 4, 21, band).line(4, 21, 7, 23, band).line(12, 21, 9, 23, band);
  p.px(7, 3, band).px(8, 3, band).px(8, 23, '#f0e0c0');
  // the runes inside it glow blue, brighter on frame 1
  const g = f ? RUNE_L : RUNE;
  p.tpl(6, 7, ['|`.|', '||/.', '|.`|', '/|.|', '|`|.', '|.|/', '`|.|', '|/.|', '.|`|', '|`.|', '|.|/', '/.||', '|`..'], { '|': g, '/': g, '`': g });
  if (f) p.px(5, 6, RUNE_L).px(11, 12, RUNE_L).px(5, 18, RUNE_L);
  return p.outline(OUTLINE);
};

/** A hay wagon (32×24, on a 2×1 footprint): four wheels, a mound of hay and a pitchfork stuck in it. */
const hayCart = (): Px => {
  const p = new Px(32, 24);
  hay(p, 2, 0, 26, 12);
  p.line(22, 1, 26, 9, WOOD_L).px(21, 0, IRON_L).px(22, 0, IRON_L).px(20, 1, IRON_L).px(23, 1, IRON_L).px(21, 1, IRON).px(19, 0, IRON_L);
  p.rect(1, 13, 28, 5, '#9a6a3a').rect(1, 13, 28, 1, '#c58f55').rect(1, 17, 28, 1, WOOD_D);
  for (let x = 4; x < 28; x += 6) p.rect(x, 14, 1, 3, WOOD_D);
  p.line(29, 15, 31, 19, WOOD_D).line(29, 16, 31, 20, WOOD_D);
  spokeWheel(p, 6, 19, 4.5);
  spokeWheel(p, 23, 19, 4.5, 1);
  return p.outline(OUTLINE);
};

const house = (colour = 0): Px => {
  const p = new Px(80, 84);
  const wallC = PAINT_COLORS[colour] || '#e8dcc0';
  const trim = colour > 0 ? '#f4f2ec' : '#7a5230';
  // walls
  p.rect(2, 34, 76, 49, wallC).rect(2, 34, 76, 1, shade(wallC, 1.15));
  for (let x = 2; x < 78; x += 6) p.rect(x, 34, 1, 49, shade(wallC, 0.9));
  // roof (Swedish red)
  for (let y = 0; y < 36; y++) {
    const inset = Math.max(0, Math.round(((35 - y) / 35) * 30));
    p.rect(inset, y, 80 - inset * 2, 1, y % 4 === 0 ? '#8f2f2a' : '#b5413a');
  }
  p.rect(0, 34, 80, 3, '#7a2622');
  // chimney
  p.rect(58, 4, 8, 14, STONE_D).rect(57, 3, 10, 2, STONE);
  // door
  p.rect(35, 60, 12, 23, WOOD_D).rect(36, 61, 10, 22, WOOD).rect(44, 72, 2, 2, '#f2d35a');
  // windows
  for (const wx of [10, 60]) p.rect(wx, 44, 12, 11, '#8fd0f0').rect(wx + 5, 44, 2, 11, WOOD_D).rect(wx, 49, 12, 1, WOOD_D).box(wx - 1, 43, 14, 13, trim).rect(wx - 2, 56, 16, 2, trim);
  // flower pots under windows
  for (const wx of [10, 60]) p.rect(wx + 2, 58, 2, 2, '#e8502a').rect(wx + 7, 58, 2, 2, '#f5d94a');
  return p.outline(OUTLINE);
};

const wardrobe = (): Px => {
  const p = new Px(16, 24).rect(1, 1, 14, 22, WOOD).rect(1, 1, 14, 1, WOOD_L).rect(8, 1, 1, 22, WOOD_D).rect(6, 11, 1, 2, '#f2d35a').rect(10, 11, 1, 2, '#f2d35a');
  p.rect(2, 3, 5, 6, WOOD_D).rect(10, 3, 5, 6, WOOD_D);
  return p.outline(OUTLINE);
};
const stump = (): Px => new Px(16, 16).ellipse(2, 6, 12, 8, WOOD_D).ellipse(3, 5, 10, 6, WOOD_L).ellipse(5, 6, 6, 3, WOOD).outline(OUTLINE);

// Furniture and walls of the houses, and the decor the dungeons drop
const bench = (): Px => new Px(16, 16).rect(0, 7, 16, 3, WOOD_L).rect(0, 10, 16, 1, WOOD_D).rect(2, 11, 2, 4, WOOD_D).rect(12, 11, 2, 4, WOOD_D).rect(0, 3, 16, 3, WOOD).outline(OUTLINE);
const table = (): Px => new Px(16, 16).rect(0, 4, 16, 4, WOOD_L).rect(0, 8, 16, 1, WOOD_D).rect(1, 9, 2, 6, WOOD_D).rect(13, 9, 2, 6, WOOD_D).rect(6, 2, 4, 2, '#d8363a').outline(OUTLINE);
const flowerbox = (): Px => {
  const p = new Px(16, 16).rect(1, 9, 14, 6, WOOD).rect(1, 9, 14, 1, WOOD_L);
  for (const [x, c] of [
    [2, '#e8502a'],
    [6, '#f5d94a'],
    [10, '#e87ab8'],
  ] as const)
    p.rect(x + 1, 5, 1, 4, '#3f8a2e').rect(x, 4, 3, 1, c).rect(x + 1, 3, 1, 3, c);
  return p.outline(OUTLINE);
};
const bed = (): Px => {
  const p = new Px(16, 36).rect(1, 4, 14, 30, WOOD).rect(1, 4, 14, 2, WOOD_L).rect(2, 8, 12, 24, '#f4f0e6').rect(2, 8, 12, 6, '#ffffff').rect(2, 16, 12, 16, '#d9453b').rect(2, 16, 12, 1, '#ef7a6a');
  for (let y = 19; y < 32; y += 4) p.rect(2, y, 12, 1, '#b5362c');
  p.rect(1, 32, 14, 2, WOOD_D);
  return p.outline(OUTLINE);
};
const rug = (): Px => {
  const p = new Px(32, 32).rect(0, 0, 32, 32, '#b55a4a').rect(2, 2, 28, 28, '#d9736a').rect(5, 5, 22, 22, '#e8a898').rect(9, 9, 14, 14, '#d9736a');
  for (let i = 0; i < 32; i += 4) p.rect(i, 0, 2, 1, '#f0c8b8').rect(i + 2, 31, 2, 1, '#f0c8b8');
  return p;
};
const chair = (): Px => new Px(16, 20).rect(3, 2, 10, 2, WOOD_L).rect(3, 4, 10, 8, WOOD).rect(3, 11, 10, 3, WOOD_L).rect(3, 14, 2, 5, WOOD_D).rect(11, 14, 2, 5, WOOD_D).rect(4, 5, 8, 6, '#d9453b').outline(OUTLINE);
const sofa = (): Px => new Px(32, 20).rect(1, 3, 30, 12, '#3b6fd9').rect(1, 3, 30, 1, '#6a95ea').rect(3, 7, 26, 6, '#5a8fe8').rect(1, 13, 30, 4, '#2f4c8a').rect(2, 17, 3, 2, WOOD_D).rect(27, 17, 3, 2, WOOD_D).rect(0, 5, 3, 12, '#3b6fd9').rect(29, 5, 3, 12, '#3b6fd9').outline(OUTLINE);
const bookshelf = (): Px => {
  const p = new Px(16, 24).rect(1, 0, 14, 24, WOOD_D).rect(2, 1, 12, 22, WOOD);
  const cols = ['#d9453b', '#3b6fd9', '#3ba35b', '#e8c23a', '#8a4fd1', '#e87ab8'];
  for (let shelf = 0; shelf < 3; shelf++) {
    p.rect(2, 7 + shelf * 7, 12, 1, WOOD_D);
    for (let i = 0; i < 5; i++) p.rect(3 + i * 2, 2 + shelf * 7 + (i % 2), 2, 5 - (i % 2), cols[(i + shelf) % cols.length]!);
  }
  return p.outline(OUTLINE);
};
const lamp = (): Px => new Px(16, 24).rect(7, 8, 2, 14, WOOD_D).rect(4, 20, 8, 2, WOOD_D).rect(3, 2, 10, 7, '#f5e04a').rect(4, 1, 8, 1, '#f5e04a').rect(3, 8, 10, 1, '#d9b53a').outline(OUTLINE);
const plant = (): Px => new Px(16, 22).rect(4, 14, 8, 7, '#c0603a').rect(4, 14, 8, 1, '#e0805a').ellipse(2, 2, 12, 12, LEAF).ellipse(5, 0, 6, 6, LEAF_L).rect(7, 10, 2, 5, LEAF_D).outline(OUTLINE);
const clock = (): Px => new Px(16, 16).circle(8, 8, 7, WOOD).circle(8, 8, 5, '#f4f0e6').rect(8, 4, 1, 4, OUTLINE).rect(8, 8, 3, 1, OUTLINE).px(8, 8, '#d9453b').outline(OUTLINE);
const wallColor = (stone: boolean, colour: number): string => PAINT_COLORS[colour] || (stone ? STONE : WOOD);
const wallFace = (p: Px, x: number, y: number, w: number, h: number, stone: boolean, col: string, painted: boolean) => {
  const dark = shade(col, painted ? 0.82 : 0.72);
  p.rect(x, y, w, h, col);
  if (stone) {
    for (let yy = y; yy < y + h; yy += 4) {
      p.rect(x, yy, w, 1, dark);
      for (let xx = x + (((yy - y) / 4) % 2 === 0 ? 0 : 4); xx < x + w; xx += 8) p.rect(xx, yy, 1, Math.min(4, y + h - yy), dark);
    }
  } else {
    for (let xx = x + 1; xx < x + w; xx += 4) p.rect(xx, y, 1, h, dark);
  }
};
const wallPiece = (stone: boolean, colour: number, mask: number): Px => {
  const p = new Px(16, 24);
  const col = wallColor(stone, colour);
  const painted = colour > 0;
  const cap = shade(col, 1.25);
  const up = mask & 1;
  const right = mask & 2;
  const down = mask & 4;
  const left = mask & 8;
  const horizontal = left || right;
  const vertical = up || down;
  if (vertical) {
    const y0 = up ? 0 : 6;
    const y1 = down ? 24 : 22;
    wallFace(p, 5, y0, 6, y1 - y0, stone, col, painted);
    p.rect(5, y0, 6, 1, cap).rect(5, y0, 1, y1 - y0, cap);
  }
  if (horizontal || !vertical) {
    const x0 = left ? 0 : vertical ? 5 : 3;
    const x1 = right ? 16 : vertical ? 11 : 13;
    wallFace(p, x0, 8, x1 - x0, 16, stone, col, painted);
    p.rect(x0, 6, x1 - x0, 2, cap).rect(x0, 8, x1 - x0, 1, shade(col, 1.1));
  }
  return p.outline(OUTLINE);
};
const windowPiece = (colour: number, vertical: boolean): Px => {
  const p = wallPiece(false, colour, vertical ? 5 : 10);
  const frame = colour > 0 ? '#f4f2ec' : '#7a5230';
  if (vertical) {
    p.rect(6, 9, 4, 6, '#8fd0f0').rect(6, 12, 4, 1, frame).box(5, 8, 6, 8, frame);
  } else {
    p.rect(4, 11, 8, 8, '#8fd0f0').rect(7, 11, 2, 8, frame).rect(4, 14, 8, 1, frame).box(3, 10, 10, 10, frame);
    p.rect(4, 20, 2, 2, '#e8502a').rect(10, 20, 2, 2, '#f5d94a');
  }
  return p;
};

export function drawObjects(): Record<string, ObjectArt> {
  const art: Record<string, ObjectArt> = {};
  const set = (kind: string, frames: Px[], ox = 0, oy = 0, animated = false) => (art[kind] = { frames, ox, oy, animated });
  set('tree', [tree('round', 0), tree('round', 1)], -4, -20);
  set('tree_pine', [tree('pine', 0)], -4, -20);
  set('tree_apple', [tree('apple', 0)], -4, -20);
  set('stump', [stump()]);
  set('rock', [rock(true)]);
  set('rock_small', [rock(false)]);
  set('grass_tuft', [tuft(0), tuft(1), tuft(2)]);
  set('flower', [flower(0), flower(1), flower(2), flower(3)]);
  set('bush', [bush()]);
  set('wild_flower_mid', [flower(0, true), flower(1, true), flower(2, true)]);
  set('street_lamp', [streetLamp()], 0, -8);
  // the market town's dressing
  set('banner_pole', [0, 1, 2].map(bannerPole), 0, -24);
  set('barrel_stack', [barrelStack()], 0, -4);
  set('runestone', [runestone(0), runestone(1)], 0, -12, true);
  set('hay_cart', [hayCart()], 0, -8);
  set('house', PAINT_COLORS.map((_, i) => house(i)), 0, -20);
  set('wardrobe', [wardrobe()], 0, -8);
  // Furniture
  set('door_out', [doorOut()]);
  const colours = PAINT_COLORS.map((_, i) => i);
  set('wall_wood', colours.flatMap((c) => Array.from({ length: 16 }, (_, m) => wallPiece(false, c, m))), 0, -8);
  set('window', colours.flatMap((c) => [windowPiece(c, false), windowPiece(c, true)]), 0, -8);
  set('bench', [bench()]);
  set('table', [table()]);
  set('flowerbox', [flowerbox()]);
  set('bed', [bed()], 0, -4);
  set('rug', [rug()]);
  set('chair', [chair()], 0, -4);
  set('sofa', [sofa()], 0, -4);
  set('bookshelf', [bookshelf()], 0, -8);
  set('lamp', [lamp()], 0, -8);
  set('plant', [plant()], 0, -6);
  set('clock', [clock()], 0, -6);
  set('crystal_lamp', [crystalLamp()], 0, -8);
  set('mushroom_lamp', [mushroomLamp()], 0, -8);
  set('wisp_jar', [wispJar()], 0, -4);
  set('dragon_egg', [dragonEgg()]);
  // Biome specials
  set('mushroom', [mushroom(0), mushroom(1)]);
  set('lobby_sign', [0, 1, 2, 3, 4, 5, 6].map(lobbySign), 0, -8);
  set('kennel', [kennel()], 0, 0);
  // Village
  set('house_small', [0, 1, 2, 3].map((v) => building(48, 52, ['#e8dcc0', '#f0d8a8', '#dce8c8', '#f4e0e0'][v]!, ['#b5413a', '#6f4a26', '#3b5fa6', '#2f7a3a'][v]!, true, { windows: 2, roofH: 20 })), 0, -4);
  set('lantern', [lantern(0), lantern(1)], 0, -8, true);
  // Cave
  drawSaga(set);
  drawHouse(set);
  return art;
}

const mushroom = (v: number): Px => {
  const cap = v === 0 ? '#d8363a' : '#c9a36a';
  const p = new Px(16, 16).rect(6, 9, 3, 6, '#f0e4c8').rect(3, 5, 9, 4, cap).rect(4, 4, 7, 1, cap).px(5, 6, '#ffffff').px(9, 7, '#ffffff').rect(11, 10, 2, 5, '#f0e4c8').rect(10, 8, 4, 2, cap);
  return p.outline(OUTLINE);
};

/** A signboard on a post with a little picture (the lobby's signs): 0 arch, 1 tree, 2 house, 3 shirt, 4 anvil, 5 scroll, 6 paw. */
const lobbySign = (v: number): Px => {
  const p = new Px(16, 24);
  p.rect(7, 12, 2, 12, WOOD_D).rect(7, 12, 1, 12, WOOD).rect(5, 22, 6, 2, STONE_D).rect(5, 22, 6, 1, STONE);
  // the board
  p.rect(1, 1, 14, 12, '#ecdcb0').box(1, 1, 14, 12, WOOD_D).rect(2, 2, 12, 1, '#f7ecca');
  const ic = (rows: string[], pal: Record<string, string>) => p.tpl(4, 3, rows, pal);
  const K = '#3a2a1c';
  switch (v % 7) {
    case 0: // the arch with its glow
      ic(['..SSSSS..', '.SSSSSSS.', 'SSgggggSS', 'SSgGGGgSS', 'SSgGGGgSS', 'SSgGGGgSS', 'SSgGGGgSS', 'SSgGGGgSS'], { S: '#8a8a8e', g: '#4a3a7a', G: '#9ad6ff' });
      break;
    case 1: // the tree
      ic(['..GGGGG..', '.GGlGGGG.', 'GGGGGlGGG', 'GGlGGGGGG', '.GGGGGGG.', '...bbb...', '...bbb...', '..bbbbb..'], { G: '#3f9a4a', l: '#74c86a', b: '#7a5230' });
      break;
    case 2: // a house
      ic(['....R....', '...RRR...', '..RRRRR..', '.RRRRRRR.', '.WWWWWWW.', '.WWDDWWW.', '.WWDDWWW.', '.WWDDWWW.'], { R: '#b5413a', W: '#f0e2c0', D: '#7a5230' });
      break;
    case 3: // a shirt
      ic(['.BB...BB.', 'BBBB.BBBB', 'BBBBBBBBB', '.BBBBBBB.', '..BBBBB..', '..BBBBB..', '..BBBBB..', '..BBBBB..'], { B: '#4a7fd0' });
      break;
    case 4: // an anvil and a spark
      ic(['......y..', 'AAAAAAAA.', '.AAAAAAAA', '..AAAAA..', '...AAA...', '...AAA...', '..AAAAA..', '.AAAAAAA.'], { A: '#4a4a52', y: '#ffc83a' });
      break;
    case 5: // a scroll with a rune
      ic(['.PPPPPPP.', 'PPPPPPPPP', 'PPPrPrPPP', 'PPPPrPPPP', 'PPPrPrPPP', 'PPPPPPPPP', 'PPPPPPPPP', '.PPPPPPP.'], { P: '#f3e2b3', r: '#a63a2a' });
      break;
    default: // a paw
      ic(['.b..b.b..', 'bb.bb.bb.', 'bb.bb.bb.', '.b.bbb.b.', '..bbbbb..', '.bbbbbbb.', '.bbbbbbb.', '..bb.bb..'], { b: K });
  }
  return p.outline(OUTLINE);
};

/** The kennel: a doghouse with a hay roof and a bowl. */
const kennel = (): Px => {
  const p = new Px(32, 32);
  p.rect(6, 12, 20, 16, '#c58f55').rect(6, 12, 20, 1, '#e0b47a').rect(6, 12, 1, 16, '#e0b47a').rect(25, 12, 1, 16, '#9a6a3a');
  for (let y = 15; y < 28; y += 4) p.rect(7, y, 18, 1, '#9a6a3a');
  p.tpl(3, 2, [
    '......................',
    '.........RRRRRRR......',
    '.......RRRRRRRRRRR....',
    '.....RRRRRrRRRRrRRRR..',
    '...RRRRRRRRRRRRRRRRRR.',
    '..RRRrRRRRRRrRRRRRRRRR',
  ], { R: '#b5413a', r: '#8a2f2a' });
  p.rect(12, 18, 8, 10, '#2a1c14').rect(13, 17, 6, 1, '#2a1c14').rect(11, 27, 10, 1, '#6f4a26');
  p.rect(4, 28, 6, 2, '#6e6e78').rect(5, 27, 4, 1, '#d9453b').px(5, 27, '#f06a5a');
  p.rect(22, 28, 5, 1, '#9a6a3a').px(24, 27, '#e0b47a');
  return p.outline(OUTLINE);
};

const lantern = (f: number): Px => new Px(16, 24).rect(7, 8, 2, 16, '#3a3a3a').rect(4, 2, 8, 7, '#3a3a3a').rect(5, 3, 6, 5, f ? '#ffd45a' : '#f5a623').rect(7, 0, 2, 2, '#3a3a3a').rect(3, 22, 10, 2, '#3a3a3a').outline(OUTLINE);

const doorOut = (): Px => new Px(16, 16).rect(0, 0, 16, 16, '#b9b6ad').rect(1, 1, 14, 14, WOOD).rect(2, 2, 12, 12, WOOD_D).rect(3, 3, 10, 10, WOOD).rect(11, 7, 2, 2, '#f2d35a').rect(5, 12, 6, 1, '#f2d35a');

// ---------------------------------------------------------------------------
// Crops: one 16x16 frame per stage (stages.length growth stages + mature).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Effects, drops, misc
// ---------------------------------------------------------------------------

export function drawFx(): Record<string, Px[]> {
  const heart = new Px(8, 8).tpl(0, 0, ['.##.##..', '#######.', '#######.', '.#####..', '..###...', '...#....'], { '#': '#ff5a8a' }).px(1, 1, '#ffb0c8');
  const sparkle = (f: number) => {
    const p = new Px(8, 8);
    if (f === 0) p.rect(3, 0, 2, 8, '#fff1a0').rect(0, 3, 8, 2, '#fff1a0').rect(3, 3, 2, 2, '#ffffff');
    else p.rect(3, 2, 2, 4, '#fff1a0').rect(2, 3, 4, 2, '#fff1a0');
    return p;
  };
  const water = new Px(6, 8).tpl(0, 0, ['..##..', '.####.', '######', '######', '.####.', '..##..'], { '#': '#6fb6ff' }).px(2, 2, '#d0ecff');
  const chip = new Px(6, 6).rect(1, 1, 4, 3, WOOD_L).rect(1, 4, 4, 1, WOOD_D);
  const poof = (f: number) => new Px(12, 12).circle(6, 6, 4 + f, f === 0 ? '#ffffffcc' : '#ffffff88');
  const coin = new Px(8, 8).circle(4, 4, 3.5, '#f2d35a').circle(4, 4, 2, '#d9b53a').rect(3, 2, 2, 4, '#f7e48a');
  const shadow = new Px(12, 6).ellipse(0, 0, 12, 6, '#00000055');
  const shadowBig = new Px(24, 10).ellipse(0, 0, 24, 10, '#00000066');
  const cursor = new Px(16, 16).box(0, 0, 16, 16, '#ffffff').box(1, 1, 14, 14, '#2b2419');
  const bubble = new Px(16, 14).rect(1, 0, 14, 11, '#ffffff').rect(0, 1, 16, 9, '#ffffff').rect(6, 11, 3, 1, '#ffffff').rect(7, 12, 1, 1, '#ffffff').outline(OUTLINE);
  const hit = new Px(10, 10).tpl(0, 0, ['....##....', '.#..##..#.', '..######..', '.########.', '##########', '##########', '.########.', '..######..', '.#..##..#.', '....##....'], { '#': '#ff5a3a' }).rect(4, 4, 2, 2, '#fff2a0');
  const rocket = new Px(12, 5).rect(0, 1, 9, 3, '#d8d8d8').rect(0, 1, 9, 1, '#ffffff').rect(9, 1, 3, 3, '#e04a2a').px(11, 2, '#ff9a7a').rect(0, 0, 2, 1, '#e04a2a').rect(0, 4, 2, 1, '#e04a2a');
  const smoke = (f: number) => new Px(8, 8).circle(4, 4, 2 + f, f === 0 ? '#d0d0d0cc' : '#b0b0b088');
  const boom = (f: number) => {
    const p = new Px(32, 32);
    const r = 8 + f * 4;
    p.circle(16, 16, r, f < 2 ? '#ff6a2a' : '#ffb24a');
    p.circle(16, 16, Math.max(2, r - 4), f < 2 ? '#ffd24a' : '#fff2a0');
    if (f === 0) p.circle(16, 16, 3, '#ffffff');
    const spikes = [[0, -1], [1, 0], [0, 1], [-1, 0], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7], [-0.7, -0.7]] as const;
    for (const [sx, sy] of spikes) p.rect(Math.round(16 + sx * (r + 2)) - 1, Math.round(16 + sy * (r + 2)) - 1, 2, 2, '#ff6a2a');
    return p;
  };
  const arrow = new Px(12, 3).rect(0, 1, 10, 1, WOOD_L).rect(9, 0, 3, 3, '#d8d8d8').px(11, 1, '#ffffff').rect(0, 0, 2, 3, '#e04a2a');
  const splash = new Px(16, 12).tpl(0, 0, ['...#....#...', '..#.#..#.#..', '.#...##...#.', '#....##....#', '.##.####.##.', '..########..'], { '#': '#dff6ff' }).rect(5, 8, 2, 2, '#8fe0f8');
  const ripple = (f: number) => {
    const p = new Px(20, 10);
    const w = 12 + f * 4;
    const h = 5 + f * 2;
    p.ellipse(10 - w / 2, 5 - h / 2, w, h, f ? '#dff6ff88' : '#dff6ffcc').ellipse(10 - w / 2 + 1, 5 - h / 2 + 1, w - 2, h - 2, '#00000000');
    return p;
  };
  const lasso = new Px(12, 12).circle(6, 6, 5.5, WOOD_L).circle(6, 6, 4.5, WOOD_D);
  lasso.ctx.clearRect(3, 3, 6, 6);
  lasso.rect(5, 9, 2, 3, WOOD_L);
  const honk = new Px(14, 12).tpl(0, 0, ['....#....', '...##..#.', '..###...#', '.####...#', '..###...#', '...##..#.', '....#....'], { '#': '#ffe66a' }).rect(0, 4, 3, 3, '#ffe66a');
  return {
    hit: [hit],
    arrow: [arrow],
    lasso: [lasso],
    honk: [honk],
    splash: [splash],
    ripple: [ripple(0), ripple(1)],
    rocket: [rocket],
    smoke: [smoke(0), smoke(1)],
    boom: [boom(0), boom(1), boom(2)],
    heart: [heart],
    sparkle: [sparkle(0), sparkle(1)],
    water: [water],
    chop: [chip],
    poof: [poof(0), poof(1)],
    coin: [coin],
    shadow: [shadow],
    shadowBig: [shadowBig],
    cursor: [cursor],
    bubble: [bubble],
    snow: [new Px(2, 2).rect(0, 0, 2, 2, '#ffffff')],
  };
}

export const EMOTE_GLYPH: Record<string, string> = {
  hjärta: '❤️',
  skratt: '😂',
  hej: '👋',
  hjälp: '🆘',
  titta: '👀',
  sova: '💤',
  fiske: '🎣',
  napp: '❗',
  vissla: '🎵',
  dans: '💃',
};
