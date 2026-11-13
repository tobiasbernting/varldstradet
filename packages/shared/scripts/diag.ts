// Tuning aid: one run, what hurt the first hero (marks, blows, falls) per stop.
//   node --experimental-transform-types packages/shared/scripts/diag.ts krigare careful 2 [seed] [nododge]
import { DUNGEON_IDS, runOf, type ClassId, type RunLevel, type BotStyle } from '../src/index.ts';
import { makeParty, step } from '../src/runplay.ts';
import { startRun } from '../src/runsim.ts';
const [cls, style, level, seed, nd] = process.argv.slice(2);
const party = makeParty([cls as ClassId], { style: style as BotStyle, seed: Number(seed ?? 1), lane: 'safe' });
if (nd) for (const m of party.minds.values()) m.noDodge = true;
void DUNGEON_IDS;
for (const p of party.players) p.saga!.cleared = [...DUNGEON_IDS];
startRun(party.world, party.players[0]!.id, { seed: Number(seed ?? 1), level: Number(level) as RunLevel, dungeon: (process.env.DUNGEON ?? 'draug') as 'draug' }, party.ctx());
const run = runOf(party.world)!;
const me = party.players[0]!.id;
let node = -1;
let s = { marks: 0, markDmg: 0, blows: 0, blowDmg: 0, falls: 0, healed: 0, t0: 0 };
const flush = (): void => {
  if (node >= 0) console.log(`${String(node).padStart(2)} ${run.plan.stops[node]!.kind.padEnd(8)} ${((run.elapsed - s.t0) / 1000).toFixed(0).padStart(4)}s  marks ${s.marks} (${s.markDmg})  blows ${s.blows} (${s.blowDmg})  healed ${s.healed}  falls ${s.falls}  medal ${run.medals[node] ?? '-'} spirit ${run.spirit}`);
  s = { marks: 0, markDmg: 0, blows: 0, blowDmg: 0, falls: 0, healed: 0, t0: run.elapsed };
};
for (let t = 0; t < 40 * 60_000 && run.phase !== 'ended'; t += 50) {
  if (run.node !== node) {
    flush();
    node = run.node;
  }
  const out: import('../src/protocol.ts').Change[] = [];
  step(party, true, out);
  for (const c of out) {
    if (c.t === 'hit' && c.on === me) {
      if (c.kind === 'heal') s.healed += c.n;
      else if (c.mark) (s.marks++, (s.markDmg += c.n));
      else if (c.kind === 'dmg' || c.kind === 'block') (s.blows++, (s.blowDmg += c.n));
    }
    if (c.t === 'toast' && c.to === me && c.text.includes('har fallit') && c.text.includes(party.players[0]!.name)) s.falls++;
  }
}
flush();
console.log(run.outcome, (run.elapsed / 60000).toFixed(1), 'min');
