// The rules of a run (färd), GAME.md. A run is started at the färdport on the farm; the party fights through three
// zones and a boss, each a saga map built by runmap.ts and fought by sagasim.ts (every fight rule is the saga's, a run
// only hands each fighter its buffs and watches what happens). This file is the run state, the vote on runor, the
// sagafrön, the timer, the wipe and the end, the Yggdrasil shoot, the farm objects and the hired companion.
// The run lives in memory only (like a dungeon): it is never saved, what players earn is paid out at once.
import { ANIMALS, objectDef } from './data.ts';
import { addItem, countItem, removeItem } from './inventory.ts';
import { addObject, inInterior, mapH, mapW, objectAt, removeObject, tileIndex } from './map.ts';
import type { Change } from './protocol.ts';
import { randInt } from './rng.ts';
import {
  CLASSES,
  DUNGEON_IDS,
  XP_LEVELS,
  heroLevel,
  isRunKey,
  newSagaProgress,
  type ClassId,
} from './saga.ts';
import { sagaCheckpoint } from './sagamap.ts';
import { CLEARED_STAT } from './sagasim.ts';
import { runHooks } from './runhooks.ts';
import { botStep, newMind, type BotMind } from './runbot.ts';
import {
  CARED_HEARTS,
  FARDKOST,
  FOOD_SLOTS,
  HERB_EFFECT,
  JOY_PER_HEART,
  MODIFIER_SEEDS,
  MOUNT_EFFECT,
  PET_EFFECT,
  RUN_JOIN_RADIUS,
  RUN_MAX_MS,
  RUN_OFFLINE_END_MS,
  RUN_PARTY_MAX,
  RUN_PARTY_MAX_LONGHALL,
  RUN_PICK_MS,
  RUN_SEEDS,
  RUN_VICTORY_MS,
  RUN_WARN_MS,
  SMITHY_EFFECT,
  SOLO_MERCY,
  ZONES_PER_RUN,
  addEffect,
  buffsOf,
  newRunSave,
  offerRunor,
  plantError,
  runa,
  treeNode,
  treeStage,
  type RunEffect,
  type RunOfferSnap,
  type RunOutcome,
  type RunPhase,
  type RunSave,
  type RunSnap,
} from './run.ts';
import { buildZone, chapterBoss, generateRun, type RunPlan } from './runmap.ts';
import { COMPANION_NAME, RUNA_NAMES, RUN_T, T, TREE_NAMES, fmt, fmtDuration, itemName } from './sv.ts';
import {
  farmOf,
  getArea,
  giveItems,
  openTileNear,
  placeIn,
  playerChange,
  toast,
  bump,
  createPlayer,
  isPetAnimal,
  isMount,
  type SimCtx,
} from './sim.ts';
import { TILE, type PlayerState, type WorldObject, type WorldState } from './types.ts';

const tileOf = (v: number): number => Math.floor(v / TILE);

// ---------------------------------------------------------------------------
// The state
// ---------------------------------------------------------------------------

export interface RunState {
  id: string;
  seed: number;
  plan: RunPlan;
  starter: string;
  phase: RunPhase;
  /** The map now (0..2 zones, 3 the boss) and its area key. */
  zone: number;
  key: string;
  /** Players in the run (online or not) and the hired companions (fighters the server runs). */
  party: string[];
  companions: string[];
  /** Run time in ms: it counts while someone in the party is online. */
  elapsed: number;
  offlineFor: number;
  warned: boolean;
  /** The runor taken so far. */
  runor: string[];
  offer?: { cards: string[]; votes: Record<string, number>; order: string[]; until: number; from: number };
  rerolled: boolean;
  /** What each player brings from the farm (tree, dishes, animals, buildings): added up once at the start or on joining. */
  base: Record<string, RunEffect>;
  food: Record<string, string[]>;
  earned: Record<string, number>;
  /** The fraction of a sagafrö each player is owed by the bonuses (whole seeds are paid; never saved). */
  carry: Record<string, number>;
  paid: Set<string>;
  /** Players who joined while a vote was on: they enter the next zone. */
  waiting: string[];
  victoryAt?: number;
  outcome?: RunOutcome;
  minds: Map<string, BotMind>;
  statePing: number;
}

const RUNS = new WeakMap<WorldState, RunState>();
let counter = 0;

/** The run going on in this world's farm, if any. */
export const runOf = (world: WorldState): RunState | undefined => RUNS.get(farmOf(world));
const zoneKey = (id: string, i: number): string => `saga:${id}z${i}`;
const humans = (farm: WorldState, run: RunState): PlayerState[] => run.party.map((id) => farm.players[id]).filter((p): p is PlayerState => !!p);
const members = (farm: WorldState, run: RunState): PlayerState[] => [...humans(farm, run), ...run.companions.map((id) => farm.players[id]).filter((p): p is PlayerState => !!p)];

/** A player's run record, made when needed (old saves have none). */
export const runSaveOf = (p: PlayerState): RunSave => (p.run = { ...newRunSave(), ...p.run });
export const readRun = (p: PlayerState | undefined): RunSave => ({ ...newRunSave(), ...p?.run });

// ---------------------------------------------------------------------------
// The farm's objects: the färdport and the Yggdrasil shoot
// ---------------------------------------------------------------------------

const SHOOT_PLAN = { x: 21, y: 8 };
const CLEARABLE = new Set(['tree', 'tree_pine', 'tree_apple', 'stump', 'rock', 'rock_small', 'bush', 'flower', 'grass_tuft', 'mushroom']);
const BLOCKED = new Set(['water', 'bog', 'lava', 'rock', 'sandstone', 'basalt', 'choco', 'soil', 'soil_wet', 'space', 'pool']);

/** Is a w × h box free (or holding only things that grow) with a ring around it, and none of it water, soil or the house? */
function boxFree(a: WorldState, x: number, y: number, w: number, h: number, ring: number): boolean {
  if (x - ring < 2 || y - ring < 2 || x + w + ring > mapW(a) - 2 || y + h + ring > mapH(a) - 2) return false;
  for (let ty = y - ring; ty < y + h + ring; ty++)
    for (let tx = x - ring; tx < x + w + ring; tx++) {
      if (inInterior(tx, ty) || BLOCKED.has(a.terrain[tileIndex(a, tx, ty)] ?? '') || a.crops[`${tx},${ty}`]) return false;
      const o = objectAt(a, tx, ty);
      if (o && !CLEARABLE.has(o.kind)) return false;
    }
  return true;
}

/** The closest spot to `near` where a box fits; what grows there is cleared. */
function placeNear(a: WorldState, kind: string, near: { x: number; y: number }, ring: number): WorldObject | null {
  const d = objectDef(kind);
  for (let r = 0; r <= 16; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = near.x + dx;
        const y = near.y + dy;
        if (!boxFree(a, x, y, d.w, d.h, ring)) continue;
        for (let ty = y; ty < y + d.h; ty++)
          for (let tx = x; tx < x + d.w; tx++) {
            const o = objectAt(a, tx, ty);
            if (o) removeObject(a, o.id);
          }
        const o = addObject(a, kind, x, y);
        if (o) return o;
      }
  return null;
}

export const shootOf = (farm: WorldState): WorldObject | undefined => Object.values(farm.objects).find((o) => o.kind === 'yggdrasil');
export const fardportOf = (farm: WorldState): WorldObject | undefined => Object.values(farm.objects).find((o) => o.kind === 'fardport');
/** The tile in front of the arch, where people stand and where a run sends them home. */
export const archFrontOf = (farm: WorldState): { x: number; y: number } => {
  const a = fardportOf(farm);
  return a ? { x: a.x + 1, y: a.y + 2 } : { x: 15, y: 11 };
};

/** How grown the family's tree is: the nodes planted by everyone who is a character on the farm. */
export const plantedByFamily = (farm: WorldState): number => Object.values(farm.players).reduce((n, p) => n + (p.bot ? 0 : (p.run?.tree.length ?? 0)), 0);

/** Puts the Yggdrasil shoot on the farm if it is missing (the family's own counts) and the färdport beside it. True if anything changed. */
export function ensureRunPlaces(farm: WorldState): boolean {
  let changed = false;
  let shoot = shootOf(farm);
  if (!shoot) {
    shoot = placeNear(farm, 'yggdrasil', SHOOT_PLAN, 1) ?? undefined;
    changed = !!shoot;
  }
  if (shoot) {
    const stage = treeStage(plantedByFamily(farm));
    if ((shoot.variant ?? 0) !== stage) {
      shoot.variant = stage;
      changed = true;
    }
    if (!fardportOf(farm)) changed = !!placeNear(farm, 'fardport', { x: shoot.x + 2, y: shoot.y }, 1) || changed;
  }
  return changed;
}

/** The buildings on the farm that a run reads (GAME.md section 4). */
export function unlocksOf(farm: WorldState): { smithy: boolean; stall: boolean; herb: boolean; longhall: boolean } {
  const has = (k: string): boolean => Object.values(farm.objects).some((o) => o.kind === k);
  return { smithy: has('smithy'), stall: has('stall'), herb: has('herb_garden'), longhall: has('longhall') };
}
export const partyMax = (farm: WorldState): number => (unlocksOf(farm).longhall ? RUN_PARTY_MAX_LONGHALL : RUN_PARTY_MAX);

// ---------------------------------------------------------------------------
// What a player brings: the tree, dishes, animals and buildings
// ---------------------------------------------------------------------------

/** Dishes chosen at the arch, by player (until the run starts). Not saved. */
const CHOICES = new WeakMap<WorldState, Map<string, string[]>>();
const choicesOf = (farm: WorldState): Map<string, string[]> => {
  let m = CHOICES.get(farm);
  if (!m) CHOICES.set(farm, (m = new Map()));
  return m;
};

/** The dishes a player may bring: one slot, two with the node `f1`. */
export const foodSlots = (p: PlayerState): number => FOOD_SLOTS + (treeEffectOf(p, 'gard').slots ?? 0);

/** The sum of a player's planted nodes of the given branch. */
function treeEffectOf(p: PlayerState, branch: 'hjalte' | 'gemenskap' | 'gard'): RunEffect {
  const e: RunEffect = {};
  for (const id of p.run?.tree ?? []) {
    const n = treeNode(id);
    if (n && n.branch === branch) addEffect(e, n.effect);
  }
  return e;
}

/** The party branch is for everybody: of each effect, the largest value any member has planted. */
function partyTree(farm: WorldState, run: RunState): RunEffect {
  const out: RunEffect = {};
  const bag = out as Record<string, number | Record<string, number>>;
  for (const p of humans(farm, run)) {
    const e = treeEffectOf(p, 'gemenskap') as Record<string, number | Record<string, number> | undefined>;
    for (const [k, v] of Object.entries(e)) if (typeof v === 'number') bag[k] = Math.max((bag[k] as number | undefined) ?? 0, v);
  }
  return out;
}

/** Gårdsglädje: the average hearts of the farm's animals in their houses. */
function farmJoy(farm: WorldState): number {
  const stock = Object.values(farm.animals).filter((a) => !a.owner && !!ANIMALS[a.species]?.house && !isMount(a));
  if (!stock.length) return 0;
  return stock.reduce((n, a) => n + a.hearts, 0) / stock.length;
}

/** Everything the farm gives one player at the start of a run (before runor). */
export function farmEffect(farm: WorldState, p: PlayerState, dishes: string[]): RunEffect {
  const e: RunEffect = {};
  const hero = treeEffectOf(p, 'hjalte');
  const gard = treeEffectOf(p, 'gard');
  addEffect(e, hero);
  addEffect(e, gard);
  const un = unlocksOf(farm);
  // dishes (stronger with the node f2)
  for (const d of dishes) addEffect(e, FARDKOST[d] ?? {}, 1 + (gard.food ?? 0));
  // animals of the player's own: the best pet, and a mount if there is a stall; those with 4 hearts count double
  const mine = Object.values(farm.animals).filter((a) => a.owner === p.id);
  const best = (xs: typeof mine): (typeof mine)[number] | undefined => [...xs].sort((a, b) => b.hearts - a.hearts)[0];
  const pet = best(mine.filter((a) => isPetAnimal(a) && !isMount(a)));
  const mount = un.stall ? best(mine.filter((a) => isMount(a))) : undefined;
  const animalMul = 1 + (gard.animal ?? 0);
  if (pet) addEffect(e, PET_EFFECT, animalMul * (pet.hearts >= CARED_HEARTS ? 2 : 1));
  if (mount) addEffect(e, MOUNT_EFFECT, animalMul * (mount.hearts >= CARED_HEARTS ? 2 : 1));
  e.hp = (e.hp ?? 0) + JOY_PER_HEART * farmJoy(farm);
  if (un.smithy) addEffect(e, SMITHY_EFFECT);
  if (un.herb) addEffect(e, HERB_EFFECT);
  return e;
}

/** All that applies to one fighter now: the farm's gifts, the party's tree, and the runor taken (class runor for their class). */
export function effectFor(farm: WorldState, run: RunState, p: PlayerState): RunEffect {
  const e: RunEffect = {};
  addEffect(e, run.base[p.id] ?? {});
  const party = partyTree(farm, run);
  const cls = p.saga?.cls;
  if (p.bot) {
    // the hired companion: the party's gifts, and a stronger fighter with the node g5
    const c = party.companion ?? 0;
    addEffect(e, { ...party, power: (party.power ?? 0) + c, hp: (party.hp ?? 0) + c });
  } else addEffect(e, party);
  for (const id of run.runor) {
    const r = runa(id);
    if (r && (!r.cls || r.cls === cls)) addEffect(e, r.effect);
  }
  return e;
}

/** Hands the current buffs to the fighters of the zone. */
function refresh(farm: WorldState, run: RunState): void {
  const inst = farm.areas?.[run.key]?.saga;
  if (!inst?.run) return;
  inst.run.buffs = {};
  for (const p of members(farm, run)) inst.run.buffs[p.id] = buffsOf(effectFor(farm, run, p));
}

/** Sagafrön to every human in the run (`n` before the bonuses of runor, the tree and modifiers). */
function pay(farm: WorldState, run: RunState, n: number, out: Change[], quiet = false): void {
  if (n <= 0) return;
  for (const p of humans(farm, run)) {
    const bonus = (effectFor(farm, run, p).seeds ?? 0) + MODIFIER_SEEDS * run.plan.modifiers.length;
    // the bonuses are added exactly: whole seeds are paid and the remainder is carried to the next payment
    const exact = n * (1 + bonus) + (run.carry[p.id] ?? 0);
    const amount = Math.floor(exact + 1e-9);
    run.carry[p.id] = exact - amount;
    if (amount <= 0) continue;
    const save = runSaveOf(p);
    save.seeds += amount;
    save.earned += amount;
    run.earned[p.id] = (run.earned[p.id] ?? 0) + amount;
    if (!quiet) out.push(toast(p.id, fmt(RUN_T.seeds, { n: amount })));
    out.push(playerChange(p), treeChange(farm, p));
  }
}

// ---------------------------------------------------------------------------
// Messages for the clients
// ---------------------------------------------------------------------------

function snap(farm: WorldState, run: RunState): RunSnap {
  return {
    id: run.id,
    phase: run.phase,
    zone: run.zone,
    area: run.key,
    biomes: run.plan.zones.slice(0, ZONES_PER_RUN).map((z) => z.biome),
    boss: run.plan.boss,
    weather: run.plan.zones[run.zone]?.weather ?? 'sun',
    modifiers: run.plan.modifiers,
    elapsed: Math.round(run.elapsed),
    max: RUN_MAX_MS,
    party: members(farm, run).map((p) => ({ id: p.id, name: p.name, ...(p.bot ? { bot: true as const } : {}) })),
    runor: [...run.runor],
    earned: { ...run.earned },
  };
}
const stateChange = (farm: WorldState, run: RunState | undefined): Change => ({ t: 'run', ev: 'state', to: null, run: run ? snap(farm, run) : null });

function offerSnap(farm: WorldState, run: RunState): RunOfferSnap | null {
  if (!run.offer) return null;
  const votes: Record<string, number> = {};
  for (const [id, c] of Object.entries(run.offer.votes)) votes[id] = c;
  return { zone: run.offer.from, cards: run.offer.cards, votes, left: Math.max(0, Math.round(run.offer.until - run.elapsed)), rerolls: rerollsLeft(farm, run) };
}
const offerChange = (farm: WorldState, run: RunState): Change => ({ t: 'run', ev: 'offer', to: null, offer: offerSnap(farm, run) });
const rerollsLeft = (farm: WorldState, run: RunState): number => (!run.rerolled && (partyTree(farm, run).reroll ?? 0) >= 1 ? 1 : 0);

/** One player's sagafrön and the tree's growth. */
export function treeChange(farm: WorldState, p: PlayerState): Change {
  const s = readRun(p);
  return { t: 'seed', ev: 'tree', to: p.id, seeds: s.seeds, earned: s.earned, tree: [...s.tree], stage: treeStage(plantedByFamily(farm)) };
}

const banner = (to: string | null, area: string, text: string, sub?: string, kind?: 'enter' | 'boss' | 'cleared' | 'chapter' | 'reward' | 'rest' | 'wipe' | 'level'): Change => ({
  t: 'banner',
  to,
  area,
  text,
  ...(sub ? { sub } : {}),
  ...(kind ? { kind } : {}),
});

// ---------------------------------------------------------------------------
// Starting, joining, leaving
// ---------------------------------------------------------------------------

export interface StartOptions {
  seed?: number;
  replay?: boolean;
  companion?: boolean;
  fardkost?: string[];
}

const distTo = (p: PlayerState, tx: number, ty: number): number => Math.hypot(p.x - tx, p.y - ty) / TILE;

/** The arch window: opens it for the player with their dishes and what they may bring. */
export function openFardport(world: WorldState, p: PlayerState): Change[] {
  const farm = farmOf(world);
  const out: Change[] = [{ t: 'open', to: p.id, ui: 'run' }, treeChange(farm, p), { t: 'fardkost', to: p.id, items: choicesOf(farm).get(p.id) ?? [], slots: foodSlots(p) }];
  const run = RUNS.get(farm);
  out.push(stateChange(farm, run));
  return out;
}

/** The shoot: opens the sagaträd for the player. */
export function openYggdrasil(world: WorldState, p: PlayerState): Change[] {
  return [{ t: 'open', to: p.id, ui: 'seed' }, treeChange(farmOf(world), p)];
}

/** Choose the dishes to bring (the ones that are dishes, in the bag, and fit the slots). */
export function chooseFardkost(world: WorldState, playerId: string, items: string[]): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p) return [];
  const have = new Map<string, number>();
  const chosen: string[] = [];
  for (const id of items) {
    if (chosen.length >= foodSlots(p) || !(id in FARDKOST)) continue;
    const n = (have.get(id) ?? 0) + 1;
    if (countItem(p.inventory, id) < n) continue;
    have.set(id, n);
    chosen.push(id);
  }
  choicesOf(farm).set(p.id, chosen);
  return [{ t: 'fardkost', to: p.id, items: chosen, slots: foodSlots(p) }];
}

/** Takes the chosen dishes out of the bag and adds up what the farm gives this player (and hands out the start potions). */
function bring(farm: WorldState, run: RunState, p: PlayerState, items: string[] | undefined, out: Change[]): void {
  const dishes: string[] = [];
  for (const id of items ?? choicesOf(farm).get(p.id) ?? []) {
    if (dishes.length < foodSlots(p) && id in FARDKOST && removeItem(p.inventory, id, 1)) {
      dishes.push(id);
      out.push(toast(p.id, fmt(RUN_T.food, { item: itemName(id) })));
    }
  }
  choicesOf(farm).delete(p.id);
  run.food[p.id] = dishes;
  const e = farmEffect(farm, p, dishes);
  run.base[p.id] = e;
  // potions come as items: the dishes', the herb garden's and the tree's
  if (e.potions) giveItems(farm, p, 'healing_potion', Math.round(e.potions), out);
  delete e.potions;
  out.push(playerChange(p));
}

/** Starts a run for the players at the arch. */
export function startRun(world: WorldState, playerId: string, opts: StartOptions, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !p.online) return [];
  if (RUNS.get(farm)) return [toast(p.id, RUN_T.already)];
  const arch = fardportOf(farm);
  if (p.area !== 'farm' || !arch || distTo(p, (arch.x + 1.5) * TILE, (arch.y + 1) * TILE) > RUN_JOIN_RADIUS) return [toast(p.id, RUN_T.needPort)];
  if (!p.saga?.cls) return [toast(p.id, T.sagaNeedClass)];
  const max = partyMax(farm);
  const near = Object.values(farm.players)
    .filter((q) => q.id !== p.id && !q.bot && q.online && q.area === 'farm' && !!q.saga?.cls && distTo(q, (arch.x + 1.5) * TILE, (arch.y + 1) * TILE) <= RUN_JOIN_RADIUS)
    .slice(0, max - 1);
  const party = [p, ...near];
  // the chapter's boss, or a cleared one at random on a replay (or when all are cleared)
  const cleared = p.saga.cleared;
  const seed = opts.seed ?? Math.floor(ctx.rnd() * 0x7fffffff);
  let boss = chapterBoss(cleared);
  let replay = false;
  if ((opts.replay && cleared.length) || !boss) {
    const pool = DUNGEON_IDS.filter((id) => cleared.includes(id));
    if (!pool.length) return [];
    boss = pool[(seed >>> 3) % pool.length]!;
    replay = true;
  }
  const clears = readRun(p).clears[boss] ?? 1;
  const plan = generateRun(seed, { boss, replay, clears });
  const run: RunState = {
    id: `run${++counter}`,
    seed,
    plan,
    starter: p.id,
    phase: 'zone',
    zone: 0,
    key: '',
    party: party.map((q) => q.id),
    companions: [],
    elapsed: 0,
    offlineFor: 0,
    warned: false,
    runor: [],
    rerolled: false,
    base: {},
    food: {},
    earned: {},
    carry: {},
    paid: new Set(),
    waiting: [],
    minds: new Map(),
    statePing: 0,
  };
  const out: Change[] = [];
  for (const q of party) {
    bring(farm, run, q, q.id === p.id && opts.fardkost ? opts.fardkost : undefined, out);
    runSaveOf(q).runs++;
  }
  if (party.length === 1 && opts.companion !== false && unlocksOf(farm).longhall) hireCompanion(farm, run, p, out);
  RUNS.set(farm, run);
  out.push(...enterZone(farm, run, 0, ctx));
  for (const q of party) out.push(toast(q.id, RUN_T.started));
  return out;
}

/** The hired companion (Hirdmannen): a fighter the server runs with the test bots' brain, taking the class the player lacks. */
function hireCompanion(farm: WorldState, run: RunState, human: PlayerState, out: Change[]): void {
  const mine = human.saga!.cls!;
  const cls: ClassId = mine === 'helare' ? 'vaktare' : 'helare';
  const c = createPlayer(farm, COMPANION_NAME, { skin: '#c68642', hair: '#6b3e1d', hairStyle: 'short' });
  c.bot = true;
  c.online = true;
  const weapon: Record<ClassId, string> = { vaktare: 'jarnsvard', krigare: 'jarnyxa', helare: 'ekstav', magiker: 'ekstav' };
  const level = heroLevel(human.saga);
  c.saga = { ...newSagaProgress(), cls, heard: true, gear: { weapon: weapon[cls], offhand: 'traskold', amulet: 'stenamulett' }, xp: XP_LEVELS[Math.max(0, level - 1)] ?? 0 };
  c.outfit = { ...c.outfit, hat: CLASSES[cls].outfit.hat, shirt: CLASSES[cls].outfit.shirt };
  addItem(c.inventory, 'healing_potion', 3);
  run.companions.push(c.id);
  run.minds.set(c.id, newMind('careful', () => 0.5));
  out.push(playerChange(c), toast(human.id, fmt(RUN_T.companion, { name: COMPANION_NAME })));
}

function dismissCompanions(farm: WorldState, run: RunState, out: Change[]): void {
  for (const id of run.companions) {
    const c = farm.players[id];
    if (!c) continue;
    const area = farm.areas?.[c.area];
    if (area) delete area.players[id];
    delete farm.players[id];
    out.push({ t: 'player', id, player: null });
  }
  run.companions = [];
}

/** Builds map `i`, moves everyone in, and hands out the buffs. */
function enterZone(farm: WorldState, run: RunState, i: number, ctx: SimCtx): Change[] {
  const out: Change[] = [];
  const old = run.key;
  const key = zoneKey(run.id, i);
  const z = run.plan.zones[i]!;
  const world = buildZone(run.plan, i, key);
  const inst = world.saga!;
  const solo = run.party.length === 1;
  inst.run = {
    run: run.id,
    zone: i,
    name: z.name,
    intro: z.intro,
    hpMul: z.hpMul * (solo ? SOLO_MERCY : 1),
    dmgMul: z.dmgMul,
    bossMul: z.bossMul * (solo ? SOLO_MERCY : 1),
    sight: z.sight,
    leash: z.leash,
    ...(i === ZONES_PER_RUN && run.plan.moves ? { moves: run.plan.moves } : {}),
    buffs: {},
    wipeSub: RUN_T.wipeSub,
    required: z.required,
  };
  (farm.areas ??= {})[key] = world;
  getArea(farm, key);
  run.key = key;
  run.zone = i;
  run.phase = 'zone';
  delete run.offer;
  run.paid = new Set([...run.paid].filter((k) => k.startsWith('x:')));
  run.waiting = [];
  refresh(farm, run);
  for (const p of members(farm, run)) {
    if (p.online) {
      placeIn(farm, p, key, inst.start.x, inst.start.y, 'up', out);
      out.push(banner(p.id, key, z.name, z.intro, 'enter'));
    } else {
      p.area = key;
      p.x = inst.start.x * TILE + TILE / 2;
      p.y = inst.start.y * TILE + TILE / 2;
    }
  }
  if (old) delete farm.areas![old];
  out.push(stateChange(farm, run), { t: 'run', ev: 'offer', to: null, offer: null });
  void ctx;
  return out;
}

/** Joins a run that is going on: at the last lit rest stone of the zone (the start before any is lit). */
export function joinRun(world: WorldState, playerId: string, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const run = RUNS.get(farm);
  if (!p || !run || run.phase === 'ended') return p ? [toast(p.id, RUN_T.noRun)] : [];
  if (run.party.includes(p.id)) return [];
  if (!p.saga?.cls) return [toast(p.id, T.sagaNeedClass)];
  if (p.area !== 'farm') return [toast(p.id, RUN_T.needPort)];
  if (run.party.length >= partyMax(farm)) return [toast(p.id, RUN_T.full)];
  const out: Change[] = [];
  // a lone player's hired companion steps aside for a real friend
  if (run.companions.length) dismissCompanions(farm, run, out);
  run.party.push(p.id);
  bring(farm, run, p, undefined, out);
  runSaveOf(p).runs++;
  refresh(farm, run);
  for (const q of humans(farm, run)) if (q.id !== p.id) out.push(toast(q.id, fmt(RUN_T.joined, { name: p.name })));
  if (run.phase === 'pick') {
    run.waiting.push(p.id);
    out.push(toast(p.id, RUN_T.pickSub));
  } else if (run.phase === 'zone' || run.phase === 'victory') {
    const area = farm.areas![run.key]!;
    const at = openTileNear(area, sagaCheckpoint(area.saga!).x, sagaCheckpoint(area.saga!).y);
    placeIn(farm, p, run.key, at.x, at.y, 'up', out);
    out.push(banner(p.id, run.key, run.plan.zones[run.zone]!.name, run.plan.zones[run.zone]!.intro, 'enter'));
  }
  out.push(stateChange(farm, run), offerChange(farm, run));
  void ctx;
  return out;
}

/** Back to the farm, in front of the arch. */
function sendHome(farm: WorldState, p: PlayerState, out: Change[]): void {
  const front = archFrontOf(farm);
  if (p.area === 'farm') return;
  if (p.online) placeIn(farm, p, 'farm', front.x, front.y, 'down', out);
  else {
    p.area = 'farm';
    p.x = front.x * TILE + TILE / 2;
    p.y = front.y * TILE + TILE / 2;
  }
}

export function leaveRun(world: WorldState, playerId: string, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const run = RUNS.get(farm);
  if (!p || !run || !run.party.includes(p.id)) return [];
  const out: Change[] = [];
  run.party = run.party.filter((id) => id !== p.id);
  run.waiting = run.waiting.filter((id) => id !== p.id);
  if (run.offer) {
    delete run.offer.votes[p.id];
    run.offer.order = run.offer.order.filter((id) => id !== p.id);
  }
  sendHome(farm, p, out);
  out.push(toast(p.id, T.sagaWipeReturn ?? RUN_T.home));
  for (const q of humans(farm, run)) out.push(toast(q.id, fmt(RUN_T.left, { name: p.name })));
  if (!run.party.length) return [...out, ...endRun(farm, run, 'leave', ctx, p.id)];
  refresh(farm, run);
  out.push(stateChange(farm, run));
  if (run.phase === 'pick') out.push(...settleVote(farm, run, ctx, false));
  return out;
}

/** A player who comes back online inside a run (a dropped connection): up at the last rest stone of the zone, or sent home. */
export function rejoinRun(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p) return [];
  const run = RUNS.get(farm);
  const out: Change[] = [];
  const area = run && run.party.includes(p.id) && run.phase !== 'ended' ? farm.areas?.[run.key] : undefined;
  if (!run || !area?.saga) {
    // the run is over (or the server restarted): home, in front of the arch
    const front = archFrontOf(farm);
    placeIn(farm, p, 'farm', front.x, front.y, 'down', out);
    return out;
  }
  delete area.saga.fighters[p.id];
  const at = openTileNear(area, sagaCheckpoint(area.saga).x, sagaCheckpoint(area.saga).y);
  placeIn(farm, p, run.key, at.x, at.y, 'up', out);
  out.push(stateChange(farm, run), offerChange(farm, run));
  return out;
}

// ---------------------------------------------------------------------------
// The way on: the exit, the vote
// ---------------------------------------------------------------------------

/** Using the exit at the end of a zone: when its gate is open, the party votes on a runa. */
function useRunExit(world: WorldState, p: PlayerState, _obj: WorldObject, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  if (!run || run.phase !== 'zone' || !run.party.includes(p.id) || p.area !== run.key) return [];
  const inst = farm.areas?.[run.key]?.saga;
  if (!inst?.gateOpen) return [toast(p.id, RUN_T.exitShut)];
  run.phase = 'pick';
  run.offer = makeOffer(farm, run, ctx, []);
  const out: Change[] = [];
  for (const q of humans(farm, run)) out.push(banner(q.id, run.key, RUN_T.pickTitle, RUN_T.pickSub, 'reward'));
  out.push(stateChange(farm, run), offerChange(farm, run));
  return out;
}
runHooks.exit = useRunExit;

function makeOffer(farm: WorldState, run: RunState, ctx: SimCtx, avoid: string[]): NonNullable<RunState['offer']> {
  const classes = members(farm, run).map((m) => m.saga!.cls!).filter(Boolean);
  return { cards: offerRunor(ctx.rnd, classes, [...run.runor, ...avoid]), votes: {}, order: [], until: run.elapsed + RUN_PICK_MS, from: run.zone };
}

/** A vote for a card. */
export function pickRuna(world: WorldState, playerId: string, card: number, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  const p = farm.players[playerId];
  if (!run || !p || run.phase !== 'pick' || !run.offer || !run.party.includes(p.id)) return [];
  if (!Number.isInteger(card) || card < 0 || card >= run.offer.cards.length) return [];
  if (!(p.id in run.offer.votes)) run.offer.order.push(p.id);
  run.offer.votes[p.id] = card;
  const out: Change[] = [];
  for (const q of humans(farm, run)) if (q.id !== p.id) out.push(toast(q.id, fmt(RUN_T.voted, { name: p.name })));
  out.push(offerChange(farm, run), ...settleVote(farm, run, ctx, false));
  return out;
}

/** Asks for a new offer (the node g3, once per run). */
export function rerollOffer(world: WorldState, playerId: string, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  if (!run || run.phase !== 'pick' || !run.offer || !run.party.includes(playerId)) return [];
  if (!rerollsLeft(farm, run)) return [toast(playerId, RUN_T.noReroll)];
  run.rerolled = true;
  run.offer = makeOffer(farm, run, ctx, run.offer.cards);
  const out: Change[] = [];
  for (const q of humans(farm, run)) out.push(toast(q.id, RUN_T.reroll));
  out.push(offerChange(farm, run));
  return out;
}

/**
 * Ends the vote when it can end: a card with a strict majority of the online players at once; everyone having voted; or
 * the time being up (`late`): the most votes, a tie to the card voted first, no votes at all to the first card.
 */
function settleVote(farm: WorldState, run: RunState, ctx: SimCtx, late: boolean): Change[] {
  const offer = run.offer;
  if (!offer) return [];
  const voters = humans(farm, run).filter((q) => q.online);
  const counts = offer.cards.map(() => 0);
  for (const [id, c] of Object.entries(offer.votes)) if (voters.some((v) => v.id === id)) counts[c]!++;
  const total = counts.reduce((a, b) => a + b, 0);
  const majority = counts.findIndex((n) => n > voters.length / 2);
  let winner = -1;
  if (majority >= 0) winner = majority;
  else if (late || (voters.length > 0 && total >= voters.length)) {
    const top = Math.max(...counts);
    const firstVoted = offer.order.map((id) => offer.votes[id]!).find((c) => counts[c] === top);
    winner = top > 0 ? (firstVoted ?? counts.indexOf(top)) : 0;
  }
  if (winner < 0) return [];
  const id = offer.cards[winner]!;
  run.runor.push(id);
  const out: Change[] = [];
  const r = runa(id);
  for (const q of humans(farm, run)) {
    if (r?.effect.potions && (!r.cls || r.cls === q.saga?.cls)) giveItems(farm, q, 'healing_potion', r.effect.potions, out);
    out.push(banner(q.id, run.key, fmt(RUN_T.picked, { runa: RUNA_NAMES[id] ?? id }), undefined, 'reward'));
  }
  const next = run.zone + 1;
  out.push(...enterZone(farm, run, next, ctx));
  return out;
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

let placesAcc = 0;

/** Runs the run (and, now and then, puts the farm's arch and shoot back if they are missing). Called every tick by `tick`. */
export function tickRuns(world: WorldState, dtMs: number, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const out: Change[] = [];
  placesAcc += dtMs;
  if (placesAcc >= 20_000) {
    placesAcc = 0;
    if (ensureRunPlaces(farm)) {
      for (const o of [shootOf(farm), fardportOf(farm)]) if (o) out.push({ t: 'object', id: o.id, obj: o });
    }
  }
  const run = RUNS.get(farm);
  if (!run || run.phase === 'ended') return out;
  const people = humans(farm, run);
  if (people.some((p) => p.online)) {
    run.elapsed += dtMs;
    run.offlineFor = 0;
  } else {
    run.offlineFor += dtMs;
    if (run.offlineFor >= RUN_OFFLINE_END_MS) return [...out, ...endRun(farm, run, 'leave', ctx)];
  }
  if (!run.warned && run.elapsed >= RUN_WARN_MS) {
    run.warned = true;
    for (const p of people) out.push(banner(p.id, run.key, RUN_T.warn, RUN_T.warnSub));
  }
  if (run.elapsed >= RUN_MAX_MS) return [...out, ...endRun(farm, run, 'time', ctx)];
  // the hired companion plays
  for (const id of run.companions) {
    const mind = run.minds.get(id);
    if (mind) out.push(...botStep(farm, id, mind, ctx, dtMs));
  }
  if (run.phase === 'pick') {
    if (run.offer && run.elapsed >= run.offer.until) out.push(...settleVote(farm, run, ctx, true));
  } else {
    out.push(...watchZone(farm, run, ctx));
  }
  if (RUNS.get(farm) === run && (run.statePing += dtMs) >= 10_000) {
    run.statePing = 0;
    out.push(stateChange(farm, run));
  }
  return out;
}

/** Pays and opens what the zone's fight has earned: packs, the gate, chests, the guard, the boss, the wipe. */
function watchZone(farm: WorldState, run: RunState, ctx: SimCtx): Change[] {
  const area = farm.areas?.[run.key];
  const inst = area?.saga;
  if (!area || !inst) return [];
  const out: Change[] = [];
  const z = run.plan.zones[run.zone]!;
  inst.packs.forEach((pk, i) => {
    const k = `${run.zone}:pack:${i}`;
    if (pk.dead && !run.paid.has(k)) {
      run.paid.add(k);
      pay(farm, run, RUN_SEEDS.pack, out);
    }
  });
  for (const [id, who] of Object.entries(inst.looted)) {
    const k = `${run.zone}:chest:${id}`;
    const chest = area.objects[Number(id)];
    if (who.length && chest && (chest.variant ?? 0) === 0 && !run.paid.has(k)) {
      run.paid.add(k);
      pay(farm, run, RUN_SEEDS.chest, out);
    }
  }
  if (inst.miniDown && !run.paid.has(`${run.zone}:guard`)) {
    run.paid.add(`${run.zone}:guard`);
    pay(farm, run, RUN_SEEDS.guard, out);
  }
  // the gate opens when the packs that were in the way are down
  if (!inst.gateOpen && z.gate === 'packs' && z.required.every((i) => inst.packs[i]?.dead)) {
    inst.gateOpen = true;
    for (const g of inst.gate) {
      const o = objectAt(area, g.x, g.y);
      if (o?.kind === 'saga_gate') {
        removeObject(area, o.id);
        out.push({ t: 'object', id: o.id, obj: null, area: run.key });
      }
    }
    if (z.kind === 'zone') {
      for (const p of humans(farm, run)) {
        runSaveOf(p).zones++;
        out.push(banner(p.id, run.key, RUN_T.zoneClear, RUN_T.zoneClearSub, 'cleared'));
      }
      pay(farm, run, RUN_SEEDS.zone, out);
    }
  }
  if (inst.bossDown && run.phase === 'zone') out.push(...victory(farm, run, ctx));
  if (run.phase === 'victory' && run.victoryAt !== undefined && run.elapsed - run.victoryAt >= RUN_VICTORY_MS) return [...out, ...endRun(farm, run, 'win', ctx)];
  if (inst.wipeAt !== undefined && ctx.now >= inst.wipeAt) return [...out, ...endRun(farm, run, 'wipe', ctx)];
  return out;
}

/** The boss has fallen: its sagafrön, the statistics and a bag of seeds from the farm's crops. */
function victory(farm: WorldState, run: RunState, ctx: SimCtx): Change[] {
  const out: Change[] = [];
  run.phase = 'victory';
  run.victoryAt = run.elapsed;
  run.outcome = 'win';
  const boss = run.plan.boss;
  const bonus = Math.max(0, ...humans(farm, run).map((p) => effectFor(farm, run, p).bossSeeds ?? 0));
  pay(farm, run, (run.plan.replay ? RUN_SEEDS.bossReplay : RUN_SEEDS.bossFirst) + bonus, out);
  const crops = ['carrot', 'potato', 'strawberry', 'tomato', 'pumpkin', 'sunflower', 'wheat'];
  for (const p of humans(farm, run)) {
    // the chapter is cleared for everyone in the party, offline members too (sagasim already did it for those standing in the zone)
    const prog = (p.saga ??= newSagaProgress());
    if (!prog.cleared.includes(boss)) {
      prog.cleared.push(boss);
      bump(p, CLEARED_STAT[boss], 1, out);
    }
    const s = runSaveOf(p);
    s.wins++;
    s.clears[boss] = (s.clears[boss] ?? 0) + 1;
    s.best[boss] = Math.min(s.best[boss] ?? Infinity, Math.round(run.elapsed));
    giveItems(farm, p, `${crops[randInt(ctx.rnd, 0, crops.length - 1)]}_seed`, randInt(ctx.rnd, 3, 6), out);
    out.push(banner(p.id, run.key, RUN_T.win, RUN_T.winSub, 'cleared'), playerChange(p));
  }
  out.push(stateChange(farm, run));
  return out;
}

/** The end of a run, for any reason: everyone home in front of the arch with everything, the zone and the companion gone. */
export function endRun(farm: WorldState, run: RunState, outcome: RunOutcome, ctx: SimCtx, except?: string): Change[] {
  const out: Change[] = [];
  const won = run.outcome === 'win';
  run.phase = 'ended';
  run.outcome = won ? 'win' : outcome;
  for (const p of humans(farm, run)) {
    const s = runSaveOf(p);
    if (outcome === 'wipe') s.wipes++;
    if (outcome === 'time' && !won) s.timeouts++;
    if (outcome === 'time') out.push(banner(p.id, run.key, RUN_T.timeUp, RUN_T.timeUpSub));
    sendHome(farm, p, out);
    if (p.id !== except)
      out.push(
        { t: 'run', ev: 'ended', to: p.id, outcome: run.outcome, ms: Math.round(run.elapsed), seeds: run.earned[p.id] ?? 0, zones: s.zones, runor: [...run.runor] },
        toast(p.id, fmt(RUN_T.summary, { time: fmtDuration(run.elapsed), seeds: run.earned[p.id] ?? 0 })),
        playerChange(p),
      );
  }
  dismissCompanions(farm, run, out);
  delete farm.areas?.[run.key];
  RUNS.delete(farm);
  out.push(stateChange(farm, undefined), { t: 'run', ev: 'offer', to: null, offer: null });
  void ctx;
  return out;
}

// ---------------------------------------------------------------------------
// The sagaträd
// ---------------------------------------------------------------------------

/** Plants a node of the tree with sagafrön. */
export function plantNode(world: WorldState, playerId: string, nodeId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p) return [];
  const err = plantError(p.run, nodeId);
  const n = treeNode(nodeId);
  if (err === 'unknown' || !n) return [];
  if (err === 'planted') return [toast(p.id, RUN_T.plantDone)];
  if (err === 'needs') return [toast(p.id, fmt(RUN_T.plantNeeds, { need: TREE_NAMES[n.needs ?? ''] ?? '' }))];
  if (err === 'seeds') return [toast(p.id, fmt(RUN_T.plantSeeds, { n: n.cost }))];
  const s = runSaveOf(p);
  s.seeds -= n.cost;
  s.tree.push(n.id);
  const out: Change[] = [toast(p.id, fmt(RUN_T.planted, { name: nodeId })), playerChange(p), treeChange(farm, p)];
  const shoot = shootOf(farm);
  const stage = treeStage(plantedByFamily(farm));
  if (shoot && (shoot.variant ?? 0) !== stage) {
    shoot.variant = stage;
    out.push({ t: 'object', id: shoot.id, obj: shoot }, toast(null, RUN_T.treeGrows));
  }
  return out;
}

/** Everything the three client messages of a run do (the server calls this). */
export function runMessage(world: WorldState, playerId: string, msg: { t: 'run' | 'seed' | 'fardkost'; [k: string]: unknown }, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p) return [];
  if (msg.t === 'fardkost') return chooseFardkost(farm, playerId, Array.isArray(msg.items) ? msg.items.filter((x): x is string => typeof x === 'string') : []);
  if (msg.t === 'seed') {
    if (msg.a === 'plant') return plantNode(farm, playerId, String(msg.node ?? ''));
    return [treeChange(farm, p)];
  }
  switch (msg.a) {
    case 'start':
      return startRun(farm, playerId, { replay: msg.replay === true, ...(msg.companion === false ? { companion: false } : {}), ...(Array.isArray(msg.fardkost) ? { fardkost: msg.fardkost.filter((x): x is string => typeof x === 'string') } : {}) }, ctx);
    case 'join':
      return joinRun(farm, playerId, ctx);
    case 'pick':
      return pickRuna(farm, playerId, Math.floor(Number(msg.card)), ctx);
    case 'reroll':
      return rerollOffer(farm, playerId, ctx);
    case 'leave':
      return leaveRun(farm, playerId, ctx);
    default: {
      const run = RUNS.get(farm);
      return [stateChange(farm, run), ...(run ? [offerChange(farm, run)] : [])];
    }
  }
}
