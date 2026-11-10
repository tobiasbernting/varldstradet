// The two hard levels played whole by a careful two-player party (DESIGN.md 5.7): Svår (3) is won about half to three quarters of the time,
// Extrem (4) one run in about four. The party is a Krigare and a Magiker (a tank in the party makes both levels easier: see the table in
// DESIGN.md). Apart from run.test.ts so they run beside it on the CI; sixteen capped seeds each.
import { describe, expect, it } from 'vitest';
import { AFFIX_IDS, T, generateRun } from './index.ts';
import { makeParty, playRun } from './runplay.ts';

const BOT_LIMIT = 60 * 60_000;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

describe('careful pairs on the hard levels', () => {
  for (const [level, lo, hi] of [
    [3, 8, 12],
    [4, 3, 6],
  ] as const) {
    it(`${T.runLevelName[level]} (level ${level}): krigare + magiker win between ${lo} and ${hi} of ${SEEDS.length}, and every run has its särdrag`, { timeout: 600_000 }, async () => {
      let wins = 0;
      for (const seed of SEEDS) {
        await new Promise((r) => setImmediate(r));
        const party = makeParty(['krigare', 'magiker'], { style: 'careful', seed, level: 3 });
        const r = playRun(party, { seed, level }, BOT_LIMIT);
        expect(['win', 'wipe']).toContain(r.outcome);
        if (r.outcome === 'win') wins++;
        expect(generateRun(seed, { boss: 'draug', level }).modifiers.filter((m) => AFFIX_IDS.includes(m))).toHaveLength(level === 3 ? 1 : 2);
      }
      expect(wins).toBeGreaterThanOrEqual(lo);
      expect(wins).toBeLessThanOrEqual(hi);
    });
  }
});
