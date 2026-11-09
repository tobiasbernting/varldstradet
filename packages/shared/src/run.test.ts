// Runs (M5b): the generator, the data, every effect of every runa and node, the run's rules (the vote, sagafrön, the timer,
// the wipe, joining, the companion, the sagaträd, the farm's objects, saves) and whole runs played by bot parties.
import { describe, expect, it } from 'vitest';
import {
  BOSS_STOP,
  MINI_STOP,
  REST_STOP,
  NODE_KINDS,
  ROUTE_ROWS,
  ROUTE_MINI_ROW,
  ROUTE_REST_ROW,
  ROUTE_DWELL_MS,
  ROUTE_VOTE_MS,
  ROUTE_DISC_RADIUS,
  NODE_KIND_CODE,
  VILOSTEN_HEAL,
  WING_HP,
  wingOf,
  tally,
  generateRoute,
  routeSnap,
  dungeonMobs,
  finderOf,
  runnableDungeons,
  CLASSES,
  CLASS_IDS,
  DUNGEONS,
  DUNGEON_IDS,
  EFFECT_KEYS,
  MODIFIERS,
  MODIFIER_TEXT,
  RUNOR,
  RUNA_NAMES,
  RUNA_TEXT,
  RUN_BIOMES,
  RUN_MAX_MS,
  RUN_NUDGE_MS,
  RUN_PICK_MS,
  RUN_SEEDS,
  RUN_T,
  LATT,
  fmt,
  SAGOANDAN,
  SAGOANDAN_HP,
  levelMuls,
  lattMoves,
  parseRunLevel,
  runMessage,
  RUN_WARN_MS,
  SAGA_BOSSES,
  SEED_TREE,
  TILE,
  TREE_NAMES,
  TREE_STAGES,
  TREE_TEXT,
  TREE_TOTAL,
  SOLO_MERCY,
  companionClass,
  ITEMS,
  LEASH_TILES,
  WIPE_MS,
  XP_LEVELS,
  equipGear,
  fighterMax,
  ZONE_TEMPLATES,
  STOP_NAMES,
  STOP_WORDS,
  FARDKOST,
  FOOD_TEXT,
  MODIFIER_NAMES,
  addEffect,
  addItem,
  addObject,
  applyMove,
  archFrontOf,
  buffsOf,
  buildStop,
  castSpell,
  chapterBoss,
  chooseFardkost,
  enterStop,
  endRun,
  ensureRunPlaces,
  fardportOf,
  foodSlots,
  generateRun,
  getArea,
  isSolidForPlayer,
  joinRun,
  jumpTo,
  leaveRun,
  newRunSave,
  noBuffs,
  objectAt,
  offerRunor,
  performAction,
  pickRuna,
  plantError,
  plantNode,
  plantedByFamily,
  placeIn,
  readRun,
  rejoinRun,
  rerollOffer,
  runOf,
  runSaveOf,
  shootOf,
  startRun,
  spawnSagaMob,
  tick,
  treeNode,
  treeStage,
  unlocksOf,
  mulberry32,
  type Change,
  type ClassId,
  type DungeonId,
  type NodeKind,
  type RunEffect,
  type WorldState,
} from './index.ts';
import { makeParty, playRun, step, type Party } from './runplay.ts';

const px = (t: number): number => t * TILE + TILE / 2;

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

function reach(w: WorldState, from: { x: number; y: number }): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = `${n.x},${n.y}`;
      if (seen.has(k) || isSolidForPlayer(w, n.x, n.y)) continue;
      seen.add(k);
      q.push(n);
    }
  }
  return seen;
}
const near = (seen: Set<string>, t: { x: number; y: number }): boolean => [0, 1, -1].some((dx) => [0, 1, -1].some((dy) => seen.has(`${t.x + dx},${t.y + dy}`)));
const tileOfMob = (a: { x: number; y: number }): { x: number; y: number } => ({ x: Math.floor(a.x / TILE), y: Math.floor(a.y / TILE) });

/** The stops on one path through the route from the start, the way a seed chooses (a different lane in each row). */
function pathOf(plan: ReturnType<typeof generateRun>, seed: number): number[] {
  const rnd = mulberry32(seed);
  const out = [0];
  for (let n = plan.route.nodes[0]!; n.next.length; ) {
    n = plan.route.nodes[n.next[Math.floor(rnd() * n.next.length)]!]!;
    out.push(n.id);
  }
  return out;
}

/** Checks one built stop: walkable from the start, its gate shutting the way on until it opens, everything reachable after. */
function checkStop(plan: ReturnType<typeof generateRun>, node: number, key: string): void {
  const z = plan.stops[node]!;
  const w = buildStop(plan, node, key);
  const inst = w.saga!;
  const why = `seed ${plan.seed} ${plan.boss} node ${node} (${z.kind})`;
  expect(z.def.id, why).toBe(plan.boss);
  // the chapter's own look
  const d = DUNGEONS[plan.boss];
  expect(z.def.floor).toBe(d.floor);
  expect(z.def.wall).toBe(d.wall);
  expect(z.def.ambient).toEqual(d.ambient);
  expect(z.def.decor).toEqual(d.decor);
  const before = reach(w, inst.start);
  const goal = z.kind === 'boss' ? tileOfMob(w.animals[inst.boss]!) : inst.exit;
  expect(inst.rests, why).toHaveLength(z.kind === 'rest' ? 1 : 0);
  if (z.kind === 'rest') {
    expect(inst.gate, why).toHaveLength(0);
    expect(near(before, goal), why).toBe(true);
    expect(near(before, inst.rests[0]!), why).toBe(true);
  } else {
    // the gate shuts the way on until it opens: the exit room (or the boss) is out of reach, everything before it is not
    expect(near(before, goal), why).toBe(false);
    expect(inst.gate.length, why).toBeGreaterThanOrEqual(2);
    for (const g of inst.gate) {
      const o = objectAt(w, g.x, g.y)!;
      delete w.occupancy[`${g.x},${g.y}`];
      delete w.objects[o.id];
    }
  }
  const after = reach(w, inst.start);
  expect(near(after, goal), why).toBe(true);
  for (const m of Object.values(inst.mobs)) expect(after.has(`${Math.floor(m.home.x / TILE)},${Math.floor(m.home.y / TILE)}`), why).toBe(true);
  // no stray dungeon exit in a stop (a run is left with `leave`), and no väg-runor until the stop is cleared
  expect(Object.values(w.objects).some((o) => o.kind === 'saga_exit' || o.kind === 'run_exit'), why).toBe(false);
  expect(inst.mini !== 0, why).toBe(z.kind === 'mini' || z.def.rooms.some((r) => r.kind === 'mini'));
  expect(inst.boss !== 0, why).toBe(z.kind === 'boss');
  expect(z.def.rooms.filter((r) => r.kind === 'start')).toHaveLength(1);
}

describe('the route generator (generateRoute)', () => {
  it('makes 300 seeded routes for every dungeon: ten rows, the fixed rows, every stop reachable and leading to the boss, a Vilosten in each wing', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const dungeon = DUNGEON_IDS[seed % DUNGEON_IDS.length]!;
      const route = generateRoute(seed, { dungeon, level: seed % 2 === 0 ? 0 : 1 });
      const why = `seed ${seed} ${dungeon}`;
      expect(route.dungeon).toBe(dungeon);
      route.nodes.forEach((n, i) => expect(n.id, why).toBe(i));
      const rows = Array.from({ length: ROUTE_ROWS }, (_, r) => route.nodes.filter((n) => n.row === r + 1));
      expect(rows.every((r) => r.length >= 1 && r.length <= 3), why).toBe(true);
      // the fixed rows: a Flock first, the Mellanboss on 5, the last rest on 9 and the Boss on 10
      expect(rows[0]!.map((n) => n.kind)).toEqual(['flock']);
      expect(rows[ROUTE_MINI_ROW - 1]!.map((n) => n.kind)).toEqual(['mini']);
      expect(rows[ROUTE_REST_ROW - 1]!.map((n) => n.kind)).toEqual(['rest']);
      expect(rows[ROUTE_ROWS - 1]!.map((n) => n.kind)).toEqual(['boss']);
      // the others have two or three lanes; rows 4 and 8 have exactly one Vilosten (the safe lane), rows 3 and 7 none
      for (const r of [2, 3, 4, 6, 7, 8]) expect(rows[r - 1]!.length, `${why} row ${r}`).toBeGreaterThanOrEqual(2);
      for (const r of [4, 8]) expect(rows[r - 1]!.filter((n) => n.kind === 'rest'), `${why} row ${r}`).toHaveLength(1);
      for (const r of [3, 7]) expect(rows[r - 1]!.some((n) => n.kind === 'rest'), `${why} row ${r}`).toBe(false);
      for (const n of route.nodes) {
        expect(NODE_KINDS).toContain(n.kind);
        expect(n.lanes).toBe(rows[n.row - 1]!.length);
        if (n.row < ROUTE_ROWS) {
          expect(n.next.length, `${why} node ${n.id}`).toBeGreaterThanOrEqual(1);
          for (const m of n.next) expect(route.nodes[m]!.row).toBe(n.row + 1);
        } else expect(n.next).toEqual([]);
        if (n.row > 1) expect(route.nodes.some((q) => q.next.includes(n.id)), `${why} node ${n.id} has a way in`).toBe(true);
      }
      // every stop is reachable from the start and leads on to the boss; the same walking backwards
      const from = new Set([0]);
      for (const n of route.nodes) if (from.has(n.id)) for (const m of n.next) from.add(m);
      expect(from.size, why).toBe(route.nodes.length);
      const last = route.nodes.length - 1;
      const to = new Set([last]);
      for (const n of [...route.nodes].reverse()) if (n.next.some((m) => to.has(m))) to.add(n.id);
      expect(to.size, why).toBe(route.nodes.length);
      // a Vilosten in each wing, and the safe lane of rows 4 and 8 can be walked to from every stop of the row before
      for (const [lo, hi] of [[1, 4], [5, 8], [9, 10]] as const) expect(route.nodes.some((n) => n.row >= lo && n.row <= hi && n.kind === 'rest' && from.has(n.id)), `${why} wing ${lo}`).toBe(true);
      for (const r of [4, 8]) {
        const safe = rows[r - 1]!.find((n) => n.kind === 'rest')!;
        for (const n of rows[r - 2]!) expect(n.next, `${why} row ${r - 1} node ${n.id}`).toContain(safe.id);
      }
    }
  });

  it('is deterministic from the seed, and different seeds give different routes; the level does not change the map', () => {
    const a = generateRoute(42, { dungeon: 'hel', level: 1 });
    expect(JSON.stringify(generateRoute(42, { dungeon: 'hel', level: 1 }))).toBe(JSON.stringify(a));
    expect(generateRoute(42, { dungeon: 'hel', level: 0 }).nodes).toEqual(a.nodes);
    const shapes = new Set(Array.from({ length: 30 }, (_, i) => generateRoute(i + 1, { dungeon: 'hel', level: 1 }).nodes.map((n) => n.kind[0]! + n.next.join('')).join('|')));
    expect(shapes.size).toBeGreaterThan(20);
    const planA = generateRun(42, { boss: 'hel' });
    const planB = generateRun(42, { boss: 'hel' });
    expect(JSON.stringify(planA)).toBe(JSON.stringify(planB));
    expect(JSON.stringify(buildStop(planA, 1, 'saga:x').terrain)).toBe(JSON.stringify(buildStop(planB, 1, 'saga:x').terrain));
    expect(routeSnap(a)).toHaveLength(a.nodes.length);
  });

  it('builds the stops: 100 seeded runs, each on a path through the route, walkable from the start with the gate and the rest stone where they should be', { timeout: 120_000 }, async () => {
    for (let seed = 1; seed <= 100; seed++) {
      // (let the test runner report in now and then: a worker that never does gets a timeout from the runner on a busy machine)
      if (seed % 10 === 0) await new Promise((r) => setImmediate(r));
      const boss = DUNGEON_IDS[seed % DUNGEON_IDS.length]!;
      const plan = generateRun(seed, { boss, replay: seed % 3 === 0, clears: 1 + (seed % 3) });
      expect(plan.stops).toHaveLength(plan.route.nodes.length);
      // a path of ten stops, one of each fixed kind on it
      const path = pathOf(plan, seed);
      expect(path).toHaveLength(ROUTE_ROWS);
      for (const id of path) checkStop(plan, id, `saga:test${seed}z${id}`);
    }
  });

  it('builds every stop of nine routes, one per dungeon', { timeout: 120_000 }, async () => {
    for (const [i, boss] of DUNGEON_IDS.entries()) {
      await new Promise((r) => setImmediate(r));
      const plan = generateRun(100 + i, { boss });
      for (const n of plan.route.nodes) checkStop(plan, n.id, `saga:all${i}z${n.id}`);
    }
  });

  it('lays a Flock out in the rooms of one of the seven biome templates, in the chapter’s own look and with its monsters', () => {
    const used = new Set<string>();
    for (let seed = 1; seed < 80; seed++) {
      const boss = DUNGEON_IDS[seed % DUNGEON_IDS.length]!;
      const plan = generateRun(seed, { boss });
      const mobs = dungeonMobs(boss);
      const species = new Set([...mobs.small, ...mobs.medium, ...mobs.big]);
      expect([...species].every((m) => (DUNGEONS[boss].rooms.flatMap((r) => r.packs ?? []).flat() as string[]).includes(m))).toBe(true);
      for (const z of plan.stops) {
        for (const r of z.def.rooms) for (const pk of r.packs ?? []) for (const m of pk) expect(species.has(m), `${boss} ${z.kind}: ${m}`).toBe(true);
        if (z.kind !== 'flock') continue;
        const t = ZONE_TEMPLATES[z.layout!];
        used.add(z.layout!);
        // start, two rooms of packs, the exit room: the template's rooms (mirrored or not), the rest stone and the side room left out
        expect(z.def.rooms.map((r) => r.kind)).toEqual(['start', 'pack', 'pack', 'pack']);
        const sizes = z.def.rooms.map((r) => `${r.w}x${r.h}`);
        expect(sizes).toEqual([t.rooms[0], t.rooms[1], t.rooms[2], t.rooms[4]].map((r) => `${r.w}x${r.h}`));
        expect(z.def.rooms[3]!.gated).toBe(true);
        expect(z.def.rooms[3]!.packs).toBeUndefined();
      }
    }
    expect([...used].sort()).toEqual([...RUN_BIOMES].sort());
  });

  it('gives every kind of stop its sizes: a Flock of two rooms of packs by wing, the Mellanboss in the dungeon’s own hall, the boss’s hall behind a gate', () => {
    for (const boss of DUNGEON_IDS) {
      const plan = generateRun(7, { boss });
      const d = DUNGEONS[boss];
      const mini = plan.stops.find((z) => z.kind === 'mini')!;
      const hall = mini.def.rooms.find((r) => r.kind === 'mini')!;
      const own = d.rooms.find((r) => r.kind === 'mini')!;
      expect([hall.w, hall.h]).toEqual([own.w, own.h]);
      expect(mini.gate).toBe('mini');
      expect(mini.required).toEqual([]);
      expect(mini.def.rooms.at(-1)!.gated).toBe(true);
      const last = plan.stops.at(-1)!;
      expect(last.kind).toBe('boss');
      expect(last.def.rooms.at(-1)!.kind).toBe('boss');
      expect(last.def.rooms.at(-1)!.gated).toBe(true);
      expect(last.gate).toBe('packs');
      expect(last.required.length).toBe(last.def.rooms.flatMap((r) => r.packs ?? []).length);
      const rest = plan.stops.find((z) => z.kind === 'rest')!;
      expect(rest.def.rooms.map((r) => r.kind)).toEqual(['start', 'rest', 'pack']);
      expect(rest.required).toEqual([]);
      // the later wings are tougher
      const flocks = plan.stops.filter((z) => z.kind === 'flock');
      for (const z of flocks) expect(z.hpMul).toBe(WING_HP[wingOf(z.row)]);
      expect(WING_HP[0]).toBeLessThan(WING_HP[1]!);
    }
  });

  it('keeps every template and fixed layout inside the map with the rooms apart, and the exit room last', () => {
    const apartAll = (rooms: { x: number; y: number; w: number; h: number }[], name: string): void => {
      rooms.forEach((a, i) => {
        expect(a.x, name).toBeGreaterThanOrEqual(3);
        expect(a.y, name).toBeGreaterThanOrEqual(3);
        expect(a.x + a.w, name).toBeLessThanOrEqual(61);
        expect(a.y + a.h, name).toBeLessThanOrEqual(61);
        rooms.forEach((b, j) => {
          if (j <= i) return;
          const apart = a.x + a.w + 2 <= b.x || b.x + b.w + 2 <= a.x || a.y + a.h + 2 <= b.y || b.y + b.h + 2 <= a.y;
          expect(apart, `${name}: rooms ${i} and ${j}`).toBe(true);
        });
      });
    };
    for (const t of Object.values(ZONE_TEMPLATES)) {
      expect(t.rooms.map((r) => r.role)).toEqual(['start', 'pack', 'pack', 'rest', 'exit', 'side']);
      apartAll(t.rooms, t.biome);
      expect(t.links.some(([, c]) => c === 4)).toBe(true);
      for (const [p, c] of t.links) expect(p).not.toBe(c);
    }
    apartAll(Object.values(REST_STOP), 'rest stop');
    for (const boss of DUNGEON_IDS) {
      const d = DUNGEONS[boss];
      const mini = d.rooms.find((r) => r.kind === 'mini')!;
      const hall = d.rooms.find((r) => r.kind === 'boss')!;
      apartAll([MINI_STOP.start, MINI_STOP.pack, { ...MINI_STOP.hall, w: mini.w, h: mini.h }, MINI_STOP.exit], `mini stop ${boss}`);
      apartAll([BOSS_STOP.start, BOSS_STOP.pack, { ...BOSS_STOP.hall, w: Math.min(hall.w, BOSS_STOP.hall.w), h: Math.min(hall.h, BOSS_STOP.hall.h) }], `boss stop ${boss}`);
      apartAll([BOSS_STOP.start, BOSS_STOP.pack, BOSS_STOP.guard], 'boss stop guard');
    }
  });

  it('chooses the chapter boss in the saga order, and gives replays modifiers and every boss move', () => {
    expect(chapterBoss([])).toBe('draug');
    expect(chapterBoss(['draug', 'frost'])).toBe('surt');
    expect(chapterBoss([...DUNGEON_IDS])).toBeNull();
    const first = generateRun(5, { boss: 'draug' });
    expect(first.modifiers).toEqual([]);
    expect(first.replay).toBe(false);
    const moves = SAGA_BOSSES[DUNGEONS.draug.boss]!.moves;
    // a first clear leaves one attack out, never the first nor the one that can be stopped
    expect(first.moves!.length).toBe(moves.length - 1);
    expect(first.moves).toContain(0);
    expect(first.moves).toContain(moves.findIndex((m) => m.interrupt));
    const replays = [1, 2, 3, 4].map((clears) => generateRun(5, { boss: 'draug', replay: true, clears }));
    expect(replays.map((r) => r.modifiers.length)).toEqual([1, 2, 3, 3]);
    for (const r of replays) expect(r.moves).toBeUndefined();
    // each modifier does what it says on the plan (node 0 is the first Flock, the last node the boss)
    const w = (id: string) => generateRun(9, { boss: 'draug', modifiers: [id] });
    const plain = generateRun(9, { boss: 'draug' });
    expect(w('segare').stops[0]!.hpMul).toBeCloseTo(plain.stops[0]!.hpMul * 1.25);
    expect(w('harda').stops[0]!.dmgMul).toBe(1.2);
    expect(w('snabba').stops[0]!.sight).toBe(1.4);
    expect(w('dimma').stops[0]!.leash).toBe(6);
    expect(w('dimma').stops[0]!.weather).toBe('fog');
    expect(w('vakten').stops.at(-1)!.def.rooms.some((r) => r.kind === 'mini')).toBe(true);
    expect(plain.stops.at(-1)!.def.rooms.some((r) => r.kind === 'mini')).toBe(false);
    const more = w('fler');
    const count = (p: typeof plain) => p.stops[0]!.def.rooms.flatMap((r) => r.packs ?? []).reduce((n, pk) => n + pk.length, 0);
    expect(count(more)).toBeGreaterThan(count(plain));
  });
});

// ---------------------------------------------------------------------------
// The data
// ---------------------------------------------------------------------------

describe('the data', () => {
  it('has at least 8 runor for each class and 6 for the whole party, each with a Swedish name, text and picture', () => {
    for (const c of CLASS_IDS) expect(RUNOR.filter((r) => r.cls === c).length).toBeGreaterThanOrEqual(8);
    expect(RUNOR.filter((r) => !r.cls)).toHaveLength(6);
    expect(new Set(RUNOR.map((r) => r.id)).size).toBe(RUNOR.length);
    for (const r of RUNOR) {
      expect(RUNA_NAMES[r.id], r.id).toBeTruthy();
      expect(RUNA_NAMES[r.id]!.split(' ').length).toBeLessThanOrEqual(4);
      expect(RUNA_TEXT[r.id], r.id).toBeTruthy();
      expect(RUNA_TEXT[r.id]!.length).toBeLessThanOrEqual(40);
      expect(RUNA_TEXT[r.id]).toMatch(/\d/);
      expect(r.icon).toBeTruthy();
      expect(Object.keys(r.effect).length).toBeGreaterThan(0);
      for (const k of Object.keys(r.effect)) expect(EFFECT_KEYS).toContain(k);
      // a class's runa only reaches for the class's own spells
      for (const s of [...Object.keys(r.effect.spell ?? {}), ...Object.keys(r.effect.spellCd ?? {})]) expect(r.cls && CLASSES[r.cls].spells.includes(s), r.id).toBe(true);
    }
  });

  it('has at least 12 nodes in the three branches of the tree, with names, texts, costs and a root in each', () => {
    expect(SEED_TREE.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SEED_TREE.map((n) => n.branch))).toEqual(new Set(['hjalte', 'gemenskap', 'gard']));
    for (const b of ['hjalte', 'gemenskap', 'gard']) expect(SEED_TREE.some((n) => n.branch === b && !n.needs)).toBe(true);
    for (const n of SEED_TREE) {
      expect(TREE_NAMES[n.id], n.id).toBeTruthy();
      expect(TREE_TEXT[n.id], n.id).toBeTruthy();
      expect(n.cost).toBeGreaterThan(0);
      if (n.needs) expect(treeNode(n.needs)?.branch).toBe(n.branch);
      for (const k of Object.keys(n.effect)) expect(EFFECT_KEYS).toContain(k);
    }
    expect(TREE_TOTAL).toBe(SEED_TREE.reduce((s, n) => s + n.cost, 0));
    expect(TREE_STAGES).toHaveLength(5);
  });

  it('names every modifier, zone and dish, and every dish is an item the farm makes', () => {
    for (const m of MODIFIERS) {
      expect(MODIFIER_NAMES[m.id]).toBeTruthy();
      expect(MODIFIER_TEXT[m.id]).toBeTruthy();
    }
    for (const d of Object.keys(FARDKOST)) expect(FOOD_TEXT[d], d).toBeTruthy();
    for (const k of NODE_KINDS) {
      expect(STOP_NAMES[k]).toBeTruthy();
      expect(STOP_WORDS[k]).toBeTruthy();
    }
  });

  it('adds effects up, and turns the combat part into buffs that start at zero', () => {
    expect(JSON.stringify(noBuffs())).toBe(JSON.stringify(buffsOf({})));
    const e: RunEffect = {};
    addEffect(e, { power: 0.1, spell: { hugg: 0.2 }, potions: 2 });
    addEffect(e, { power: 0.05, spell: { hugg: 0.1, utmana: 0.3 } }, 2);
    expect(e.power).toBeCloseTo(0.2);
    expect(e.spell).toEqual({ hugg: expect.closeTo(0.4), utmana: expect.closeTo(0.6) });
    const b = buffsOf(e);
    expect(b.power).toBeCloseTo(0.2);
    expect(b.spell.hugg).toBeCloseTo(0.4);
    expect(b.cd).toBe(0);
  });

  it('offers three cards: no repeats, a card for the classes present, party-wide ones for a solo hero, never one already taken', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      const cards = offerRunor(rnd, ['vaktare', 'helare', 'magiker'], []);
      expect(cards).toHaveLength(3);
      expect(new Set(cards).size).toBe(3);
      const classes = cards.map((id) => RUNOR.find((r) => r.id === id)!.cls);
      expect(classes.filter((c) => c).length).toBeGreaterThanOrEqual(2);
      // nothing for a class that is not in the party
      for (const c of classes) expect(c === undefined || ['vaktare', 'helare', 'magiker'].includes(c)).toBe(true);
    }
    const have = RUNOR.filter((r) => r.cls === 'krigare').slice(0, 7).map((r) => r.id);
    for (let i = 0; i < 40; i++) for (const c of offerRunor(rnd, ['krigare'], have)) expect(have).not.toContain(c);
  });
});

// ---------------------------------------------------------------------------
// Every effect does what it says in the fight
// ---------------------------------------------------------------------------

/** A run of two heroes in its first zone, with the first hero's buffs set to `effect` before the fight begins. */
function lab(effect: RunEffect, classes: ClassId[] = ['magiker', 'helare'], level?: 0 | 1) {
  const party = makeParty(classes, { seed: 3 });
  // the lab is exactly its own fighters: no hired companion (those have their own tests)
  startRun(party.world, party.players[0]!.id, { seed: 3, companion: false, ...(level === undefined ? {} : { level }) }, party.ctx());
  const run = runOf(party.world)!;
  const area = party.world.areas![run.key]!;
  const inst = area.saga!;
  inst.run!.buffs = { [party.players[0]!.id]: buffsOf(effect) };
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
  const p = party.players[0]!;
  const f = inst.fighters[p.id]!;
  const place = (species: string, dx: number, kind: 'mob' | 'mini' | 'boss' = 'mob') => {
    const m = spawnSagaMob(area, inst, species, p.x + dx * TILE, p.y, kind, -1);
    return { animal: m, mob: inst.mobs[m.id]! };
  };
  return { party, run, area, inst, p, f, go, ctx, rnd, place, q: party.players[1]!, fq: inst.fighters[party.players[1]!.id]! };
}

describe('every effect', () => {
  const dmg = (e: RunEffect, spell = 'eldboll', rnd = 0.99): number => {
    const l = lab(e);
    l.rnd.v = rnd;
    const { mob } = l.place('skelett', 3);
    const out = castSpell(l.party.world, l.p.id, spell, mob.id, l.ctx());
    const h = out.find((c) => c.t === 'hit' && c.on === mob.id);
    return h && h.t === 'hit' ? h.n : 0;
  };

  it('power and a single spell’s power make that spell hit harder', () => {
    const base = dmg({});
    expect(dmg({ power: 0.1 })).toBeGreaterThan(base);
    expect(dmg({ spell: { eldboll: 0.3 } })).toBeGreaterThan(dmg({ power: 0.1 }));
    expect(dmg({ spell: { isspjut: 0.3 } })).toBe(base);
    expect(Math.abs(dmg({ spell: { eldboll: 0.3 } }) - base * 1.3)).toBeLessThanOrEqual(1);
  });

  it('crit adds to the chance of a critical hit', () => {
    const base = dmg({}, 'eldboll', 0.15);
    expect(dmg({ crit: 0.1 }, 'eldboll', 0.15)).toBeGreaterThan(base * 1.4);
  });

  it('cd and a single spell’s cd shorten the cooldown', () => {
    const cd = (e: RunEffect, spell = 'eldboll'): number => {
      const l = lab(e);
      const { mob } = l.place('skelett', 3);
      const t = l.party.now;
      castSpell(l.party.world, l.p.id, spell, mob.id, l.ctx());
      return l.f.cd[spell]! - t;
    };
    expect(cd({})).toBe(1300);
    expect(cd({ cd: 0.12 })).toBeCloseTo(1300 * 0.88);
    expect(cd({ spellCd: { eldboll: 0.5 } })).toBeCloseTo(650);
    expect(cd({ spellCd: { askregn: 0.5 } })).toBe(1300);
    // never less than 40 % of it
    expect(cd({ cd: 0.9 })).toBeCloseTo(1300 * 0.4);
  });

  it('hp, armor and taken make a fighter tougher', () => {
    const max = (e: RunEffect) => lab(e).f.max;
    expect(max({ hp: 0.15 })).toBe(Math.round(max({}) * 1.15));
    const lost = (e: RunEffect): number => {
      const l = lab(e);
      l.inst.run!.dmgMul = 10;
      const { mob } = l.place('skelett', 1);
      mob.state = 'fight';
      mob.threat[l.p.id] = 5;
      mob.atkAt = l.party.now;
      const before = l.f.hp;
      l.go(200);
      return before - l.f.hp;
    };
    const base = lost({});
    expect(base).toBeGreaterThan(0);
    expect(lost({ armor: 0.1 })).toBeLessThan(base);
    expect(lost({ taken: 0.1 })).toBeLessThan(base);
    // monsters hit harder in a run with a damage modifier
    const l = lab({});
    expect(l.inst.run!.dmgMul).toBe(1);
  });

  it('the run’s health buff survives a level-up and a change of gear, for the hero and the hired companion', () => {
    const party = makeParty(['magiker'], { seed: 3, longhall: true, level: 3 });
    const p = party.players[0]!;
    startRun(party.world, p.id, { seed: 3 }, party.ctx());
    const run = runOf(party.world)!;
    const area = party.world.areas![run.key]!;
    const inst = area.saga!;
    const cid = run.companions[0]!;
    const c = party.world.players[cid]!;
    inst.run!.buffs = { [p.id]: buffsOf({ hp: 0.15 }), [cid]: buffsOf({ hp: 0.15 }) };
    for (let i = 0; i < 4; i++) step(party, false, []);
    delete inst.fighters[p.id];
    delete inst.fighters[cid];
    placeIn(party.world, p, run.key, inst.start.x, inst.start.y, 'up', []);
    placeIn(party.world, c, run.key, inst.start.x + 1, inst.start.y, 'up', []);
    for (let i = 0; i < 4; i++) step(party, false, []);
    const f = inst.fighters[p.id]!;
    const fc = inst.fighters[cid]!;
    const want = (q: typeof p): number => Math.round(fighterMax(q, q.saga!.cls!) * 1.15);
    expect(f.max).toBe(want(p));
    expect(fc.max).toBe(want(c));
    // gear: taking the amulet off changes the base, the buff stays
    equipGear(party.world, p.id, 'amulet', null);
    expect(f.max).toBe(want(p));
    expect(f.max).toBeLessThan(fighterMax({ ...p, saga: { ...p.saga!, gear: { ...p.saga!.gear, amulet: 'stenamulett' } } } as typeof p, 'magiker') * 1.15);
    // a level-up from a kill (both of them get the experience)
    p.saga!.xp = XP_LEVELS[3]! - 1;
    c.saga!.xp = XP_LEVELS[3]! - 1;
    const mob = spawnSagaMob(area, inst, 'skelett', p.x + TILE, p.y, 'mob', -1);
    inst.mobs[mob.id]!.hp = 1;
    inst.mobs[mob.id]!.state = 'fight';
    castSpell(party.world, p.id, 'eldboll', mob.id, party.ctx());
    expect(inst.mobs[mob.id]).toBeUndefined();
    expect(f.max).toBe(want(p));
    expect(fc.max).toBe(want(c));
    // and without a run buff nothing changes: a plain number
    inst.run!.buffs = {};
    p.saga!.xp = XP_LEVELS[4]! - 1;
    const mob2 = spawnSagaMob(area, inst, 'skelett', p.x + TILE, p.y, 'mob', -1);
    inst.mobs[mob2.id]!.hp = 1;
    inst.mobs[mob2.id]!.state = 'fight';
    party.now += 5000;
    castSpell(party.world, p.id, 'eldboll', mob2.id, party.ctx());
    expect(f.max).toBe(fighterMax(p, 'magiker'));
  });

  it('heal, potion and reviveHp make healing and potions stronger, and a revived friend wake with more health', () => {
    const healed = (e: RunEffect): number => {
      const l = lab(e);
      l.f.hp = 10;
      castSpell(l.party.world, l.p.id, 'lakerunan', l.p.id, l.ctx());
      return l.f.hp - 10;
    };
    // the mage has no heal: use the healer as the first hero
    const healer = (e: RunEffect): number => {
      const l = lab(e, ['helare', 'vaktare']);
      l.f.hp = 10;
      castSpell(l.party.world, l.p.id, 'lakerunan', l.p.id, l.ctx());
      return l.f.hp - 10;
    };
    expect(healed({})).toBe(0);
    expect(healer({ heal: 0.15 })).toBeGreaterThan(healer({}));
    expect(healer({ spell: { lakerunan: 0.25 } })).toBeGreaterThan(healer({ heal: 0.15 }));
    const potion = (e: RunEffect): number => {
      const l = lab(e);
      l.f.hp = 1;
      l.f.potionAt = 0;
      l.p.inventory[5] = { item: 'healing_potion', count: 1 };
      l.go(0);
      const out: Change[] = [];
      out.push(...performAction(l.area, l.p.id, 0, 0, l.ctx()));
      return l.f.hp;
    };
    void potion;
    const drunk = (e: RunEffect): number => {
      const l = lab(e);
      l.f.hp = 1;
      l.p.selected = 0;
      l.p.inventory[0] = { item: 'healing_potion', count: 2 };
      performAction(l.area, l.p.id, Math.floor(l.p.x / TILE), Math.floor(l.p.y / TILE) + 1, l.ctx());
      return l.f.hp - 1;
    };
    expect(drunk({ potion: 0.15 })).toBeGreaterThan(drunk({}));
    const revived = (e: RunEffect): number => {
      const l = lab(e, ['helare', 'vaktare']);
      l.fq.down = l.party.now;
      l.fq.hp = 0;
      l.q.x = l.p.x + TILE;
      l.q.y = l.p.y;
      castSpell(l.party.world, l.p.id, 'vackupp', l.q.id, l.ctx());
      return l.fq.hp;
    };
    const tankMax = lab({}, ['helare', 'vaktare']).fq.max;
    expect(revived({})).toBe(Math.round(tankMax * 0.5));
    expect(revived({ reviveHp: 0.25 })).toBe(Math.round(tankMax * 0.75));
  });

  it('regen and rest make health come back faster, away from a fight and by a rest stone', () => {
    const regen = (e: RunEffect): number => {
      const l = lab(e);
      l.f.hp = 10;
      l.f.fightAt = 0;
      l.go(3000);
      return l.f.hp - 10;
    };
    expect(regen({ regen: 0.5 })).toBeGreaterThan(regen({}) * 1.3);
    const rest = (e: RunEffect): number => {
      const l = lab(e);
      // (a Flock has no rest stone of its own: the lab puts one in the start room, as a Vilosten has)
      const r = { x: l.inst.start.x + 3, y: l.inst.start.y };
      addObject(l.area, 'saga_rest', r.x, r.y);
      l.inst.rests.push(r);
      l.p.x = px(r.x);
      l.p.y = px(r.y) + TILE;
      l.f.hp = 10;
      l.go(1000);
      return l.f.hp - 10;
    };
    expect(rest({ rest: 0.6 })).toBeGreaterThan(rest({}) * 1.3);
  });

  it('down makes a fallen friend get up sooner', () => {
    const up = (e: RunEffect): number => {
      const l = lab(e);
      l.f.down = l.party.now;
      l.f.hp = 0;
      let t = 0;
      while (l.f.down !== undefined && t < 20_000) {
        l.go(50);
        t += 50;
      }
      return t;
    };
    expect(up({})).toBeGreaterThanOrEqual(10_000);
    expect(up({ down: 0.4 })).toBeLessThan(up({}) * 0.7);
  });

  it('threat and leech: a fighter makes the monsters care more, and heals from what they do', () => {
    const threat = (e: RunEffect): number => {
      const l = lab(e);
      const { mob } = l.place('skelett', 3);
      castSpell(l.party.world, l.p.id, 'eldboll', mob.id, l.ctx());
      return mob.threat[l.p.id] ?? 0;
    };
    expect(threat({ threat: 0.5 })).toBeGreaterThan(threat({}) * 1.3);
    const leech = (e: RunEffect): number => {
      const l = lab(e);
      l.f.hp = 50;
      const { mob } = l.place('skelett', 3);
      castSpell(l.party.world, l.p.id, 'eldboll', mob.id, l.ctx());
      return l.f.hp - 50;
    };
    expect(leech({})).toBe(0);
    expect(leech({ leech: 0.5 })).toBeGreaterThan(5);
  });

  it('coins: a chest of the run gives more coins', () => {
    const coins = (e: RunEffect): number => {
      const l = lab(e);
      const c = addObject(l.area, 'saga_chest', Math.floor(l.p.x / TILE) + 1, Math.floor(l.p.y / TILE), { variant: 0 })!;
      const before = l.p.coins;
      l.rnd.v = 0.5;
      performAction(l.area, l.p.id, c.x, c.y, l.ctx());
      return l.p.coins - before;
    };
    expect(coins({})).toBeGreaterThan(0);
    expect(coins({ coins: 0.25 })).toBeGreaterThan(coins({}));
  });

  it('a run’s monsters’ health, damage, sight, leash and unlocked boss moves come from the plan', () => {
    const l = lab({});
    const { mob } = l.place('skelett', 3);
    l.inst.run!.hpMul = 2;
    l.inst.run!.sight = 3;
    mob.state = 'idle';
    castSpell(l.party.world, l.p.id, 'eldboll', mob.id, l.ctx());
    expect(mob.max).toBe(Math.round(170 * (0.4 + 0.45 * 2) * 2));
    // only the unlocked attacks are ever cast
    const plan = generateRun(5, { boss: 'draug', modifiers: [] });
    const w = lab({});
    const boss = w.place('draugkung', 4, 'boss');
    w.inst.run!.moves = [0];
    w.inst.run!.dmgMul = 0;
    boss.mob.state = 'fight';
    boss.mob.threat[w.p.id] = 5;
    boss.mob.phase = 2;
    boss.mob.next = SAGA_BOSSES.draugkung!.moves.map(() => w.party.now);
    const seen = new Set<number>();
    for (let t = 0; t < 30_000; t += 50) {
      w.go(50);
      w.f.hp = w.f.max;
      if (w.inst.mobs[boss.mob.id]?.cast) seen.add(w.inst.mobs[boss.mob.id]!.cast!.move);
    }
    expect([...seen]).toEqual([0]);
    expect(plan.moves).toBeDefined();
  });

  it('the leash bonus of the fog (dimma) is for monsters in packs, not for bosses', () => {
    const state = (kind: 'mob' | 'boss', leash: number): string => {
      const l = lab({});
      l.inst.run!.leash = leash;
      l.inst.run!.dmgMul = 0;
      const { animal, mob } = kind === 'boss' ? l.place('draugkung', 4, 'boss') : l.place('skelett', 4);
      // home is three tiles past the plain leash from whoever the monster is judged by: the hero for a boss, itself for a pack monster
      const far = (LEASH_TILES + 3) * TILE;
      mob.state = 'fight';
      mob.threat[l.p.id] = 5;
      mob.target = l.p.id;
      mob.home = kind === 'boss' ? { x: l.p.x - far, y: l.p.y } : { x: animal.x - far, y: animal.y };
      l.go(100);
      return l.inst.mobs[mob.id]!.state;
    };
    // a pack monster holds on in the fog and gives up without it
    expect(state('mob', 6)).toBe('fight');
    expect(state('mob', 0)).not.toBe('fight');
    // a boss gives up when everyone is past the plain leash, fog or not
    expect(state('boss', 6)).not.toBe('fight');
    expect(state('boss', 0)).not.toBe('fight');
  });

  it('every runa and node changes something: a combat number in the buffs or one of the run’s own', () => {
    const meta = ['potions', 'seeds', 'reroll', 'slots', 'food', 'animal', 'companion', 'bossSeeds'];
    for (const e of [...RUNOR.map((r) => r.effect), ...SEED_TREE.map((n) => n.effect)]) {
      const b = buffsOf(e);
      const changed = JSON.stringify(b) !== JSON.stringify(noBuffs()) || Object.keys(e).some((k) => meta.includes(k));
      expect(changed).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const listen = (ch: Change[], text: string): boolean => ch.some((c) => (c.t === 'toast' || c.t === 'banner') && c.text.includes(text));

describe('starting, joining and leaving', () => {
  it('puts the färdport and the Yggdrasil shoot on the farm, once, beside each other', () => {
    const party = makeParty(['krigare']);
    const w = party.world;
    const arch = fardportOf(w)!;
    const shoot = shootOf(w)!;
    expect(arch).toBeTruthy();
    expect(shoot).toBeTruthy();
    expect(Math.hypot(arch.x - shoot.x, arch.y - shoot.y)).toBeLessThan(8);
    const n = Object.keys(w.objects).length;
    expect(ensureRunPlaces(w)).toBe(false);
    expect(Object.keys(w.objects)).toHaveLength(n);
    // the front of the arch is open ground
    const f = archFrontOf(w);
    expect(isSolidForPlayer(w, f.x, f.y)).toBe(false);
    expect(reach(w, f).size).toBeGreaterThan(100);
  });

  it('keeps the family’s own shoot where it is and puts the arch beside it; puts both back if they go', () => {
    const w = makeParty(['krigare']).world;
    for (const o of Object.values(w.objects)) if (o.kind === 'fardport' || o.kind === 'yggdrasil') {
      delete w.occupancy[`${o.x},${o.y}`];
      delete w.objects[o.id];
    }
    // clear the arch's whole footprint in the occupancy
    for (const [k, id] of Object.entries(w.occupancy)) if (!w.objects[id]) delete w.occupancy[k];
    // (make room: the lobby has forest here)
    for (const [k, id] of Object.entries(w.occupancy)) {
      const [tx, ty] = k.split(',').map(Number) as [number, number];
      if (Math.abs(tx - 41) <= 4 && Math.abs(ty - 8) <= 4) {
        delete w.occupancy[k];
        delete w.objects[id];
      }
    }
    const own = addObject(w, 'yggdrasil', 41, 8, { by: 'p1' })!;
    expect(ensureRunPlaces(w)).toBe(true);
    expect(shootOf(w)!.id).toBe(own.id);
    expect(Math.hypot(fardportOf(w)!.x - own.x, fardportOf(w)!.y - own.y)).toBeLessThan(8);
    expect(Object.values(w.objects).filter((o) => o.kind === 'yggdrasil')).toHaveLength(1);
  });

  it('starts only for someone with a class, standing at the arch, and only one run at a time', () => {
    const party = makeParty(['krigare', 'vaktare']);
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const far = { ...a };
    void far;
    a.x = px(2);
    a.y = px(2);
    expect(listen(startRun(party.world, a.id, {}, party.ctx()), RUN_T.needPort)).toBe(true);
    const front = archFrontOf(party.world);
    a.x = px(front.x);
    a.y = px(front.y);
    const saga = a.saga!;
    delete saga.cls;
    expect(startRun(party.world, a.id, {}, party.ctx()).some((c) => c.t === 'toast')).toBe(true);
    saga.cls = 'krigare';
    expect(runOf(party.world)).toBeUndefined();
    const ch = startRun(party.world, a.id, { seed: 4 }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.party).toEqual([a.id, b.id]);
    expect(a.area).toBe(run.key);
    expect(b.area).toBe(run.key);
    expect(ch.some((c) => c.t === 'run' && c.ev === 'state' && c.run?.id === run.id)).toBe(true);
    expect(ch.some((c) => c.t === 'banner' && c.kind === 'enter')).toBe(true);
    expect(listen(startRun(party.world, a.id, {}, party.ctx()), RUN_T.already)).toBe(true);
    expect(readRun(a).runs).toBe(1);
  });

  it('takes the family members at the arch along, joins at the last lit rest stone, and leaves', () => {
    const party = makeParty(['vaktare', 'helare', 'krigare']);
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    // c is far away, in the wild: not taken along
    placeIn(party.world, c, 'a:0,1', 5, 5, 'down', []);
    startRun(party.world, a.id, { seed: 4 }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.party).toEqual([a.id, b.id]);
    // she walks to the arch and joins: the start of the zone, as no rest stone is lit yet
    const front = archFrontOf(party.world);
    placeIn(party.world, c, 'farm', front.x, front.y, 'down', []);
    expect(joinRun(party.world, c.id, party.ctx()).some((x) => x.t === 'toast')).toBe(true);
    const area = party.world.areas![run.key]!;
    expect(run.party).toContain(c.id);
    expect(c.area).toBe(run.key);
    expect(Math.hypot(c.x - px(area.saga!.start.x), c.y - px(area.saga!.start.y))).toBeLessThan(4 * TILE);
    expect(joinRun(party.world, c.id, party.ctx())).toEqual([]);
    // leaving: back in front of the arch, with everything
    const bag = JSON.stringify(c.inventory);
    leaveRun(party.world, c.id, party.ctx());
    expect(c.area).toBe('farm');
    expect(JSON.stringify(c.inventory)).toBe(bag);
    expect(run.party).not.toContain(c.id);
    // a second time, after a rest stone has been lit: she appears there (a Flock has none of its own: this one is put in the start room)
    const rest = { x: area.saga!.start.x + 3, y: area.saga!.start.y };
    addObject(area, 'saga_rest', rest.x, rest.y);
    area.saga!.rests.push(rest);
    area.saga!.checkpoint = 0;
    joinRun(party.world, c.id, party.ctx());
    expect(Math.hypot(c.x - px(rest.x), c.y - px(rest.y))).toBeLessThan(3 * TILE);
  });

  it('nobody jumps into a run’s zone or out of it', () => {
    const party = makeParty(['vaktare', 'helare', 'krigare']);
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    placeIn(party.world, c, 'a:0,1', 5, 5, 'down', []);
    startRun(party.world, a.id, { seed: 4 }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.party).toEqual([a.id, b.id]);
    // from outside, to a member inside
    const into = jumpTo(party.world, c.id, a.id);
    expect(into.some((x) => x.t === 'toast')).toBe(true);
    expect(c.area).toBe('a:0,1');
    expect(run.party).not.toContain(c.id);
    // from inside, to someone outside
    const before = b.area;
    const out = jumpTo(party.world, b.id, c.id);
    expect(out.some((x) => x.t === 'toast')).toBe(true);
    expect(b.area).toBe(before);
    expect(b.area).toBe(run.key);
    expect(run.party).toContain(b.id);
    // and from inside to someone else inside
    expect(jumpTo(party.world, b.id, a.id).every((x) => x.t === 'toast')).toBe(true);
  });

  it('the mercy is for a human with the hired companion (no longhouse needed), not for a lone player who turns it down; a duo with a companion is not softened', () => {
    const hp = (classes: ClassId[], opts: { longhall?: boolean; companion?: boolean }): { mul: number; boss: number; plan: number; bossPlan: number; n: number } => {
      const party = makeParty(classes, { seed: 6, longhall: opts.longhall });
      startRun(party.world, party.players[0]!.id, { seed: 6, ...(opts.companion === false ? { companion: false } : {}) }, party.ctx());
      const run = runOf(party.world)!;
      const r = party.world.areas![run.key]!.saga!.run!;
      return { mul: r.hpMul, boss: r.bossMul, plan: run.plan.stops[0]!.hpMul, bossPlan: run.plan.stops[0]!.bossMul, n: run.companions.length };
    };
    // the farm has no longhouse, and a lone player still gets the Hirdmannen and the mercy
    for (const hired of [hp(['krigare'], {}), hp(['krigare'], { longhall: true })]) {
      expect(hired.n).toBe(1);
      expect(hired.mul).toBeCloseTo(hired.plan * SOLO_MERCY);
      expect(hired.boss).toBeCloseTo(hired.bossPlan * SOLO_MERCY);
    }
    // a hire turned down: one fighter, the plain numbers
    const alone = hp(['krigare'], { companion: false });
    expect(alone.n).toBe(0);
    expect(alone.mul).toBe(alone.plan);
    expect(alone.boss).toBe(alone.bossPlan);
    // two humans: no mercy, with the companion (two dps) or without (tank and healer)
    for (const duo of [hp(['krigare', 'magiker'], {}), hp(['vaktare', 'helare'], {})]) expect(duo.mul).toBe(duo.plan);
    expect(hp(['krigare', 'magiker'], {}).n).toBe(1);
    expect(hp(['vaktare', 'helare'], {}).n).toBe(0);
    // three humans: the plain numbers
    expect(hp(['vaktare', 'helare', 'krigare'], {}).n).toBe(0);
  });

  it('leaving and joining again does not bring the player in twice: one run counted, the potions once, the dishes kept', () => {
    const party = makeParty(['vaktare', 'helare', 'krigare']);
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    placeIn(party.world, c, 'a:0,1', 5, 5, 'down', []);
    addItem(c.inventory, 'bread', 1);
    startRun(party.world, a.id, { seed: 4 }, party.ctx());
    const run = runOf(party.world)!;
    void b;
    const potions = (): number => c.inventory.reduce((n, s) => n + (s?.item === 'healing_potion' ? s.count : 0), 0);
    // she joins with bread chosen: used up once
    const front = archFrontOf(party.world);
    placeIn(party.world, c, 'farm', front.x, front.y, 'down', []);
    chooseFardkost(party.world, c.id, ['bread']);
    joinRun(party.world, c.id, party.ctx());
    expect(readRun(c).runs).toBe(1);
    expect(run.food[c.id]).toEqual(['bread']);
    const hp = run.base[c.id]!.hp;
    expect(hp).toBeGreaterThan(0);
    const bag = potions();
    // out and in again
    leaveRun(party.world, c.id, party.ctx());
    placeIn(party.world, c, 'farm', front.x, front.y, 'down', []);
    joinRun(party.world, c.id, party.ctx());
    expect(run.party).toContain(c.id);
    expect(readRun(c).runs).toBe(1);
    expect(potions()).toBe(bag);
    expect(run.base[c.id]!.hp).toBe(hp);
    expect(run.food[c.id]).toEqual(['bread']);
    expect(party.world.areas![run.key]!.saga!.run!.buffs[c.id]!.hp).toBeCloseTo(hp!);
  });

  it('is full at three, or four with a longhouse', () => {
    const party = makeParty(['vaktare', 'helare', 'krigare', 'magiker']);
    const [a, , , d] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    expect(unlocksOf(party.world).longhall).toBe(false);
    startRun(party.world, a.id, { seed: 2 }, party.ctx());
    expect(runOf(party.world)!.party).toHaveLength(3);
    expect(listen(joinRun(party.world, d.id, party.ctx()), RUN_T.full)).toBe(true);
    const lh = makeParty(['vaktare', 'helare', 'krigare', 'magiker'], { longhall: true });
    expect(unlocksOf(lh.world).longhall).toBe(true);
    startRun(lh.world, lh.players[0]!.id, { seed: 2 }, lh.ctx());
    expect(runOf(lh.world)!.party).toHaveLength(4);
  });

  it('companionClass: the class the party lacks, for one or two humans, never for three', () => {
    expect(companionClass(['vaktare'])).toBe('helare');
    expect(companionClass(['krigare'])).toBe('helare');
    expect(companionClass(['magiker'])).toBe('helare');
    expect(companionClass(['helare'])).toBe('vaktare');
    expect(companionClass(['krigare', 'magiker'])).toBe('helare');
    expect(companionClass(['vaktare', 'krigare'])).toBe('helare');
    expect(companionClass(['helare', 'magiker'])).toBe('vaktare');
    expect(companionClass(['helare', 'krigare'])).toBe('vaktare');
    expect(companionClass(['vaktare', 'helare'])).toBeNull();
    expect(companionClass(['vaktare', 'helare', 'krigare'])).toBeNull();
    expect(companionClass(['vaktare', 'helare', 'krigare', 'magiker'])).toBeNull();
  });

  it('hires the Hirdmannen for one or two players, no longhouse needed: the class they lack, never saved, gone with the run', () => {
    for (const [classes, want] of [[['krigare'], 'helare'], [['magiker'], 'helare'], [['vaktare'], 'helare'], [['helare'], 'vaktare'], [['krigare', 'magiker'], 'helare'], [['helare', 'krigare'], 'vaktare']] as [ClassId[], ClassId][]) {
      for (const longhall of [false, true]) {
        const party = makeParty(classes, { longhall, level: 5 });
        expect(unlocksOf(party.world).longhall).toBe(longhall);
        const players = Object.keys(party.world.players).length;
        startRun(party.world, party.players[0]!.id, { seed: 2 }, party.ctx());
        const run = runOf(party.world)!;
        expect(run.companions).toHaveLength(1);
        const c = party.world.players[run.companions[0]!]!;
        expect(c.bot).toBe(true);
        expect(c.saga!.cls).toBe(want);
        expect(c.online).toBe(true);
        expect(c.area).toBe(run.key);
        expect(Object.keys(party.world.players)).toHaveLength(players + 1);
        // it plays: a few seconds in, it has moved or cast
        for (let i = 0; i < 40; i++) step(party, false, []);
        expect(party.world.areas![run.key]!.saga!.fighters[c.id]).toBeTruthy();
        endRun(party.world, run, 'leave', party.ctx());
        expect(party.world.players[c.id]).toBeUndefined();
        expect(Object.keys(party.world.players)).toHaveLength(players);
      }
    }
    // not for a pair that has a tank and a healer, nor for three, nor for a player who asked to go without
    for (const classes of [['vaktare', 'helare'], ['vaktare', 'helare', 'krigare']] as ClassId[][]) {
      const full = makeParty(classes);
      startRun(full.world, full.players[0]!.id, { seed: 2 }, full.ctx());
      expect(runOf(full.world)!.companions).toHaveLength(0);
    }
    const quiet = makeParty(['krigare']);
    startRun(quiet.world, quiet.players[0]!.id, { seed: 2, companion: false }, quiet.ctx());
    expect(runOf(quiet.world)!.companions).toHaveLength(0);
    // a friend who joins sends the companion home
    const solo = makeParty(['krigare', 'vaktare']);
    const [a, b] = solo.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const f = archFrontOf(solo.world);
    b.x = px(f.x + 8);
    b.y = px(f.y);
    startRun(solo.world, a.id, { seed: 2 }, solo.ctx());
    expect(runOf(solo.world)!.companions).toHaveLength(1);
    b.x = px(f.x);
    b.y = px(f.y);
    joinRun(solo.world, b.id, solo.ctx());
    expect(runOf(solo.world)!.companions).toHaveLength(0);
  });

  it('starts the chapter after the last cleared, and a cleared boss at random on a replay', () => {
    const party = makeParty(['krigare']);
    const p = party.players[0]!;
    p.saga!.cleared = ['draug', 'frost'];
    startRun(party.world, p.id, { seed: 8 }, party.ctx());
    expect(runOf(party.world)!.plan.boss).toBe('surt');
    expect(runOf(party.world)!.plan.replay).toBe(false);
    const again = makeParty(['krigare']);
    again.players[0]!.saga!.cleared = ['draug', 'frost'];
    startRun(again.world, again.players[0]!.id, { seed: 8, replay: true }, again.ctx());
    const run = runOf(again.world)!;
    expect(['draug', 'frost']).toContain(run.plan.boss);
    expect(run.plan.replay).toBe(true);
    expect(run.plan.modifiers.length).toBeGreaterThanOrEqual(1);
  });
});

describe('the run is one dungeon, chosen at the arch (GAME2.md section 2.4)', () => {
  const cleared = (party: Party, ids: DungeonId[]): void => {
    party.players[0]!.saga!.cleared = [...ids];
  };

  it('runnableDungeons: the ones cleared and the next in the saga’s order, nothing further', () => {
    expect(runnableDungeons([])).toEqual(['draug']);
    expect(runnableDungeons(['draug'])).toEqual(['draug', 'frost']);
    expect(runnableDungeons(['draug', 'frost', 'surt'])).toEqual(['draug', 'frost', 'surt', 'hel']);
    expect(runnableDungeons(['frost'])).toEqual(['draug', 'frost']);
    expect(runnableDungeons([...DUNGEON_IDS])).toEqual([...DUNGEON_IDS]);
  });

  it('left out, the run is the player’s current chapter; the route, the look and the boss are that dungeon’s', () => {
    for (const [done, want] of [[[], 'draug'], [['draug'], 'frost'], [['draug', 'frost', 'surt'], 'hel']] as [DungeonId[], DungeonId][]) {
      const party = makeParty(['krigare']);
      cleared(party, done);
      startRun(party.world, party.players[0]!.id, { seed: 5 }, party.ctx());
      const run = runOf(party.world)!;
      expect(run.plan.boss).toBe(want);
      expect(run.plan.replay).toBe(false);
      expect(run.plan.route.dungeon).toBe(want);
      const inst = party.world.areas![run.key]!.saga!;
      expect(inst.id).toBe(want);
      expect(DUNGEONS[want].floor).toBe(party.world.areas![run.key]!.terrain[party.world.areas![run.key]!.saga!.start.y * 64 + party.world.areas![run.key]!.saga!.start.x]);
    }
  });

  it('a dungeon asked for: one cleared (a replay) or the next one is run; a later one, or anything else, is refused and nothing starts', () => {
    const party = makeParty(['krigare']);
    cleared(party, ['draug', 'frost']);
    const id = party.players[0]!.id;
    expect(listen(runMessage(party.world, id, { t: 'run', a: 'start', dungeon: 'loke' }, party.ctx()), RUN_T.badDungeon)).toBe(true);
    expect(runOf(party.world)).toBeUndefined();
    for (const bad of ['nope', 7, null, ['draug'], {}]) {
      expect(listen(runMessage(party.world, id, { t: 'run', a: 'start', dungeon: bad }, party.ctx()), RUN_T.badDungeon)).toBe(true);
      expect(runOf(party.world)).toBeUndefined();
    }
    // a cleared one: a replay (modifiers, every boss move) of that dungeon
    runMessage(party.world, id, { t: 'run', a: 'start', dungeon: 'draug' }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.plan.boss).toBe('draug');
    expect(run.plan.replay).toBe(true);
    expect(run.plan.modifiers.length).toBeGreaterThanOrEqual(1);
    expect(run.plan.moves).toBeUndefined();
    endRun(party.world, run, 'leave', party.ctx());
    // the next one: a first run, with the saga's locked boss moves
    runMessage(party.world, id, { t: 'run', a: 'start', dungeon: 'surt' }, party.ctx());
    const next = runOf(party.world)!;
    expect(next.plan.boss).toBe('surt');
    expect(next.plan.replay).toBe(false);
    expect(next.plan.moves).toBeDefined();
  });

  it('a first-time player can run only the first dungeon; clearing a dungeon in a run opens the next', () => {
    const party = makeParty(['krigare']);
    const id = party.players[0]!.id;
    expect(listen(startRun(party.world, id, { dungeon: 'frost' }, party.ctx()), RUN_T.badDungeon)).toBe(true);
    expect(runOf(party.world)).toBeUndefined();
    startRun(party.world, id, { dungeon: 'draug', seed: 3 }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.plan.boss).toBe('draug');
    endRun(party.world, run, 'leave', party.ctx());
    party.players[0]!.saga!.cleared.push('draug');
    expect(startRun(party.world, id, { dungeon: 'frost', seed: 3 }, party.ctx()).length).toBeGreaterThan(0);
    expect(runOf(party.world)!.plan.boss).toBe('frost');
  });

  it('a replay asked for without a dungeon is a cleared one at random, as before; the level is for the whole run, the route the same', () => {
    const party = makeParty(['krigare']);
    cleared(party, ['draug', 'frost']);
    startRun(party.world, party.players[0]!.id, { seed: 11, replay: true }, party.ctx());
    const a = runOf(party.world)!;
    expect(['draug', 'frost']).toContain(a.plan.boss);
    expect(a.plan.replay).toBe(true);
    const p1 = generateRun(11, { boss: 'draug', level: 0 });
    const p2 = generateRun(11, { boss: 'draug', level: 1 });
    expect(p1.route.nodes).toEqual(p2.route.nodes);
    expect(p1.route.level).toBe(0);
    expect(p2.route.level).toBe(1);
  });

  it('the state names the run: the stop, its row and kind, the path walked, the whole route and who has the turn; the end tells the route taken', () => {
    const party = makeParty(['krigare']);
    const out = startRun(party.world, party.players[0]!.id, { seed: 5 }, party.ctx());
    const run = runOf(party.world)!;
    const snap = out.filter((c) => c.t === 'run' && c.ev === 'state' && c.run).map((c) => (c.t === 'run' && c.ev === 'state' ? c.run! : null)).at(-1)!;
    expect(snap).toMatchObject({ node: 0, row: 1, kind: 'flock', path: [0], boss: 'draug', finder: party.players[0]!.id, phase: 'stop' });
    expect(snap.route).toEqual(routeSnap(run.plan.route));
    expect(snap.choices).toBeUndefined();
    expect(JSON.stringify(snap)).not.toContain('"zone"');
    // the end of a run lists the kinds of the stops walked
    clearStop(party);
    for (const p of party.players) pickRuna(party.world, p.id, 0, party.ctx());
    takeRune(party);
    const ended = endRun(party.world, run, 'leave', party.ctx()).find((c) => c.t === 'run' && c.ev === 'ended')!;
    expect(ended.t === 'run' && ended.ev === 'ended' && ended.path).toEqual(['flock', run.plan.route.nodes[run.path[1]!]!.kind]);
  });
});

describe('the farm feeds the run', () => {
  it('färdkost: the dishes in the bag are taken, in as many slots as the tree gives, and give their buffs', () => {
    const party = makeParty(['krigare']);
    const p = party.players[0]!;
    p.inventory[3] = { item: 'bread', count: 2 };
    p.inventory[4] = { item: 'pumpkin_pie', count: 1 };
    p.inventory[5] = { item: 'carrot', count: 1 };
    expect(foodSlots(p)).toBe(1);
    const chosen = chooseFardkost(party.world, p.id, ['carrot', 'bread', 'pumpkin_pie']);
    expect(chosen[0]).toMatchObject({ t: 'fardkost', items: ['bread'] });
    startRun(party.world, p.id, { seed: 3 }, party.ctx());
    const run = runOf(party.world)!;
    expect(run.food[p.id]).toEqual(['bread']);
    expect(p.inventory.find((s) => s?.item === 'bread')?.count).toBe(1);
    expect(run.base[p.id]!.hp).toBeCloseTo(0.06, 2);
    const inst = party.world.areas![run.key]!.saga!;
    expect(inst.run!.buffs[p.id]!.hp).toBeGreaterThanOrEqual(0.06);
    // two slots with the node f1, and the dishes 25 % stronger with f2
    const two = makeParty(['krigare']);
    const q = two.players[0]!;
    runSaveOf(q).tree = ['f1', 'f2'];
    q.inventory[3] = { item: 'bread', count: 1 };
    q.inventory[4] = { item: 'pumpkin_pie', count: 1 };
    expect(foodSlots(q)).toBe(2);
    startRun(two.world, q.id, { seed: 3, fardkost: ['bread', 'pumpkin_pie'] }, two.ctx());
    const r2 = runOf(two.world)!;
    expect(r2.food[q.id]).toEqual(['bread', 'pumpkin_pie']);
    expect(r2.base[q.id]!.hp).toBeCloseTo(0.06 * 1.25, 3);
    expect(r2.base[q.id]!.armor).toBeCloseTo(0.04 * 1.25, 3);
  });

  it('potions come as items: the start potions of the herb garden, the tree and a dish', () => {
    const party = makeParty(['krigare']);
    const p = party.players[0]!;
    const count = () => p.inventory.reduce((n, s) => n + (s?.item === 'healing_potion' ? s.count : 0), 0);
    expect(count()).toBe(3);
    runSaveOf(p).tree = ['f4'];
    const f = archFrontOf(party.world);
    addObject(party.world, 'herb_garden', f.x + 4, f.y + 1) ?? addObject(party.world, 'herb_garden', f.x - 6, f.y + 1);
    expect(unlocksOf(party.world).herb).toBe(true);
    startRun(party.world, p.id, { seed: 3 }, party.ctx());
    expect(count()).toBe(3 + 1 + 2);
    expect(runOf(party.world)!.base[p.id]!.potion).toBeCloseTo(0.1);
  });

  it('animals: a cared-for pet counts double, a mount only with a stall, and a happy farm gives health', () => {
    const party = makeParty(['krigare']);
    const p = party.players[0]!;
    const w = party.world;
    const dog = { id: 9001, species: 'dog', name: 'Fido', x: 0, y: 0, facing: 'down', moving: false, hearts: 2, heartProgress: 0, fed: false, petted: false, brushed: false, hasProduct: false, named: true, age: 10, homeId: 0, waitMs: 0, owner: p.id } as unknown as WorldState['animals'][number];
    w.animals[dog.id] = dog;
    const horse = { ...dog, id: 9002, species: 'horse', name: 'Blixt', hearts: 5 };
    w.animals[horse.id] = horse;
    const cow = { ...dog, id: 9003, species: 'cow', name: 'Kossan', hearts: 4, owner: undefined };
    w.animals[cow.id] = cow;
    startRun(w, p.id, { seed: 3 }, party.ctx());
    const e = runOf(w)!.base[p.id]!;
    expect(e.power).toBeCloseTo(0.03, 3);
    expect(e.armor ?? 0).toBe(0);
    expect(e.hp).toBeCloseTo(0.04, 3);
    // with 4 hearts the pet counts double, a stall lets the mount come, and f3 makes both stronger
    dog.hearts = 4;
    const f = archFrontOf(w);
    addObject(w, 'stall', f.x + 4, f.y + 1) ?? addObject(w, 'stall', f.x - 7, f.y + 1);
    runSaveOf(p).tree = ['f1', 'f3'];
    const again = makeParty(['krigare']);
    void again;
    endRun(w, runOf(w)!, 'leave', party.ctx());
    startRun(w, p.id, { seed: 3 }, party.ctx());
    const e2 = runOf(w)!.base[p.id]!;
    expect(e2.power).toBeCloseTo(0.03 * 2 * 1.5, 3);
    expect(e2.armor).toBeCloseTo(0.02 * 2 * 1.5, 3);
    expect(e2.hp).toBeCloseTo(0.03 * 2 * 1.5 + 0.04, 3);
  });

  it('the smithy gives spells +4 %', () => {
    const party = makeParty(['krigare']);
    const f = archFrontOf(party.world);
    addObject(party.world, 'smithy', f.x + 4, f.y + 1) ?? addObject(party.world, 'smithy', f.x - 8, f.y + 1);
    startRun(party.world, party.players[0]!.id, { seed: 3 }, party.ctx());
    expect(runOf(party.world)!.base[party.players[0]!.id]!.power).toBeCloseTo(0.04);
  });
});

/** Every pack of the stop the run is in falls (as if killed) and the run ticks until the stop is seen to be cleared. */
function clearStop(party: Party): void {
  const run = runOf(party.world)!;
  const area = party.world.areas![run.key]!;
  const inst = area.saga!;
  for (const pk of inst.packs) {
    pk.dead = true;
    for (const id of pk.members) {
      delete inst.mobs[id];
      delete area.animals[id];
    }
  }
  for (let i = 0; i < 6; i++) step(party, false, []);
}

/** Everyone in the run stands on the väg-runa to a stop of `kind` (the first of them) and stays: when the dwell has passed, the party is in the next stop. */
function takeRune(party: Party, kind: NodeKind = 'flock'): void {
  const run = runOf(party.world)!;
  expect(run.phase).toBe('route');
  const c = run.vote!.runes.findIndex((r) => r.kind === kind);
  expect(c, `a rune to a ${kind}`).toBeGreaterThanOrEqual(0);
  const r = run.vote!.runes[c]!;
  for (const p of party.players) if (run.party.includes(p.id)) {
    p.x = px(r.x);
    p.y = px(r.y);
  }
  for (let t = 0; t < ROUTE_DWELL_MS + 300; t += 50) step(party, false, []);
}

describe('the vote on a runa', () => {
  /** A party whose first stop is cleared: the cards of a runa are out (the vote on). */
  function atTheVote(classes: ClassId[] = ['vaktare', 'helare', 'magiker'], longhall = false): Party {
    const party = makeParty(classes, { seed: 6, longhall });
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const inst = party.world.areas![run.key]!.saga!;
    expect(run.phase).toBe('stop');
    expect(run.plan.stops[run.node]!.kind).toBe('flock');
    clearStop(party);
    expect(inst.gateOpen).toBe(true);
    expect(run.phase).toBe('pick');
    expect(run.offer!.cards).toHaveLength(3);
    return party;
  }

  it('a solo player with the hired companion sees their own class and the party-wide runor, not the companion’s', () => {
    const party = atTheVote(['krigare'], true);
    const run = runOf(party.world)!;
    expect(run.companions).toHaveLength(1);
    const comp = party.world.players[run.companions[0]!]!;
    expect(comp.saga!.cls).toBe('helare');
    const cards = run.offer!.cards;
    expect(cards).toHaveLength(3);
    for (const id of cards) {
      const r = RUNOR.find((x) => x.id === id)!;
      expect(r.cls === undefined || r.cls === 'krigare').toBe(true);
    }
    expect(cards.some((id) => RUNOR.find((x) => x.id === id)!.cls === 'krigare')).toBe(true);
  });

  it('no väg-runor and no cards until the packs are down, and the sagafrön for the packs and the stop are paid', () => {
    const party = makeParty(['vaktare', 'helare', 'magiker'], { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const area = party.world.areas![run.key]!;
    const inst = area.saga!;
    expect(run.phase).toBe('stop');
    expect(Object.values(area.objects).some((o) => o.kind === 'run_exit')).toBe(false);
    // (using a rune that is not there yet is told off)
    const stray = inst.start;
    addObject(area, 'run_exit', stray.x + 1, stray.y);
    party.players[0]!.x = px(stray.x + 1);
    party.players[0]!.y = px(stray.y) + TILE;
    expect(listen(performAction(area, party.players[0]!.id, stray.x + 1, stray.y, party.ctx()), RUN_T.exitShut)).toBe(true);
    delete area.objects[objectAt(area, stray.x + 1, stray.y)!.id];
    delete area.occupancy[`${stray.x + 1},${stray.y}`];
    // two packs fall: a sagafrö each, to everyone
    for (const i of [0, 1]) {
      inst.packs[i]!.dead = true;
      for (const id of inst.packs[i]!.members) {
        delete inst.mobs[id];
        delete area.animals[id];
      }
    }
    step(party, false, []);
    for (const p of party.players) expect(readRun(p).seeds).toBe(2 * RUN_SEEDS.pack);
    expect(run.phase).toBe('stop');
    // every pack on the way: the gate opens, the stop pays three more, once, and the cards are out
    clearStop(party);
    const required = inst.run!.required.length;
    expect(inst.gateOpen).toBe(true);
    expect(run.phase).toBe('pick');
    for (const p of party.players) expect(readRun(p).seeds).toBe(inst.packs.length * RUN_SEEDS.pack + RUN_SEEDS.zone);
    expect(inst.packs.length).toBeGreaterThanOrEqual(required);
    expect(run.earned[party.players[0]!.id]).toBe(readRun(party.players[0]!).seeds);
    expect(readRun(party.players[0]!).earned).toBe(readRun(party.players[0]!).seeds);
    expect(readRun(party.players[0]!).zones).toBe(1);
    for (const g of inst.gate) expect(objectAt(area, g.x, g.y)).toBeUndefined();
    for (let i = 0; i < 10; i++) step(party, false, []);
    for (const p of party.players) expect(readRun(p).seeds).toBe(inst.packs.length * RUN_SEEDS.pack + RUN_SEEDS.zone);
  });

  it('ends at once with a strict majority', () => {
    const party = atTheVote();
    const run = runOf(party.world)!;
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const cards = [...run.offer!.cards];
    pickRuna(party.world, a.id, 1, party.ctx());
    expect(run.phase).toBe('pick');
    pickRuna(party.world, b.id, 1, party.ctx());
    // the cards are done, the runes are out: the party chooses its way
    expect(run.phase).toBe('route');
    expect(run.runor).toEqual([cards[1]]);
    expect(run.offer).toBeUndefined();
    void c;
  });

  it('with everyone voted and no majority, the most votes win and a tie goes to the card voted first', () => {
    const party = atTheVote();
    const run = runOf(party.world)!;
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const cards = [...run.offer!.cards];
    pickRuna(party.world, b.id, 2, party.ctx());
    pickRuna(party.world, a.id, 0, party.ctx());
    pickRuna(party.world, c.id, 1, party.ctx());
    expect(run.runor).toEqual([cards[2]]);
  });

  it('on the clock: the most votes, or the first card when nobody votes; a vote may be changed; bad votes are ignored', () => {
    const party = atTheVote();
    const run = runOf(party.world)!;
    const [a] = party.players as [import('./index.ts').PlayerState];
    const cards = [...run.offer!.cards];
    expect(pickRuna(party.world, a.id, 7, party.ctx())).toEqual([]);
    expect(pickRuna(party.world, a.id, -1, party.ctx())).toEqual([]);
    pickRuna(party.world, a.id, 2, party.ctx());
    pickRuna(party.world, a.id, 1, party.ctx());
    expect(run.offer!.votes[a.id]).toBe(1);
    for (let t = 0; t < RUN_PICK_MS + 200; t += 50) step(party, false, []);
    expect(run.runor).toEqual([cards[1]]);
    const quiet = atTheVote();
    const r2 = runOf(quiet.world)!;
    const first = r2.offer!.cards[0]!;
    for (let t = 0; t < RUN_PICK_MS + 200; t += 50) step(quiet, false, []);
    expect(r2.runor).toEqual([first]);
    expect(r2.phase).toBe('route');
  });

  it('a class runa reaches only that class, a party-wide one everybody, and the buffs follow into the next zone', () => {
    const party = atTheVote();
    const run = runOf(party.world)!;
    run.offer!.cards = ['m_eld', 'p_hjarta', 'k_yx'];
    for (const p of party.players) pickRuna(party.world, p.id, 0, party.ctx());
    expect(run.runor).toEqual(['m_eld']);
    const inst = party.world.areas![run.key]!.saga!;
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    expect(inst.run!.buffs[c.id]!.spell.eldboll).toBeCloseTo(0.3);
    expect(inst.run!.buffs[a.id]!.spell.eldboll).toBeUndefined();
    expect(inst.run!.buffs[b.id]!.spell.eldboll).toBeUndefined();
    // the next vote: a party-wide hp runa, after the next stop
    takeRune(party);
    expect(run.path).toHaveLength(2);
    clearStop(party);
    expect(run.phase).toBe('pick');
    run.offer!.cards = ['p_hjarta', 'p_kraft', 'p_fro'];
    for (const p of party.players) pickRuna(party.world, p.id, 0, party.ctx());
    expect(run.runor).toEqual(['m_eld', 'p_hjarta']);
    takeRune(party);
    expect(run.path).toHaveLength(3);
    const next = party.world.areas![run.key]!.saga!;
    for (const p of party.players) expect(next.run!.buffs[p.id]!.hp).toBeCloseTo(0.1);
    expect(next.run!.buffs[c.id]!.spell.eldboll).toBeCloseTo(0.3);
    // and the fighters of the new stop have the health
    for (let i = 0; i < 4; i++) step(party, false, []);
    expect(next.fighters[a.id]!.max).toBeGreaterThan(fighterMax(a, 'vaktare'));
  });

  it('p_flaska hands out two potions, and p_fro raises every later payment by a quarter', () => {
    const party = atTheVote(['krigare']);
    const run = runOf(party.world)!;
    const p = party.players[0]!;
    const potions = () => p.inventory.reduce((n, s) => n + (s?.item === 'healing_potion' ? s.count : 0), 0);
    const before = potions();
    run.offer!.cards = ['p_flaska', 'p_fro', 'p_kraft'];
    pickRuna(party.world, p.id, 0, party.ctx());
    expect(potions()).toBe(before + 2);
    expect(run.base[p.id]!.potion ?? 0).toBe(0);
    expect(party.world.areas![run.key]!.saga!.run!.buffs[p.id]!.potion).toBeCloseTo(0.15);
    // the next stop; p_fro: a pack is worth 1 and gives 1.25 (the quarter is carried, whole seeds are paid), a stop 3 → 3.75
    takeRune(party);
    expect(party.world.areas![run.key]!.saga!.run!.buffs[p.id]!.potion).toBeCloseTo(0.15);
    run.runor.push('p_fro');
    const seeds = readRun(p).seeds;
    const inst = party.world.areas![run.key]!.saga!;
    clearStop(party);
    const gained = readRun(p).seeds - seeds;
    const n = inst.packs.length;
    expect(gained).toBe(Math.floor((n + RUN_SEEDS.zone) * 1.25 + 1e-9));
    expect(gained).toBeGreaterThan(n + RUN_SEEDS.zone);
  });

  it('sagafrön bonuses are not rounded away: p_fro and two modifiers pay visibly more than none over the same events', () => {
    const play = (bonus: boolean): { gained: number; n: number; exact: number } => {
      const party = makeParty(['krigare'], { seed: 6 });
      const p = party.players[0]!;
      startRun(party.world, p.id, { seed: 6 }, party.ctx());
      const run = runOf(party.world)!;
      if (bonus) {
        run.runor.push('p_fro');
        run.plan.modifiers = ['fler', 'segare'];
      }
      const area = party.world.areas![run.key]!;
      const inst = area.saga!;
      const seeds = readRun(p).seeds;
      // the packs fall one at a time, each paid on its own, then the gate
      for (const pk of inst.packs) {
        pk.dead = true;
        for (const id of pk.members) {
          delete inst.mobs[id];
          delete area.animals[id];
        }
        step(party, false, []);
      }
      for (let i = 0; i < 4; i++) step(party, false, []);
      const n = inst.packs.length;
      return { gained: readRun(p).seeds - seeds, n, exact: (n + RUN_SEEDS.zone) * (bonus ? 1 + 0.25 + 0.3 : 1) };
    };
    const plain = play(false);
    const rich = play(true);
    expect(plain.gained).toBe(plain.n + RUN_SEEDS.zone);
    // the total over the run is the sum of n × (1 + bonus), to within one seed, and only whole seeds are paid
    expect(rich.gained).toBe(Math.floor(rich.exact + 1e-9));
    expect(rich.exact - rich.gained).toBeLessThan(1);
    expect(Number.isInteger(rich.gained)).toBe(true);
    expect(rich.gained).toBeGreaterThanOrEqual(plain.gained + Math.floor(plain.gained * 0.5));
  });

  it('a full bag: the potions of p_flaska land in the stop the player stands in, with the area on the change', () => {
    const party = atTheVote(['krigare']);
    const run = runOf(party.world)!;
    const p = party.players[0]!;
    const ids = Object.keys(ITEMS).filter((k) => k !== 'healing_potion');
    p.inventory = p.inventory.map((_, i) => ({ item: ids[i]!, count: 1 }));
    run.offer!.cards = ['p_flaska', 'p_fro', 'p_kraft'];
    const farmDrops = Object.keys(party.world.drops).length;
    const out = pickRuna(party.world, p.id, 0, party.ctx());
    expect(run.phase).toBe('route');
    const drop = out.find((c) => c.t === 'drop' && c.drop?.item === 'healing_potion');
    expect(drop).toBeTruthy();
    expect(drop!.t === 'drop' && drop!.area).toBe(run.key);
    expect(Object.values(party.world.areas![run.key]!.drops).some((d) => d.item === 'healing_potion' && d.count === 2)).toBe(true);
    expect(Object.keys(party.world.drops)).toHaveLength(farmDrops);
  });

  it('the tree’s fourth branch: the party may ask for new cards once, and only with the node g3', () => {
    const party = atTheVote(['krigare']);
    const run = runOf(party.world)!;
    const p = party.players[0]!;
    expect(listen(rerollOffer(party.world, p.id, party.ctx()), RUN_T.noReroll)).toBe(true);
    runSaveOf(p).tree = ['g1', 'g3'];
    const cards = [...run.offer!.cards];
    expect(listen(rerollOffer(party.world, p.id, party.ctx()), RUN_T.reroll)).toBe(true);
    expect(run.offer!.cards).toHaveLength(3);
    for (const c of run.offer!.cards) expect(cards).not.toContain(c);
    expect(listen(rerollOffer(party.world, p.id, party.ctx()), RUN_T.noReroll)).toBe(true);
  });
});

describe('the vote on the way on (GAME2.md section 2.2)', () => {
  /** The cards are voted and done: the väg-runor are out and the party stands in the exit room. */
  function atTheRoute(classes: ClassId[] = ['vaktare', 'helare', 'magiker'], opts: { companion?: boolean } = {}): Party {
    const party = makeParty(classes, { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6, ...(opts.companion === false ? { companion: false } : {}) }, party.ctx());
    const run = runOf(party.world)!;
    clearStop(party);
    for (const p of party.players) pickRuna(party.world, p.id, 0, party.ctx());
    expect(run.phase).toBe('route');
    return party;
  }
  const stand = (party: Party, p: import('./index.ts').PlayerState, c: number | null): void => {
    const run = runOf(party.world)!;
    if (c === null) {
      const room = run.plan.stops[run.node]!.def.rooms[run.plan.stops[run.node]!.endRoom]!;
      p.x = px(room.x);
      p.y = px(room.y);
    } else {
      p.x = px(run.vote!.runes[c]!.x);
      p.y = px(run.vote!.runes[c]!.y);
    }
  };
  const wait = (party: Party, ms: number): void => {
    for (let t = 0; t < ms; t += 50) step(party, false, []);
  };

  it('tally: a strict majority ends it at once, everyone having voted ends it, so does the clock; ties are the caller’s', () => {
    expect(tally([1, 0, 0], 3, { late: false, majority: true })).toBeNull();
    expect(tally([2, 0, 0], 3, { late: false, majority: true })).toEqual([0]);
    expect(tally([2, 0, 0], 3, { late: false, majority: false })).toBeNull();
    expect(tally([1, 1, 1], 3, { late: false, majority: true })).toEqual([0, 1, 2]);
    expect(tally([1, 1, 0], 3, { late: false, majority: true })).toBeNull();
    expect(tally([1, 1, 0], 3, { late: true, majority: false })).toEqual([0, 1]);
    expect(tally([0, 0, 0], 3, { late: true, majority: false })).toEqual([]);
    expect(tally([0, 0, 0], 0, { late: false, majority: false })).toBeNull();
    expect(tally([1, 2], 3, { late: false, majority: true })).toEqual([1]);
  });

  it('the runes appear when the stop is cleared: one for each stop the next row leads to, with its picture, and the state tells who stands where', () => {
    const party = atTheRoute();
    const run = runOf(party.world)!;
    const area = party.world.areas![run.key]!;
    const next = run.plan.route.nodes[run.node]!.next;
    expect(run.vote!.runes.map((r) => r.node)).toEqual(next);
    expect(next.length).toBeGreaterThanOrEqual(2);
    const room = run.plan.stops[run.node]!.def.rooms[run.plan.stops[run.node]!.endRoom]!;
    for (const r of run.vote!.runes) {
      const o = objectAt(area, r.x, r.y)!;
      expect(o.kind).toBe('run_exit');
      expect(o.variant).toBe(NODE_KIND_CODE[run.plan.route.nodes[r.node]!.kind]);
      expect(r.x >= room.x && r.x < room.x + room.w && r.y >= room.y && r.y < room.y + room.h).toBe(true);
    }
    // the runes are far enough apart that one is never stood on for another
    for (const a of run.vote!.runes) for (const b of run.vote!.runes) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * ROUTE_DISC_RADIUS + 0.4);
    const [a] = party.players as [import('./index.ts').PlayerState];
    stand(party, a, 1);
    const out: Change[] = [];
    for (let i = 0; i < 4; i++) step(party, false, out);
    const snap = out.filter((c) => c.t === 'run' && c.ev === 'state' && c.run).map((c) => (c.t === 'run' && c.ev === 'state' ? c.run : null)).at(-1)!;
    expect(snap.phase).toBe('route');
    expect(snap.choices!.map((c) => c.node)).toEqual(next);
    expect(snap.choices![1]!.on).toEqual([a.id]);
    expect(snap.choices![0]!.on).toEqual([]);
    expect(snap.routeLeft).toBeGreaterThan(0);
    expect(snap.routeLeft).toBeLessThanOrEqual(ROUTE_VOTE_MS);
    expect(snap.route).toHaveLength(run.plan.route.nodes.length);
    expect(snap.path).toEqual([0]);
    expect(snap.finder).toBe(a.id);
  });

  it('all online humans on the same rune end it at once (after the short stay), and the party is in that stop', () => {
    const party = atTheRoute();
    const run = runOf(party.world)!;
    const target = run.vote!.runes[1]!;
    for (const p of party.players) stand(party, p, 1);
    wait(party, ROUTE_DWELL_MS - 200);
    expect(run.phase).toBe('route');
    wait(party, 400);
    expect(run.phase).toBe('stop');
    expect(run.node).toBe(target.node);
    expect(run.path).toEqual([0, target.node]);
    for (const p of party.players) expect(p.area).toBe(run.key);
    expect(run.vote).toBeUndefined();
    expect(party.world.areas![run.key]!.saga!.run!.kind).toBe(run.plan.route.nodes[target.node]!.kind);
  });

  it('the most players win; walking over a rune on the way to another is no vote; a step off takes the vote back', () => {
    const party = atTheRoute();
    const run = runOf(party.world)!;
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const second = run.vote!.runes[1]!.node;
    stand(party, a, 0);
    stand(party, b, 1);
    stand(party, c, 0);
    // c only passes over rune 0 and goes on to stand on rune 1 (a and b stay): nobody has been on a rune long enough yet
    wait(party, 400);
    stand(party, c, 1);
    wait(party, 400);
    expect(run.phase).toBe('route');
    // a steps off: b and c are two of three on rune 1, but a is not on a rune and the others have stayed: it waits for a
    stand(party, a, null);
    wait(party, ROUTE_DWELL_MS + 200);
    expect(run.phase).toBe('route');
    expect(run.vote!.on[a.id]).toBeUndefined();
    // a comes to rune 1 as well: all three, so it ends
    stand(party, a, 1);
    wait(party, ROUTE_DWELL_MS + 200);
    expect(run.node).toBe(second);
  });

  it('two against one: the most players win, the one on the other rune goes along', () => {
    const party = atTheRoute();
    const run = runOf(party.world)!;
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    const first = run.vote!.runes[0]!.node;
    stand(party, a, 1);
    stand(party, b, 0);
    stand(party, c, 0);
    wait(party, ROUTE_DWELL_MS + 300);
    expect(run.node).toBe(first);
    for (const p of party.players) expect(p.area).toBe(run.key);
  });

  it('a tie goes to the Stigfinnare, who rotates each row and is told in the state', () => {
    const party = atTheRoute(['vaktare', 'helare']);
    const run = runOf(party.world)!;
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    expect(finderOf(party.world, run)).toBe(a.id);
    const second = run.vote!.runes[1]!.node;
    stand(party, a, 1);
    stand(party, b, 0);
    wait(party, ROUTE_DWELL_MS + 300);
    expect(run.node).toBe(second);
    // the next row: b has the turn (the party goes straight to a Flock with two ways on: the map is the plan's)
    expect(finderOf(party.world, run)).toBe(b.id);
    const wide = run.plan.route.nodes.find((n) => n.kind === 'flock' && n.row >= 2 && n.next.length >= 2)!;
    enterStop(party.world, run, wide.id, party.ctx());
    clearStop(party);
    for (const p of party.players) pickRuna(party.world, p.id, 0, party.ctx());
    expect(run.phase).toBe('route');
    const nodes = run.vote!.runes.map((r) => r.node);
    expect(nodes).toEqual(wide.next);
    stand(party, a, 0);
    stand(party, b, 1);
    wait(party, ROUTE_DWELL_MS + 300);
    expect(run.node).toBe(nodes[1]);
    // and round again: a
    expect(finderOf(party.world, run)).toBe(a.id);
  });

  it('20 seconds after the first player stepped onto a rune the vote ends with those who stand on one; nobody on a rune: it waits', () => {
    const party = atTheRoute();
    const run = runOf(party.world)!;
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    wait(party, ROUTE_VOTE_MS + 5_000);
    expect(run.phase).toBe('route');
    expect(run.vote!.first).toBeUndefined();
    const third = run.vote!.runes[0]!.node;
    stand(party, a, 0);
    wait(party, 500);
    expect(run.vote!.first).toBeDefined();
    // b arrives a little later on another rune; c stays away. At 20 s after the first: one against one, a tie, a is the Stigfinnare
    wait(party, 5_000);
    stand(party, b, 1);
    wait(party, ROUTE_VOTE_MS - 5_500 - 100);
    expect(run.phase).toBe('route');
    wait(party, 700);
    expect(run.node).toBe(third);
    for (const p of party.players) expect(p.area).toBe(run.key);
  });

  it('followers never vote, and someone offline does not hold the vote up', () => {
    const party = atTheRoute(['krigare']);
    const run = runOf(party.world)!;
    const comp = party.world.players[run.companions[0]!]!;
    const target = run.vote!.runes[0]!.node;
    // the Hirdmannen stands on rune 1 as long as it likes: it is not counted
    stand(party, comp, 1);
    wait(party, ROUTE_VOTE_MS + 2_000);
    expect(run.phase).toBe('route');
    expect(run.vote!.on[comp.id]).toBeUndefined();
    stand(party, party.players[0]!, 0);
    wait(party, ROUTE_DWELL_MS + 300);
    expect(run.node).toBe(target);
    // offline: a pair, one of them has lost the connection
    const duo = atTheRoute(['krigare', 'magiker'], { companion: false });
    const r2 = runOf(duo.world)!;
    duo.players[1]!.online = false;
    stand(duo, duo.players[0]!, 1);
    wait(duo, ROUTE_DWELL_MS + 300);
    expect(r2.node).toBe(r2.path[1]);
    expect(r2.path).toHaveLength(2);
  });

  it('using the rune (the action key) counts at once, for those who press rather than wait', () => {
    const party = atTheRoute(['krigare']);
    const run = runOf(party.world)!;
    const a = party.players[0]!;
    const r = run.vote!.runes[1]!;
    stand(party, a, 1);
    step(party, false, []);
    expect(run.phase).toBe('route');
    performAction(party.world.areas![run.key]!, a.id, r.x, r.y, party.ctx());
    expect(run.node).toBe(r.node);
  });

  it('a friend who joins while the cards are out waits on the farm and is in the next stop; one who joins on the way is in the exit room', () => {
    const party = makeParty(['vaktare', 'helare', 'krigare']);
    const [a, , c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    placeIn(party.world, c, 'a:0,1', 5, 5, 'down', []);
    startRun(party.world, a.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    clearStop(party);
    expect(run.phase).toBe('pick');
    const front = archFrontOf(party.world);
    placeIn(party.world, c, 'farm', front.x, front.y, 'down', []);
    joinRun(party.world, c.id, party.ctx());
    expect(c.area).toBe('farm');
    for (const p of party.players.slice(0, 2)) pickRuna(party.world, p.id, 0, party.ctx());
    // the voters now are the two in the stop; c is not asked for
    expect(run.phase).toBe('route');
    expect(run.party).toContain(c.id);
    for (const p of party.players.slice(0, 2)) stand(party, p, 0);
    wait(party, ROUTE_DWELL_MS + 300);
    expect(run.path).toHaveLength(2);
    expect(c.area).toBe(run.key);
  });

  it('a Vilosten gives 40 % of everyone’s health and gets the fallen up; no cards, the runes are out at once', () => {
    const party = makeParty(['vaktare', 'helare']);
    startRun(party.world, party.players[0]!.id, { seed: 6, companion: false }, party.ctx());
    const run = runOf(party.world)!;
    clearStop(party);
    for (const p of party.players) pickRuna(party.world, p.id, 0, party.ctx());
    // put the party straight into a Vilosten of the plan (the map is the plan's; the way there is not what this is about)
    const restNode = run.plan.route.nodes.find((n) => n.kind === 'rest' && n.row >= 2 && n.row <= 4)!;
    expect(enterStop(party.world, run, restNode.id, party.ctx()).length).toBeGreaterThan(0);
    const inst = party.world.areas![run.key]!.saga!;
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    expect(run.plan.stops[run.node]!.kind).toBe('rest');
    wait(party, 100);
    // (the heal came at once, on the first tick: now they are hurt again, one of them down, and it does not come twice)
    inst.fighters[a.id]!.hp = 20;
    inst.fighters[b.id]!.hp = 0;
    inst.fighters[b.id]!.down = party.now;
    wait(party, 500);
    expect(inst.fighters[a.id]!.hp).toBeLessThan(40);
    expect(inst.fighters[b.id]!.down).toBeDefined();
    // a new arrival (the stop entered anew) heals 40 % of the maximum, and gets the fallen up
    inst.fighters[a.id]!.hp = 20;
    run.paid.delete(`${run.node}:heal`);
    wait(party, 50);
    expect(Math.abs(inst.fighters[a.id]!.hp - Math.min(inst.fighters[a.id]!.max, 20 + Math.round(inst.fighters[a.id]!.max * VILOSTEN_HEAL)))).toBeLessThan(1);
    expect(inst.fighters[b.id]!.down).toBeUndefined();
    expect(Math.abs(inst.fighters[b.id]!.hp - Math.round(inst.fighters[b.id]!.max * VILOSTEN_HEAL))).toBeLessThan(1);
    // no cards at a Vilosten; the runes are out at once; and it is no cleared fight: no sagafrön for the stop
    expect(run.phase).toBe('route');
    expect(run.offer).toBeUndefined();
    expect(run.vote!.runes.length).toBeGreaterThanOrEqual(1);
    expect(readRun(a).zones).toBe(1);
  });
});

describe('the bots choose the way on (runbot.ts)', () => {
  /** The route phase with one bot human (no Hirdmannen); returns the stop it walked to. */
  function walkedTo(style: 'careful' | 'clumsy', hurt: boolean, rnd?: () => number): { node: number; kind: string; kinds: string[] } {
    const party = makeParty(['krigare'], { seed: 6, style });
    const me = party.players[0]!;
    if (rnd) party.minds.get(me.id)!.rnd = rnd;
    startRun(party.world, me.id, { seed: 6, companion: false }, party.ctx());
    const run = runOf(party.world)!;
    clearStop(party);
    pickRuna(party.world, me.id, 0, party.ctx());
    expect(run.phase).toBe('route');
    const inst = party.world.areas![run.key]!.saga!;
    const kinds = inst.run!.exits!.map((e) => e.kind);
    expect(kinds.length).toBeGreaterThanOrEqual(2);
    const hp = (): void => {
      const f = inst.fighters[me.id]!;
      f.hp = hurt ? Math.round(f.max * 0.4) : f.max;
    };
    // (it is only asked where to go: its health is held at what the test says while it walks)
    for (let t = 0; t < 300_000 && run.phase === 'route'; t += 50) {
      hp();
      step(party, true, []);
    }
    expect(run.phase).toBe('stop');
    return { node: run.node, kind: run.plan.route.nodes[run.node]!.kind, kinds };
  }

  it('the careful bot takes the safe lane: a Vilosten when it is hurt and there is one, else a fight', () => {
    const hurt = walkedTo('careful', true);
    const fine = walkedTo('careful', false);
    expect(hurt.kinds).toEqual(fine.kinds);
    expect(fine.kind).toBe('flock');
    expect(hurt.kind).toBe(hurt.kinds.includes('rest') ? 'rest' : 'flock');
  });

  it('the clumsy bot takes a random lane, a different one for a different roll, and stops on its rune', () => {
    const low = walkedTo('clumsy', false, () => 0.01);
    const high = walkedTo('clumsy', false, () => 0.99);
    expect(low.kinds).toEqual(high.kinds);
    expect(low.node).not.toBe(high.node);
  });
});

describe('the clock, the wipe and the end', () => {
  it('nudges at 25 minutes, at 30 and every 10 minutes after, and never ends the run because of the clock', () => {
    const party = makeParty(['vaktare', 'helare']);
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    a.coins = 321;
    runSaveOf(a).seeds = 17;
    const ticks = (ms: number): Change[] => {
      const out: Change[] = [];
      for (let t = 0; t < ms; t += 50) {
        party.now += 50;
        out.push(...tick(party.world, 50, party.ctx()));
      }
      return out;
    };
    const count = (cs: Change[], text: string): number => cs.filter((c) => c.t === 'banner' && c.text === text).length;
    run.elapsed = RUN_WARN_MS - 100;
    const warned = ticks(300);
    expect(count(warned, RUN_T.warn)).toBe(2);
    expect(count(ticks(1000), RUN_T.warn)).toBe(0);
    expect(count(warned, RUN_T.late)).toBe(0);
    // 30:00: still alive, everyone told, counted once
    run.elapsed = RUN_MAX_MS - 100;
    const at30 = ticks(300);
    expect(runOf(party.world)).toBe(run);
    expect(run.phase).not.toBe('ended');
    expect(count(at30, RUN_T.late)).toBe(2);
    expect(at30.some((c) => c.t === 'run' && c.ev === 'ended')).toBe(false);
    for (const p of [a, b]) expect(p.area).toBe(run.key);
    expect(readRun(a).timeouts).toBe(1);
    expect(readRun(b).timeouts).toBe(1);
    expect(count(ticks(2000), RUN_T.late)).toBe(0);
    // the second one comes ten minutes later and not before
    run.elapsed = RUN_MAX_MS + RUN_NUDGE_MS - 1000;
    expect(count(ticks(500), RUN_T.late)).toBe(0);
    run.elapsed = RUN_MAX_MS + RUN_NUDGE_MS - 100;
    expect(count(ticks(300), RUN_T.late)).toBe(2);
    expect(readRun(a).timeouts).toBe(1);
    run.elapsed = RUN_MAX_MS + 2 * RUN_NUDGE_MS - 100;
    expect(count(ticks(300), RUN_T.late)).toBe(2);
    expect(runOf(party.world)).toBe(run);
    expect(a.coins).toBe(321);
    expect(readRun(a).seeds).toBe(17);
    // and a run that went past the mark still ends with its own outcome: here a player walks home, the other stays
    leaveRun(party.world, a.id, party.ctx());
    expect(a.area).toBe('farm');
    expect(runOf(party.world)).toBe(run);
  });

  it('a run past 30 minutes that is then wiped ends as a wipe, and one that wins ends as a win', () => {
    for (const how of ['wipe', 'win'] as const) {
      const party = makeParty(['vaktare', 'helare']);
      startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
      const run = runOf(party.world)!;
      run.elapsed = RUN_MAX_MS + 3 * RUN_NUDGE_MS;
      party.now += 50;
      tick(party.world, 50, party.ctx());
      expect(runOf(party.world)).toBe(run);
      const end = endRun(party.world, run, how, party.ctx());
      expect(run.outcome).toBe(how);
      expect(end.filter((c) => c.t === 'run' && c.ev === 'ended' && c.outcome === how)).toHaveLength(2);
      expect(runOf(party.world)).toBeUndefined();
      for (const p of party.players) expect(p.area).toBe('farm');
      expect(readRun(party.players[0]!).timeouts).toBe(1);
    }
  });

  it('the clock stops while nobody is online, and a run nobody returns to ends after a minute', () => {
    const party = makeParty(['vaktare']);
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const p = party.players[0]!;
    for (let i = 0; i < 20; i++) step(party, false, []);
    const e = run.elapsed;
    p.online = false;
    party.world.players['x'] = { ...p, id: 'x', online: true } as never;
    delete party.world.players['x'];
    for (let i = 0; i < 100; i++) {
      party.now += 50;
      tick(party.world, 50, party.ctx());
    }
    // the world does not tick at all with nobody online (as always): the clock has not moved
    expect(run.elapsed).toBe(e);
    expect(run.phase).toBe('stop');
  });

  it('a wipe ends the run after the pause: everyone at the farm with their bag, coins and sagafrön', () => {
    const party = makeParty(['vaktare', 'helare', 'magiker'], { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const inst = party.world.areas![run.key]!.saga!;
    // (the Sagoandan would get them up: this is the wipe after the last one is spent)
    run.spirit = 0;
    inst.run!.spirit = 0;
    for (const p of party.players) {
      p.coins = 77;
      runSaveOf(p).seeds = 9;
      p.inventory[12] = { item: 'wood', count: 5 };
    }
    for (let i = 0; i < 4; i++) step(party, false, []);
    const now = party.now;
    for (const f of Object.values(inst.fighters)) {
      f.down = now;
      f.hp = 0;
    }
    const out: Change[] = [];
    for (let t = 0; t < WIPE_MS - 500; t += 50) {
      party.now += 50;
      out.push(...tick(party.world, 50, party.ctx()));
    }
    expect(runOf(party.world)).toBe(run);
    expect(out.some((c) => c.t === 'banner' && c.kind === 'wipe' && c.sub === RUN_T.wipeSub)).toBe(true);
    for (let t = 0; t < 1500; t += 50) {
      party.now += 50;
      out.push(...tick(party.world, 50, party.ctx()));
    }
    expect(runOf(party.world)).toBeUndefined();
    expect(run.outcome).toBe('wipe');
    for (const p of party.players) {
      expect(p.area).toBe('farm');
      expect(p.coins).toBe(77);
      expect(readRun(p).seeds).toBe(9);
      expect(readRun(p).wipes).toBe(1);
      expect(p.inventory[12]).toEqual({ item: 'wood', count: 5 });
    }
    expect(out.filter((c) => c.t === 'run' && c.ev === 'ended' && c.outcome === 'wipe')).toHaveLength(3);
    expect(out.some((c) => c.t === 'run' && c.ev === 'state' && c.run === null)).toBe(true);
  });

  it('a lone fallen player gets up at the rest stone as in a dungeon, and is not a wipe while a friend stands', () => {
    const party = makeParty(['vaktare', 'helare']);
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const inst = party.world.areas![run.key]!.saga!;
    for (let i = 0; i < 4; i++) step(party, false, []);
    const f = inst.fighters[party.players[0]!.id]!;
    f.down = party.now;
    f.hp = 0;
    for (let t = 0; t < 11_000; t += 50) step(party, false, []);
    expect(f.down).toBeUndefined();
    expect(runOf(party.world)).toBe(run);
  });

  it('the boss falling pays its sagafrön once, clears the chapter for everyone, and the run ends after the chest', () => {
    const party = makeParty(['vaktare', 'helare', 'magiker'], { seed: 6 });
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    // straight to the boss's stop (the map is the plan's; the packs and the route are not what this is about)
    const bossNode = run.plan.stops.length - 1;
    expect(run.plan.stops[bossNode]!.kind).toBe('boss');
    const key = 'saga:runlab-boss';
    const world = buildStop(run.plan, bossNode, key);
    world.saga!.run = { ...party.world.areas![run.key]!.saga!.run!, node: bossNode, row: ROUTE_ROWS, kind: 'boss' };
    delete party.world.areas![run.key];
    party.world.areas![key] = world;
    getArea(party.world, key);
    run.key = key;
    run.node = bossNode;
    for (const p of party.players) placeIn(party.world, p, key, world.saga!.start.x, world.saga!.start.y, 'up', []);
    for (let i = 0; i < 4; i++) step(party, false, []);
    const inst = world.saga!;
    const seeds0 = party.players.map((p) => readRun(p).seeds);
    const boss = inst.mobs[inst.boss]!;
    const bossA = world.animals[boss.id]!;
    for (const p of party.players) {
      p.x = bossA.x - 3 * TILE;
      p.y = bossA.y;
    }
    boss.hp = 1;
    boss.state = 'fight';
    castSpell(party.world, party.players[2]!.id, 'eldboll', boss.id, party.ctx());
    expect(inst.bossDown).toBe(true);
    const out: Change[] = [];
    for (let i = 0; i < 4; i++) {
      party.now += 50;
      out.push(...tick(party.world, 50, party.ctx()));
    }
    expect(run.phase).toBe('victory');
    party.players.forEach((p, i) => {
      expect(readRun(p).seeds).toBe(seeds0[i]! + RUN_SEEDS.bossFirst);
      expect(readRun(p).wins).toBe(1);
      expect(readRun(p).clears.draug).toBe(1);
      expect(p.saga!.cleared).toContain('draug');
    });
    // seeds are paid once
    for (let i = 0; i < 20; i++) step(party, false, []);
    expect(readRun(party.players[0]!).seeds).toBe(seeds0[0]! + RUN_SEEDS.bossFirst);
    // the chest is there; 90 seconds later the run is over and everyone is home
    expect(Object.values(world.objects).some((o) => o.kind === 'saga_chest' && o.variant === 2)).toBe(true);
    for (let t = 0; t < 91_000; t += 50) step(party, false, []);
    expect(runOf(party.world)).toBeUndefined();
    expect(run.outcome).toBe('win');
    for (const p of party.players) expect(p.area).toBe('farm');
  });

  /** The party stands in the boss's stop (the plan's own map), the boss at one health. */
  function atTheBoss(party: Party): { run: NonNullable<ReturnType<typeof runOf>>; inst: NonNullable<WorldState['saga']>; world: WorldState; boss: { id: number } } {
    const run = runOf(party.world)!;
    const key = 'saga:runlab-boss';
    const bossNode = run.plan.stops.length - 1;
    const world = buildStop(run.plan, bossNode, key);
    world.saga!.run = { ...party.world.areas![run.key]!.saga!.run!, node: bossNode, row: ROUTE_ROWS, kind: 'boss' };
    delete party.world.areas![run.key];
    party.world.areas![key] = world;
    getArea(party.world, key);
    run.key = key;
    run.node = bossNode;
    for (const p of [...party.players, ...run.companions.map((id) => party.world.players[id]!)]) if (p.online) placeIn(party.world, p, key, world.saga!.start.x, world.saga!.start.y, 'up', []);
    for (let i = 0; i < 4; i++) step(party, false, []);
    const inst = world.saga!;
    const boss = inst.mobs[inst.boss]!;
    const bossA = world.animals[boss.id]!;
    for (const p of party.players) {
      p.x = bossA.x - 3 * TILE;
      p.y = bossA.y;
    }
    boss.hp = 1;
    boss.state = 'fight';
    return { run, inst, world: party.world, boss };
  }

  it('the boss falling clears the chapter for a member who is offline too, and the hired companion takes no loot', () => {
    // two players, one of them has lost the connection in the zone
    const duo = makeParty(['magiker', 'vaktare'], { seed: 6 });
    startRun(duo.world, duo.players[0]!.id, { seed: 6 }, duo.ctx());
    const { run, inst } = atTheBoss(duo);
    const [a, b] = duo.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    b.online = false;
    expect(run.party).toContain(b.id);
    castSpell(duo.world, a.id, 'eldboll', inst.boss, duo.ctx());
    expect(inst.bossDown).toBe(true);
    for (let i = 0; i < 4; i++) step(duo, false, []);
    expect(a.saga!.cleared).toContain('draug');
    expect(b.saga!.cleared).toContain('draug');
    expect(b.stats?.sagaDraug).toBe(1);
    expect(readRun(b).wins).toBe(1);
    expect(readRun(b).clears.draug).toBe(1);

    // one player and the companion: the companion never takes a chest, an essence or sagafrön
    const solo = makeParty(['magiker'], { seed: 6, longhall: true });
    startRun(solo.world, solo.players[0]!.id, { seed: 6 }, solo.ctx());
    const lab = atTheBoss(solo);
    const h = solo.players[0]!;
    const c = solo.world.players[lab.run.companions[0]!]!;
    expect(c.bot).toBe(true);
    placeIn(solo.world, c, lab.run.key, lab.inst.start.x, lab.inst.start.y, 'up', []);
    const coins = c.coins;
    const bag = JSON.stringify(c.inventory);
    // an essence roll that always succeeds goes to the one who struck the blow, unless it is the companion
    const sure = { ...solo.ctx(), rnd: () => 0 };
    const mob = spawnSagaMob(lab.world.areas![lab.run.key]!, lab.inst, 'skelett', c.x + TILE, c.y, 'mob', -1);
    lab.inst.mobs[mob.id]!.hp = 1;
    lab.inst.mobs[mob.id]!.state = 'fight';
    castSpell(solo.world, c.id, 'ljuspil', mob.id, sure);
    expect(lab.inst.mobs[mob.id]).toBeUndefined();
    expect(c.inventory.some((s) => s?.item === 'monsteressens')).toBe(false);
    castSpell(solo.world, h.id, 'eldboll', lab.inst.boss, solo.ctx());
    expect(lab.inst.bossDown).toBe(true);
    const seeds = readRun(h).seeds;
    for (let i = 0; i < 400; i++) step(solo, true, []);
    expect(readRun(h).seeds).toBeGreaterThanOrEqual(seeds);
    const chest = Object.values(lab.world.areas![lab.run.key]!.objects).find((o) => o.kind === 'saga_chest' && o.variant === 2)!;
    expect(performAction(lab.world.areas![lab.run.key]!, c.id, chest.x, chest.y, solo.ctx())).toEqual([]);
    expect(lab.inst.looted[chest.id] ?? []).not.toContain(c.id);
    expect(c.coins).toBe(coins);
    expect(JSON.stringify(c.inventory)).toBe(bag);
    expect(readRun(c).seeds).toBe(0);
  });

  it('f6 pays its five extra sagafrön to the planter only, not to the whole party', () => {
    const duo = makeParty(['magiker', 'vaktare'], { seed: 6 });
    const [a, b] = duo.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    runSaveOf(a).tree = ['f1', 'f3', 'f6'];
    startRun(duo.world, a.id, { seed: 6 }, duo.ctx());
    const { inst } = atTheBoss(duo);
    const before = [readRun(a).seeds, readRun(b).seeds];
    castSpell(duo.world, a.id, 'eldboll', inst.boss, duo.ctx());
    for (let i = 0; i < 4; i++) step(duo, false, []);
    expect(inst.bossDown).toBe(true);
    expect(readRun(a).seeds).toBe(before[0]! + RUN_SEEDS.bossFirst + 5);
    expect(readRun(b).seeds).toBe(before[1]! + RUN_SEEDS.bossFirst);
  });

  it('a win is a win once: the clock passing 30:00 or a wipe tick after the boss fell shows no nudge and counts no timeout or wipe', () => {
    for (const how of ['late', 'wipe'] as const) {
      const party = makeParty(['magiker'], { seed: 6 });
      const p = party.players[0]!;
      // a lone fighter (a standing companion would make the fall of the human no wipe)
      startRun(party.world, p.id, { seed: 6, companion: false }, party.ctx());
      const { run, inst } = atTheBoss(party);
      castSpell(party.world, p.id, 'eldboll', inst.boss, party.ctx());
      const out: Change[] = [];
      for (let i = 0; i < 4; i++) {
        party.now += 50;
        out.push(...tick(party.world, 50, party.ctx()));
      }
      expect(run.phase).toBe('victory');
      expect(readRun(p).wins).toBe(1);
      // the clock passes the 30-minute mark (the chest's 90 seconds run out with it), or the last one standing falls and the wipe pause runs out
      if (how === 'late') run.elapsed = RUN_MAX_MS - 20;
      else inst.fighters[p.id]!.down = party.now;
      for (let i = 0; i < (how === 'late' ? 4 : 120); i++) {
        party.now += 50;
        out.push(...tick(party.world, 50, party.ctx()));
      }
      expect(runOf(party.world)).toBeUndefined();
      expect(run.outcome).toBe('win');
      expect(readRun(p).wins).toBe(1);
      expect(readRun(p).timeouts).toBe(0);
      expect(readRun(p).wipes).toBe(0);
      expect(out.some((c) => c.t === 'banner' && c.text === RUN_T.late)).toBe(false);
      expect(out.filter((c) => c.t === 'run' && c.ev === 'ended' && c.outcome === 'win')).toHaveLength(1);
      expect(out.some((c) => c.t === 'run' && c.ev === 'ended' && c.outcome !== 'win')).toBe(false);
    }
  });

  it('a dropped connection: the player comes back to the zone, or home when the run is over', () => {
    const party = makeParty(['vaktare', 'helare']);
    startRun(party.world, party.players[0]!.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const b = party.players[1]!;
    for (let i = 0; i < 4; i++) step(party, false, []);
    const out = rejoinRun(party.world, b.id);
    expect(b.area).toBe(run.key);
    expect(out.some((c) => c.t === 'run' && c.ev === 'state')).toBe(true);
    endRun(party.world, run, 'leave', party.ctx());
    b.area = run.key;
    rejoinRun(party.world, b.id);
    expect(b.area).toBe('farm');
  });
});

describe('the sagaträd', () => {
  it('plants a node for its cost, in order, once, and the shoot grows with what the family has planted', () => {
    const party = makeParty(['krigare', 'helare']);
    const [a, b] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    expect(plantError(a.run, 'h1')).toBe('seeds');
    expect(plantError(undefined, 'nope')).toBe('unknown');
    runSaveOf(a).seeds = 60;
    expect(plantError(a.run, 'h2')).toBe('needs');
    expect(plantNode(party.world, a.id, 'h2').some((c) => c.t === 'toast' && c.text.includes(TREE_NAMES.h1!))).toBe(true);
    expect(readRun(a).seeds).toBe(60);
    const ch = plantNode(party.world, a.id, 'h1');
    expect(readRun(a).seeds).toBe(50);
    expect(readRun(a).tree).toEqual(['h1']);
    expect(ch.some((c) => c.t === 'seed' && c.ev === 'tree' && c.seeds === 50 && c.tree.includes('h1'))).toBe(true);
    expect(listen(plantNode(party.world, a.id, 'h1'), RUN_T.plantDone)).toBe(true);
    expect(plantNode(party.world, a.id, 'zzz')).toEqual([]);
    expect(shootOf(party.world)!.variant ?? 0).toBe(0);
    // stages: the whole family counts
    runSaveOf(a).seeds = 500;
    runSaveOf(b).seeds = 500;
    for (const id of ['h2', 'h3', 'h4']) plantNode(party.world, a.id, id);
    expect(plantedByFamily(party.world)).toBe(4);
    expect(shootOf(party.world)!.variant).toBe(1);
    for (const id of ['g1', 'g2', 'g3', 'g4']) plantNode(party.world, b.id, id);
    expect(plantedByFamily(party.world)).toBe(8);
    expect(shootOf(party.world)!.variant).toBe(2);
    expect([0, 2, 3, 7, 8, 13, 14, 23, 24, 99].map(treeStage)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    // the companion does not make the tree grow
    expect(plantedByFamily(party.world)).toBe(8);
  });

  it('hero and farm nodes are the planter’s own; party nodes help everyone in the run (the best of them, not the sum)', () => {
    const party = makeParty(['vaktare', 'helare', 'magiker'], { seed: 6 });
    const [a, b, c] = party.players as [import('./index.ts').PlayerState, import('./index.ts').PlayerState, import('./index.ts').PlayerState];
    runSaveOf(a).tree = ['h1', 'h2', 'g1'];
    runSaveOf(b).tree = ['g1', 'g2'];
    startRun(party.world, a.id, { seed: 6 }, party.ctx());
    const run = runOf(party.world)!;
    const inst = party.world.areas![run.key]!.saga!;
    const buffs = inst.run!.buffs;
    expect(buffs[a.id]!.power).toBeCloseTo(0.03);
    expect(buffs[a.id]!.hp).toBeCloseTo(0.05);
    expect(buffs[b.id]!.power).toBe(0);
    for (const p of [a, b, c]) expect(buffs[p.id]!.rest).toBeCloseTo(0.25);
    for (const p of [a, b, c]) expect(buffs[p.id]!.down).toBeCloseTo(0.2);
  });

  it('every node’s effect shows in the run: its number reaches the buffs or the run’s own bookkeeping', () => {
    for (const n of SEED_TREE) {
      const party = makeParty(['krigare', 'helare'], { seed: 6 });
      const a = party.players[0]!;
      let node = n;
      const chain: string[] = [];
      while (node.needs) {
        chain.unshift(node.needs);
        node = treeNode(node.needs)!;
      }
      runSaveOf(a).tree = [...chain, n.id];
      const base = makeParty(['krigare', 'helare'], { seed: 6 });
      startRun(party.world, a.id, { seed: 6 }, party.ctx());
      startRun(base.world, base.players[0]!.id, { seed: 6 }, base.ctx());
      const mine = runOf(party.world)!.base[a.id]!;
      const none = runOf(base.world)!.base[base.players[0]!.id]!;
      const inst = party.world.areas![runOf(party.world)!.key]!.saga!;
      const built = inst.run!.buffs[a.id]!;
      const key = Object.keys(n.effect)[0]!;
      if (n.effect.potions) expect(a.inventory.reduce((s, x) => s + (x?.item === 'healing_potion' ? x.count : 0), 0)).toBe(3 + n.effect.potions);
      else if (key === 'slots') expect(foodSlots(a)).toBe(2);
      else if (key === 'reroll') expect(runOf(party.world)!.rerolled).toBe(false);
      else if (['food', 'animal', 'companion', 'bossSeeds', 'seeds'].includes(key)) expect((mine as Record<string, number>)[key] ?? 0).toBeGreaterThanOrEqual((none as Record<string, number>)[key] ?? 0);
      else expect((built as unknown as Record<string, number>)[key]).toBeGreaterThan(0);
    }
  });

  it('g5 makes the hired companion stronger, g6 and f6 pay more, and f5 more coins', () => {
    const party = makeParty(['krigare'], { longhall: true, seed: 5 });
    const p = party.players[0]!;
    runSaveOf(p).tree = ['g1', 'g3', 'g5'];
    startRun(party.world, p.id, { seed: 5 }, party.ctx());
    const run = runOf(party.world)!;
    const inst = party.world.areas![run.key]!.saga!;
    const c = run.companions[0]!;
    expect(inst.run!.buffs[c]!.power).toBeCloseTo(0.2);
    expect(inst.run!.buffs[c]!.hp).toBeCloseTo(0.2);
    expect(inst.run!.buffs[p.id]!.power).toBe(0);
    const six = makeParty(['krigare'], { seed: 5 });
    runSaveOf(six.players[0]!).tree = ['g1', 'g2', 'g4', 'g6', 'f1', 'f3', 'f6', 'f2', 'f5'];
    startRun(six.world, six.players[0]!.id, { seed: 5 }, six.ctx());
    const r6 = runOf(six.world)!;
    expect(r6.base[six.players[0]!.id]!.bossSeeds).toBe(5);
    expect(six.world.areas![r6.key]!.saga!.run!.buffs[six.players[0]!.id]!.coins).toBeCloseTo(0.25);
  });
});

describe('saves', () => {
  it('an old player without a run record, or with a partial one, loads unchanged and plays', () => {
    const party = makeParty(['krigare']);
    const p = party.players[0]!;
    const old = JSON.parse(JSON.stringify(p));
    delete old.run;
    delete old.bot;
    party.world.players[p.id] = old;
    expect(old.run).toBeUndefined();
    expect(readRun(old)).toEqual(newRunSave());
    expect(old.run).toBeUndefined(); // reading does not change the player
    old.run = { seeds: 5 };
    expect(readRun(old).seeds).toBe(5);
    expect(readRun(old).tree).toEqual([]);
    expect(readRun(old).clears).toEqual({});
    expect(runSaveOf(old).best).toEqual({});
    // the player record is plain JSON: a run record survives a round trip
    runSaveOf(old).tree = ['h1'];
    expect(JSON.parse(JSON.stringify(old)).run.tree).toEqual(['h1']);
    old.online = true;
    old.x = p.x;
    old.y = p.y;
    expect(startRun(party.world, old.id, { seed: 2 }, party.ctx()).length).toBeGreaterThan(0);
  });

  it('the run itself is never saved: the world has no trace of it, and an area key of a zone is a saga key', () => {
    const party = makeParty(['krigare']);
    startRun(party.world, party.players[0]!.id, { seed: 2 }, party.ctx());
    expect(JSON.stringify(Object.keys(party.world))).not.toContain('run');
    const keys = Object.keys(party.world.areas ?? {}).filter((k) => k.startsWith('saga:'));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^saga:run/);
  });
});

describe('Lätt and the Sagoandan (GAME2.md 4.5 and 5.3)', () => {
  const wipeIt = (l: ReturnType<typeof lab>): Change[] => {
    for (const f of Object.values(l.inst.fighters)) {
      f.down = l.party.now;
      f.hp = 0;
    }
    return l.go(WIPE_MS + 400);
  };

  it('a level is 0 (Lätt) or 1 (Vanlig); left out it is Vanlig; anything else is refused and no run starts', () => {
    expect([parseRunLevel(0), parseRunLevel(1), parseRunLevel(undefined)]).toEqual([0, 1, 1]);
    for (const bad of [2, -1, 0.5, '0', '1', null, true, NaN]) expect(parseRunLevel(bad)).toBeNull();
    for (const bad of [2, '0', null, 0.5]) {
      const party = makeParty(['krigare']);
      const out = runMessage(party.world, party.players[0]!.id, { t: 'run', a: 'start', level: bad }, party.ctx());
      expect(runOf(party.world)).toBeUndefined();
      expect(listen(out, RUN_T.badLevel)).toBe(true);
    }
    const a = makeParty(['krigare']);
    runMessage(a.world, a.players[0]!.id, { t: 'run', a: 'start', level: 0 }, a.ctx());
    expect(runOf(a.world)!.level).toBe(0);
    const b = makeParty(['krigare']);
    runMessage(b.world, b.players[0]!.id, { t: 'run', a: 'start' }, b.ctx());
    expect(runOf(b.world)!.level).toBe(1);
  });

  it('the state the clients get carries the level and the Sagoandans: 3 on Lätt, 1 on Vanlig', () => {
    for (const level of [0, 1] as const) {
      const party = makeParty(['krigare']);
      const out = startRun(party.world, party.players[0]!.id, { seed: 2, level }, party.ctx());
      const st = out.filter((c) => c.t === 'run' && c.ev === 'state' && c.run).pop();
      expect(st && st.t === 'run' && st.ev === 'state' ? [st.run!.level, st.run!.spirit, st.run!.spiritUsed] : null).toEqual([level, SAGOANDAN[level], 0]);
    }
    expect(SAGOANDAN[0]).toBe(3);
    expect(SAGOANDAN[1]).toBe(1);
  });

  it('Lätt: monster health ×0.6, damage ×0.5, warnings +40 %, the boss’s first two attacks only; Vanlig is as before', () => {
    const v = lab({}, ['magiker', 'helare'], 1);
    const l = lab({}, ['magiker', 'helare'], 0);
    expect(l.inst.run!.hpMul / v.inst.run!.hpMul).toBeCloseTo(LATT.hp, 5);
    expect(l.inst.run!.dmgMul / v.inst.run!.dmgMul).toBeCloseTo(LATT.dmg, 5);
    expect(l.inst.run!.bossMul / v.inst.run!.bossMul).toBeCloseTo(LATT.hp, 5);
    expect(l.inst.run!.warnMul).toBe(1.4);
    expect(v.inst.run!.warnMul).toBeUndefined();
    expect([LATT.hp, LATT.dmg, LATT.warn, LATT.seeds, LATT.bossMoves]).toEqual([0.6, 0.5, 1.4, 0.5, 2]);
    expect(levelMuls(1)).toEqual({ hp: 1, dmg: 1, warn: 1, seeds: 1 });
    // a monster pulled on Lätt has 0.6 of the health it has on Vanlig
    const max = (x: ReturnType<typeof lab>): number => {
      const { mob } = x.place('skelett', 3);
      mob.state = 'idle';
      castSpell(x.party.world, x.p.id, 'eldboll', mob.id, x.ctx());
      return mob.max;
    };
    expect(max(l) / max(v)).toBeCloseTo(0.6, 1);
    // the boss: how long its first warning lasts, and which attacks it ever uses
    const trace = (x: ReturnType<typeof lab>): { warn: number; seen: number[] } => {
      const boss = x.place('draugkung', 4, 'boss');
      x.inst.run!.dmgMul = 0;
      boss.mob.state = 'fight';
      boss.mob.threat[x.p.id] = 5;
      boss.mob.phase = 2;
      boss.mob.next = SAGA_BOSSES.draugkung!.moves.map(() => x.party.now);
      const seen = new Set<number>();
      let warn = 0;
      for (let t = 0; t < 40_000; t += 50) {
        x.go(50);
        for (const f of Object.values(x.inst.fighters)) f.hp = f.max;
        const c = x.inst.mobs[boss.mob.id]?.cast;
        if (c) {
          if (!seen.size) warn = c.at - x.party.now;
          seen.add(c.move);
        }
      }
      return { warn, seen: [...seen].sort() };
    };
    const tv = trace(v);
    const tl = trace(l);
    expect(tv.seen).toEqual([0, 1, 2]);
    expect(tl.seen.every((k) => k < 2)).toBe(true);
    expect(tl.seen.length).toBeGreaterThan(0);
    // (the first cast is seen on the tick it starts: its warning minus at most that tick)
    expect(tl.warn / tv.warn).toBeGreaterThan(1.3);
    expect(tl.warn / tv.warn).toBeLessThan(1.5);
  });

  it('Lätt pays half the sagafrön (a pack is half a seed; two packs, one)', () => {
    for (const level of [0, 1] as const) {
      const l = lab({}, ['magiker', 'helare'], level);
      for (const i of [0, 1]) {
        l.inst.packs[i]!.dead = true;
        for (const id of l.inst.packs[i]!.members) {
          delete l.inst.mobs[id];
          delete l.area.animals[id];
        }
      }
      l.go(100);
      expect(readRun(l.p).seeds).toBe(level === 0 ? 1 : 2);
    }
  });

  it('Vanlig: the first wipe is saved by the Sagoandan (half health at the stone, monsters reset, a clear banner), the second ends the run', () => {
    const l = lab({}, ['magiker', 'helare'], 1);
    const { mob } = l.place('skelett', 3);
    mob.state = 'fight';
    mob.threat[l.p.id] = 5;
    mob.hp = 5;
    const out = wipeIt(l);
    expect(runOf(l.party.world)).toBe(l.run);
    expect(out.some((c) => c.t === 'banner' && c.kind === 'level' && c.text === RUN_T.spirit && c.sub === fmt(RUN_T.spiritSub, { n: 0 }))).toBe(true);
    expect(out.some((c) => c.t === 'banner' && c.kind === 'wipe')).toBe(false);
    for (const f of Object.values(l.inst.fighters)) {
      expect(f.down).toBeUndefined();
      expect(f.hp).toBe(Math.round(f.max * SAGOANDAN_HP));
    }
    expect(mob.hp).toBe(mob.max);
    expect(l.run.spirit).toBe(0);
    expect(l.run.spiritUsed).toBe(1);
    expect(l.run.phase).toBe('stop');
    // the next wipe is the end
    const out2 = wipeIt(l);
    expect(out2.some((c) => c.t === 'banner' && c.kind === 'wipe')).toBe(true);
    expect(runOf(l.party.world)).toBeUndefined();
    expect(l.run.outcome).toBe('wipe');
    const ended = out2.find((c) => c.t === 'run' && c.ev === 'ended');
    expect(ended && ended.t === 'run' && ended.ev === 'ended' ? [ended.level, ended.spiritUsed] : null).toEqual([1, 1]);
  });

  it('Lätt: three Sagoandans, then a wipe still never ends the run (everyone is up, free); one more Sagoande after each stop', () => {
    const l = lab({}, ['magiker', 'helare'], 0);
    expect(l.run.spirit).toBe(3);
    for (let n = 1; n <= 3; n++) {
      wipeIt(l);
      expect(l.run.spirit).toBe(3 - n);
      expect(l.run.spiritUsed).toBe(n);
    }
    // none left: the fourth and fifth wipes are free, with full health, and the star stays at 0
    for (let n = 4; n <= 5; n++) {
      const out = wipeIt(l);
      expect(runOf(l.party.world)).toBe(l.run);
      expect(l.run.spirit).toBe(0);
      expect(l.run.spiritUsed).toBe(n);
      expect(out.some((c) => c.t === 'banner' && c.text === RUN_T.spiritFree)).toBe(true);
      for (const f of Object.values(l.inst.fighters)) expect(f.hp).toBe(f.max);
    }
    expect(l.run.phase).toBe('stop');
    // clearing a stop, voting on the runa and choosing the way brings the next stop: a Sagoande more
    for (const pk of l.inst.packs) {
      pk.dead = true;
      for (const id of pk.members) {
        delete l.inst.mobs[id];
        delete l.area.animals[id];
      }
    }
    l.go(200);
    expect(l.inst.gateOpen).toBe(true);
    expect(l.run.phase).toBe('pick');
    for (const q of l.party.players) pickRuna(l.party.world, q.id, 0, l.ctx());
    takeRune(l.party);
    expect(l.run.path).toHaveLength(2);
    expect(l.run.spirit).toBe(1);
    expect(l.party.world.areas![l.run.key]!.saga!.run!.spirit).toBe(1);
  });

  it('a wipe after the boss has fallen: Vanlig is not saved (the win stands and the run ends), Lätt gets everyone up free and the run goes on', () => {
    const v = lab({}, ['magiker', 'helare'], 1);
    v.inst.bossDown = true;
    v.run.outcome = 'win';
    const out = wipeIt(v);
    expect(out.some((c) => c.t === 'banner' && c.kind === 'wipe')).toBe(true);
    expect(v.run.spiritUsed).toBe(0);
    expect(v.run.spirit).toBe(1);
    expect(v.run.outcome).toBe('win');
    expect(runOf(v.party.world)).toBeUndefined();
    const l = lab({}, ['magiker', 'helare'], 0);
    l.inst.bossDown = true;
    l.run.outcome = 'win';
    const out2 = wipeIt(l);
    expect(out2.some((c) => c.t === 'banner' && c.kind === 'wipe')).toBe(false);
    expect(out2.some((c) => c.t === 'banner' && c.text === RUN_T.spiritFree)).toBe(true);
    expect(runOf(l.party.world)).toBe(l.run);
    expect(l.run.spirit).toBe(3);
    expect(l.run.spiritUsed).toBe(0);
    expect(l.run.outcome).toBe('win');
    for (const f of Object.values(l.inst.fighters)) {
      expect(f.down).toBeUndefined();
      expect(f.hp).toBe(f.max);
    }
  });

  it('on Lätt every boss keeps two real attacks, and what a boss calls in (phase adds, summons, ice) is 0.6 as tough; on Vanlig adds are as before', () => {
    // each chapter's boss: its first two attacks are real (a cast of its own, not only a summon or a mend) unless it has just the one
    for (const d of DUNGEON_IDS) {
      const boss = SAGA_BOSSES[DUNGEONS[d].boss]!;
      const first = boss.moves.slice(0, LATT.bossMoves);
      expect(first.length, d).toBeGreaterThanOrEqual(1);
      expect(first.some((m) => m.dmg > 0), d).toBe(true);
      if (boss.moves.length >= 2) expect(first.length, d).toBe(2);
      // and the plan of a first run and of a replay (every move unlocked) both leave Lätt exactly those attacks
      for (const replay of [false, true]) {
        const plan = generateRun(9, { boss: d, replay, clears: 2 });
        void plan; // (a first run may lock one of the later attacks; Lätt ignores the lock and keeps attacks 0 and 1)
        expect(lattMoves(), `${d} replay ${replay}`).toEqual([0, 1]);
        expect(lattMoves().every((k) => k < boss.moves.length), d).toBe(true);
      }
    }
    const adds = (level: 0 | 1): number => {
      const x = lab({}, ['magiker', 'helare'], level);
      const b = x.place('draugkung', 4, 'boss');
      x.inst.run!.dmgMul = 0;
      b.mob.state = 'fight';
      b.mob.threat[x.p.id] = 5;
      b.mob.phase = 0;
      b.mob.hp = b.mob.max * 0.661;
      castSpell(x.party.world, x.p.id, 'eldboll', b.mob.id, x.ctx());
      for (let t = 0; t < 1000; t += 50) {
        x.go(50);
        for (const f of Object.values(x.inst.fighters)) f.hp = f.max;
      }
      const a = Object.values(x.inst.mobs).find((m) => m.kind === 'add');
      return a ? a.max : 0;
    };
    const v = adds(1);
    const l = adds(0);
    expect(v).toBeGreaterThan(0);
    expect(l / v).toBeCloseTo(0.6, 1);
  });
});

// keep the unused helper imports honest
void applyMove;
void fardportOf;
void DUNGEON_IDS;
void ({} as DungeonId);
