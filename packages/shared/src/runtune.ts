// A tuning script for the runs (DESIGN.md sections 5.6 and 8): plays bot runs of the route and prints the table of section 5.4.
//   node --experimental-transform-types packages/shared/src/runtune.ts [--level 0..4] [--style clumsy|careful|kid7|masher] [--seeds 20] [--from 1]
//        [--dungeon draug] [--parties solo|duo|pair|fam|all] [--lane safe|random] [--limit 60]
// One row per party: wins, runs that ended on a wipe, Sagoandans used, minutes until the boss falls, and what the route held on
// average (fights, Vilosten). Not part of the game.
import { T } from './sv.ts';
import { DUNGEON_IDS, type ClassId, type DungeonId } from './saga.ts';
import { RUN_LEVELS, type RunLevel } from './run.ts';
import type { BotStyle } from './runbot.ts';
import { makeParty, playRun } from './runplay.ts';

const arg = (name: string, d: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const level = Math.min(4, Math.max(0, Math.floor(Number(arg('level', '2'))))) as RunLevel;
const style = (['careful', 'kid7', 'masher'].includes(arg('style', 'clumsy')) ? arg('style', 'clumsy') : 'clumsy') as BotStyle;
const count = Number(arg('seeds', '20'));
const from = Number(arg('from', '1'));
const dungeon = arg('dungeon', 'draug') as DungeonId;
if (!DUNGEON_IDS.includes(dungeon)) throw new Error(`--dungeon needs one of ${DUNGEON_IDS.join(' ')}`);
const which = arg('parties', 'all');
const lane = arg('lane', '') as '' | 'safe' | 'random';
const limitMin = Number(arg('limit', '60'));
const SOLO: [string, ClassId[]][] = [
  ['ensam väktare', ['vaktare']],
  ['ensam helare', ['helare']],
  ['ensam krigare', ['krigare']],
  ['ensam magiker', ['magiker']],
];
const DUO: [string, ClassId[]][] = [
  ['krigare + magiker', ['krigare', 'magiker']],
  ['väktare + helare', ['vaktare', 'helare']],
];
const PAIR: [string, ClassId[]][] = [
  ['väktare + krigare', ['vaktare', 'krigare']],
  ['helare + magiker', ['helare', 'magiker']],
  ['krigare + magiker', ['krigare', 'magiker']],
];
// try numbers without editing the table: --hp 1.6 --dmg 1.5 --warn 0.8 --bossHp 2 --mark 0.4 (this level only)
// the skill tests' bots: --nododge (plays its style but never leaves a mark), --slots 0 (only presses these buttons, e.g. 0 or 0,1)
const noDodge = process.argv.includes('--nododge');
const slots = arg('slots', '') === '' ? undefined : arg('slots', '').split(',').map(Number);
for (const k of ['hp', 'dmg', 'warn', 'seeds', 'bossHp', 'mark', 'markEvery'] as const) if (arg(k, '') !== '') RUN_LEVELS[level][k] = Number(arg(k, ''));
const only = arg('only', '');
const FAM: [string, ClassId[]][] = [
  ['väktare+helare+magiker', ['vaktare', 'helare', 'magiker']],
  ['fyra hjältar', ['vaktare', 'helare', 'krigare', 'magiker']],
];
const PARTIES0 = which === 'solo' ? SOLO : which === 'duo' ? DUO : which === 'pair' ? PAIR : which === 'fam' ? FAM : [...SOLO, ...DUO];
const PARTIES = only === '' ? PARTIES0 : PARTIES0.filter((_, i) => String(i) === only);

console.log(`${dungeon}, level ${level} (${T.runLevelName[level]}), ${style} bots${lane ? `, lane ${lane}` : ''}, seeds ${from}..${from + count - 1}`);
for (const [label, classes] of PARTIES) {
  let wins = 0;
  let wipes = 0;
  let spirits = 0;
  let fights = 0;
  let rests = 0;
  let spiritRuns = 0;
  const medals = [0, 0, 0];
  const mins: number[] = [];
  const others: string[] = [];
  const stopMs: Record<string, number[]> = {};
  for (let seed = from; seed < from + count; seed++) {
    const party = makeParty(classes, { style, seed, level: 3, ...(lane ? { lane } : {}) });
    // (the chapters before it are cleared, so it is the next one to run)
    for (const p of party.players) p.saga!.cleared = DUNGEON_IDS.slice(0, DUNGEON_IDS.indexOf(dungeon));
    for (const mind of party.minds.values()) {
      if (noDodge) mind.noDodge = true;
      if (slots) mind.slots = slots;
      if (process.argv.includes('--kid')) mind.kid = true;
    }
    const r = playRun(party, { seed, level, dungeon }, limitMin * 60_000);
    if (r.outcome === 'win') {
      wins++;
      mins.push(r.winMs! / 60_000);
    }
    if (r.outcome === 'wipe') wipes++;
    for (const st of r.stops) (stopMs[st.kind] ??= []).push(st.ms / 1000);
    const ended = r.changes.find((c) => c.t === 'run' && c.ev === 'ended' && c.to === party.players[0]!.id);
    if (ended && ended.t === 'run' && ended.ev === 'ended') {
      spirits += ended.spiritUsed ?? 0;
      if (ended.spiritUsed) spiritRuns++;
      (ended.medals ?? []).forEach((n, i) => (medals[i]! += n));
      fights += (ended.path ?? []).filter((k) => k === 'flock').length;
      rests += (ended.path ?? []).filter((k) => k === 'rest').length;
    }
    if (r.outcome !== 'win') others.push(`${seed}:${r.outcome}@${(r.ms / 60_000).toFixed(0)}`);
  }
  // --pars: the median seconds a stop of each kind took (STOP_PAR in run.ts is the careful bot's, times 1.6)
  if (process.argv.includes('--pars')) {
    const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    console.log(`  median s per stop: ${Object.entries(stopMs).map(([k, xs]) => `${k} ${med(xs).toFixed(0)} (x1.6 = ${(med(xs) * 1.6).toFixed(0)}, n ${xs.length})`).join('  ')}`);
  }
  const avg = mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length);
  console.log(
    `${label.padEnd(20)} wins ${wins}/${count}  wipe-ends ${wipes}  Sagoandan/run ${(spirits / count).toFixed(2)}  (in ${spiritRuns} runs)  gold ${Math.round((100 * medals[2]!) / Math.max(1, medals[0]! + medals[1]! + medals[2]!))}% silver ${Math.round((100 * medals[1]!) / Math.max(1, medals[0]! + medals[1]! + medals[2]!))}%  flocks ${(fights / count).toFixed(1)} vilor ${(rests / count).toFixed(1)}  min avg ${avg.toFixed(1)} (min ${Math.min(...mins).toFixed(1)}, max ${Math.max(...mins).toFixed(1)})${others.length ? `  not won: ${others.join(' ')}` : ''}`,
  );
}
