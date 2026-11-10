// A fighter that plays a run by itself: walks to the next monsters, uses its class's spells the way a person would
// (the tank taunts and shields, the healer heals and wakes friends, the warrior whirls, the mage fires from afar),
// steps out of the boss's marks and stops its big attacks, and chooses the way on by walking onto a väg-runa (the careful
// bot takes the safe lane, a Vilosten when there is one; the clumsy bot a random lane). It is the brain of the tests' bot
// parties (a careful one and a clumsy one that does neither) and of the hired companion (Hirdmannen) the server runs for a lone player. It only does
// what a person at a keyboard can: it walks with `applyMove`, casts with `castSpell`, presses the use key with
// `performAction`; it never touches the rules.
import { applyMove, farmOf, isSolidForPlayer, lineOfSight, performAction, type SimCtx } from './sim.ts';
import { SLOW_MUL, castSpell, drinkPotion, inZone } from './sagasim.ts';
import { CLASSES, REST_RADIUS, SAGA_BOSSES, SPELLS, type ClassId, type SagaMob } from './saga.ts';
import { PLAYER_SPEED, TILE, type AnimalState, type Facing, type PlayerState, type WorldState } from './types.ts';
import type { Change } from './protocol.ts';

/** `kid7` is a 7-year-old: clumsy with a 1.2 times longer think between moves and 40 % misses (GAME2.md section 8). */
export type BotStyle = 'careful' | 'clumsy' | 'kid7';

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
}

export const newMind = (style: BotStyle, rnd: () => number, lane?: 'safe' | 'random'): BotMind => ({ style, rnd, pause: 0, lane: lane ?? (style === 'careful' ? 'safe' : 'random') });

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
  (area.saga?.zones ?? []).some((z) => (z.until === undefined || now >= z.at) && inZone(z, { x, y }) && (z.dmg > 0 || z.until !== undefined));

/** What a person would do: the healer's spell on the hurt one, etc. True if a spell went. */
function cast(farm: WorldState, p: PlayerState, spell: string, target: number | string | undefined, ctx: SimCtx, out: Change[]): boolean {
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
  const careful = mind.style === 'careful';
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

  // 1. step out of the boss's marks (a person sees them on the floor)
  if (careful && marked(area, p.x, p.y, now)) {
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
      if (cls === 'magiker' && f.hp < f.max * 0.5) cast(farm, p, 'blink', undefined, ctx, out);
      return out;
    }
  }

  // the clumsy bot is slow on the draw: it thinks for a moment between moves
  if (!careful) {
    mind.pause -= dtMs;
    if (mind.pause > 0) {
      p.moving = false;
      return out;
    }
    mind.pause = (120 + mind.rnd() * 380) * (mind.style === 'kid7' ? 1.2 : 1);
  }

  // 2. a healing potion when low
  if (f.hp < f.max * 0.35 && now >= (f.potionAt ?? 0) && p.inventory.some((s) => s?.item === 'healing_potion')) {
    out.push(...drinkPotion(farm, p.id, ctx));
  }

  // 3. spells
  const boss = mobs.find((m) => (m.kind === 'boss' || m.kind === 'mini') && m.state === 'fight');
  const bossMove = boss?.cast ? SAGA_BOSSES[boss.species]?.moves[boss.cast.move] : undefined;
  const ice = mobs.find((m) => m.kind === 'ice');
  const target =
    ice ??
    mobs.find((m) => m.id === f.target) ??
    [...fighting].sort((a, b) => dist(where(a), p) - dist(where(b), p))[0];
  const hurt = friends.filter((x) => x.ff.down === undefined && x.ff.hp < x.ff.max * 0.7).sort((a, b) => a.ff.hp / a.ff.max - b.ff.hp / b.ff.max);
  const fallen = friends.filter((x) => x.ff.down !== undefined);
  const casting = (): boolean => {
    if (!fighting.length && !(ice && cls)) return false;
    const spells = CLASSES[cls].spells;
    const has = (id: string): boolean => spells.includes(id);
    // stopping the boss's big attack
    if (careful && bossMove?.interrupt && boss) {
      for (const id of ['skoldslag', 'isspjut', 'stormsteg']) if (has(id) && cast(farm, p, id, boss.id, ctx, out)) return true;
    }
    if (cls === 'helare') {
      if (fallen[0] && dist(fallen[0].q, p) <= 4 && cast(farm, p, 'vackupp', fallen[0].id, ctx, out)) return true;
      if (hurt.length >= 2 && cast(farm, p, 'lakekrets', undefined, ctx, out)) return true;
      if (hurt[0] && cast(farm, p, 'lakerunan', hurt[0].id, ctx, out)) return true;
      if (f.hp < f.max * 0.5 && cast(farm, p, 'lakerunan', p.id, ctx, out)) return true;
      return !!target && cast(farm, p, 'ljuspil', target.id, ctx, out);
    }
    if (cls === 'vaktare') {
      const near = fighting.filter((m) => dist(where(m), p) <= 5);
      if (near.length >= 2 && cast(farm, p, 'utmana', undefined, ctx, out)) return true;
      if (f.hp < f.max * 0.5 && cast(farm, p, 'skoldmur', undefined, ctx, out)) return true;
      if (target && dist(where(target), p) <= 1.8 && cast(farm, p, 'skoldslag', target.id, ctx, out) && careful) return true;
      return !!target && cast(farm, p, 'hugg', target.id, ctx, out);
    }
    if (cls === 'krigare') {
      if (fighting.length && cast(farm, p, 'raseri', undefined, ctx, out)) return true;
      const close = fighting.filter((m) => dist(where(m), p) <= 2.2);
      if (close.length >= 2 && cast(farm, p, 'virvelvind', undefined, ctx, out)) return true;
      if (target && dist(where(target), p) > 2.5 && cast(farm, p, 'stormsteg', target.id, ctx, out)) return true;
      return !!target && cast(farm, p, 'yxhugg', target.id, ctx, out);
    }
    // magiker
    if (careful && target && dist(where(target), p) < 2 && f.hp < f.max * 0.6 && cast(farm, p, 'blink', undefined, ctx, out)) return true;
    const clustered = target ? fighting.filter((m) => dist(where(m), where(target)) <= 2.4) : [];
    if (target && clustered.length >= 2 && cast(farm, p, 'askregn', target.id, ctx, out)) return true;
    if (target && target.kind !== 'ice' && target.hp > 150 && cast(farm, p, 'isspjut', target.id, ctx, out)) return true;
    return !!target && cast(farm, p, 'eldboll', target.id, ctx, out);
  };
  // the clumsy bot misses a third of its chances (a kid of seven 40 %)
  if (fighting.length || ice) {
    if (careful || mind.rnd() > (mind.style === 'kid7' ? 0.4 : 0.35)) casting();
  }

  // 4. where to go
  const hereT = { x: tileOf(p.x), y: tileOf(p.y) };
  const rests = inst.rests;
  if (fighting.length || ice) {
    mind.resting = false;
    const t = target ?? fighting[0]!;
    const a = where(t);
    if (!a) return out; // it fell to the spell just cast
    const d = dist(a, p);
    const spell = SPELLS[CLASSES[cls].spells[0]!];
    const want = isRanged(cls) ? Math.min(5.5, (cls === 'helare' ? 6 : (spell?.range ?? 8) - 2)) : 1.5;
    // the healer stays near whoever is hurt worst, or the tank
    const anchor = cls === 'helare' ? (hurt[0]?.q ?? friends.find((x) => x.ff.cls === 'vaktare')?.q) : undefined;
    if (anchor && dist(anchor, p) > 5) {
      walkTo(area, p, mind, { x: tileOf(anchor.x), y: tileOf(anchor.y) }, dtMs, now, slowed, 2);
    } else if (isRanged(cls) && d < 3.5 && cls === 'magiker') {
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
    else cast(farm, p, 'vackupp', fallen[0].id, ctx, out);
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
    const spell = SPELLS[CLASSES[cls].spells[0]!];
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
      // wake them with a first spell
      const first = CLASSES[cls].spells.find((id) => ['melee', 'bolt', 'lance', 'storm'].includes(SPELLS[id]?.kind ?? '')) ?? CLASSES[cls].spells[0]!;
      // (no line of sight from out here: go closer)
      if (!cast(farm, p, first, m.id, ctx, out)) walkTo(area, p, mind, { x: tileOf(a.x), y: tileOf(a.y) }, dtMs, now, slowed, 1.5);
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
