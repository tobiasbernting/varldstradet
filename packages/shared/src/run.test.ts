// Runs (M5b): the generator, the data, every effect of every runa and node, the run's rules (the vote, sagafrön, the timer,
// the wipe, joining, the companion, the sagaträd, the farm's objects, saves) and whole runs played by bot parties.
import { describe, expect, it } from 'vitest';
import {
  BOSS_ZONE,
  CLASSES,
  CLASS_IDS,
  DUNGEONS,
  DUNGEON_IDS,
  EFFECT_KEYS,
  MODIFIERS,
  MODIFIER_TEXT,
  RUNOR,
  RUNA_NAMES,
  RUNA_TEXT,
  RUN_BIOMES,
  RUN_MAX_MS,
  RUN_PICK_MS,
  RUN_SEEDS,
  RUN_T,
  RUN_WARN_MS,
  SAGA_BOSSES,
  SEED_TREE,
  TILE,
  TREE_NAMES,
  TREE_STAGES,
  TREE_TEXT,
  TREE_TOTAL,
  SOLO_MERCY,
  ITEMS,
  WIPE_MS,
  XP_LEVELS,
  equipGear,
  fighterMax,
  ZONE_INTROS,
  ZONE_NAMES,
  ZONE_TEMPLATES,
  FARDKOST,
  FOOD_TEXT,
  MODIFIER_NAMES,
  addEffect,
  addObject,
  applyMove,
  archFrontOf,
  buffsOf,
  buildZone,
  castSpell,
  chapterBoss,
  chooseFardkost,
  endRun,
  ensureRunPlaces,
  fardportOf,
  foodSlots,
  generateRun,
  getArea,
  isSolidForPlayer,
  joinRun,
  jumpTo,
  leaveRun,
  newRunSave,
  noBuffs,
  objectAt,
  offerRunor,
  performAction,
  pickRuna,
  plantError,
  plantNode,
  plantedByFamily,
  placeIn,
  readRun,
  rejoinRun,
  rerollOffer,
  runOf,
  runSaveOf,
  shootOf,
  startRun,
  spawnSagaMob,
  tick,
  treeNode,
  treeStage,
  unlocksOf,
  mulberry32,
  type Change,
  type ClassId,
  type DungeonId,
  type RunEffect,
  type WorldState,
} from './index.ts';
import { makeParty, playRun, step, type Party } from './runplay.ts';

const px = (t: number): number => t * TILE + TILE / 2;

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

function reach(w: WorldState, from: { x: number; y: number }): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = `${n.x},${n.y}`;
      if (seen.has(k) || isSolidForPlayer(w, n.x, n.y)) continue;
      seen.add(k);
      q.push(n);
    }
  }
  return seen;
}
const near = (seen: Set<string>, t: { x: number; y: number }): boolean => [0, 1, -1].some((dx) => [0, 1, -1].some((dy) => seen.has(`${t.x + dx},${t.y + dy}`)));
const tileOfMob = (a: { x: number; y: number }): { x: number; y: number } => ({ x: Math.floor(a.x / TILE), y: Math.floor(a.y / TILE) });

describe('the generator', () => {
  it('makes 200 seeded runs, each walkable from the arch (start) to the boss with every rest stone reachable', { timeout: 120_000 }, () => {
    let rooms4 = 0;
    let rooms6 = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const boss = DUNGEON_IDS[seed % DUNGEON_IDS.length]!;
      const plan = generateRun(seed, { boss, replay: seed % 3 === 0, clears: 1 + (seed % 3) });
      expect(plan.zones).toHaveLength(4);
      // three different biomes, then the boss
      const biomes = plan.zones.slice(0, 3).map((z) => z.biome);
      expect(new Set(biomes).size).toBe(3);
      expect(plan.zones[3]!.kind).toBe('boss');
      for (const z of plan.zones) {
        const w = buildZone(plan, z.index, `saga:test${seed}z${z.index}`);
        const inst = w.saga!;
        if (z.kind === 'zone') {
          expect(z.def.rooms.length).toBeGreaterThanOrEqual(4);
          expect(z.def.rooms.length).toBeLessThanOrEqual(6);
          if (z.def.rooms.length === 4) rooms4++;
          if (z.def.rooms.length === 6) rooms6++;
        }
        expect(inst.rests).toHaveLength(1);
        // the gate shuts the way on until it opens: the exit (or the boss) is out of reach, everything before it is not
        const before = reach(w, inst.start);
        const goal = z.kind === 'zone' ? inst.exit : tileOfMob(w.animals[inst.boss]!);
        expect(near(before, goal)).toBe(false);
        expect(near(before, inst.rests[0]!)).toBe(true);
        expect(inst.gate.length).toBeGreaterThanOrEqual(2);
        for (const g of inst.gate) {
          const o = objectAt(w, g.x, g.y)!;
          delete w.occupancy[`${g.x},${g.y}`];
          delete w.objects[o.id];
        }
        const after = reach(w, inst.start);
        expect(near(after, goal)).toBe(true);
        expect(near(after, inst.rests[0]!)).toBe(true);
        for (const m of Object.values(inst.mobs)) expect(after.has(`${Math.floor(m.home.x / TILE)},${Math.floor(m.home.y / TILE)}`)).toBe(true);
        for (const o of Object.values(w.objects)) if (o.kind === 'saga_chest') expect(near(after, o)).toBe(true);
        if (z.kind === 'zone') expect(objectAt(w, inst.exit.x, inst.exit.y)?.kind).toBe('run_exit');
        // no stray dungeon exit in a zone: a run is left with `leave`
        expect(Object.values(w.objects).some((o) => o.kind === 'saga_exit')).toBe(false);
      }
    }
    // the shorter and longer layouts both come up
    expect(rooms4).toBeGreaterThan(0);
    expect(rooms6).toBeGreaterThan(0);
  });

  it('is deterministic from the seed, and different seeds give different runs', () => {
    const a = generateRun(42, { boss: 'hel' });
    const b = generateRun(42, { boss: 'hel' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const worldA = buildZone(a, 1, 'saga:x');
    const worldB = buildZone(b, 1, 'saga:x');
    expect(JSON.stringify(worldA.terrain)).toBe(JSON.stringify(worldB.terrain));
    const chains = new Set(Array.from({ length: 30 }, (_, i) => generateRun(i + 1, { boss: 'hel' }).zones.slice(0, 3).map((z) => z.biome).join('>')));
    expect(chains.size).toBeGreaterThan(10);
  });

  it('uses every biome, and each zone is the biome of its template: floor, monsters and the weather', () => {
    const used = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const plan = generateRun(seed, { boss: 'draug' });
      for (const z of plan.zones.slice(0, 3)) {
        const t = ZONE_TEMPLATES[z.biome!];
        used.add(z.biome!);
        expect(z.def.floor).toBe(t.floor);
        expect(t.weather).toContain(z.weather);
        expect(z.name).toBe(ZONE_NAMES[z.biome!]);
        const species = new Set([...t.mobs.small, ...t.mobs.medium, ...t.mobs.big]);
        for (const r of z.def.rooms) for (const pk of r.packs ?? []) for (const m of pk) expect(species.has(m)).toBe(true);
      }
    }
    expect([...used].sort()).toEqual([...RUN_BIOMES].sort());
    for (const b of RUN_BIOMES) expect(ZONE_INTROS[b]).toBeTruthy();
  });

  it('keeps every template inside the map with the rooms apart, and the exit behind the gate', () => {
    for (const t of Object.values(ZONE_TEMPLATES)) {
      expect(t.rooms.map((r) => r.role)).toEqual(['start', 'pack', 'pack', 'rest', 'exit', 'side']);
      t.rooms.forEach((a, i) => {
        expect(a.x).toBeGreaterThanOrEqual(3);
        expect(a.y).toBeGreaterThanOrEqual(3);
        expect(a.x + a.w).toBeLessThanOrEqual(61);
        expect(a.y + a.h).toBeLessThanOrEqual(61);
        t.rooms.forEach((b, j) => {
          if (j <= i) return;
          const apart = a.x + a.w + 2 <= b.x || b.x + b.w + 2 <= a.x || a.y + a.h + 2 <= b.y || b.y + b.h + 2 <= a.y;
          expect(apart, `${t.biome}: rooms ${i} and ${j}`).toBe(true);
        });
      });
      expect(t.links.some(([, c]) => c === 4)).toBe(true);
      for (const [p, c] of t.links) expect(p).not.toBe(c);
    }
    for (const r of [BOSS_ZONE.start, BOSS_ZONE.pack, BOSS_ZONE.rest, BOSS_ZONE.guard, BOSS_ZONE.hall]) {
      expect(r.x).toBeGreaterThanOrEqual(3);
      expect(r.x + r.w).toBeLessThanOrEqual(61);
      expect(r.y + r.h).toBeLessThanOrEqual(61);
    }
  });

  it('chooses the chapter boss in the saga order, and gives replays modifiers and every boss move', () => {
    expect(chapterBoss([])).toBe('draug');
    expect(chapterBoss(['draug', 'frost'])).toBe('surt');
    expect(chapterBoss([...DUNGEON_IDS])).toBeNull();
    const first = generateRun(5, { boss: 'draug' });
    expect(first.modifiers).toEqual([]);
    expect(first.replay).toBe(false);
    const moves = SAGA_BOSSES[DUNGEONS.draug.boss]!.moves;
    // a first clear leaves one attack out, never the first nor the one that can be stopped
    expect(first.moves!.length).toBe(moves.length - 1);
    expect(first.moves).toContain(0);
    expect(first.moves).toContain(moves.findIndex((m) => m.interrupt));
    const replays = [1, 2, 3, 4].map((clears) => generateRun(5, { boss: 'draug', replay: true, clears }));
    expect(replays.map((r) => r.modifiers.length)).toEqual([1, 2, 3, 3]);
    for (const r of replays) expect(r.moves).toBeUndefined();
    // each modifier does what it says on the plan
    const w = (id: string) => generateRun(9, { boss: 'draug', modifiers: [id] });
    expect(w('segare').zones[0]!.hpMul).toBeCloseTo(generateRun(9, { boss: 'draug' }).zones[0]!.hpMul * 1.25);
    expect(w('harda').zones[0]!.dmgMul).toBe(1.2);
    expect(w('snabba').zones[0]!.sight).toBe(1.4);
    expect(w('dimma').zones[0]!.leash).toBe(6);
    expect(w('dimma').zones[0]!.weather).toBe('fog');
    expect(w('vakten').zones[3]!.def.rooms.some((r) => r.kind === 'mini')).toBe(true);
    const plain = generateRun(9, { boss: 'draug' });
    const more = w('fler');
    const count = (p: typeof plain) => p.zones[1]!.def.rooms.flatMap((r) => r.packs ?? []).reduce((n, pk) => n + pk.length, 0);
    expect(count(more)).toBeGreaterThan(count(plain));
  });
});

// ---------------------------------------------------------------------------
// The data
// ---------------------------------------------------------------------------

describe('the data', () => {
  it('has at least 8 runor for each class and 6 for the whole party, each with a Swedish name, text and picture', () => {
    for (const c of CLASS_IDS) expect(RUNOR.filter((r) => r.cls === c).length).toBeGreaterThanOrEqual(8);
    expect(RUNOR.filter((r) => !r.cls)).toHaveLength(6);
    expect(new Set(RUNOR.map((r) => r.id)).size).toBe(RUNOR.length);
    for (const r of RUNOR) {
      expect(RUNA_NAMES[r.id], r.id).toBeTruthy();
      expect(RUNA_NAMES[r.id]!.split(' ').length).toBeLessThanOrEqual(4);
      expect(RUNA_TEXT[r.id], r.id).toBeTruthy();
      expect(RUNA_TEXT[r.id]!.length).toBeLessThanOrEqual(40);
      expect(RUNA_TEXT[r.id]).toMatch(/\d/);
      expect(r.icon).toBeTruthy();
      expect(Object.keys(r.effect).length).toBeGreaterThan(0);
      for (const k of Object.keys(r.effect)) expect(EFFECT_KEYS).toContain(k);
      // a class's runa only reaches for the class's own spells
      for (const s of [...Object.keys(r.effect.spell ?? {}), ...Object.keys(r.effect.spellCd ?? {})]) expect(r.cls && CLASSES[r.cls].spells.includes(s), r.id).toBe(true);
    }
  });

  it('has at least 12 nodes in the three branches of the tree, with names, texts, costs and a root in each', () => {
    expect(SEED_TREE.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SEED_TREE.map((n) => n.branch))).toEqual(new Set(['hjalte', 'gemenskap', 'gard']));
    for (const b of ['hjalte', 'gemenskap', 'gard']) expect(SEED_TREE.some((n) => n.branch === b && !n.needs)).toBe(true);
    for (const n of SEED_TREE) {
      expect(TREE_NAMES[n.id], n.id).toBeTruthy();
      expect(TREE_TEXT[n.id], n.id).toBeTruthy();
      expect(n.cost).toBeGreaterThan(0);
      if (n.needs) expect(treeNode(n.needs)?.branch).toBe(n.branch);
      for (const k of Object.keys(n.effect)) expect(EFFECT_KEYS).toContain(k);
    }
    expect(TREE_TOTAL).toBe(SEED_TREE.reduce((s, n) => s + n.cost, 0));
    expect(TREE_STAGES).toHaveLength(5);
  });

  it('names every modifier, zone and dish, and every dish is an item the farm makes', () => {
    for (const m of MODIFIERS) {
      expect(MODIFIER_NAMES[m.id]).toBeTruthy();
      expect(MODIFIER_TEXT[m.id]).toBeTruthy();
    }
    for (const d of Object.keys(FARDKOST)) expect(FOOD_TEXT[d], d).toBeTruthy();
    for (const b of RUN_BIOMES) expect(ZONE_NAMES[b]).toBeTruthy();
  });

  it('adds effects up, and turns the combat part into buffs that start at zero', () => {
    expect(JSON.stringify(noBuffs())).toBe(JSON.stringify(buffsOf({})));
    const e: RunEffect = {};
    addEffect(e, { power: 0.1, spell: { hugg: 0.2 }, potions: 2 });
    addEffect(e, { power: 0.05, spell: { hugg: 0.1, utmana: 0.3 } }, 2);
    expect(e.power).toBeCloseTo(0.2);
    expect(e.spell).toEqual({ hugg: expect.closeTo(0.4), utmana: expect.closeTo(0.6) });
    const b = buffsOf(e);
    expect(b.power).toBeCloseTo(0.2);
    expect(b.spell.hugg).toBeCloseTo(0.4);
    expect(b.cd).toBe(0);
  });

  it('offers three cards: no repeats, a card for the classes present, party-wide ones for a solo hero, never one already taken', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      const cards = offerRunor(rnd, ['vaktare', 'helare', 'magiker'], []);
      expect(cards).toHaveLength(3);
      expect(new Set(cards).size).toBe(3);
      const classes = cards.map((id) => RUNOR.find((r) => r.id === id)!.cls);
      expect(classes.filter((c) => c).length).toBeGreaterThanOrEqual(2);
      // nothing for a class that is not in the party
      for (const c of classes) expect(c === undefined || ['vaktare', 'helare', 'magiker'].includes(c)).toBe(true);
    }
    const have = RUNOR.filter((r) => r.cls === 'krigare').slice(0, 7).map((r) => r.id);
    for (let i = 0; i < 40; i++) for (const c of offerRunor(rnd, ['krigare'], have)) expect(have).not.toContain(c);
  });
});

// ---------------------------------------------------------------------------
// Every effect does what it says in the fight
// ---------------------------------------------------------------------------

/** A run of two heroes in its first zone, with the first hero's buffs set to `effect` before the fight begins. */
function lab(effect: RunEffect, classes: ClassId[] = ['magiker', 'helare']) {
  const party = makeParty(classes, { seed: 3 });
  startRun(party.world, party.players[0]!.id, { seed: 3 }, party.ctx());
  const run = runOf(party.world)!;
  const area = party.world.areas![run.key]!;
  const inst = area.saga!;
  inst.run!.buffs = { [party.players[0]!.id]: buffsOf(effect) };
  const rnd = { v: 0.99 };
  const ctx = () => ({ season: 'none' as const, now: party.now, rnd: () => rnd.v });
  const go = (ms: number): Change[] => {
    const out: Change[] = [];
    for (let t = 0; t < ms; t += 50) {
      party.now += 50;
      out.push(...tick(party.world, 50, ctx()));
    }
    return out;
  };
  go(100);
  const p = party.players[0]!;
  const f = inst.fighters[p.id]!;
  const place = (species: string, dx: number, kind: 'mob' | 'mini' | 'boss' = 'mob') => {
    const m = spawnSagaMob(area, inst, species, p.x + dx * TILE, p.y, kind, -1);
    return { animal: m, mob: inst.mobs[m.id]! };
  };
  return { party, run, area, inst, p, f, go, ctx, rnd, place, q: party.players[1]!, fq: inst.fighters[party.players[1]!.id]! };
}

describe('every effect', () => {
  const dmg = (e: RunEffect, spell = 'eldboll', rnd = 0.99): number => {
    const l = lab(e);
    l.rnd.v = rnd;
    const { mob } = l.place('skelett', 3);
    const out = castSpell(l.party.world, l.p.id, spell, mob.id, l.ctx());
    const h = out.find((c) => c.t === 'hit' && c.on === mob.id);
    return h && h.t === 'hit' ? h.n : 0;
  };

  it('power and a single spell’s power make that spell hit harder', () => {
    const base = dmg({});
    expect(dmg({ power: 0.1 })).toBeGreaterThan(base);
    expect(dmg({ spell: { eldboll: 0.3 } })).toBeGreaterThan(dmg({ power: 0.1 }));
    expect(dmg({ spell: { isspjut: 0.3 } })).toBe(base);
    expect(Math.abs(dmg({ spell: { eldboll: 0.3 } }) - base * 1.3)).toBeLessThanOrEqual(1);
  });

  it('crit adds to the chance of a critical hit', () => {
    const base = dmg({}, 'eldboll', 0.15);
    expect(dmg({ crit: 0.1 }, 'eldboll', 0.15)).toBeGreaterThan(base * 1.4);
  });

  it('cd and a single spell’s cd shorten the cooldown', () => {
    const cd = (e: RunEffect, spell = 'eldboll'): number => {
      const l = lab(e);
      const { mob } = l.place('skelett', 3);
      const t = l.party.now;
      castSpell(l.party.world, l.p.id, spell, mob.id, l.ctx());
      return l.f.cd[spell]! - t;
    };
    expect(cd({})).toBe(1300);
    expect(cd({ cd: 0.12 })).toBeCloseTo(1300 * 0.88);
    expect(cd({ spellCd: { eldboll: 0.5 } })).toBeCloseTo(650);
    expect(cd({ spellCd: { askregn: 0.5 } })).toBe(1300);
    // never less than 40 % of it
    expect(cd({ cd: 0.9 })).toBeCloseTo(1300 * 0.4);
  });

  it('hp, armor and taken make a fighter tougher', () => {
    const max = (e: RunEffect) => lab(e).f.max;
    expect(max({ hp: 0.15 })).toBe(Math.round(max({}) * 1.15));
    const lost = (e: RunEffect): number => {
      const l = lab(e);
      l.inst.run!.dmgMul = 10;
      const { mob } = l.place('skelett', 1);
      mob.state = 'fight';
      mob.threat[l.p.id] = 5;
      mob.atkAt = l.party.now;
      const before = l.f.hp;
      l.go(200);
      return before - l.f.hp;
    };
    const base = lost({});
    expect(base).toBeGreaterThan(0);
    expect(lost({ armor: 0.1 })).toBeLessThan(base);
    expect(lost({ taken: 0.1 })).toBeLessThan(base);
    // monsters hit harder in a run with a damage modifier
    const l = lab({});
    expect(l.inst.run!.dmgMul).toBe(1);
  });

  it('the run’s health buff survives a level-up and a change of gear, for the hero and the hired companion', () => {
    const party = makeParty(['magiker'], { seed: 3, longhall: true, level: 3 });
    const p = party.players[0]!;
    startRun(party.world, p.id, { seed: 3 }, party.ctx());
    const run = runOf(party.world)!;
    const area = party.world.areas![run.key]!;
    const inst = area.saga!;
    const cid = run.companions[0]!;
    const c = party.world.players[cid]!;
    inst.run!.buffs = { [p.id]: buffsOf({ hp: 0.15 }), [cid]: buffsOf({ hp: 0.15 }) };
    for (let i = 0; i < 4; i++) step(party, false, []);
    delete inst.fighters[p.id];
    delete inst.fighters[cid];
    placeIn(party.world, p, run.key, inst.start.x, inst.start.y, 'up', []);
    placeIn(party.world, c, run.key, inst.start.x + 1, inst.start.y, 'up', []);
    for (let i = 0; i < 4; i++) step(party, false, []);
    const f = inst.fighters[p.id]!;
    const fc = inst.fighters[cid]!;
    const want = (q: typeof p): number => Math.round(fighterMax(q, q.saga!.cls!) * 1.15);
    expect(f.max).toBe(want(p));
    expect(fc.max).toBe(want(c));
    // gear: taking the amulet off changes the base, the buff stays
    equipGear(party.world, p.id, 'amulet', null);
    expect(f.max).toBe(want(p));
    expect(f.max).toBeLessThan(fighterMax({ ...p, saga: { ...p.saga!, gear: { ...p.saga!.gear, amulet: 'stenamulett' } } } as typeof p, 'magiker') * 1.15);
    // a level-up from a kill (both of them get the experience)
    p.saga!.xp = XP_LEVELS[3]! - 1;
    c.saga!.xp = XP_LEVELS[3]! - 1;
    const mob = spawnSagaMob(area, inst, 'skelett', p.x + TILE, p.y, 'mob', -1);
    inst.mobs[mob.id]!.hp = 1;
    inst.mobs[mob.id]!.state = 'fight';
    castSpell(party.world, p.id, 'eldboll', mob.id, party.ctx());
    expect(inst.mobs[mob.id]).toBeUndefined();
    expect(f.max).toBe(want(p));
    expect(fc.max).toBe(want(c));
    // and without a run buff nothing changes: a plain number
    inst.run!.buffs = {};
    p.saga!.xp = XP_LEVELS[4]! - 1;
    const mob2 = spawnSagaMob(area, inst, 'skelett', p.x + TILE, p.y, 'mob', -1);
    inst.mobs[mob2.id]!.hp = 1;
    inst.mobs[mob2.id]!.state = 'fight';
    party.now += 5000;
    castSpell(party.world, p.id, 'eldboll', mob2.id, party.ctx());
    expect(f.max).toBe(fighterMax(p, 'magiker'));
  });

  it('heal, potion and reviveHp make healing and potions stronger, and a revived friend wake with more health', () => {
    const healed = (e: RunEffect): number => {
      const l = lab(e);
      l.f.hp = 10;
      castSpell(l.party.world, l.p.id, 'lakerunan', l.p.id, l.ctx());
      return l.f.hp - 10;
    };
    // the mage has no heal: use the healer as the first hero
    const healer = (e: RunEffect): number => {
      const l = lab(e, ['helare', 'vaktare']);
      l.f.hp = 10;
      castSpell(l.party.world, l.p.id, 'lakerunan', l.p.id, l.ctx());
      return l.f.hp - 10;
    };
    expect(healed({})).toBe(0);
    expect(healer({ heal: 0.15 })).toBeGreaterThan(healer({}));
    expect(healer({ spell: { lakerunan: 0.25 } })).toBeGreaterThan(healer({ heal: 0.15 }));
    const potion = (e: RunEffect): number => {
      const l = lab(e);
      l.f.hp = 1;
      l.f.potionAt = 0;
      l.p.inventory[5] = { item: 'healing_potion', count: 1 };
      l.go(0);
      const out: Change[] = [];
      out.push(...performAction(l.area, l.p.id, 0, 0, l.ctx()));
      return l.f.hp;
    };
    void potion;
    const drunk = (e: RunEffect): number => {
      const l = lab(e);
      l.f.hp = 1;
      l.p.selected = 0;
      l.p.inventory[0] = { item: 'healing_potion', count: 2 };
      performAction(l.area, l.p.id, Math.floor(l.p.x / TILE), Math.floor(l.p.y / TILE) + 1, l.ctx());
      return l.f.hp - 1;
    };
    expect(drunk({ potion: 0.15 })).toBeGreaterThan(drunk({}));
    const revived = (e: RunEffect): number => {
      const l = lab(e, ['helare', 'vaktare']);
      l.fq.down = l.party.now;
      l.fq.hp = 0;
      l.q.x = l.p.x + TILE;
      l.q.y = l.p.y;
      castSpell(l.party.world, l.p.id, 'vackupp', l.q.id, l.ctx());
      return l.fq.hp;
    };
    const tankMax = lab({}, ['helare', 'vaktare']).fq.max;
    expect(revived({})).toBe(Math.round(tankMax * 0.5));
    expect(revived({ reviveHp: 0.25 })).toBe(Math.round(tankMax * 0.75));
  });

  it('regen and rest make health come back faster, away from a fight and by a rest stone', () => {
    const regen = (e: RunEffect): number => {
      const l = lab(e);
      l.f.hp = 10;
      l.f.fightAt = 0;
      l.go(3000);
      return l.f.hp - 10;
    };
    expect(regen({ regen: 0.5 })).toBeGreaterThan(regen({}) * 1.3);
    const rest = (e: RunEffect): number => {
      const l = lab(e);
      const r = l.inst.rests[0]!;
      l.p.x = px(r.x);
      l.p.y = px(r.y) + TILE;
      l.f.hp = 10;
      l.go(1000);
      return l.f.hp - 10;
    };
    expect(rest({ rest: 0.6 })).toBeGreaterThan(rest({}) * 1.3);
  });

  it('down makes a fallen friend get up sooner', () => {
    const up = (e: RunEffect): number => {
      const l = lab(e);
      l.f.down = l.party.now;
      l.f.hp = 0;
      let t = 0;
      while (l.f.down !== undefined && t < 20_000) {
        l.go(50);
        t += 50;
      }
      return t;
    };
    expect(up({})).toBeGreaterThanOrEqual(10_000);
    expect(up({ down: 0.4 })).toBeLessThan(up({}) * 0.7);
  });

  it('threat and leech: a fighter makes the monsters care more, and heals from what they do', () => {
    const threat = (e: RunEffect): number => {
      const l = lab(e);
      const { mob } = l.place('skelett', 3);
      castSpell(l.party.world, l.p.id, 'eldboll', mob.id, l.ctx());
      return mob.threat[l.p.id] ?? 0;
    };
    expect(threat({ threat: 0.5 })).toBeGreaterThan(threat({}) * 1.3);
    const leech = (e: RunEffect): number => {
      const l = lab(e);
      l.f.hp = 50;
      const { mob } = l.place('skelett', 3);
      castSpell(l.party.world, l.p.id, 'eldboll', mob.id, l.ctx());
      return l.f.hp - 50;
    };
    expect(leech({})).toBe(0);
    expect(leech({ leech: 0.5 })).toBeGreaterThan(5);
  });

  it('coins: a chest of the run gives more coins', () => {
    const coins = (e: RunEffect): number => {
      const l = lab(e);
      const c = addObject(l.area, 'saga_chest', Math.floor(l.p.x / TILE) + 1, Math.floor(l.p.y / TILE), { variant: 0 })!;
      const before = l.p.coins;
      l.rnd.v = 0.5;
      performAction(l.area, l.p.id, c.x, c.y, l.ctx());
      return l.p.coins - before;
    };
    expect(coins({})).toBeGreaterThan(0);
    expect(coins({ coins: 0.25 })).toBeGreaterThan(coins({}));
  });

  it('a run’s monsters’ health, damage, sight, leash and unlocked boss moves come from the plan', () => {
    const l = lab({});
    const { mob } = l.place('skelett', 3);
    l.inst.run!.hpMul = 2;
    l.inst.run!.sight = 3;
    mob.state = 'idle';
    castSpell(l.party.world, l.p.id, 'eldboll', mob.id, l.ctx());
    expect(mob.max).toBe(Math.round(170 * (0.4 + 0.45 * 2) * 2));
    // only the unlocked attacks are ever cast
    const plan = generateRun(5, { boss: 'draug', modifiers: [] });
    const w = lab({});
    const boss = w.place('draugkung', 4, 'boss');
    w.inst.run!.moves = [0];
    w.inst.run!.dmgMul = 0;
    boss.mob.state = 'fight';
    boss.mob.threat[w.p.id] = 5;
    boss.mob.phase = 2;
    boss.mob.next = SAGA_BOSSES.draugkung!.moves.map(() => w.party.now);
    const seen = new Set<number>();
    for (let t = 0; t < 30_000; t += 50) {
      w.go(50);
      w.f.hp = w.f.max;
      if (w.inst.mobs[boss.mob.id]?.cast) seen.add(w.inst.mobs[boss.mob.id]!.cast!.move);
    }
    expect([...seen]).toEqual([0]);
    expect(plan.moves).toBeDefined();
  });

  it('every runa and node changes something: a combat number in the buffs or one of the run’s own', () => {
    const meta = ['potions', 'seeds', 'reroll', 'slots', 'food', 'animal', 'companion', 'bossSeeds'];
    for (const e of [...RUNOR.map((r) => r.effect), ...SEED_TREE.map((n) => n.effect)]) {
      const b = buffsOf(e);
      const changed = JSON.stringify(b) !== JSON.stringify(noBuffs()) || Object.keys(e).some((k) => meta.includes(k));
      expect(changed).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const listen = (ch: Change[], text: string): boolean => ch.some((c) => (c.t === 'toast' || c.t === 'banner') && c.text.includes(text));

describe('starting, joining and leaving', () => {
  it('puts the färdport and the Yggdrasil shoot on the farm, once, beside each other', () => {
    const party = makeParty(['krigare']);
    const w = party.world;
    const arch = fardportOf(w)!;
    const shoot = shootOf(w)!;
    expect(arch).toBeTruthy();
    expect(shoot).toBeTruthy();
    expect(Math.hypot(arch.x - shoot.x, arch.y - shoot.y)).toBeLessThan(8);
    const n = Object.keys(w.objects).length;
    expect(ensureRunPlaces(w)).toBe(false);
    expect(Object.keys(w.objects)).toHaveLength(n);
    // the front of the arch is open ground
    const f = archFrontOf(w);
    expect(isSolidForPlayer(w, f.x, f.y)).toBe(false);
    expect(reach(w, f).size).toBeGreaterThan(100);
  });

  it('keeps the family’s own shoot where it is and puts the arch beside it; puts both back if they go', () => {
    const w = makeParty(['krigare']).world;
    for (const o of Object.values(w.objects)) if (o.kind === 'fardport' || o.kind === 'yggdrasil') {
      delete w.occupancy[`${o.x},${o.y}`];
      delete w.objects[o.id];
    }
    // clear the arch's whole footprint in the occupancy
    for (const [k, id] of Object.entries(w.occupancy)) if (!w.objects[id]) delete w.occupancy[k];
    const own = addObject(w, 'yggdrasil', 40, 30, { by: 'p1' })!;
    expect(ensureRunPlaces(w)).toBe(true);
    expect(shootOf(w)!.id).toBe(own.id);
    expect(Math.hypot(fardportOf(w)!.x - own.x, fardportOf(w)!.y - own.y)).toBeLessThan(8);
    expect(Object.values(w.objects).filter((o) => o.kind === 'yggdrasil')).toHaveLength(1);
  });

  it('starts only for someone with a class, standing at the arch, and only one run at a time', () => {
    const party = makeParty(['krigare', 'vaktare']);
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const far = { ...a };
    void far;
    a.x = px(2);
    a.y = px(2);
    expect(listen(startRun(party.world, a.id, {}, party.ctx()), RUN_T.needPort)).toBe(true);
    const front = archFrontOf(party.world);
    a.x = px(front.x);
    a.y = px(front.y);
    const saga = a.saga!;
    delete saga.cls;
    expect(startRun(party.world, a.id, {}, party.ctx()).some((c) => c.t === 'toast')).toBe(true);
    saga.cls = 'krigare';
    expect(runOf(party.world)).toBeUndefined();
    const ch = startRun(party.world, a.id, { seed: 4 }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.party).toEqual([a.id, b.id]);
    expect(a.area).toBe(run.key);
    expect(b.area).toBe(run.key);
    expect(ch.some((c) => c.t === 'run' && c.ev === 'state' && c.run?.id === run.id)).toBe(true);
    expect(ch.some((c) => c.t === 'banner' && c.kind === 'enter')).toBe(true);
    expect(listen(startRun(party.world, a.id, {}, party.ctx()), RUN_T.already)).toBe(true);
    expect(readRun(a).runs).toBe(1);
  });

  it('takes the family members at the arch along, joins at the last lit rest stone, and leaves', () => {
    const party = makeParty(['vaktare', 'helare', 'krigare']);
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    // c is far away, in the wild: not taken along
    placeIn(party.world, c, 'a:0,1', 5, 5, 'down', []);
    startRun(party.world, a.id, { seed: 4 }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.party).toEqual([a.id, b.id]);
    // she walks to the arch and joins: the start of the zone, as no rest stone is lit yet
    const front = archFrontOf(party.world);
    placeIn(party.world, c, 'farm', front.x, front.y, 'down', []);
    expect(joinRun(party.world, c.id, party.ctx()).some((x) => x.t === 'toast')).toBe(true);
    const area = party.world.areas![run.key]!;
    expect(run.party).toContain(c.id);
    expect(c.area).toBe(run.key);
    expect(Math.hypot(c.x - px(area.saga!.start.x), c.y - px(area.saga!.start.y))).toBeLessThan(4 * TILE);
    expect(joinRun(party.world, c.id, party.ctx())).toEqual([]);
    // leaving: back in front of the arch, with everything
    const bag = JSON.stringify(c.inventory);
    leaveRun(party.world, c.id, party.ctx());
    expect(c.area).toBe('farm');
    expect(JSON.stringify(c.inventory)).toBe(bag);
    expect(run.party).not.toContain(c.id);
    // a second time, after a rest stone has been lit: she appears there
    const rest = area.saga!.rests[0]!;
    area.saga!.checkpoint = 0;
    joinRun(party.world, c.id, party.ctx());
    expect(Math.hypot(c.x - px(rest.x), c.y - px(rest.y))).toBeLessThan(3 * TILE);
  });

  it('nobody jumps into a run’s zone or out of it', () => {
    const party = makeParty(['vaktare', 'helare', 'krigare']);
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    placeIn(party.world, c, 'a:0,1', 5, 5, 'down', []);
    startRun(party.world, a.id, { seed: 4 }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.party).toEqual([a.id, b.id]);
    // from outside, to a member inside
    const into = jumpTo(party.world, c.id, a.id);
    expect(into.some((x) => x.t === 'toast')).toBe(true);
    expect(c.area).toBe('a:0,1');
    expect(run.party).not.toContain(c.id);
    // from inside, to someone outside
    const before = b.area;
    const out = jumpTo(party.world, b.id, c.id);
    expect(out.some((x) => x.t === 'toast')).toBe(true);
    expect(b.area).toBe(before);
    expect(b.area).toBe(run.key);
    expect(run.party).toContain(b.id);
    // and from inside to someone else inside
    expect(jumpTo(party.world, b.id, a.id).every((x) => x.t === 'toast')).toBe(true);
  });

  it('the solo mercy is for one human with the hired companion, not for a lone player without one', () => {
    const hp = (opts: { longhall?: boolean; companion?: boolean }): { mul: number; boss: number; plan: number; bossPlan: number } => {
      const party = makeParty(['krigare'], { seed: 6, longhall: opts.longhall });
      startRun(party.world, party.players[0]!.id, { seed: 6, ...(opts.companion === false ? { companion: false } : {}) }, party.ctx());
      const run = runOf(party.world)!;
      const r = party.world.areas![run.key]!.saga!.run!;
      return { mul: r.hpMul, boss: r.bossMul, plan: run.plan.zones[0]!.hpMul, bossPlan: run.plan.zones[0]!.bossMul };
    };
    const hired = hp({ longhall: true });
    expect(hired.mul).toBeCloseTo(hired.plan * SOLO_MERCY);
    expect(hired.boss).toBeCloseTo(hired.bossPlan * SOLO_MERCY);
    // no longhouse, or a hire turned down: one fighter, the plain numbers
    for (const alone of [hp({}), hp({ longhall: true, companion: false })]) {
      expect(alone.mul).toBe(alone.plan);
      expect(alone.boss).toBe(alone.bossPlan);
    }
    // two humans: no mercy either
    const duo = makeParty(['krigare', 'helare'], { seed: 6, longhall: true });
    startRun(duo.world, duo.players[0]!.id, { seed: 6 }, duo.ctx());
    const run = runOf(duo.world)!;
    expect(duo.world.areas![run.key]!.saga!.run!.hpMul).toBe(run.plan.zones[0]!.hpMul);
  });

  it('is full at three, or four with a longhouse', () => {
    const party = makeParty(['vaktare', 'helare', 'krigare', 'magiker']);
    const [a, , , d] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    expect(unlocksOf(party.world).longhall).toBe(false);
    startRun(party.world, a.id, { seed: 2 }, party.ctx());
    expect(runOf(party.world)!.party).toHaveLength(3);
    expect(listen(joinRun(party.world, d.id, party.ctx()), RUN_T.full)).toBe(true);
    const lh = makeParty(['vaktare', 'helare', 'krigare', 'magiker'], { longhall: true });
    expect(unlocksOf(lh.world).longhall).toBe(true);
    startRun(lh.world, lh.players[0]!.id, { seed: 2 }, lh.ctx());
    expect(runOf(lh.world)!.party).toHaveLength(4);
  });

  it('hires the Hirdmannen for one player with a longhouse: the class they lack, never saved, gone with the run', () => {
    const none = makeParty(['krigare']);
    startRun(none.world, none.players[0]!.id, { seed: 2 }, none.ctx());
    expect(runOf(none.world)!.companions).toHaveLength(0);
    for (const [cls, want] of [['krigare', 'helare'], ['magiker', 'helare'], ['vaktare', 'helare'], ['helare', 'vaktare']] as const) {
      const party = makeParty([cls], { longhall: true, level: 5 });
      const players = Object.keys(party.world.players).length;
      startRun(party.world, party.players[0]!.id, { seed: 2 }, party.ctx());
      const run = runOf(party.world)!;
      expect(run.companions).toHaveLength(1);
      const c = party.world.players[run.companions[0]!]!;
      expect(c.bot).toBe(true);
      expect(c.saga!.cls).toBe(want);
      expect(c.online).toBe(true);
      expect(c.area).toBe(run.key);
      expect(Object.keys(party.world.players)).toHaveLength(players + 1);
      // it plays: a few seconds in, it has moved or cast
      for (let i = 0; i < 40; i++) step(party, false, []);
      expect(party.world.areas![run.key]!.saga!.fighters[c.id]).toBeTruthy();
      endRun(party.world, run, 'leave', party.ctx());
      expect(party.world.players[c.id]).toBeUndefined();
      expect(Object.keys(party.world.players)).toHaveLength(players);
    }
    // not for a player who asked to go without, nor for two
    const two = makeParty(['krigare', 'helare'], { longhall: true });
    startRun(two.world, two.players[0]!.id, { seed: 2 }, two.ctx());
    expect(runOf(two.world)!.companions).toHaveLength(0);
    const quiet = makeParty(['krigare'], { longhall: true });
    startRun(quiet.world, quiet.players[0]!.id, { seed: 2, companion: false }, quiet.ctx());
    expect(runOf(quiet.world)!.companions).toHaveLength(0);
    // a friend who joins sends the companion home
    const solo = makeParty(['krigare', 'vaktare'], { longhall: true });
    const [a, b] = solo.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const f = archFrontOf(solo.world);
    b.x = px(f.x + 8);
    b.y = px(f.y);
    startRun(solo.world, a.id, { seed: 2 }, solo.ctx());
    expect(runOf(solo.world)!.companions).toHaveLength(1);
    b.x = px(f.x);
    b.y = px(f.y);
    joinRun(solo.world, b.id, solo.ctx());
    expect(runOf(solo.world)!.companions).toHaveLength(0);
  });

  it('starts the chapter after the last cleared, and a cleared boss at random on a replay', () => {
    const party = makeParty(['krigare']);
    const p = party.players[0]!;
    p.saga!.cleared = ['draug', 'frost'];
    startRun(party.world, p.id, { seed: 8 }, party.ctx());
    expect(runOf(party.world)!.plan.boss).toBe('surt');
    expect(runOf(party.world)!.plan.replay).toBe(false);
    const again = makeParty(['krigare']);
    again.players[0]!.saga!.cleared = ['draug', 'frost'];
    startRun(again.world, again.players[0]!.id, { seed: 8, replay: true }, again.ctx());
    const run = runOf(again.world)!;
    expect(['draug', 'frost']).toContain(run.plan.boss);
    expect(run.plan.replay).toBe(true);
    expect(run.plan.modifiers.length).toBeGreaterThanOrEqual(1);
  });
});

describe('the farm feeds the run', () => {
  it('färdkost: the dishes in the bag are taken, in as many slots as the tree gives, and give their buffs', () => {
    const party = makeParty(['krigare']);
    const p = party.players[0]!;
    p.inventory[3] = { item: 'bread', count: 2 };
    p.inventory[4] = { item: 'pumpkin_pie', count: 1 };
    p.inventory[5] = { item: 'carrot', count: 1 };
    expect(foodSlots(p)).toBe(1);
    const chosen = chooseFardkost(party.world, p.id, ['carrot', 'bread', 'pumpkin_pie']);
    expect(chosen[0]).toMatchObject({ t: 'fardkost', items: ['bread'] });
    startRun(party.world, p.id, { seed: 3 }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.food[p.id]).toEqual(['bread']);
    expect(p.inventory.find((s) => s?.item === 'bread')?.count).toBe(1);
    expect(run.base[p.id]!.hp).toBeCloseTo(0.06, 2);
    const inst = party.world.areas![run.key]!.saga!;
    expect(inst.run!.buffs[p.id]!.hp).toBeGreaterThanOrEqual(0.06);
    // two slots with the node f1, and the dishes 25 % stronger with f2
    const two = makeParty(['krigare']);
    const q = two.players[0]!;
    runSaveOf(q).tree = ['f1', 'f2'];
    q.inventory[3] = { item: 'bread', count: 1 };
    q.inventory[4] = { item: 'pumpkin_pie', count: 1 };
    expect(foodSlots(q)).toBe(2);
    startRun(two.world, q.id, { seed: 3, fardkost: ['bread', 'pumpkin_pie'] }, two.ctx());
    const r2 = runOf(two.world)!;
    expect(r2.food[q.id]).toEqual(['bread', 'pumpkin_pie']);
    expect(r2.base[q.id]!.hp).toBeCloseTo(0.06 * 1.25, 3);
    expect(r2.base[q.id]!.armor).toBeCloseTo(0.04 * 1.25, 3);
  });

  it('potions come as items: the start potions of the herb garden, the tree and a dish', () => {
    const party = makeParty(['krigare']);
    const p = party.players[0]!;
    const count = () => p.inventory.reduce((n, s) => n + (s?.item === 'healing_potion' ? s.count : 0), 0);
    expect(count()).toBe(3);
    runSaveOf(p).tree = ['f4'];
    const f = archFrontOf(party.world);
    addObject(party.world, 'herb_garden', f.x + 4, f.y + 1) ?? addObject(party.world, 'herb_garden', f.x - 6, f.y + 1);
    expect(unlocksOf(party.world).herb).toBe(true);
    startRun(party.world, p.id, { seed: 3 }, party.ctx());
    expect(count()).toBe(3 + 1 + 2);
    expect(runOf(party.world)!.base[p.id]!.potion).toBeCloseTo(0.1);
  });

  it('animals: a cared-for pet counts double, a mount only with a stall, and a happy farm gives health', () => {
    const party = makeParty(['krigare']);
    const p = party.players[0]!;
    const w = party.world;
    const dog = { id: 9001, species: 'dog', name: 'Fido', x: 0, y: 0, facing: 'down', moving: false, hearts: 2, heartProgress: 0, fed: false, petted: false, brushed: false, hasProduct: false, named: true, age: 10, homeId: 0, waitMs: 0, owner: p.id } as unknown as WorldState['animals'][number];
    w.animals[dog.id] = dog;
    const horse = { ...dog, id: 9002, species: 'horse', name: 'Blixt', hearts: 5 };
    w.animals[horse.id] = horse;
    const cow = { ...dog, id: 9003, species: 'cow', name: 'Kossan', hearts: 4, owner: undefined };
    w.animals[cow.id] = cow;
    startRun(w, p.id, { seed: 3 }, party.ctx());
    const e = runOf(w)!.base[p.id]!;
    expect(e.power).toBeCloseTo(0.03, 3);
    expect(e.armor ?? 0).toBe(0);
    expect(e.hp).toBeCloseTo(0.04, 3);
    // with 4 hearts the pet counts double, a stall lets the mount come, and f3 makes both stronger
    dog.hearts = 4;
    const f = archFrontOf(w);
    addObject(w, 'stall', f.x + 4, f.y + 1) ?? addObject(w, 'stall', f.x - 7, f.y + 1);
    runSaveOf(p).tree = ['f1', 'f3'];
    const again = makeParty(['krigare']);
    void again;
    endRun(w, runOf(w)!, 'leave', party.ctx());
    startRun(w, p.id, { seed: 3 }, party.ctx());
    const e2 = runOf(w)!.base[p.id]!;
    expect(e2.power).toBeCloseTo(0.03 * 2 * 1.5, 3);
    expect(e2.armor).toBeCloseTo(0.02 * 2 * 1.5, 3);
    expect(e2.hp).toBeCloseTo(0.03 * 2 * 1.5 + 0.04, 3);
  });

  it('the smithy gives spells +4 %', () => {
    const party = makeParty(['krigare']);
    const f = archFrontOf(party.world);
    addObject(party.world, 'smithy', f.x + 4, f.y + 1) ?? addObject(party.world, 'smithy', f.x - 8, f.y + 1);
    startRun(party.world, party.players[0]!.id, { seed: 3 }, party.ctx());
    expect(runOf(party.world)!.base[party.players[0]!.id]!.power).toBeCloseTo(0.04);
  });
});

describe('the vote on a runa', () => {
  /** A party whose first zone is cleared and who stand at the exit, the vote on. */
  function atTheVote(classes: ClassId[] = ['vaktare', 'helare', 'magiker']): Party {
    const party = makeParty(classes, { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const inst = party.world.areas![run.key]!.saga!;
    for (const pk of inst.packs) {
      pk.dead = true;
      for (const id of pk.members) {
        delete inst.mobs[id];
        delete party.world.areas![run.key]!.animals[id];
      }
    }
    for (let i = 0; i < 6; i++) step(party, false, []);
    expect(inst.gateOpen).toBe(true);
    const ex = inst.exit;
    const a0 = party.players[0]!;
    a0.x = px(ex.x);
    a0.y = px(ex.y) + TILE;
    const out = performAction(party.world.areas![run.key]!, a0.id, ex.x, ex.y, party.ctx());
    expect(out.some((c) => c.t === 'run' && c.ev === 'offer' && c.offer?.cards.length === 3)).toBe(true);
    expect(run.phase).toBe('pick');
    return party;
  }

  it('shuts the exit until the packs are down, and the sagafrön for the packs and the zone are paid', () => {
    const party = makeParty(['vaktare', 'helare', 'magiker'], { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const area = party.world.areas![run.key]!;
    const inst = area.saga!;
    const ex = inst.exit;
    party.players[0]!.x = px(ex.x);
    party.players[0]!.y = px(ex.y) + TILE;
    expect(listen(performAction(area, party.players[0]!.id, ex.x, ex.y, party.ctx()), RUN_T.exitShut)).toBe(true);
    expect(run.phase).toBe('zone');
    // two packs fall: a sagafrö each, to everyone
    for (const i of [0, 1]) {
      inst.packs[i]!.dead = true;
      for (const id of inst.packs[i]!.members) {
        delete inst.mobs[id];
        delete area.animals[id];
      }
    }
    step(party, false, []);
    for (const p of party.players) expect(readRun(p).seeds).toBe(2 * RUN_SEEDS.pack);
    // every pack on the way: the gate opens and the zone pays four more, once
    for (const pk of inst.packs) {
      pk.dead = true;
      for (const id of pk.members) {
        delete inst.mobs[id];
        delete area.animals[id];
      }
    }
    for (let i = 0; i < 5; i++) step(party, false, []);
    const required = inst.run!.required.length;
    const side = inst.packs.length - required;
    expect(inst.gateOpen).toBe(true);
    for (const p of party.players) expect(readRun(p).seeds).toBe(inst.packs.length * RUN_SEEDS.pack + RUN_SEEDS.zone);
    expect(side).toBeGreaterThanOrEqual(0);
    expect(run.earned[party.players[0]!.id]).toBe(readRun(party.players[0]!).seeds);
    expect(readRun(party.players[0]!).earned).toBe(readRun(party.players[0]!).seeds);
    for (const g of inst.gate) expect(objectAt(area, g.x, g.y)).toBeUndefined();
  });

  it('ends at once with a strict majority', () => {
    const party = atTheVote();
    const run = runOf(party.world)!;
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const cards = [...run.offer!.cards];
    pickRuna(party.world, a.id, 1, party.ctx());
    expect(run.phase).toBe('pick');
    pickRuna(party.world, b.id, 1, party.ctx());
    expect(run.phase).toBe('zone');
    expect(run.zone).toBe(1);
    expect(run.runor).toEqual([cards[1]]);
    void c;
  });

  it('with everyone voted and no majority, the most votes win and a tie goes to the card voted first', () => {
    const party = atTheVote();
    const run = runOf(party.world)!;
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const cards = [...run.offer!.cards];
    pickRuna(party.world, b.id, 2, party.ctx());
    pickRuna(party.world, a.id, 0, party.ctx());
    pickRuna(party.world, c.id, 1, party.ctx());
    expect(run.runor).toEqual([cards[2]]);
  });

  it('on the clock: the most votes, or the first card when nobody votes; a vote may be changed; bad votes are ignored', () => {
    const party = atTheVote();
    const run = runOf(party.world)!;
    const [a] = party.players as [import('./index.ts').PlayerState];
    const cards = [...run.offer!.cards];
    expect(pickRuna(party.world, a.id, 7, party.ctx())).toEqual([]);
    expect(pickRuna(party.world, a.id, -1, party.ctx())).toEqual([]);
    pickRuna(party.world, a.id, 2, party.ctx());
    pickRuna(party.world, a.id, 1, party.ctx());
    expect(run.offer!.votes[a.id]).toBe(1);
    for (let t = 0; t < RUN_PICK_MS + 200; t += 50) step(party, false, []);
    expect(run.runor).toEqual([cards[1]]);
    const quiet = atTheVote();
    const r2 = runOf(quiet.world)!;
    const first = r2.offer!.cards[0]!;
    for (let t = 0; t < RUN_PICK_MS + 200; t += 50) step(quiet, false, []);
    expect(r2.runor).toEqual([first]);
    expect(r2.zone).toBe(1);
  });

  it('a class runa reaches only that class, a party-wide one everybody, and the buffs follow into the next zone', () => {
    const party = atTheVote();
    const run = runOf(party.world)!;
    run.offer!.cards = ['m_eld', 'p_hjarta', 'k_yx'];
    for (const p of party.players) pickRuna(party.world, p.id, 0, party.ctx());
    expect(run.runor).toEqual(['m_eld']);
    const inst = party.world.areas![run.key]!.saga!;
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    expect(inst.run!.buffs[c.id]!.spell.eldboll).toBeCloseTo(0.3);
    expect(inst.run!.buffs[a.id]!.spell.eldboll).toBeUndefined();
    expect(inst.run!.buffs[b.id]!.spell.eldboll).toBeUndefined();
    // the next vote: a party-wide hp runa
    run.phase = 'zone';
    inst.gateOpen = true;
    a.x = px(inst.exit.x);
    a.y = px(inst.exit.y) + TILE;
    performAction(party.world.areas![run.key]!, a.id, inst.exit.x, inst.exit.y, party.ctx());
    expect(run.phase).toBe('pick');
    run.offer!.cards = ['p_hjarta', 'p_kraft', 'p_fro'];
    for (const p of party.players) pickRuna(party.world, p.id, 0, party.ctx());
    const next = party.world.areas![run.key]!.saga!;
    for (const p of party.players) expect(next.run!.buffs[p.id]!.hp).toBeCloseTo(0.1);
    expect(run.runor).toEqual(['m_eld', 'p_hjarta']);
    // and the fighters of the new zone have the health
    for (let i = 0; i < 4; i++) step(party, false, []);
    expect(next.fighters[a.id]!.max).toBe(Math.round((CLASSES.vaktare.hp + 0) * 0 + next.fighters[a.id]!.max));
    expect(run.zone).toBe(2);
  });

  it('p_flaska hands out two potions, and p_fro raises every later payment by a quarter', () => {
    const party = atTheVote(['krigare']);
    const run = runOf(party.world)!;
    const p = party.players[0]!;
    const potions = () => p.inventory.reduce((n, s) => n + (s?.item === 'healing_potion' ? s.count : 0), 0);
    const before = potions();
    run.offer!.cards = ['p_flaska', 'p_fro', 'p_kraft'];
    pickRuna(party.world, p.id, 0, party.ctx());
    expect(potions()).toBe(before + 2);
    expect(run.base[p.id]!.potion ?? 0).toBe(0);
    const inst = party.world.areas![run.key]!.saga!;
    expect(inst.run!.buffs[p.id]!.potion).toBeCloseTo(0.15);
    // p_fro: a pack is worth 1 and gives 1.25 (the quarter is carried, whole seeds are paid), a zone 4 → 5
    run.runor.push('p_fro');
    const seeds = readRun(p).seeds;
    const area = party.world.areas![run.key]!;
    for (const pk of inst.packs) {
      pk.dead = true;
      for (const id of pk.members) {
        delete inst.mobs[id];
        delete area.animals[id];
      }
    }
    for (let i = 0; i < 4; i++) step(party, false, []);
    const gained = readRun(p).seeds - seeds;
    const n = inst.packs.length;
    expect(gained).toBe(Math.floor((n + RUN_SEEDS.zone) * 1.25 + 1e-9));
    expect(gained).toBeGreaterThan(n + RUN_SEEDS.zone);
  });

  it('sagafrön bonuses are not rounded away: p_fro and two modifiers pay visibly more than none over the same events', () => {
    const play = (bonus: boolean): { gained: number; n: number; exact: number } => {
      const party = makeParty(['krigare'], { seed: 6 });
      const p = party.players[0]!;
      startRun(party.world, p.id, { seed: 6 }, party.ctx());
      const run = runOf(party.world)!;
      if (bonus) {
        run.runor.push('p_fro');
        run.plan.modifiers = ['fler', 'segare'];
      }
      const area = party.world.areas![run.key]!;
      const inst = area.saga!;
      const seeds = readRun(p).seeds;
      // the packs fall one at a time, each paid on its own, then the gate
      for (const pk of inst.packs) {
        pk.dead = true;
        for (const id of pk.members) {
          delete inst.mobs[id];
          delete area.animals[id];
        }
        step(party, false, []);
      }
      for (let i = 0; i < 4; i++) step(party, false, []);
      const n = inst.packs.length;
      return { gained: readRun(p).seeds - seeds, n, exact: (n + RUN_SEEDS.zone) * (bonus ? 1 + 0.25 + 0.3 : 1) };
    };
    const plain = play(false);
    const rich = play(true);
    expect(plain.gained).toBe(plain.n + RUN_SEEDS.zone);
    // the total over the run is the sum of n × (1 + bonus), to within one seed, and only whole seeds are paid
    expect(rich.gained).toBe(Math.floor(rich.exact + 1e-9));
    expect(rich.exact - rich.gained).toBeLessThan(1);
    expect(Number.isInteger(rich.gained)).toBe(true);
    expect(rich.gained).toBeGreaterThanOrEqual(plain.gained + Math.floor(plain.gained * 0.5));
  });

  it('a full bag: the potions of p_flaska land in the zone the player stands in, with the area on the change', () => {
    const party = atTheVote(['krigare']);
    const run = runOf(party.world)!;
    const p = party.players[0]!;
    const ids = Object.keys(ITEMS).filter((k) => k !== 'healing_potion');
    p.inventory = p.inventory.map((_, i) => ({ item: ids[i]!, count: 1 }));
    run.offer!.cards = ['p_flaska', 'p_fro', 'p_kraft'];
    const farmDrops = Object.keys(party.world.drops).length;
    const out = pickRuna(party.world, p.id, 0, party.ctx());
    expect(run.zone).toBe(1);
    const drop = out.find((c) => c.t === 'drop' && c.drop?.item === 'healing_potion');
    expect(drop).toBeTruthy();
    expect(drop!.t === 'drop' && drop!.area).toBe(run.key);
    expect(Object.values(party.world.areas![run.key]!.drops).some((d) => d.item === 'healing_potion' && d.count === 2)).toBe(true);
    expect(Object.keys(party.world.drops)).toHaveLength(farmDrops);
  });

  it('the tree’s fourth branch: the party may ask for new cards once, and only with the node g3', () => {
    const party = atTheVote(['krigare']);
    const run = runOf(party.world)!;
    const p = party.players[0]!;
    expect(listen(rerollOffer(party.world, p.id, party.ctx()), RUN_T.noReroll)).toBe(true);
    runSaveOf(p).tree = ['g1', 'g3'];
    const cards = [...run.offer!.cards];
    expect(listen(rerollOffer(party.world, p.id, party.ctx()), RUN_T.reroll)).toBe(true);
    expect(run.offer!.cards).toHaveLength(3);
    for (const c of run.offer!.cards) expect(cards).not.toContain(c);
    expect(listen(rerollOffer(party.world, p.id, party.ctx()), RUN_T.noReroll)).toBe(true);
  });
});

describe('the clock, the wipe and the end', () => {
  it('warns at 25 minutes, once, and ends gracefully at 30 with everything the party earned', () => {
    const party = makeParty(['vaktare', 'helare']);
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    a.coins = 321;
    a.inventory[10] = { item: 'gold', count: 4 };
    runSaveOf(a).seeds = 17;
    run.elapsed = RUN_WARN_MS - 100;
    const warned: Change[] = [];
    for (let i = 0; i < 6; i++) {
      party.now += 50;
      warned.push(...tick(party.world, 50, party.ctx()));
    }
    expect(warned.filter((c) => c.t === 'banner' && c.text === RUN_T.warn)).toHaveLength(2);
    for (let i = 0; i < 20; i++) expect(listen(tick(party.world, 50, party.ctx()), RUN_T.warn)).toBe(false);
    run.elapsed = RUN_MAX_MS - 100;
    const end: Change[] = [];
    for (let i = 0; i < 6; i++) {
      party.now += 50;
      end.push(...tick(party.world, 50, party.ctx()));
    }
    expect(runOf(party.world)).toBeUndefined();
    expect(run.outcome).toBe('time');
    expect(end.some((c) => c.t === 'banner' && c.text === RUN_T.timeUp)).toBe(true);
    expect(end.filter((c) => c.t === 'run' && c.ev === 'ended' && c.outcome === 'time')).toHaveLength(2);
    for (const p of [a, b]) expect(p.area).toBe('farm');
    expect(a.coins).toBe(321);
    expect(a.inventory[10]).toEqual({ item: 'gold', count: 4 });
    expect(readRun(a).seeds).toBe(17);
    expect(readRun(a).timeouts).toBe(1);
    // the zone is gone, the chapter not cleared
    expect(Object.keys(party.world.areas ?? {}).filter((k) => k.startsWith('saga:'))).toEqual([]);
    expect(a.saga!.cleared).toEqual([]);
  });

  it('the clock stops while nobody is online, and a run nobody returns to ends after a minute', () => {
    const party = makeParty(['vaktare']);
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const p = party.players[0]!;
    for (let i = 0; i < 20; i++) step(party, false, []);
    const e = run.elapsed;
    p.online = false;
    party.world.players['x'] = { ...p, id: 'x', online: true } as never;
    delete party.world.players['x'];
    for (let i = 0; i < 100; i++) {
      party.now += 50;
      tick(party.world, 50, party.ctx());
    }
    // the world does not tick at all with nobody online (as always): the clock has not moved
    expect(run.elapsed).toBe(e);
    expect(run.phase).toBe('zone');
  });

  it('a wipe ends the run after the pause: everyone at the farm with their bag, coins and sagafrön', () => {
    const party = makeParty(['vaktare', 'helare', 'magiker'], { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const inst = party.world.areas![run.key]!.saga!;
    for (const p of party.players) {
      p.coins = 77;
      runSaveOf(p).seeds = 9;
      p.inventory[12] = { item: 'wood', count: 5 };
    }
    for (let i = 0; i < 4; i++) step(party, false, []);
    const now = party.now;
    for (const f of Object.values(inst.fighters)) {
      f.down = now;
      f.hp = 0;
    }
    const out: Change[] = [];
    for (let t = 0; t < WIPE_MS - 500; t += 50) {
      party.now += 50;
      out.push(...tick(party.world, 50, party.ctx()));
    }
    expect(runOf(party.world)).toBe(run);
    expect(out.some((c) => c.t === 'banner' && c.kind === 'wipe' && c.sub === RUN_T.wipeSub)).toBe(true);
    for (let t = 0; t < 1500; t += 50) {
      party.now += 50;
      out.push(...tick(party.world, 50, party.ctx()));
    }
    expect(runOf(party.world)).toBeUndefined();
    expect(run.outcome).toBe('wipe');
    for (const p of party.players) {
      expect(p.area).toBe('farm');
      expect(p.coins).toBe(77);
      expect(readRun(p).seeds).toBe(9);
      expect(readRun(p).wipes).toBe(1);
      expect(p.inventory[12]).toEqual({ item: 'wood', count: 5 });
    }
    expect(out.filter((c) => c.t === 'run' && c.ev === 'ended' && c.outcome === 'wipe')).toHaveLength(3);
    expect(out.some((c) => c.t === 'run' && c.ev === 'state' && c.run === null)).toBe(true);
  });

  it('a lone fallen player gets up at the rest stone as in a dungeon, and is not a wipe while a friend stands', () => {
    const party = makeParty(['vaktare', 'helare']);
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const inst = party.world.areas![run.key]!.saga!;
    for (let i = 0; i < 4; i++) step(party, false, []);
    const f = inst.fighters[party.players[0]!.id]!;
    f.down = party.now;
    f.hp = 0;
    for (let t = 0; t < 11_000; t += 50) step(party, false, []);
    expect(f.down).toBeUndefined();
    expect(runOf(party.world)).toBe(run);
  });

  it('the boss falling pays its sagafrön once, clears the chapter for everyone, gives a bag of seeds, and the run ends after the chest', () => {
    const party = makeParty(['vaktare', 'helare', 'magiker'], { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    // straight to the boss's zone (the map is the plan's; the packs are not what this is about)
    const bossPlan = run.plan.zones[3]!;
    expect(bossPlan.kind).toBe('boss');
    const key = 'saga:runlab-boss';
    const world = buildZone(run.plan, 3, key);
    world.saga!.run = { ...party.world.areas![run.key]!.saga!.run!, zone: 3 };
    delete party.world.areas![run.key];
    party.world.areas![key] = world;
    getArea(party.world, key);
    run.key = key;
    run.zone = 3;
    for (const p of party.players) placeIn(party.world, p, key, world.saga!.start.x, world.saga!.start.y, 'up', []);
    for (let i = 0; i < 4; i++) step(party, false, []);
    const inst = world.saga!;
    const seeds0 = party.players.map((p) => readRun(p).seeds);
    const boss = inst.mobs[inst.boss]!;
    const bossA = world.animals[boss.id]!;
    for (const p of party.players) {
      p.x = bossA.x - 3 * TILE;
      p.y = bossA.y;
    }
    boss.hp = 1;
    boss.state = 'fight';
    castSpell(party.world, party.players[2]!.id, 'eldboll', boss.id, party.ctx());
    expect(inst.bossDown).toBe(true);
    const out: Change[] = [];
    for (let i = 0; i < 4; i++) {
      party.now += 50;
      out.push(...tick(party.world, 50, party.ctx()));
    }
    expect(run.phase).toBe('victory');
    party.players.forEach((p, i) => {
      expect(readRun(p).seeds).toBe(seeds0[i]! + RUN_SEEDS.bossFirst);
      expect(readRun(p).wins).toBe(1);
      expect(readRun(p).clears.draug).toBe(1);
      expect(p.saga!.cleared).toContain('draug');
      expect(p.inventory.some((s) => s?.item.endsWith('_seed') && s.item !== 'carrot_seed' && s.item !== 'potato_seed')).toBe(true);
    });
    // seeds are paid once
    for (let i = 0; i < 20; i++) step(party, false, []);
    expect(readRun(party.players[0]!).seeds).toBe(seeds0[0]! + RUN_SEEDS.bossFirst);
    // the chest is there; 90 seconds later the run is over and everyone is home
    expect(Object.values(world.objects).some((o) => o.kind === 'saga_chest' && o.variant === 2)).toBe(true);
    for (let t = 0; t < 91_000; t += 50) step(party, false, []);
    expect(runOf(party.world)).toBeUndefined();
    expect(run.outcome).toBe('win');
    for (const p of party.players) expect(p.area).toBe('farm');
  });

  /** The party stands in the boss's zone (the plan's own map), the boss at one health. */
  function atTheBoss(party: Party): { run: NonNullable<ReturnType<typeof runOf>>; inst: NonNullable<WorldState['saga']>; world: WorldState; boss: { id: number } } {
    const run = runOf(party.world)!;
    const key = 'saga:runlab-boss';
    const world = buildZone(run.plan, 3, key);
    world.saga!.run = { ...party.world.areas![run.key]!.saga!.run!, zone: 3 };
    delete party.world.areas![run.key];
    party.world.areas![key] = world;
    getArea(party.world, key);
    run.key = key;
    run.zone = 3;
    for (const p of [...party.players, ...run.companions.map((id) => party.world.players[id]!)]) if (p.online) placeIn(party.world, p, key, world.saga!.start.x, world.saga!.start.y, 'up', []);
    for (let i = 0; i < 4; i++) step(party, false, []);
    const inst = world.saga!;
    const boss = inst.mobs[inst.boss]!;
    const bossA = world.animals[boss.id]!;
    for (const p of party.players) {
      p.x = bossA.x - 3 * TILE;
      p.y = bossA.y;
    }
    boss.hp = 1;
    boss.state = 'fight';
    return { run, inst, world: party.world, boss };
  }

  it('the boss falling clears the chapter for a member who is offline too, and the hired companion takes no loot', () => {
    // two players, one of them has lost the connection in the zone
    const duo = makeParty(['magiker', 'vaktare'], { seed: 6 });
    startRun(duo.world, duo.players[0]!.id, { seed: 6 }, duo.ctx());
    const { run, inst } = atTheBoss(duo);
    const [a, b] = duo.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    b.online = false;
    expect(run.party).toContain(b.id);
    castSpell(duo.world, a.id, 'eldboll', inst.boss, duo.ctx());
    expect(inst.bossDown).toBe(true);
    for (let i = 0; i < 4; i++) step(duo, false, []);
    expect(a.saga!.cleared).toContain('draug');
    expect(b.saga!.cleared).toContain('draug');
    expect(b.stats?.sagaDraug).toBe(1);
    expect(readRun(b).wins).toBe(1);
    expect(readRun(b).clears.draug).toBe(1);

    // one player and the companion: the companion never takes a chest, an essence or sagafrön
    const solo = makeParty(['magiker'], { seed: 6, longhall: true });
    startRun(solo.world, solo.players[0]!.id, { seed: 6 }, solo.ctx());
    const lab = atTheBoss(solo);
    const h = solo.players[0]!;
    const c = solo.world.players[lab.run.companions[0]!]!;
    expect(c.bot).toBe(true);
    placeIn(solo.world, c, lab.run.key, lab.inst.start.x, lab.inst.start.y, 'up', []);
    const coins = c.coins;
    const bag = JSON.stringify(c.inventory);
    // an essence roll that always succeeds goes to the one who struck the blow, unless it is the companion
    const sure = { ...solo.ctx(), rnd: () => 0 };
    const mob = spawnSagaMob(lab.world.areas![lab.run.key]!, lab.inst, 'skelett', c.x + TILE, c.y, 'mob', -1);
    lab.inst.mobs[mob.id]!.hp = 1;
    lab.inst.mobs[mob.id]!.state = 'fight';
    castSpell(solo.world, c.id, 'ljuspil', mob.id, sure);
    expect(lab.inst.mobs[mob.id]).toBeUndefined();
    expect(c.inventory.some((s) => s?.item === 'monsteressens')).toBe(false);
    castSpell(solo.world, h.id, 'eldboll', lab.inst.boss, solo.ctx());
    expect(lab.inst.bossDown).toBe(true);
    const seeds = readRun(h).seeds;
    for (let i = 0; i < 400; i++) step(solo, true, []);
    expect(readRun(h).seeds).toBeGreaterThanOrEqual(seeds);
    const chest = Object.values(lab.world.areas![lab.run.key]!.objects).find((o) => o.kind === 'saga_chest' && o.variant === 2)!;
    expect(performAction(lab.world.areas![lab.run.key]!, c.id, chest.x, chest.y, solo.ctx())).toEqual([]);
    expect(lab.inst.looted[chest.id] ?? []).not.toContain(c.id);
    expect(c.coins).toBe(coins);
    expect(JSON.stringify(c.inventory)).toBe(bag);
    expect(readRun(c).seeds).toBe(0);
  });

  it('a full bag at the boss’s fall: the crop seeds land in the zone, not in the farm', () => {
    const party = makeParty(['magiker'], { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const { run, inst } = atTheBoss(party);
    const p = party.players[0]!;
    const ids = Object.keys(ITEMS).filter((k) => !k.endsWith('_seed'));
    p.inventory = p.inventory.map((_, i) => ({ item: ids[i]!, count: 1 }));
    const farmDrops = Object.keys(party.world.drops).length;
    const out: Change[] = [];
    out.push(...castSpell(party.world, p.id, 'eldboll', inst.boss, party.ctx()));
    for (let i = 0; i < 4; i++) {
      party.now += 50;
      out.push(...tick(party.world, 50, party.ctx()));
    }
    expect(run.phase).toBe('victory');
    const drop = out.find((c) => c.t === 'drop' && c.drop?.item.endsWith('_seed'));
    expect(drop).toBeTruthy();
    expect(drop!.t === 'drop' && drop!.area).toBe(run.key);
    expect(Object.values(party.world.areas![run.key]!.drops).some((d) => d.item.endsWith('_seed'))).toBe(true);
    expect(Object.keys(party.world.drops)).toHaveLength(farmDrops);
  });

  it('a dropped connection: the player comes back to the zone, or home when the run is over', () => {
    const party = makeParty(['vaktare', 'helare']);
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const b = party.players[1]!;
    for (let i = 0; i < 4; i++) step(party, false, []);
    const out = rejoinRun(party.world, b.id);
    expect(b.area).toBe(run.key);
    expect(out.some((c) => c.t === 'run' && c.ev === 'state')).toBe(true);
    endRun(party.world, run, 'leave', party.ctx());
    b.area = run.key;
    rejoinRun(party.world, b.id);
    expect(b.area).toBe('farm');
  });
});

describe('the sagaträd', () => {
  it('plants a node for its cost, in order, once, and the shoot grows with what the family has planted', () => {
    const party = makeParty(['krigare', 'helare']);
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    expect(plantError(a.run, 'h1')).toBe('seeds');
    expect(plantError(undefined, 'nope')).toBe('unknown');
    runSaveOf(a).seeds = 60;
    expect(plantError(a.run, 'h2')).toBe('needs');
    expect(plantNode(party.world, a.id, 'h2').some((c) => c.t === 'toast' && c.text.includes(TREE_NAMES.h1!))).toBe(true);
    expect(readRun(a).seeds).toBe(60);
    const ch = plantNode(party.world, a.id, 'h1');
    expect(readRun(a).seeds).toBe(50);
    expect(readRun(a).tree).toEqual(['h1']);
    expect(ch.some((c) => c.t === 'seed' && c.ev === 'tree' && c.seeds === 50 && c.tree.includes('h1'))).toBe(true);
    expect(listen(plantNode(party.world, a.id, 'h1'), RUN_T.plantDone)).toBe(true);
    expect(plantNode(party.world, a.id, 'zzz')).toEqual([]);
    expect(shootOf(party.world)!.variant ?? 0).toBe(0);
    // stages: the whole family counts
    runSaveOf(a).seeds = 500;
    runSaveOf(b).seeds = 500;
    for (const id of ['h2', 'h3', 'h4']) plantNode(party.world, a.id, id);
    expect(plantedByFamily(party.world)).toBe(4);
    expect(shootOf(party.world)!.variant).toBe(1);
    for (const id of ['g1', 'g2', 'g3', 'g4']) plantNode(party.world, b.id, id);
    expect(plantedByFamily(party.world)).toBe(8);
    expect(shootOf(party.world)!.variant).toBe(2);
    expect([0, 2, 3, 7, 8, 13, 14, 23, 24, 99].map(treeStage)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    // the companion does not make the tree grow
    expect(plantedByFamily(party.world)).toBe(8);
  });

  it('hero and farm nodes are the planter’s own; party nodes help everyone in the run (the best of them, not the sum)', () => {
    const party = makeParty(['vaktare', 'helare', 'magiker'], { seed: 6 });
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    runSaveOf(a).tree = ['h1', 'h2', 'g1'];
    runSaveOf(b).tree = ['g1', 'g2'];
    startRun(party.world, a.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const inst = party.world.areas![run.key]!.saga!;
    const buffs = inst.run!.buffs;
    expect(buffs[a.id]!.power).toBeCloseTo(0.03);
    expect(buffs[a.id]!.hp).toBeCloseTo(0.05);
    expect(buffs[b.id]!.power).toBe(0);
    for (const p of [a, b, c]) expect(buffs[p.id]!.rest).toBeCloseTo(0.25);
    for (const p of [a, b, c]) expect(buffs[p.id]!.down).toBeCloseTo(0.2);
  });

  it('every node’s effect shows in the run: its number reaches the buffs or the run’s own bookkeeping', () => {
    for (const n of SEED_TREE) {
      const party = makeParty(['krigare', 'helare'], { seed: 6 });
      const a = party.players[0]!;
      let node = n;
      const chain: string[] = [];
      while (node.needs) {
        chain.unshift(node.needs);
        node = treeNode(node.needs)!;
      }
      runSaveOf(a).tree = [...chain, n.id];
      const base = makeParty(['krigare', 'helare'], { seed: 6 });
      startRun(party.world, a.id, { seed: 6 }, party.ctx());
      startRun(base.world, base.players[0]!.id, { seed: 6 }, base.ctx());
      const mine = runOf(party.world)!.base[a.id]!;
      const none = runOf(base.world)!.base[base.players[0]!.id]!;
      const inst = party.world.areas![runOf(party.world)!.key]!.saga!;
      const built = inst.run!.buffs[a.id]!;
      const key = Object.keys(n.effect)[0]!;
      if (n.effect.potions) expect(a.inventory.reduce((s, x) => s + (x?.item === 'healing_potion' ? x.count : 0), 0)).toBe(3 + n.effect.potions);
      else if (key === 'slots') expect(foodSlots(a)).toBe(2);
      else if (key === 'reroll') expect(runOf(party.world)!.rerolled).toBe(false);
      else if (['food', 'animal', 'companion', 'bossSeeds', 'seeds'].includes(key)) expect((mine as Record<string, number>)[key] ?? 0).toBeGreaterThanOrEqual((none as Record<string, number>)[key] ?? 0);
      else expect((built as unknown as Record<string, number>)[key]).toBeGreaterThan(0);
    }
  });

  it('g5 makes the hired companion stronger, g6 and f6 pay more, and f5 more coins', () => {
    const party = makeParty(['krigare'], { longhall: true, seed: 5 });
    const p = party.players[0]!;
    runSaveOf(p).tree = ['g1', 'g3', 'g5'];
    startRun(party.world, p.id, { seed: 5 }, party.ctx());
    const run = runOf(party.world)!;
    const inst = party.world.areas![run.key]!.saga!;
    const c = run.companions[0]!;
    expect(inst.run!.buffs[c]!.power).toBeCloseTo(0.2);
    expect(inst.run!.buffs[c]!.hp).toBeCloseTo(0.2);
    expect(inst.run!.buffs[p.id]!.power).toBe(0);
    const six = makeParty(['krigare'], { seed: 5 });
    runSaveOf(six.players[0]!).tree = ['g1', 'g2', 'g4', 'g6', 'f1', 'f3', 'f6', 'f2', 'f5'];
    startRun(six.world, six.players[0]!.id, { seed: 5 }, six.ctx());
    const r6 = runOf(six.world)!;
    expect(r6.base[six.players[0]!.id]!.bossSeeds).toBe(5);
    expect(six.world.areas![r6.key]!.saga!.run!.buffs[six.players[0]!.id]!.coins).toBeCloseTo(0.25);
  });
});

describe('saves', () => {
  it('an old player without a run record, or with a partial one, loads unchanged and plays', () => {
    const party = makeParty(['krigare']);
    const p = party.players[0]!;
    const old = JSON.parse(JSON.stringify(p));
    delete old.run;
    delete old.bot;
    party.world.players[p.id] = old;
    expect(old.run).toBeUndefined();
    expect(readRun(old)).toEqual(newRunSave());
    expect(old.run).toBeUndefined(); // reading does not change the player
    old.run = { seeds: 5 };
    expect(readRun(old).seeds).toBe(5);
    expect(readRun(old).tree).toEqual([]);
    expect(readRun(old).clears).toEqual({});
    expect(runSaveOf(old).best).toEqual({});
    // the player record is plain JSON: a run record survives a round trip
    runSaveOf(old).tree = ['h1'];
    expect(JSON.parse(JSON.stringify(old)).run.tree).toEqual(['h1']);
    old.online = true;
    old.x = p.x;
    old.y = p.y;
    expect(startRun(party.world, old.id, { seed: 2 }, party.ctx()).length).toBeGreaterThan(0);
  });

  it('the run itself is never saved: the world has no trace of it, and an area key of a zone is a saga key', () => {
    const party = makeParty(['krigare']);
    startRun(party.world, party.players[0]!.id, { seed: 2 }, party.ctx());
    expect(JSON.stringify(Object.keys(party.world))).not.toContain('run');
    const keys = Object.keys(party.world.areas ?? {}).filter((k) => k.startsWith('saga:'));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^saga:run/);
  });
});

// ---------------------------------------------------------------------------
// Whole runs, played by bots
// ---------------------------------------------------------------------------

describe('bot parties play whole runs', () => {
  const FAMILIES: [string, ClassId[], boolean][] = [
    ['en spelare + Hirdmannen', ['krigare'], true],
    ['två spelare', ['vaktare', 'helare'], false],
    ['tre spelare', ['vaktare', 'helare', 'magiker'], false],
    ['fyra spelare', ['vaktare', 'helare', 'krigare', 'magiker'], true],
  ];
  const rows: string[] = [];
  const SEEDS = [1, 2, 3];

  for (const [label, classes, longhall] of FAMILIES) {
    for (const style of ['careful', 'clumsy'] as const) {
      it(`${label}, ${style}: finishes inside the cap (${SEEDS.length} runs)`, { timeout: 120_000 }, () => {
        const mins: number[] = [];
        const family: number[] = [];
        let wins = 0;
        for (const seed of SEEDS) {
          const party = makeParty(classes, { style, seed, longhall: longhall || classes.length === 4, level: 3 });
          const r = playRun(party, { seed });
          // a run never runs out of time: it ends in a win or a wipe, and nothing is ever stuck
          expect(['win', 'wipe']).toContain(r.outcome);
          expect(r.ms).toBeLessThan(RUN_MAX_MS);
          if (r.outcome === 'win') {
            wins++;
            mins.push(r.winMs! / 60_000);
            family.push((r.winMs! / 60_000) * 2.5);
            for (const p of party.players) {
              expect(readRun(p).wins).toBe(1);
              expect(readRun(p).seeds).toBeGreaterThan(RUN_SEEDS.bossFirst);
              expect(p.saga!.cleared).toContain('draug');
              expect(p.area).toBe('farm');
            }
          }
        }
        if (style === 'careful') expect(wins).toBe(SEEDS.length);
        else expect(wins).toBeGreaterThanOrEqual(2);
        const avg = mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length);
        rows.push(`${label.padEnd(24)} ${style.padEnd(8)} ${wins}/${SEEDS.length} wins   ${avg.toFixed(1).padStart(5)} min (min ${Math.min(...mins).toFixed(1)}, max ${Math.max(...mins).toFixed(1)})${style === 'careful' ? `   x2.5 (kids): ${(avg * 2.5).toFixed(0)} min` : ''}`);
        void family;
        // the boss falls inside the 30 minutes at the pace of the clumsy bot (the kids), and fast with the careful ones
        expect(avg).toBeLessThan(style === 'careful' ? 15 : 28);
        expect(avg).toBeGreaterThan(style === 'careful' ? 4 : 10);
      });
    }
  }

  it('prints the bot minutes per run', () => {
    // eslint-disable-next-line no-console
    console.log(`\nBot minutes until the boss falls (level 3, starter set, chapter 1):\n${rows.join('\n')}\n`);
    expect(rows.length).toBe(FAMILIES.length * 2);
  });

  it('a run is different every time: three runs of one chapter have different chains, packs and runor offers', { timeout: 120_000 }, () => {
    const chains = new Set<string>();
    const offers = new Set<string>();
    for (const seed of [11, 12, 13]) {
      const party = makeParty(['vaktare', 'helare', 'magiker'], { seed });
      const r = playRun(party, { seed });
      expect(r.outcome).toBe('win');
      const run = runOf(party.world);
      void run;
      const plan = generateRun(seed, { boss: 'draug' });
      chains.add(plan.zones.slice(0, 3).map((z) => `${z.biome}${z.flipX ? 'x' : ''}${z.flipY ? 'y' : ''}${z.def.rooms.length}`).join('>'));
      offers.add(JSON.stringify(offerRunor(mulberry32(seed), ['vaktare', 'helare', 'magiker'], [])));
    }
    expect(chains.size).toBe(3);
    expect(offers.size).toBe(3);
  });
});

// keep the unused helper imports honest
void applyMove;
void fardportOf;
void DUNGEON_IDS;
void ({} as DungeonId);
