// The dungeons' monster families (mobs.ts) and the species picker of a run's packs (mobpacks.ts): six species a dungeon, each
// with a name, a sentence for the journal and an archetype; mates as strong as each other; packs that mix species without
// changing which slot a member fills; skins that never change a fight.
import { afterEach, describe, expect, it } from 'vitest';
import {
  ADD_KIN,
  DUNGEON_IDS,
  MOB_ARCHETYPE,
  MOB_FAMILIES,
  MOB_SKINNING,
  MOB_SKINS,
  MOB_TEXT,
  NEW_SAGA_MOBS,
  PACK_VARIETY,
  SAGA_MOBS,
  SPECIES_NAMES,
  buildStop,
  dungeonSpecies,
  generateRun,
  introducedAt,
  isIllusion,
  mobBase,
  mobKin,
  mobSkinOf,
  mobSkins,
  mobVariant,
  type DungeonId,
  type MobDungeon,
} from './index.ts';
import { makeParty, playRun } from './runplay.ts';

const packsOf = (seed: number, boss: DungeonId, level: 0 | 1 | 2 | 3 | 4 = 2): { row: number; packs: string[][] }[] =>
  generateRun(seed, { boss, level }).stops.map((z) => ({ row: z.row, packs: z.def.rooms.flatMap((r) => r.packs ?? []) }));

afterEach(() => {
  PACK_VARIETY.on = true;
  MOB_SKINNING.on = true;
});

describe('monster families', () => {
  for (const d of Object.keys(MOB_FAMILIES) as MobDungeon[]) {
    it(`${d}: six species, three originals and a mate for each, with numbers, a name, a journal sentence, an archetype and three skins`, () => {
      const fam = MOB_FAMILIES[d];
      expect(fam).toHaveLength(6);
      expect(new Set(fam.map((k) => k.species)).size).toBe(6);
      expect(fam.filter((k) => !k.mate)).toHaveLength(3);
      expect([...dungeonSpecies(d)].sort()).toEqual(fam.map((k) => k.species).sort());
      for (const k of fam) {
        const def = SAGA_MOBS[k.species]!;
        expect(def, k.species).toBeTruthy();
        expect(def.species).toBe(k.species);
        expect(SPECIES_NAMES[k.species]).toBe(def.name);
        expect(MOB_TEXT[k.species], `${k.species} has a journal sentence`).toMatch(/^[A-ZÅÄÖ].{15,90}\.$/);
        expect(MOB_ARCHETYPE[k.species]).toBe(k.archetype);
        // a shooter is what shoots (the sim: reach above 2.5)
        expect(def.reach > 2.5).toBe(k.archetype === 'shooter');
        expect(mobSkins(k.species)).toBeGreaterThanOrEqual(3);
        if (!k.mate) continue;
        // a mate is of its original's archetype and within 10 % of it in every number
        const o = SAGA_MOBS[k.mate]!;
        expect(fam.some((x) => x.species === k.mate && !x.mate)).toBe(true);
        expect(MOB_ARCHETYPE[k.mate]).toBe(k.archetype);
        expect(NEW_SAGA_MOBS[k.species]).toBe(def);
        for (const f of ['hp', 'dmg', 'atkMs', 'reach', 'speed', 'aggro'] as const) {
          expect(def[f] / o[f], `${k.species}.${f}`).toBeGreaterThanOrEqual(0.9);
          expect(def[f] / o[f], `${k.species}.${f}`).toBeLessThanOrEqual(1.1);
        }
        expect(!!def.slows).toBe(!!o.slows);
        expect(mobBase(k.species)).toBe(k.mate);
        expect(mobKin(k.mate)).toEqual([k.mate, k.species]);
      }
    });
  }

  it('every journal sentence belongs to a monster, and Bifrost draws its illusions from the new ones too', () => {
    expect(Object.keys(MOB_TEXT).sort()).toEqual(Object.keys(MOB_ARCHETYPE).sort());
    expect(Object.keys(MOB_ARCHETYPE)).toHaveLength(48);
    const loke = dungeonSpecies('loke');
    expect(loke).toHaveLength(8);
    expect(loke.filter((s) => NEW_SAGA_MOBS[s])).toHaveLength(4);
    let fresh = 0;
    for (let seed = 1; seed <= 10; seed++) for (const z of packsOf(seed, 'loke')) for (const pk of z.packs) for (const m of pk) if (NEW_SAGA_MOBS[m]) fresh++;
    expect(fresh).toBeGreaterThan(50);
    for (const s of ADD_KIN) expect(mobKin(s).length).toBe(2);
  });

  it('a variant is a skin and whether it is an illusion', () => {
    for (let skin = 0; skin < MOB_SKINS; skin++)
      for (const ill of [false, true]) {
        expect(mobSkinOf(mobVariant(skin, ill))).toBe(skin);
        expect(isIllusion(mobVariant(skin, ill))).toBe(ill);
      }
    expect(mobVariant(0, true)).toBe(1);
    expect(mobSkins('draugkung')).toBe(1);
    expect(mobSkins('isblock')).toBe(1);
  });
});

describe('the packs of a run', () => {
  it('are the same for the same seed, and keep every member in its slot: only the species within a slot is chosen', () => {
    for (let seed = 1; seed <= 27; seed++) {
      const boss = DUNGEON_IDS[seed % DUNGEON_IDS.length]!;
      const a = generateRun(seed, { boss, level: 2 });
      expect(generateRun(seed, { boss, level: 2 })).toEqual(a);
      PACK_VARIETY.on = false;
      const plain = generateRun(seed, { boss, level: 2 });
      PACK_VARIETY.on = true;
      // the same run in everything but the species; and each member is its slot's original or that one's mate
      const slots = (plan: typeof a): unknown => plan.stops.map((z) => ({ ...z, def: { ...z.def, rooms: z.def.rooms.map((r) => ({ ...r, ...(r.packs ? { packs: r.packs.map((pk) => pk.map(mobBase)) } : {}) })) } }));
      expect(slots(a)).toEqual(slots(plain));
      expect({ ...a, stops: 0 }).toEqual({ ...plain, stops: 0 });
      for (const z of plain.stops) for (const r of z.def.rooms) for (const pk of r.packs ?? []) for (const m of pk) expect(mobBase(m)).toBe(m);
    }
  });

  it('mix species: most packs hold two or three, none of four or more is one species unless it is a swarm, and a pack differs from the one before', () => {
    let packs = 0;
    let mixed = 0;
    let swarms = 0;
    let pairs = 0;
    let same = 0;
    let most = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 72; seed++) {
      const boss = DUNGEON_IDS[seed % DUNGEON_IDS.length]!;
      for (const z of packsOf(seed, boss)) {
        z.packs.forEach((pk, i) => {
          const kinds = new Set(pk);
          for (const m of pk) seen.add(m);
          packs++;
          most = Math.max(most, kinds.size);
          if (kinds.size >= 2) mixed++;
          if (pk.length >= 4 && kinds.size === 1) {
            swarms++;
            expect(MOB_ARCHETYPE[pk[0]!], `${boss} seed ${seed}: ${pk.join(' ')}`).toBe('swarmer');
          }
          if (i > 0) {
            pairs++;
            if ([...pk].sort().join() === [...z.packs[i - 1]!].sort().join()) same++;
          }
        });
      }
    }
    expect(packs).toBeGreaterThan(1500);
    expect(mixed / packs).toBeGreaterThan(0.85);
    expect(most).toBeLessThanOrEqual(4);
    expect(swarms / packs).toBeLessThan(0.03);
    expect(same / pairs).toBeLessThan(0.02);
    // every species of every dungeon turns up
    for (const d of DUNGEON_IDS) for (const s of dungeonSpecies(d)) expect(seen.has(s), s).toBe(true);
  });

  it('introduce the newcomers a stop at a time: the first stop never shows all six, and the first two rows show at most one and two of the pack fillers’ mates', () => {
    for (let seed = 1; seed <= 72; seed++) {
      const boss = DUNGEON_IDS[seed % DUNGEON_IDS.length]!;
      const stops = packsOf(seed, boss);
      const first = new Set(stops[0]!.packs.flat());
      expect(first.size).toBeLessThanOrEqual(4);
      expect(introducedAt(seed, 1, [...first]).size).toBe(1);
      for (const z of stops.filter((s) => s.row <= 2)) {
        // (a pack of four or more of one slot is split even so: the rule against one-species packs comes first)
        const fresh = new Set(z.packs.filter((pk) => new Set(pk.map(mobBase)).size > 1 || pk.length < 4).flat().filter((m) => NEW_SAGA_MOBS[m]));
        expect(fresh.size, `${boss} seed ${seed} row ${z.row}`).toBeLessThanOrEqual(z.row);
      }
    }
  });

  it('skins: three per species by the seed, two of a kind in a pack are not twins, and an illusion stays one', () => {
    const used: Record<string, Set<number>> = {};
    for (let seed = 1; seed <= 18; seed++) {
      const boss = DUNGEON_IDS[seed % DUNGEON_IDS.length]!;
      const plan = generateRun(seed, { boss, level: 2 });
      const z = plan.stops.find((s) => s.kind === 'flock')!;
      const w = buildStop(plan, z.node, 'saga:t');
      const again = buildStop(plan, z.node, 'saga:t');
      for (const pk of w.saga!.packs) {
        const got = pk.members.map((id) => ({ s: w.animals[id]!.species, v: w.animals[id]!.variant ?? 0 }));
        expect(pk.members.map((id) => again.animals[id]!.variant)).toEqual(got.map((g) => g.v));
        for (const g of got) {
          expect(isIllusion(g.v)).toBe(boss === 'loke');
          expect(mobSkinOf(g.v)).toBeLessThan(MOB_SKINS);
          (used[g.s] ??= new Set()).add(mobSkinOf(g.v));
        }
        // up to three of one species in a pack all look different
        for (const s of new Set(got.map((g) => g.s))) {
          const skins = got.filter((g) => g.s === s).map((g) => mobSkinOf(g.v));
          expect(new Set(skins).size).toBe(Math.min(MOB_SKINS, skins.length));
        }
      }
    }
    expect(Object.values(used).filter((u) => u.size === MOB_SKINS).length).toBeGreaterThan(20);
  });

  it('a skin never changes a fight: the same seed plays the same with and without skins', () => {
    const play = (): { ms: number; outcome: string; log: string } => {
      const party = makeParty(['krigare', 'helare'], { style: 'careful', seed: 3, level: 3 });
      const r = playRun(party, { seed: 3, level: 1, dungeon: 'draug' }, 150_000);
      const hp = party.players.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';');
      // (the run's id counts up through the test file: it is not part of the fight)
      return { ms: r.ms, outcome: r.outcome, log: hp + JSON.stringify(r.changes.filter((c) => c.t === 'hit' || c.t === 'run' || c.t === 'spell')).replace(/run\d+/g, 'run') };
    };
    const skinned = play();
    MOB_SKINNING.on = false;
    const plain = play();
    expect(skinned.log.length).toBeGreaterThan(2000);
    expect(skinned).toEqual(plain);
  });
});
