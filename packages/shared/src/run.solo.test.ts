// One hero (with the hired Hirdmannen) and a pair without a healer, played whole by the careful bot on Medel (DESIGN.md sections 5.4 and
// 5.6): Medel is pinned by the careful bot (the clumsy ones, the kids' proxies, are pinned on the gentle levels in run.latt.test.ts, and
// what playing badly costs on Medel in run.skill.test.ts). Apart from run.test.ts so they run beside it on the CI.
import { describe, expect, it } from 'vitest';
import { type ClassId } from './index.ts';
import { makeParty, playRun } from './runplay.ts';

const BOT_LIMIT = 60 * 60_000;
// [label, classes, minutes (low, high)]: the lone healer is the slow one (her damage is a Ljuspil)
const SOLO: [string, ClassId[], number, number][] = [
  ['ensam väktare', ['vaktare'], 10, 20],
  ['ensam helare', ['helare'], 15, 29],
  ['ensam krigare', ['krigare'], 10, 20],
  ['ensam magiker', ['magiker'], 10, 20],
  ['krigare + magiker', ['krigare', 'magiker'], 10, 20],
];

describe('the careful bot on Medel: one hero and the Hirdmannen always win, in 10 to 20 minutes', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6];
  for (const [label, classes, lo, hi] of SOLO) {
    it(`${label}: wins all ${SEEDS.length} with the Hirdmannen, in ${lo}-${hi} minutes`, { timeout: 240_000 }, async () => {
      let wins = 0;
      const mins: number[] = [];
      for (const seed of SEEDS) {
        // let the test runner report in between: whole runs in a row would starve its worker
        await new Promise((r) => setImmediate(r));
        const party = makeParty(classes, { style: 'careful', seed, level: 3 });
        const r = playRun(party, { seed, level: 2 }, BOT_LIMIT);
        expect(r.outcome).not.toBe('running');
        if (r.outcome === 'win') {
          wins++;
          mins.push(r.winMs! / 60_000);
        }
      }
      const avg = mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length);
      expect(wins).toBe(SEEDS.length);
      expect(avg).toBeGreaterThan(lo);
      expect(avg).toBeLessThan(hi);
    });
  }
});
