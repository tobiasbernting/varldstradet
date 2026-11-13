// Sagan om Världsträdet on the client: the dungeon you are in, everyone's health and state from the server's
// snapshots, the monster or friend you aim at, your spells' cooldowns (they start when the server says a spell
// went off, like the short pause after every spell) and the markers over the villagers' heads. Out in the world
// a hero (hero mode on) fights the roaming monsters and wild predators with the same spells.
import {
  ATTACK_KINDS,
  BLOCK_SPECIES,
  CLASSES,
  GCD_MS,
  MOB_FLAG,
  PIP_AUTO_EVERY,
  PIP_MAX,
  POTION_CD,
  SAGA_BOSSES,
  SAGA_CHAPTERS,
  SAGA_MOBS,
  SAGA_QUESTS,
  SLOW_MUL,
  SPELLS,
  T,
  TILE,
  VOLVA_ID,
  attackSpellOf,
  chapterDone,
  countItem,
  heroLevel,
  isHostile,
  isHomeKey,
  isSagaKey,
  questState,
  readProgress,
  type AnimalState,
  type ClassDef,
  type PlayerState,
  type SagaSnap,
} from '@varldstradet/shared';
import { castToStop, isInterrupt, spendView, waitOf, type SpendCtx, type SpendView, type Wait } from './fight.ts';
import { net } from './net.ts';
import { activeWorld, bus, client, myPlayer, serverNow } from './state.ts';

/** The fighter flags in a snapshot. */
export const FLAG = { down: 1, wall: 2, rage: 4, hot: 8, slow: 16, frozen: 32, shield: 64 } as const;

export const inSaga = (): boolean => isSagaKey(myPlayer()?.area);

/** Is hero mode on (a class, and walking the world as it)? */
export const heroOn = (p: PlayerState | undefined = myPlayer()): boolean => !!p?.saga?.hero && !!p.saga.cls;

/** Out in the world (not the old dungeon, a saga dungeon or the bath house)? */
const outdoors = (area: string | undefined): boolean => !!area && area !== 'dungeon' && !isSagaKey(area) && !isHomeKey(area);

/** Fighting with spells: always in a saga dungeon, and out in the world while hero mode is on. */
export const fightMode = (): boolean => {
  const me = myPlayer();
  return isSagaKey(me?.area) || (heroOn(me) && outdoors(me?.area));
};

/** The snapshot of the dungeon you are in (null outside, or before the first one). */
export function sagaSnap(): SagaSnap | null {
  const me = myPlayer();
  return me && isSagaKey(me.area) ? (client.saga[me.area] ?? null) : null;
}

/** A player's health, max and flags in the dungeon you are in. */
export const fighterOf = (id: string): [number, number, number, number] | null => sagaSnap()?.f[id] ?? null;
export const flagsOf = (id: string): number => fighterOf(id)?.[2] ?? 0;
/** A hero's pips (0..PIP_MAX) in the dungeon you are in. */
export const pipsOf = (id: string): number => Math.max(0, Math.min(PIP_MAX, fighterOf(id)?.[3] ?? 0));

export const classOf = (p: PlayerState | undefined): ClassDef | null => {
  const cls = readProgress(p).cls;
  return cls ? CLASSES[cls] : null;
};
export const myClass = (): ClassDef | null => classOf(myPlayer());

/** A player's hero level (every player has one; experience comes from every monster beaten). */
export const levelOf = (p: PlayerState | undefined): number => heroLevel(p?.saga);
/** Is the level worth showing (past the first, or a hero with a class)? */
export const showsLevel = (p: PlayerState | undefined): boolean => !!p && (levelOf(p) >= 2 || !!p.saga?.cls);

/** A player's newest title, shown under their name. */
export const titleOf = (p: PlayerState | undefined): string | null => {
  const t = p?.saga?.titles;
  return t?.length ? t[t.length - 1]! : null;
};

/** How fast you may walk now: not at all when fallen or frozen, slower when slowed. */
export function sagaSpeed(): number {
  if (!inSaga()) return 1;
  const fl = flagsOf(client.me);
  if (fl & (FLAG.down | FLAG.frozen)) return 0;
  return fl & FLAG.slow ? SLOW_MUL : 1;
}

/** Is this animal one of the dungeon's monsters (a boss, a helper or an ice block too)? */
export const isSagaMonster = (a: AnimalState | undefined): a is AnimalState => !!a && (!!SAGA_MOBS[a.species] || !!SAGA_BOSSES[a.species]);
/** Something to fight: a dungeon's monster, or out in the world a roaming monster or a wild predator. */
export const isFoe = (a: AnimalState | undefined): a is AnimalState => !!a && (isSagaMonster(a) || (!inSaga() && isHostile(a)));

/** The ice block or web holding a frozen friend: the block animal nearest to them (null if none is close). */
export function blockOf(id: string): AnimalState | null {
  const p = posOf(id);
  if (!p) return null;
  let best: AnimalState | null = null;
  let bestD = 2 * TILE;
  for (const a of Object.values(activeWorld()?.animals ?? {})) {
    if (!BLOCK_SPECIES.has(a.species)) continue;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}
/** Is a frozen friend held by a spider's web (not ice)? */
export const webbed = (id: string): boolean => blockOf(id)?.species === 'spindelnat';

// ---------------------------------------------------------------------------
// The target: a monster (its animal id) or a friend (a player id)
// ---------------------------------------------------------------------------

let target: number | string | null = null;

export const getTarget = (): number | string | null => target;

export function setTarget(t: number | string | null): void {
  if (t === target) return;
  target = t;
  // the server's auto-attack follows the monster you have chosen
  if (t === null || typeof t === 'number') net.send({ t: 'target', id: t });
  bus.emit('target', undefined);
}

/** The target if it is still there: a monster on this map, or a friend in this dungeon. */
export function liveTarget(): number | string | null {
  if (target === null) return null;
  if (typeof target === 'number') return isFoe(activeWorld()?.animals[target]) ? target : null;
  return fighterOf(target) ? target : null;
}

/** Where a monster or player is now (the server's latest positions). */
export function posOf(id: number | string): { x: number; y: number } | null {
  if (typeof id === 'number') return client.snaps.animals.get(id) ?? activeWorld()?.animals[id] ?? null;
  if (id === client.me) return myPlayer() ?? null;
  return client.snaps.players.get(id) ?? null;
}

/** Märke: the monster the party has marked with the skull (null: none, or it is gone). */
export const markedMob = (): number | null => {
  const k = sagaSnap()?.k;
  return k !== undefined && isFoe(activeWorld()?.animals[k]) ? k : null;
};
/** Marks a monster with the skull for the whole party; marking the marked one again takes the mark away. Null: the one you aim at. */
export function toggleMark(id: number | null = null): void {
  if (!inSaga()) return;
  const t = id ?? (typeof liveTarget() === 'number' ? (liveTarget() as number) : spendTarget());
  if (t === null) return;
  net.send({ t: 'mark', id: markedMob() === t ? null : t });
}

/** Monsters near you, nearest first; ice blocks holding a friend and monsters already fighting come first. */
export function nearbyMonsters(maxTiles = 12): number[] {
  const me = myPlayer();
  const world = activeWorld();
  if (!me || !world) return [];
  const snap = sagaSnap();
  const list: { id: number; d: number }[] = [];
  for (const a of Object.values(world.animals)) {
    if (!isFoe(a)) continue;
    const at = posOf(a.id) ?? a;
    const d = Math.hypot(at.x - me.x, at.y - me.y) / TILE;
    if (d > maxTiles) continue;
    const ice = BLOCK_SPECIES.has(a.species);
    const fighting = !!snap?.m[a.id];
    list.push({ id: a.id, d: d - (ice ? 200 : 0) - (fighting ? 100 : 0) });
  }
  return list.sort((a, b) => a.d - b.d).map((m) => m.id);
}

/** Tab: the next monster near you. */
export function cycleTarget(): void {
  const list = nearbyMonsters();
  if (!list.length) {
    setTarget(null);
    return;
  }
  const i = typeof target === 'number' ? list.indexOf(target) : -1;
  setTarget(list[(i + 1) % list.length]!);
}

// ---------------------------------------------------------------------------
// Spells: sent to the server, cooldowns from its answer
// ---------------------------------------------------------------------------

/** When each spell is ready again, the short pause after any spell, and the next potion (server ms). */
const ready: Record<string, number> = {};
let gcdUntil = 0;
let potionAt = 0;
/** A spell on its way to the server (until its answer, or a moment if none comes). */
let inFlight = 0;
/** A spell pressed while it was still cooling: it goes as soon as it is ready (a press this long before). */
let queued: string | null = null;
const QUEUE_MS = 1500;
/** When each spell was last pressed (performance.now), for the button's flash. */
export const pressedAt: Record<string, number> = {};

/** Time left before a spell can go again, and how long that wait is in all (ms); `shared`: it is the pause after another spell. */
export function cooldown(spell: string): Wait {
  return waitOf(spell, ready[spell] ?? 0, gcdUntil, serverNow());
}
/** Is the shared pause running (the buttons outside it look different meanwhile)? */
export const inSharedPause = (): boolean => gcdUntil > serverNow();

/** When you last cast each spell (server ms): your own Utmana! and Läkekrets decide the combo. */
const castAt: Record<string, number> = {};
const castWithin = (spell: string, extra = 0): boolean => serverNow() - (castAt[spell] ?? -Infinity) <= (SPELLS[spell]?.ms ?? 0) + extra;

/** The monster your spender would go for: the one you chose, else the nearest one that is fighting. */
export function spendTarget(): number | null {
  const t = liveTarget();
  if (typeof t === 'number') return t;
  const snap = sagaSnap();
  return nearbyMonsters(9).find((id) => !!snap?.m[id]) ?? null;
}

/** What your spender is looking at now (fight.ts decides the glow from it). Null outside a dungeon or without a class. */
export function spendCtx(): SpendCtx | null {
  const cls = myClass();
  const snap = sagaSnap();
  if (!cls || !snap) return null;
  const t = spendTarget();
  const mobs = Object.values(snap.m);
  // (the snapshot does not say whose Utmana! or Läkekrets it is: yours counts while the one you cast still lasts)
  const taunted = castWithin('utmana', 500) && mobs.some((m) => m[2] & MOB_FLAG.taunted);
  const ringFriend = castWithin('lakekrets', 500) && Object.values(snap.f).some((f) => f[2] & FLAG.hot && !(f[2] & FLAG.down) && f[0] < f[1]);
  return { cls: cls.id, pips: pipsOf(client.me), targetFlags: t !== null ? (snap.m[t]?.[2] ?? 0) : 0, taunted, ringFriend };
}
export const mySpend = (): SpendView | null => {
  const c = spendCtx();
  return c ? spendView(c) : null;
};

export const potionCooldown = (): Wait => ({ left: Math.max(0, potionAt - serverNow()), total: POTION_CD, shared: false });
export const potionCount = (): number => countItem(myPlayer()?.inventory ?? [], 'healing_potion');

function canAct(): boolean {
  return fightMode() && !(flagsOf(client.me) & (FLAG.down | FLAG.frozen));
}

/** Presses spell button `slot` (0–3) of your class. */
export function castSlot(slot: number): void {
  const spell = myClass()?.spells[slot];
  if (spell) cast(spell);
}

let noPipsSaid = 0;

export function cast(spell: string): void {
  if (!canAct()) return;
  pressedAt[spell] = performance.now();
  // the spender needs a pip: say why nothing happens (not on every press of a mashed key)
  if (SPELLS[spell]?.kind === 'spend' && inSaga() && pipsOf(client.me) < 1) {
    if (performance.now() - noPipsSaid > 6000 && Object.keys(sagaSnap()?.m ?? {}).length) {
      noPipsSaid = performance.now();
      bus.emit('toast', T.sagaNoPips);
    }
    return;
  }
  const { left } = cooldown(spell);
  if (left > 0 || performance.now() < inFlight) {
    // mashing keys still works: a press while the spell is cooling waits for it
    if (left < QUEUE_MS) queued = spell;
    return;
  }
  send(spell);
}

/** Is this monster of the dungeon still waiting with its pack (not woken, not hurt)? Out in the world every foe counts as waiting. */
export const isWaiting = (id: number): boolean => !sagaSnap()?.m[id];

/**
 * A click or tap on a monster (it is the target already): the hero swings by themselves at a monster that is fighting, so
 * nothing more is sent for one; a monster still WAITING with its pack gets the everyday attack when it is in reach, which
 * wakes the pack (aiming at a far one is quiet). True if a spell went.
 */
export function attackTarget(): boolean {
  const cls = myClass();
  const me = myPlayer();
  const t = liveTarget();
  if (!cls || !me || typeof t !== 'number' || !canAct() || !isWaiting(t)) return false;
  const spell = attackSpellOf(cls.id);
  const sp = SPELLS[spell];
  const at = posOf(t);
  if (!sp || !ATTACK_KINDS.has(sp.kind) || !at) return false;
  if (Math.hypot(at.x - me.x, at.y - me.y) / TILE > sp.range + 0.6) return false;
  cast(spell);
  return true;
}

/** How far a monster is from you, in tiles (null if it is gone). */
export function tilesTo(id: number): number | null {
  const me = myPlayer();
  const at = posOf(id);
  return me && at ? Math.hypot(at.x - me.x, at.y - me.y) / TILE : null;
}

/** The monster this interrupt would stop now: one casting something stoppable within its reach (null: none). */
export function stopTarget(spell: string): number | null {
  const sp = SPELLS[spell];
  if (!sp || !isInterrupt(spell)) return null;
  const t = liveTarget();
  return castToStop(sagaSnap(), tilesTo, sp.range, serverNow(), typeof t === 'number' ? t : null);
}

function send(spell: string): void {
  queued = null;
  inFlight = performance.now() + 350;
  // an interrupt goes for the monster that is casting, whatever is chosen (a cast lasts a breath: no time to change target)
  const t = stopTarget(spell) ?? liveTarget();
  net.send(t === null ? { t: 'cast', spell } : { t: 'cast', spell, target: t });
}

export function drinkPotion(): void {
  if (!canAct()) return;
  pressedAt.potion = performance.now();
  if (potionCooldown().left > 0) return;
  if (potionCount() <= 0) {
    bus.emit('toast', T.sagaNoPotion);
    return;
  }
  net.send({ t: 'potion' });
}

/** A monster this far away is let go (you woke at the rest stone, or jumped to a friend). */
const LET_GO_TILES = 16;

/** Called every frame while in a dungeon: lets go of a monster left far behind, sends a waiting spell once it is ready. */
export function sagaTick(): void {
  if (typeof target === 'number') {
    const me = myPlayer();
    const at = posOf(target);
    if (me && at && Math.hypot(at.x - me.x, at.y - me.y) > LET_GO_TILES * TILE) setTarget(null);
  }
  if (!queued || performance.now() < inFlight) return;
  if (!canAct()) {
    queued = null;
    return;
  }
  if (cooldown(queued).left <= 0) send(queued);
}

/**
 * Half a pip: every SECOND auto-attack hit gives a pip (`PIP_AUTO_EVERY`), and the snapshot only carries whole pips, so the
 * client counts each hero's auto-attacks that found a monster since their last pip. An odd count: the next pip is half full.
 */
const autoCount: Record<string, number> = {};
const autoAt: Record<string, number> = {};
const pipsWere: Record<string, number> = {};
export const pipHalf = (id: string): boolean => (autoCount[id] ?? 0) % PIP_AUTO_EVERY === 1 && pipsOf(id) < PIP_MAX;
bus.on('change', (c) => {
  if (c.t !== 'spell' || typeof c.by !== 'string' || c.on === undefined) return;
  const p = client.world?.players[c.by];
  // (the Hirdmannen's auto-attacks give him no pips)
  if (!p || p.bot || classOf(p)?.auto !== c.spell) return;
  autoCount[c.by] = ((autoCount[c.by] ?? 0) + 1) % PIP_AUTO_EVERY;
  autoAt[c.by] = performance.now();
});
bus.on('state', () => {
  // a pip that came right after an auto-attack was that attack's: the count starts over (this mends a count that drifted)
  for (const [id, f] of Object.entries(sagaSnap()?.f ?? {})) {
    const n = f[3] ?? 0;
    if (n > (pipsWere[id] ?? 0) && performance.now() - (autoAt[id] ?? 0) < 350) autoCount[id] = 0;
    pipsWere[id] = n;
  }
});

/** Your own spell came back from the server: its cooldown and the short pause start now. */
bus.on('change', (c) => {
  if (c.t !== 'spell' || c.by !== client.me) return;
  const now = serverNow();
  if (c.spell === 'potion') {
    potionAt = now + POTION_CD;
    return;
  }
  const sp = SPELLS[c.spell];
  if (!sp) return;
  ready[c.spell] = now + sp.cd;
  castAt[c.spell] = now;
  // the auto-attack and the reactions neither wait for the shared pause nor start it
  const auto = myClass()?.auto === c.spell;
  if (!auto && !sp.offGcd) gcdUntil = now + GCD_MS;
  if (!auto) inFlight = 0;
  // the monster the server picked becomes your target, so you can see its health
  // (a button aimed at a monster makes it the hero's target on the server too: Stormsteg at a caster, say)
  if (typeof c.on === 'number' && (liveTarget() === null || (!auto && typeof liveTarget() === 'number'))) setTarget(c.on);
});

bus.on('change', (c) => {
  // a beaten monster is no longer a target
  if (c.t === 'animal' && !c.animal && c.id === target) setTarget(null);
});

bus.on('area', () => {
  // a new dungeon (or none): a fresh fighter, nothing aimed at
  for (const k of Object.keys(ready)) delete ready[k];
  for (const k of Object.keys(castAt)) delete castAt[k];
  for (const k of Object.keys(autoCount)) delete autoCount[k];
  gcdUntil = 0;
  potionAt = 0;
  queued = null;
  setTarget(null);
});

// ---------------------------------------------------------------------------
// The saga out in the world: Völvan's chapters and the villagers' quests
// ---------------------------------------------------------------------------

/** The marker over a villager: yellow ! (something new for you), yellow ? (hand it in), grey ? (in progress). */
export function sagaMarker(npcId: string): { text: string; cls: string } | null {
  const me = myPlayer();
  if (!me) return null;
  const prog = readProgress(me);
  let offer = false;
  let hand = false;
  let busy = false;
  if (npcId === VOLVA_ID && SAGA_CHAPTERS[prog.chapter]) {
    if (!prog.heard) offer = true;
    else if (chapterDone(prog)) hand = true;
    else busy = true;
  }
  for (const q of SAGA_QUESTS) {
    if (q.npc !== npcId) continue;
    const st = questState(me, q);
    if (st === 'ready') hand = true;
    else if (st === 'offer') offer = true;
    else if (st === 'active') busy = true;
  }
  if (hand) return { text: '?', cls: 'bubble marker saga' };
  if (offer) return { text: '!', cls: 'bubble marker saga' };
  if (busy) return { text: '?', cls: 'bubble marker saga busy' };
  return null;
}

// ---------------------------------------------------------------------------
// Hints shown once on each device (like the help window's flag)
// ---------------------------------------------------------------------------

const hintKey = (id: string): string => `varldstradet.hint.${id}`;
const hintsShown = new Set<string>();
/** True the first time it is asked on this device (and never again): the hint may be shown. */
export function firstTime(id: string): boolean {
  if (hintsShown.has(id)) return false;
  hintsShown.add(id);
  try {
    if (localStorage.getItem(hintKey(id)) === '1') return false;
    localStorage.setItem(hintKey(id), '1');
  } catch {
    /* no storage: once a visit */
  }
  return true;
}
