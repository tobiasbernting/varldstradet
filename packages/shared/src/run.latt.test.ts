// One hero (with the hired Hirdmannen) and a pair without a healer, played whole by the kid bots on Mycket lätt (level 0, the 7-year-old) and Lätt
// (level 1, the clumsy bot) (GAME2.md sections 5.4, 5.6 and 5.7). Apart from run.test.ts so they run beside it on the CI (run.solo.test.ts has Medel).
import { describe, expect, it } from 'vitest';
import { T, readRun, type ClassId } from './index.ts';
import { makeParty, playRun } from './runplay.ts';

const BOT_LIMIT = 60 * 60_000;
const SOLO: [string, ClassId[]][] = [
  ['ensam väktare', ['vaktare']],
  ['ensam helare', ['helare']],
  ['ensam krigare', ['krigare']],
  ['ensam magiker', ['magiker']],
  ['krigare + magiker', ['krigare', 'magiker']],
];

// [level, the bot that plays it, the minutes the average win may take (low, high)]
const LEVELS: [0 | 1, 'kid7' | 'clumsy', number, number][] = [
  [0, 'kid7', 14, 40],
  [1, 'clumsy', 14, 34],
];

for (const [level, style, lo, hi] of LEVELS) {
  describe(`the ${style} bot on level ${level} ${T.runLevelName[level]} (GAME2.md 5.7: at least 95 % won, none ends on a wipe)`, () => {
    const SEEDS = [1, 2, 3, 4, 5, 6];
    for (const [label, classes] of SOLO) {
      it(`${label}: wins all ${SEEDS.length} runs, none ends on a wipe, in ${lo}-${hi} minutes`, { timeout: 150_000 }, async () => {
        let wins = 0;
        const mins: number[] = [];
        for (const seed of SEEDS) {
          await new Promise((r) => setImmediate(r));
          const party = makeParty(classes, { style, seed, level: 3 });
          const r = playRun(party, { seed, level }, BOT_LIMIT);
          expect(r.outcome).not.toBe('wipe');
          for (const p of party.players) expect(readRun(p).wipes).toBe(0);
          if (r.outcome === 'win') {
            wins++;
            mins.push(r.winMs! / 60_000);
          }
        }
        expect(wins / SEEDS.length).toBeGreaterThanOrEqual(0.95);
        const avg = mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length);
        expect(avg).toBeGreaterThan(lo);
        expect(avg).toBeLessThan(hi);
      });
    }
  });
}
