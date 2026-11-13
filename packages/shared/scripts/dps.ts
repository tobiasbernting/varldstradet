// Tuning aid (not part of the game): what one bot does per second to a training dummy, and what a healer heals.
//   node --experimental-transform-types packages/shared/scripts/dps.ts
import { CLASSES, TILE, botStep, newMind, runOf, spawnSagaMob, startRun, tick, type BotStyle, type ClassId } from '../src/index.ts';
import { makeParty } from '../src/runplay.ts';

function scene(classes: ClassId[], companion = false) {
  const party = makeParty(classes, { seed: 3 });
  startRun(party.world, party.players[0]!.id, { seed: 3, companion, level: 2 }, party.ctx());
  const run = runOf(party.world)!;
  const area = party.world.areas![run.key]!;
  const inst = area.saga!;
  const room = run.plan.stops[run.node]!.def.rooms[0]!;
  Object.values(area.players).forEach((pl, i) => {
    pl.x = (room.x + Math.floor(room.w / 2)) * TILE + TILE / 2;
    pl.y = (room.y + Math.floor(room.h / 2) + i) * TILE + TILE / 2;
  });
  party.now += 50;
  tick(party.world, 50, party.ctx());
  const p = party.players[0]!;
  const dummy = (dx: number, dy = 0) => {
    const a = spawnSagaMob(area, inst, 'skelett', p.x + dx * TILE, p.y + dy * TILE, 'mob', -1);
    const m = inst.mobs[a.id]!;
    m.hp = m.max = 10_000_000;
    m.state = 'fight';
    m.threat[p.id] = 5;
    m.atkAt = Number.MAX_SAFE_INTEGER;
    m.stunUntil = 0;
    return m;
  };
  return { party, area, inst, p, dummy };
}

const SECS = 120;
for (const cls of ['krigare', 'magiker', 'vaktare', 'helare'] as ClassId[]) {
  for (const n of [1, 3]) {
    const row: string[] = [];
    for (const style of ['careful', 'masher', 'clumsy'] as BotStyle[]) {
      const s = scene([cls]);
      const mobs = Array.from({ length: n }, (_, i) => s.dummy(1.5, i * 0.9 - (n - 1) * 0.45));
      const mind = newMind(style, () => 0.5);
      for (let t = 0; t < SECS * 1000; t += 50) {
        s.party.now += 50;
        botStep(s.party.world, s.p.id, mind, s.party.ctx(), 50);
        tick(s.party.world, 50, s.party.ctx());
        // (the dummies stand where they are and do nothing)
        for (const m of mobs) m.atkAt = Number.MAX_SAFE_INTEGER;
      }
      const dmg = mobs.reduce((a, m) => a + (m.max - m.hp), 0);
      row.push(`${style} ${(dmg / SECS).toFixed(1)}`);
    }
    console.log(`${CLASSES[cls].name.padEnd(8)} ${n} dummy: ${row.join('   ')}`);
  }
}
// healing: the hurt hero has a bottomless bar; a dummy keeps the fight going
for (const who of ['hirdman', 'helare'] as const) {
  const s = who === 'hirdman' ? scene(['krigare'], true) : scene(['helare', 'krigare']);
  s.dummy(1.5);
  const healer = who === 'hirdman' ? Object.values(s.area.players).find((x) => x.bot)! : s.p;
  const hurt = who === 'hirdman' ? s.p : s.party.players[1]!;
  const fh = s.inst.fighters[hurt.id]!;
  fh.max = 10_000_000;
  fh.hp = 1000;
  const mind = newMind('careful', () => 0.5);
  let healed = 0;
  for (let t = 0; t < SECS * 1000; t += 50) {
    s.party.now += 50;
    const before = fh.hp;
    if (who === 'helare') botStep(s.party.world, healer.id, mind, s.party.ctx(), 50);
    tick(s.party.world, 50, s.party.ctx());
    healed += Math.max(0, fh.hp - before);
  }
  console.log(`healing by ${who}: ${(healed / SECS).toFixed(1)} a second`);
}
