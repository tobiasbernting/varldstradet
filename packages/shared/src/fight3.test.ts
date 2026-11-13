// Six rules from Valheim (DESIGN.md 5.9): Stjärnmonster, Bosskrafter and the horn, Gillet, Svagheter, Perfekt block and Nära ögat,
// and the Händelse Skogen rör sig.
import { describe, expect, it } from 'vitest';
import {
  AMBUSH,
  AMBUSH_EVENT,
  BOSS_POWERS,
  CLASSES,
  DISHES,
  DISH_NAMES,
  DISH_TEXT,
  DUNGEONS,
  DUNGEON_IDS,
  DUNGEON_WEAK,
  ELEMENTS,
  EVENTS,
  EVENT_CHOICES,
  EVENT_NAMES,
  GILLET,
  NEAR_MS,
  PARRY_MS,
  PARRY_OPEN_MS,
  POWER_NAMES,
  POWER_TEXT,
  RUN_LEVELS,
  SAGA_BOSSES,
  SPECIES_WEAK,
  STAR,
  STAR_CHANCE,
  TILE,
  WEAK_BONUS,
  blowHorn,
  buffsOf,
  castSpell,
  dishOffer,
  generateRun,
  heroElement,
  nextDishes,
  ownedPowers,
  pickEvent,
  runMessage,
  runOf,
  sagaSnapshot,
  setRunPref,
  spawnSagaMob,
  startRun,
  tick,
  voteEvent,
  weakOf,
  type Change,
  type ClassId,
  type DungeonId,
  type PlayerState,
  type RunLevel,
  type SagaMob,
} from './index.ts';
import { makeParty, step } from './runplay.ts';
import { botStep, newMind, enterStop } from './index.ts';

const NEVER = Number.MAX_SAFE_INTEGER;

function lab(classes: ClassId[], opts: { level?: RunLevel; companion?: boolean; before?: (players: PlayerState[]) => void; seed?: number; dungeon?: DungeonId } = {}) {
  const party = makeParty(classes, { seed: opts.seed ?? 3 });
  for (const p of party.players) {
    delete p.runPrefs;
    p.saga!.cleared = [...DUNGEON_IDS];
  }
  opts.before?.(party.players);
  startRun(party.world, party.players[0]!.id, { seed: opts.seed ?? 3, companion: opts.companion ?? false, ...(opts.level === undefined ? {} : { level: opts.level }), ...(opts.dungeon ? { dungeon: opts.dungeon } : {}) }, party.ctx());
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
  const place = (species: string, dx: number, o: { kind?: SagaMob['kind']; stars?: 1 | 2; dy?: number; idle?: boolean } = {}): SagaMob => {
    const a = spawnSagaMob(area, inst, species, p.x + dx * TILE, p.y + (o.dy ?? 0) * TILE, o.kind ?? 'mob', -1, null, o.stars ?? 0);
    const m = inst.mobs[a.id]!;
    m.dunkAt = NEVER;
    if (!o.idle) {
      m.hp = m.max = 100_000;
      m.state = 'fight';
      m.threat[p.id] = 5;
      m.atkAt = NEVER;
    }
    return m;
  };
  const mute = (): void => {
    for (const ff of Object.values(inst.fighters)) ff.cd[CLASSES[ff.cls].auto] = NEVER;
  };
  const strong = (): void => {
    for (const id of Object.keys(inst.fighters)) inst.run!.buffs[id] = { ...buffsOf({ power: 19 }), ...(inst.run!.buffs[id]?.element ? { element: inst.run!.buffs[id]!.element! } : {}) };
  };
  const q = party.players[1];
  return { party, run, area, inst, p, f: inst.fighters[p.id]!, q, fq: q ? inst.fighters[q.id] : undefined, go, ctx, rnd, place, mute, strong };
}
type Lab = ReturnType<typeof lab>;
const hitsOn = (out: Change[], id: number | string): number[] => out.flatMap((c) => (c.t === 'hit' && c.on === id && (c.kind === 'dmg' || c.kind === 'crit') ? [c.n] : []));
const press = (l: Lab, spell: string, target?: number | string, pips?: number): Change[] => {
  delete l.f.cd[spell];
  l.f.gcd = 0;
  if (pips !== undefined) l.f.pips = pips;
  return castSpell(l.party.world, l.p.id, spell, target, l.ctx());
};

describe('F1 Stjärnmonster', () => {
  it('the dice: none on Mycket lätt, never in the first stop, at most one a pack, never a member with a role; the same seed gives the same stars', () => {
    expect([0, 1, 2, 3, 4].map((lv) => [...STAR_CHANCE[lv as RunLevel]])).toEqual([[0, 0], [0.1, 0], [0.18, 0.04], [0.25, 0.08], [0.25, 0.08]]);
    const count = (level: RunLevel) => {
      let packs = 0;
      const stars = [0, 0, 0];
      for (let seed = 1; seed <= 30; seed++) {
        const plan = generateRun(seed, { boss: 'draug', level });
        expect(JSON.stringify(generateRun(seed, { boss: 'draug', level }).stops.map((s) => s.def.rooms.map((r) => r.stars)))).toBe(JSON.stringify(plan.stops.map((s) => s.def.rooms.map((r) => r.stars))));
        for (const stop of plan.stops)
          for (const r of stop.def.rooms)
            (r.packs ?? []).forEach((members, pi) => {
              const row = r.stars?.[pi] ?? [];
              const starred = row.filter((x) => x > 0);
              expect(starred.length).toBeLessThanOrEqual(1);
              if (stop.row === 1) expect(starred.length).toBe(0);
              else packs++;
              row.forEach((x, i) => {
                if (x) {
                  expect(r.roles?.[pi]?.[i] ?? null).toBeNull();
                  stars[x]!++;
                }
              });
              void members;
            });
      }
      return { one: stars[1]! / packs, two: stars[2]! / packs };
    };
    expect(count(0)).toEqual({ one: 0, two: 0 });
    expect(count(1).two).toBe(0);
    expect(count(1).one).toBeGreaterThan(0.05);
    expect(count(1).one).toBeLessThan(0.16);
    const medel = count(2);
    expect(medel.one).toBeGreaterThan(0.12);
    expect(medel.one).toBeLessThan(0.24);
    expect(medel.two).toBeGreaterThan(0.01);
    expect(medel.two).toBeLessThan(0.08);
    // the stars do not move what the seed built before them
    const packs = (level: RunLevel) => JSON.stringify(generateRun(9, { boss: 'draug', level, modifiers: [] }).stops.map((s) => s.def.rooms.map((r) => [r.packs, r.roles])));
    expect(packs(3)).toBe(packs(4));
  });

  it('a starred monster has the stars on its animal and in its name, more health and harder blows; when it falls it pays and drops a Kraftklot', () => {
    expect(STAR).toEqual({ 1: { hp: 1.6, blows: 1.25, size: 1.15, silver: 6, seeds: 1 }, 2: { hp: 2.4, blows: 1.5, size: 1.3, silver: 15, seeds: 3 } });
    const l = lab(['magiker', 'helare'], { level: 2 });
    l.mute();
    const plain = l.place('gravrotta', 3, { idle: true });
    const star = l.place('gravrotta', 3, { idle: true, stars: 2, dy: 3 });
    expect(l.area.animals[star.id]).toMatchObject({ stars: 2, name: 'Gravråtta ★★' });
    press(l, 'isspjut', plain.id);
    press(l, 'isspjut', star.id);
    expect(star.max / plain.max).toBeCloseTo(STAR[2].hp, 1);
    // its blow
    const blow = (m: SagaMob): number => {
      l.f.hp = l.f.max;
      const a = l.area.animals[m.id]!;
      a.x = l.p.x + TILE;
      a.y = l.p.y;
      m.threat = { [l.p.id]: 99 };
      m.stunUntil = 0;
      m.slowUntil = 0;
      m.atkAt = 0;
      l.go(100);
      m.atkAt = NEVER;
      a.x += 6 * TILE;
      return l.f.max - l.f.hp;
    };
    l.inst.run!.dmgMul = 20;
    const b1 = blow(plain);
    expect(blow(star) / b1).toBeCloseTo(STAR[2].blows, 1);
    // it falls: silver, sagafrön, an orb
    const purse = l.run.purse;
    star.hp = 1;
    l.area.animals[star.id]!.x = l.p.x + 4 * TILE;
    press(l, 'isspjut', star.id);
    expect(l.inst.zones.some((z) => z.kind === 'orb')).toBe(true);
    l.go(100);
    expect(l.run.purse - purse).toBe(STAR[2].silver);
    expect(l.inst.starsDown).toEqual([2]);
  });
});

describe('F2 Bosskrafter and the horn', () => {
  const withTrophies = (ids: DungeonId[]) => (players: PlayerState[]) => {
    for (const pl of players) pl.trophies = Object.fromEntries(ids.map((d) => [DUNGEONS[d].boss, 2]));
  };
  it('every boss has a power with a name, a picture and a sentence with a number; a hero owns those whose trophy they have, and brings the latest unless they choose', () => {
    for (const d of DUNGEON_IDS) {
      expect(BOSS_POWERS[d].icon.length).toBeGreaterThan(0);
      expect(POWER_NAMES[d]!.length).toBeGreaterThan(3);
      expect(POWER_TEXT[d]).toMatch(/\d/);
    }
    const none = lab(['krigare']);
    expect(ownedPowers(none.p)).toEqual([]);
    expect(none.run.powers).toEqual({});
    const latest = lab(['krigare'], { before: withTrophies(['draug', 'surt']) });
    expect(ownedPowers(latest.p)).toEqual(['draug', 'surt']);
    expect(latest.run.powers[latest.p.id]).toBe('surt');
    const chosen = lab(['krigare'], { before: (ps) => {
      withTrophies(['draug', 'surt'])(ps);
      ps[0]!.runPrefs = { power: 'draug' };
    } });
    expect(chosen.run.powers[chosen.p.id]).toBe('draug');
    const no = lab(['krigare'], { before: (ps) => {
      withTrophies(['draug'])(ps);
      ps[0]!.runPrefs = { power: null };
    } });
    expect(no.run.powers).toEqual({});
    // the arch's message: a power without its trophy is refused
    const l = lab(['krigare'], { before: withTrophies(['draug']) });
    expect(setRunPref(l.party.world, l.p.id, 'power', 'loke', l.ctx()).some((c) => c.t === 'toast')).toBe(true);
    runMessage(l.party.world, l.p.id, { t: 'run', a: 'power', id: 'draug' }, l.ctx());
    expect(l.p.runPrefs?.power).toBe('draug');
  });

  it('one charge a stop for the whole party: whoever blows uses THEIR power; the Hirdmannen never; it is in the run snapshot and refills in the next fight stop', () => {
    const l = lab(['krigare', 'magiker'], { before: (ps) => {
      ps[0]!.trophies = { [DUNGEONS.draug.boss]: 0 };
      ps[1]!.trophies = { [DUNGEONS.frost.boss]: 0 };
    } });
    l.mute();
    const m = l.place('skelett', 2);
    expect(l.run.powers).toEqual({ [l.p.id]: 'draug', [l.q!.id]: 'frost' });
    expect(l.run.horn).toBe(true);
    const out = blowHorn(l.party.world, l.q!.id, l.ctx());
    expect(out.some((c) => c.t === 'spell' && c.spell === 'power_frost')).toBe(true);
    expect(m.slowUntil).toBe(l.party.now + BOSS_POWERS.frost.ms);
    expect(m.slowBy).toBe(l.q!.id);
    expect(m.stunUntil ?? 0).toBeLessThanOrEqual(l.party.now);
    expect(l.run.horn).toBe(false);
    const snap = out.filter((c) => c.t === 'run' && c.ev === 'state' && c.run).pop();
    expect(snap && snap.t === 'run' && snap.ev === 'state' ? [snap.run!.horn, snap.run!.powers[l.p.id]] : null).toEqual([false, 'draug']);
    // spent: the other hero cannot blow it now
    expect(blowHorn(l.party.world, l.p.id, l.ctx()).every((c) => c.t === 'toast')).toBe(true);
    expect(m.stunUntil ?? 0).toBeLessThanOrEqual(l.party.now);
    // the hired Hirdmannen has none
    const solo = lab(['krigare'], { companion: true, before: withTrophies(['draug']) });
    const c = Object.values(solo.area.players).find((x) => x.bot)!;
    expect(solo.run.powers[c.id]).toBeUndefined();
    expect(blowHorn(solo.party.world, c.id, solo.ctx())).toEqual([]);
    expect(solo.run.horn).toBe(true);
  });

  for (const power of DUNGEON_IDS) {
    it(`${POWER_NAMES[power]}: does what its sentence says`, () => {
      const l = lab(['krigare', 'helare'], { before: withTrophies([power]) });
      l.mute();
      const near = l.place('gravrotta', 2);
      const far = l.place('gravrotta', 2, { dy: 7 });
      const P = BOSS_POWERS[power];
      const now = l.party.now;
      if (power === 'hel') {
        l.fq!.hp = 0;
        l.fq!.down = now;
      }
      if (power === 'loke') l.f.pips = 0;
      const x0 = l.area.animals[near.id]!.x;
      expect(blowHorn(l.party.world, l.p.id, l.ctx()).some((c) => c.t === 'spell' && c.spell === `power_${power}`)).toBe(true);
      if (power === 'draug') {
        expect(near.stunUntil).toBe(now + 3000);
        expect(far.stunUntil ?? 0).toBeLessThanOrEqual(now);
      } else if (power === 'frost') expect([near.slowUntil, far.slowUntil ?? 0]).toEqual([now + 5000, 0]);
      else if (power === 'surt') {
        const hp = near.hp;
        l.go(P.ms + 1100);
        expect(hp - near.hp).toBeGreaterThan((P.amount ?? 0) * 0.85);
        expect(hp - near.hp).toBeLessThan((P.amount ?? 0) * 1.5); // (a rat is weak to nothing that burns here; a little more with the crypt's weakness)
        expect(far.hp).toBe(far.max);
      } else if (power === 'hel') {
        expect(l.fq!.down).toBeUndefined();
        expect(l.fq!.hp).toBe(Math.round(l.fq!.max * 0.5));
      } else if (power === 'dvarg') {
        for (const f of [l.f, l.fq!]) expect(f.shield).toMatchObject({ hp: f.max * 0.35, until: now + 8000 });
      } else if (power === 'orm') {
        expect((l.area.animals[near.id]!.x - x0) / TILE).toBeGreaterThan(1.5); // (as far as the floor goes: the wall is near)
        expect(near.slowUntil).toBe(now + 4000);
      } else if (power === 'alv') {
        near.atkAt = 0;
        const a = l.area.animals[near.id]!;
        a.x = l.p.x + TILE;
        const hp = l.f.hp;
        l.go(4500);
        expect(l.f.hp).toBe(hp);
        expect(Math.abs(a.x - (l.p.x + TILE))).toBeLessThan(1);
        l.go(1000);
        expect(l.f.hp).toBeLessThan(hp);
      } else if (power === 'fenrir') {
        for (const f of [l.f, l.fq!]) expect(f.howl).toEqual({ until: now + 8000, mul: 0.3 });
        expect(l.p.boostUntil).toBe(now + 8000);
      } else if (power === 'loke') expect([l.f.pips, l.fq!.pips]).toEqual([3, 3]);
    });
  }
});

describe('F3 Gillet', () => {
  it('five dishes with a name, a picture and a sentence with a number; three are served by the run’s seed; no pick is the first; the Hirdmannen eats nothing', () => {
    GILLET.on = true;
    expect(DISHES.map((d) => d.id)).toEqual(['kottgryta', 'honungskaka', 'barsaft', 'roktfisk', 'mjodbrod']);
    for (const d of DISHES) {
      expect(d.icon.length).toBeGreaterThan(0);
      expect(DISH_NAMES[d.id]!.length).toBeGreaterThan(3);
      expect(DISH_TEXT[d.id]).toMatch(/\d/);
    }
    for (const seed of [1, 2, 3, 4, 5]) {
      const offer = dishOffer(seed);
      expect(new Set(offer).size).toBe(3);
      expect(dishOffer(seed)).toEqual(offer);
    }
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => dishOffer(s).join())).size).toBeGreaterThan(2);
    const l = lab(['krigare'], { companion: true, seed: 5 });
    const c = Object.values(l.area.players).find((x) => x.bot)!;
    expect(l.run.dishes).toEqual({ [l.p.id]: dishOffer(5)[0] });
    expect(l.run.dishes[c.id]).toBeUndefined();
    // the arch: the dishes of the next run are told, a dish that is not served is refused, a served one is kept and eaten
    const w = makeParty(['krigare'], { seed: 4 });
    const pl = w.players[0]!;
    delete pl.runPrefs;
    const offer = nextDishes(w.world, w.ctx());
    const told = runMessage(w.world, pl.id, { t: 'run', a: 'state' }, w.ctx()).find((ch) => ch.t === 'run' && ch.ev === 'gillet');
    expect(told && told.t === 'run' && told.ev === 'gillet' ? told.dishes : null).toEqual(offer);
    const other = DISHES.map((d) => d.id).find((id) => !offer.includes(id))!;
    expect(runMessage(w.world, pl.id, { t: 'run', a: 'dish', id: other }, w.ctx()).some((ch) => ch.t === 'toast')).toBe(true);
    runMessage(w.world, pl.id, { t: 'run', a: 'dish', id: offer[2]! }, w.ctx());
    startRun(w.world, pl.id, { companion: false }, w.ctx());
    expect(runOf(w.world)!.dishes[pl.id]).toBe(offer[2]);
    expect(dishOffer(runOf(w.world)!.seed)).toEqual(offer);
    GILLET.on = false;
  });

  it('each dish does what it says', () => {
    GILLET.on = true;
    const eat = (dish: string) => {
      const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((s) => dishOffer(s).includes(dish))!;
      return lab(['krigare'], { seed, before: (ps) => (ps[0]!.runPrefs = { dish }) });
    };
    const base = (() => {
      GILLET.on = false;
      const l = lab(['krigare']);
      GILLET.on = true;
      return l;
    })();
    const potions = (l: Lab): number => l.p.inventory.reduce((n, s) => n + (s?.item === 'healing_potion' ? s.count : 0), 0);
    expect(eat('kottgryta').f.max).toBe(Math.round(base.f.max * 1.12));
    expect(potions(eat('barsaft')) - potions(base)).toBe(1);
    expect(eat('barsaft').inst.run!.buffs[eat('barsaft').p.id]!.potion).toBeCloseTo(0.3);
    expect(eat('roktfisk').p.runSpeed).toBe(0.08);
    expect(eat('mjodbrod').inst.run!.buffs[eat('mjodbrod').p.id]!.cd).toBeCloseTo(0.06);
    const honey = eat('honungskaka');
    honey.mute();
    expect(honey.f.pips).toBe(0);
    honey.place('gravrotta', 3);
    honey.go(100);
    expect(honey.f.pips).toBe(1);
    expect(base.f.pips).toBe(0);
    GILLET.on = false;
  });
});

describe('F4 Svagheter', () => {
  it('every dungeon has one weak element and one family with another; a mate has its original’s', () => {
    expect(DUNGEON_WEAK).toEqual({ draug: 'eld', frost: 'eld', surt: 'is', hel: 'aska', dvarg: 'aska', orm: 'aska', alv: 'eld', fenrir: 'eld', loke: 'is' });
    for (const [species, e] of Object.entries(SPECIES_WEAK)) expect(ELEMENTS).toContain(e), expect(species.length).toBeGreaterThan(3);
    expect(weakOf('skelett', 'draug')).toBe('eld');
    expect(weakOf('gravrotta', 'draug')).toBe('is');
    expect(weakOf('fladdermoss', 'draug')).toBe('is');
    expect(weakOf('draugkung', 'draug')).toBe('eld');
    expect(WEAK_BONUS).toBe(0.25);
  });

  it('a hit of the weak element does 25 % more and is flagged; nothing is ever worse; a hero with two runor of a tag colours all their plain hits', () => {
    const l = lab(['magiker']);
    l.mute();
    l.strong();
    const skel = l.place('skelett', 3);
    const rat = l.place('gravrotta', 3, { dy: 2 });
    const cast = (spell: string, m: SagaMob) => {
      const out = press(l, spell, m.id, 1);
      const h = out.find((c) => c.t === 'hit' && c.on === m.id && c.kind === 'dmg');
      return h && h.t === 'hit' ? { n: h.n, weak: !!h.weak } : { n: 0, weak: false };
    };
    // Eldboll is fire: the skeleton is weak to it, the rat is not
    const fireSkel = cast('eldboll', skel);
    const fireRat = cast('eldboll', rat);
    expect(fireSkel.weak).toBe(true);
    expect(fireRat.weak).toBe(false);
    expect(fireSkel.n / fireRat.n).toBeCloseTo(1 + WEAK_BONUS, 1);
    // Isspjut is ice: the rat is weak to it
    expect([cast('isspjut', rat).weak, cast('isspjut', skel).weak]).toEqual([true, false]);
    // Runsmäll has no element of its own: plain, until the hero holds two fire runor
    const plain = cast('runsmall', skel);
    expect(plain.weak).toBe(false);
    expect(heroElement([{ id: 'm_eld', up: 0 }], [])).toBeUndefined();
    expect(heroElement([{ id: 'm_eld', up: 0 }, { id: 'm_glod', up: 0 }], [])).toBe('eld');
    expect(heroElement([{ id: 'm_is', up: 0 }, { id: 'm_skal', up: 0 }, { id: 'm_eld', up: 0 }], [])).toBe('is');
    l.inst.run!.buffs[l.p.id]!.element = 'eld';
    const fiery = cast('runsmall', skel);
    expect(fiery.weak).toBe(true);
    expect(fiery.n / plain.n).toBeCloseTo(1 + WEAK_BONUS, 1);
    // a path gives single spells its element
    l.inst.run!.buffs[l.p.id]!.elements = { eldboll: 'is' };
    expect(cast('eldboll', skel).weak).toBe(false);
    expect(cast('eldboll', rat).weak).toBe(true);
  });

  it('the run snapshot names the dungeon’s weakness and an offer marks the cards of that tag; the offer itself is not leaned', () => {
    const l = lab(['magiker']);
    const st = runMessage(l.party.world, l.p.id, { t: 'run', a: 'state' }, l.ctx()).find((c) => c.t === 'run' && c.ev === 'state');
    expect(st && st.t === 'run' && st.ev === 'state' ? st.run!.weak : null).toBe('eld');
    l.run.phase = 'pick';
    l.run.offers[l.p.id] = { cards: ['m_eld', 'm_is', 'm_stormen'], source: 'flock' };
    const offer = runMessage(l.party.world, l.p.id, { t: 'run', a: 'state' }, l.ctx()).find((c) => c.t === 'run' && c.ev === 'offer');
    expect(offer && offer.t === 'run' && offer.ev === 'offer' ? offer.offer!.weak : null).toEqual([true, false, true]);
  });
});

describe('F5 Perfekt block and Nära ögat', () => {
  it('a Väktare who raises Sköldmur at most 0.6 s before a blow lands takes nothing, opens the attacker for 3 s and has full pips; later it is an ordinary Sköldmur', () => {
    expect([PARRY_MS, PARRY_OPEN_MS, NEAR_MS]).toEqual([600, 3000, 500]);
    const blow = (wait: number) => {
      const l = lab(['vaktare']);
      l.mute();
      const m = l.place('skelett', 1.2);
      l.inst.run!.dmgMul = 20;
      l.f.pips = 0;
      press(l, 'skoldmur');
      l.f.hp = l.f.max;
      l.go(wait);
      m.atkAt = 0;
      const out = l.go(100);
      return { l, m, out };
    };
    const good = blow(300);
    expect(good.l.f.hp).toBe(good.l.f.max);
    expect(good.out.some((c) => c.t === 'hit' && c.on === good.l.p.id && c.kind === 'parry')).toBe(true);
    expect(good.m.open).toBeGreaterThan(good.l.party.now + PARRY_OPEN_MS - 200);
    expect(good.l.f.pips).toBe(3);
    // only the one hit
    good.m.atkAt = 0;
    good.l.go(100);
    expect(good.l.f.hp).toBeLessThan(good.l.f.max);
    const late = blow(900);
    expect(late.l.f.hp).toBeLessThan(late.l.f.max);
    expect(late.out.some((c) => c.t === 'hit' && c.kind === 'parry')).toBe(false);
    expect(late.out.some((c) => c.t === 'hit' && c.on === late.l.p.id && c.kind === 'block')).toBe(true);
    expect(late.m.open).toBeUndefined();
  });

  it('a mark is parried too, and the boss is open', () => {
    const l = lab(['vaktare'], { level: 2 });
    l.mute();
    const m = l.place('gravvaktare', 1.5, { kind: 'boss' });
    m.phase = 0;
    m.next = SAGA_BOSSES.gravvaktare!.moves.map((_, k) => (k === 0 ? l.party.now : Infinity));
    l.go(100);
    const warn = SAGA_BOSSES.gravvaktare!.moves[0]!.warn;
    l.go(warn - 500);
    press(l, 'skoldmur');
    l.f.hp = l.f.max;
    const out = l.go(500);
    expect(l.f.hp).toBe(l.f.max);
    expect(out.some((c) => c.t === 'hit' && c.kind === 'parry')).toBe(true);
    expect(m.open).toBeDefined();
    expect(l.inst.markHits).toBe(0);
  });

  it('Nära ögat: a hero who was in a mark during its warning and leaves it in the last half second gets a pip, once; one who left early or never stood in it gets none', () => {
    const leave = (before: number | null) => {
      const l = lab(['krigare', 'helare'], { level: 2 });
      l.mute();
      const m = l.place('gravvaktare', 1.5, { kind: 'boss' });
      m.phase = 0;
      m.threat = { [l.p.id]: 99 };
      m.next = SAGA_BOSSES.gravvaktare!.moves.map((_, k) => (k === 0 ? l.party.now : Infinity));
      l.q!.x = l.p.x + 9 * TILE;
      l.go(100);
      const warn = SAGA_BOSSES.gravvaktare!.moves[0]!.warn - 100;
      l.f.pips = 0;
      if (before === null) return { l, out: l.go(warn + 100) };
      l.go(warn - before);
      l.p.x += 6 * TILE;
      return { l, out: l.go(before + 100) };
    };
    const close = leave(300);
    expect(close.out.filter((c) => c.t === 'hit' && c.kind === 'near' && c.on === close.l.p.id)).toHaveLength(1);
    expect(close.l.f.pips).toBe(1);
    expect(close.l.inst.markHits).toBe(0);
    expect(close.out.some((c) => c.t === 'hit' && c.kind === 'near' && c.on === close.l.q!.id)).toBe(false);
    const early = leave(1000);
    expect(early.out.some((c) => c.t === 'hit' && c.kind === 'near')).toBe(false);
    expect(early.l.f.pips).toBe(0);
    const hit = leave(null);
    expect(hit.out.some((c) => c.t === 'hit' && c.kind === 'near')).toBe(false);
    expect(hit.l.inst.markHits).toBe(1);
  });
});

describe('F6 Skogen rör sig', () => {
  it('is not one of the ten quiet events: a choice to fight (crossed swords) and a free one; it comes by dice of its own, so the other events of a seed do not move', () => {
    expect(EVENTS.some((e) => e.id === 'bakhall')).toBe(false);
    expect(AMBUSH_EVENT.choices.map((c) => [c.id, c.icon, c.cost ?? 0])).toEqual([['forsvara', '⚔️', 0], ['gom', '🤫', 0]]);
    expect(EVENT_NAMES.bakhall).toBe('Skogen rör sig');
    expect(EVENT_CHOICES.bakhall!.forsvara![1]).toMatch(/3/);
    let ambushes = 0;
    for (let seed = 1; seed <= 400; seed++) if (pickEvent(seed, 3, []) === 'bakhall') ambushes++;
    expect(ambushes).toBeGreaterThan(400 * AMBUSH.chance * 0.5);
    expect(ambushes).toBeLessThan(400 * AMBUSH.chance * 1.6);
    expect(pickEvent(7, 3, ['bakhall'])).not.toBe('bakhall');
  });

  const atEvent = (level: RunLevel, choice: number) => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((sd) => generateRun(sd, { boss: 'draug', level }).route.nodes.some((n) => n.kind === 'event'))!;
    const l = lab(['krigare', 'helare'], { level, seed, dungeon: 'draug' });
    const node = l.run.plan.route.nodes.find((n) => n.kind === 'event')!;
    return import('./index.ts').then(({ enterStop }) => {
      enterStop(l.party.world, l.run, node.id, l.ctx());
      const area = l.party.world.areas![l.run.key]!;
      const inst = area.saga!;
      l.run.phase = 'event';
      l.run.event = { id: 'bakhall', votes: {}, until: l.run.elapsed + 60_000 };
      for (const pl of l.party.players) voteEvent(l.party.world, pl.id, choice, l.ctx());
      return { ...l, area, inst };
    });
  };

  it('hiding pays 5 hacksilver and nobody fights', async () => {
    const l = await atEvent(2, 1);
    expect(l.run.ambush).toBeUndefined();
    expect(l.run.purse).toBe(5);
    expect(Object.keys(l.inst.mobs)).toHaveLength(0);
  });

  it('defending: three waves walk in from the edge, the next when the last is down or after 20 s; then a sällsynt party runa, 25 hacksilver and a Runmärke', async () => {
    const l = await atEvent(2, 0);
    expect(l.run.ambush).toMatchObject({ wave: 0, count: 3 });
    expect(l.run.horn).toBe(true);
    const out: Change[] = [];
    const waveMobs = (): SagaMob[] => l.run.ambush!.mobs.map((id) => l.inst.mobs[id]!).filter(Boolean);
    out.push(...l.go(3200));
    expect(l.run.ambush!.wave).toBe(1);
    const first = waveMobs();
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(first.length).toBeLessThanOrEqual(4);
    for (const m of first) expect(m.state).toBe('fight');
    const snap = out.filter((c) => c.t === 'run' && c.ev === 'state' && c.run).pop();
    expect(snap && snap.t === 'run' && snap.ev === 'state' ? snap.run!.ambush : null).toEqual({ wave: 1, count: 3 });
    // 20 s later the second comes though the first still stands
    for (const f of Object.values(l.inst.fighters)) f.max = f.hp = 1_000_000;
    l.go(AMBUSH.everyMs);
    expect(l.run.ambush!.wave).toBe(2);
    // all down: the third at once, then the reward
    const kill = (): void => {
      for (const m of Object.values(l.inst.mobs)) {
        delete l.inst.mobs[m.id];
        delete l.area.animals[m.id];
      }
    };
    kill();
    l.go(200);
    expect(l.run.ambush!.wave).toBe(3);
    const purse = l.run.purse;
    const runor = l.run.runor.length;
    kill();
    const end = l.go(200);
    expect(l.run.ambush).toBeUndefined();
    expect(l.run.purse - purse).toBeGreaterThanOrEqual(AMBUSH.silver);
    expect(l.run.runor.length).toBe(runor + 1);
    expect(l.run.medals[l.run.node]).toBeGreaterThanOrEqual(1);
    expect(l.run.phase).toBe('route');
    expect(end.some((c) => c.t === 'banner' && c.kind === 'cleared')).toBe(true);
  });

  it('on Mycket lätt the waves are two monsters each, with no special and no starred ones', async () => {
    const l = await atEvent(0, 0);
    for (let w = 1; w <= 3; w++) {
      l.go(w === 1 ? 3200 : 200);
      const mobs = l.run.ambush!.mobs.map((id) => l.inst.mobs[id]!);
      expect(mobs).toHaveLength(2);
      for (const m of mobs) expect([m.role, m.stars]).toEqual([undefined, undefined]);
      for (const m of mobs) {
        delete l.inst.mobs[m.id];
        delete l.area.animals[m.id];
      }
    }
  });
});

describe('the bots and the new rules', () => {
  const trophy = (players: PlayerState[]): void => {
    for (const pl of players) pl.trophies = { [DUNGEONS.draug.boss]: 2 };
  };
  it('the horn: the masher blows it as soon as it fights; the careful bot keeps it for a boss’s new phase or the stop’s last pack; the Hirdmannen never', () => {
    const scene = () => {
      const l = lab(['krigare'], { before: trophy, companion: true });
      l.mute();
      l.place('gravrotta', 1.5);
      return l;
    };
    const m = scene();
    botStep(m.party.world, m.p.id, newMind('masher', () => 0.5), m.ctx(), 50);
    expect(m.run.horn).toBe(false);
    const c = scene();
    const mind = newMind('careful', () => 0.5);
    botStep(c.party.world, c.p.id, mind, c.ctx(), 50);
    expect(c.run.horn).toBe(true);
    // the companion's own brain runs in the tick: the horn stays
    c.go(500);
    expect(c.run.horn).toBe(true);
    // a boss enters a new phase
    const boss = c.place('gravvaktare', 2, { kind: 'mini' });
    boss.phase = 0;
    boss.next = SAGA_BOSSES.gravvaktare!.moves.map(() => Infinity);
    botStep(c.party.world, c.p.id, mind, c.ctx(), 50);
    expect(c.run.horn).toBe(true);
    boss.phase = 1;
    botStep(c.party.world, c.p.id, mind, c.ctx(), 50);
    expect(c.run.horn).toBe(false);
    // the last pack of the stop
    const last = scene();
    for (const pk of last.inst.packs) pk.dead = true;
    botStep(last.party.world, last.p.id, newMind('careful', () => 0.5), last.ctx(), 50);
    expect(last.run.horn).toBe(false);
  });

  it('the careful Väktare stays in a boss’s sweep and raises Sköldmur just before it lands: a Perfekt block', () => {
    const l = lab(['vaktare'], { level: 2 });
    l.mute();
    const m = l.place('draugkung', 1.5, { kind: 'boss' });
    m.phase = 0;
    m.threat = { [l.p.id]: 99 };
    m.next = SAGA_BOSSES.draugkung!.moves.map((mv, k) => (k === 0 ? l.party.now : Infinity));
    l.f.cd.utmana = l.f.cd.skoldslag = NEVER;
    const mind = newMind('careful', () => 0.5);
    const out: Change[] = [];
    for (let t = 0; t < SAGA_BOSSES.draugkung!.moves[0]!.warn + 300; t += 50) {
      out.push(...botStep(l.party.world, l.p.id, mind, l.ctx(), 50));
      out.push(...l.go(50));
    }
    expect(out.some((c) => c.t === 'spell' && c.by === l.p.id && c.spell === 'skoldmur')).toBe(true);
    expect(out.some((c) => c.t === 'hit' && c.on === l.p.id && c.kind === 'parry')).toBe(true);
    expect(l.inst.markHits).toBe(0);
    expect(m.open).toBeDefined();
  });

  const atAmbush = (style: 'careful' | 'masher' | 'adult', hurt: boolean) => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((sd) => generateRun(sd, { boss: 'draug', level: 2 }).route.nodes.some((n) => n.kind === 'event'))!;
    const party = makeParty(['krigare'], { seed, style });
    startRun(party.world, party.players[0]!.id, { seed, level: 2, dungeon: 'draug' }, party.ctx());
    const run = runOf(party.world)!;
    enterStop(party.world, run, run.plan.route.nodes.find((n) => n.kind === 'event')!.id, party.ctx());
    for (let i = 0; i < 4; i++) step(party, false, []);
    run.phase = 'event';
    run.event = { id: 'bakhall', votes: {}, until: run.elapsed + 60_000 };
    const inst = party.world.areas![run.key]!.saga!;
    if (hurt) for (const f of Object.values(inst.fighters)) f.hp = Math.round(f.max * 0.5);
    step(party, true, []);
    return { party, run, inst };
  };
  it('the vote on Skogen rör sig: the masher fights; the careful and the adult fight when everyone is above 70 % health, else they hide', () => {
    expect(atAmbush('masher', true).run.ambush).toBeDefined();
    expect(atAmbush('careful', false).run.ambush).toBeDefined();
    expect(atAmbush('adult', false).run.ambush).toBeDefined();
    const hid = atAmbush('careful', true);
    expect(hid.run.ambush).toBeUndefined();
    expect(hid.run.purse).toBe(5);
  });

  it('a wipe in the ambush: the Sagoande gets the party up, the wave waits at the edge and comes again, and the fight can still be won', () => {
    const { party, run, inst } = atAmbush('careful', false);
    const area = party.world.areas![run.key]!;
    for (let t = 0; t < 3300; t += 50) step(party, false, []);
    expect(run.ambush!.wave).toBe(1);
    const p = party.players[0]!;
    const f = inst.fighters[p.id]!;
    f.hp = 0;
    f.down = party.now;
    for (let t = 0; t < 4500; t += 50) step(party, false, []);
    expect(f.down).toBeUndefined();
    expect(run.spirit).toBe(0);
    expect(run.phase).toBe('stop');
    expect(run.ambush).toBeDefined();
    // the wave is awake again (it went home and was called back)
    for (let t = 0; t < 4000; t += 50) step(party, false, []);
    expect(run.ambush!.mobs.some((id) => inst.mobs[id]?.state === 'fight')).toBe(true);
    // and the careful bot wins it from here (a big health bar: this is about the flow, not the fight)
    for (const ff of Object.values(inst.fighters)) ff.max = ff.hp = 100_000;
    for (let t = 0; t < 240_000 && run.ambush; t += 50) step(party, true, []);
    expect(run.ambush).toBeUndefined();
    expect(run.phase).toBe('route');
    void area;
  });
});
