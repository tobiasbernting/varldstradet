// Looks: cool gear that is only for show (looks.ts). The earning rules (a new piece or +1 shine, never a wasted drop, the signature
// weapon guaranteed after SIGNATURE_AFTER clears, a colourway and a title on Svår and Extrem), wearing, and that no look gives any power.
import { describe, expect, it } from 'vitest';
import {
  ALL_PIECES,
  BASE_ARMOR,
  BASE_POWER,
  DUNGEON_IDS,
  LOOK_SETS,
  LOOK_SLOTS,
  LOOK_TIER_MAX,
  LOOK_TITLES,
  SIGNATURE_AFTER,
  SIGNATURE_WEAPONS,
  awardLooks,
  createPlayer,
  decodeLook,
  devGrantLooks,
  emptyWorld,
  equipLook,
  fighterMax,
  fightStats,
  hasWay,
  lookPalOf,
  looksOutfit,
  mulberry32,
  newSagaProgress,
  ownsLook,
  setComplete,
  setsOf,
  signatureFor,
  tierOf,
  wearableBy,
  type Change,
  type DungeonId,
  type PlayerState,
} from './index.ts';

function hero(cls: 'vaktare' | 'helare' | 'krigare' | 'magiker' = 'vaktare'): PlayerState {
  const w = emptyWorld();
  const p = createPlayer(w, 'Kim', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' });
  p.saga = { ...newSagaProgress(), cls, heard: true };
  return p;
}
const never = (): number => 0.999;
const always = (): number => 0;
const clear = (p: PlayerState, d: DungeonId, level = 2, rnd: () => number = never): ReturnType<typeof awardLooks> => awardLooks(p, d, level, rnd, []);

describe('the looks data', () => {
  it('has ten sets, one dungeon each (Helheim two), two for each class and two for any class, and four signature weapons', () => {
    expect(LOOK_SETS).toHaveLength(10);
    for (const cls of ['vaktare', 'helare', 'krigare', 'magiker'] as const) expect(LOOK_SETS.filter((s) => s.cls === cls)).toHaveLength(2);
    expect(LOOK_SETS.filter((s) => s.cls === null)).toHaveLength(2);
    expect(new Set(LOOK_SETS.map((s) => s.dungeon)).size).toBe(9);
    expect(setsOf('hel')).toHaveLength(2);
    expect(SIGNATURE_WEAPONS.map((s) => s.id).sort()).toEqual(['sig_frostbett', 'sig_gungner', 'sig_mjolner', 'sig_surtsvard']);
    for (const s of LOOK_SETS) {
      expect(s.pieces.length).toBeGreaterThanOrEqual(4);
      for (const x of s.pieces) expect(LOOK_SLOTS).toContain(x.slot);
      // every piece has an effect, and every colourway differs from the set's own
      for (const x of s.pieces) expect(x.fx[0].fx).toBeTruthy();
      expect(s.ways.svar.pal.main).not.toBe(s.pal.main);
      expect(s.ways.extrem.pal.main).not.toBe(s.ways.svar.pal.main);
    }
    expect(new Set(ALL_PIECES.map((x) => x.id)).size).toBe(ALL_PIECES.length);
  });
  it('class sets are for their class only; any-class sets and the signature weapons for everyone', () => {
    expect(wearableBy('draugvakt_hat', 'vaktare')).toBe(true);
    expect(wearableBy('draugvakt_hat', 'magiker')).toBe(false);
    expect(wearableBy('lokeslek_hat', 'helare')).toBe(true);
    expect(wearableBy('sig_mjolner', 'helare')).toBe(true);
  });
});

describe('earning looks', () => {
  it('each clear gives one new piece (while one is missing) and +1 shine on every piece already owned: whole after 4 clears, fully shining after 8', () => {
    const p = hero();
    const set = setsOf('draug')[0]!;
    const seen = new Set<string>();
    for (let n = 1; n <= 8; n++) {
      const before = Object.fromEntries(set.pieces.map((x) => [x.id, tierOf(p.saga, x.id)]));
      const r = clear(p, 'draug', 2, mulberry32(n))!;
      const fresh = r.drops.filter((d) => d.isNew && !d.signature);
      // one new piece per clear until the set is whole, never a duplicate
      expect(fresh, `clear ${n}`).toHaveLength(n <= 4 ? 1 : 0);
      for (const d of fresh) {
        expect(seen.has(d.piece)).toBe(false);
        seen.add(d.piece);
        expect(d.tier).toBe(1);
      }
      // every piece owned before this clear went up by exactly one (to at most 5)
      for (const x of set.pieces) if (before[x.id]! > 0) expect(tierOf(p.saga, x.id), `${x.id} at clear ${n}`).toBe(Math.min(5, before[x.id]! + 1));
      expect(set.pieces.filter((x) => tierOf(p.saga, x.id) > 0)).toHaveLength(Math.min(4, n));
    }
    expect(setComplete(p.saga, set)).toBe(true);
    for (const x of set.pieces) expect(tierOf(p.saga, x.id)).toBe(LOOK_TIER_MAX);
    // after that there is nothing left to give from the set
    const more = clear(p, 'draug', 2, mulberry32(99))!;
    expect(more.drops.filter((d) => !d.signature)).toHaveLength(0);
    expect(more.complete).toBe(true);
  });

  it('the first clear is always a new piece at the first shine', () => {
    const p = hero();
    const r = clear(p, 'frost', 0, always)!;
    const main = r.drops.filter((d) => !d.signature);
    expect(main).toHaveLength(1);
    expect(main[0]).toMatchObject({ isNew: true, tier: 1 });
  });

  it('Helheim gives two sets: the hero\'s own class set first, and both end up whole', () => {
    const p = hero('magiker');
    // a Magiker gets the Magiker set (Skuggornas hatt) first, then the any-class one
    const first = clear(p, 'hel', 2, mulberry32(1))!.drops[0]!;
    expect(first.piece).toMatch(/^skuggornas_/);
    for (let n = 2; n <= 4; n++) expect(clear(p, 'hel', 2, mulberry32(n))!.drops.find((d) => d.isNew)!.piece, `clear ${n}`).toMatch(/^skuggornas_/);
    expect(clear(p, 'hel', 2, mulberry32(5))!.drops.find((d) => d.isNew)!.piece).toMatch(/^huginmunin_/);
    for (let n = 6; n <= 16; n++) clear(p, 'hel', 2, mulberry32(n));
    for (const s of setsOf('hel')) expect(setComplete(p.saga, s)).toBe(true);
  });

  it('the full effect is reachable on Mycket lätt: looks grow with completions, not with difficulty', () => {
    const easy = hero();
    const hard = hero();
    for (let n = 0; n < 3; n++) {
      clear(easy, 'surt', 0, mulberry32(n));
      clear(hard, 'surt', 4, mulberry32(n));
    }
    // the same number of clears gives the same shine at both ends
    const sum = (p: PlayerState): number => setsOf('surt')[0]!.pieces.reduce((s, x) => s + tierOf(p.saga, x.id), 0);
    expect(sum(easy)).toBe(sum(hard));
    const maxed = hero();
    for (let n = 0; n < 8; n++) clear(maxed, 'surt', 0, mulberry32(n));
    for (const x of setsOf('surt')[0]!.pieces) expect(tierOf(maxed.saga, x.id)).toBe(LOOK_TIER_MAX);
    // Mycket lätt gives no colourway or title
    expect(maxed.saga!.lookWays).toBeUndefined();
    expect(maxed.saga!.titles).toEqual([]);
  });

  it('the signature weapon is rare, but for sure at the SIGNATURE_AFTER:th clear of that dungeon', () => {
    const p = hero();
    const sg = signatureFor('frost')!;
    for (let n = 1; n < SIGNATURE_AFTER; n++) {
      clear(p, 'frost', 2, never);
      expect(ownsLook(p.saga, sg.id), `clear ${n}`).toBe(false);
    }
    const r = clear(p, 'frost', 2, never)!;
    expect(ownsLook(p.saga, sg.id)).toBe(true);
    expect(r.drops.find((d) => d.signature)).toMatchObject({ piece: 'sig_frostbett', tier: LOOK_TIER_MAX, isNew: true });
    expect(p.saga!.lookClears!.frost).toBe(SIGNATURE_AFTER);
    // the counter is per dungeon, and a weapon already owned never drops again
    expect(ownsLook(p.saga, signatureFor('surt')!.id)).toBe(false);
    expect(clear(p, 'frost', 2, always)!.drops.some((d) => d.signature)).toBe(false);
    // and with luck it comes earlier
    const lucky = hero();
    expect(clear(lucky, 'dvarg', 2, always)!.drops.some((d) => d.signature && d.piece === 'sig_mjolner')).toBe(true);
  });

  it('Svår and Extrem unlock that level\'s colourway and a title, once, and only for the dungeon cleared', () => {
    const p = hero();
    clear(p, 'draug', 2);
    clear(p, 'draug', 1);
    expect(p.saga!.lookWays).toBeUndefined();
    const svar = clear(p, 'draug', 3)!;
    expect(svar.ways).toEqual(['svar']);
    expect(svar.titles).toEqual([LOOK_TITLES.draug.svar]);
    expect(hasWay(p.saga, 'draug', 'svar')).toBe(true);
    expect(hasWay(p.saga, 'draug', 'extrem')).toBe(false);
    expect(hasWay(p.saga, 'frost', 'svar')).toBe(false);
    expect(clear(p, 'draug', 3)!.ways).toEqual([]);
    const ext = clear(p, 'draug', 4)!;
    expect(ext.ways).toEqual(['extrem']);
    expect(p.saga!.titles).toEqual([LOOK_TITLES.draug.svar, LOOK_TITLES.draug.extrem]);
    // a colourway is a different palette, not a flashier one: same keys, nothing added
    const piece = setsOf('draug')[0]!.pieces[0]!;
    const plain = lookPalOf(piece.id);
    const way = lookPalOf(piece.id, 'svar');
    expect(Object.keys(way).sort()).toEqual(Object.keys(plain).sort());
    expect(way.main).not.toBe(plain.main);
  });

  it('says what it gave in a loot change for the loot window, and gives nothing to a hired companion', () => {
    const p = hero();
    const out: Change[] = [];
    awardLooks(p, 'orm', 3, never, out);
    const loot = out.find((c) => c.t === 'loot');
    expect(loot && loot.t === 'loot' && loot.looks?.drops).toHaveLength(1);
    expect(loot && loot.t === 'loot' && loot.looks?.ways).toEqual(['svar']);
    const bot = hero();
    bot.bot = true;
    expect(awardLooks(bot, 'orm', 2, never, [])).toBeNull();
    expect(bot.saga!.looks).toBeUndefined();
  });
});

describe('wearing looks', () => {
  it('a look is put on and taken off for free, per class, and the outfit carries what is worn', () => {
    const p = hero('vaktare');
    devGrantLooks(p, undefined, 3, true, true);
    const hat = 'draugvakt_hat';
    expect(equipLook(p, 'hat', hat, undefined, undefined)).toHaveLength(1);
    expect(p.outfit.looks?.hat).toBe(`${hat}|3|`);
    expect(decodeLook(p.outfit.looks!.hat)).toMatchObject({ tier: 3, piece: { id: hat } });
    // another class does not wear it, and has its own wardrobe
    p.saga!.cls = 'magiker';
    expect(looksOutfit(p.saga)).toBeUndefined();
    expect(equipLook(p, 'hat', hat, undefined, undefined)).toEqual([]);
    expect(equipLook(p, 'hat', 'askmagiker_hat', undefined, undefined)).toHaveLength(1);
    expect(p.outfit.looks).toEqual({ hat: 'askmagiker_hat|3|' });
    p.saga!.cls = 'vaktare';
    equipLook(p, 'hat', null, undefined, 'magiker'); // (the wardrobe can dress another class)
    p.saga!.cls = 'vaktare';
    expect(p.outfit.looks?.hat).toBe(`${hat}|3|`);
    // a piece goes only in its slot, and only if owned
    expect(equipLook(p, 'shirt', hat, undefined, undefined)).toEqual([]);
    const poor = hero();
    expect(equipLook(poor, 'hat', hat, undefined, undefined)).toEqual([]);
    // any-class sets and the signature weapons are for all
    expect(equipLook(p, 'weapon', 'sig_mjolner', undefined, undefined)).toHaveLength(1);
    expect(equipLook(p, 'cloak', 'lokeslek_cloak', undefined, undefined)).toHaveLength(1);
    // a colourway only if it is unlocked
    expect(equipLook(p, 'hat', hat, 'svar', undefined)).toHaveLength(1);
    expect(p.outfit.looks?.hat).toBe(`${hat}|3|svar`);
    const noWay = hero();
    devGrantLooks(noWay, 'draugvakt', 2, false, false);
    equipLook(noWay, 'hat', hat, 'extrem', undefined);
    expect(noWay.outfit.looks?.hat).toBe(`${hat}|2|`);
    // the shine on the outfit follows the collection
    p.saga!.looks![hat] = { tier: 5 };
    equipLook(p, 'hat', hat, undefined, undefined);
    expect(p.outfit.looks?.hat).toBe(`${hat}|5|`);
  });

  it('no look gives any power: damage, healing, health and armor are the same bare and in a full set of every look', () => {
    const p = hero('magiker');
    const bare = { fs: fightStats(p), max: fighterMax(p, 'magiker') };
    devGrantLooks(p, undefined, LOOK_TIER_MAX, true, true);
    for (const s of ['hat', 'shirt', 'weapon', 'amulet'] as const) {
      const piece = ALL_PIECES.find((x) => x.slot === s && wearableBy(x.id, 'magiker'))!;
      equipLook(p, s, piece.id, undefined, undefined);
    }
    expect(Object.keys(p.outfit.looks ?? {})).toHaveLength(4);
    expect(fightStats(p)).toEqual(bare.fs);
    expect(fightStats(p)).toMatchObject({ power: BASE_POWER, armor: BASE_ARMOR });
    expect(fighterMax(p, 'magiker')).toBe(bare.max);
    // the pieces have no stat fields at all
    for (const x of ALL_PIECES) for (const k of ['stats', 'power', 'hp', 'armor']) expect(x, `${x.id}.${k}`).not.toHaveProperty(k);
  });

  it('the dev grant gives a whole set at a tier, or everything', () => {
    const p = hero();
    devGrantLooks(p, 'bjornbarsark', 2, false, false);
    expect(setsOf('fenrir')[0]!.pieces.every((x) => tierOf(p.saga, x.id) === 2)).toBe(true);
    expect(ownsLook(p.saga, 'draugvakt_hat')).toBe(false);
    const all = hero();
    devGrantLooks(all, undefined, 5, true, true);
    expect(ALL_PIECES.every((x) => ownsLook(all.saga, x.id))).toBe(true);
    for (const d of DUNGEON_IDS) expect(hasWay(all.saga, d, 'extrem')).toBe(true);
  });
});
