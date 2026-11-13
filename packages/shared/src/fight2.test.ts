// The party rules of the fight: Märke (the skull), Samslag, Kraftklot, Guldringen and the Runmärken (DESIGN.md 5.8).
import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  COMBO_CAP,
  DUNGEONS,
  MARK_LOCK_MS,
  MOB_ARCHETYPE,
  SAGA_QUESTS,
  generateRun,
  mobBase,
  MEDAL_SILVER,
  ORB,
  RING,
  RUN_LEVELS,
  RUN_T,
  SAGA_BOSSES,
  SAMSLAG,
  T,
  TILE,
  botStep,
  castSpell,
  markMob,
  medalFor,
  newMind,
  runOf,
  sagaSnapshot,
  setTarget,
  spawnSagaMob,
  startRun,
  stopPar,
  stun,
  tick,
  type Change,
  type ClassId,
  type MobRole,
  type RunLevel,
  type SagaMob,
} from './index.ts';
import { makeParty } from './runplay.ts';

const NEVER = Number.MAX_SAFE_INTEGER;

function lab(classes: ClassId[], opts: { level?: RunLevel; companion?: boolean } = {}) {
  const party = makeParty(classes, { seed: 3 });
  startRun(party.world, party.players[0]!.id, { seed: 3, companion: opts.companion ?? false, ...(opts.level === undefined ? {} : { level: opts.level }) }, party.ctx());
  const run = runOf(party.world)!;
  const area = party.world.areas![run.key]!;
  const inst = area.saga!;
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
  const room = run.plan.stops[run.node]!.def.rooms[0]!;
  Object.values(area.players).forEach((pl, i) => {
    pl.x = (room.x + Math.floor(room.w / 2)) * TILE + TILE / 2;
    pl.y = (room.y + Math.floor(room.h / 2) + [0, 1, -1, 2][i]!) * TILE + TILE / 2;
  });
  const place = (species: string, dx: number, o: { kind?: SagaMob['kind']; role?: MobRole; dy?: number; still?: boolean } = {}): SagaMob => {
    const a = spawnSagaMob(area, inst, species, p.x + dx * TILE, p.y + (o.dy ?? 0) * TILE, o.kind ?? 'mob', -1, o.role);
    const m = inst.mobs[a.id]!;
    m.hp = m.max = 100_000;
    m.state = 'fight';
    m.threat[p.id] = 5;
    m.atkAt = NEVER;
    if (o.still) m.stunUntil = NEVER;
    return m;
  };
  const mute = (): void => {
    for (const ff of Object.values(inst.fighters)) ff.cd[CLASSES[ff.cls].auto] = NEVER;
  };
  const q = party.players[1];
  return { party, run, area, inst, p, f: inst.fighters[p.id]!, q, fq: q ? inst.fighters[q.id] : undefined, go, ctx, rnd, place, mute };
}
type Lab = ReturnType<typeof lab>;
const hereOf = (l: Lab) => ({ farm: l.party.world, area: l.area, inst: l.inst, key: l.run.key });
const hitsOn = (out: Change[], id: number): number[] => out.flatMap((c) => (c.t === 'hit' && c.on === id && (c.kind === 'dmg' || c.kind === 'crit') ? [c.n] : []));
const press = (l: Lab, who: 'p' | 'q', spell: string, target?: number, pips?: number): Change[] => {
  const pl = who === 'p' ? l.p : l.q!;
  const f = l.inst.fighters[pl.id]!;
  delete f.cd[spell];
  f.gcd = 0;
  if (pips !== undefined) f.pips = pips;
  return castSpell(l.party.world, pl.id, spell, target, l.ctx());
};

describe('Märke: the skull', () => {
  it('everyone’s auto-attack and untargeted spells go for the marked monster; an explicit target still wins; it is in the snapshot and goes when the monster falls', () => {
    const l = lab(['magiker', 'helare']);
    const near = l.place('skelett', 2, { still: true });
    const far = l.place('skelett', 4, { still: true });
    setTarget(l.party.world, l.p.id, near.id);
    markMob(l.party.world, l.q!.id, far.id, l.ctx());
    expect(l.inst.skull).toMatchObject({ id: far.id, by: l.q!.id });
    expect(sagaSnapshot(l.party.world, l.party.now)![l.run.key]!.k).toBe(far.id);
    l.go(2500);
    expect(far.hp).toBeLessThan(far.max);
    expect(near.hp).toBe(near.max);
    // an untargeted spell follows the skull, a targeted one its target
    l.mute();
    const hp = far.hp;
    press(l, 'p', 'isspjut');
    expect(far.hp).toBeLessThan(hp);
    press(l, 'p', 'isspjut', near.id);
    expect(near.hp).toBeLessThan(near.max);
    // marking wakes nobody; the mark goes with the monster
    far.hp = 1;
    press(l, 'p', 'isspjut');
    expect(l.inst.skull).toBeUndefined();
    expect(sagaSnapshot(l.party.world, l.party.now)![l.run.key]!.k).toBeUndefined();
    expect(T.sagaSkullText).toMatch(/2/);
  });

  it('the newest mark wins, but another player cannot replace it for 2 s; the one who marked can', () => {
    const l = lab(['krigare', 'magiker']);
    const a = l.place('skelett', 2, { still: true });
    const b = l.place('skelett', 3, { still: true });
    markMob(l.party.world, l.p.id, a.id, l.ctx());
    markMob(l.party.world, l.q!.id, b.id, l.ctx());
    expect(l.inst.skull!.id).toBe(a.id);
    markMob(l.party.world, l.p.id, b.id, l.ctx());
    expect(l.inst.skull!.id).toBe(b.id);
    l.mute();
    l.go(MARK_LOCK_MS);
    markMob(l.party.world, l.q!.id, a.id, l.ctx());
    expect(l.inst.skull).toMatchObject({ id: a.id, by: l.q!.id });
    l.go(MARK_LOCK_MS);
    markMob(l.party.world, l.p.id, null, l.ctx());
    expect(l.inst.skull).toBeUndefined();
  });

  it('the careful bot marks by its kill order when it is the first human, and the Hirdmannen follows the mark', () => {
    const l = lab(['krigare'], { companion: true, level: 2 });
    const c = Object.values(l.area.players).find((x) => x.bot)!;
    l.place('skelett', 1.5);
    const healer = l.place('skelett', 3, { role: 'healer' });
    healer.roleAt = NEVER;
    const mind = newMind('careful', () => 0.5);
    for (let t = 0; t < 3000; t += 50) {
      botStep(l.party.world, l.p.id, mind, l.ctx(), 50);
      l.go(50);
    }
    expect(l.inst.skull).toMatchObject({ id: healer.id, by: l.p.id });
    expect(l.inst.fighters[c.id]!.target).toBe(healer.id);
  });
});

describe('Samslag', () => {
  it('a spender on a monster dazed or slowed by ANOTHER hero does 50 % more and says who; your own daze is only your combo; capped at 3 times', () => {
    const scene = () => {
      const l = lab(['magiker', 'krigare']);
      l.mute();
      return { l, m: l.place('skelett', 1.5) };
    };
    const plain = scene();
    const base = hitsOn(press(plain.l, 'p', 'runsmall', plain.m.id, 1), plain.m.id)[0]!;
    // the Krigare's Stormsteg dazes it; the mage's Runsmäll shatters (1.5) and it is a Samslag (1.5)
    const both = scene();
    press(both.l, 'q', 'stormsteg', both.m.id);
    expect(both.m.stunBy).toBe(both.l.q!.id);
    const out = press(both.l, 'p', 'runsmall', both.m.id, 1);
    expect(hitsOn(out, both.m.id)[0]! / base).toBeCloseTo(1.5 * SAMSLAG, 1);
    const combo = out.find((c) => c.t === 'hit' && c.kind === 'combo');
    expect(combo && combo.t === 'hit' ? [combo.on, combo.by] : null).toEqual([both.m.id, [both.l.q!.id, both.l.p.id]]);
    // the mage's own Isspjut: the class combo, no Samslag
    const own = scene();
    press(own.l, 'p', 'isspjut', own.m.id);
    const mine = press(own.l, 'p', 'runsmall', own.m.id, 1);
    expect(mine.some((c) => c.t === 'hit' && c.kind === 'combo')).toBe(false);
    expect(hitsOn(mine, own.m.id)[0]! / base).toBeCloseTo(1.5, 1);
    // a pet's daze counts as another's; Jättehugg's double and the Samslag stop at three times
    const k = lab(['krigare', 'magiker']);
    k.mute();
    const m = k.place('skelett', 1.5);
    const one = hitsOn(press(k, 'p', 'jattehugg', m.id, 1), m.id)[0]!;
    stun(hereOf(k), m, 2000, k.party.now, [], `pet:${k.p.id}`);
    const three = press(k, 'p', 'jattehugg', m.id, 1);
    expect(hitsOn(three, m.id)[0]! / one).toBeCloseTo(COMBO_CAP, 1);
    expect(three.some((c) => c.t === 'hit' && c.kind === 'combo' && c.by?.[0] === `pet:${k.p.id}`)).toBe(true);
    expect([SAMSLAG, COMBO_CAP]).toEqual([1.5, 3]);
    expect(T.sagaSamslagText).toMatch(/50/);
  });
});

describe('Kraftklot', () => {
  it('a special monster drops an orb for 5 s (10 s on Lätt); the first hero within 0.8 tile gets full pips; an ordinary monster drops none', () => {
    const drop = (level: RunLevel, role?: MobRole) => {
      const l = lab(['magiker', 'helare'], { level });
      l.mute();
      const m = l.place('skelett', 3, role ? { role, still: true } : { still: true });
      m.hp = 1;
      press(l, 'p', 'isspjut', m.id);
      return { l, orb: l.inst.zones.find((z) => z.kind === 'orb') };
    };
    expect(drop(2).orb).toBeUndefined();
    const d = drop(2, 'shield');
    expect(d.orb).toMatchObject({ shape: 'circle', dmg: 0, r: ORB.radius });
    expect(d.orb!.until! - d.orb!.at).toBe(ORB.ms);
    expect(drop(1, 'archer').orb!.until! - drop(1, 'archer').orb!.at).toBe(ORB.easyMs);
    // nobody near: it lies there; a hero walks over it
    d.l.f.pips = 0;
    d.l.go(1000);
    expect(d.l.f.pips).toBe(0);
    d.l.p.x = d.orb!.x + 0.5 * TILE;
    d.l.p.y = d.orb!.y;
    const out = d.l.go(100);
    expect(d.l.f.pips).toBe(3);
    expect(out.some((c) => c.t === 'hit' && c.kind === 'orb' && c.on === d.l.p.id && c.n === 3)).toBe(true);
    expect(d.l.inst.zones.some((z) => z.kind === 'orb')).toBe(false);
    // left alone it is gone after its time
    const e = drop(2, 'healer');
    e.l.go(ORB.ms + 100);
    expect(e.l.inst.zones.some((z) => z.kind === 'orb')).toBe(false);
    expect(e.l.f.pips).toBe(0);
    expect(T.sagaOrbText).toMatch(/5/);
  });
});

/** A boss beside the hero that casts its Guldring now. */
function ringCast(l: Lab, species = 'draugkung') {
  const m = l.place(species, 1.5, { kind: 'boss' });
  const def = SAGA_BOSSES[species]!;
  const i = def.moves.findIndex((mv) => mv.move === 'ring');
  m.phase = 1;
  m.next = def.moves.map((_, k) => (k === i ? l.party.now : Infinity));
  l.go(100);
  return { m, i, zone: l.inst.zones.find((z) => z.kind === 'gold') };
}

describe('Guldringen', () => {
  it('every last boss has it from phase 1, and the mid-bosses of chapters 6 to 10; the journal says gold is IN and red is OUT', () => {
    for (const d of Object.values(DUNGEONS)) {
      const ring = SAGA_BOSSES[d.boss]!.moves.filter((mv) => mv.move === 'ring');
      expect(ring, d.id).toHaveLength(1);
      expect(ring[0]).toMatchObject({ phase: 1, every: 30_000, warn: 4000, radius: 2.6, dmg: 1.4 });
      expect(ring[0]!.text).toContain('Guld = spring IN, rött = spring UT');
      expect(SAGA_BOSSES[d.mini]!.moves.some((mv) => mv.move === 'ring'), d.mini).toBe(d.chapter >= 6);
    }
  });

  it('everyone in the ring for the last 2 s: nobody is hurt and the boss is open for 6 s; otherwise everyone takes a mark of 1.4', () => {
    const scene = (stand: 'all' | 'one' | 'late', classes: ClassId[] = ['krigare', 'helare'], level: RunLevel = 2) => {
      const l = lab(classes, { level });
      l.mute();
      const { m, zone } = ringCast(l);
      expect(zone).toMatchObject({ shape: 'circle', kind: 'gold', r: RING.radius, dmg: 0 });
      const a = l.area.animals[m.id]!;
      const d = Math.hypot(zone!.x - a.x, zone!.y - a.y) / TILE;
      expect(d).toBeGreaterThanOrEqual(RING.near);
      expect(d).toBeLessThanOrEqual(RING.far);
      const warn = Math.round(RING.warn * RUN_LEVELS[level].warn);
      expect(zone!.at - m.cast!.start).toBe(warn);
      expect(sagaSnapshot(l.party.world, l.party.now)![l.run.key]!.c![m.id]![0]).toBe('ring');
      const players = Object.values(l.area.players);
      const into = (who: typeof players): void => {
        for (const pl of who) {
          pl.x = zone!.x;
          pl.y = zone!.y;
        }
      };
      m.atkAt = NEVER;
      if (stand === 'all') into(players);
      if (stand === 'one') into(players.slice(1));
      l.go(warn - 1000);
      if (stand === 'late') into(players);
      const hp = players.map((pl) => l.inst.fighters[pl.id]!.hp);
      const out = l.go(1100);
      return { l, m, out, lost: players.map((pl, i) => (hp[i]! - l.inst.fighters[pl.id]!.hp) / l.inst.fighters[pl.id]!.max) };
    };
    const won = scene('all');
    expect(won.lost).toEqual([0, 0]);
    expect(won.m.open).toBeGreaterThan(won.l.party.now + RING.open - 200);
    expect(won.out.some((c) => c.t === 'hit' && c.on === won.m.id && c.kind === 'kick')).toBe(true);
    expect(won.l.inst.zones.some((z) => z.kind === 'gold')).toBe(false);
    // one of two stayed out, or they came too late
    for (const how of ['one', 'late'] as const) {
      const lost = scene(how);
      expect(lost.m.open, how).toBeUndefined();
      for (const part of lost.lost) expect(part, how).toBeCloseTo(0.35 * RING.weight, 2);
      expect(lost.l.inst.markHits).toBe(2);
    }
    // three fighters: all but one is enough
    expect(scene('one', ['krigare', 'helare', 'magiker']).lost).toEqual([0, 0, 0]);
    // Lätt: a failed ring is harmless (half a small mark)
    for (const part of scene('one', ['krigare', 'helare'], 1).lost) expect(part).toBeCloseTo(0.15 * RING.easyWeight, 2);
  });

  it('Mycket lätt never sees it, Lätt does (beside the first two attacks); the careful and the clumsy bot walk in, the masher does not', () => {
    const seen = (level: RunLevel): boolean => {
      const l = lab(['krigare'], { level });
      l.mute();
      const m = l.place('draugkung', 1.5, { kind: 'boss' });
      m.phase = 2;
      m.next = SAGA_BOSSES.draugkung!.moves.map((mv) => (mv.move === 'ring' ? l.party.now : Infinity));
      l.go(300);
      return l.inst.zones.some((z) => z.kind === 'gold');
    };
    expect([seen(0), seen(1), seen(2)]).toEqual([false, true, true]);
    const walks = (style: 'careful' | 'clumsy' | 'masher'): boolean => {
      const l = lab(['krigare'], { level: 2 });
      l.mute();
      const { m, zone } = ringCast(l);
      const mind = newMind(style, () => 0.5);
      for (let t = 0; t < RING.warn + 100; t += 50) {
        botStep(l.party.world, l.p.id, mind, l.ctx(), 50);
        l.go(50);
      }
      void zone;
      return m.open !== undefined;
    };
    expect([walks('careful'), walks('clumsy'), walks('masher')]).toEqual([true, true, false]);
  });
});

describe('Runmärken', () => {
  it('gold: at most one mark hit per fighter, no monster heal completed, under par; silver two of the three; bronze for clearing', () => {
    const base = { kind: 'flock' as const, level: 2 as RunLevel, fighters: 2, markHits: 2, mobHeals: 0, ms: stopPar('flock', 2, 2) };
    expect(medalFor(base)).toBe(3);
    expect(medalFor({ ...base, markHits: 3 })).toBe(2);
    expect(medalFor({ ...base, mobHeals: 1 })).toBe(2);
    expect(medalFor({ ...base, ms: base.ms + 1 })).toBe(2);
    expect(medalFor({ ...base, markHits: 3, mobHeals: 1 })).toBe(1);
    expect(medalFor({ ...base, markHits: 9, mobHeals: 4, ms: 1e9 })).toBe(1);
    expect([MEDAL_SILVER[1], MEDAL_SILVER[2], MEDAL_SILVER[3]]).toEqual([0, 4, 8]);
    for (const kind of ['flock', 'elite', 'treasure', 'mini', 'boss'] as const) expect(stopPar(kind, 2, 2)).toBeGreaterThan(30_000);
    expect(stopPar('flock', 0, 1)).toBeGreaterThan(stopPar('flock', 2, 1));
  });

  it('a cleared stop gives the party its medal: in the run snapshot, paid in hacksilver, told without a name', () => {
    const clear = (markHits: number, level: RunLevel = 2) => {
      const l = lab(['krigare', 'helare'], { level });
      l.inst.markHits = markHits;
      for (const pk of l.inst.packs) {
        for (const id of pk.members) {
          delete l.inst.mobs[id];
          delete l.area.animals[id];
        }
        pk.dead = true;
      }
      const purse = l.run.purse;
      const out = l.go(200);
      return { l, out, paid: l.run.purse - purse };
    };
    const gold = clear(0);
    expect(gold.l.run.medals[gold.l.run.node]).toBe(3);
    const silver = clear(5);
    expect(silver.l.run.medals[silver.l.run.node]).toBe(2);
    expect(gold.paid - silver.paid).toBe(4);
    expect(clear(0, 1).paid - clear(5, 1).paid).toBe(6); // (x1.5 on the gentle levels)
    const snap = gold.out.filter((c) => c.t === 'run' && c.ev === 'state' && c.run).pop();
    expect(snap && snap.t === 'run' && snap.ev === 'state' ? snap.run!.medals : null).toEqual({ [gold.l.run.node]: 3 });
    const told = silver.out.filter((c) => c.t === 'toast' && c.text.includes('Runmärke'));
    expect(told.length).toBe(2); // (each of the two humans is told once)
    for (const c of told) if (c.t === 'toast') for (const pl of silver.l.party.players) expect(c.text).not.toContain(pl.name);
    expect(RUN_T.medalText).toMatch(/1/);
  });
});

describe('the new species and the old rules', () => {
  it('a stat-mate counts for its original in a kill quest', () => {
    const q = SAGA_QUESTS.find((x) => x.kind === 'kill' && x.target === 'skelett')!;
    expect(mobBase('rostdraug')).toBe('skelett');
    const l = lab(['magiker']);
    l.mute();
    l.p.saga!.quests[q.id] = 0;
    for (const species of ['rostdraug', 'skelett', 'gravrotta']) {
      const m = l.place(species, 3, { still: true });
      m.hp = 1;
      press(l, 'p', 'isspjut', m.id);
    }
    expect(l.p.saga!.quests[q.id]).toBe(2);
  });

  it('a Skytt is a shooter and a Sköldbärare a brute wherever the pack has one that is free', () => {
    let archers = 0;
    let shields = 0;
    for (const seed of [1, 2, 3, 4]) {
      for (const stop of generateRun(seed, { boss: 'draug', level: 3 }).stops) {
        for (const r of stop.def.rooms) {
          (r.packs ?? []).forEach((members, pi) => {
            const roles = r.roles?.[pi] ?? [];
            const taken = (i: number): boolean => !!roles[i];
            members.forEach((species, i) => {
              const role = roles[i];
              if (role !== 'archer' && role !== 'shield') return;
              const want = role === 'archer' ? 'shooter' : 'brute';
              const hasFree = members.some((sp, k) => MOB_ARCHETYPE[sp] === want && (k === i || !taken(k)));
              if (role === 'archer') archers++;
              else shields++;
              if (hasFree) expect(MOB_ARCHETYPE[species], `seed ${seed} stop ${stop.node}`).toBe(want);
            });
          });
        }
      }
    }
    expect(archers).toBeGreaterThan(5);
    expect(shields).toBeGreaterThan(5);
  });

  it('big monsters are in packs from the first wing on: about one pack in three there, most packs later, fewer on Mycket lätt', () => {
    const share = (level: RunLevel, wing: number): number => {
      let big = 0;
      let all = 0;
      for (let seed = 1; seed <= 12; seed++) {
        for (const stop of generateRun(seed, { boss: 'draug', level }).stops) {
          if ((stop.row <= 4 ? 0 : stop.row <= 8 ? 1 : 2) !== wing || stop.kind === 'elite') continue;
          for (const r of stop.def.rooms) for (const members of r.packs ?? []) {
            all++;
            if (members.some((sp) => mobBase(sp) === 'skelett')) big++;
          }
        }
      }
      return big / Math.max(1, all);
    };
    expect(share(2, 0)).toBeGreaterThan(0.2);
    expect(share(2, 0)).toBeLessThan(0.45);
    expect(share(2, 1)).toBeGreaterThan(0.55);
    expect(share(1, 0)).toBeGreaterThan(0.2);
    expect(share(0, 0)).toBeGreaterThan(0.08);
    expect(share(0, 0)).toBeLessThan(share(2, 0));
  });
});
