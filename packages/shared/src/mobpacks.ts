// Which species stand in a stop's packs, and which skin each monster wears (DESIGN.md sections 2.3 and 2.4). The pack tables
// and `pack()` in runmap.ts decide how many monsters a pack has and which slot each one fills (small, medium or the one big
// one), with the stop's own dice, exactly as before; this file only chooses, for every slot, between the slot's original
// species and its mate (mobs.ts), so a pack is as strong as it was and never all of one kind. Its dice are its own
// (seeded by the run's seed and the stop), so nothing else in a run moves.
import { hashInts, mulberry32 } from './rng.ts';
import { DUNGEONS, type DungeonId, type SagaRoom } from './saga.ts';
import { ADD_KIN, MOB_ARCHETYPE, isIllusion, mobBase, mobKin, mobSkins, mobVariant } from './mobs.ts';
import type { WorldState } from './types.ts';

/** Tests turn this off to see the packs as the slots alone would make them (the originals only). */
export const PACK_VARIETY = { on: true };

/** A pack of four or more of one slot, all swarmers, is now and then left as one species: a swarm. */
export const SWARM_CHANCE = 0.12;

/** All the species a dungeon's packs can hold: the originals in its rooms and their mates (Bifrost: Loke's four and theirs). */
export function dungeonSpecies(d: DungeonId): string[] {
  const base = [...new Set(DUNGEONS[d].rooms.flatMap((r) => (r.packs ?? []).flat()))];
  return [...new Set(base.flatMap((s) => [...mobKin(s)]))];
}

/**
 * The newcomers a stop may show, by its row: the first stop of a run shows the mate of one of the slots that fill the packs
 * (`bulk`, in the order the run's seed gives), the second stop two, and from the third row on every slot has both. The big
 * monsters' mates come with the big monsters, in the second wing.
 */
export function introducedAt(seed: number, row: number, bulk: readonly string[]): ReadonlySet<string> {
  const rnd = mulberry32(hashInts(seed, 0x1a7e0));
  const order = [...new Set(bulk.map(mobBase))].sort();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return new Set(row >= 3 ? order : order.slice(0, row));
}

const keyOf = (pack: readonly string[]): string => [...pack].sort().join(',');

/**
 * The species of a stop's packs, in place: every member keeps its slot (its original species or that one's mate). The rules:
 * a pack holds two or three species when it can; no pack of four or more is one species unless it is a swarm (`SWARM_CHANCE`);
 * a pack is not the same as the one before it in the stop. Deterministic from the seed and the stop's id.
 */
export function varyStopPacks(rooms: readonly SagaRoom[], o: { seed: number; node: number; row: number; bulk: readonly string[] }): void {
  if (!PACK_VARIETY.on) return;
  const rnd = mulberry32(hashInts(o.seed, o.node, 0x90b5));
  const shown = introducedAt(o.seed, o.row, o.bulk);
  /** What a slot may hold in this stop: both when its mate has been introduced (a big one's mate always is). */
  const choices = (base: string): readonly string[] => (shown.has(base) || !o.bulk.map(mobBase).includes(base) ? mobKin(base) : [base]);
  const other = (base: string, s: string): string => mobKin(base).find((x) => x !== s) ?? s;
  let last: Map<string, string> = new Map();
  let lastKey = '';
  for (const room of rooms)
    for (const pack of room.packs ?? []) {
      const slots = pack.map(mobBase);
      const bases = [...new Set(slots)];
      // one species for each slot of the pack: more often the one the pack before did not have
      const first = new Map<string, string>();
      for (const b of bases) {
        const c = choices(b);
        const was = last.get(b);
        first.set(b, c.length < 2 ? c[0]! : was ? (rnd() < 0.7 ? other(b, was) : was) : c[Math.floor(rnd() * c.length)]!);
      }
      slots.forEach((b, i) => (pack[i] = first.get(b)!));
      /** The later half of a slot's members become its other species. */
      const split = (b: string): void => {
        const at = slots.map((s, i) => (s === b ? i : -1)).filter((i) => i >= 0);
        for (const i of at.slice(Math.ceil(at.length / 2))) pack[i] = other(b, first.get(b)!);
      };
      if (bases.length === 1 && pack.length >= 2) {
        const b = bases[0]!;
        const swarm = pack.length >= 4 && MOB_ARCHETYPE[b] === 'swarmer' && rnd() < SWARM_CHANCE;
        // (four or more of one slot are split even when the mate has not been introduced: the rule comes first)
        if (!swarm && mobKin(b).length > 1 && (pack.length >= 4 || (choices(b).length > 1 && rnd() < 0.6))) split(b);
      } else if (bases.length === 2 && rnd() < 0.45) {
        const b = bases.filter((x) => choices(x).length > 1 && slots.filter((s) => s === x).length >= 2).sort((x, y) => slots.filter((s) => s === y).length - slots.filter((s) => s === x).length)[0];
        if (b) split(b);
      }
      // not the same pack twice in a row: one slot takes its other species
      if (keyOf(pack) === lastKey) {
        const b = bases.find((x) => choices(x).length > 1);
        if (b) slots.forEach((s, i) => (pack[i] = s === b ? other(b, pack[i]!) : pack[i]!));
      }
      last = first;
      lastKey = keyOf(pack);
    }
}

/** The species of a helper a boss calls: the one the boss names or, for the helpers in `ADD_KIN`, its mate (by the helper's id). */
export function addSpecies(species: string, id: number): string {
  if (!PACK_VARIETY.on || !ADD_KIN.has(species)) return species;
  const kin = mobKin(species);
  return kin[hashInts(id, 0xadd) % kin.length]!;
}

/** The skin a monster gets when nothing else decides it (a boss's helpers, the saga's own dungeons): by its id and its pack. */
export const spawnSkin = (species: string, id: number, pack: number): number => (hashInts(pack + 1, 0x5c1) + id) % mobSkins(species);

/**
 * The skins of a stop's monsters, by the run's seed: in a pack, the members of one species take the skins in turn from a
 * start the seed gives, so two of a kind side by side are not twins. Only `variant` is written (an illusion stays one).
 */
export function skinStop(world: WorldState, seed: number, node: number): void {
  const inst = world.saga;
  if (!inst) return;
  inst.packs.forEach((pk, pi) => {
    const seen: Record<string, number> = {};
    for (const id of pk.members) {
      const a = world.animals[id];
      const m = inst.mobs[id];
      if (!a || !m || mobSkins(m.species) < 2) continue;
      const k = (seen[m.species] = (seen[m.species] ?? -1) + 1);
      const start = hashInts(seed, node, pi, 0x5c1) + hashInts(m.species.length, m.species.charCodeAt(0), m.species.charCodeAt(m.species.length - 1));
      a.variant = mobVariant((start + k) % mobSkins(m.species), isIllusion(a.variant));
    }
  });
}
