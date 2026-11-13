// The skill gap (DESIGN.md 5.4): on Medel playing well must matter. The same hero, the same seeds and the same (safe) lane, played by
// the careful bot, by the masher (every button when it is ready, at nothing, never out of a mark), by a careful bot that never
// leaves a mark, and by one that only ever presses button 1. On the gentle levels the masher must still win: a child is never
// locked out. Slow (whole runs), so it is a file of its own like the other band files.
import { describe, expect, it } from 'vitest';
import type { ClassId, RunLevel } from './index.ts';
import type { BotStyle } from './runbot.ts';
import { makeParty, playRun } from './runplay.ts';

const SEEDS = [1, 2, 3, 4, 5, 6];
const LIMIT = 60 * 60_000;
const yieldToRunner = (): Promise<void> => new Promise((r) => setImmediate(r));

interface Row {
  wins: number;
  /** Average minutes of the runs won. */
  mins: number;
  /** Runs in which a Sagoande was used (or the run ended on a wipe). */
  spirit: number;
  /** The share of the fight stops cleared that got a gold Runmärke. */
  gold: number;
  /** Runs in which a Sagoande went before the Mellanboss (in rows 1 to 4). */
  early: number;
}
const memo = new Map<string, Row>();

/** Six runs of one hero (with the Hirdmannen) through Draugkryptan. */
async function row(cls: ClassId, level: RunLevel, style: BotStyle, o: { noDodge?: boolean; slots?: number[]; kid?: boolean } = {}): Promise<Row> {
  const key = JSON.stringify([cls, level, style, o]);
  const had = memo.get(key);
  if (had) return had;
  const r: Row = { wins: 0, mins: 0, spirit: 0, gold: 0, early: 0 };
  let stops = 0;
  let golds = 0;
  for (const seed of SEEDS) {
    await yieldToRunner();
    const party = makeParty([cls], { style, seed, level: 3, lane: 'safe' });
    for (const mind of party.minds.values()) Object.assign(mind, o);
    const p = playRun(party, { seed, level, dungeon: 'draug' }, LIMIT);
    expect(['win', 'wipe']).toContain(p.outcome);
    if (p.outcome === 'win') {
      r.wins++;
      r.mins += p.winMs! / 60_000;
    }
    const ended = p.changes.find((c) => c.t === 'run' && c.ev === 'ended');
    if (p.outcome === 'wipe' || (ended && ended.t === 'run' && ended.ev === 'ended' && (ended.spiritUsed ?? 0) > 0)) r.spirit++;
    if (p.changes.some((c) => c.t === 'run' && c.ev === 'state' && !!c.run && c.run.spiritUsed > 0 && c.run.row <= 4)) r.early++;
    stops += p.stops.length;
    golds += p.stops.filter((s) => s.medal === 3).length;
  }
  r.mins /= Math.max(1, r.wins);
  r.gold = golds / Math.max(1, stops);
  memo.set(key, r);
  console.log(`${cls} level ${level} ${style}${o.noDodge ? ' noDodge' : ''}${o.slots ? ' slot 1 only' : ''}${o.kid ? ' kid' : ''}: ${r.wins}/${SEEDS.length} wins, ${r.mins.toFixed(1)} min, Sagoande in ${r.spirit} (before the Mellanboss in ${r.early}), gold ${Math.round(r.gold * 100)} %`);
  return r;
}

const T = { timeout: 600_000 };

describe('Medel: playing well matters (same hero, same seeds, same lane)', () => {
  for (const cls of ['krigare', 'magiker'] as ClassId[]) {
    it(`${cls}: the careful bot wins all six in 10 to 20 minutes and earns gold on at least 60 % of its fight stops`, T, async () => {
      const c = await row(cls, 2, 'careful');
      expect(c.wins).toBe(SEEDS.length);
      expect(c.mins).toBeGreaterThan(10);
      expect(c.mins).toBeLessThan(20);
      expect(c.gold).toBeGreaterThanOrEqual(0.6);
      expect(c.early).toBe(0);
    });

    it(`${cls}: the masher loses its Sagoande in at least half its runs, earns gold on at most 20 % of its stops, and is at least 25 % slower than the careful bot or does not win`, T, async () => {
      const c = await row(cls, 2, 'careful');
      const m = await row(cls, 2, 'masher');
      expect(m.spirit).toBeGreaterThanOrEqual(SEEDS.length / 2);
      // the packs are dangerous to a hero who does not look: the Sagoande goes before the Mellanboss in at least half the runs
      expect(m.early).toBeGreaterThanOrEqual(SEEDS.length / 2);
      expect(m.gold).toBeLessThanOrEqual(0.2);
      expect(m.wins <= SEEDS.length / 2 || m.mins >= c.mins * 1.25).toBe(true);
    });
  }

  for (const cls of ['krigare', 'magiker'] as ClassId[]) {
    it(`${cls}: an adult (the careful bot with a reaction time, missed presses and no perfect kill order) wins at least 5 of 6 in 12 to 25 minutes and needs a Sagoande in at most half its runs`, T, async () => {
      const a = await row(cls, 2, 'adult');
      expect(a.wins).toBeGreaterThanOrEqual(5);
      expect(a.mins).toBeGreaterThan(12);
      expect(a.mins).toBeLessThan(25);
      expect(a.spirit).toBeLessThanOrEqual(SEEDS.length / 2);
      expect(a.early).toBe(0);
    });

    it(`${cls}: a careful bot that never leaves a mark (and does not back away) wins at most 2 of 6`, T, async () => {
      expect((await row(cls, 2, 'careful', { noDodge: true })).wins).toBeLessThanOrEqual(2);
    });

    it(`${cls}: a bot that only presses button 1 (it dodges everything) is at least 35 % slower than the careful bot and earns gold on at most 30 % of its fight stops`, T, async () => {
      const c = await row(cls, 2, 'careful');
      const one = await row(cls, 2, 'careful', { slots: [0] });
      expect(one.wins === 0 || one.mins >= c.mins * 1.35).toBe(true);
      expect(one.gold).toBeLessThanOrEqual(0.3);
    });
  }
});

describe('the gentle levels: nobody is locked out', () => {
  for (const cls of ['krigare', 'magiker'] as ClassId[]) {
    it(`${cls}: on Lätt the masher wins at least 5 of 6`, T, async () => {
      expect((await row(cls, 1, 'masher')).wins).toBeGreaterThanOrEqual(5);
    });
    it(`${cls}: on Mycket lätt a seven-year-old masher wins every run`, T, async () => {
      expect((await row(cls, 0, 'masher', { kid: true })).wins).toBe(SEEDS.length);
    });
  }
});
