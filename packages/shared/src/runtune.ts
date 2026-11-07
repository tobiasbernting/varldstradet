// A tuning script for the runs (GAME2.md section 8): plays bot runs and prints the table of section 5.4.
//   node --experimental-transform-types packages/shared/src/runtune.ts [--level 0|1] [--style clumsy|careful] [--seeds 20] [--from 1]
// One row per party: wins, runs that ended on a wipe, Sagoandans used, minutes until the boss falls. Not part of the game.
import type { ClassId } from './saga.ts';
import { makeParty, playRun } from './runplay.ts';

const arg = (name: string, d: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const level = Number(arg('level', '1')) === 0 ? 0 : 1;
const style = arg('style', 'clumsy') === 'careful' ? 'careful' : 'clumsy';
const count = Number(arg('seeds', '20'));
const from = Number(arg('from', '1'));
const PARTIES: [string, ClassId[]][] = [
  ['ensam väktare', ['vaktare']],
  ['ensam helare', ['helare']],
  ['ensam krigare', ['krigare']],
  ['ensam magiker', ['magiker']],
  ['krigare + magiker', ['krigare', 'magiker']],
  ['väktare + helare', ['vaktare', 'helare']],
];

console.log(`level ${level} (${level === 0 ? 'Lätt' : 'Vanlig'}), ${style} bots, seeds ${from}..${from + count - 1}`);
for (const [label, classes] of PARTIES) {
  let wins = 0;
  let wipes = 0;
  let spirits = 0;
  const mins: number[] = [];
  const others: string[] = [];
  for (let seed = from; seed < from + count; seed++) {
    const party = makeParty(classes, { style, seed, level: 3 });
    const r = playRun(party, { seed, level });
    if (r.outcome === 'win') {
      wins++;
      mins.push(r.winMs! / 60_000);
    }
    if (r.outcome === 'wipe') wipes++;
    const ended = r.changes.find((c) => c.t === 'run' && c.ev === 'ended' && c.to === party.players[0]!.id);
    spirits += ended && ended.t === 'run' && ended.ev === 'ended' ? (ended.spiritUsed ?? 0) : 0;
    if (r.outcome !== 'win') others.push(`${seed}:${r.outcome}@${(r.ms / 60_000).toFixed(0)}`);
  }
  const avg = mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length);
  console.log(`${label.padEnd(20)} wins ${wins}/${count}  ended on wipe ${wipes}  Sagoandan used/run ${(spirits / count).toFixed(2)}  min avg ${avg.toFixed(1)} (min ${Math.min(...mins).toFixed(1)}, max ${Math.max(...mins).toFixed(1)})${others.length ? `  not won: ${others.join(' ')}` : ''}`);
}
