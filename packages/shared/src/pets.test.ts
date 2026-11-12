// Pets (pets.ts, petsim.ts): the table, every trick kind in a fight, scared and back, one pet on a run, drops without
// duplicates, and a pet that is not lost when the server stops.
import { describe, expect, it } from 'vitest';
import {
  ANIMALS,
  CLASSES,
  DUNGEONS,
  DUNGEON_IDS,
  PETS,
  PET_ANCHORS,
  PET_IDS,
  PET_LEVEL_MUL,
  PET_TRICK_KINDS,
  SAGA_ITEMS,
  SAGA_LOOT,
  SPECIES_NAMES,
  TILE,
  activePet,
  castSpell,
  fighterMax,
  generateWorld,
  giveClearPets,
  grantPet,
  mulberry32,
  ownedPetIds,
  petAnimalOf,
  petSeedBonus,
  petSoak,
  pickPet,
  placeIn,
  rollPetDrops,
  runOf,
  setOnline,
  spawnSagaMob,
  startRun,
  endRun,
  tick,
  togglePet,
  type AnimalState,
  type Change,
  type PlayerState,
  type SagaMob,
  type WorldState,
} from './index.ts';
import { makeParty } from './runplay.ts';

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

describe('the pets table', () => {
  it('has the first set: hund, katt, bjorn, varg, korp, rav, get and lodjur', () => {
    expect([...PET_IDS].sort()).toEqual(['bjorn', 'get', 'hund', 'katt', 'korp', 'lodjur', 'rav', 'varg']);
  });

  for (const id of PET_IDS) {
    it(`${id}: strings, a species with a name, a valid trick, sane numbers, anchors and a way to get it`, () => {
      const d = PETS[id]!;
      expect(d.id).toBe(id);
      for (const s of [d.name, d.blurb, d.trickText, d.howText, d.emoji]) expect(s.length).toBeGreaterThan(1);
      expect(['attack', 'heal', 'guard', 'utility']).toContain(d.role);
      expect(['common', 'rare', 'epic']).toContain(d.rarity);
      // the species exists as an animal that is a pet, and has a name for the labels
      expect(ANIMALS[d.species]?.pet).toBe(true);
      expect(SPECIES_NAMES[d.species]).toBeTruthy();
      // courage and the trick's numbers are small and positive: a pet is worth about a tenth of a hero
      expect(d.courage).toBeGreaterThanOrEqual(20);
      expect(d.courage).toBeLessThanOrEqual(200);
      expect(PET_TRICK_KINDS).toContain(d.trick.kind);
      const t = d.trick;
      const nums = Object.entries(t).filter(([k, v]) => k !== 'kind' && typeof v === 'number') as [string, number][];
      expect(nums.length).toBeGreaterThan(0);
      for (const [k, v] of nums) {
        expect(v, `${id}.${k}`).toBeGreaterThan(0);
        if (['dmg', 'first', 'heal'].includes(k)) expect(v, `${id}.${k}`).toBeLessThanOrEqual(40);
        if (['cd', 'roarCd', 'howlCd'].includes(k)) expect(v, `${id}.${k}`).toBeGreaterThanOrEqual(1000);
        if (['soak', 'seeds', 'bonus', 'buff', 'below'].includes(k)) expect(v, `${id}.${k}`).toBeLessThanOrEqual(1);
        if (k === 'range') expect(v, `${id}.${k}`).toBeLessThanOrEqual(10);
      }
      // the gear anchors: head, neck and back on both walk frames
      for (const a of PET_ANCHORS) {
        expect(d.anchors[a]).toHaveLength(2);
        for (const [x, y] of d.anchors[a]) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
        }
      }
      // how it is obtained: the kennel, a clear of a real dungeon, or a real boss's chest
      const s = d.source;
      if (s.kind === 'kennel') expect(['dog', 'cat']).toContain(d.species);
      if (s.kind === 'clear') expect(DUNGEON_IDS).toContain(s.dungeon);
      if (s.kind === 'drop') {
        expect(SAGA_LOOT[s.boss], `${id}: a chest for ${s.boss}`).toBeTruthy();
        expect(s.chance).toBeGreaterThan(0);
        expect(s.chance).toBeLessThan(1);
      }
      // pets that come from dungeons have a loot-window item
      if (s.kind !== 'kennel') expect(SAGA_ITEMS.some((i) => i.id === `petitem_${id}`)).toBe(true);
    });
  }

  it('each trick kind is used by at least one pet, and each kind of the type is implemented (one entry per kind in the table)', () => {
    const used = new Set(Object.values(PETS).map((d) => d.trick.kind));
    for (const k of PET_TRICK_KINDS) expect(used.has(k), k).toBe(true);
  });

  it('every role has a pet, and the kennel gives exactly hund and katt', () => {
    for (const r of ['attack', 'heal', 'guard', 'utility']) expect(Object.values(PETS).some((d) => d.role === r)).toBe(true);
    expect(Object.values(PETS).filter((d) => d.source.kind === 'kennel').map((d) => d.id).sort()).toEqual(['hund', 'katt']);
  });

  it('the hard levels get a smaller helper', () => {
    expect(PET_LEVEL_MUL[3]!).toBeLessThan(PET_LEVEL_MUL[2]!);
    expect(PET_LEVEL_MUL[4]!).toBeLessThan(PET_LEVEL_MUL[3]!);
  });
});

// ---------------------------------------------------------------------------
// Owning, dismissing and the animal that shows
// ---------------------------------------------------------------------------

function farmWith(pets: string[] = []): { world: WorldState; p: PlayerState; out: Change[] } {
  const party = makeParty(['krigare'], { seed: 3 });
  const p = party.players[0]!;
  const out: Change[] = [];
  for (const id of pets) grantPet(party.world, p, id, out, { quiet: true });
  return { world: party.world, p, out };
}
const petsOnMap = (w: WorldState, p: PlayerState): AnimalState[] => Object.values(w.animals).filter((a) => a.owner === p.id && !!a.petKind);

describe('owning pets', () => {
  it('the first pet comes along at once; the others are owned but stay away; there is one animal at most', () => {
    const { world, p } = farmWith(['bjorn', 'hund', 'katt']);
    expect(ownedPetIds(p)).toEqual(['bjorn', 'hund', 'katt']);
    expect(p.pets!.active).toBe('bjorn');
    const here = petsOnMap(world, p);
    expect(here).toHaveLength(1);
    expect(here[0]!.petKind).toBe('bjorn');
    expect(here[0]!.species).toBe('pet_bear');
    expect(here[0]!.name).toBe('Björn');
  });

  it('the one button: out = nowhere (neither helps nor blocks), in = next to its owner', () => {
    const { world, p } = farmWith(['hund']);
    expect(petsOnMap(world, p)).toHaveLength(1);
    togglePet(world, p.id);
    expect(p.pets!.out).toBe(true);
    expect(activePet(p)).toBeUndefined();
    expect(petsOnMap(world, p)).toHaveLength(0);
    togglePet(world, p.id);
    const a = petsOnMap(world, p);
    expect(a).toHaveLength(1);
    expect(Math.hypot(a[0]!.x - p.x, a[0]!.y - p.y)).toBeLessThan(TILE);
    // with no pet at all the button says so and changes nothing
    const lone = farmWith();
    expect(togglePet(lone.world, lone.p.id).some((c) => c.t === 'toast')).toBe(true);
  });

  it('a pet cannot be had twice, and a pet you do not own cannot be chosen', () => {
    const { world, p, out } = farmWith(['hund']);
    expect(grantPet(world, p, 'hund', out)).toBe(false);
    expect(grantPet(world, p, 'drake', out)).toBe(false);
    expect(pickPet(world, p.id, 'bjorn')).toEqual([]);
    expect(p.pets!.active).toBe('hund');
  });

  it('swapping pets: the new one is the only animal', () => {
    const { world, p } = farmWith(['hund', 'katt']);
    pickPet(world, p.id, 'katt');
    expect(petsOnMap(world, p).map((a) => a.petKind)).toEqual(['katt']);
    pickPet(world, p.id, 'hund');
    expect(petsOnMap(world, p).map((a) => a.petKind)).toEqual(['hund']);
  });

  it('naming a pet is kept with the player, and the name stays when the pet comes back', () => {
    const { world, p } = farmWith(['hund']);
    const a = petsOnMap(world, p)[0]!;
    // (the naming window's message)
    a.name = 'Sixten';
    p.pets!.owned.hund!.name = 'Sixten';
    togglePet(world, p.id);
    togglePet(world, p.id);
    expect(petsOnMap(world, p)[0]!.name).toBe('Sixten');
  });

  it('a pet that goes offline is gone from the maps, and is back when its owner is', () => {
    const { world, p } = farmWith(['hund']);
    setOnline(world, p.id, false);
    expect(petsOnMap(world, p)).toHaveLength(0);
    setOnline(world, p.id, true);
    expect(petsOnMap(world, p)).toHaveLength(1);
  });
});

describe('drops and gifts', () => {
  it('a boss chest gives a pet by chance, and a pet you have never drops again (duplicate protection)', () => {
    const { world, p } = farmWith();
    const out: Change[] = [];
    const boss = 'isbjorn';
    expect(rollPetDrops(world, p, boss, 1, () => 0, out)).toEqual(['petitem_bjorn']);
    expect(ownsIt(p, 'bjorn')).toBe(true);
    for (let i = 0; i < 20; i++) expect(rollPetDrops(world, p, boss, 1, () => 0, out)).toEqual([]);
    // a bad roll gives nothing; another boss gives its own pet
    const q = farmWith().p;
    expect(rollPetDrops(world, q, boss, 1, () => 0.99, out)).toEqual([]);
    expect(rollPetDrops(world, q, 'skoll', 1, () => 0, out)).toEqual(['petitem_varg']);
  });

  it('every pet that drops has a boss whose chest can give it', () => {
    for (const d of Object.values(PETS)) {
      if (d.source.kind !== 'drop') continue;
      const { p, world } = farmWith();
      expect(rollPetDrops(world, p, d.source.boss, 1, () => 0, [])).toContain(`petitem_${d.id}`);
    }
  });

  it('clearing the first dungeon gives the guaranteed pet, once', () => {
    const { world, p } = farmWith();
    const out: Change[] = [];
    giveClearPets(world, p, DUNGEON_IDS[0]!, out);
    expect(ownsIt(p, 'rav')).toBe(true);
    expect(out.some((c) => c.t === 'toast' && c.text.includes(DUNGEONS.draug.name))).toBe(true);
    const again: Change[] = [];
    giveClearPets(world, p, 'draug', again);
    expect(again.filter((c) => c.t === 'toast')).toHaveLength(0);
    // a later dungeon gives no pet of its own
    const q = farmWith().p;
    giveClearPets(world, q, 'frost', []);
    expect(ownedPetIds(q)).toEqual([]);
  });

  it('winning the first run (the party is cleared by runsim) gives the fox', () => {
    const party = makeParty(['krigare'], { seed: 3 });
    const p = party.players[0]!;
    expect(ownsIt(p, 'rav')).toBe(false);
    giveClearPets(party.world, p, 'draug', []);
    expect(ownsIt(p, 'rav')).toBe(true);
  });
});

const ownsIt = (p: PlayerState, id: string): boolean => !!p.pets?.owned[id];

// ---------------------------------------------------------------------------
// One pet on a run
// ---------------------------------------------------------------------------

describe('a run brings one pet', () => {
  it('a player who owns many pets has exactly one animal in the run, the chosen one, and it cannot be swapped mid-run', () => {
    const party = makeParty(['krigare'], { seed: 3 });
    const p = party.players[0]!;
    for (const id of ['hund', 'katt', 'bjorn', 'varg']) grantPet(party.world, p, id, [], { quiet: true });
    pickPet(party.world, p.id, 'katt');
    startRun(party.world, p.id, { seed: 3 }, party.ctx());
    const run = runOf(party.world)!;
    const area = party.world.areas![run.key]!;
    const pets = (w: WorldState) => Object.values(w.animals).filter((a) => a.owner === p.id && !!a.petKind);
    expect(pets(area).map((a) => a.petKind)).toEqual(['katt']);
    expect(pets(party.world)).toHaveLength(0);
    // a swap in the middle of a run is refused (a toast), the pet stays
    expect(pickPet(party.world, p.id, 'bjorn').some((c) => c.t === 'toast')).toBe(true);
    expect(p.pets!.active).toBe('katt');
    expect(pets(area)).toHaveLength(1);
    // dismissed in the run: nobody there; called in: next to the owner again
    togglePet(party.world, p.id);
    expect(pets(area)).toHaveLength(0);
    togglePet(party.world, p.id);
    expect(pets(area)).toHaveLength(1);
    // back home when the run is over, still one
    endRun(party.world, run, 'leave', party.ctx());
    expect(pets(party.world).map((a) => a.petKind)).toEqual(['katt']);
  });

  it('a pet is saved with its owner: the server stops in the middle of a run and the pet is not lost', () => {
    const party = makeParty(['krigare'], { seed: 3 });
    const p = party.players[0]!;
    for (const id of ['hund', 'bjorn']) grantPet(party.world, p, id, [], { quiet: true });
    p.pets!.owned.bjorn!.name = 'Bamse';
    pickPet(party.world, p.id, 'bjorn');
    startRun(party.world, p.id, { seed: 3 }, party.ctx());
    const run = runOf(party.world)!;
    expect(Object.values(party.world.areas![run.key]!.animals).some((a) => a.petKind === 'bjorn')).toBe(true);
    // what the database keeps: the farm's animals and every player (never the run's map). It comes back as JSON.
    const saved = JSON.parse(JSON.stringify({ players: party.world.players, animals: party.world.animals })) as { players: Record<string, PlayerState>; animals: Record<number, AnimalState> };
    const w2 = generateWorld(3);
    w2.players = saved.players;
    w2.animals = saved.animals;
    const q = w2.players[p.id]!;
    q.area = 'farm'; // (a run is never saved: the store puts its players home)
    q.online = false;
    expect(Object.values(w2.animals).some((a) => a.owner === p.id && a.petKind)).toBe(false);
    // the player comes back: the pet is made again on the farm, with its name; the other pet is still theirs
    setOnline(w2, q.id, true);
    expect(ownedPetIds(q).sort()).toEqual(['bjorn', 'hund']);
    const back = petAnimalOf(w2, q)!;
    expect(back.petKind).toBe('bjorn');
    expect(back.name).toBe('Bamse');
    expect(petsOnMap(w2, q)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// In a fight
// ---------------------------------------------------------------------------

/** A run's first stop with one krigare (and a friend) and the pet `pet` at their side; monsters are placed by hand. */
function lab(pet: string, opts: { level?: number; classes?: ('krigare' | 'helare')[] } = {}) {
  const party = makeParty(opts.classes ?? ['krigare', 'helare'], { seed: 3, pet: [pet] });
  startRun(party.world, party.players[0]!.id, { seed: 3, companion: false, ...(opts.level === undefined ? {} : { level: opts.level as 2 }) }, party.ctx());
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
  // (these tests are about the pet: the heroes' own auto-attacks are switched off; a test that wants a hero's blow clears `f.cd`)
  for (const ff of Object.values(inst.fighters)) ff.cd[CLASSES[ff.cls].auto] = Number.MAX_SAFE_INTEGER;
  const p = party.players[0]!;
  const q = party.players[1]!;
  const pa = (): AnimalState => Object.values(area.animals).find((a) => a.owner === p.id && a.petKind === pet)!;
  /** A monster in the fight, standing `dx` tiles from the hero (never pulled by itself: it is already fighting). */
  const place = (species: string, dx: number, kind: 'mob' | 'mini' | 'boss' = 'mob'): { animal: AnimalState; mob: SagaMob } => {
    const m = spawnSagaMob(area, inst, species, p.x + dx * TILE, p.y, kind, -1);
    const mob = inst.mobs[m.id]!;
    mob.state = 'fight';
    mob.threat[p.id] = 5;
    mob.atkAt = party.now + 1_000_000; // (it does not hit unless a test wants it to)
    return { animal: m, mob };
  };
  return { party, run, area, inst, p, q, f: inst.fighters[p.id]!, fq: inst.fighters[q.id]!, go, ctx, rnd, place, pa };
}

describe('pets in a fight', () => {
  it('bite (hund): hits the monster that is already fighting, and never one that is asleep', () => {
    const l = lab('hund');
    const idle = l.place('skelett', 9);
    idle.mob.state = 'idle';
    const { mob } = l.place('skelett', 2);
    const hp = mob.hp;
    const out = l.go(3000);
    expect(mob.hp).toBeLessThan(hp);
    expect(out.some((c) => c.t === 'spell' && c.spell === 'pet_bite')).toBe(true);
    // the pack asleep further away was never pulled by the pet
    expect(idle.mob.state).toBe('idle');
    expect(idle.mob.hp).toBe(idle.mob.max);
    // a bite is small: about a tenth of a hero (the dog's 6 a bite is not a hero's 20)
    const bites = out.filter((c) => c.t === 'hit' && c.on === mob.id).length;
    expect(bites).toBeLessThanOrEqual(3000 / (PETS.hund!.trick as { cd: number }).cd + 2);
  });

  it('purr (katt): heals the most hurt hero near it, on a cooldown', () => {
    const l = lab('katt');
    l.f.hp = l.f.max * 0.3;
    l.fq.hp = l.fq.max * 0.6;
    const before = l.f.hp;
    const out = l.go(1500);
    expect(l.f.hp).toBeGreaterThan(before);
    expect(out.some((c) => c.t === 'spell' && c.spell === 'pet_purr' && c.on === l.p.id)).toBe(true);
    const n = out.filter((c) => c.t === 'spell' && c.spell === 'pet_purr').length;
    l.go((PETS.katt!.trick as { cd: number }).cd * 3);
    expect(l.f.hp).toBeGreaterThan(before + (n ? 0 : 1));
    // a healthy party gets nothing
    const h = lab('katt');
    expect(h.go(6000).some((c) => c.t === 'spell' && c.spell === 'pet_purr')).toBe(false);
  });

  it('guard (bjorn): soaks a share of the hit on its owner, and a hero who stands far from it gets none of it', () => {
    const l = lab('bjorn');
    const a = l.pa();
    a.x = l.p.x;
    a.y = l.p.y;
    const out: Change[] = [];
    const taken = petSoak({ farm: l.party.world, area: l.area, inst: l.inst, key: l.run.key }, l.p, 20, l.party.now, out);
    expect(taken).toBeLessThan(20);
    expect(taken).toBeGreaterThanOrEqual(10);
    expect(out.some((c) => c.t === 'hit' && c.on === a.id && c.kind === 'block')).toBe(true);
    const far = petSoak({ farm: l.party.world, area: l.area, inst: l.inst, key: l.run.key }, { ...l.p, x: l.p.x + 9 * TILE } as PlayerState, 20, l.party.now, []);
    expect(far).toBe(20);
  });

  it('guard (bjorn): roars at a monster that is after a weak friend, so it comes for the owner instead', () => {
    const l = lab('bjorn');
    const { mob } = l.place('skelett', 2);
    mob.target = l.q.id;
    mob.threat[l.q.id] = 50;
    l.fq.hp = l.fq.max * 0.2;
    const out = l.go(600);
    expect(out.some((c) => c.t === 'spell' && c.spell === 'pet_roar')).toBe(true);
    expect(mob.tauntBy).toBe(l.p.id);
  });

  it('mark (korp): the marked monster takes more damage from everyone', () => {
    const l = lab('korp');
    const { mob } = l.place('skelett', 3);
    l.f.target = mob.id;
    const out = l.go(600);
    expect(out.some((c) => c.t === 'spell' && c.spell === 'pet_mark')).toBe(true);
    expect(mob.mark).toBeTruthy();
    // the same spell hits harder on the marked one (compare with the mark taken off)
    const hit = (): number => {
      l.f.cd = {};
      l.f.gcd = 0;
      const o = castSpell(l.party.world, l.p.id, 'yxhugg', mob.id, l.ctx());
      const h = o.find((c) => c.t === 'hit' && c.on === mob.id);
      return h && h.t === 'hit' ? h.n : 0;
    };
    l.p.x = l.area.animals[mob.id]!.x - TILE;
    l.p.y = l.area.animals[mob.id]!.y;
    const marked = hit();
    delete mob.mark;
    const plain = hit();
    expect(marked).toBeGreaterThan(plain);
    expect(marked / plain).toBeGreaterThan(1.1);
  });

  it('find (rav): adds a fraction to the sagafrön a run pays, while it is with its owner and not scared', () => {
    const l = lab('rav');
    l.p.pets!.owned.rav!.since = Date.now();
    expect(petSeedBonus(l.party.world, l.p, 2)).toBe(0); // (found a moment ago: not digging yet)
    l.p.pets!.owned.rav!.since -= 120_000;
    expect(petSeedBonus(l.party.world, l.p, 2)).toBeCloseTo(PETS.rav!.trick.kind === 'find' ? PETS.rav!.trick.seeds : 0);
    expect(petSeedBonus(l.party.world, l.p, 4)).toBeLessThan(petSeedBonus(l.party.world, l.p, 2));
    l.pa().pf!.st = 'scared';
    expect(petSeedBonus(l.party.world, l.p, 2)).toBe(0);
    l.pa().pf!.st = 'help';
    togglePet(l.party.world, l.p.id);
    expect(petSeedBonus(l.party.world, l.p, 2)).toBe(0);
    // a pet of another kind adds nothing
    const o = lab('hund');
    expect(petSeedBonus(o.party.world, o.p, 2)).toBe(0);
  });

  it('ram (get): hits one monster and stuns it, but a boss is only hurt', () => {
    const l = lab('get');
    const { mob } = l.place('skelett', 3);
    const out = l.go(2500);
    expect(out.some((c) => c.t === 'spell' && c.spell === 'pet_ram')).toBe(true);
    expect(mob.stunUntil).toBeTruthy();
    expect(mob.hp).toBeLessThan(mob.max);
    const b = lab('get');
    const boss = b.place('gravvaktare', 3, 'mini');
    b.go(2500);
    expect(boss.mob.stunUntil).toBeUndefined();
  });

  it('howl (varg): bites fast and the howl gives the whole party a short attack buff', () => {
    const l = lab('varg');
    const { mob } = l.place('skelett', 2);
    const out = l.go(4000);
    expect(out.some((c) => c.t === 'spell' && c.spell === 'pet_howl')).toBe(true);
    expect(mob.hp).toBeLessThan(mob.max);
    expect(l.f.howl).toBeTruthy();
    expect(l.fq.howl).toBeTruthy();
    // the buffed hero hits harder than before
    const dmg = (): number => {
      l.f.cd = {};
      l.f.gcd = 0;
      l.p.x = l.area.animals[mob.id]!.x - TILE;
      const o = castSpell(l.party.world, l.p.id, 'yxhugg', mob.id, l.ctx());
      const h = o.find((c) => c.t === 'hit' && c.on === mob.id);
      return h && h.t === 'hit' ? h.n : 0;
    };
    const buffed = dmg();
    delete l.f.howl;
    expect(buffed).toBeGreaterThan(dmg());
  });

  it('ambush (lodjur): hides when nothing is fighting, and the first hit of a fight is the big one', () => {
    const l = lab('lodjur');
    const t = PETS.lodjur!.trick;
    if (t.kind !== 'ambush') throw new Error('not an ambush');
    l.go(t.hideMs + 1000);
    expect(l.pa().pf!.st).toBe('hidden');
    const { mob } = l.place('skelett', 2);
    const out = l.go(1500);
    const first = out.find((c) => c.t === 'hit' && c.on === mob.id);
    expect(first && first.t === 'hit' && first.n).toBeGreaterThanOrEqual(t.first * 0.9);
    expect(out.some((c) => c.t === 'spell' && c.spell === 'pet_pounce')).toBe(true);
    expect(l.pa().pf!.st).toBe('help');
    // after it, the bites are small
    const later = out.filter((c) => c.t === 'hit' && c.on === mob.id).slice(1);
    for (const c of later) if (c.t === 'hit') expect(c.n).toBeLessThan(t.first / 2);
  });

  it('scared: a pet that has taken too much runs to its owner, is out for some seconds and comes back; it never dies or hurts', () => {
    const l = lab('bjorn');
    const a = l.pa();
    a.x = l.p.x + 3 * TILE;
    a.y = l.p.y;
    const id = a.id;
    const out: Change[] = [];
    const h = { farm: l.party.world, area: l.area, inst: l.inst, key: l.run.key };
    for (let i = 0; i < 40 && l.pa().pf!.st !== 'scared'; i++) petSoak(h, l.p, 40, l.party.now, out);
    expect(l.pa().pf!.st).toBe('scared');
    expect(l.pa().pf!.courage).toBeLessThanOrEqual(0);
    expect(out.some((c) => c.t === 'toast' && c.text.includes('rädd'))).toBe(true);
    // scared: it does nothing, runs to its owner and cowers there
    const { mob } = l.place('skelett', 2);
    const hp = mob.hp;
    l.go(3000);
    expect(l.pa().id).toBe(id); // (the same animal: nothing killed it)
    expect(Math.hypot(l.pa().x - l.p.x, l.pa().y - l.p.y)).toBeLessThan(2.5 * TILE);
    expect(l.pa().pf!.st).toBe('scared');
    expect(mob.hp).toBe(hp);
    // after the pause it is back, and braver than it was at zero
    l.go(7000);
    expect(l.pa().pf!.st).toBe('help');
    expect(l.pa().pf!.courage).toBeGreaterThan(20);
  });

  it('a pet never walks off into the monsters: it keeps within a few tiles of its owner', () => {
    const l = lab('hund');
    l.place('skelett', 14); // a monster far away that is fighting (it could never reach it)
    l.go(4000);
    expect(Math.hypot(l.pa().x - l.p.x, l.pa().y - l.p.y) / TILE).toBeLessThan(8);
  });

  it('a pet waits beside its owner and not in a doorway', () => {
    const l = lab('katt');
    const door = l.inst.start;
    l.p.x = door.x * TILE + TILE / 2 + TILE;
    l.p.y = door.y * TILE + TILE / 2;
    l.p.facing = 'right';
    l.go(3000);
    const a = l.pa();
    expect(Math.hypot(a.x - (door.x * TILE + TILE / 2), a.y - (door.y * TILE + TILE / 2))).toBeGreaterThan(1.2 * TILE);
  });

  it('a pet helps less on the hard levels (Svår, Extrem)', () => {
    const bites = (level: number): number => {
      const l = lab('hund', { level });
      const { mob } = l.place('skelett', 2);
      mob.max = mob.hp = 100000;
      l.go(6000);
      return mob.max - mob.hp;
    };
    expect(bites(3)).toBeLessThan(bites(2));
    expect(bites(4)).toBeLessThanOrEqual(bites(3)); // (a bite is never under 1-2 damage, so the two hardest can tie)
    expect(PET_LEVEL_MUL[4]!).toBeLessThan(PET_LEVEL_MUL[3]!);
  });

  it('the pet shows as an animal with a state the HUD can read, and that state is sent when it changes', () => {
    const l = lab('lodjur');
    expect(l.pa().pf!.st).toBe('hidden');
    l.place('skelett', 2);
    const out = l.go(1500);
    expect(out.some((c) => c.t === 'animal' && c.animal?.petKind === 'lodjur' && c.animal.pf?.st === 'help')).toBe(true);
  });

  it('fighterMax is untouched by a pet (it only helps in the fight)', () => {
    const l = lab('bjorn');
    expect(l.f.max).toBe(fighterMax(l.p, 'krigare'));
  });
});

void mulberry32;
void placeIn;
