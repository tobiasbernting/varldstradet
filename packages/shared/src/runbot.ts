// A fighter that plays a run by itself: walks to the next monsters, uses its class's spells the way a person would
// (the tank taunts and shields, the healer heals and wakes friends, the warrior whirls, the mage fires from afar),
// steps out of the boss's marks and stops its big attacks, and chooses the way on by walking onto a väg-runa (the careful
// bot takes the safe lane, a Vilosten when there is one; the clumsy bot a random lane). It is the brain of the tests' bot
// parties (a careful one and a clumsy one that does neither) and of the hired companion (Hirdmannen) the server runs for a lone player. It only does
// what a person at a keyboard can: it walks with `applyMove`, casts with `castSpell`, presses the use key with
// `performAction`; it never touches the rules.
import { applyMove, farmOf, isSolidForPlayer, lineOfSight, performAction, type SimCtx } from './sim.ts';
import { SLOW_MUL, castSpell, drinkPotion, inZone, markMob, setTarget } from './sagasim.ts';
import { CLASSES, REST_RADIUS, SAGA_BOSSES, SPELLS, type ClassId, type SagaMob } from './saga.ts';
import { PLAYER_SPEED, TILE, type AnimalState, type Facing, type PlayerState, type WorldState } from './types.ts';
import type { Change } from './protocol.ts';

/**
 * `kid7` is a 7-year-old: clumsy with a 1.2 times longer think between moves and 40 % misses (DESIGN.md section 5.6).
 * `masher` presses every button that is ready, in the order 4, 3, 2, 1, at nothing in particular, without pauses or misses; it
 * never steps out of a mark, never chooses which monster first and takes a random lane.
 * `adult` is a grown-up who plays well but is no machine: the careful bot with `ADULT.react` ms before it starts to leave a mark, to
 * interrupt or to walk into a Guldring, one press in ten missed, and no perfect kill order (it turns to a Besvärjare when its cast starts).
 */
export type BotStyle = 'careful' | 'clumsy' | 'kid7' | 'masher' | 'adult';

/** The adult bot: its reaction time (ms), the share of presses it misses, and what a missed press costs (ms). */
export const ADULT = { react: 350, miss: 0.1, missMs: 1000 } as const;

export interface BotMind {
  style: BotStyle;
  /** Stream of luck for the clumsy bot's slips. */
  rnd: () => number;
  /** The route being walked: goal tile, the tiles, and when to look for a new one. */
  path?: { goal: number; tiles: number[]; at: number; key: string };
  /** Waiting at a rest stone until healed. */
  resting?: boolean;
  /** The monster it is walking to (kept until it falls, so it does not dither between two). */
  chase?: number;
  /** The clumsy bot thinks about its next move this long (ms). */
  pause: number;
  /** How it chooses the way on: the safe lane (a Vilosten if there is one) or any lane at random. */
  lane: 'safe' | 'random';
  /** The väg-runa it chose in this stop (area key and the index into the link's exits), kept so it does not dither. */
  rune?: { key: string; at: number };
  /** For the skill tests: a bot that plays its style but never steps out of a mark, and one that only presses these buttons (slots 0..3). */
  noDodge?: boolean;
  slots?: number[];
  /** A masher who is seven: the kid7 bot's pauses and misses, pressing like the masher. */
  kid?: boolean;
  /** The adult bot: when it first saw the mark it stands in, the cast it could stop and the Guldring; and until when its missed press costs it. */
  markAt?: number;
  kickAt?: number;
  goldAt?: number;
  missUntil?: number;
}

export const newMind = (style: BotStyle, rnd: () => number, lane?: 'safe' | 'random'): BotMind => ({ style, rnd, pause: 0, lane: lane ?? (style === 'careful' || style === 'adult' ? 'safe' : 'random') });

const tileOf = (v: number): number => Math.floor(v / TILE);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y) / TILE;
const STEPS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const W = 64;

/** Walks the free tiles from `from` to the first tile `goal` is true for (or to `to`); the tiles in order, without the start. */
function bfs(area: WorldState, from: { x: number; y: number }, goal: (x: number, y: number) => boolean, maxDepth = 200): number[] | null {
  const start = from.y * W + from.x;
  const prev = new Int32Array(W * W).fill(-2);
  prev[start] = -1;
  let frontier = [start];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: number[] = [];
    for (const k of frontier) {
      const x = k % W;
      const y = Math.floor(k / W);
      if (k !== start && goal(x, y)) {
        const tiles: number[] = [];
        for (let c = k; c !== start; c = prev[c]!) tiles.push(c);
        return tiles.reverse();
      }
      for (const [dx, dy] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        const nk = ny * W + nx;
        if (prev[nk] !== -2 || isSolidForPlayer(area, nx, ny)) continue;
        prev[nk] = k;
        next.push(nk);
      }
    }
    frontier = next;
  }
  return null;
}

const facingOf = (dx: number, dy: number): Facing => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');

/** One step of walking towards a tile (by the cached route), at a player's speed. */
function walkTo(area: WorldState, p: PlayerState, mind: BotMind, goalTile: { x: number; y: number }, dtMs: number, now: number, slowed: boolean, adjacent = 0): void {
  const here = { x: tileOf(p.x), y: tileOf(p.y) };
  const goalKey = goalTile.y * W + goalTile.x;
  const key = area.area ?? '';
  const path = mind.path;
  if (!path || path.goal !== goalKey || path.key !== key || now >= path.at || !path.tiles.length) {
    const tiles = bfs(area, here, (x, y) => (adjacent ? Math.hypot(x - goalTile.x, y - goalTile.y) <= adjacent : x === goalTile.x && y === goalTile.y)) ?? [];
    mind.path = { goal: goalKey, tiles, at: now + 500, key };
  }
  const tiles = mind.path!.tiles;
  while (tiles.length && tiles[0] === here.y * W + here.x) tiles.shift();
  const next = tiles[0];
  if (next === undefined) {
    p.moving = false;
    return;
  }
  const tx = (next % W) * TILE + TILE / 2;
  const ty = Math.floor(next / W) * TILE + TILE / 2;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const step = Math.min(d, (PLAYER_SPEED * (slowed ? SLOW_MUL : 1) * dtMs) / 1000);
  applyMove(area, p.id, p.x + (dx / d) * step, p.y + (dy / d) * step, facingOf(dx, dy), true);
}

/** Is a point inside any mark on the ground (or about to be)? */
const marked = (area: WorldState, x: number, y: number, now: number): boolean =>
  (area.saga?.zones ?? []).some((z) => z.kind !== 'orb' && z.kind !== 'gold' && (z.until === undefined || now >= z.at) && inZone(z, { x, y }) && (z.dmg > 0 || z.until !== undefined));

/** What a person would do: the healer's spell on the hurt one, etc. True if a spell went. */
function cast(farm: WorldState, p: PlayerState, mind: BotMind, spell: string, target: number | string | undefined, ctx: SimCtx, out: Change[]): boolean {
  // (a bot that only presses some of its buttons)
  const slot = mind.slots && p.saga?.cls ? CLASSES[p.saga.cls].spells.indexOf(spell) : -1;
  if (mind.slots && slot >= 0 && !mind.slots.includes(slot)) return false;
  const r = castSpell(farm, p.id, spell, target, ctx, { quiet: true });
  const did = r.some((c) => c.t !== 'toast');
  out.push(...r);
  return did;
}

const isRanged = (cls: ClassId): boolean => cls === 'helare' || cls === 'magiker';

/**
 * One decision of one fighter, `dtMs` after the last. The player must be in a stop of a run (a saga area) with a
 * fighter record. Returns what the spells changed.
 */
export function botStep(world: WorldState, pid: string, mind: BotMind, ctx: SimCtx, dtMs: number): Change[] {
  const farm = farmOf(world);
  const p = farm.players[pid];
  const area = p ? farm.areas?.[p.area] : undefined;
  const inst = area?.saga;
  const f = inst?.fighters[pid];
  const out: Change[] = [];
  if (!p || !area || !inst || !f) return out;
  const now = ctx.now;
  const adult = mind.style === 'adult';
  const careful = mind.style === 'careful' || adult;
  /** Has the adult had its reaction time since it first saw this (the careful bot reacts at once)? */
  const reacted = (key: 'markAt' | 'kickAt' | 'goldAt', seen: boolean): boolean => {
    if (!seen) {
      delete mind[key];
      return false;
    }
    mind[key] ??= now;
    return !adult || now - mind[key]! >= ADULT.react;
  };
  const clumsy = mind.style === 'clumsy' || mind.style === 'kid7' || !!mind.kid;
  if (f.down !== undefined || f.frozen !== undefined) {
    p.moving = false;
    return out;
  }
  const slowed = f.slow !== undefined && now < f.slow;
  const cls = f.cls;
  const mobs = Object.values(inst.mobs).filter((m) => area.animals[m.id] && m.state !== 'home');
  const where = (m: SagaMob): AnimalState => area.animals[m.id]!;
  const fighting = mobs.filter((m) => m.state === 'fight');
  const friends = Object.entries(inst.fighters)
    .map(([id, ff]) => ({ id, ff, q: farm.players[id] }))
    .filter((x): x is { id: string; ff: typeof f; q: PlayerState } => !!x.q && x.q.area === p.area && x.id !== pid);

  // a brute's Dunk over me: stop it when the interrupt is free and nothing else needs it (no boss, no Besvärjare or Skytt in the fight); else step out
  if (careful && !mind.noDodge) {
    const slam = Object.values(inst.mobs).find((m) => m.cast?.role === 'slam' && area.animals[m.id] && (inst.zones.find((z) => z.id === m.cast!.zones[0]) ? inZone(inst.zones.find((z) => z.id === m.cast!.zones[0])!, p) : false));
    const stop = f.cls === 'vaktare' ? 'skoldslag' : f.cls === 'krigare' ? 'stormsteg' : f.cls === 'magiker' ? 'isspjut' : undefined;
    const busy = Object.values(inst.mobs).some((m) => m.state === 'fight' && (m.kind === 'boss' || m.kind === 'mini' || m.role === 'healer' || m.role === 'archer'));
    if (slam && stop && !busy && now >= (f.cd[stop] ?? 0) && reacted('kickAt', true) && dist(area.animals[slam.id]!, p) <= (SPELLS[stop]?.range ?? 0) + 0.4 && cast(farm, p, mind, stop, slam.id, ctx, out)) return out;
  }
  // 1. step out of the marks on the floor (a boss's, a Skytt's line: a person sees them)
  if (careful && !mind.noDodge && reacted('markAt', marked(area, p.x, p.y, now))) {
    const here = { x: tileOf(p.x), y: tileOf(p.y) };
    const path = bfs(area, here, (x, y) => !marked(area, x * TILE + TILE / 2, y * TILE + TILE / 2, now + 600) && !marked(area, (x + 0.5) * TILE, (y + 0.5) * TILE, now), 12);
    const next = path?.[0];
    if (next !== undefined) {
      const tx = (next % W) * TILE + TILE / 2;
      const ty = Math.floor(next / W) * TILE + TILE / 2;
      const d = Math.hypot(tx - p.x, ty - p.y) || 1;
      const step = Math.min(d, (PLAYER_SPEED * (slowed ? SLOW_MUL : 1) * dtMs) / 1000);
      applyMove(area, p.id, p.x + ((tx - p.x) / d) * step, p.y + ((ty - p.y) / d) * step, facingOf(tx - p.x, ty - p.y), true);
      // a mage blinks out when it can
      if (cls === 'magiker' && f.hp < f.max * 0.5) cast(farm, p, mind, 'blink', undefined, ctx, out);
      return out;
    }
  }

  // Guldringen: gold means run IN (everyone but the masher), and stay there; even the clumsy bot runs without dawdling
  const goldSeen = mind.style === 'masher' ? undefined : inst.zones.find((z) => z.kind === 'gold');
  const gold = reacted('goldAt', !!goldSeen) ? goldSeen : undefined;
  // the clumsy bot is slow on the draw: it thinks for a moment between moves
  if (clumsy && !gold) {
    mind.pause -= dtMs;
    if (mind.pause > 0) {
      p.moving = false;
      return out;
    }
    mind.pause = (120 + mind.rnd() * 380) * (mind.style === 'kid7' || mind.kid ? 1.2 : 1);
  }

  // 2. a healing potion when low
  if (f.hp < f.max * 0.35 && now >= (f.potionAt ?? 0) && p.inventory.some((s) => s?.item === 'healing_potion')) {
    out.push(...drinkPotion(farm, p.id, ctx));
  }

  // 3. spells
  const boss = mobs.find((m) => (m.kind === 'boss' || m.kind === 'mini') && m.state === 'fight');
  const bossMove = boss?.cast ? SAGA_BOSSES[boss.species]?.moves[boss.cast.move] : undefined;
  const ice = mobs.find((m) => m.kind === 'ice');
  const open = (m: SagaMob): boolean => m.open !== undefined && now < m.open;
  const dazed = (m: SagaMob): boolean => now < (m.stunUntil ?? 0);
  const chilled = (m: SagaMob): boolean => dazed(m) || now < (m.slowUntil ?? 0);
  // the careful bot's kill order: a monster that is open first, then Besvärjare, Sköldbärare, Skytt, the rest; the closest of a kind
  // (the adult has no such order: it turns to a Besvärjare when its cast starts)
  const rank = (m: SagaMob): number => (m.kind === 'ice' ? 0 : open(m) ? 1 : adult ? (m.cast?.role === 'heal' ? 2 : 5) : m.role === 'healer' ? 2 : m.role === 'shield' ? 3 : m.role === 'archer' ? 4 : 5);
  const current = mobs.find((m) => m.id === f.target && (m.state === 'fight' || !fighting.length));
  let target: SagaMob | undefined;
  if (careful) {
    const best = [...fighting].sort((a, b) => rank(a) - rank(b) || dist(where(a), p) - dist(where(b), p))[0];
    target = ice ?? (current && current.state === 'fight' && best && rank(current) <= rank(best) ? current : best) ?? current;
    // Märke: the first human of the party marks by the kill order; everyone else (the Hirdmannen too) follows the skull
    const first = Object.keys(inst.fighters).find((id) => !farm.players[id]?.bot);
    const skull = inst.skull ? fighting.find((m) => m.id === inst.skull!.id) : undefined;
    if (first === pid) {
      if (target && target.kind !== 'ice' && inst.skull?.id !== target.id) markMob(farm, pid, target.id, ctx);
    } else if (skull && !ice) target = skull;
    // (a person clicks the monster: the auto-attack follows)
    if (target && f.target !== target.id) setTarget(farm, pid, target.id);
  } else target = ice ?? current ?? [...fighting].sort((a, b) => dist(where(a), p) - dist(where(b), p))[0];
  const hurt = friends.filter((x) => x.ff.down === undefined && x.ff.hp < x.ff.max * 0.7).sort((a, b) => a.ff.hp / a.ff.max - b.ff.hp / b.ff.max);
  const fallen = friends.filter((x) => x.ff.down !== undefined);
  const spells = CLASSES[cls].spells;
  const ready = (id: string): boolean => now >= (f.cd[id] ?? 0) && (!!SPELLS[id]?.offGcd || now >= f.gcd) && (!mind.slots || mind.slots.includes(spells.indexOf(id)));
  const go = (id: string, at?: number | string): boolean => {
    const did = cast(farm, p, mind, id, at, ctx, out);
    // (the adult misses one press in ten: the next one comes a moment late)
    if (did && adult && mind.rnd() < ADULT.miss) mind.missUntil = now + ADULT.missMs;
    return did;
  };
  // the class's interrupt, and whether to keep it: a boss's stoppable attack (a nova, a mend) is due before it would be ready again
  const kick = cls === 'vaktare' ? 'skoldslag' : cls === 'krigare' ? 'stormsteg' : cls === 'magiker' ? 'isspjut' : undefined;
  const kickReach = kick ? (SPELLS[kick]?.range ?? 0) + 0.4 : 0;
  const unlocked = inst.run?.moves;
  const keep =
    careful &&
    !!kick &&
    !!boss &&
    !!boss.next &&
    (SAGA_BOSSES[boss.species]?.moves ?? []).some((mv, k) => mv.interrupt && (mv.phase ?? 0) <= (boss.phase ?? 0) && (!unlocked || unlocked.includes(k)) && boss.next![k]! - now < (SPELLS[kick]?.cd ?? 0));
  // ... and a Besvärjare or a Skytt in the fight: the interrupt waits for their cast instead of being spent on a combo
  const save = keep || (careful && fighting.some((m) => m.role === 'healer' || m.role === 'archer'));
  const casting = (): boolean => {
    if (!fighting.length && !(ice && cls)) return false;
    // the masher: every button that is ready, 4, 3, 2, 1, at nothing in particular
    if (mind.style === 'masher') {
      let any = false;
      for (const k of [3, 2, 1, 0]) if (go(spells[k]!)) any = true;
      return any;
    }
    if (careful && kick && ready(kick) && reacted('kickAt', !!bossMove?.interrupt || fighting.some((m) => !!m.cast?.role && m.cast.role !== 'slam'))) {
      // stopping the boss's big attack; else a Besvärjare's heal or a Skytt's shot (unless the interrupt is kept for the boss)
      if (bossMove?.interrupt && boss && go(kick, boss.id)) return true;
      // (a Besvärjare's heal before a Skytt's shot: the shot can be sidestepped)
      const caster = keep ? undefined : fighting.filter((m) => m.cast?.role && m.cast.role !== 'slam' && dist(where(m), p) <= kickReach).sort((x, y) => (x.cast!.role === 'heal' ? 0 : 1) - (y.cast!.role === 'heal' ? 0 : 1))[0];
      if (caster && go(kick, caster.id)) return true;
    }
    // the spender (slot 1): the careful bot holds it for three pips, unless the moment is right (an Öppning, the class's combo)
    const spend = spells[0]!;
    const full = f.pips >= 3;
    if (cls === 'helare') {
      if (fallen[0] && dist(fallen[0].q, p) <= 4 && go('vackupp', fallen[0].id)) return true;
      const me = f.hp < f.max * 0.7 ? [{ id: pid, ff: f, q: p }] : [];
      const worst = [...hurt, ...me].sort((a, b) => a.ff.hp / a.ff.max - b.ff.hp / b.ff.max)[0];
      if (hurt.length + me.length >= 2 && go('lakekrets')) return true;
      // (the hired Hirdmannen only ever spends three pips; a hero spends early when someone is about to fall)
      if (worst && f.pips >= 1 && (full || !careful || (!p.bot && worst.ff.hp < worst.ff.max * 0.3)) && go(spend, worst.id)) return true;
      if (hurt[0] && go('lakerunan', hurt[0].id)) return true;
      if (f.hp < f.max * 0.5 && go('lakerunan', p.id)) return true;
      return false;
    }
    if (!target) return false;
    const d = dist(where(target), p);
    if (cls === 'vaktare') {
      const near = fighting.filter((m) => dist(where(m), p) <= 5);
      if (near.length >= (careful ? 1 : 2) && go('utmana')) return true;
      if (f.hp < f.max * 0.5) go('skoldmur');
      const taunted = fighting.filter((m) => m.tauntBy === pid && now < (m.tauntUntil ?? 0));
      if (f.pips >= 1 && (full || !careful || open(target) || taunted.length >= 2) && (d <= 2.2 || taunted.length > 0) && go(spend, target.id)) return true;
      if (d <= 1.8 && !save && go('skoldslag', target.id)) return true;
      return false;
    }
    if (cls === 'krigare') {
      if (go('raseri')) return true;
      const close = fighting.filter((m) => dist(where(m), p) <= 2.2);
      if (close.length >= (careful ? 1 : 2) && go('virvelvind')) return true;
      const big = target.kind === 'boss' || target.kind === 'mini';
      if (f.pips >= 1 && d <= 2.2 && ready(spend) && (full || !careful || open(target) || dazed(target))) {
        // the combo: daze it with Stormsteg first, then the Jättehugg hits double (a boss cannot be dazed)
        if (careful && full && !save && !big && !dazed(target) && ready('stormsteg')) go('stormsteg', target.id);
        if (go(spend, target.id)) return true;
      }
      if (d > 2.5 && !save && go('stormsteg', target.id)) return true;
      return false;
    }
    // magiker
    if (careful && d < 2 && f.hp < f.max * 0.6 && go('blink')) return true;
    const clustered = fighting.filter((m) => dist(where(m), where(target)) <= 2.4);
    if (clustered.length >= (careful ? 1 : 2) && go('askregn', target.id)) return true;
    if (f.pips >= 1 && ready(spend) && (full || !careful || open(target) || chilled(target))) {
      // the combo: Isspjut first, then the Runsmäll shatters the slowed monster
      if (careful && full && !save && target.kind !== 'ice' && !chilled(target) && ready('isspjut')) go('isspjut', target.id);
      if (go(spend, target.id)) return true;
    }
    if (!careful && target.kind !== 'ice' && target.hp > 150 && go('isspjut', target.id)) return true;
    return false;
  };
  // the clumsy bot misses a third of its chances (a kid of seven 40 %)
  if (fighting.length || ice) {
    if (adult && now < (mind.missUntil ?? 0)) void 0;
    else if (!clumsy || mind.rnd() > (mind.style === 'kid7' || mind.kid ? 0.4 : 0.35)) casting();
  }

  // 4. where to go
  const hereT = { x: tileOf(p.x), y: tileOf(p.y) };
  if (gold) {
    if (Math.hypot(gold.x - p.x, gold.y - p.y) / TILE > gold.r - 1) walkTo(area, p, mind, { x: tileOf(gold.x), y: tileOf(gold.y) }, dtMs, now, slowed, 0.8);
    else p.moving = false;
    return out;
  }
  // Kraftklot: the careful bot fetches an orb that lies near, when the way there is not marked
  const orb = careful && f.pips < 3 ? inst.zones.find((z) => z.kind === 'orb' && dist(z, p) <= 6 && !marked(area, z.x, z.y, now + 600)) : undefined;
  if (orb) {
    walkTo(area, p, mind, { x: tileOf(orb.x), y: tileOf(orb.y) }, dtMs, now, slowed, 0);
    return out;
  }
  const rests = inst.rests;
  if (fighting.length || ice) {
    mind.resting = false;
    const t = target ?? fighting[0]!;
    const a = where(t);
    if (!a) return out; // it fell to the spell just cast
    const d = dist(a, p);
    const spell = SPELLS[CLASSES[cls].auto];
    const want = isRanged(cls) ? Math.min(5.5, (cls === 'helare' ? 6 : (spell?.range ?? 8) - 2)) : 1.5;
    // a careful hero who has stepped out of a mark waits at its rim until it has landed (it does not walk back in)
    if (careful && !mind.noDodge) {
      const n = Math.hypot(a.x - p.x, a.y - p.y) || 1;
      const ahead = Math.min(n, 1.2 * TILE);
      if (d > 0.3 && [0.5, 1].some((k) => marked(area, p.x + ((a.x - p.x) / n) * ahead * k, p.y + ((a.y - p.y) / n) * ahead * k, now))) {
        p.moving = false;
        return out;
      }
    }
    // the healer stays near whoever is hurt worst, or the tank
    const anchor = cls === 'helare' ? (hurt[0]?.q ?? friends.find((x) => x.ff.cls === 'vaktare')?.q) : undefined;
    if (anchor && dist(anchor, p) > 5) {
      walkTo(area, p, mind, { x: tileOf(anchor.x), y: tileOf(anchor.y) }, dtMs, now, slowed, 2);
    } else if (isRanged(cls) && d < 3.5 && cls === 'magiker' && mind.style !== 'masher' && !mind.noDodge && dist(t.home, p) < 14) {
      // (not further than the monster follows: dragged past its leash it goes home, heals, and the fight starts over)
      // (the masher stands where it is and presses its buttons; so does the bot that never leaves a mark: backing away is how a mage leaves most of them)
      // back away from what is close
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const n = Math.hypot(dx, dy) || 1;
      const step = (PLAYER_SPEED * (slowed ? SLOW_MUL : 1) * dtMs) / 1000;
      applyMove(area, p.id, p.x + (dx / n) * step, p.y + (dy / n) * step, facingOf(dx, dy), true);
    } else if (d > want || !lineOfSight(area, p.x, p.y, a.x, a.y)) {
      // (a monster that is close but behind a wall cannot be hit: walk round to where it can be seen)
      walkTo(area, p, mind, { x: tileOf(a.x), y: tileOf(a.y) }, dtMs, now, slowed, d > want && want > 2 ? want - 0.5 : 1.2);
    } else p.moving = false;
    return out;
  }

  // nothing fighting: rest if hurt (at a Vilosten until nearly full)
  const hurtMe = f.hp < f.max * (inst.run?.kind === 'rest' ? 0.9 : 0.55);
  if (rests.length && (hurtMe || mind.resting)) {
    mind.resting = f.hp < f.max * 0.95;
    if (mind.resting) {
      let best = rests[0]!;
      for (const r of rests) if (dist({ x: r.x * TILE, y: r.y * TILE }, p) < dist({ x: best.x * TILE, y: best.y * TILE }, p)) best = r;
      if (dist({ x: best.x * TILE + TILE / 2, y: best.y * TILE + TILE / 2 }, p) > REST_RADIUS - 1) walkTo(area, p, mind, best, dtMs, now, slowed, REST_RADIUS - 1.5);
      else p.moving = false;
      return out;
    }
  }
  // a fallen friend: go and wake them
  if (cls === 'helare' && fallen[0]) {
    if (dist(fallen[0].q, p) > 3) walkTo(area, p, mind, { x: tileOf(fallen[0].q.x), y: tileOf(fallen[0].q.y) }, dtMs, now, slowed, 2.5);
    else cast(farm, p, mind, 'vackupp', fallen[0].id, ctx, out);
    return out;
  }
  // the boss is down: its chest, once
  if (inst.bossDown) {
    const chest = Object.values(area.objects).find((o) => o.kind === 'saga_chest' && o.variant === 2);
    if (chest && !p.bot && !(inst.looted[chest.id] ?? []).includes(p.id)) {
      if (dist({ x: chest.x * TILE + TILE / 2, y: chest.y * TILE + TILE / 2 }, p) > 1.6) walkTo(area, p, mind, chest, dtMs, now, slowed, 1.2);
      else out.push(...performAction(area, p.id, chest.x, chest.y, ctx));
      return out;
    }
    p.moving = false;
    return out;
  }
  // the next monsters on the way: the packs that must fall, the guard, then the boss
  const required = new Set(inst.packs.flatMap((pk, i) => (inst.run?.required.includes(i) ? pk.members : [])));
  const todo = mobs.filter((m) => (m.kind === 'mob' && required.has(m.id)) || m.kind === 'mini' || (m.kind === 'boss' && inst.gateOpen));
  const owed = inst.run?.required.some((i) => !inst.packs[i]?.dead) ?? false;
  if (todo.length && (owed || inst.run?.kind === 'boss' || inst.run?.kind === 'mini')) {
    // the closest of them by the way there (not through the wall), and the same one until it is down
    const spell = SPELLS[CLASSES[cls].auto];
    const pull = isRanged(cls) ? Math.min(6, (spell?.range ?? 8) - 2) : 1.5;
    let m = todo.find((x) => x.id === mind.chase);
    if (!m) {
      const hit = bfs(area, hereT, (x, y) => todo.some((c) => Math.hypot(where(c).x / TILE - x - 0.5, where(c).y / TILE - y - 0.5) <= pull));
      const end = hit?.[hit.length - 1];
      const ex = end === undefined ? hereT.x : end % W;
      const ey = end === undefined ? hereT.y : Math.floor(end / W);
      m = [...todo].sort((a, b) => Math.hypot(where(a).x / TILE - ex, where(a).y / TILE - ey) - Math.hypot(where(b).x / TILE - ex, where(b).y / TILE - ey))[0]!;
      mind.chase = m.id;
    }
    const a = where(m);
    if (dist(a, p) > pull) walkTo(area, p, mind, { x: tileOf(a.x), y: tileOf(a.y) }, dtMs, now, slowed, pull > 2 ? pull - 0.5 : 1.2);
    else if (m.state === 'idle') {
      // wake them with a deliberate first blow (the everyday attack, pressed)
      // (no line of sight from out here: go closer)
      if (!cast(farm, p, mind, CLASSES[cls].auto, m.id, ctx, out)) walkTo(area, p, mind, { x: tileOf(a.x), y: tileOf(a.y) }, dtMs, now, slowed, 1.5);
    }
    return out;
  }
  // the way on: wait for the gate, then walk onto a väg-runa (the humans' vote; the hired companion follows and does not vote)
  if (inst.run && inst.run.kind !== 'boss') {
    if (!inst.gateOpen) {
      p.moving = false;
      return out;
    }
    const exits = inst.run.exits ?? [];
    if (p.bot || !exits.length) {
      // (the cards are being voted on, or the runes are not out yet: wait in the exit room)
      if (dist({ x: inst.exit.x * TILE + TILE / 2, y: inst.exit.y * TILE + TILE / 2 }, p) > 3) walkTo(area, p, mind, inst.exit, dtMs, now, slowed, 2.5);
      else p.moving = false;
      return out;
    }
    if (mind.rune?.key !== inst.run.run + ':' + inst.run.node) {
      // the safe lane: a Vilosten when someone is hurt (else a fight, on to the boss); the clumsy bot just picks one
      const rest = exits.findIndex((e) => e.kind === 'rest');
      const hurtParty = f.hp < f.max * 0.7 || friends.some((x) => x.ff.hp < x.ff.max * 0.6);
      // a plain Flock first (the loot), then a Skatt, the Köpman or a Händelse; a Stark vakt only when there is nothing else
      const order = ['flock', 'mini', 'boss', 'treasure', 'shop', 'event', 'elite'];
      const fight = exits.map((e, i) => ({ i, o: order.indexOf(e.kind) })).filter((x) => x.o >= 0).sort((p, q) => p.o - q.o)[0]?.i ?? -1;
      const at = mind.lane === 'safe' ? (rest >= 0 && (hurtParty || fight < 0) ? rest : Math.max(0, fight)) : Math.floor(mind.rnd() * exits.length);
      mind.rune = { key: inst.run.run + ':' + inst.run.node, at };
    }
    const e = exits[mind.rune.at]!;
    if (dist({ x: e.x * TILE + TILE / 2, y: e.y * TILE + TILE / 2 }, p) > 0.4) walkTo(area, p, mind, e, dtMs, now, slowed, 0);
    else p.moving = false;
    return out;
  }
  p.moving = false;
  return out;
}
