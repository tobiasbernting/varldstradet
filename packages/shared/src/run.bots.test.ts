// Whole runs played by bot parties (DESIGN.md section 5.6): families of one to four heroes, careful and clumsy, through the route of
// Draugkryptan to the boss. Kept apart from run.test.ts so the two run side by side on the CI (each is a minute or so of simulated runs);
// run.solo.test.ts (Vanlig) and run.latt.test.ts (Lätt) have the one-hero tables.
import { describe, expect, it } from 'vitest';
import { DUNGEONS, DUNGEON_IDS, RUN_SEEDS, generateRun, mulberry32, offerFor, readRun, runOf, type ClassId } from './index.ts';
import { makeParty, playRun } from './runplay.ts';

/** The longest a bot run may take (run time): the soft 30 minutes are a target, a route of ten stops may run past them with a clumsy party. */
const BOT_LIMIT = 60 * 60_000;
/** Lets the test runner report in between whole runs (a worker that never does gets a timeout from the runner on a busy machine). */
const yieldToRunner = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('bot parties play whole runs', () => {
  // [label, classes, careful minutes (low, high), clumsy minutes (low, high)]: the ranges are the measured averages of DESIGN.md
  // section 5.6 with a third on either side; the pair of a tank and a healer has no one to hurt anything (no follower), so it is the slow one
  const FAMILIES: [string, ClassId[], [number, number], [number, number]][] = [
    ['en spelare + Hirdmannen', ['krigare'], [9, 18], [20, 36]],
    ['två spelare', ['vaktare', 'helare'], [17, 32], [34, 58]],
    ['tre spelare', ['vaktare', 'helare', 'magiker'], [13, 26], [28, 46]],
    ['fyra spelare', ['vaktare', 'helare', 'krigare', 'magiker'], [11, 22], [24, 41]],
  ];
  const rows: string[] = [];
  const SEEDS = [1, 2, 3];

  for (const [label, classes, careful, clumsy] of FAMILIES) {
    for (const style of ['careful', 'clumsy'] as const) {
      it(`${label}, ${style}: finishes inside the limit (${SEEDS.length} runs)`, { timeout: 120_000 }, async () => {
        const mins: number[] = [];
        let wins = 0;
        for (const seed of SEEDS) {
          await yieldToRunner();
          const party = makeParty(classes, { style, seed, level: 3 });
          const r = playRun(party, { seed }, BOT_LIMIT);
          // nothing is ever stuck: every run ends, in a win or a wipe, inside the limit
          expect(['win', 'wipe']).toContain(r.outcome);
          expect(r.ms).toBeLessThan(BOT_LIMIT);
          if (r.outcome === 'win') {
            wins++;
            mins.push(r.winMs! / 60_000);
            for (const p of party.players) {
              expect(readRun(p).wins).toBe(1);
              expect(readRun(p).seeds).toBeGreaterThan(RUN_SEEDS.bossFirst);
              expect(p.saga!.cleared).toContain('draug');
              expect(p.area).toBe('farm');
            }
          }
        }
        // the careful bots always win; the clumsy ones (the kids) win at least two of three
        if (style === 'careful') expect(wins).toBe(SEEDS.length);
        else expect(wins).toBeGreaterThanOrEqual(2);
        const avg = mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length);
        rows.push(`${label.padEnd(24)} ${style.padEnd(8)} ${wins}/${SEEDS.length} wins   ${avg.toFixed(1).padStart(5)} min (min ${Math.min(...mins).toFixed(1)}, max ${Math.max(...mins).toFixed(1)})`);
        const [lo, hi] = style === 'careful' ? careful : clumsy;
        expect(avg).toBeGreaterThan(lo);
        expect(avg).toBeLessThan(hi);
      });
    }
  }

  it('prints the bot minutes per run', () => {
    // eslint-disable-next-line no-console
    console.log(`\nBot minutes until the boss falls (level 3, starter set, Draugkryptan, Vanlig):\n${rows.join('\n')}\n`);
    expect(rows.length).toBe(FAMILIES.length * 2);
  });

  it('a run is different every time: three runs of one chapter have different routes, packs and runor offers', { timeout: 120_000 }, async () => {
    const routes = new Set<string>();
    const stops = new Set<string>();
    const offers = new Set<string>();
    for (const seed of [11, 12, 13]) {
      await yieldToRunner();
      const party = makeParty(['vaktare', 'helare', 'magiker'], { seed });
      const r = playRun(party, { seed }, BOT_LIMIT);
      expect(r.outcome).toBe('win');
      const plan = generateRun(seed, { boss: 'draug' });
      routes.add(plan.route.nodes.map((n) => `${n.kind[0]}${n.next.join('.')}`).join('>'));
      stops.add(plan.stops.map((z) => `${z.kind[0]}${z.layout ?? ''}${z.flipX ? 'x' : ''}${z.flipY ? 'y' : ''}${z.def.rooms.length}`).join('>'));
      offers.add(JSON.stringify(offerFor(mulberry32(seed), { cls: 'magiker', source: 'flock', held: [] }).cards));
      void runOf;
    }
    expect(routes.size).toBe(3);
    expect(stops.size).toBe(3);
    expect(offers.size).toBe(3);
  });

  it('every dungeon can be run through by the careful bot: the route, the Mellanboss and the boss of each chapter', { timeout: 120_000 }, async () => {
    for (const [i, boss] of DUNGEON_IDS.entries()) {
      await yieldToRunner();
      const party = makeParty(['krigare'], { style: 'careful', seed: 4, level: 3 });
      // (the chapters before it are cleared, so it is the next one to run)
      party.players[0]!.saga!.cleared = DUNGEON_IDS.slice(0, i);
      const r = playRun(party, { seed: 4, dungeon: boss }, BOT_LIMIT);
      expect(r.outcome, `${DUNGEONS[boss].name}: ${r.outcome} after ${(r.ms / 60_000).toFixed(0)} min`).not.toBe('running');
      expect(r.ms).toBeLessThan(BOT_LIMIT);
    }
  });
});
