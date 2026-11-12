// The fight rules (DESIGN.md sections 4.1 and 5): the auto-attack, pips and the spender with each class's bonus and combo, the
// shared pause and the reactions outside it, marks as a fraction of max health, the special pack monsters (Besvärjare, Skytt,
// Sköldbärare), the Öppning, the Hirdmannen's healing pace, the masher bot, and what the snapshot tells the clients.
import { describe, expect, it } from 'vitest';
import {
  AUTO_MS,
  CLASSES,
  CLASS_IDS,
  COMBO_TEXT,
  COMPANION_HEAL_CD,
  GCD_MS,
  MARK_NOVA,
  MARK_POOL,
  MARK_SHOT,
  MARK_TAKEN_CAP,
  MOB_FLAG,
  MOB_ROLES,
  OPEN_BONUS,
  OPEN_MS,
  PACK_ROLES,
  PIP_FADE_MS,
  PIP_MAX,
  PIP_NAMES,
  PIP_TEXT,
  ROLE,
  ROLE_NAMES,
  ROLE_TEXT,
  RUN_LEVELS,
  SAGA_BOSSES,
  SPELLS,
  SPEND,
  SPEND_MUL,
  T,
  TILE,
  attackSpellOf,
  botStep,
  buffsOf,
  castSpell,
  classSpells,
  drinkPotion,
  generateRun,
  mainSpellOf,
  newMind,
  performAction,
  runOf,
  sagaSnapshot,
  setTarget,
  spawnSagaMob,
  startRun,
  stun,
  tick,
  type Change,
  type ClassId,
  type MobRole,
  type RunEffect,
  type RunLevel,
  type SagaMob,
} from './index.ts';
import { makeParty } from './runplay.ts';

const NEVER = Number.MAX_SAFE_INTEGER;

/** Heroes of these classes in the first stop of a run (no Hirdmannen unless asked), with a clock and a way to put monsters beside them. */
function lab(classes: ClassId[] = ['krigare', 'helare'], opts: { level?: RunLevel; companion?: boolean; effect?: RunEffect } = {}) {
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
  // everyone in the middle of the start room (ten tiles wide: four and a half free tiles on every side of the first hero)
  const room = run.plan.stops[run.node]!.def.rooms[0]!;
  party.players.forEach((pl, i) => {
    pl.x = (room.x + Math.floor(room.w / 2)) * TILE + TILE / 2;
    pl.y = (room.y + Math.floor(room.h / 2) + [0, 1, -1, 2][i]!) * TILE + TILE / 2;
  });
  if (opts.effect) inst.run!.buffs[p.id] = buffsOf(opts.effect);
  /** A monster `dx` tiles to the right of the first hero: fighting (it never hits back unless a test lets it), or waiting. */
  const place = (species: string, dx: number, o: { kind?: SagaMob['kind']; idle?: boolean; pack?: number; role?: MobRole; dy?: number; still?: boolean } = {}): SagaMob => {
    const a = spawnSagaMob(area, inst, species, p.x + dx * TILE, p.y + (o.dy ?? 0) * TILE, o.kind ?? 'mob', o.pack ?? -1, o.role);
    const m = inst.mobs[a.id]!;
    m.hp = m.max = 100_000;
    if (o.pack !== undefined) inst.packs[o.pack]!.members.push(a.id);
    if (!o.idle) {
      m.state = 'fight';
      m.threat[p.id] = 5;
      m.atkAt = NEVER;
    }
    // (rooted to the spot: it neither walks up to the hero nor does anything else)
    if (o.still) m.stunUntil = NEVER;
    return m;
  };
  const pack = (): number => inst.packs.push({ members: [], dead: false }) - 1;
  const f = inst.fighters[p.id]!;
  /** No auto-attacks from now on (a test that measures one spell). */
  const mute = (): void => {
    for (const ff of Object.values(inst.fighters)) ff.cd[CLASSES[ff.cls].auto] = NEVER;
  };
  const q = party.players[1];
  return { party, run, area, inst, p, f, q, fq: q ? inst.fighters[q.id] : undefined, go, ctx, rnd, place, pack, mute };
}
type Lab = ReturnType<typeof lab>;

/** The damage numbers that floated up from a monster. */
const hitsOn = (out: Change[], id: number | string): number[] => out.flatMap((c) => (c.t === 'hit' && c.on === id && (c.kind === 'dmg' || c.kind === 'crit' || c.kind === 'block') ? [c.n] : []));
const healsOn = (out: Change[], id: number | string): number[] => out.flatMap((c) => (c.t === 'hit' && c.on === id && c.kind === 'heal' ? [c.n] : []));
/** Casts a spell with the cooldowns and the shared pause cleared, with this many pips. */
const press = (l: Lab, spell: string, target?: number | string, pips?: number): Change[] => {
  delete l.f.cd[spell];
  l.f.gcd = 0;
  if (pips !== undefined) l.f.pips = pips;
  return castSpell(l.party.world, l.p.id, spell, target, l.ctx());
};

describe('the classes: four buttons, slot 1 the spender, and an auto-attack', () => {
  it('every class has an auto-attack that is not a button, a spender on slot 1 and words for its pips and its combo', () => {
    expect(CLASS_IDS.map((c) => [CLASSES[c].auto, ...CLASSES[c].spells])).toEqual([
      ['hugg', 'dunderslag', 'utmana', 'skoldslag', 'skoldmur'],
      ['ljuspil', 'solstrale', 'lakerunan', 'lakekrets', 'vackupp'],
      ['yxhugg', 'jattehugg', 'stormsteg', 'virvelvind', 'raseri'],
      ['eldboll', 'runsmall', 'isspjut', 'askregn', 'blink'],
    ]);
    for (const c of CLASS_IDS) {
      expect(CLASSES[c].spells).not.toContain(CLASSES[c].auto);
      expect(attackSpellOf(c)).toBe(CLASSES[c].auto);
      expect(mainSpellOf(c)).toBe(CLASSES[c].spells[0]);
      expect(SPELLS[mainSpellOf(c)]!.kind).toBe('spend');
      expect(SPELLS[mainSpellOf(c)]!.cd).toBe(1000);
      expect(SPELLS[attackSpellOf(c)]!.cd).toBe(AUTO_MS[c]);
      expect(classSpells(c)).toHaveLength(5);
      expect(PIP_NAMES[c].length).toBeGreaterThan(2);
      // one sentence with a number for a child
      for (const text of [PIP_TEXT[c], COMBO_TEXT[c], SPELLS[mainSpellOf(c)]!.text, SPELLS[attackSpellOf(c)]!.text]) expect(text).toMatch(/\d/);
    }
    expect([PIP_NAMES.krigare, PIP_NAMES.magiker, PIP_NAMES.vaktare, PIP_NAMES.helare]).toEqual(['Glöd', 'Gnistor', 'Sköldkraft', 'Ljus']);
    expect([SPELLS.jattehugg!.power, SPELLS.runsmall!.power, SPELLS.dunderslag!.power, SPELLS.solstrale!.power]).toEqual([30, 34, 22, 45]);
    expect(SPELLS.isspjut!.cd).toBe(8000);
    expect([PIP_MAX, [...SPEND_MUL]]).toEqual([3, [0, 1, 2.2, 4]]);
  });

  it('the auto-attack keeps about the damage per second the old button had', () => {
    // (what the filler did per second when it was pressed on cooldown: hugg 14 / 0.8 s, ljuspil 12 / 1.1 s, yxhugg 20 / 0.9 s, eldboll 24 / 1.3 s)
    const old: Record<ClassId, number> = { vaktare: 14 / 0.8, helare: 12 / 1.1, krigare: 20 / 0.9, magiker: 24 / 1.3 };
    for (const c of CLASS_IDS) expect(SPELLS[CLASSES[c].auto]!.power / (AUTO_MS[c] / 1000) / old[c], c).toBeCloseTo(1, 1);
  });
});

describe('the auto-attack', () => {
  it('swings by itself about every 1.2 s at a fighting monster in reach, shows as the same spell and hit, and each hit is a pip', () => {
    const l = lab(['krigare']);
    const m = l.place('skelett', 1.5);
    const out = l.go(3700);
    const swings = out.filter((c) => c.t === 'spell' && c.by === l.p.id && c.spell === 'yxhugg');
    expect(swings.length).toBe(Math.ceil(3700 / AUTO_MS.krigare));
    expect(hitsOn(out, m.id)).toHaveLength(swings.length);
    expect(l.f.pips).toBe(3);
    // more hits than three are wasted
    l.go(1300);
    expect(l.f.pips).toBe(PIP_MAX);
    // it neither waits for the shared pause nor starts it
    expect(l.f.gcd).toBe(0);
  });

  it('a healer auto-attacks with Ljuspil; nobody swings while fallen, frozen, out of reach or out of a fight', () => {
    const l = lab(['helare', 'krigare']);
    const m = l.place('skelett', 4, { still: true });
    expect(l.go(1300).some((c) => c.t === 'spell' && c.by === l.p.id && c.spell === 'ljuspil')).toBe(true);
    // the Krigare beside her is four tiles from it: out of an axe's reach
    expect(l.go(2500).some((c) => c.t === 'spell' && c.by === l.q!.id)).toBe(false);
    for (const state of ['down', 'frozen'] as const) {
      const hp = m.hp;
      if (state === 'down') l.f.down = l.party.now;
      else l.f.frozen = 12345;
      l.go(2500);
      expect(m.hp, state).toBe(hp);
      delete l.f.down;
      delete l.f.frozen;
    }
    // the fight is over: nothing is swung at a monster that only waits
    m.state = 'idle';
    m.threat = {};
    // (it waits further off than it notices anyone, in a fireball's reach and in plain sight)
    const an = l.area.animals[m.id]!;
    an.x = l.p.x - 4 * TILE;
    an.y = l.p.y - 4 * TILE;
    const hp = m.hp;
    const quiet = l.go(3000);
    expect(m.hp).toBe(hp);
    expect(m.state).toBe('idle');
    expect(quiet.some((c) => c.t === 'spell' && c.spell === 'ljuspil')).toBe(false);
  });

  it('never wakes a waiting pack by itself: with one monster fighting, the one asleep beside it is left alone', () => {
    const l = lab(['magiker']);
    const awake = l.place('skelett', 3, { still: true });
    // (asleep further off than it notices anyone, but well within a fireball's reach)
    const asleep = l.place('skelett', -4, { idle: true, dy: -4 });
    l.go(5000);
    expect(awake.hp).toBeLessThan(awake.max);
    expect(asleep.state).toBe('idle');
    expect(asleep.hp).toBe(asleep.max);
    // pressing the everyday attack at it is the deliberate first blow (the same swing, on the same timer)
    l.f.cd = {};
    castSpell(l.party.world, l.p.id, 'eldboll', asleep.id, l.ctx());
    expect(asleep.state).toBe('fight');
    expect(castSpell(l.party.world, l.p.id, 'eldboll', asleep.id, l.ctx())).toEqual([]);
  });

  it('goes for the monster the hero chose (setTarget), and for another in reach when that one is too far, without forgetting the choice', () => {
    const l = lab(['krigare']);
    const near = l.place('skelett', 1.5);
    const other = l.place('skelett', -1.5);
    setTarget(l.party.world, l.p.id, other.id);
    l.go(2500);
    expect(other.hp).toBeLessThan(other.max);
    expect(near.hp).toBe(near.max);
    // the chosen one walks off: the swings go to what is in reach, and come back when it does
    const a = l.area.animals[other.id]!;
    a.x -= 6 * TILE;
    const hp = other.hp;
    l.go(2500);
    expect(near.hp).toBeLessThan(near.max);
    expect(other.hp).toBe(hp);
    expect(l.f.target).toBe(other.id);
    a.x += 6 * TILE;
    l.go(1300);
    expect(other.hp).toBeLessThan(hp);
  });

  it('the path and the runor of the old button still change it', () => {
    const dmg = (effect: RunEffect): number => {
      const l = lab(['krigare'], { effect });
      const m = l.place('skelett', 1.5);
      return hitsOn(l.go(1300), m.id)[0]!;
    };
    expect(dmg({ spell: { yxhugg: 0.3 } })).toBeGreaterThan(dmg({}) * 1.25);
    const l = lab(['krigare'], { effect: { mods: { yxhugg: { chain: 1 } } } });
    const a = l.place('skelett', 1.5);
    const b = l.place('skelett', 2.5);
    l.go(1300);
    expect(a.hp).toBeLessThan(a.max);
    expect(b.hp).toBeLessThan(b.max);
  });

  it('pips fade 6 s after the fight has ended, and are gone when the hero falls', () => {
    const l = lab(['krigare']);
    const m = l.place('skelett', 1.5);
    l.go(2600);
    expect(l.f.pips).toBeGreaterThanOrEqual(2);
    delete l.inst.mobs[m.id];
    delete l.area.animals[m.id];
    l.go(PIP_FADE_MS - 500);
    expect(l.f.pips).toBeGreaterThanOrEqual(2);
    l.go(700);
    expect(l.f.pips).toBe(0);
  });
});

describe('pips and the spender', () => {
  it('slots 2 and 3 give a pip when they land on someone, and none when they hit nothing; slot 4 gives none', () => {
    const k = lab(['krigare']);
    k.mute();
    expect(press(k, 'virvelvind').length).toBeGreaterThan(0);
    expect(k.f.pips).toBe(0); // (nothing near)
    const m = k.place('skelett', 1.5);
    press(k, 'virvelvind');
    expect(k.f.pips).toBe(1);
    press(k, 'stormsteg', m.id);
    expect(k.f.pips).toBe(2);
    press(k, 'raseri');
    expect(k.f.pips).toBe(2);
    // a healer's Läkerunan on a hurt friend and her ring
    const h = lab(['helare', 'krigare']);
    h.mute();
    h.fq!.hp = 10;
    press(h, 'lakerunan', h.q!.id);
    expect(h.f.pips).toBe(1);
    press(h, 'lakekrets');
    expect(h.f.pips).toBe(2);
    // a tank's Utmana! with nobody to shout at gives none
    const v = lab(['vaktare']);
    v.mute();
    press(v, 'utmana');
    expect(v.f.pips).toBe(0);
    v.place('skelett', 2);
    press(v, 'utmana');
    expect(v.f.pips).toBe(1);
  });

  it('the spender needs a pip, uses them all, and hits 1, 2.2 and 4 times as hard at 1, 2 and 3', () => {
    const l = lab(['magiker']);
    l.mute();
    const m = l.place('skelett', 4);
    expect(press(l, 'runsmall', m.id, 0)).toEqual([]);
    const n = [1, 2, 3].map((pips) => {
      const out = press(l, 'runsmall', m.id, pips);
      expect(l.f.pips).toBe(0);
      return hitsOn(out, m.id)[0]!;
    });
    expect(n[1]! / n[0]!).toBeCloseTo(2.2, 1);
    expect(n[2]! / n[0]!).toBeCloseTo(4, 1);
    // it is on the shared pause, with a cooldown of 1 s
    expect(l.f.gcd).toBe(l.party.now + GCD_MS);
    expect(l.f.cd.runsmall).toBe(l.party.now + 1000);
  });

  it('Krigare, Jättehugg: at 3 Glöd everything in the arc in front is hit too, and a dazed monster takes double', () => {
    const scene = () => {
      const l = lab(['krigare']);
      l.mute();
      return { l, front: l.place('skelett', 1.5), beside: l.place('skelett', 1.4, { dy: 0.8 }), behind: l.place('skelett', -1.5) };
    };
    const two = scene();
    const base = hitsOn(press(two.l, 'jattehugg', two.front.id, 2), two.front.id)[0]!;
    expect(two.beside.hp).toBe(two.beside.max);
    const three = scene();
    const out = press(three.l, 'jattehugg', three.front.id, 3);
    expect(hitsOn(out, three.beside.id)[0]).toBe(hitsOn(out, three.front.id)[0]);
    expect(three.behind.hp).toBe(three.behind.max);
    // the combo: daze it first
    const combo = scene();
    stun(hereOf(combo.l), combo.front, 1000, combo.l.party.now, []);
    expect(hitsOn(press(combo.l, 'jattehugg', combo.front.id, 2), combo.front.id)[0]! / base).toBeCloseTo(SPEND.jattehugg.combo, 1);
  });

  it('Magiker, Runsmäll: at 3 Gnistor it splashes for half; a slowed monster shatters (1.5 times, and the splash at any pips)', () => {
    const scene = () => {
      const l = lab(['magiker']);
      l.mute();
      return { l, a: l.place('skelett', -3), near: l.place('skelett', -1.5), far: l.place('skelett', 2.5) };
    };
    const one = scene();
    const base = hitsOn(press(one.l, 'runsmall', one.a.id, 1), one.a.id)[0]!;
    expect(one.near.hp).toBe(one.near.max);
    const three = scene();
    const out = press(three.l, 'runsmall', three.a.id, 3);
    expect(hitsOn(out, three.near.id)[0]! / hitsOn(out, three.a.id)[0]!).toBeCloseTo(SPEND.runsmall.splash, 1);
    expect(three.far.hp).toBe(three.far.max);
    // the combo: Isspjut first (it slows), then one Gnista is enough for the splash
    const combo = scene();
    press(combo.l, 'isspjut', combo.a.id);
    combo.near.hp = combo.near.max;
    const shatter = press(combo.l, 'runsmall', combo.a.id, 1);
    expect(hitsOn(shatter, combo.a.id)[0]! / base).toBeCloseTo(SPEND.runsmall.combo, 1);
    expect(hitsOn(shatter, combo.near.id)).toHaveLength(1);
  });

  it('Väktare, Dunderslag: at 3 Sköldkraft a shield of 15 % for 4 s; it hits every monster under the hero’s own Utmana!, high threat', () => {
    const l = lab(['vaktare', 'krigare']);
    l.mute();
    const a = l.place('skelett', 1.5);
    const b = l.place('skelett', 4);
    const c = l.place('skelett', -4);
    press(l, 'dunderslag', a.id, 2);
    expect(b.hp).toBe(b.max);
    expect(l.f.shield).toBeUndefined();
    const threat = a.threat[l.p.id]!;
    expect(threat).toBeGreaterThan((a.max - a.hp) * 5);
    press(l, 'utmana');
    const out = press(l, 'dunderslag', a.id, 3);
    for (const m of [a, b, c]) expect(hitsOn(out, m.id), String(m.id)).toHaveLength(1);
    expect(l.f.shield!.hp).toBeCloseTo(l.f.max * SPEND.dunderslag.shield);
    expect(l.f.shield!.until).toBe(l.party.now + SPEND.dunderslag.shieldMs);
    // a monster somebody else has taunted is not his
    b.tauntBy = l.q!.id;
    const hp = b.hp;
    press(l, 'dunderslag', a.id, 1);
    expect(b.hp).toBe(hp);
  });

  it('Helare, Solstråle: heals a friend; at 3 Ljus everyone within 5 tiles; a friend in her own Läkekrets gets 1.5 times', () => {
    const scene = () => {
      const l = lab(['helare', 'krigare', 'magiker']);
      l.mute();
      const [, k, m] = l.party.players;
      const fk = l.inst.fighters[k!.id]!;
      const fm = l.inst.fighters[m!.id]!;
      fk.max = fm.max = l.f.max = 10_000;
      fk.hp = fm.hp = l.f.hp = 100;
      m!.x = l.p.x + 4 * TILE;
      m!.y = l.p.y;
      return { l, k: k!, m: m!, fk, fm };
    };
    const one = scene();
    const out = press(one.l, 'solstrale', one.k.id, 1);
    const base = healsOn(out, one.k.id)[0]!;
    expect(base).toBe(Math.round(45 * 1.05 * 1.03));
    expect(one.fm.hp).toBe(100);
    const two = scene();
    expect(healsOn(press(two.l, 'solstrale', two.k.id, 2), two.k.id)[0]! / base).toBeCloseTo(2.2, 1);
    const three = scene();
    const all = press(three.l, 'solstrale', three.k.id, 3);
    for (const id of [three.k.id, three.m.id, three.l.p.id]) expect(healsOn(all, id)[0]! / base, id).toBeCloseTo(4, 1);
    // someone further than 5 tiles is not reached
    const far = scene();
    far.m.y = far.l.p.y + 4 * TILE; // (4 across and 4 down: 5.7 tiles)
    press(far.l, 'solstrale', far.k.id, 3);
    expect(far.fm.hp).toBe(100);
    // the combo: her ring first
    const ring = scene();
    press(ring.l, 'lakekrets');
    expect(ring.fk.hot?.by).toBe(ring.l.p.id);
    expect(healsOn(press(ring.l, 'solstrale', ring.k.id, 1), ring.k.id)[0]! / base).toBeCloseTo(SPEND.solstrale.combo, 1);
    // nobody hurt: nothing is spent
    const well = lab(['helare', 'krigare']);
    well.mute();
    expect(press(well, 'solstrale', undefined, 3).every((c) => c.t === 'toast')).toBe(true);
    expect(well.f.pips).toBe(3);
  });

  it('the use key is the main button: the spender when there is a pip, else a swing that wakes the pack', () => {
    const l = lab(['krigare']);
    const m = l.place('skelett', 1.2, { idle: true });
    l.p.selected = 7; // (an empty slot in the hand: nothing to drink or use)
    const tx = Math.floor(l.p.x / TILE);
    const ty = Math.floor(l.p.y / TILE);
    const first = performAction(l.area, l.p.id, tx + 1, ty, l.ctx());
    expect(first.some((c) => c.t === 'spell' && c.spell === 'yxhugg')).toBe(true);
    expect(m.state).toBe('fight');
    m.atkAt = NEVER;
    expect(l.f.pips).toBe(1);
    l.f.gcd = 0;
    const second = performAction(l.area, l.p.id, tx + 1, ty, l.ctx());
    expect(second.some((c) => c.t === 'spell' && c.spell === 'jattehugg')).toBe(true);
    expect(l.f.pips).toBe(0);
  });
});

/** The `Here` the sim's helpers take, for a lab. */
const hereOf = (l: Lab) => ({ farm: l.party.world, area: l.area, inst: l.inst, key: l.run.key });

describe('the shared pause', () => {
  it('is one second; the reactions and potions neither wait for it nor start it', () => {
    expect(GCD_MS).toBe(1000);
    expect(
      Object.values(SPELLS)
        .filter((s) => s.offGcd)
        .map((s) => s.id)
        .sort(),
    ).toEqual(['blink', 'isspjut', 'skoldmur', 'skoldslag', 'stormsteg']);
    const v = lab(['vaktare']);
    v.mute();
    const m = v.place('skelett', 1.5);
    press(v, 'utmana');
    const pause = v.f.gcd;
    expect(pause).toBe(v.party.now + GCD_MS);
    // on the pause: the spender waits
    v.f.pips = 3;
    expect(castSpell(v.party.world, v.p.id, 'dunderslag', m.id, v.ctx())).toEqual([]);
    // off it: Sköldslag and Sköldmur go at once and leave the pause where it was
    expect(castSpell(v.party.world, v.p.id, 'skoldslag', m.id, v.ctx()).some((c) => c.t === 'spell')).toBe(true);
    expect(castSpell(v.party.world, v.p.id, 'skoldmur', undefined, v.ctx()).some((c) => c.t === 'spell')).toBe(true);
    expect(v.f.gcd).toBe(pause);
    v.f.hp = 10;
    expect(drinkPotion(v.party.world, v.p.id, v.ctx()).some((c) => c.t === 'spell' && c.spell === 'potion')).toBe(true);
    expect(v.f.gcd).toBe(pause);
    // a mage's Isspjut and Blink, a warrior's Stormsteg
    const g = lab(['magiker']);
    g.mute();
    const t = g.place('skelett', 4);
    press(g, 'askregn', t.id);
    expect(castSpell(g.party.world, g.p.id, 'isspjut', t.id, g.ctx()).length).toBeGreaterThan(0);
    expect(castSpell(g.party.world, g.p.id, 'blink', undefined, g.ctx()).length).toBeGreaterThan(0);
    const k = lab(['krigare']);
    k.mute();
    const far = k.place('skelett', 5);
    press(k, 'raseri');
    expect(castSpell(k.party.world, k.p.id, 'stormsteg', far.id, k.ctx()).length).toBeGreaterThan(0);
  });
});

/** A boss beside the hero that casts move `i` now (of this species), and the zones it made. */
function bossCast(l: Lab, species: string, i: number) {
  const m = l.place(species, 1.5, { kind: 'boss' });
  const def = SAGA_BOSSES[species]!;
  m.phase = def.moves[i]!.phase ?? 0;
  m.next = def.moves.map((_, k) => (k === i ? l.party.now : Infinity));
  l.go(100);
  return { m, mv: def.moves[i]!, zones: () => l.inst.zones.filter((z) => z.by === m.id) };
}

describe('marks: a telegraphed hit is a fraction of the victim’s max health', () => {
  it('the levels: 8, 15, 35, 45 and 55 %', () => {
    expect([0, 1, 2, 3, 4].map((lv) => RUN_LEVELS[lv as RunLevel].mark)).toEqual([0.08, 0.15, 0.35, 0.45, 0.55]);
    expect([MARK_NOVA, MARK_POOL, MARK_SHOT, MARK_TAKEN_CAP]).toEqual([1.7, 0.35, 0.85, 0.3]);
  });

  for (const level of [0, 1, 2, 3, 4] as RunLevel[]) {
    it(`level ${level}: a slam takes ${RUN_LEVELS[level].mark * 100} % of each hero's own max health, whatever the class, the armor and the party; the hit is tagged and counted`, () => {
      const l = lab(['vaktare', 'magiker'], { level, effect: { armor: 0.5 } });
      l.mute();
      const { m, mv } = bossCast(l, 'gravvaktare', 0);
      expect(mv.move).toBe('slam');
      l.q!.x = l.p.x + TILE;
      l.q!.y = l.p.y;
      const out = l.go(Math.round(mv.warn * RUN_LEVELS[level].warn) + 100);
      for (const [pl, ff] of [
        [l.p, l.f],
        [l.q!, l.fq!],
      ] as const) {
        const hit = out.find((c) => c.t === 'hit' && c.on === pl.id);
        expect(hit && hit.t === 'hit' ? [hit.n, hit.mark] : null, pl.name).toEqual([Math.round(ff.max * RUN_LEVELS[level].mark * mv.dmg), true]);
      }
      expect(l.inst.markHits).toBe(2);
      // the boss's ordinary blow is not a mark
      m.atkAt = 0;
      m.next = m.next!.map(() => Infinity);
      const blow = l.go(100).find((c) => c.t === 'hit' && c.on === l.p.id);
      expect(blow && blow.t === 'hit' && blow.mark).toBeFalsy();
      expect(l.inst.markHits).toBe(2);
    });
  }

  it('one mark from full health never downs anyone (an Extrem nova is nearly all of it); a second one does', () => {
    const l = lab(['magiker', 'helare'], { level: 4 });
    l.mute();
    const i = SAGA_BOSSES.draugkung!.moves.findIndex((mv) => mv.move === 'nova');
    const { m, mv } = bossCast(l, 'draugkung', i);
    const zone = l.inst.zones.find((z) => z.by === m.id)!;
    expect(zone.dmg).toBeCloseTo(RUN_LEVELS[4].mark * MARK_NOVA * mv.dmg);
    zone.dmg = 5; // (far more than all of it)
    l.go(Math.round(mv.warn * RUN_LEVELS[4].warn) + 100);
    expect(l.f.down).toBeUndefined();
    expect(l.f.hp).toBe(1);
    m.next![i] = l.party.now;
    l.go(Math.round(mv.warn * RUN_LEVELS[4].warn) + 200);
    expect(l.f.down).toBeDefined();
  });

  it('an uninterrupted nova is 1.7 marks (60 % on Medel at weight 1), burning ground 0.35 of one every second', () => {
    expect(RUN_LEVELS[2].mark * MARK_NOVA).toBeCloseTo(0.595);
    const l = lab(['vaktare'], { level: 2 });
    l.mute();
    const i = SAGA_BOSSES.smeden!.moves.findIndex((mv) => mv.move === 'pools');
    const { m, mv, zones } = bossCast(l, 'smeden', i);
    expect(zones()[0]!.dmg).toBeCloseTo(RUN_LEVELS[2].mark * MARK_POOL * mv.dmg);
    const tick1 = Math.round(l.f.max * RUN_LEVELS[2].mark * MARK_POOL * mv.dmg);
    m.next = m.next!.map(() => Infinity);
    const out = l.go(mv.warn + 3200);
    const hits = out.flatMap((c) => (c.t === 'hit' && c.on === l.p.id && c.mark ? [c.n] : []));
    expect(hits.length).toBeGreaterThanOrEqual(3);
    for (const n of hits) expect(n).toBe(tick1);
  });

  it('Sköldmur and a shield still work on a mark; runor that make you take less count, but at most 30 %', () => {
    const taken = (effect: RunEffect, prep: (l: Lab) => void = () => {}): number => {
      const l = lab(['vaktare'], { level: 2, effect });
      l.mute();
      prep(l);
      const { mv } = bossCast(l, 'gravvaktare', 0);
      const hp = l.f.hp;
      l.go(mv.warn + 100);
      return (hp - l.f.hp) / l.f.max;
    };
    const plain = taken({});
    expect(plain).toBeCloseTo(0.35 * SAGA_BOSSES.gravvaktare!.moves[0]!.dmg, 2);
    expect(taken({ taken: 0.1 }) / plain).toBeCloseTo(0.9, 1);
    expect(taken({ taken: 0.5 }) / plain).toBeCloseTo(1 - MARK_TAKEN_CAP, 1);
    expect(taken({}, (l) => press(l, 'skoldmur')) / plain).toBeLessThan(0.45);
    expect(taken({}, (l) => (l.f.shield = { hp: 20, until: l.party.now + 60_000 }))).toBeCloseTo(plain - 20 / 214, 2);
  });
});

describe('special pack monsters', () => {
  it('have a name and one sentence about what to do, and the role is on the animal before the pack is pulled', () => {
    for (const r of MOB_ROLES) {
      expect(ROLE_NAMES[r].length).toBeGreaterThan(3);
      expect(ROLE_TEXT[r]).toMatch(/\d/);
    }
    expect([ROLE_NAMES.healer, ROLE_NAMES.archer, ROLE_NAMES.shield]).toEqual(['Besvärjare', 'Skytt', 'Sköldbärare']);
    const l = lab(['krigare']);
    const m = l.place('skelett', 4, { idle: true, pack: l.pack(), role: 'healer' });
    const a = l.area.animals[m.id]!;
    expect(a.role).toBe('healer');
    expect(a.name).toBe('Skelettkrigare · Besvärjare');
    expect(m.role).toBe('healer');
  });

  it('Besvärjare: after 4 s and then every 8 s casts 2.5 s on its most hurt packmate and heals it 30 %; the heal is counted', () => {
    const l = lab(['krigare'], { level: 2 });
    l.mute();
    const pk = l.pack();
    const healer = l.place('skelett', 3, { pack: pk, role: 'healer' });
    const a = l.place('skelett', 2, { pack: pk });
    const b = l.place('skelett', 4, { pack: pk });
    for (const m of [healer, a, b]) m.max = m.hp = 1000;
    healer.roleAt = l.party.now + ROLE.healer.first;
    a.hp = 300;
    b.hp = 600;
    l.go(ROLE.healer.first - 100);
    expect(healer.cast).toBeUndefined();
    l.go(200);
    expect(healer.cast).toMatchObject({ role: 'heal', on: a.id, move: -1 });
    expect(healer.cast!.at - healer.cast!.start).toBe(ROLE.healer.cast);
    // the cast is in the snapshot for the filling circle: kind, started, lands at, stoppable
    expect(sagaSnapshot(l.party.world, l.party.now)![l.run.key]!.c![healer.id]).toEqual(['heal', healer.cast!.start, healer.cast!.at, 1]);
    const out = l.go(ROLE.healer.cast + 50);
    expect(a.hp).toBe(600);
    expect(healsOn(out, a.id)).toEqual([300]);
    expect(l.inst.mobHeals).toBe(1);
    expect(healer.cast).toBeUndefined();
    // the next one 8 s after the first began
    l.go(ROLE.healer.every - ROLE.healer.cast - 200);
    expect(healer.cast).toBeUndefined();
    l.go(300);
    expect(healer.cast?.role).toBe('heal');
  });

  it('Lätt: the Besvärjare is harmless (a 4 s cast, 10 %)', () => {
    const l = lab(['krigare'], { level: 1 });
    l.mute();
    const pk = l.pack();
    const healer = l.place('skelett', 3, { pack: pk, role: 'healer' });
    const a = l.place('skelett', 2, { pack: pk });
    a.max = 1000;
    a.hp = 300;
    healer.roleAt = l.party.now;
    l.go(100);
    expect(healer.cast!.at - healer.cast!.start).toBe(4000);
    l.go(4000);
    expect(a.hp).toBe(400);
  });

  it('a stun or an interrupt cancels the heal and opens the Besvärjare for 4 s (+50 % from everyone); a stun on a monster that is not casting opens nothing', () => {
    for (const how of ['skoldslag', 'stormsteg', 'isspjut', 'stun'] as const) {
      const cls: ClassId = how === 'skoldslag' ? 'vaktare' : how === 'isspjut' ? 'magiker' : 'krigare';
      const l = lab([cls, 'helare'], { level: 2 });
      l.mute();
      const pk = l.pack();
      const healer = l.place('skelett', 1.5, { pack: pk, role: 'healer' });
      const mate = l.place('skelett', 3, { pack: pk });
      mate.hp = 50_000;
      healer.roleAt = l.party.now;
      l.go(100);
      expect(healer.cast?.role, how).toBe('heal');
      const before = hitsOn(press(l, attackSpellOf(cls), healer.id), healer.id)[0]!;
      const out: Change[] = how === 'stun' ? [] : press(l, how, healer.id);
      if (how === 'stun') stun(hereOf(l), healer, 500, l.party.now, out);
      expect(healer.cast, how).toBeUndefined();
      expect(out.some((c) => c.t === 'hit' && c.on === healer.id && c.kind === 'kick'), how).toBe(true);
      expect(healer.open, how).toBe(l.party.now + OPEN_MS);
      const snap = sagaSnapshot(l.party.world, l.party.now)![l.run.key]!;
      expect(snap.m[healer.id]![2] & MOB_FLAG.open, how).toBe(MOB_FLAG.open);
      expect(snap.o![healer.id]).toBe(healer.open);
      expect(snap.c?.[healer.id]).toBeUndefined();
      // open: half as much again, from the friend too
      expect(hitsOn(press(l, attackSpellOf(cls), healer.id), healer.id)[0]! / before, how).toBeCloseTo(1 + OPEN_BONUS, 1);
      const friend = healer.hp;
      l.fq!.cd = {};
      castSpell(l.party.world, l.q!.id, 'ljuspil', healer.id, l.ctx());
      expect(friend - healer.hp).toBe(Math.round(Math.round(13 * 1.05 * 1.03 * 100) / 100 * (1 + OPEN_BONUS)));
      // the heal never came, and the next cast is a whole interval away
      l.go(ROLE.healer.cast + 500);
      expect(mate.hp).toBe(50_000);
      expect(l.inst.mobHeals).toBe(0);
      // four seconds later it is over
      l.go(OPEN_MS);
      expect(sagaSnapshot(l.party.world, l.party.now)![l.run.key]!.o?.[healer.id]).toBeUndefined();
    }
    const l = lab(['krigare']);
    l.mute();
    const m = l.place('skelett', 1.5);
    const out: Change[] = [];
    stun(hereOf(l), m, 1000, l.party.now, out);
    expect(m.open).toBeUndefined();
    expect(out.some((c) => c.t === 'hit' && c.kind === 'stun')).toBe(true);
    expect(sagaSnapshot(l.party.world, l.party.now)![l.run.key]!.m[m.id]![2]).toBe(MOB_FLAG.dazed);
  });

  it('interrupting a boss’s nova opens the boss; a blow on an open boss is half as much again', () => {
    const l = lab(['vaktare'], { level: 2 });
    l.mute();
    const i = SAGA_BOSSES.draugkung!.moves.findIndex((mv) => mv.move === 'nova');
    const { m } = bossCast(l, 'draugkung', i);
    const snap = sagaSnapshot(l.party.world, l.party.now)![l.run.key]!;
    expect(snap.c![m.id]).toEqual(['nova', m.cast!.start, m.cast!.at, 1]);
    const before = hitsOn(press(l, 'hugg', m.id), m.id)[0]!;
    press(l, 'skoldslag', m.id);
    expect(m.cast).toBeUndefined();
    expect(m.open).toBe(l.party.now + OPEN_MS);
    expect(hitsOn(press(l, 'hugg', m.id), m.id)[0]! / before).toBeCloseTo(1.5, 1);
    // a Sköldslag on a boss that is not casting opens nothing
    delete m.open;
    press(l, 'skoldslag', m.id);
    expect(m.open).toBeUndefined();
  });

  it('Skytt: after 3 s and then every 7 s aims a striped line at a hero for 1.5 s, then everyone on it takes 0.85 of a mark; step aside and it misses', () => {
    const shot = (dodge: boolean, level: RunLevel = 2) => {
      const l = lab(['krigare', 'helare'], { level });
      l.mute();
      l.q!.x = l.p.x;
      l.q!.y = l.p.y + 4 * TILE;
      const archer = l.place('skelett', 4, { pack: l.pack(), role: 'archer' });
      archer.threat = { [l.p.id]: 5 };
      archer.roleAt = l.party.now + ROLE.archer.first;
      l.rnd.v = 0; // (the first hero in sight)
      l.go(ROLE.archer.first - 100);
      expect(archer.cast).toBeUndefined();
      l.go(200);
      l.rnd.v = 0.99;
      const zone = l.inst.zones.find((z) => z.by === archer.id)!;
      return { l, archer, zone, dodge };
    };
    const hit = shot(false);
    expect(hit.zone).toMatchObject({ shape: 'line', kind: 'shot', r: ROLE.archer.length, w: ROLE.archer.width });
    expect(hit.zone.dmg).toBeCloseTo(RUN_LEVELS[2].mark * MARK_SHOT);
    expect(hit.archer.cast).toMatchObject({ role: 'shot', move: -1 });
    expect(hit.zone.at - hit.archer.cast!.start).toBe(ROLE.archer.warn);
    expect(sagaSnapshot(hit.l.party.world, hit.l.party.now)![hit.l.run.key]!.c![hit.archer.id]![0]).toBe('shot');
    const out = hit.l.go(ROLE.archer.warn + 50);
    const h = out.find((c) => c.t === 'hit' && c.on === hit.l.p.id);
    expect(h && h.t === 'hit' ? [h.n, h.mark] : null).toEqual([Math.round(hit.l.f.max * RUN_LEVELS[2].mark * MARK_SHOT), true]);
    expect(hit.l.inst.markHits).toBe(1);
    expect(hit.l.inst.zones.some((z) => z.by === hit.archer.id)).toBe(false);
    // a step to the side
    const miss = shot(true);
    miss.l.p.y += 1.5 * TILE;
    const hp = miss.l.f.hp;
    miss.l.go(ROLE.archer.warn + 50);
    expect(miss.l.f.hp).toBe(hp);
    expect(miss.l.inst.markHits).toBe(0);
    // a stun cancels the shot and its line, and opens the Skytt
    const stop = shot(false);
    stun(hereOf(stop.l), stop.archer, 500, stop.l.party.now, []);
    expect(stop.l.inst.zones.some((z) => z.by === stop.archer.id)).toBe(false);
    expect(stop.archer.open).toBeDefined();
    const hp2 = stop.l.f.hp;
    stop.l.go(ROLE.archer.warn + 50);
    expect(stop.l.f.hp).toBe(hp2);
    // Lätt: the warning is 1.4 times as long and the shot a small one
    const easy = shot(false, 1);
    expect(easy.zone.at - easy.archer.cast!.start).toBe(Math.round(ROLE.archer.warn * 1.4));
    expect(easy.zone.dmg).toBeCloseTo(0.15 * MARK_SHOT);
  });

  it('Sköldbärare: packmates within 3 tiles take half (not itself, not when it is dazed, far away or dead); a quarter on Lätt', () => {
    const scene = (level: RunLevel = 2) => {
      const l = lab(['magiker'], { level });
      l.mute();
      const pk = l.pack();
      const shield = l.place('skelett', 3, { pack: pk, role: 'shield' });
      const mate = l.place('skelett', 4, { pack: pk });
      const far = l.place('skelett', 3, { pack: pk, dy: 4 });
      const other = l.place('skelett', -3);
      const dmg = (m: SagaMob): number => hitsOn(press(l, 'eldboll', m.id), m.id)[0]!;
      return { l, shield, mate, far, other, dmg };
    };
    const s = scene();
    const full = s.dmg(s.other);
    expect(s.dmg(s.mate) / full).toBeCloseTo(1 - ROLE.shield.cut, 1);
    expect(s.dmg(s.shield)).toBe(full);
    expect(s.dmg(s.far)).toBe(full);
    const snap = sagaSnapshot(s.l.party.world, s.l.party.now)![s.l.run.key]!;
    expect(snap.m[s.mate.id]![2] & MOB_FLAG.shielded).toBe(MOB_FLAG.shielded);
    expect(snap.m[s.shield.id]![2] & MOB_FLAG.shielded).toBe(0);
    // dazed: the shield is down
    stun(hereOf(s.l), s.shield, 2000, s.l.party.now, []);
    expect(s.dmg(s.mate)).toBe(full);
    s.l.go(2100);
    expect(s.dmg(s.mate)).toBeLessThan(full);
    // dead: gone for good
    delete s.l.inst.mobs[s.shield.id];
    delete s.l.area.animals[s.shield.id];
    expect(s.dmg(s.mate)).toBe(full);
    const e = scene(1);
    expect(e.dmg(e.mate) / e.dmg(e.other)).toBeCloseTo(1 - ROLE.shield.easy.cut, 1);
  });

  it('roles are dealt by the seed: none on Mycket lätt, one a stop on Lätt, one a pack on Medel (not the run’s first pack), two a pack on Svår, Extrem and in a Stark vakt; never two Besvärjare in a pack', () => {
    expect([0, 1, 2, 3, 4].map((lv) => [PACK_ROLES[lv as RunLevel].perPack, PACK_ROLES[lv as RunLevel].perStop])).toEqual([[0, 0], [0, 1], [1, 0], [2, 0], [2, 0]]);
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const level of [0, 1, 2, 3, 4] as RunLevel[]) {
        const plan = generateRun(seed, { boss: 'draug', level });
        // the same seed: the same roles
        expect(JSON.stringify(generateRun(seed, { boss: 'draug', level }).stops.map((s) => s.def.rooms.map((r) => r.roles)))).toBe(JSON.stringify(plan.stops.map((s) => s.def.rooms.map((r) => r.roles))));
        for (const stop of plan.stops) {
          const packs = stop.def.rooms.flatMap((r) => (r.packs ?? []).map((members, i) => ({ members, roles: (r.roles?.[i] ?? []).filter((x): x is MobRole => !!x), row: r.roles?.[i] })));
          for (const pk of packs) {
            if (pk.row) expect(pk.row).toHaveLength(pk.members.length);
            expect(pk.roles.filter((r) => r === 'healer').length).toBeLessThanOrEqual(1);
            expect(new Set(pk.roles).size).toBe(pk.roles.length);
            for (const r of pk.roles) seen.add(r);
          }
          const counts = packs.map((pk) => pk.roles.length);
          const total = counts.reduce((a, b) => a + b, 0);
          const where = `seed ${seed} level ${level} stop ${stop.node} (${stop.kind})`;
          if (!packs.length) expect(total, where).toBe(0);
          else if (level === 0) expect(total, where).toBe(0);
          else if (level === 1) {
            expect(total, where).toBe(1);
            if (stop.row === 1 && packs.length > 1) expect(counts[0], where).toBe(0);
          } else if (level === 2) {
            const want = stop.kind === 'elite' ? 2 : 1;
            expect(counts, where).toEqual(packs.map((_, k) => (stop.row === 1 && k === 0 ? 0 : want)));
          } else expect(counts, where).toEqual(packs.map(() => 2));
        }
      }
    }
    expect([...seen].sort()).toEqual(['archer', 'healer', 'shield']);
    // the roles do not move what the seed built before them: the same rooms and packs on every level from Medel up
    const packsOf = (level: RunLevel): string => JSON.stringify(generateRun(9, { boss: 'draug', level, modifiers: [] }).stops.map((s) => s.def.rooms.map((r) => r.packs)));
    expect(packsOf(3)).toBe(packsOf(2));
  });

  it('a built stop carries the roles on its monsters and animals', () => {
    const l = lab(['krigare'], { level: 3 });
    const withRole = Object.values(l.inst.mobs).filter((m) => m.role);
    expect(withRole.length).toBe(l.inst.packs.length * 2);
    for (const m of withRole) {
      expect(l.area.animals[m.id]!.role).toBe(m.role);
      expect(l.area.animals[m.id]!.name).toContain(ROLE_NAMES[m.role!]);
    }
  });
});

describe('the Hirdmannen', () => {
  it('his Läkerunan recharges twice as slowly as a hero’s (32 a 3 s), and Hirdens lön still makes him 20 % stronger', () => {
    expect(COMPANION_HEAL_CD).toBe(2);
    const l = lab(['krigare'], { companion: true });
    const c = Object.values(l.area.players).find((x) => x.bot)!;
    const fc = l.inst.fighters[c.id]!;
    expect(fc.cls).toBe('helare');
    l.f.hp = 10;
    const out = castSpell(l.party.world, c.id, 'lakerunan', l.p.id, l.ctx());
    expect(healsOn(out, l.p.id)).toEqual([Math.round(32 * 1.05 * 1.03)]);
    expect(fc.cd.lakerunan! - l.party.now).toBe(SPELLS.lakerunan!.cd * COMPANION_HEAL_CD);
    // a hero healer's is the spell's own
    const h = lab(['helare', 'krigare']);
    h.fq!.hp = 10;
    castSpell(h.party.world, h.p.id, 'lakerunan', h.q!.id, h.ctx());
    expect(h.f.cd.lakerunan! - h.party.now).toBe(1500);
    // Hirdens lön
    l.inst.run!.buffs[c.id] = buffsOf({ power: 0.2 });
    fc.cd = {};
    fc.gcd = 0;
    l.f.hp = 10;
    expect(healsOn(castSpell(l.party.world, c.id, 'lakerunan', l.p.id, l.ctx()), l.p.id)[0]).toBe(Math.round(32 * 1.05 * 1.03 * 1.2));
  });

  it('his throughput on a hero who is being hit: Läkerunan on its slow clock, and a Solstråle only ever with three pips', () => {
    const l = lab(['krigare'], { companion: true, level: 2 });
    const c = Object.values(l.area.players).find((x) => x.bot)!;
    c.x = l.p.x;
    c.y = l.p.y + 2 * TILE;
    // a monster the hero and he can both reach; the hero has a bottomless health bar, so every heal shows whole
    l.place('skelett', 1.5);
    l.f.max = 1_000_000;
    l.f.hp = 1000;
    let healed = 0;
    let runor = 0;
    const rays: number[] = [];
    for (let t = 0; t < 30_000; t += 50) {
      const out = l.go(50);
      const by = (spell: string): boolean => out.some((ch) => ch.t === 'spell' && ch.by === c.id && ch.spell === spell);
      const got = healsOn(out, l.p.id).reduce((a, b) => a + b, 0);
      healed += got;
      if (by('lakerunan')) runor++;
      if (by('solstrale')) rays.push(got);
    }
    expect(runor).toBeGreaterThanOrEqual(9);
    expect(runor).toBeLessThanOrEqual(11); // (one every 3 s)
    // every Solstråle was a three-pip one: four times 45 (a ring under the hero makes it 1.5 times that)
    expect(rays.length).toBeGreaterThan(0);
    for (const n of rays) expect(n).toBeGreaterThanOrEqual(Math.round(45 * 4 * 1.05 * 1.03));
    // Phase A only pins that he heals more than a boss's ordinary blows on Medel (Draugkungen: 12 every 2 s, x0.7 for two fighters) and
    // that it is finite; the number itself is tuned in Phase B (COMPANION_HEAL_CD) against the marks
    const perSec = healed / 30;
    expect(perSec).toBeGreaterThan((SAGA_BOSSES.draugkung!.dmg * 0.7) / 2);
    expect(perSec).toBeLessThan(120);
  });
});


describe('the masher bot', () => {
  it('presses every button that is ready in the order 4, 3, 2, 1 at nothing in particular, takes a random lane and never leaves a mark', () => {
    const mind = newMind('masher', () => 0.5);
    expect(mind.lane).toBe('random');
    const l = lab(['krigare']);
    l.mute();
    l.place('skelett', 1.5);
    l.f.pips = 2;
    const out = botStep(l.party.world, l.p.id, mind, l.ctx(), 50);
    // 4 (Raseri) goes and starts the pause, 3 (Virvelvind) and 1 (Jättehugg) wait for it, 2 (Stormsteg) is off it
    expect(out.flatMap((c) => (c.t === 'spell' ? [c.spell] : []))).toEqual(['raseri', 'stormsteg']);
    l.go(GCD_MS);
    const next = botStep(l.party.world, l.p.id, mind, l.ctx(), 50);
    expect(next.flatMap((c) => (c.t === 'spell' ? [c.spell] : []))).toEqual(['virvelvind']);
    l.go(GCD_MS);
    // the spender at any pips (it does not hold for three)
    expect(botStep(l.party.world, l.p.id, mind, l.ctx(), 50).some((c) => c.t === 'spell' && c.spell === 'jattehugg')).toBe(true);
    // a mark under its feet: it stays where it is, where the careful bot walks out
    const slammed = (style: 'masher' | 'careful'): number => {
      const s = lab(['krigare']);
      s.mute();
      const { mv } = bossCast(s, 'gravvaktare', 0);
      const sm = newMind(style, () => 0.5);
      for (let t = 0; t < mv.warn + 100; t += 50) {
        botStep(s.party.world, s.p.id, sm, s.ctx(), 50);
        s.go(50);
      }
      return s.inst.markHits;
    };
    expect(slammed('masher')).toBe(1);
    expect(slammed('careful')).toBe(0);
  });

  it('the careful bot holds its spender for three pips, uses its combo, and goes for the Besvärjare first', () => {
    const l = lab(['krigare'], { level: 2 });
    const mind = newMind('careful', () => 0.5);
    const pk = l.pack();
    const plain = l.place('skelett', 1.5, { pack: pk });
    const healer = l.place('skelett', 2.5, { pack: pk, role: 'healer' });
    healer.roleAt = NEVER;
    l.f.cd.raseri = NEVER;
    l.f.cd.virvelvind = NEVER;
    const spells: [string, number][] = [];
    for (let t = 0; t < 6000; t += 50) {
      const pips = l.f.pips;
      for (const c of botStep(l.party.world, l.p.id, mind, l.ctx(), 50)) if (c.t === 'spell' && c.by === l.p.id) spells.push([c.spell, pips]);
      l.go(50);
    }
    // it chose the Besvärjare, though the other one stands closer
    expect(l.f.target).toBe(healer.id);
    expect(healer.max - healer.hp).toBeGreaterThan((plain.max - plain.hp) * 3);
    const spends = spells.filter(([s]) => s === 'jattehugg');
    expect(spends.length).toBeGreaterThan(0);
    for (const [, pips] of spends) expect(pips).toBe(3);
    // Stormsteg right before the Jättehugg: the dazed monster takes double
    const i = spells.findIndex(([s]) => s === 'jattehugg');
    expect(spells[i - 1]?.[0]).toBe('stormsteg');
  });
});

describe('what the clients are told', () => {
  it('the snapshot carries pips per fighter and flags per fighting monster; the words are in sv.ts', () => {
    const l = lab(['vaktare']);
    l.mute();
    const m = l.place('skelett', 1.5);
    l.f.pips = 2;
    press(l, 'utmana');
    const snap = sagaSnapshot(l.party.world, l.party.now)![l.run.key]!;
    expect(snap.f[l.p.id]).toEqual([l.f.hp, l.f.max, 0, 3]);
    expect(snap.m[m.id]).toEqual([m.hp, m.max, MOB_FLAG.taunted]);
    expect(snap.c).toBeUndefined();
    expect(snap.o).toBeUndefined();
    expect(T.sagaOpen).toBe('Öppning!');
    expect(T.sagaOpenText).toMatch(/4/);
    expect(T.sagaTargetHint).toContain('av dig själv');
  });
});
