// One hero (with the hired Hirdmannen) and a pair without a healer, played whole by the clumsy bot on Vanlig and on Lätt (GAME2.md sections
// 5.4 and 5.6): the kids' proxy. The bot tables of the route are in GAME2.md; these keep them from slipping. Apart from run.test.ts so they
// run beside it on the CI.
import { describe, expect, it } from 'vitest';
import { readRun, unlocksOf, type ClassId } from './index.ts';
import { makeParty, playRun } from './runplay.ts';

const BOT_LIMIT = 60 * 60_000;
const SOLO: [string, ClassId[]][] = [
  ['ensam väktare', ['vaktare']],
  ['ensam helare', ['helare']],
  ['ensam krigare', ['krigare']],
  ['ensam magiker', ['magiker']],
  ['krigare + magiker', ['krigare', 'magiker']],
];

describe('the clumsy bot on Vanlig (the kids: GAME2.md 5.4 wants a win in at least 60 % of the runs)', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6];
  for (const [label, classes] of SOLO) {
    it(`${label}, no longhouse: wins at least 5 of ${SEEDS.length} with the Hirdmannen (if it needs one), in 20-42 minutes`, { timeout: 120_000 }, async () => {
      let wins = 0;
      const mins: number[] = [];
      for (const seed of SEEDS) {
        // let the test runner report in between: whole runs in a row would starve its worker
        await new Promise((r) => setImmediate(r));
        const party = makeParty(classes, { style: 'clumsy', seed, level: 3 });
        const r = playRun(party, { seed }, BOT_LIMIT);
        expect(unlocksOf(party.world).longhall).toBe(false);
        expect(r.outcome).not.toBe('running');
        if (r.outcome === 'win') {
          wins++;
          mins.push(r.winMs! / 60_000);
        }
      }
      const avg = mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length);
      expect(wins).toBeGreaterThanOrEqual(5);
      expect(avg).toBeGreaterThan(20);
      expect(avg).toBeLessThan(42);
    });
  }
});

describe('the clumsy bot on Lätt (GAME2.md 5.4: at least 95 % won, none ends on a wipe)', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6];
  for (const [label, classes] of SOLO) {
    it(`${label}, Lätt: wins all ${SEEDS.length} runs, none ends on a wipe, in 14-34 minutes`, { timeout: 120_000 }, async () => {
      let wins = 0;
      const mins: number[] = [];
      for (const seed of SEEDS) {
        await new Promise((r) => setImmediate(r));
        const party = makeParty(classes, { style: 'clumsy', seed, level: 3 });
        const r = playRun(party, { seed, level: 0 }, BOT_LIMIT);
        expect(r.outcome).not.toBe('wipe');
        for (const p of party.players) expect(readRun(p).wipes).toBe(0);
        if (r.outcome === 'win') {
          wins++;
          mins.push(r.winMs! / 60_000);
        }
      }
      expect(wins / SEEDS.length).toBeGreaterThanOrEqual(0.95);
      const avg = mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length);
      expect(avg).toBeGreaterThan(14);
      expect(avg).toBeLessThan(34);
    });
  }
});
