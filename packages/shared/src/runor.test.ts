// Runor v2 (GAME2.md section 3, R4): rarity and tags, set bonuses, personal offers that lean to the class and the path, the rarity
// weights and the pity rule, skärpa, and the run's personal pick (everyone at once, the clock, the Mellanboss's runa for the whole party).
import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  CLASS_IDS,
  EFFECT_KEYS,
  OFFER_WEIGHTS,
  PATH_TAGS,
  PITY_AFTER,
  RARITIES,
  RUNOR,
  RUNA_NAMES,
  RUNA_TEXT,
  RUN_TAGS,
  SET_BONUS,
  SET_NAMES,
  SET_TEXT,
  RUNA_RARITY_NAMES,
  TAG_NAMES,
  addEffect,
  buffsOf,
  canSharpen,
  choosePath,
  heldEffect,
  heldRarity,
  mulberry32,
  noBuffs,
  offerFor,
  partyRuna,
  pickRuna,
  rarityIndex,
  rarityWeights,
  readRun,
  rerollOffer,
  restMore,
  runOf,
  runa,
  runPickMs,
  setEffect,
  sharpenRuna,
  startRun,
  tagCounts,
  enterStop,
  type ClassId,
  type RunEffect,
} from './index.ts';
import { makeParty, step, type Party } from './runplay.ts';

describe('runor v2: the data', () => {
  it('has about 30 more runor than the first 38, in four rarities, every one with a name, a sentence with a number, one or two tags and an effect that exists', () => {
    expect(RUNOR.length).toBeGreaterThanOrEqual(38 + 30);
    expect(new Set(RUNOR.map((r) => r.id)).size).toBe(RUNOR.length);
    for (const c of CLASS_IDS) expect(RUNOR.filter((r) => r.cls === c).length).toBeGreaterThanOrEqual(14);
    expect(RUNOR.filter((r) => !r.cls).length).toBeGreaterThanOrEqual(12);
    for (const r of RARITIES) expect(RUNOR.some((x) => x.rarity === r), r).toBe(true);
    for (const c of CLASS_IDS) for (const rar of RARITIES) expect(RUNOR.some((x) => x.cls === c && x.rarity === rar), `${c} ${rar}`).toBe(true);
    for (const r of RUNOR) {
      expect(RUNA_NAMES[r.id], r.id).toBeTruthy();
      expect(RUNA_NAMES[r.id]!.split(' ').length).toBeLessThanOrEqual(4);
      expect(RUNA_TEXT[r.id], r.id).toBeTruthy();
      expect(RUNA_TEXT[r.id]!.length, r.id).toBeLessThanOrEqual(40);
      expect(RUNA_TEXT[r.id]).toMatch(/\d/);
      expect(r.tags.length).toBeGreaterThanOrEqual(1);
      expect(r.tags.length).toBeLessThanOrEqual(2);
      for (const t of r.tags) expect(RUN_TAGS).toContain(t);
      for (const k of Object.keys(r.effect)) expect(EFFECT_KEYS).toContain(k);
      // a class's runa only reaches for the class's own spells
      for (const s of [...Object.keys(r.effect.spell ?? {}), ...Object.keys(r.effect.spellCd ?? {}), ...Object.keys(r.effect.mods ?? {})]) expect(r.cls && CLASSES[r.cls].spells.includes(s), `${r.id} ${s}`).toBe(true);
    }
    for (const t of RUN_TAGS) {
      expect(TAG_NAMES[t]).toBeTruthy();
      expect(SET_NAMES[t]).toHaveLength(2);
      expect(SET_TEXT[t]).toHaveLength(2);
      expect(RUNOR.filter((r) => r.tags.includes(t)).length, t).toBeGreaterThanOrEqual(4);
    }
    for (const r of RARITIES) expect(RUNA_RARITY_NAMES[r]).toBeTruthy();
  });

  it('every runa and every set bonus changes something: a combat number in the buffs or one of the run’s own', () => {
    const meta = ['potions', 'seeds', 'reroll', 'slots', 'food', 'animal', 'companion', 'bossSeeds', 'luck'];
    const effects: RunEffect[] = [...RUNOR.map((r) => r.effect), ...RUN_TAGS.flatMap((t) => SET_BONUS[t])];
    for (const e of effects) {
      const changed = JSON.stringify(buffsOf(e)) !== JSON.stringify(noBuffs()) || Object.keys(e).some((k) => meta.includes(k));
      expect(changed).toBe(true);
    }
  });
});

describe('runor v2: offers', () => {
  const draw = (cls: ClassId, source: 'flock' | 'stark' | 'skatt' | 'mini' | 'shop', n: number, opts: { luck?: number; path?: string; seed?: number } = {}): string[][] => {
    const rnd = mulberry32(opts.seed ?? 5);
    return Array.from({ length: n }, () => offerFor(rnd, { cls, source, held: [], ...(opts.luck ? { luck: opts.luck } : {}), ...(opts.path ? { path: opts.path } : {}) }).cards);
  };
  const share = (cards: string[][], rar: string): number => {
    const all = cards.flat();
    return all.filter((id) => runa(id)!.rarity === rar).length / all.length;
  };

  it('three cards, all of the hero’s class (a gemensam runa never comes in a personal offer), no repeats, none already held, deterministic', () => {
    for (const c of CLASS_IDS) {
      const rnd = mulberry32(3);
      for (let i = 0; i < 60; i++) {
        const held = RUNOR.filter((r) => r.cls === c).slice(0, i % 9).map((r) => ({ id: r.id, up: 0 }));
        const { cards } = offerFor(rnd, { cls: c, source: 'flock', held });
        expect(cards).toHaveLength(3);
        expect(new Set(cards).size).toBe(3);
        for (const id of cards) {
          expect(runa(id)!.cls).toBe(c);
          expect(held.some((h) => h.id === id)).toBe(false);
        }
      }
    }
    expect(offerFor(mulberry32(9), { cls: 'magiker', source: 'flock', held: [] })).toEqual(offerFor(mulberry32(9), { cls: 'magiker', source: 'flock', held: [] }));
  });

  it('the rarity weights of each stop are what the cards come out as (a distribution test over thousands of cards)', () => {
    for (const source of ['flock', 'stark', 'skatt', 'mini'] as const) {
      const cards = draw('krigare', source, 2500, { seed: 11 });
      const w = OFFER_WEIGHTS[source];
      const total = w.reduce((a, b) => a + b, 0);
      RARITIES.forEach((rar, i) => {
        // (the class's pool is finite and a card is drawn without repeats inside an offer, so allow a few points)
        expect(Math.abs(share(cards, rar) - w[i]! / total), `${source} ${rar}`).toBeLessThan(0.07);
      });
    }
    // no legendary from a Flock, none vanlig from the Mellanboss
    expect(share(draw('magiker', 'flock', 800), 'legendarisk')).toBe(0);
    expect(share(draw('magiker', 'mini', 800), 'vanlig')).toBeLessThan(0.05);
  });

  it('the sagaträd’s luck makes the rarer cards come more often, and never fewer', () => {
    const mean = (luck: number): number => {
      const all = draw('helare', 'flock', 2000, { luck, seed: 4 }).flat();
      return all.reduce((n, id) => n + rarityIndex(runa(id)!.rarity), 0) / all.length;
    };
    expect(mean(0.25)).toBeGreaterThan(mean(0));
    expect(mean(0.5)).toBeGreaterThan(mean(0.25));
    expect(rarityWeights('flock', 0.25)[2]).toBeGreaterThan(rarityWeights('flock', 0)[2]!);
    expect(rarityWeights('flock', 0.25)[0]).toBe(rarityWeights('flock', 0)[0]);
  });

  it('pity: after two offers in a row without an ovanlig or better, the next one has one', () => {
    let pity = 0;
    let streak = 0;
    const rnd = mulberry32(21);
    for (let i = 0; i < 400; i++) {
      const r = offerFor(rnd, { cls: 'vaktare', source: 'flock', held: [], pity });
      const good = r.cards.some((id) => rarityIndex(runa(id)!.rarity) >= 1);
      streak = good ? 0 : streak + 1;
      expect(streak).toBeLessThanOrEqual(PITY_AFTER);
      pity = r.pity;
    }
    // with the counter at its limit the offer always holds one
    for (let i = 0; i < 100; i++) expect(offerFor(mulberry32(i), { cls: 'vaktare', source: 'flock', held: [], pity: PITY_AFTER }).cards.some((id) => rarityIndex(runa(id)!.rarity) >= 1)).toBe(true);
  });

  it('leans towards the hero’s path: more runor with the path’s tags than without a path', () => {
    const likes = PATH_TAGS.eld!;
    const fire = (cards: string[][]): number => cards.flat().filter((id) => runa(id)!.tags.some((t) => likes.includes(t))).length / cards.flat().length;
    expect(fire(draw('magiker', 'flock', 1500, { path: 'eld', seed: 8 }))).toBeGreaterThan(fire(draw('magiker', 'flock', 1500, { seed: 8 })) + 0.05);
  });

  it('a party-wide runa comes from a boss or an event: of at least the rarity asked for, never one the party has', () => {
    const rnd = mulberry32(2);
    const have: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = partyRuna(rnd, have, 'ovanlig')!;
      expect(runa(id)!.cls).toBeUndefined();
      expect(rarityIndex(runa(id)!.rarity)).toBeGreaterThanOrEqual(1);
      expect(have).not.toContain(id);
      have.push(id);
    }
  });
});

describe('runor v2: set bonuses and skärpa', () => {
  it('two runor of a tag give the small bonus, four the big one as well; both runor of a pair count for both tags; the party’s runor count too', () => {
    const eld = RUNOR.filter((r) => r.tags.includes('eld') && r.cls).slice(0, 4).map((r) => ({ id: r.id, up: 0 }));
    expect(setEffect(tagCounts(eld.slice(0, 1)))).toEqual({});
    const two = setEffect(tagCounts(eld.slice(0, 2)));
    expect(two.power).toBeCloseTo(SET_BONUS.eld[0].power!);
    const four = setEffect(tagCounts(eld));
    expect(four.power!).toBeCloseTo(SET_BONUS.eld[0].power! + SET_BONUS.eld[1].power!);
    expect(four.leech).toBeCloseTo(SET_BONUS.eld[1].leech!);
    // a runa with two tags counts for both
    const both = RUNOR.find((r) => r.tags.length === 2)!;
    const counts = tagCounts([{ id: both.id, up: 0 }]);
    for (const t of both.tags) expect(counts[t]).toBe(1);
    // the party's runor count
    const party = RUNOR.filter((r) => !r.cls && r.tags.includes('liv'))[0]!;
    const liv = RUNOR.find((r) => r.cls && r.tags.includes('liv'))!;
    expect(setEffect(tagCounts([{ id: liv.id, up: 0 }], [party.id])).heal).toBeGreaterThan(0);
  });

  it('skärpa makes a runa a step stronger (x1.25) and a step rarer, up to sällsynt; a legendary one does not change', () => {
    const v = RUNOR.find((r) => r.rarity === 'vanlig' && r.effect.armor)!;
    const base = { id: v.id, up: 0 };
    expect(heldRarity(base)).toBe('vanlig');
    expect(canSharpen(base)).toBe(true);
    expect(heldRarity({ id: v.id, up: 1 })).toBe('ovanlig');
    expect(heldRarity({ id: v.id, up: 2 })).toBe('sallsynt');
    expect(canSharpen({ id: v.id, up: 2 })).toBe(false);
    expect(heldEffect({ id: v.id, up: 1 }).armor!).toBeCloseTo(v.effect.armor! * 1.25);
    expect(heldEffect({ id: v.id, up: 2 }).armor!).toBeCloseTo(v.effect.armor! * 1.5625);
    const s = RUNOR.find((r) => r.rarity === 'sallsynt')!;
    expect(canSharpen({ id: s.id, up: 0 })).toBe(false);
    const l = RUNOR.find((r) => r.rarity === 'legendarisk')!;
    expect(canSharpen({ id: l.id, up: 0 })).toBe(false);
    expect(heldRarity({ id: l.id, up: 0 })).toBe('legendarisk');
    // a runa that adds a spell effect scales those numbers too
    const m = runa('m_glod')!;
    const e: RunEffect = {};
    addEffect(e, m.effect, 1.25);
    expect(e.mods!.eldboll!.burn).toBeCloseTo(m.effect.mods!.eldboll!.burn! * 1.25);
  });
});

// ---------------------------------------------------------------------------
// In a run: everyone picks their own
// ---------------------------------------------------------------------------

function clearStop(party: Party): void {
  const run = runOf(party.world)!;
  const area = party.world.areas![run.key]!;
  const inst = area.saga!;
  for (const pk of inst.packs) {
    pk.dead = true;
    for (const id of pk.members) {
      delete inst.mobs[id];
      delete area.animals[id];
    }
  }
  for (let i = 0; i < 6; i++) step(party, false, []);
}

/** A party whose first stop is cleared: every hero has their own three cards out. */
function atTheCards(classes: ClassId[], seed = 6): Party {
  const party = makeParty(classes, { seed });
  startRun(party.world, party.players[0]!.id, { seed, companion: false }, party.ctx());
  const run = runOf(party.world)!;
  expect(run.phase).toBe('stop');
  clearStop(party);
  expect(run.phase).toBe('pick');
  return party;
}

describe('runor v2: the personal pick in a run', () => {
  it('every hero has their own three cards from their own class, and sees only their own', () => {
    const party = atTheCards(['vaktare', 'helare', 'magiker']);
    const run = runOf(party.world)!;
    for (const p of party.players) {
      const o = run.offers[p.id]!;
      expect(o.cards).toHaveLength(3);
      expect(o.source).toBe('flock');
      for (const id of o.cards) expect(runa(id)!.cls).toBe(p.saga!.cls);
    }
    // different classes: different cards
    expect(new Set(party.players.flatMap((p) => run.offers[p.id]!.cards)).size).toBe(9);
  });

  it('a pick is a personal choice: nobody waits for a vote, a pick can be changed until everyone has chosen, and the run goes on when all have chosen', () => {
    const party = atTheCards(['krigare', 'magiker']);
    const run = runOf(party.world)!;
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const cardsA = [...run.offers[a.id]!.cards];
    const cardsB = [...run.offers[b.id]!.cards];
    expect(pickRuna(party.world, a.id, 7, party.ctx())).toEqual([]);
    pickRuna(party.world, a.id, 2, party.ctx());
    pickRuna(party.world, a.id, 1, party.ctx());
    expect(run.phase).toBe('pick');
    expect(run.hold[a.id]).toBeUndefined();
    pickRuna(party.world, b.id, 0, party.ctx());
    expect(run.phase).toBe('route');
    expect(run.hold[a.id]).toEqual([{ id: cardsA[1], up: 0 }]);
    expect(run.hold[b.id]).toEqual([{ id: cardsB[0], up: 0 }]);
    expect(run.runor).toEqual([]);
    // each hero's runa is theirs alone
    const inst = party.world.areas![run.key]!.saga!;
    const spells = (id: string): string[] => Object.keys(runa(id)!.effect.spell ?? {});
    void spells;
    expect(Object.keys(run.offers)).toHaveLength(0);
    expect(inst.run!.buffs[a.id]).toBeTruthy();
  });

  it('on the clock whoever has not chosen gets their first card, so a slow friend never holds the party and nobody loses a pick', () => {
    const party = atTheCards(['krigare', 'magiker']);
    const run = runOf(party.world)!;
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const first = run.offers[b.id]!.cards[0]!;
    pickRuna(party.world, a.id, 2, party.ctx());
    for (let t = 0; t < runPickMs(2) + 300; t += 50) step(party, false, []);
    expect(run.phase).toBe('route');
    expect(run.hold[b.id]).toEqual([{ id: first, up: 0 }]);
    expect(run.hold[a.id]).toHaveLength(1);
    expect(readRun(a).seeds).toBeGreaterThan(0);
  });

  it('the runor taken stack over a run, count towards sets, and give the buffs for the hero’s own spells only', () => {
    const party = atTheCards(['krigare', 'magiker']);
    const run = runOf(party.world)!;
    const [k, m] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    run.offers[m.id]!.cards = ['m_eld', 'm_kraft', 'm_glod'];
    run.offers[k.id]!.cards = ['k_yx', 'k_egg', 'k_dubbel'];
    pickRuna(party.world, m.id, 0, party.ctx());
    pickRuna(party.world, k.id, 0, party.ctx());
    const inst = party.world.areas![run.key]!.saga!;
    expect(inst.run!.buffs[m.id]!.spell.eldboll).toBeCloseTo(0.3);
    expect(inst.run!.buffs[k.id]!.spell.eldboll).toBeUndefined();
    expect(inst.run!.buffs[k.id]!.spell.yxhugg).toBeCloseTo(0.3);
    // the second eld runa makes two: the small set bonus
    expect(run.hold[m.id]).toHaveLength(1);
    run.hold[m.id]!.push({ id: 'm_kraft', up: 0 });
    run.hold[m.id]!.push({ id: 'm_glod', up: 0 });
    // (a hand-made hold: refresh through a stop change)
    enterStop(party.world, run, run.plan.route.nodes[run.node]!.next[0]!, party.ctx());
    const b = party.world.areas![run.key]!.saga!.run!.buffs[m.id]!;
    expect(b.power).toBeCloseTo(0.1 + SET_BONUS.eld[0].power!);
    expect(b.mods.eldboll!.burn).toBeCloseTo(runa('m_glod')!.effect.mods!.eldboll!.burn!);
  });

  it('the Mellanboss also gives the whole party a runa: it helps everyone and is kept apart from the personal ones', () => {
    const party = makeParty(['krigare', 'magiker'], { seed: 5 });
    startRun(party.world, party.players[0]!.id, { seed: 5, companion: false }, party.ctx());
    const run = runOf(party.world)!;
    const mini = run.plan.route.nodes.find((n) => n.kind === 'mini')!;
    enterStop(party.world, run, mini.id, party.ctx());
    party.world.areas![run.key]!.saga!.miniDown = true;
    for (let i = 0; i < 6; i++) step(party, false, []);
    expect(run.phase).toBe('path');
    choosePath(party.world, party.players[0]!.id, 'barsark', party.ctx());
    choosePath(party.world, party.players[1]!.id, 'eld', party.ctx());
    for (let i = 0; i < 4; i++) step(party, false, []);
    expect(run.phase).toBe('pick');
    expect(run.offers[party.players[0]!.id]!.source).toBe('mini');
    for (const p of party.players) pickRuna(party.world, p.id, 0, party.ctx());
    expect(run.runor).toHaveLength(1);
    expect(runa(run.runor[0]!)!.cls).toBeUndefined();
    expect(rarityIndex(runa(run.runor[0]!)!.rarity)).toBeGreaterThanOrEqual(1);
    for (const p of party.players) expect(run.hold[p.id]).toHaveLength(1);
  });

  it('a reroll (the sagaträd’s g3) is one new set of cards, for each hero once; without the node there is none', () => {
    const party = atTheCards(['krigare']);
    const run = runOf(party.world)!;
    const p = party.players[0]!;
    expect(rerollOffer(party.world, p.id, party.ctx())[0]!.t).toBe('toast');
    expect(run.rerolls[p.id] ?? 0).toBe(0);
    p.run = { ...readRun(p), tree: ['g1', 'g3'] };
    const before = [...run.offers[p.id]!.cards];
    const out = rerollOffer(party.world, p.id, party.ctx());
    expect(out.some((c) => c.t === 'run' && c.ev === 'offer')).toBe(true);
    const after = run.offers[p.id]!.cards;
    expect(after).toHaveLength(3);
    for (const id of after) expect(before).not.toContain(id);
    expect(run.rerolls[p.id]).toBe(1);
    const again = rerollOffer(party.world, p.id, party.ctx());
    expect(again).toHaveLength(1);
    expect(run.offers[p.id]!.cards).toEqual(after);
  });
});

describe('runor v2: skärpa at a Vilosten', () => {
  it('once for each hero and stop: Vila (more health) or skärp one runa', () => {
    const party = makeParty(['krigare', 'magiker'], { seed: 5 });
    startRun(party.world, party.players[0]!.id, { seed: 5, companion: false }, party.ctx());
    const run = runOf(party.world)!;
    const [k, m] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    run.hold[k.id] = [{ id: 'k_yx', up: 0 }];
    run.hold[m.id] = [{ id: 'm_eld', up: 0 }];
    const rest = run.plan.route.nodes.find((n) => n.kind === 'rest')!;
    enterStop(party.world, run, rest.id, party.ctx());
    for (let i = 0; i < 4; i++) step(party, false, []);
    // not a runa I hold, a runa I hold, and once only
    expect(sharpenRuna(party.world, k.id, 'm_eld', party.ctx())[0]!.t).toBe('toast');
    expect(run.hold[k.id]![0]!.up).toBe(0);
    sharpenRuna(party.world, k.id, 'k_yx', party.ctx());
    expect(run.hold[k.id]![0]!.up).toBe(1);
    expect(sharpenRuna(party.world, k.id, 'k_yx', party.ctx())).toEqual([]);
    expect(run.hold[k.id]![0]!.up).toBe(1);
    const inst = party.world.areas![run.key]!.saga!;
    expect(inst.run!.buffs[k.id]!.spell.yxhugg).toBeCloseTo(0.3 * 1.25);
    // Vila instead: a quarter more health, once
    const f = inst.fighters[m.id]!;
    f.hp = 1;
    restMore(party.world, m.id);
    expect(f.hp).toBeGreaterThan(f.max * 0.2);
    f.hp = 1;
    expect(restMore(party.world, m.id)).toEqual([]);
    expect(f.hp).toBe(1);
    expect(sharpenRuna(party.world, m.id, 'm_eld', party.ctx())).toEqual([]);
  });
});
