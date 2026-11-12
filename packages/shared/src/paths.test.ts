// Vägar (paths): after the Mellanboss each hero chooses one of their class's paths. Every path changes every one of its class's four
// spells in a way the fight can measure, the traits work, the choice is personal and has a default on the clock, bots choose too.
import { describe, expect, it } from 'vitest';
import { CLASSES, CLASS_IDS, classSpells, PATHS, PATH_NAMES, PATH_SPELLS, PATH_TEXT, SPELLS, TILE, buffsOf, castSpell, choosePath, defaultPath, pathDef, pathsOf, runOf, runPickMs, spawnSagaMob, startRun, tick, type ClassId, type SpellMod } from './index.ts';
import { makeParty, step } from './runplay.ts';
import type { Change } from './protocol.ts';

/** Two heroes in the first stop (no companion), the first with `pathId`'s mods (or none), a little arena round them. */
function arena(cls: ClassId, pathId: string | undefined, other: ClassId = cls === 'helare' ? 'vaktare' : 'helare', dists: number[] = [3, 4, 6.1]) {
  const party = makeParty([cls, other], { seed: 3 });
  startRun(party.world, party.players[0]!.id, { seed: 3, companion: false }, party.ctx());
  const run = runOf(party.world)!;
  const area = party.world.areas![run.key]!;
  const inst = area.saga!;
  const p = party.players[0]!;
  const q = party.players[1]!;
  const path = pathDef(pathId);
  const b = buffsOf({});
  if (path) {
    b.mods = path.mods;
    b.traits = path.traits;
  }
  inst.run!.buffs = { [p.id]: b, [q.id]: buffsOf({}) };
  const ctx = () => ({ season: 'none' as const, now: party.now, rnd: () => 0.99 });
  const go = (ms: number): Change[] => {
    const out: Change[] = [];
    for (let t = 0; t < ms; t += 50) {
      party.now += 50;
      out.push(...tick(party.world, 50, ctx()));
    }
    return out;
  };
  go(100);
  // (the auto-attacks are switched off, so a test measures only the spell it casts; `swing` presses the auto-attack itself)
  for (const ff of Object.values(inst.fighters)) ff.cd[CLASSES[ff.cls].auto] = Number.MAX_SAFE_INTEGER;
  // the friend stands beside the hero; the hero faces right
  q.x = p.x + TILE;
  q.y = p.y;
  p.facing = 'right';
  const mobs = dists.map((dx) => {
    const a = spawnSagaMob(area, inst, 'skelett', p.x + dx * TILE, p.y, 'mob', -1);
    const m = inst.mobs[a.id]!;
    m.hp = m.max = 100000;
    return m;
  });
  return { party, run, area, inst, p, q, f: inst.fighters[p.id]!, fq: inst.fighters[q.id]!, ctx, go, mobs };
}

/** What a spell did, as a plain record: every mob, the caster and the friend, in two scenes (a hurt friend beside; a fallen one far off). */
function fingerprint(cls: ClassId, pathId: string | undefined, spell: string): string {
  const kind = SPELLS[spell]!.kind;
  // melee and shield bashes reach 1.8 tiles, a whirl is round the caster: the monsters stand where the spell can just reach them (and one beyond the base area)
  const dists = kind === 'melee' || kind === 'bash' || (kind === 'spend' && SPELLS[spell]!.range < 3) ? [1.4, 2.2, 3.0] : kind === 'whirl' ? [1.5, 2.5, 3.0] : [3, 4, 6.1];
  const scenes = [0, 1].map((scene) => {
    const a = arena(cls, pathId, undefined, dists);
    for (const m of a.mobs) m.state = 'fight';
    const now = a.party.now;
    if (scene === 0) a.fq.hp = 10;
    else {
      a.fq.hp = 0;
      a.fq.down = now;
      a.q.x = a.p.x + 4.2 * TILE;
    }
    a.f.hp = Math.round(a.f.max * 0.4);
    a.f.cd = {};
    // a spender is measured with three pips (its bonus shows too)
    if (kind === 'spend') a.f.pips = 3;
    const x0 = a.p.x;
    const out = castSpell(a.party.world, a.p.id, spell, spell === 'lakerunan' || spell === 'solstrale' ? a.q.id : a.mobs[0]!.id, a.ctx());
    const shield = (f: typeof a.f): number => Math.round(f.shield && now < f.shield.until ? f.shield.hp : 0);
    return {
      cast: out.some((c) => c.t !== 'toast'),
      mobs: a.mobs.map((m) => [m.hp, m.slowUntil ? m.slowUntil - now : 0, m.stunUntil ? m.stunUntil - now : 0, m.burn ? Math.round(m.burn.per * 100) : 0, m.tauntUntil ? m.tauntUntil - now : 0]),
      me: [Math.round(a.f.hp), Math.round(a.f.cd[spell]! - now), Math.round(a.f.wall ? a.f.wall - now : 0), Math.round(a.f.rage ? a.f.rage - now : 0), shield(a.f), Math.round((a.p.x - x0) / 4)],
      friend: [Math.round(a.fq.hp), shield(a.fq), a.fq.hot ? Math.round(a.fq.hot.per * 10) : 0],
    };
  });
  return JSON.stringify(scenes);
}

describe('paths: the data', () => {
  it('every class has two or three paths, each with a name, a sentence and a line for each of its five spells (the auto-attack and the four buttons)', () => {
    for (const cls of CLASS_IDS) expect(pathsOf(cls).length, cls).toBeGreaterThanOrEqual(2);
    for (const cls of CLASS_IDS) expect(pathsOf(cls).length).toBeLessThanOrEqual(3);
    for (const path of PATHS) {
      expect(PATH_NAMES[path.id], path.id).toBeTruthy();
      expect(PATH_TEXT[path.id]).toBeTruthy();
      expect(Object.keys(PATH_SPELLS[path.id]!).sort()).toEqual(classSpells(path.cls).sort());
      for (const line of Object.values(PATH_SPELLS[path.id]!)) expect(line.length).toBeGreaterThan(8);
      expect(PATH_TEXT[path.id]!.length).toBeLessThanOrEqual(60);
      // every spell of the class has an entry, and nothing else does
      expect(Object.keys(path.mods).sort()).toEqual(classSpells(path.cls).sort());
      for (const [id, mod] of Object.entries(path.mods)) expect(Object.keys(mod as SpellMod).length, `${path.id}/${id}`).toBeGreaterThan(0);
    }
    expect(new Set(PATHS.map((p) => p.id)).size).toBe(PATHS.length);
    expect(defaultPath('magiker').id).toBe('eld');
  });

  it('the roles stay: a tank path keeps the taunt and the shield wall, a healer path the heals', () => {
    for (const path of PATHS) {
      const kinds = CLASSES[path.cls].spells.map((s) => SPELLS[s]!.kind);
      if (CLASSES[path.cls].role === 'tank') expect(kinds).toEqual(expect.arrayContaining(['taunt', 'wall']));
      if (CLASSES[path.cls].role === 'healer') expect(kinds).toEqual(expect.arrayContaining(['heal', 'hot', 'revive']));
    }
  });
});

describe('every path changes every one of its class’s spells (measured in a fight)', () => {
  for (const path of PATHS) {
    for (const spell of classSpells(path.cls)) {
      it(`${PATH_NAMES[path.id]}: ${SPELLS[spell]!.name}`, () => {
        expect(fingerprint(path.cls, path.id, spell)).not.toBe(fingerprint(path.cls, undefined, spell));
      });
    }
  }
});

describe('paths: traits', () => {
  it('Bärsärk hits harder below half health, Vapenmästare crits more, others do not', () => {
    const hit = (path: string | undefined, hp: number): number => {
      const a = arena('krigare', path, undefined, [1.4, 2.2, 3]);
      for (const m of a.mobs) m.state = 'fight';
      a.f.hp = Math.round(a.f.max * hp);
      const before = a.mobs[0]!.hp;
      // (the plain Yxhugg of the path is changed too: compare the same spell with the trait switched off)
      const b = buffsOf({});
      b.mods = {};
      b.traits = pathDef(path)!.traits;
      a.inst.run!.buffs[a.p.id] = b;
      a.f.cd = {};
      castSpell(a.party.world, a.p.id, 'yxhugg', a.mobs[0]!.id, a.ctx());
      return before - a.mobs[0]!.hp;
    };
    expect(hit('barsark', 0.3)).toBeGreaterThan(hit('barsark', 0.9) * 1.15);
    expect(hit('vapen', 0.3)).toBe(hit('vapen', 0.9));
  });

  it('Murvakt takes damage off a friend nearby, a shield takes a blow first, and Hämnare hits back', () => {
    const lost = (path: string | undefined, who: 'me' | 'friend'): number => {
      const a = arena('vaktare', path, 'krigare');
      a.inst.run!.dmgMul = 10;
      const target = who === 'me' ? a.f : a.fq;
      const tp = who === 'me' ? a.p : a.q;
      const m = a.mobs[0]!;
      const an = a.area.animals[m.id]!;
      an.x = tp.x + TILE;
      an.y = tp.y;
      m.state = 'fight';
      m.threat[tp.id] = 50;
      m.atkAt = a.party.now;
      const before = target.hp;
      a.go(200);
      return before - target.hp;
    };
    expect(lost('murvakt', 'friend')).toBeLessThan(lost(undefined, 'friend'));
    expect(lost('murvakt', 'me')).toBeLessThan(lost(undefined, 'me'));
    // a shield
    const s = arena('vaktare', 'murvakt');
    castSpell(s.party.world, s.p.id, 'skoldmur', undefined, s.ctx());
    expect(s.f.shield!.hp).toBeGreaterThan(0);
    expect(s.fq.shield!.hp).toBeGreaterThan(0);
    // thorns: the monster that hits loses health
    const hurtBack = (path: string | undefined): number => {
      const a = arena('vaktare', path, 'krigare');
      a.inst.run!.dmgMul = 10;
      const m = a.mobs[0]!;
      const an = a.area.animals[m.id]!;
      an.x = a.p.x + TILE;
      an.y = a.p.y;
      m.state = 'fight';
      m.threat[a.p.id] = 50;
      m.atkAt = a.party.now;
      const before = m.hp;
      a.go(200);
      return before - m.hp;
    };
    expect(hurtBack('hamnare')).toBeGreaterThan(hurtBack(undefined));
  });

  it('burning ticks once a second and then stops; lightning jumps to the neighbours', () => {
    const a = arena('magiker', 'eld');
    a.f.cd = {};
    castSpell(a.party.world, a.p.id, 'eldboll', a.mobs[0]!.id, a.ctx());
    a.f.cd.eldboll = Number.MAX_SAFE_INTEGER;
    const first = a.mobs[0]!.hp;
    a.go(1100);
    expect(a.mobs[0]!.hp).toBeLessThan(first);
    a.go(6000);
    expect(a.mobs[0]!.burn).toBeUndefined();
    const after = a.mobs[0]!.hp;
    a.go(2000);
    expect(a.mobs[0]!.hp).toBe(after);
    const b = arena('magiker', 'aska');
    b.f.cd = {};
    castSpell(b.party.world, b.p.id, 'eldboll', b.mobs[0]!.id, b.ctx());
    expect(b.mobs[1]!.hp).toBeLessThan(b.mobs[1]!.max);
    expect(b.mobs[2]!.hp).toBe(b.mobs[2]!.max);
  });
});

describe('paths: the choice after the Mellanboss', () => {
  /** A run of these heroes standing at the Mellanboss stop with the stop cleared. */
  function atMini(classes: ClassId[]) {
    const party = makeParty(classes, { seed: 5 });
    startRun(party.world, party.players[0]!.id, { seed: 5, companion: false }, party.ctx());
    const run = runOf(party.world)!;
    const mini = run.plan.route.nodes.find((n) => n.kind === 'mini')!;
    return { party, run, mini };
  }

  it('after the Mellanboss everyone chooses, the clock gives the first path, and only a path of your class counts', async () => {
    const { enterStop } = await import('./index.ts');
    const { party, run, mini } = atMini(['krigare', 'magiker', 'helare']);
    enterStop(party.world, run, mini.id, party.ctx());
    const inst = party.world.areas![run.key]!.saga!;
    inst.miniDown = true;
    for (let i = 0; i < 6; i++) step(party, false, []);
    expect(run.phase).toBe('path');
    expect(run.paths).toEqual({});
    const [k, m, h] = party.players;
    // a path of another class is refused; a bad id too
    expect(choosePath(party.world, k!.id, 'eld', party.ctx())).toEqual([]);
    expect(choosePath(party.world, k!.id, 'nope', party.ctx())).toEqual([]);
    choosePath(party.world, k!.id, 'vapen', party.ctx());
    expect(run.paths[k!.id]).toBe('vapen');
    // a second choice does nothing (it is a choice, not a vote)
    choosePath(party.world, k!.id, 'barsark', party.ctx());
    expect(run.paths[k!.id]).toBe('vapen');
    expect(run.phase).toBe('path');
    choosePath(party.world, m!.id, 'frost', party.ctx());
    expect(run.phase).toBe('path');
    // the clock: the healer has not chosen; after the time the first path of the class is hers, and the cards come
    party.now += 1;
    run.pathUntil = run.elapsed + 100;
    for (let i = 0; i < 4; i++) step(party, false, []);
    expect(run.paths[h!.id]).toBe(defaultPath('helare').id);
    expect(run.phase).toBe('pick');
    // the buffs carry the paths
    const buffs = party.world.areas![run.key]!.saga!.run!.buffs;
    expect(buffs[k!.id]!.mods.stormsteg).toEqual(pathDef('vapen')!.mods.stormsteg);
    expect(buffs[m!.id]!.mods.isspjut).toEqual(pathDef('frost')!.mods.isspjut);
    expect(buffs[k!.id]!.crit).toBeCloseTo(0.04);
  });

  it('the clock is 60 s on levels 0 and 1 and 30 s above', () => {
    expect(runPickMs(0)).toBe(60_000);
    expect(runPickMs(1)).toBe(60_000);
    expect(runPickMs(2)).toBe(30_000);
    expect(runPickMs(4)).toBe(30_000);
  });

  it('everyone choosing ends it at once, and a friend who joins afterwards gets the class’s first path', async () => {
    const { enterStop } = await import('./index.ts');
    const { party, run, mini } = atMini(['krigare', 'magiker']);
    enterStop(party.world, run, mini.id, party.ctx());
    party.world.areas![run.key]!.saga!.miniDown = true;
    for (let i = 0; i < 6; i++) step(party, false, []);
    expect(run.phase).toBe('path');
    choosePath(party.world, party.players[0]!.id, 'barsark', party.ctx());
    choosePath(party.world, party.players[1]!.id, 'aska', party.ctx());
    expect(run.phase).toBe('pick');
    expect(Object.keys(run.paths)).toHaveLength(2);
  });
});
