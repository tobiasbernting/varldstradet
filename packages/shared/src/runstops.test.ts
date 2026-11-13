// Hacksilver, the Köpman, the Händelser, the Skatt and the Stark vakt (DESIGN.md 2.5 and 3.4): the purse, each kind of stop, every event's outcomes,
// the prices, who may spend and the leftover that turns into sagafrön.
import { describe, expect, it } from 'vitest';
import {
  EVENTS,
  EVENT_CHOICES,
  EVENT_NAMES,
  EVENT_TEXT,
  ELITE_HP,
  RUNOR,
  RUN_LEVELS,
  SHOP_LEGENDARY_ROW,
  SHOP_PRICE,
  SHOP_POTIONS,
  SILVER,
  SILVER_PER_SEED,
  TREASURE_PACKS,
  buyItem,
  defaultChoice,
  endRun,
  enterStop,
  eventDef,
  generateRun,
  packSilver,
  pickEvent,
  readRun,
  rarityIndex,
  runOf,
  runPickMs,
  runa,
  seedsFromSilver,
  startRun,
  voteEvent,
  countItem,
  type ClassId,
  type NodeKind,
  type PlayerState,
  type RunLevel,
} from './index.ts';
import { makeParty, step, type Party } from './runplay.ts';

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

/** A run whose party stands in the first stop of `kind` that the route has at or after `minRow` (the seed is searched for). */
function atKind(kind: NodeKind, o: { level?: RunLevel; classes?: ClassId[]; minRow?: number; maxRow?: number } = {}): { party: Party; run: NonNullable<ReturnType<typeof runOf>>; node: number; row: number } {
  const level = o.level ?? 1;
  const classes = o.classes ?? ['krigare', 'magiker'];
  for (let seed = 1; seed < 400; seed++) {
    const n = generateRun(seed, { boss: 'draug', level }).route.nodes.find((x) => x.kind === kind && x.row >= (o.minRow ?? 1) && x.row <= (o.maxRow ?? 10));
    if (!n) continue;
    const party = makeParty(classes, { seed, level: 3 });
    startRun(party.world, party.players[0]!.id, { seed, level, companion: false }, party.ctx());
    const run = runOf(party.world)!;
    enterStop(party.world, run, n.id, party.ctx());
    for (let i = 0; i < 6; i++) step(party, false, []);
    return { party, run, node: n.id, row: n.row };
  }
  throw new Error(`no seed with a ${kind}`);
}

const potions = (p: PlayerState): number => countItem(p.inventory, 'healing_potion');

describe('Hacksilver (Färdkassan)', () => {
  it('a pack pays 3 to 6 silver by its size, a Stark vakt 12 and a Skatt 20 on top, the Mellanboss 40; the purse starts empty', () => {
    expect([packSilver(1), packSilver(4), packSilver(5), packSilver(9)]).toEqual([3, 4, 5, 6]);
    expect(SILVER).toMatchObject({ elite: 12, treasure: 20, mini: 40 });
    const party = makeParty(['krigare', 'magiker'], { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6, companion: false }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.purse).toBe(0);
    const packs = party.world.areas![run.key]!.saga!.packs;
    clearStop(party);
    expect(run.purse).toBe(packs.reduce((s, pk) => s + packSilver(pk.members.length), 0) + 8); // (and 8 for the gold Runmärke: nobody was hit, nothing healed, in no time)
    expect(run.purse).toBeGreaterThan(0);
  });

  it('one purse for the whole party: every member sees the same number in the state', () => {
    const { party, run } = atKind('shop');
    run.purse = 77;
    const out: import('./index.ts').Change[] = [];
    step(party, false, out);
    buyItem(party.world, party.players[0]!.id, { item: 'potion' }, party.ctx());
    expect(run.purse).toBe(77 - SHOP_PRICE.potion);
  });

  it('leftover silver turns into sagafrön when the run ends (one for every 12, rounded down), whatever the end', () => {
    expect(SILVER_PER_SEED).toBe(12);
    expect([0, 11, 12, 25, 120].map(seedsFromSilver)).toEqual([0, 0, 1, 2, 10]);
    const party = makeParty(['krigare', 'magiker'], { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6, companion: false }, party.ctx());
    const run = runOf(party.world)!;
    const before = party.players.map((p) => readRun(p).seeds);
    run.purse = 61;
    const out = endRun(party.world, run, 'leave', party.ctx());
    party.players.forEach((p, i) => expect(readRun(p).seeds).toBe(before[i]! + 5));
    expect(out.some((c) => c.t === 'run' && c.ev === 'ended' && c.silver === 61)).toBe(true);
    expect(run.purse).toBe(0);
  });
});

describe('the Köpman', () => {
  it('is a camp with no monsters; he sells each hero three runor of their own class (the legendary one only past row 4), a gemensam runa, potions', () => {
    const { party, run, row } = atKind('shop', { level: 2, minRow: 6 });
    expect(party.world.areas![run.key]!.saga!.packs.every((pk) => pk.members.length === 0 || pk.dead)).toBe(true);
    expect(row).toBeGreaterThan(SHOP_LEGENDARY_ROW);
    const shop = run.shop!;
    for (const p of party.players) {
      const slots = shop.slots[p.id]!;
      expect(slots.length).toBeGreaterThanOrEqual(2);
      for (const s of slots) expect(runa(s.id)!.cls).toBe(p.saga!.cls);
      expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
    }
    expect(shop.party).toBeTruthy();
    expect(runa(shop.party!.id)!.cls).toBeUndefined();
    expect(shop.potions).toBe(SHOP_POTIONS);
    const early = atKind('shop', { level: 2, maxRow: SHOP_LEGENDARY_ROW });
    for (const xs of Object.values(early.run.shop!.slots)) expect(xs.every((s) => s.rarity !== 'legendarisk')).toBe(true);
  });

  it('prices are fixed and rise with rarity; a runa bought is held at once, the purse pays, and a second tap on it does nothing', () => {
    expect(SHOP_PRICE.runa.vanlig).toBeLessThan(SHOP_PRICE.runa.ovanlig);
    expect(SHOP_PRICE.runa.ovanlig).toBeLessThan(SHOP_PRICE.runa.sallsynt);
    expect(SHOP_PRICE.runa.sallsynt).toBeLessThan(SHOP_PRICE.runa.legendarisk);
    const { party, run } = atKind('shop');
    const a = party.players[0]!;
    run.purse = 500;
    const slot = run.shop!.slots[a.id]![0]!;
    buyItem(party.world, a.id, { item: 'runa', slot: 0 }, party.ctx());
    expect(run.hold[a.id]).toEqual([{ id: slot.id, up: 0 }]);
    expect(run.purse).toBe(500 - SHOP_PRICE.runa[slot.rarity]);
    expect(slot.bought).toBe(true);
    expect(buyItem(party.world, a.id, { item: 'runa', slot: 0 }, party.ctx())).toEqual([]);
    expect(run.hold[a.id]).toHaveLength(1);
    // the partner's runa is the partner's: the other hero's slot is theirs to buy, from the same purse
    const b = party.players[1]!;
    buyItem(party.world, b.id, { item: 'runa', slot: 1 }, party.ctx());
    expect(run.hold[b.id]).toHaveLength(1);
    expect(run.hold[a.id]).toHaveLength(1);
  });

  it('too poor: nothing is bought and nothing is lost; anyone in the party may spend the shared purse', () => {
    const { party, run } = atKind('shop');
    const a = party.players[0]!;
    run.purse = SHOP_PRICE.potion - 1;
    const had = potions(a);
    const out = buyItem(party.world, a.id, { item: 'potion' }, party.ctx());
    expect(out.some((c) => c.t === 'toast')).toBe(true);
    expect(run.purse).toBe(SHOP_PRICE.potion - 1);
    expect(potions(a)).toBe(had);
    run.purse = SHOP_PRICE.potion;
    buyItem(party.world, party.players[1]!.id, { item: 'potion' }, party.ctx());
    expect(run.purse).toBe(0);
    expect(potions(party.players[1]!)).toBeGreaterThan(0);
  });

  it('potions run out after three, the gemensam runa helps the whole party, a Sagoande is for sale only on the levels that have them, skärpa costs 50', () => {
    const { party, run } = atKind('shop', { level: 1 });
    const a = party.players[0]!;
    run.purse = 1000;
    for (let i = 0; i < SHOP_POTIONS + 2; i++) buyItem(party.world, a.id, { item: 'potion' }, party.ctx());
    expect(run.shop!.potions).toBe(0);
    expect(run.purse).toBe(1000 - SHOP_POTIONS * SHOP_PRICE.potion);
    const id = run.shop!.party!.id;
    buyItem(party.world, a.id, { item: 'party' }, party.ctx());
    expect(run.runor).toContain(id);
    expect(run.purse).toBe(1000 - SHOP_POTIONS * SHOP_PRICE.potion - SHOP_PRICE.party);
    const spirit = run.spirit;
    expect(RUN_LEVELS[1].spiritMax).toBeGreaterThan(0);
    run.spirit = 0;
    buyItem(party.world, a.id, { item: 'spirit' }, party.ctx());
    expect(run.spirit).toBe(1);
    expect(run.spirit).not.toBe(spirit + 5);
    // a runa to sharpen
    run.hold[a.id] = [{ id: RUNOR.find((r) => r.cls === a.saga!.cls && r.rarity === 'vanlig')!.id, up: 0 }];
    const before = run.purse;
    buyItem(party.world, a.id, { item: 'sharpen', id: run.hold[a.id]![0]!.id }, party.ctx());
    expect(run.hold[a.id]![0]!.up).toBe(1);
    expect(run.purse).toBe(before - SHOP_PRICE.sharpen);
    // Medel and up have no Sagoandar to buy
    const hard = atKind('shop', { level: 2 });
    hard.run.purse = 1000;
    expect(buyItem(hard.party.world, hard.party.players[0]!.id, { item: 'spirit' }, hard.party.ctx())).toEqual([]);
    expect(hard.run.purse).toBe(1000);
  });

  it('nothing can be bought away from the Köpman', () => {
    const party = makeParty(['krigare'], { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6, companion: false }, party.ctx());
    const run = runOf(party.world)!;
    run.purse = 500;
    expect(buyItem(party.world, party.players[0]!.id, { item: 'potion' }, party.ctx()).every((c) => c.t === 'toast')).toBe(true);
    expect(run.purse).toBe(500);
  });
});

describe('the Skatt and the Stark vakt', () => {
  it('a Stark vakt has tougher monsters, pays 12 silver and opens a better offer (source stark); a Skatt pays 20 and offers from the Skatt weights', () => {
    for (const [kind, silver, source] of [
      ['elite', SILVER.elite, 'stark'],
      ['treasure', SILVER.treasure, 'skatt'],
    ] as const) {
      const { party, run } = atKind(kind, { level: 2, minRow: 3 });
      const z = run.plan.stops[run.node]!;
      if (kind === 'elite') expect(z.hpMul).toBeGreaterThan(ELITE_HP);
      const inst = party.world.areas![run.key]!.saga!;
      const packs = inst.packs.reduce((s, pk) => s + packSilver(pk.members.length), 0);
      expect(inst.packs.length).toBeGreaterThan(0);
      clearStop(party);
      expect(run.phase).toBe('pick');
      expect(run.purse).toBe(packs + silver + 8);
      for (const p of party.players) expect(run.offers[p.id]!.source).toBe(source);
    }
    expect(TREASURE_PACKS.size[0]).toBeGreaterThan(0);
  });

  it('a Stark vakt is never in the first two rows and never on the two easiest levels; every route keeps a Köpman', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const level of [0, 1, 2, 3, 4] as const) {
        const nodes = generateRun(seed, { boss: 'draug', level }).route.nodes;
        for (const n of nodes) if (n.kind === 'elite') {
          expect(n.row).toBeGreaterThanOrEqual(3);
          expect(level).toBeGreaterThanOrEqual(2);
        }
        expect(nodes.some((n) => n.kind === 'shop')).toBe(true);
      }
    }
  });
});

describe('the Händelser', () => {
  it('about ten, each with a story and two or three choices, every one with a free choice, and nothing in them takes health, a runa or progress', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(10);
    for (const e of EVENTS) {
      expect(EVENT_NAMES[e.id], e.id).toBeTruthy();
      expect(EVENT_TEXT[e.id], e.id).toBeTruthy();
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
      expect(e.choices.length).toBeLessThanOrEqual(3);
      expect(e.choices.some((c) => !(c.cost ?? 0)), `${e.id} has a free choice`).toBe(true);
      expect(e.choices[defaultChoice(e)]!.cost ?? 0).toBe(0);
      for (const c of e.choices) {
        expect(EVENT_CHOICES[e.id]?.[c.id], `${e.id}/${c.id} has its words`).toBeTruthy();
        expect(c.outcome.length).toBeGreaterThan(0);
        for (const o of c.outcome) {
          if ('silver' in o) expect(o.silver).toBeGreaterThan(0);
          if ('heal' in o) expect(o.heal).toBeGreaterThan(0);
          if ('potions' in o) expect(o.potions).toBeGreaterThan(0);
          if ('effect' in o) for (const v of Object.values(o.effect)) if (typeof v === 'number') expect(v).toBeGreaterThan(0);
        }
      }
    }
  });

  it('the Händelse of a stop is drawn from the seed, never one already met until all have been', () => {
    const met: string[] = [];
    for (let i = 0; i < EVENTS.length; i++) {
      const id = pickEvent(9, i, met);
      expect(met).not.toContain(id);
      met.push(id);
    }
    expect(new Set(met).size).toBe(EVENTS.length);
    expect(pickEvent(9, 3, [])).toBe(pickEvent(9, 3, []));
    expect(eventDef(pickEvent(9, 3, met))).toBeTruthy();
  });

  /** The party at an event, the event swapped for `id`, with `silver` in the purse. */
  function atEvent(id: string, silver: number): ReturnType<typeof atKind> {
    const at = atKind('event', { level: 1 });
    expect(at.run.phase).toBe('event');
    at.run.event!.id = id;
    at.run.purse = silver;
    return at;
  }

  for (const ev of EVENTS) {
    ev.choices.forEach((choice, index) => {
      it(`${ev.id} / ${choice.id}: its outcome happens, the cost is paid in silver and the run goes on to the way on`, () => {
        const { party, run } = atEvent(ev.id, 100);
        const inst = party.world.areas![run.key]!.saga!;
        const a = party.players[0]!;
        const fa = inst.fighters[a.id]!;
        fa.hp = Math.round(fa.max * 0.4);
        const hp0 = fa.hp;
        const pot0 = potions(a);
        const spirit0 = run.spirit;
        run.hold[a.id] = [{ id: RUNOR.find((r) => r.cls === a.saga!.cls && r.rarity === 'vanlig')!.id, up: 0 }];
        const held0 = run.hold[a.id]!.length;
        const party0 = run.runor.length;
        const power0 = run.blessed.power ?? 0;
        // everyone votes for this choice
        for (const p of party.players) voteEvent(party.world, p.id, index, party.ctx());
        const after = run.phase;
        expect(['route', 'pick'], `${ev.id}/${choice.id}`).toContain(after);
        let silver = 100 - (choice.cost ?? 0);
        for (const o of choice.outcome) {
          if ('silver' in o) silver += o.silver;
          if ('party' in o) {
            expect(run.runor.length).toBe(party0 + 1);
            const got = runa(run.runor.at(-1)!)!;
            expect(got.cls).toBeUndefined();
            expect(rarityIndex(got.rarity)).toBeGreaterThanOrEqual(rarityIndex(o.party) - 0);
            if (o.tags) expect(got.tags.some((t) => o.tags!.includes(t))).toBe(true);
          }
          if ('heal' in o) expect(fa.hp).toBeGreaterThan(hp0);
          if ('potions' in o) expect(potions(a)).toBe(pot0 + o.potions);
          if ('effect' in o) {
            const key = Object.keys(o.effect)[0] as 'power' | 'cd' | 'armor' | 'hp';
            if (key === 'power') expect(run.blessed.power).toBeCloseTo(power0 + o.effect.power!);
            else expect(run.blessed[key] ?? 0).toBeGreaterThan(0);
          }
          if ('sharpen' in o) expect(run.hold[a.id]![0]!.up).toBe(1);
          if ('cards' in o) {
            expect(after).toBe('pick');
            expect(run.offers[a.id]!.source).toBe(o.cards);
          }
          if ('spirit' in o) expect(run.spirit).toBe(Math.min(5, spirit0 + o.spirit));
        }
        expect(run.purse).toBe(silver);
        expect(run.hold[a.id]!.length).toBe(held0);
        expect(fa.hp).toBeGreaterThanOrEqual(hp0);
        if (after === 'route') expect(run.vote).toBeTruthy();
      });
    });
  }

  it('a choice the purse cannot pay is refused (no one is punished: the vote stays open), and a clock that runs out takes the free choice', () => {
    const { party, run } = (() => {
      const at = atKind('event', { level: 1 });
      at.run.event!.id = 'brunn';
      at.run.purse = 5;
      return at;
    })();
    const a = party.players[0]!;
    const out = voteEvent(party.world, a.id, 1, party.ctx());
    expect(out.some((c) => c.t === 'toast')).toBe(true);
    expect(run.event!.votes[a.id]).toBeUndefined();
    expect(run.phase).toBe('event');
    for (let t = 0; t < runPickMs(1) + 400; t += 50) step(party, false, []);
    expect(run.phase).toBe('route');
    expect(run.purse).toBe(5 + 5);
  });

  it('the party votes: the strict majority ends it, and a tie goes to the first voter', () => {
    const at = atKind('event', { level: 1, classes: ['krigare', 'magiker', 'vaktare'] });
    at.run.event!.id = 'ande';
    const [a, b, c] = at.party.players as [PlayerState, PlayerState, PlayerState];
    voteEvent(at.party.world, a.id, 0, at.party.ctx());
    expect(at.run.phase).toBe('event');
    voteEvent(at.party.world, b.id, 1, at.party.ctx());
    expect(at.run.phase).toBe('event');
    voteEvent(at.party.world, c.id, 1, at.party.ctx());
    expect(at.run.phase).toBe('route');
    expect(at.run.blessed.hp ?? 0).toBeGreaterThan(0);
  });
});
