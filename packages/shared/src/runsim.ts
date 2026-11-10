// The rules of a run (färd), GAME.md and GAME2.md. A run is started at the färdport on the farm; the party walks a route of
// ten rows of stops through one dungeon, each stop a saga map built by runmap.ts and fought by sagasim.ts (every fight rule is the
// saga's, a run only hands each fighter its buffs and watches what happens). This file is the run state, the vote on runor and the
// vote on the way on (walking onto a väg-runa), the sagafrön, the timer, the wipe and the end, the Yggdrasil shoot, the farm
// objects and the hired companion.
// The run lives in memory only (like a dungeon): it is never saved, what players earn is paid out at once.
import { ANIMALS, objectDef } from './data.ts';
import { awardTrophy } from './house.ts';
import { awardLooks, lookRng } from './looks.ts';
import { addItem, countItem, removeItem } from './inventory.ts';
import { addObject, mapH, mapW, objectAt, removeObject, tileIndex } from './map.ts';
import type { Change } from './protocol.ts';
import {
  CLASSES,
  DUNGEON_IDS,
  XP_LEVELS,
  heroLevel,
  isRunKey,
  newSagaProgress,
  type ClassId,
  type DungeonId,
} from './saga.ts';
import { sagaCheckpoint } from './sagamap.ts';
import { CLEARED_STAT } from './sagasim.ts';
import { runHooks } from './runhooks.ts';
import { awardPetLooks, giveClearPets, petSeedBonus } from './petsim.ts';
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
  RUN_NUDGE_MS,
  RUN_OFFLINE_END_MS,
  RUN_PARTY_MAX,
  RUN_PARTY_MAX_LONGHALL,
  companionClass,
  runPickMs,
  RUN_SEEDS,
  RUN_VICTORY_MS,
  RUN_WARN_MS,
  SMITHY_EFFECT,
  SOLO_MERCY,
  SAGOANDAN,
  RUN_LEVELS,
  AFFIX_IDS,
  ROUTE_DISC_RADIUS,
  ROUTE_DWELL_MS,
  isCamp,
  isFlockLike,
  ROUTE_VOTE_MS,
  VILOSTEN_HEAL,
  tally,
  type RouteChoiceSnap,
  RUN_LEVEL_DEFAULT,
  RUN_LEVEL_EXTREM,
  LATT,
  levelMuls,
  parseRunLevel,
  type RunLevel,
  addEffect,
  buffsOf,
  newRunSave,
  plantError,
  treeNode,
  treeStage,
  type RunEffect,
  type RunOfferSnap,
  type RunOutcome,
  type RunPhase,
  type RunSave,
  type RunSnap,
} from './run.ts';
import { defaultPath, pathDef, pathsOf } from './paths.ts';
import { canSharpen, heldEffect, offerFor, partyRuna, runa, runaOfRarity, setEffect, tagCounts, type OfferSource, type RunRarity, type RunTag, type RunaHeld } from './runor.ts';
import { buildStop, chapterBoss, generateRun, placeRunes, routeSnap, type RunPlan } from './runmap.ts';
import { SHOP_LEGENDARY_ROW, SHOP_PRICE, SHOP_POTIONS, SHOP_SLOTS, SILVER, defaultChoice, eventDef, packSilver, pickEvent, seedsFromSilver, type EventOutcome } from './events.ts';
import { COMPANION_NAME, EVENT_CHOICES, EVENT_NAMES, PATH_NAMES, RUNA_NAMES, RUN_UI, RUN_T, T, TREE_NAMES, fmt, fmtDuration, itemName } from './sv.ts';
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

/** The boss attacks Lätt allows: its first two, whatever a first run's plan has locked (the lock is Vanlig's variety). */
export const lattMoves = (): number[] => Array.from({ length: LATT.bossMoves }, (_, k) => k);

const tileOf = (v: number): number => Math.floor(v / TILE);

// ---------------------------------------------------------------------------
// The state
// ---------------------------------------------------------------------------

export interface RunState {
  id: string;
  seed: number;
  plan: RunPlan;
  starter: string;
  /** 0 Mycket lätt … 4 Extrem (GAME2.md 5.7). */
  level: RunLevel;
  /** The Sagoandans left (the star on the HUD), and the wipes they (or Lätt) have saved so far. */
  spirit: number;
  spiritUsed: number;
  phase: RunPhase;
  /** The stop now (its id in the route), the stops walked through so far (the last is now) and the map's area key. */
  node: number;
  path: number[];
  key: string;
  /** How many times the way on has been chosen: the Stigfinnare is the party member whose turn it is, rotating. */
  turn: number;
  /** The vote on the way on (phase `route`). */
  vote?: RouteVote;
  /** Players in the run (online or not) and the hired companions (fighters the server runs). */
  party: string[];
  companions: string[];
  /** Run time in ms: it counts while someone in the party is online. */
  elapsed: number;
  offlineFor: number;
  warned: boolean;
  /** How many "Dags att gå hem?" nudges have gone out (the first at 30:00, then one every 10 minutes). */
  nudges: number;
  /** Färdkassan (Hacksilver): one purse for the party, earned in fights and events, spent at the Köpman; what is left at the end becomes sagafrön. */
  purse: number;
  /** The Köpman's wares in the stop the party is in (a Köpman stop), and the Händelse being voted on (phase `event`) and those met so far. */
  shop?: ShopStock;
  event?: { id: string; votes: Record<string, number>; until: number };
  metEvents: string[];
  /** Blessings from events for the rest of the run (for everyone). */
  blessed: RunEffect;
  /** The party-wide runor taken so far (events, the Mellanboss, bosses: they help everyone), and each hero's own runor with how sharp they are. */
  runor: string[];
  hold: Record<string, RunaHeld[]>;
  /** The cards each hero is looking at (phase `pick`), where they come from, and when the clock ends the choosing. Offers in a row without an ovanlig, and the rerolls a hero has used. */
  offers: Record<string, PersonalOffer>;
  offerFrom: number;
  offerUntil?: number;
  pity: Record<string, number>;
  rerolls: Record<string, number>;
  /** The path each hero has chosen (paths.ts), and while everyone chooses (phase `path`) when the clock ends it. */
  paths: Record<string, string>;
  pathUntil?: number;
  /** What each player brings from the farm (tree, dishes, animals, buildings): added up once at the start or on joining. */
  base: Record<string, RunEffect>;
  food: Record<string, string[]>;
  /** Who has been brought in for this run (their dishes, potions and the run count): a rejoiner is not brought twice. Never saved. */
  brought: Set<string>;
  earned: Record<string, number>;
  /** The fraction of a sagafrö each player is owed by the bonuses (whole seeds are paid; never saved). */
  carry: Record<string, number>;
  paid: Set<string>;
  /** Players who joined while the cards were out: they enter the next stop. */
  waiting: string[];
  victoryAt?: number;
  outcome?: RunOutcome;
  minds: Map<string, BotMind>;
  statePing: number;
}

/** One hero's cards: what they have tapped so far (they may change it until the choosing ends), and where the cards come from. */
/** What the Köpman holds in this stop: each hero's three runor, a gemensam runa, how many potions are left, whether the Sagoandan is sold. */
export interface ShopStock {
  slots: Record<string, { id: string; rarity: RunRarity; bought: boolean }[]>;
  party: { id: string; bought: boolean } | null;
  potions: number;
  spirit: boolean;
}

export interface PersonalOffer {
  cards: string[];
  picked?: number;
  source: OfferSource;
}

/** The väg-runor on the floor and who stands on them: a player counts after `ROUTE_DWELL_MS` on the same rune, or at once by using it. */
export interface RouteVote {
  runes: { node: number; kind: RouteChoiceSnap['kind']; x: number; y: number; id: number }[];
  on: Record<string, { c: number; since: number; done: boolean }>;
  /** Run time (ms) when the first player stepped onto a rune; the vote ends `ROUTE_VOTE_MS` later. */
  first?: number;
  sig: string;
}

const RUNS = new WeakMap<WorldState, RunState>();
let counter = 0;

/** The run going on in this world's farm, if any. */
export const runOf = (world: WorldState): RunState | undefined => RUNS.get(farmOf(world));
const stopKey = (id: string, node: number): string => `saga:${id}z${node}`;
const humans = (farm: WorldState, run: RunState): PlayerState[] => run.party.map((id) => farm.players[id]).filter((p): p is PlayerState => !!p);
const members = (farm: WorldState, run: RunState): PlayerState[] => [...humans(farm, run), ...run.companions.map((id) => farm.players[id]).filter((p): p is PlayerState => !!p)];

/**
 * Gives items into the world the player stands in (the stop's, while in a stop): what does not fit in the bag lands on the
 * ground there, and the `drop` change names that area.
 */
function giveHere(farm: WorldState, p: PlayerState, item: string, count: number, out: Change[]): void {
  const world = p.area === 'farm' ? farm : (getArea(farm, p.area) ?? farm);
  const from = out.length;
  giveItems(world, p, item, count, out);
  if (p.area === 'farm') return;
  for (let i = from; i < out.length; i++) {
    const c = out[i]!;
    if (c.t === 'drop' && c.area === undefined) out[i] = { ...c, area: p.area };
  }
}

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
      if (BLOCKED.has(a.terrain[tileIndex(a, tx, ty)] ?? '') || a.crops[`${tx},${ty}`]) return false;
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
  const pet = best(mine.filter((a) => isPetAnimal(a) && !isMount(a) && !a.petKind)); // (a pets.ts pet helps for real in the fights instead)
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
  // the party-wide runor help everyone (the hired companion too); a hero's own runor are theirs, sharper by skärpa, and two or four of a tag give a set bonus
  for (const id of run.runor) addEffect(e, runa(id)?.effect ?? {});
  addEffect(e, run.blessed);
  const held = run.hold[p.id] ?? [];
  for (const h of held) addEffect(e, heldEffect(h));
  if (!p.bot) addEffect(e, setEffect(tagCounts(held, run.runor)));
  const path = pathDef(run.paths[p.id]);
  if (path && path.cls === cls) {
    addEffect(e, path.effect);
    addEffect(e, { mods: path.mods, traits: path.traits });
  }
  return e;
}

/** Hands the current buffs to the fighters of the stop. */
function refresh(farm: WorldState, run: RunState): void {
  const inst = farm.areas?.[run.key]?.saga;
  if (!inst?.run) return;
  inst.run.buffs = {};
  for (const p of members(farm, run)) inst.run.buffs[p.id] = buffsOf(effectFor(farm, run, p));
}

/** Sagafrön to every human in the run (`n` before the bonuses of runor, the tree and modifiers). */
function pay(farm: WorldState, run: RunState, base: number | ((p: PlayerState) => number), out: Change[], quiet = false): void {
  for (const p of humans(farm, run)) {
    const n = typeof base === 'function' ? base(p) : base;
    if (n <= 0) continue;
    const bonus = (effectFor(farm, run, p).seeds ?? 0) + petSeedBonus(farm, p, run.level) + MODIFIER_SEEDS * run.plan.modifiers.filter((m) => !AFFIX_IDS.includes(m)).length;
    // the bonuses are added exactly: whole seeds are paid and the remainder is carried to the next payment
    const exact = n * (1 + bonus) * levelMuls(run.level).seeds + (run.carry[p.id] ?? 0);
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

/** Who has the turn to break a tie on the way on (a human of the party, rotating each row; null with nobody in it). */
export function finderOf(farm: WorldState, run: RunState): string | null {
  const people = humans(farm, run);
  return people.length ? people[run.turn % people.length]!.id : null;
}

/** The humans who vote on the way on: online and standing in the stop (a friend who joined during the cards waits on the farm). */
const voters = (farm: WorldState, run: RunState): PlayerState[] => humans(farm, run).filter((q) => q.online && q.area === run.key);

function snap(farm: WorldState, run: RunState): RunSnap {
  const z = run.plan.stops[run.node]!;
  const vote = run.phase === 'route' ? run.vote : undefined;
  return {
    id: run.id,
    phase: run.phase,
    node: run.node,
    row: z.row,
    kind: z.kind,
    path: [...run.path],
    route: routeSnap(run.plan.route),
    area: run.key,
    boss: run.plan.boss,
    weather: z.weather,
    modifiers: run.plan.modifiers,
    elapsed: Math.round(run.elapsed),
    max: RUN_MAX_MS,
    party: members(farm, run).map((p) => ({ id: p.id, name: p.name, ...(p.bot ? { bot: true as const } : {}) })),
    finder: finderOf(farm, run),
    ...(vote
      ? {
          choices: vote.runes.map((r, c) => ({ node: r.node, kind: r.kind, x: r.x, y: r.y, on: Object.entries(vote.on).filter(([, v]) => v.c === c).map(([id]) => id) })),
          routeLeft: vote.first === undefined ? -1 : Math.max(0, Math.round(vote.first + ROUTE_VOTE_MS - run.elapsed)),
        }
      : {}),
    level: run.level,
    spirit: run.spirit,
    spiritUsed: run.spiritUsed,
    runor: [...run.runor],
    purse: run.purse,
    ...(run.shop && run.plan.stops[run.node]!.kind === 'shop' ? { shop: shopSnap(farm, run) } : {}),
    ...(run.event && run.phase === 'event' ? { event: { id: run.event.id, choices: eventDef(run.event.id)!.choices.map((c) => ({ id: c.id, cost: c.cost ?? 0 })), votes: { ...run.event.votes }, left: Math.max(0, Math.round(run.event.until - run.elapsed)) } } : {}),
    hold: Object.fromEntries(Object.entries(run.hold).map(([id, hs]) => [id, hs.map((h) => ({ ...h }))])),
    earned: { ...run.earned },
    paths: { ...run.paths },
    ...(run.phase === 'path' ? { pick: { kind: 'path' as const, left: Math.max(0, Math.round((run.pathUntil ?? run.elapsed) - run.elapsed)), done: Object.keys(run.paths).filter((id) => run.party.includes(id)) } } : {}),
    ...(run.phase === 'pick' ? { pick: { kind: 'runa' as const, left: Math.max(0, Math.round((run.offerUntil ?? run.elapsed) - run.elapsed)), done: Object.entries(run.offers).filter(([, o]) => o.picked !== undefined).map(([id]) => id) } } : {}),
    ...(run.plan.stops[run.node]!.kind === 'rest' && (run.phase === 'stop' || run.phase === 'route') ? { restChoice: humans(farm, run).filter((q) => !run.paid.has(restToken(run, q.id))).map((q) => q.id) } : {}),
  };
}
const stateChange = (farm: WorldState, run: RunState | undefined): Change => ({ t: 'run', ev: 'state', to: null, run: run ? snap(farm, run) : null });

/** What the Köpman shows: the prices are the same every visit (events.ts). */
function shopSnap(farm: WorldState, run: RunState): NonNullable<RunSnap['shop']> {
  const st = run.shop!;
  const def = RUN_LEVELS[run.level];
  return {
    slots: Object.fromEntries(Object.entries(st.slots).map(([id, xs]) => [id, xs.map((x) => ({ id: x.id, rarity: x.rarity, price: SHOP_PRICE.runa[x.rarity], bought: x.bought }))])),
    party: st.party ? { id: st.party.id, rarity: runa(st.party.id)?.rarity ?? 'ovanlig', price: SHOP_PRICE.party, bought: st.party.bought } : null,
    potions: st.potions,
    spirit: def.spiritMax > 0 && (run.spirit < def.spiritMax || st.spirit) ? !st.spirit : null,
  };
}

/** One hero's cards as they see them (null: none now). */
function offerSnap(farm: WorldState, run: RunState, pid: string): RunOfferSnap | null {
  const o = run.offers[pid];
  if (!o || run.phase !== 'pick') return null;
  return { node: run.offerFrom, cards: [...o.cards], ...(o.picked !== undefined ? { picked: o.picked } : {}), source: o.source, left: Math.max(0, Math.round((run.offerUntil ?? run.elapsed) - run.elapsed)), rerolls: rerollsLeft(farm, run, pid), done: Object.entries(run.offers).filter(([, x]) => x.picked !== undefined).map(([id]) => id) };
}
/** The offers to send: each hero gets their own; `to: null` with no offer clears them all. */
const offerChanges = (farm: WorldState, run: RunState): Change[] => (run.phase === 'pick' ? humans(farm, run).map((q) => ({ t: 'run' as const, ev: 'offer' as const, to: q.id, offer: offerSnap(farm, run, q.id) })) : [{ t: 'run', ev: 'offer', to: null, offer: null }]);
/** Rerolls a hero has left: one a run with the node g3. */
const rerollsLeft = (farm: WorldState, run: RunState, pid: string): number => (partyTree(farm, run).reroll ?? 0) >= 1 ? Math.max(0, 1 - (run.rerolls[pid] ?? 0)) : 0;
/** The token of the choice at a Vilosten: Vila or skärp a runa, once for each hero and stop. */
const restToken = (run: RunState, pid: string): string => `${run.node}:rest:${pid}`;

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
  /** 0 Lätt or 1 Vanlig (the default). */
  level?: RunLevel;
  /** The dungeon (chapter) to run: the one the starter has cleared or the next one; left out, the next one (GAME2.md section 2). */
  dungeon?: DungeonId;
}

/** Which dungeons a player may run: the ones they have cleared and the next one in the saga's order. */
export const runnableDungeons = (cleared: readonly DungeonId[]): DungeonId[] => DUNGEON_IDS.filter((id) => cleared.includes(id) || id === chapterBoss(cleared));

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
  run.brought.add(p.id);
  const e = farmEffect(farm, p, dishes);
  run.base[p.id] = e;
  // potions come as items: the dishes', the herb garden's and the tree's
  if (e.potions) giveHere(farm, p, 'healing_potion', Math.round(e.potions), out);
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
  // a parent may cap the highest level a character plays: the arch refuses to start and says who is capped
  const wanted = opts.level ?? RUN_LEVEL_DEFAULT;
  const capped = party.filter((q) => wanted > (ctx.levelCap?.(q.id) ?? RUN_LEVEL_EXTREM));
  if (capped.length) return [toast(p.id, fmt(RUN_T.capped, { names: capped.map((q) => q.name).join(', '), level: T.runLevelName[wanted]! }))];
  // the dungeon asked for (one cleared, or the next), else the chapter's, or a cleared one at random on a replay (or when all are cleared)
  const cleared = p.saga.cleared;
  const seed = opts.seed ?? Math.floor(ctx.rnd() * 0x7fffffff);
  let boss = chapterBoss(cleared);
  let replay = false;
  if (opts.dungeon !== undefined) {
    if (!runnableDungeons(cleared).includes(opts.dungeon)) return [toast(p.id, RUN_T.badDungeon)];
    boss = opts.dungeon;
    replay = cleared.includes(boss);
  } else if ((opts.replay && cleared.length) || !boss) {
    const pool = DUNGEON_IDS.filter((id) => cleared.includes(id));
    if (!pool.length) return [];
    boss = pool[(seed >>> 3) % pool.length]!;
    replay = true;
  }
  const clears = readRun(p).clears[boss] ?? 1;
  const plan = generateRun(seed, { boss, replay, clears, level: opts.level ?? RUN_LEVEL_DEFAULT });
  const run: RunState = {
    id: `run${++counter}`,
    seed,
    plan,
    starter: p.id,
    level: opts.level ?? RUN_LEVEL_DEFAULT,
    spirit: SAGOANDAN[opts.level ?? RUN_LEVEL_DEFAULT],
    spiritUsed: 0,
    phase: 'stop',
    node: 0,
    path: [],
    turn: 0,
    key: '',
    party: party.map((q) => q.id),
    companions: [],
    elapsed: 0,
    offlineFor: 0,
    warned: false,
    nudges: 0,
    purse: 0,
    metEvents: [],
    blessed: {},
    runor: [],
    hold: {},
    offers: {},
    offerFrom: 0,
    pity: {},
    rerolls: {},
    paths: {},
    base: {},
    food: {},
    brought: new Set(),
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
  if (opts.companion !== false) hireCompanion(farm, run, party, out);
  RUNS.set(farm, run);
  out.push(...enterStop(farm, run, 0, ctx));
  for (const q of party) out.push(toast(q.id, RUN_T.started));
  return out;
}

/** The hired companion (Hirdmannen): a fighter the server runs with the test bots' brain, taking the class the player lacks. */
function hireCompanion(farm: WorldState, run: RunState, humansIn: PlayerState[], out: Change[]): void {
  // one or two humans get the Hirdmannen, no longhouse needed (GAME.md section 6): the class the party lacks
  const cls = companionClass(humansIn.map((q) => q.saga?.cls).filter((x): x is ClassId => !!x));
  if (!cls) return;
  const human = humansIn[0]!;
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
  out.push(playerChange(c));
  for (const q of humansIn) out.push(toast(q.id, fmt(RUN_T.companion, { name: COMPANION_NAME })));
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

/** Builds the map of stop `node`, moves everyone in, and hands out the buffs (the vote on the way on calls this; the tests use it to go straight to a stop). */
export function enterStop(farm: WorldState, run: RunState, node: number, ctx: SimCtx): Change[] {
  const out: Change[] = [];
  const old = run.key;
  const key = stopKey(run.id, node);
  const z = run.plan.stops[node]!;
  const world = buildStop(run.plan, node, key);
  const inst = world.saga!;
  // the mercy is for one human with the hired companion (two fighters), not for a lone player without one
  const solo = run.party.length === 1 && run.companions.length > 0;
  const lvl = levelMuls(run.level);
  const def = RUN_LEVELS[run.level];
  const easy = def.soft;
  // the gentle levels: more Sagoandar after each stop (up to a few: the star on the HUD must stay readable)
  if (def.spiritPerStop > 0 && run.path.length > 0) run.spirit = Math.min(def.spiritMax, run.spirit + def.spiritPerStop);
  // the two gentlest levels: the boss (and the mid-boss, and the guard) use only their first two attacks
  const moves = def.bossMoves > 0 ? lattMoves() : z.kind === 'boss' ? run.plan.moves : undefined;
  inst.run = {
    run: run.id,
    node,
    row: z.row,
    kind: z.kind,
    name: z.name,
    intro: z.intro,
    hpMul: z.hpMul * (solo ? SOLO_MERCY : 1) * lvl.hp,
    dmgMul: z.dmgMul * lvl.dmg,
    bossMul: z.bossMul * (solo ? SOLO_MERCY : 1) * lvl.hp,
    sight: z.sight,
    leash: z.leash,
    ...(moves ? { moves } : {}),
    ...(lvl.warn !== 1 || lvl.hp !== 1 ? { warnMul: lvl.warn, levelHp: lvl.hp } : {}),
    ...(easy ? { soft: true } : {}),
    ...(z.bossDmg ? { bossDmg: z.bossDmg } : {}),
    ...(z.enrage ? { enrage: true } : {}),
    ...(z.grow ? { grow: z.grow } : {}),
    ...(def.rare !== 1 ? { lootRare: def.rare } : {}),
    ...(def.rank ? { lootRank: def.rank } : {}),
    spirit: run.spirit,
    used: run.spiritUsed,
    buffs: {},
    wipeSub: RUN_T.wipeSub,
    required: z.required,
    level: run.level,
  };
  (farm.areas ??= {})[key] = world;
  getArea(farm, key);
  run.key = key;
  run.node = node;
  run.path.push(node);
  run.phase = 'stop';
  run.offers = {};
  delete run.offerUntil;
  delete run.vote;
  delete run.event;
  delete run.shop;
  if (z.kind === 'shop') run.shop = stockShop(farm, run, ctx);
  run.paid = new Set([...run.paid].filter((k) => k.startsWith('x:')));
  run.waiting = [];
  refresh(farm, run);
  if (def.spiritPerStop > 0 && run.path.length > 1) for (const q of humans(farm, run)) out.push(toast(q.id, RUN_T.spiritGained));
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

/** Joins a run that is going on: at the last lit rest stone of the stop (the start before any is lit). */
export function joinRun(world: WorldState, playerId: string, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const run = RUNS.get(farm);
  if (!p || !run || run.phase === 'ended') return p ? [toast(p.id, RUN_T.noRun)] : [];
  if (run.party.includes(p.id)) return [];
  if (!p.saga?.cls) return [toast(p.id, T.sagaNeedClass)];
  if (p.area !== 'farm') return [toast(p.id, RUN_T.needPort)];
  if (run.party.length >= partyMax(farm)) return [toast(p.id, RUN_T.full)];
  const cap = ctx.levelCap?.(p.id) ?? RUN_LEVEL_EXTREM;
  if (run.level > cap) return [toast(p.id, fmt(RUN_T.cappedYou, { max: T.runLevelName[cap]! }))];
  const out: Change[] = [];
  // a lone player's hired companion steps aside for a real friend
  if (run.companions.length) dismissCompanions(farm, run, out);
  run.party.push(p.id);
  // someone who left and comes back is not brought in again: no second run counted, no second potions, and the dishes of the first time still count
  if (!run.brought.has(p.id)) {
    bring(farm, run, p, undefined, out);
    runSaveOf(p).runs++;
  }
  if (run.path.some((n) => run.plan.route.nodes[n]?.kind === 'mini') && run.phase !== 'path') assignPath(run, p, ctx);
  refresh(farm, run);
  for (const q of humans(farm, run)) if (q.id !== p.id) out.push(toast(q.id, fmt(RUN_T.joined, { name: p.name })));
  if (run.phase === 'pick') {
    run.waiting.push(p.id);
    out.push(toast(p.id, RUN_T.pickSub));
  } else if (run.phase === 'stop' || run.phase === 'route' || run.phase === 'victory') {
    const area = farm.areas![run.key]!;
    const at = openTileNear(area, sagaCheckpoint(area.saga!).x, sagaCheckpoint(area.saga!).y);
    placeIn(farm, p, run.key, at.x, at.y, 'up', out);
    out.push(banner(p.id, run.key, run.plan.stops[run.node]!.name, run.plan.stops[run.node]!.intro, 'enter'));
  }
  out.push(stateChange(farm, run), ...offerChanges(farm, run));
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
  delete run.offers[p.id];
  sendHome(farm, p, out);
  out.push(toast(p.id, T.sagaWipeReturn ?? RUN_T.home));
  for (const q of humans(farm, run)) out.push(toast(q.id, fmt(RUN_T.left, { name: p.name })));
  if (!run.party.length) return [...out, ...endRun(farm, run, 'leave', ctx, p.id)];
  refresh(farm, run);
  out.push(stateChange(farm, run));
  if (run.phase === 'pick') out.push(...settleOffers(farm, run, ctx, false));
  if (run.phase === 'path') out.push(...settlePaths(farm, run, ctx, false));
  if (run.phase === 'event') {
    delete run.event?.votes[p.id];
    out.push(...settleEvent(farm, run, ctx, false));
  }
  if (run.phase === 'route') out.push(...tickRoute(farm, run, ctx));
  return out;
}

/** A player who comes back online inside a run (a dropped connection): up at the last rest stone of the stop, or sent home. */
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
  out.push(stateChange(farm, run), ...offerChanges(farm, run));
  return out;
}

// ---------------------------------------------------------------------------
// The way on: the runa cards, then the väg-runor
// ---------------------------------------------------------------------------

/**
 * Using a väg-runa (the action key while standing on it) counts as stepping onto it and staying: for those who play with a
 * key or a pad and would rather press than wait. Walking onto one is the way (the vote is spatial, tickRoute).
 */
function useRunExit(world: WorldState, p: PlayerState, obj: WorldObject, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  if (!run || !run.party.includes(p.id) || p.area !== run.key) return [];
  if (run.phase !== 'route' || !run.vote) return [toast(p.id, RUN_T.exitShut)];
  const c = run.vote.runes.findIndex((r) => r.id === obj.id);
  const on = run.vote.on[p.id];
  if (c >= 0 && on && on.c === c) on.done = true;
  return tickRoute(farm, run, ctx);
}
runHooks.exit = useRunExit;

/** Hacksilver earned: a half more on the two easiest levels, where the packs are smaller (a child's Köpman should have something to sell). */
const silverFor = (run: RunState, n: number): number => Math.round(n * (run.level <= 1 ? 1.5 : 1));

/** The stop is cleared: the cards of a runa after a fight (a Flock, the Mellanboss), and then the way on. */
function stopCleared(farm: WorldState, run: RunState, ctx: SimCtx): Change[] {
  const z = run.plan.stops[run.node]!;
  const out: Change[] = [];
  // after the Mellanboss everyone chooses a path first (paths.ts), then the runor
  if (z.kind === 'mini') return startPaths(farm, run, ctx);
  if (z.kind === 'flock') return openCards(farm, run, ctx, 'flock');
  if (z.kind === 'elite') return openCards(farm, run, ctx, 'stark');
  if (z.kind === 'treasure') return openCards(farm, run, ctx, 'skatt');
  if (z.kind === 'event') return startEvent(farm, run);
  return startRoute(farm, run);
}

// ---------------------------------------------------------------------------
// Hacksilver, the Köpman and the Händelser
// ---------------------------------------------------------------------------

/** The Köpman's wares for this visit: a runa of each of the three rarities for each hero (the legendary one only past row 4), a gemensam runa, potions, the Sagoandan. */
function stockShop(farm: WorldState, run: RunState, ctx: SimCtx): ShopStock {
  const row = run.plan.stops[run.node]!.row;
  const slots: ShopStock['slots'] = {};
  for (const q of humans(farm, run)) {
    const cls = q.saga?.cls;
    if (!cls) continue;
    const taken: string[] = [];
    slots[q.id] = [];
    for (const rarity of SHOP_SLOTS) {
      if (rarity === 'legendarisk' && row <= SHOP_LEGENDARY_ROW) continue;
      const id = runaOfRarity(ctx.rnd, { cls, ...(run.paths[q.id] ? { path: run.paths[q.id]! } : {}), held: run.hold[q.id] ?? [], rarity, avoid: taken });
      if (!id) continue;
      taken.push(id);
      slots[q.id]!.push({ id, rarity, bought: false });
    }
  }
  const party = partyRuna(ctx.rnd, run.runor, 'ovanlig');
  void farm;
  return { slots, party: party ? { id: party, bought: false } : null, potions: SHOP_POTIONS, spirit: false };
}

const shopOpen = (run: RunState, p: PlayerState): boolean => !!run.shop && run.plan.stops[run.node]!.kind === 'shop' && (run.phase === 'stop' || run.phase === 'route') && p.area === run.key && run.party.includes(p.id);

/** Buys something at the Köpman with Färdkassan: anyone in the party may spend (what they buy is shown to everyone). */
export function buyItem(world: WorldState, playerId: string, msg: Record<string, unknown>, ctx: SimCtx): Change[] {
  void ctx;
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  const p = farm.players[playerId];
  if (!run || !p || !shopOpen(run, p)) return p ? [toast(p.id, RUN_T.shopNone)] : [];
  const st = run.shop!;
  const out: Change[] = [];
  let price = 0;
  let name = '';
  switch (msg.item) {
    case 'runa': {
      const slot = st.slots[p.id]?.[Math.floor(Number(msg.slot))];
      if (!slot || slot.bought) return [];
      price = SHOP_PRICE.runa[slot.rarity];
      if (run.purse < price) return [toast(p.id, RUN_UI.tooPoor)];
      slot.bought = true;
      (run.hold[p.id] ??= []).push({ id: slot.id, up: 0 });
      name = RUNA_NAMES[slot.id] ?? slot.id;
      break;
    }
    case 'party': {
      if (!st.party || st.party.bought) return [];
      price = SHOP_PRICE.party;
      if (run.purse < price) return [toast(p.id, RUN_UI.tooPoor)];
      st.party.bought = true;
      run.purse -= price;
      out.push(...giveParty(farm, run, ctx.rnd, 'vanlig', st.party.id));
      name = RUNA_NAMES[st.party.id] ?? st.party.id;
      price = 0;
      break;
    }
    case 'potion': {
      if (st.potions <= 0) return [];
      price = SHOP_PRICE.potion;
      if (run.purse < price) return [toast(p.id, RUN_UI.tooPoor)];
      st.potions--;
      giveHere(farm, p, 'healing_potion', 1, out);
      name = RUN_UI.itemPotion;
      break;
    }
    case 'spirit': {
      const def = RUN_LEVELS[run.level];
      if (st.spirit || def.spiritMax <= 0 || run.spirit >= def.spiritMax) return [];
      price = SHOP_PRICE.spirit;
      if (run.purse < price) return [toast(p.id, RUN_UI.tooPoor)];
      st.spirit = true;
      run.spirit++;
      const link = farm.areas?.[run.key]?.saga?.run;
      if (link) link.spirit = run.spirit;
      name = RUN_UI.itemSpirit;
      break;
    }
    case 'sharpen': {
      const h = (run.hold[p.id] ?? []).find((x) => x.id === msg.id);
      if (!h || !canSharpen(h)) return [toast(p.id, RUN_T.noSharpen)];
      price = SHOP_PRICE.sharpen;
      if (run.purse < price) return [toast(p.id, RUN_UI.tooPoor)];
      h.up++;
      name = RUN_UI.itemSharpen;
      break;
    }
    default:
      return [];
  }
  run.purse -= price;
  refresh(farm, run);
  for (const q of humans(farm, run)) out.push(toast(q.id, fmt(RUN_UI.boughtBy, { name: p.name, item: name })));
  out.push(stateChange(farm, run));
  return out;
}

/** The Händelse's glade: a picture, a story and two or three choices; everyone votes (the same rule as every vote of a run). */
function startEvent(farm: WorldState, run: RunState): Change[] {
  const id = pickEvent(run.seed, run.node, run.metEvents);
  run.metEvents.push(id);
  run.phase = 'event';
  run.event = { id, votes: {}, until: run.elapsed + runPickMs(run.level) };
  const out: Change[] = [];
  for (const q of humans(farm, run)) out.push(banner(q.id, run.key, EVENT_NAMES[id] ?? id, RUN_UI.eventIntro, 'reward'));
  out.push(stateChange(farm, run));
  return out;
}

/** A hero votes for a choice of the Händelse (they may change it until it is settled). A choice they cannot pay for is refused. */
export function voteEvent(world: WorldState, playerId: string, choice: number, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  const p = farm.players[playerId];
  const def = run?.event ? eventDef(run.event.id) : undefined;
  if (!run || !p || !def || run.phase !== 'event' || !run.event || !run.party.includes(p.id)) return [];
  if (!Number.isInteger(choice) || choice < 0 || choice >= def.choices.length) return [toast(p.id, RUN_T.eventBad)];
  if ((def.choices[choice]!.cost ?? 0) > run.purse) return [toast(p.id, RUN_T.eventTooPoor)];
  const first = !(p.id in run.event.votes);
  run.event.votes[p.id] = choice;
  const out: Change[] = [];
  if (first) for (const q of humans(farm, run)) if (q.id !== p.id) out.push(toast(q.id, fmt(RUN_T.voted, { name: p.name })));
  out.push(stateChange(farm, run), ...settleEvent(farm, run, ctx, false));
  return out;
}

/** The vote ends when everyone online has voted (the strict majority ends it at once) or on the clock (the most votes; a tie to the first voted; nobody voting: the first free choice). */
function settleEvent(farm: WorldState, run: RunState, ctx: SimCtx, late: boolean): Change[] {
  const ev = run.event;
  const def = ev ? eventDef(ev.id) : undefined;
  if (run.phase !== 'event' || !ev || !def) return [];
  const online = humans(farm, run).filter((q) => q.online);
  const counts = def.choices.map(() => 0);
  for (const [id, c] of Object.entries(ev.votes)) if (online.some((q) => q.id === id)) counts[c]!++;
  const done = tally(counts, online.length, { late, majority: true });
  if (!done) return [];
  const firstVoted = Object.keys(ev.votes).map((id) => ev.votes[id]!).find((c) => done.includes(c));
  const winner = done.length === 0 ? defaultChoice(def) : (firstVoted ?? done[0]!);
  return resolveEvent(farm, run, ctx, winner);
}

/** What the chosen choice does (events.ts): Hacksilver, a runa for everyone, healing, potions, a blessing, skärpa, cards, a Sagoande. Never takes anything the party has but the silver a choice names. */
function resolveEvent(farm: WorldState, run: RunState, ctx: SimCtx, index: number): Change[] {
  const ev = run.event!;
  const def = eventDef(ev.id)!;
  const choice = def.choices[index] ?? def.choices[defaultChoice(def)]!;
  const out: Change[] = [];
  delete run.event;
  run.phase = 'stop';
  run.purse = Math.max(0, run.purse - (choice.cost ?? 0));
  const inst = farm.areas?.[run.key]?.saga;
  let cards: OfferSource | null = null;
  for (const o of choice.outcome as EventOutcome[]) {
    if ('silver' in o) run.purse += o.silver;
    else if ('party' in o) out.push(...giveParty(farm, run, ctx.rnd, o.party, undefined, o.tags));
    else if ('heal' in o) {
      for (const q of members(farm, run)) {
        const f = inst?.fighters[q.id];
        if (!f) continue;
        delete f.down;
        f.hp = Math.min(f.max, Math.max(1, f.hp + Math.round(f.max * o.heal)));
      }
    } else if ('potions' in o) for (const q of humans(farm, run)) giveHere(farm, q, 'healing_potion', o.potions, out);
    else if ('effect' in o) addEffect(run.blessed, o.effect);
    else if ('sharpen' in o) {
      for (const q of humans(farm, run)) {
        const h = (run.hold[q.id] ?? []).filter((x) => canSharpen(x)).sort((a, b) => a.up - b.up)[0];
        if (h) {
          h.up++;
          out.push(toast(q.id, fmt(RUN_T.sharpened, { runa: RUNA_NAMES[h.id] ?? h.id })));
        }
      }
    } else if ('cards' in o) cards = o.cards;
    else if ('spirit' in o) {
      run.spirit = Math.min(5, run.spirit + o.spirit);
      if (inst?.run) inst.run.spirit = run.spirit;
    }
  }
  const label = EVENT_CHOICES[ev.id]?.[choice.id]?.[0] ?? choice.id;
  for (const q of humans(farm, run)) out.push(banner(q.id, run.key, fmt(RUN_UI.eventResult, { choice: label }), undefined, 'reward'));
  refresh(farm, run);
  out.push(stateChange(farm, run));
  if (cards) out.push(...openCards(farm, run, ctx, cards));
  else out.push(...startRoute(farm, run));
  return out;
}

/** The cards of a runa after a fight. */
function openCards(farm: WorldState, run: RunState, ctx: SimCtx, source: OfferSource): Change[] {
  const out: Change[] = [];
  run.phase = 'pick';
  run.offerFrom = run.node;
  run.offerUntil = run.elapsed + runPickMs(run.level);
  run.offers = {};
  for (const q of humans(farm, run)) {
    const cls = q.saga?.cls;
    if (!cls) continue;
    const r = offerFor(ctx.rnd, { cls, ...(run.paths[q.id] ? { path: run.paths[q.id]! } : {}), held: run.hold[q.id] ?? [], source, luck: effectFor(farm, run, q).luck ?? 0, pity: run.pity[q.id] ?? 0 });
    run.pity[q.id] = r.pity;
    run.offers[q.id] = { cards: r.cards, source };
    out.push(banner(q.id, run.key, RUN_T.pickTitle, RUN_T.pickSub, 'reward'));
  }
  out.push(stateChange(farm, run), ...offerChanges(farm, run));
  return out;
}

/** A path for a hero who has none (the clock ran out, a bot, a friend who joined late): a bot's by luck, a person's the class's first. */
function assignPath(run: RunState, p: PlayerState, ctx: SimCtx): void {
  const cls = p.saga?.cls;
  if (!cls || run.paths[p.id]) return;
  const list = pathsOf(cls);
  run.paths[p.id] = (p.bot ? list[Math.floor(ctx.rnd() * list.length)] : undefined)?.id ?? defaultPath(cls).id;
}

/** The Mellanboss has fallen: every hero chooses one of their class's paths (the hired companions at once). */
function startPaths(farm: WorldState, run: RunState, ctx: SimCtx): Change[] {
  const out: Change[] = [];
  run.phase = 'path';
  run.pathUntil = run.elapsed + runPickMs(run.level);
  for (const id of run.companions) {
    const c = farm.players[id];
    if (c) assignPath(run, c, ctx);
  }
  refresh(farm, run);
  for (const q of humans(farm, run)) out.push(banner(q.id, run.key, RUN_T.pathTitle, RUN_T.pathSub, 'reward'));
  out.push(stateChange(farm, run));
  return out;
}

/** A hero chooses their path (once; after the Mellanboss). */
export function choosePath(world: WorldState, playerId: string, id: string, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  const p = farm.players[playerId];
  const path = pathDef(id);
  if (!run || !p || run.phase !== 'path' || !run.party.includes(p.id) || !path || path.cls !== p.saga?.cls || run.paths[p.id]) return [];
  run.paths[p.id] = path.id;
  const out: Change[] = [];
  for (const q of humans(farm, run)) if (q.id !== p.id) out.push(toast(q.id, fmt(RUN_T.pathChose, { name: p.name })));
  refresh(farm, run);
  out.push(stateChange(farm, run), ...settlePaths(farm, run, ctx, false));
  return out;
}

/** All online heroes have chosen, or the clock ran out (`late`: the rest get the class's first path): on to the cards. */
function settlePaths(farm: WorldState, run: RunState, ctx: SimCtx, late: boolean): Change[] {
  if (run.phase !== 'path') return [];
  const waiting = humans(farm, run).filter((q) => q.online && !run.paths[q.id]);
  if (waiting.length && !late) return [];
  for (const q of humans(farm, run)) assignPath(run, q, ctx);
  delete run.pathUntil;
  refresh(farm, run);
  const out: Change[] = [];
  for (const q of humans(farm, run)) out.push(toast(q.id, fmt(RUN_T.pathYours, { path: PATH_NAMES[run.paths[q.id] ?? ''] ?? '' })));
  return [...out, ...openCards(farm, run, ctx, 'mini')];
}

/** The väg-runor appear on the floor of the exit room, one for each stop the next row leads to. */
function startRoute(farm: WorldState, run: RunState): Change[] {
  const area = farm.areas?.[run.key];
  const z = run.plan.stops[run.node]!;
  const out: Change[] = [];
  if (!area?.saga || z.kind === 'boss') return out;
  const next = run.plan.route.nodes[run.node]!.next;
  const runes = placeRunes(area, z, run.plan.route, next);
  for (const r of runes) {
    const o = area.objects[r.id];
    if (o) out.push({ t: 'object', id: o.id, obj: o, area: run.key });
  }
  area.saga.run!.exits = runes.map((r) => ({ x: r.x, y: r.y, node: r.node, kind: r.kind }));
  run.phase = 'route';
  run.vote = { runes, on: {}, sig: '' };
  for (const q of humans(farm, run)) out.push(banner(q.id, run.key, RUN_T.routeTitle, RUN_T.routeSub, 'reward'));
  out.push(stateChange(farm, run), { t: 'run', ev: 'offer', to: null, offer: null });
  return out;
}

/** Who stands on which rune now (the nearest within reach), and the vote's end: everyone on a rune, or the clock. */
function tickRoute(farm: WorldState, run: RunState, ctx: SimCtx, late = false): Change[] {
  const vote = run.vote;
  if (run.phase !== 'route' || !vote) return [];
  const who = voters(farm, run);
  const on: RouteVote['on'] = {};
  for (const q of who) {
    let best = -1;
    let bestD = ROUTE_DISC_RADIUS;
    vote.runes.forEach((r, c) => {
      const d = Math.hypot(q.x - (r.x + 0.5) * TILE, q.y - (r.y + 0.5) * TILE) / TILE;
      if (d <= bestD) {
        best = c;
        bestD = d;
      }
    });
    if (best < 0) continue;
    const before = vote.on[q.id];
    on[q.id] = before && before.c === best ? before : { c: best, since: run.elapsed, done: false };
    if (!on[q.id]!.done && run.elapsed - on[q.id]!.since >= ROUTE_DWELL_MS) on[q.id]!.done = true;
  }
  vote.on = on;
  const ids = Object.keys(on);
  if (!ids.length) delete vote.first;
  else vote.first ??= run.elapsed;
  const clock = vote.first !== undefined && run.elapsed - vote.first >= ROUTE_VOTE_MS;
  const counts = vote.runes.map(() => 0);
  for (const id of ids) if (on[id]!.done || clock || late) counts[on[id]!.c]!++;
  const done = tally(counts, who.length, { late: clock || late, majority: false });
  if (!done || !done.length) {
    const sig = ids.map((id) => `${id}:${on[id]!.c}${on[id]!.done ? '!' : ''}`).join(',');
    if (sig === vote.sig) return [];
    vote.sig = sig;
    return [stateChange(farm, run)];
  }
  // a tie goes to the Stigfinnare's rune if it is one of them, else to the rune someone stood on first
  const finder = finderOf(farm, run);
  const mine = finder !== null ? on[finder]?.c : undefined;
  const firstOn = [...ids].sort((a, b) => on[a]!.since - on[b]!.since).find((id) => done.includes(on[id]!.c));
  const winner = done.length === 1 ? done[0]! : mine !== undefined && done.includes(mine) ? mine : (firstOn !== undefined ? on[firstOn]!.c : done[0]!);
  const chosen = vote.runes[winner]!;
  run.turn++;
  return enterStop(farm, run, chosen.node, ctx);
}

/** A hero taps a card (they may change it until everyone has chosen or the clock ends). */
export function pickRuna(world: WorldState, playerId: string, card: number, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  const p = farm.players[playerId];
  const o = run && p ? run.offers[p.id] : undefined;
  if (!run || !p || run.phase !== 'pick' || !o || !run.party.includes(p.id)) return [];
  if (!Number.isInteger(card) || card < 0 || card >= o.cards.length) return [];
  const first = o.picked === undefined;
  o.picked = card;
  const out: Change[] = [];
  if (first) for (const q of humans(farm, run)) if (q.id !== p.id) out.push(toast(q.id, fmt(RUN_T.voted, { name: p.name })));
  out.push(stateChange(farm, run), ...offerChanges(farm, run), ...settleOffers(farm, run, ctx, false));
  return out;
}

/** Asks for new cards (the node g3, once per run and hero). */
export function rerollOffer(world: WorldState, playerId: string, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  const p = farm.players[playerId];
  const o = run && p ? run.offers[p.id] : undefined;
  if (!run || !p || run.phase !== 'pick' || !o || !run.party.includes(p.id)) return [];
  if (!rerollsLeft(farm, run, p.id)) return [toast(playerId, RUN_T.noReroll)];
  run.rerolls[p.id] = (run.rerolls[p.id] ?? 0) + 1;
  const cls = p.saga?.cls;
  if (!cls) return [];
  const r = offerFor(ctx.rnd, { cls, ...(run.paths[p.id] ? { path: run.paths[p.id]! } : {}), held: run.hold[p.id] ?? [], source: o.source, luck: effectFor(farm, run, p).luck ?? 0, pity: run.pity[p.id] ?? 0, avoid: o.cards });
  run.offers[p.id] = { cards: r.cards, source: o.source };
  return [toast(p.id, RUN_T.reroll), stateChange(farm, run), ...offerChanges(farm, run)];
}

/**
 * Ends the choosing when it can end: every online hero has tapped a card, or the clock is out (`late`: whoever has not chosen gets their
 * first card, so a slow friend never holds the party and nobody loses a pick). Each hero takes their own card; the Mellanboss also gives
 * the whole party a runa; then the party goes on to choose the way (the väg-runor).
 */
function settleOffers(farm: WorldState, run: RunState, ctx: SimCtx, late: boolean): Change[] {
  if (run.phase !== 'pick') return [];
  const online = humans(farm, run).filter((q) => q.online);
  if (!late && online.some((q) => run.offers[q.id] && run.offers[q.id]!.picked === undefined)) return [];
  const out: Change[] = [];
  const from = run.offerFrom;
  for (const q of humans(farm, run)) {
    const o = run.offers[q.id];
    if (!o || !o.cards.length) continue;
    const id = o.cards[o.picked ?? 0]!;
    (run.hold[q.id] ??= []).push({ id, up: 0 });
    out.push(banner(q.id, run.key, fmt(RUN_T.picked, { runa: RUNA_NAMES[id] ?? id }), undefined, 'reward'));
  }
  run.offers = {};
  delete run.offerUntil;
  // the Mellanboss gives the whole party a runa (a treat: it helps everyone, the hired companion too)
  if (run.plan.stops[from]?.kind === 'mini') out.push(...giveParty(farm, run, ctx.rnd, 'sallsynt'));
  refresh(farm, run);
  run.phase = 'stop';
  out.push(...startRoute(farm, run), ...offerChanges(farm, run));
  void ctx;
  return out;
}

/** A runa for the whole party (the Mellanboss, a boss, an event): drawn from the party-wide ones not taken yet, at least `min` rarity. */
export function giveParty(farm: WorldState, run: RunState, rnd: () => number, min: RunRarity, id?: string, tags?: RunTag[]): Change[] {
  const pick = id ?? partyRuna(rnd, run.runor, min, tags);
  if (!pick || run.runor.includes(pick)) return [];
  run.runor.push(pick);
  refresh(farm, run);
  const out: Change[] = [];
  const r = runa(pick);
  for (const q of humans(farm, run)) {
    out.push(toast(q.id, fmt(RUN_T.partyGot, { runa: RUNA_NAMES[pick] ?? pick })));
    // the potions of p_flaska go into the stop the player stands in
    if (r?.effect.potions) giveHere(farm, q, 'healing_potion', r.effect.potions, out);
  }
  return out;
}

/** At a Vilosten: a hero skärps one of their runor (once for each hero and stop). */
export function sharpenRuna(world: WorldState, playerId: string, id: string, ctx: SimCtx): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  const p = farm.players[playerId];
  if (!run || !p || !run.party.includes(p.id) || (run.phase !== 'stop' && run.phase !== 'route') || run.plan.stops[run.node]!.kind !== 'rest' || p.area !== run.key) return [];
  const h = (run.hold[p.id] ?? []).find((x) => x.id === id);
  if (!h || !canSharpen(h)) return [toast(p.id, RUN_T.noSharpen)];
  if (run.paid.has(restToken(run, p.id))) return [];
  run.paid.add(restToken(run, p.id));
  h.up++;
  refresh(farm, run);
  void ctx;
  return [toast(p.id, fmt(RUN_T.sharpened, { runa: RUNA_NAMES[id] ?? id })), stateChange(farm, run)];
}

/** At a Vilosten: Vila, a quarter more of their health back (instead of skärpa). */
export function restMore(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  const p = farm.players[playerId];
  const inst = run ? farm.areas?.[run.key]?.saga : undefined;
  const f = inst?.fighters[playerId];
  if (!run || !p || !inst || !f || (run.phase !== 'stop' && run.phase !== 'route') || run.plan.stops[run.node]!.kind !== 'rest' || run.paid.has(restToken(run, p.id))) return [];
  run.paid.add(restToken(run, p.id));
  f.hp = Math.min(f.max, f.hp + Math.round(f.max * 0.25));
  return [toast(p.id, RUN_T.restMore), stateChange(farm, run)];
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
  // past the 30 minutes the run goes on; a kind reminder now and then (once per slot, even if the clock jumps)
  if (run.elapsed >= RUN_MAX_MS && run.phase !== 'victory') {
    const due = Math.floor((run.elapsed - RUN_MAX_MS) / RUN_NUDGE_MS) + 1;
    if (due > run.nudges) {
      if (run.nudges === 0) for (const p of people) runSaveOf(p).timeouts++;
      run.nudges = due;
      for (const p of people) out.push(banner(p.id, run.key, RUN_T.late, RUN_T.lateSub));
    }
  }
  // the hired companion plays
  for (const id of run.companions) {
    const mind = run.minds.get(id);
    if (mind) out.push(...botStep(farm, id, mind, ctx, dtMs));
  }
  if (run.phase === 'event') {
    if (run.event && run.elapsed >= run.event.until) out.push(...settleEvent(farm, run, ctx, true));
  } else if (run.phase === 'path') {
    if (run.pathUntil !== undefined && run.elapsed >= run.pathUntil) out.push(...settlePaths(farm, run, ctx, true));

  } else if (run.phase === 'pick') {
    if (run.offerUntil !== undefined && run.elapsed >= run.offerUntil) out.push(...settleOffers(farm, run, ctx, true));
  } else {
    out.push(...watchStop(farm, run, ctx));
    if (RUNS.get(farm) === run && run.phase === 'route') out.push(...tickRoute(farm, run, ctx));
  }
  if (RUNS.get(farm) === run && (run.statePing += dtMs) >= 10_000) {
    run.statePing = 0;
    out.push(stateChange(farm, run));
  }
  return out;
}

/** A Vilosten: 40 % of everyone's health back and everyone who had fallen up again (once the fighters are there). */
function restHeal(farm: WorldState, run: RunState, inst: NonNullable<WorldState['saga']>, out: Change[]): void {
  const k = `${run.node}:heal`;
  if (run.paid.has(k)) return;
  const who = humans(farm, run).filter((q) => q.online && q.area === run.key);
  const fighters = members(farm, run).filter((q) => q.online && q.area === run.key);
  if (!fighters.length || fighters.some((q) => !inst.fighters[q.id])) return;
  run.paid.add(k);
  for (const q of fighters) {
    const f = inst.fighters[q.id]!;
    delete f.down;
    delete f.frozen;
    f.hp = Math.min(f.max, Math.max(1, f.hp + Math.round(f.max * VILOSTEN_HEAL)));
  }
  for (const q of who) out.push(toast(q.id, RUN_T.restHeal));
}

/** Pays and opens what the stop's fight has earned: packs, the gate, the mid-boss, the boss, the wipe; and tells when the stop is cleared. */
function watchStop(farm: WorldState, run: RunState, ctx: SimCtx): Change[] {
  const area = farm.areas?.[run.key];
  const inst = area?.saga;
  if (!area || !inst) return [];
  const out: Change[] = [];
  const z = run.plan.stops[run.node]!;
  // the Sagoandans the fight has used (sagasim.ts counts them in the stop's link; the run keeps the totals)
  const link = inst.run;
  if (link && ((link.spirit ?? run.spirit) !== run.spirit || (link.used ?? run.spiritUsed) !== run.spiritUsed)) {
    run.spirit = link.spirit ?? run.spirit;
    run.spiritUsed = link.used ?? run.spiritUsed;
    out.push(stateChange(farm, run));
  }
  if (z.kind === 'rest') restHeal(farm, run, inst, out);
  inst.packs.forEach((pk, i) => {
    const k = `${run.node}:pack:${i}`;
    if (pk.dead && !run.paid.has(k)) {
      run.paid.add(k);
      pay(farm, run, RUN_SEEDS.pack, out);
      run.purse += silverFor(run, packSilver(pk.members.length));
    }
  });
  for (const [id, who] of Object.entries(inst.looted)) {
    const k = `${run.node}:chest:${id}`;
    const chest = area.objects[Number(id)];
    if (who.length && chest && (chest.variant ?? 0) === 0 && !run.paid.has(k)) {
      run.paid.add(k);
      pay(farm, run, RUN_SEEDS.chest, out);
    }
  }
  if (inst.miniDown && !run.paid.has(`${run.node}:guard`)) {
    run.paid.add(`${run.node}:guard`);
    pay(farm, run, RUN_SEEDS.guard, out);
    run.purse += silverFor(run, SILVER.mini);
  }
  // the gate opens when the packs that were in the way are down (a mid-boss opens its own, in sagasim.ts)
  if (!inst.gateOpen && z.gate === 'packs' && z.required.every((i) => inst.packs[i]?.dead)) {
    inst.gateOpen = true;
    for (const g of inst.gate) {
      const o = objectAt(area, g.x, g.y);
      if (o?.kind === 'saga_gate') {
        removeObject(area, o.id);
        out.push({ t: 'object', id: o.id, obj: null, area: run.key });
      }
    }
  }
  // the stop is cleared: a Flock when its gate opens, the Mellanboss when it falls, a Vilosten at once; the boss's is the victory
  const clearedAt = `${run.node}:cleared`;
  const cleared = isFlockLike(z.kind) ? inst.gateOpen : z.kind === 'mini' ? inst.miniDown : isCamp(z.kind) ? inst.gateOpen : false;
  if (cleared && run.phase === 'stop' && !run.paid.has(clearedAt)) {
    run.paid.add(clearedAt);
    if (isFlockLike(z.kind) || z.kind === 'mini') {
      for (const p of humans(farm, run)) {
        runSaveOf(p).zones++;
        out.push(banner(p.id, run.key, RUN_T.zoneClear, RUN_T.zoneClearSub, 'cleared'));
      }
      pay(farm, run, z.kind === 'elite' ? RUN_SEEDS.zone * 2 : RUN_SEEDS.zone, out);
      if (z.kind === 'elite') run.purse += silverFor(run, SILVER.elite);
      if (z.kind === 'treasure') run.purse += silverFor(run, SILVER.treasure);
    }
    out.push(...stopCleared(farm, run, ctx));
    return out;
  }
  if (inst.bossDown && run.phase === 'stop') out.push(...victory(farm, run, ctx));
  if (run.phase === 'victory' && run.victoryAt !== undefined && run.elapsed - run.victoryAt >= RUN_VICTORY_MS) return [...out, ...endRun(farm, run, 'win', ctx)];
  if (inst.wipeAt !== undefined && ctx.now >= inst.wipeAt && !inst.run?.revive) return [...out, ...endRun(farm, run, 'wipe', ctx)];
  return out;
}

/** The boss has fallen: its sagafrön and the statistics. */
function victory(farm: WorldState, run: RunState, ctx: SimCtx): Change[] {
  const out: Change[] = [];
  run.phase = 'victory';
  run.victoryAt = run.elapsed;
  run.outcome = 'win';
  const boss = run.plan.boss;
  // f6 is the planter's own: only the member who planted it gets the five extra
  pay(farm, run, (p) => (run.plan.replay ? RUN_SEEDS.bossReplay : RUN_SEEDS.bossFirst) + (effectFor(farm, run, p).bossSeeds ?? 0), out);
  for (const p of humans(farm, run)) {
    // the chapter is cleared for everyone in the party, offline members too (sagasim already did it for those standing in the stop)
    const prog = (p.saga ??= newSagaProgress());
    if (!prog.cleared.includes(boss)) {
      prog.cleared.push(boss);
      giveClearPets(farm, p, boss, out);
      bump(p, CLEARED_STAT[boss], 1, out);
    }
    awardTrophy(farm, p, boss, run.level, out);
    awardLooks(p, boss, run.level, lookRng(p, boss), out);
    awardPetLooks(farm, p, boss, run.level, out);
    const s = runSaveOf(p);
    s.wins++;
    s.clears[boss] = (s.clears[boss] ?? 0) + 1;
    s.best[boss] = Math.min(s.best[boss] ?? Infinity, Math.round(run.elapsed));
    out.push(banner(p.id, run.key, RUN_T.win, RUN_T.winSub, 'cleared'), playerChange(p));
  }
  out.push(stateChange(farm, run));
  return out;
}

/** The end of a run, for any reason: everyone home in front of the arch with everything, the stop and the companion gone. */
export function endRun(farm: WorldState, run: RunState, outcome: RunOutcome, ctx: SimCtx, except?: string): Change[] {
  const out: Change[] = [];
  // a boss that has fallen is a win, whatever ends the run afterwards (the clock, a wipe tick, the chest's 90 seconds)
  const result: RunOutcome = run.outcome === 'win' ? 'win' : outcome;
  run.phase = 'ended';
  run.outcome = result;
  // what is left in Färdkassan turns into sagafrön (one for every 12), the same for everyone in the party
  const silver = run.purse;
  const bonus = seedsFromSilver(silver);
  run.purse = 0;
  for (const p of humans(farm, run)) {
    const s = runSaveOf(p);
    if (bonus > 0) {
      s.seeds += bonus;
      s.earned += bonus;
      run.earned[p.id] = (run.earned[p.id] ?? 0) + bonus;
      if (p.id !== except) out.push(toast(p.id, fmt(RUN_UI.convert, { n: bonus })), treeChange(farm, p));
    }
    if (result === 'wipe') s.wipes++;
    sendHome(farm, p, out);
    if (p.id !== except)
      out.push(
        { t: 'run', ev: 'ended', to: p.id, outcome: run.outcome, ms: Math.round(run.elapsed), seeds: run.earned[p.id] ?? 0, zones: s.zones, runor: [...run.runor, ...(run.hold[p.id] ?? []).map((h) => h.id)], level: run.level, spiritUsed: run.spiritUsed, path: run.path.map((n) => run.plan.route.nodes[n]!.kind), silver },
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
    case 'start': {
      const level = parseRunLevel(msg.level);
      if (level === null) return [toast(playerId, RUN_T.badLevel)];
      // a dungeon: left out is the chapter's own; anything that is not a dungeon's id is refused (startRun refuses one not yet reached)
      if (msg.dungeon !== undefined && !(typeof msg.dungeon === 'string' && (DUNGEON_IDS as readonly string[]).includes(msg.dungeon))) return [toast(playerId, RUN_T.badDungeon)];
      return startRun(farm, playerId, { level, ...(msg.dungeon !== undefined ? { dungeon: msg.dungeon as DungeonId } : {}), replay: msg.replay === true, ...(msg.companion === false ? { companion: false } : {}), ...(Array.isArray(msg.fardkost) ? { fardkost: msg.fardkost.filter((x): x is string => typeof x === 'string') } : {}) }, ctx);
    }
    case 'join':
      return joinRun(farm, playerId, ctx);
    case 'pick':
      return pickRuna(farm, playerId, Math.floor(Number(msg.card)), ctx);
    case 'path':
      return choosePath(farm, playerId, String(msg.id ?? ''), ctx);
    case 'reroll':
      return rerollOffer(farm, playerId, ctx);
    case 'sharpen':
      return sharpenRuna(farm, playerId, String(msg.id ?? ''), ctx);
    case 'buy':
      return buyItem(farm, playerId, msg, ctx);
    case 'event':
      return voteEvent(farm, playerId, Math.floor(Number(msg.choice)), ctx);
    case 'rest':
      return restMore(farm, playerId);
    case 'leave':
      return leaveRun(farm, playerId, ctx);
    default: {
      const run = RUNS.get(farm);
      return [stateChange(farm, run), ...(run ? offerChanges(farm, run) : [])];
    }
  }
}

/**
 * Development only (the server enables it with DEV_TELEPORT=1): the stop the run is in is cleared as if its monsters had fallen (a
 * Mellanboss and a boss too), so a person can walk through the windows of a whole run without fighting for twenty minutes.
 */
export function devClearStop(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const run = RUNS.get(farm);
  const area = run ? farm.areas?.[run.key] : undefined;
  if (!run || !area?.saga || !run.party.includes(playerId)) return [];
  const inst = area.saga;
  const out: Change[] = [];
  for (const pk of inst.packs) pk.dead = true;
  for (const m of Object.values(inst.mobs)) {
    delete inst.mobs[m.id];
    delete area.animals[m.id];
    out.push({ t: 'animal', id: m.id, animal: null, area: run.key });
  }
  const kind = run.plan.stops[run.node]!.kind;
  if (kind === 'mini') inst.miniDown = true;
  if (kind === 'boss') inst.bossDown = true;
  return out;
}
