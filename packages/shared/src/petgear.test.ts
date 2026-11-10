// Pet gear (looks.ts: PET_LOOK_SETS, petsim.ts): earned by clearing a dungeon with a pet along, any difficulty, with duplicate protection;
// worn by any pet kind at its anchors; saved with the player; and a pet or a piece added later needs only its table entry.
import { describe, expect, it } from 'vitest';
import {
  DUNGEON_IDS,
  LOOK_TEXT,
  LOOK_TIER_MAX,
  PETS,
  PET_ANCHORS,
  PET_IDS,
  PET_LOOK_PIECES,
  PET_LOOK_SETS,
  ALL_PIECES,
  awardPetLooks,
  decodeLook,
  devPetGear,
  equipPetLook,
  generateWorld,
  grantPet,
  isPetPiece,
  lookPiece,
  petAnimalOf,
  petGearTier,
  petSetsOf,
  petWearOf,
  setOnline,
  stripPet,
  togglePet,
  type Change,
  type PlayerState,
  type WorldState,
} from './index.ts';
import { makeParty } from './runplay.ts';

function farmWith(pets: string[] = ['hund']): { world: WorldState; p: PlayerState } {
  const party = makeParty(['krigare'], { seed: 3 });
  const p = party.players[0]!;
  for (const id of pets) grantPet(party.world, p, id, [], { quiet: true });
  return { world: party.world, p };
}

describe('the pet gear table', () => {
  it('has 10 to 12 pieces in sets of two, for a few dungeons, each with its words and an anchor', () => {
    expect(PET_LOOK_PIECES.length).toBeGreaterThanOrEqual(10);
    expect(PET_LOOK_PIECES.length).toBeLessThanOrEqual(12);
    for (const s of PET_LOOK_SETS) {
      expect(DUNGEON_IDS).toContain(s.dungeon);
      expect(s.pieces).toHaveLength(2);
      expect(LOOK_TEXT[s.id]!.svar).toBeTruthy();
      expect(LOOK_TEXT[s.id]!.extrem).toBeTruthy();
      for (const x of s.pieces) {
        expect(PET_ANCHORS).toContain(x.petSlot);
        expect(x.id).toBe(`${s.id}_${x.petSlot}`);
        expect(x.name.length).toBeGreaterThan(2);
        expect(x.text.length).toBeGreaterThan(10);
        expect(x.fx[0]).toBeTruthy();
        expect(lookPiece(x.id)).toBe(x);
        expect(isPetPiece(x.id)).toBe(true);
      }
    }
    // pet gear is not hero gear: no hero set or wardrobe list has it
    for (const x of ALL_PIECES) expect(isPetPiece(x.id)).toBe(false);
    expect(new Set(PET_LOOK_PIECES.map((x) => x.id)).size).toBe(PET_LOOK_PIECES.length);
    // every anchor has pieces, and several sets are themed like a hero set of the same dungeon
    for (const a of PET_ANCHORS) expect(PET_LOOK_PIECES.some((x) => x.petSlot === a)).toBe(true);
  });

  it('a code decodes to the piece, its tier and the set colours (a colourway swaps them)', () => {
    const x = PET_LOOK_PIECES[0]!;
    const d = decodeLook(`${x.id}|4|`)!;
    expect(d.piece).toBe(x);
    expect(d.tier).toBe(4);
    const way = decodeLook(`${x.id}|4|svar`)!;
    expect(way.pal.main).not.toBe(d.pal.main);
  });
});

describe('earning pet gear', () => {
  it('a clear with a pet along gives one missing piece of the dungeon set, then +1 shine on what is owned, until the set is whole and at the top', () => {
    const { world, p } = farmWith(['hund']);
    const [a, b] = petSetsOf('frost')[0]!.pieces;
    const out: Change[] = [];
    const first = awardPetLooks(world, p, 'frost', 2, out);
    expect(first).toHaveLength(1);
    expect(first[0]!.isNew).toBe(true);
    expect(petGearTier(p, first[0]!.piece)).toBe(1);
    expect(out.some((c) => c.t === 'loot' && c.looks?.pet?.kind === 'hund' && c.looks.pet.drops.length === 1)).toBe(true);
    const second = awardPetLooks(world, p, 'frost', 2, []);
    // the other piece is new, the first gets +1 shine
    expect(second.filter((d) => d.isNew)).toHaveLength(1);
    expect(second.filter((d) => !d.isNew)).toHaveLength(1);
    expect(petGearTier(p, a!.id) + petGearTier(p, b!.id)).toBe(3);
    for (let i = 0; i < 10; i++) awardPetLooks(world, p, 'frost', 2, []);
    expect(petGearTier(p, a!.id)).toBe(LOOK_TIER_MAX);
    expect(petGearTier(p, b!.id)).toBe(LOOK_TIER_MAX);
    expect(awardPetLooks(world, p, 'frost', 2, [])).toEqual([]);
  });

  it('is the same on every difficulty (nothing better on Svår or Extrem)', () => {
    const tiers = [0, 2, 3, 4].map((level) => {
      const { world, p } = farmWith(['hund']);
      for (let i = 0; i < 3; i++) awardPetLooks(world, p, 'surt', level, []);
      return Object.values(p.pets!.gear!).map((g) => g.tier).sort();
    });
    for (const t of tiers) expect(t).toEqual(tiers[0]);
  });

  it('needs a pet along: none, or a pet that is dismissed, earns nothing; a dungeon without a pet set gives nothing', () => {
    const { world, p } = farmWith([]);
    expect(awardPetLooks(world, p, 'frost', 2, [])).toEqual([]);
    grantPet(world, p, 'katt', [], { quiet: true });
    togglePet(world, p.id);
    expect(awardPetLooks(world, p, 'frost', 2, [])).toEqual([]);
    togglePet(world, p.id);
    const without = DUNGEON_IDS.find((d) => !petSetsOf(d).length);
    if (without) expect(awardPetLooks(world, p, without, 2, [])).toEqual([]);
    expect(awardPetLooks(world, p, 'draug', 2, [])).toHaveLength(1);
  });

  it('every dungeon with a pet set can be cleared into all its pieces', () => {
    for (const s of PET_LOOK_SETS) {
      const { world, p } = farmWith(['hund']);
      for (let i = 0; i < 2; i++) awardPetLooks(world, p, s.dungeon, 2, []);
      for (const x of s.pieces) expect(petGearTier(p, x.id)).toBeGreaterThan(0);
    }
  });
});

describe('wearing pet gear', () => {
  it('any pet kind wears any piece at its anchor, and it shows on the animal', () => {
    for (const id of PET_IDS) {
      const { world, p } = farmWith([id]);
      devPetGear(world, p.id, 3);
      for (const x of PET_LOOK_PIECES) {
        expect(equipPetLook(world, p.id, x.id, x.petSlot).length).toBeGreaterThan(0);
        expect(petAnimalOf(world, p)!.wear![x.petSlot!]).toBe(`${x.id}|3|`);
      }
      const a = petAnimalOf(world, p)!;
      expect(Object.keys(a.wear!).sort()).toEqual([...PET_ANCHORS].sort());
      expect(PETS[id]).toBeTruthy();
      stripPet(world, p.id);
      expect(petAnimalOf(world, p)!.wear).toBeUndefined();
    }
  });

  it('only what you own, and only at the piece\'s own anchor', () => {
    const { world, p } = farmWith(['hund']);
    const [x] = PET_LOOK_PIECES;
    expect(equipPetLook(world, p.id, x!.id, x!.petSlot)).toEqual([]);
    devPetGear(world, p.id, 1);
    const wrong = PET_ANCHORS.find((a) => a !== x!.petSlot)!;
    expect(equipPetLook(world, p.id, x!.id, wrong)).toEqual([]);
    expect(equipPetLook(world, p.id, 'draugvakt_hat', 'head')).toEqual([]);
    expect(equipPetLook(world, p.id, x!.id, x!.petSlot, undefined, 'bjorn')).toEqual([]); // (a pet kind you do not have)
    expect(equipPetLook(world, p.id, x!.id, x!.petSlot).length).toBeGreaterThan(0);
  });

  it('each pet kind has its own outfit, and the shine of a worn piece grows with the clears', () => {
    const { world, p } = farmWith(['hund', 'katt']);
    awardPetLooks(world, p, 'draug', 2, []);
    const first = Object.keys(p.pets!.gear!)[0]!;
    const slot = lookPiece(first)!.petSlot!;
    equipPetLook(world, p.id, first, slot);
    expect(petWearOf(p, 'hund')[slot]).toBe(`${first}|1|`);
    expect(petWearOf(p, 'katt')[slot]).toBeUndefined();
    awardPetLooks(world, p, 'draug', 2, []);
    expect(petWearOf(p, 'hund')[slot]).toBe(`${first}|2|`);
    expect(petAnimalOf(world, p)!.wear![slot]).toBe(`${first}|2|`);
  });

  it('a colourway is used only when its dungeon has been cleared on that level', () => {
    const { world, p } = farmWith(['hund']);
    devPetGear(world, p.id, 4);
    const x = PET_LOOK_PIECES[0]!;
    equipPetLook(world, p.id, x.id, x.petSlot, 'svar');
    expect(petWearOf(p, 'hund')[x.petSlot!]).toBe(`${x.id}|4|`);
    (p.saga ??= { cleared: [], titles: [] } as never).lookWays = [`${x.set.replace('pet_', '') === 'draug' ? 'draug' : petSetsOf('draug')[0]!.dungeon}:svar`];
    const draug = PET_LOOK_PIECES.find((y) => y.set === 'pet_draug')!;
    equipPetLook(world, p.id, draug.id, draug.petSlot, 'svar');
    expect(petWearOf(p, 'hund')[draug.petSlot!]).toBe(`${draug.id}|4|svar`);
  });
});

describe('pet gear is saved with the player', () => {
  it('owned gear, its shine and what each pet wears come back from the saved JSON, and the animal is dressed again', () => {
    const { world, p } = farmWith(['hund', 'katt']);
    awardPetLooks(world, p, 'alv', 2, []);
    awardPetLooks(world, p, 'alv', 2, []);
    const mine = PET_LOOK_PIECES.filter((x) => petGearTier(p, x.id) > 0);
    for (const x of mine) equipPetLook(world, p.id, x.id, x.petSlot);
    const saved = JSON.parse(JSON.stringify({ players: world.players, animals: world.animals })) as { players: Record<string, PlayerState>; animals: WorldState['animals'] };
    const w2 = generateWorld(3);
    w2.players = saved.players;
    w2.animals = saved.animals;
    const q = w2.players[p.id]!;
    q.online = false;
    setOnline(w2, q.id, true);
    for (const x of mine) expect(petGearTier(q, x.id)).toBe(petGearTier(p, x.id));
    const a = petAnimalOf(w2, q)!;
    expect(Object.keys(a.wear ?? {}).length).toBe(mine.length);
    for (const x of mine) expect(a.wear![x.petSlot!]).toBe(`${x.id}|${petGearTier(p, x.id)}|`);
  });
});

describe('extensibility', () => {
  it('every pet kind has all three anchors on both walk frames, so a new pet wears every piece from its table entry alone', () => {
    for (const d of Object.values(PETS)) for (const a of PET_ANCHORS) expect(d.anchors[a]).toHaveLength(2);
  });
});
