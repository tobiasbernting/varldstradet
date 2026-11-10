// Pets in the game (see pets.ts for the table): owning them, bringing one along, and what it does in a fight.
//
// A player's pets are stored with the player (PlayerState.pets), never only as animals on a map: the animal you see is a
// projection that syncPet makes on whatever map its owner is on (and removes everywhere else). So a run's map, which is never
// saved, cannot lose a pet, and a pet follows through every door without being moved.
//
// In a fight the pets are run from tickSaga (tickPets): each one acts on its own on a cooldown, stays near its owner, only ever
// goes for monsters that are already fighting (it never pulls a new pack) and cannot die. When it has taken too much it gets
// scared, runs to its owner, and is out for a few seconds before it comes back.
import { ANIMALS } from './data.ts';
import type { Change } from './protocol.ts';
import { PETS, PET_ANCHORS, activePet, ownsPet, petDef, petLevelMul, petsOf, type PetAnchor, type PetDef, type PetDress, type PetTrick, type PetWear } from './pets.ts';
import { PET_LOOK_PIECES, LOOK_TIER_MAX, encodeLook, hasWay, isPetPiece, lookPiece, dungeonOfPiece, petSetsOf, type LookDrop } from './looks.ts';
import { mulberry32 } from './rng.ts';
import { readProgress } from './sagasim.ts';
import { DUNGEONS, isRunKey, type DungeonId, type SagaMob } from './saga.ts';
import { heal, hit, inZone, partyOf, spellFx, stun, hurtMob, type Here } from './sagasim.ts';
import { ANIMAL_HALF_H, ANIMAL_HALF_W, areaOf, dummyAnimal, farmOf, fx, isSolidForPlayer, playerChange, resolveMove, toast, type SimCtx } from './sim.ts';
import { PET_T, fmt } from './sv.ts';
import { TILE, type AnimalState, type PlayerState, type WorldState } from './types.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y) / TILE;
const keyOf = (m: WorldState): string => m.area ?? 'farm';
const tag = (c: Change, key: string): Change => {
  if (key !== 'farm' && (c.t === 'animal' || c.t === 'fx')) (c as { area?: string }).area = key;
  return c;
};

// ---------------------------------------------------------------------------
// Owning and bringing a pet
// ---------------------------------------------------------------------------

/** The name a player's pet has (their own, or the kind's). */
export const petNameOf = (p: PlayerState, id: string): string => p.pets?.owned[id]?.name || PETS[id]?.name || id;

/** Gives a player a pet kind they do not have yet (false: they have it, or there is no such pet). The first one also comes along. */
export function grantPet(world: WorldState, p: PlayerState, id: string, out: Change[], opts: { quiet?: boolean; now?: number } = {}): boolean {
  const def = petDef(id);
  if (!def || p.bot || ownsPet(p, id)) return false;
  const ps = petsOf(p);
  ps.owned[id] = { since: opts.now ?? Date.now() };
  if (!ps.active || !ps.owned[ps.active]) {
    ps.active = id;
    ps.out = false;
  }
  if (!opts.quiet) out.push(toast(p.id, fmt(PET_T.got, { name: def.name })));
  out.push(playerChange(p));
  syncPet(world, p, out);
  return true;
}

/** Makes the animals on the maps match the save: the active pet (if it is in) next to its owner, and no other pet of theirs anywhere. */
export function syncPet(world: WorldState, p: PlayerState, out: Change[]): void {
  if (p.bot) return;
  const farm = farmOf(world);
  const def = p.online ? activePet(p) : undefined;
  const here = p.area === 'dungeon' ? undefined : areaOf(farm, p);
  let kept: AnimalState | undefined;
  for (const m of [farm, ...Object.values(farm.areas ?? {})]) {
    for (const a of Object.values(m.animals)) {
      if (a.owner !== p.id || !a.petKind) continue;
      if (def && !kept && m === here && a.petKind === def.id) {
        kept = a;
        continue;
      }
      delete m.animals[a.id];
      out.push(tag({ t: 'animal', id: a.id, animal: null }, keyOf(m)));
    }
  }
  if (!def || !here) return;
  const name = petNameOf(p, def.id);
  const wear = petWearOf(p, def.id);
  if (kept) {
    const wornNow = JSON.stringify(wear ?? {});
    if (kept.name !== name || JSON.stringify(kept.wear ?? {}) !== wornNow) {
      kept.name = name;
      if (Object.keys(wear).length) kept.wear = { ...wear };
      else delete kept.wear;
      out.push(tag({ t: 'animal', id: kept.id, animal: kept }, keyOf(here)));
    }
    return;
  }
  const a: AnimalState = {
    ...dummyAnimal,
    id: here.nextId++,
    species: def.species,
    name,
    named: true,
    x: p.x,
    y: p.y + 3,
    owner: p.id,
    petKind: def.id,
    age: 10,
    waitMs: 0,
    pf: { st: 'help', courage: def.courage, cd: 0 },
    ...(Object.keys(wear).length ? { wear: { ...wear } } : {}),
  };
  here.animals[a.id] = a;
  out.push(tag({ t: 'animal', id: a.id, animal: a }, keyOf(here)), tag(fx(Math.floor(a.x / TILE), Math.floor(a.y / TILE), 'sparkle'), keyOf(here)));
}

/** The pet of a player as an animal on the map they are on. */
export function petAnimalOf(world: WorldState, p: PlayerState): AnimalState | undefined {
  const here = areaOf(farmOf(world), p);
  return Object.values(here.animals).find((a) => a.owner === p.id && !!a.petKind);
}

/** In or out: the one button. The pet comes next to its owner, or is gone (it neither helps nor blocks). */
export function togglePet(world: WorldState, playerId: string): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p) return [];
  const ps = petsOf(p);
  const out: Change[] = [];
  if (!ps.active || !ps.owned[ps.active]) {
    const first = Object.keys(ps.owned).find((id) => PETS[id]);
    if (!first) return [toast(p.id, PET_T.none)];
    ps.active = first;
    ps.out = false;
  } else ps.out = !ps.out;
  syncPet(world, p, out);
  const def = PETS[ps.active!]!;
  out.push(toast(p.id, fmt(ps.out ? PET_T.dismissed : PET_T.summoned, { name: petNameOf(p, def.id) })), playerChange(p));
  return out;
}

/** Chooses which pet comes along (in the lobby or at the arch; not in the middle of a run). The chosen pet comes out too. */
export function pickPet(world: WorldState, playerId: string, id: string): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p || !ownsPet(p, id)) return [];
  if (isRunKey(p.area)) return [toast(p.id, PET_T.noSwap)];
  const ps = petsOf(p);
  const out: Change[] = [];
  ps.active = id;
  ps.out = false;
  syncPet(world, p, out);
  out.push(toast(p.id, fmt(PET_T.picked, { name: petNameOf(p, id) })), playerChange(p));
  return out;
}

/** The pet's name goes with the player (nameAnimal calls this). */
export function renamePet(p: PlayerState, a: AnimalState, name: string): void {
  if (!a.petKind || !p.pets?.owned[a.petKind]) return;
  p.pets.owned[a.petKind]!.name = name;
}

// ---------------------------------------------------------------------------
// Pet gear (looks.ts: PET_LOOK_SETS): earned by clearing dungeons with a pet along, worn by any pet kind at its anchors
// ---------------------------------------------------------------------------

/** The shine tier of a piece of pet gear a player has (0: none). */
export const petGearTier = (p: { pets?: { gear?: Record<string, { tier: number }> } }, piece: string): number => p.pets?.gear?.[piece]?.tier ?? 0;

/** What a pet kind of this player wears, as look codes by anchor (only what they own, at the anchor it belongs to). This is what is drawn. */
export function petWearOf(p: PlayerState, kind: string): PetWear {
  const dress = p.pets?.dress?.[kind];
  const out: PetWear = {};
  if (!dress) return out;
  const prog = readProgress(p);
  for (const anchor of PET_ANCHORS) {
    const w = dress[anchor];
    const piece = w ? lookPiece(w.piece) : undefined;
    const tier = w ? petGearTier(p, w.piece) : 0;
    if (!w || !piece || piece.petSlot !== anchor || tier < 1) continue;
    const dungeon = dungeonOfPiece(w.piece);
    out[anchor] = encodeLook(w.piece, tier, w.way && dungeon && hasWay(prog, dungeon, w.way) ? w.way : undefined);
  }
  return out;
}

/** Puts a piece of gear on a pet kind (default: the active one) at its anchor, or takes the anchor's piece off (`piece` null). Free and instant. */
export function equipPetLook(world: WorldState, playerId: string, piece: string | null, anchor: unknown, way?: unknown, kind?: string): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p || !(PET_ANCHORS as readonly string[]).includes(anchor as string)) return [];
  const ps = petsOf(p);
  const id = kind ?? ps.active;
  if (!id || !ps.owned[id]) return [];
  const a = anchor as PetAnchor;
  const dress: PetDress = { ...(ps.dress?.[id] ?? {}) };
  if (piece === null) delete dress[a];
  else {
    const def = lookPiece(piece);
    if (!def || !isPetPiece(piece) || def.petSlot !== a || petGearTier(p, piece) < 1) return [];
    const w = way === 'svar' || way === 'extrem' ? way : undefined;
    dress[a] = { piece, ...(w ? { way: w } : {}) };
  }
  (ps.dress ??= {})[id] = dress;
  const out: Change[] = [];
  syncPet(world, p, out);
  out.push(playerChange(p));
  return out;
}

/** Takes everything off a pet kind. */
export function stripPet(world: WorldState, playerId: string, kind?: string): Change[] {
  const p = farmOf(world).players[playerId];
  const id = kind ?? p?.pets?.active;
  if (!p || !id || !p.pets?.dress?.[id]) return [];
  delete p.pets.dress[id];
  const out: Change[] = [];
  syncPet(world, p, out);
  out.push(playerChange(p));
  return out;
}

const gearRng = (p: PlayerState, dungeon: string): (() => number) => {
  let h = 2166136261;
  for (const ch of `pet|${p.id}|${dungeon}|${p.pets?.gearClears?.[dungeon] ?? 0}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return mulberry32(h >>> 0);
};

/**
 * A dungeon cleared (any difficulty) with a pet along: one piece of that dungeon's small pet set the player does not have yet, and +1
 * shine on the pieces of it they already had (at most 5). Nothing else depends on the difficulty (Svår and Extrem only count the
 * same as Vanlig; their colourways are the heroes' own). Like the hero looks the dice are seeded by player, dungeon and count, and
 * the result is added to the clear's loot change so the loot window and the summary show it.
 */
export function awardPetLooks(world: WorldState, p: PlayerState, dungeon: DungeonId, level: number, out: Change[]): LookDrop[] {
  const def = activePet(p);
  if (p.bot || !def) return [];
  const sets = petSetsOf(dungeon);
  if (!sets.length) return [];
  const ps = petsOf(p);
  const owned = (ps.gear ??= {});
  const clears = (ps.gearClears ??= {});
  const rnd = gearRng(p, dungeon);
  clears[dungeon] = (clears[dungeon] ?? 0) + 1;
  const had = new Set(Object.keys(owned));
  const drops: LookDrop[] = [];
  const missing = sets.flatMap((s) => s.pieces).filter((x) => !owned[x.id]);
  if (missing.length) {
    const x = missing[Math.min(missing.length - 1, Math.floor(rnd() * missing.length))]!;
    owned[x.id] = { tier: 1 };
    drops.push({ piece: x.id, tier: 1, isNew: true });
  }
  for (const x of sets.flatMap((s) => s.pieces)) {
    const o = owned[x.id];
    if (!o || !had.has(x.id) || o.tier >= LOOK_TIER_MAX) continue;
    o.tier += 1;
    drops.push({ piece: x.id, tier: o.tier, isNew: false });
  }
  void level;
  if (!drops.length) return [];
  const name = petNameOf(p, def.id);
  const prev = [...out].reverse().find((c) => c.t === 'loot' && c.to === p.id && c.looks && c.looks.dungeon === DUNGEONS[dungeon].id);
  const info = { kind: def.id, name, drops };
  if (prev && prev.t === 'loot' && prev.looks) prev.looks.pet = info;
  else out.push({ t: 'loot', to: p.id, from: DUNGEONS[dungeon].name, items: [], stars: 0, looks: { drops: [], ways: [], titles: [], dungeon, level, pet: info } });
  syncPet(world, p, out);
  out.push(playerChange(p));
  return drops;
}

/** Dev (DEV_TELEPORT=1, `dev petgear`): every piece of pet gear (or one set's) at a tier, and the active pet puts the first of each anchor on. */
export function devPetGear(world: WorldState, playerId: string, tier: number, setId?: string): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p) return [];
  const ps = petsOf(p);
  const t = Math.max(1, Math.min(LOOK_TIER_MAX, Math.floor(tier) || LOOK_TIER_MAX));
  const owned = (ps.gear ??= {});
  for (const x of PET_LOOK_PIECES) if (!setId || x.set === setId) owned[x.id] = { tier: t };
  const out: Change[] = [];
  syncPet(world, p, out);
  out.push(playerChange(p));
  return out;
}

/** Dev: gives pets (`all` or one kind) so the others can be tried out. */
export function devPet(world: WorldState, playerId: string, id: string): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p) return [];
  const out: Change[] = [];
  for (const k of id === 'all' ? Object.keys(PETS) : [id]) grantPet(world, p, k, out, { quiet: true });
  return out;
}

/** Dev (`dev petscare`): the player's pet gets scared right now, as if it had taken too much (to see the state and the way back). */
export function devPetScare(world: WorldState, playerId: string, now: number): Change[] {
  const p = farmOf(world).players[playerId];
  const a = p ? petAnimalOf(world, p) : undefined;
  if (!p || !a?.pf) return [];
  a.pf.st = 'scared';
  a.pf.scaredUntil = now + SCARED_MS;
  a.pf.courage = 0;
  return [tag({ t: 'animal', id: a.id, animal: a }, keyOf(areaOf(farmOf(world), p))), toast(p.id, fmt(PET_T.scared, { name: a.name }))];
}

/** The first clear of a dungeon gives the pets that wait for it. */
export function giveClearPets(world: WorldState, p: PlayerState, dungeon: DungeonId, out: Change[]): void {
  for (const d of Object.values(PETS)) {
    if (d.source.kind !== 'clear' || d.source.dungeon !== dungeon) continue;
    if (grantPet(world, p, d.id, out, { quiet: true })) out.push(toast(p.id, fmt(PET_T.gift, { name: d.name, dungeon: DUNGEONS[dungeon].name })));
  }
}

/** Pets in a boss's chest: a chance each, never one the player has already (they are in the loot list as `petitem_<id>`). */
export function rollPetDrops(world: WorldState, p: PlayerState, boss: string, chanceMul: number, rnd: () => number, out: Change[]): string[] {
  const got: string[] = [];
  for (const d of Object.values(PETS)) {
    if (d.source.kind !== 'drop' || d.source.boss !== boss || ownsPet(p, d.id)) continue;
    if (rnd() >= d.source.chance * chanceMul) continue;
    if (grantPet(world, p, d.id, out, { quiet: true })) got.push(`petitem_${d.id}`);
  }
  return got;
}

// ---------------------------------------------------------------------------
// In a fight
// ---------------------------------------------------------------------------

const SCARED_MS = 8000;
const COURAGE_REGEN = 3;
const LEASH = 7;
const MAX_FAR = 9;
/** Zones a pet is scared by: burning ground costs courage by the second. */
const BURN_COURAGE = 3;

const speedOf = (a: AnimalState): number => Math.max(64, ANIMALS[a.species]?.speed ?? 64) * 1.15;

function emit(h: Here, a: AnimalState, out: Change[]): void {
  out.push({ t: 'animal', id: a.id, animal: a, area: h.key });
}

function walk(h: Here, a: AnimalState, goal: { x: number; y: number }, speed: number, dtMs: number, stop: number): void {
  const dx = goal.x - a.x;
  const dy = goal.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= stop) {
    a.moving = false;
    return;
  }
  const step = Math.min(d - stop + 0.5, (speed * dtMs) / 1000);
  const r = resolveMove((tx, ty) => isSolidForPlayer(h.area, tx, ty), a.x, a.y, a.x + (dx / d) * step, a.y + (dy / d) * step, ANIMAL_HALF_W, ANIMAL_HALF_H, h.area);
  a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  a.moving = r.x !== a.x || r.y !== a.y;
  a.x = r.x;
  a.y = r.y;
}

/** Doorways and the places you pass through: a pet does not wait on them. */
function doorways(h: Here): { x: number; y: number }[] {
  const i = h.inst;
  const tiles = [i.start, i.exit, ...(i.run?.exits ?? []), ...(i.gateOpen ? [] : i.gate), ...(i.puzzleOpen ? [] : i.puzzleGate)];
  return tiles.map((t) => ({ x: t.x * TILE + TILE / 2, y: t.y * TILE + TILE / 2 }));
}

/** Where a pet waits: a step behind its owner, to the side if that would be in a doorway or a wall. */
export function idleSpot(h: Here, owner: PlayerState): { x: number; y: number } {
  const back = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[owner.facing] ?? [0, 1];
  const doors = doorways(h);
  for (const [ang, r] of [[0, 17], [0.9, 17], [-0.9, 17], [1.8, 17], [-1.8, 17], [0, 26], [2.7, 17]] as const) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const x = owner.x + (back[0]! * c - back[1]! * s) * r;
    const y = owner.y + (back[0]! * s + back[1]! * c) * r;
    if (isSolidForPlayer(h.area, Math.floor(x / TILE), Math.floor(y / TILE))) continue;
    if (doors.some((d) => Math.hypot(d.x - x, d.y - y) < 1.7 * TILE)) continue;
    return { x, y };
  }
  return { x: owner.x, y: owner.y };
}

function scare(h: Here, a: AnimalState, owner: PlayerState, def: PetDef, now: number, out: Change[]): void {
  const pf = a.pf!;
  pf.st = 'scared';
  pf.scaredUntil = now + SCARED_MS;
  pf.courage = 0;
  a.moving = false;
  emit(h, a, out);
  out.push(toast(owner.id, fmt(PET_T.scared, { name: a.name || def.name })));
}

/** A guarding pet takes a share of a hit meant for a hero near it (returns what is left for the hero to take). */
export function petSoak(h: Here, victim: PlayerState, n: number, now: number, out: Change[]): number {
  for (const a of Object.values(h.area.animals)) {
    const def = a.petKind ? PETS[a.petKind] : undefined;
    if (!def || def.trick.kind !== 'guard' || !a.pf || a.pf.st === 'scared') continue;
    const owner = a.owner ? h.farm.players[a.owner] : undefined;
    if (!owner || owner.area !== h.key || !h.inst.fighters[owner.id] || dist(a, victim) > def.trick.range) continue;
    const take = Math.floor(n * def.trick.soak * petLevelMul(h.inst.run?.level));
    if (take <= 0) continue;
    a.pf.courage -= take * 0.9;
    a.pf.actAt = now;
    out.push(hit(h, a.id, take, 'block'));
    if (a.pf.courage <= 0) scare(h, a, owner, def, now, out);
    return n - take;
  }
  return n;
}

/** The sagafrön a find-pet adds on top of what a run pays its owner (a fraction), while it is with them and not scared. */
export function petSeedBonus(farm: WorldState, p: PlayerState, level: number | undefined): number {
  const def = activePet(p);
  if (!def || def.trick.kind !== 'find') return 0;
  if (Date.now() - (p.pets?.owned[def.id]?.since ?? 0) < 60_000) return 0; // (one found a moment ago, at this very clear, has not started digging yet)
  const a = Object.values(areaOf(farm, p).animals).find((x) => x.owner === p.id && x.petKind === def.id);
  if (!a || a.pf?.st === 'scared') return 0;
  return def.trick.seeds * petLevelMul(level);
}

/** Runs every pet in a dungeon or run stop for one tick. */
export function tickPets(h: Here, dtMs: number, ctx: SimCtx, out: Change[]): void {
  const pets = Object.values(h.area.animals).filter((a) => !!a.petKind && !!a.owner);
  if (!pets.length) return;
  const party = partyOf(h);
  const fighting = Object.values(h.inst.mobs).filter((m) => m.state === 'fight' && m.kind !== 'ice' && !!h.area.animals[m.id]);
  for (const a of pets) {
    const owner = party.find((p) => p.id === a.owner);
    const def = PETS[a.petKind!];
    if (!owner || !def) continue;
    a.pf ??= { st: 'help', courage: def.courage, cd: 0 };
    tickPet(h, a, owner, def, party, fighting, dtMs, ctx, out);
  }
}

function tickPet(h: Here, a: AnimalState, owner: PlayerState, def: PetDef, party: PlayerState[], fighting: SagaMob[], dtMs: number, ctx: SimCtx, out: Change[]): void {
  const now = ctx.now;
  const pf = a.pf!;
  const sec = dtMs / 1000;
  const speed = speedOf(a);
  const spot = idleSpot(h, owner);
  if (dist(a, owner) > MAX_FAR) {
    a.x = spot.x;
    a.y = spot.y;
    a.moving = false;
  }
  // scared: runs to its owner and cowers there until it is brave again
  if (pf.st === 'scared') {
    if (now >= (pf.scaredUntil ?? 0)) {
      pf.st = def.trick.kind === 'ambush' ? 'hidden' : 'help';
      pf.courage = def.courage * 0.7;
      delete pf.scaredUntil;
      emit(h, a, out);
    } else {
      walk(h, a, spot, speed * 1.5, dtMs, 6);
      return;
    }
  }
  // burning ground frightens it
  for (const z of h.inst.zones) if (z.until !== undefined && now >= z.at && inZone(z, a)) pf.courage -= BURN_COURAGE * sec * 6;
  if (pf.courage <= 0) {
    scare(h, a, owner, def, now, out);
    return;
  }
  pf.courage = Math.min(def.courage, pf.courage + COURAGE_REGEN * sec);
  const fo = h.inst.fighters[owner.id];
  const mul = petLevelMul(h.inst.run?.level);
  if (!fo || fo.down !== undefined) {
    walk(h, a, spot, speed, dtMs, 8);
    return;
  }
  if (fighting.length) pf.fightAt = now;
  // the monster it works on: the one its owner fights, else the closest one to the owner that is already fighting
  const near = (range: number): SagaMob | null => {
    const mine = fo.target !== undefined ? h.inst.mobs[fo.target] : undefined;
    if (mine && mine.state === 'fight' && h.area.animals[mine.id] && dist(h.area.animals[mine.id]!, owner) <= range) return mine;
    let best: SagaMob | null = null;
    let bestD = Infinity;
    for (const m of fighting) {
      const am = h.area.animals[m.id];
      if (!am || !h.inst.mobs[m.id]) continue; // (one may have fallen since the list was made)
      const d = dist(am, owner);
      if (d <= range && d < bestD) {
        best = m;
        bestD = d;
      }
    }
    return best;
  };
  const posOf = (m: SagaMob): AnimalState => h.area.animals[m.id]!;
  const act = (spell: string, m: SagaMob | PlayerState | null): void => {
    pf.actAt = now;
    const to = m ? ('species' in m ? posOf(m) : m) : undefined;
    out.push(spellFx(h, a.id, spell, a, to, m ? m.id : undefined));
    out.push({ t: 'animal', id: a.id, animal: a, area: h.key });
  };
  const t: PetTrick = def.trick;
  switch (t.kind) {
    case 'bite':
    case 'howl':
    case 'ambush': {
      const m = near(LEASH);
      if (t.kind === 'howl' && fighting.length) {
        pf.cd2 ??= now + 3000;
        if (now >= pf.cd2) {
          pf.cd2 = now + t.howlCd;
          for (const q of party) {
            const fq = h.inst.fighters[q.id];
            if (fq && fq.down === undefined) fq.howl = { until: now + t.buffMs, mul: t.buff * mul };
          }
          act('pet_howl', null);
        }
      }
      if (t.kind === 'ambush') {
        if (pf.st === 'help' && !fighting.length && now - (pf.fightAt ?? 0) > t.hideMs) {
          pf.st = 'hidden';
          emit(h, a, out);
        }
        if (pf.st === 'hidden' && !m) {
          walk(h, a, spot, speed, dtMs, 8);
          return;
        }
      }
      if (!m) {
        walk(h, a, spot, speed, dtMs, 8);
        return;
      }
      const am = posOf(m);
      walk(h, a, am, speed * (pf.st === 'hidden' ? 1.5 : 1), dtMs, t.range * TILE * 0.7);
      if (dist(a, am) > t.range || now < pf.cd) return;
      pf.cd = now + t.cd;
      let dmg = t.dmg;
      let pounce = false;
      if (t.kind === 'ambush' && pf.st === 'hidden') {
        dmg = t.first;
        pounce = true;
        pf.st = 'help';
      }
      act(pounce ? 'pet_pounce' : 'pet_bite', m);
      hurtMob(h, m, owner.id, dmg * mul, 0.2, pounce, ctx, out);
      return;
    }
    case 'purr': {
      let weak: PlayerState | null = null;
      let low = t.below;
      for (const q of party) {
        const fq = h.inst.fighters[q.id];
        if (!fq || fq.down !== undefined) continue;
        const frac = fq.hp / fq.max;
        if (frac < low && dist(q, owner) <= LEASH) {
          low = frac;
          weak = q;
        }
      }
      if (!weak) {
        walk(h, a, spot, speed, dtMs, 8);
        return;
      }
      walk(h, a, weak, speed, dtMs, t.range * TILE * 0.6);
      if (dist(a, weak) > t.range || now < pf.cd) return;
      pf.cd = now + t.cd;
      act('pet_purr', weak);
      heal(h, weak, h.inst.fighters[weak.id]!, t.heal * mul, out);
      return;
    }
    case 'guard': {
      const m = near(LEASH);
      if (m) {
        // stands a step in front of its owner, towards the monster
        const am = posOf(m);
        const d = Math.max(1, Math.hypot(am.x - owner.x, am.y - owner.y));
        walk(h, a, { x: owner.x + ((am.x - owner.x) / d) * 22, y: owner.y + ((am.y - owner.y) / d) * 22 }, speed, dtMs, 5);
      } else walk(h, a, spot, speed, dtMs, 8);
      if (now < (pf.cd2 ?? 0)) return;
      // a roar at a monster that is after a weak friend: it comes for the owner (and the bear) instead
      const ownerFrac = fo.hp / fo.max;
      for (const mm of fighting) {
        if (!h.inst.mobs[mm.id] || !h.area.animals[mm.id]) continue;
        const victim = mm.target ? party.find((q) => q.id === mm.target) : undefined;
        const fv = victim ? h.inst.fighters[victim.id] : undefined;
        if (!victim || !fv || victim.id === owner.id || fv.hp / fv.max >= 0.45 || fv.hp / fv.max >= ownerFrac) continue;
        if (dist(posOf(mm), a) > 6) continue;
        mm.tauntBy = owner.id;
        mm.tauntUntil = now + 2000;
        pf.cd2 = now + t.roarCd;
        act('pet_roar', mm);
        return;
      }
      return;
    }
    case 'mark': {
      walk(h, a, spot, speed, dtMs, 8);
      const m = near(t.range);
      if (!m || now < pf.cd || (m.mark && now < m.mark.until)) return;
      pf.cd = now + t.cd;
      m.mark = { until: now + t.ms, bonus: t.bonus * mul };
      act('pet_mark', m);
      return;
    }
    case 'find': {
      walk(h, a, spot, speed, dtMs, 8);
      if (!fighting.length && now >= pf.cd && h.inst.run) {
        pf.cd = now + 9000;
        act('pet_dig', null);
      }
      return;
    }
    case 'ram': {
      const m = now >= pf.cd ? near(LEASH) : null;
      if (!m) {
        walk(h, a, spot, speed, dtMs, 8);
        return;
      }
      const am = posOf(m);
      walk(h, a, am, speed * 2.2, dtMs, 1.1 * TILE);
      if (dist(a, am) > 1.5) return;
      pf.cd = now + t.cd;
      act('pet_ram', m);
      hurtMob(h, m, owner.id, t.dmg * mul, 0.2, false, ctx, out);
      if (h.inst.mobs[m.id] && (m.kind === 'mob' || m.kind === 'add')) stun(h, m, t.stunMs * mul, now, out);
      return;
    }
  }
}
