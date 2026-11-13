// The fight as the HUD reads it: when the spender glows, how the pip row looks, how a wait is shown for a reaction, which cast
// an interrupt goes for, and what the settings let the juice do.
import { describe, expect, it } from 'vitest';
import { CLASSES, CLASS_IDS, GCD_MS, MOB_FLAG, SPELLS } from '@varldstradet/shared';
import { HIT_STOP, PIP_NOTES, PRIMER, castFill, castToStop, comboPrimed, hitStopMs, interruptOf, isReaction, juiceOf, newPips, pipCells, poofCount, primerHint, shakeOf, spendClass, spendView, waitOf, type SpendCtx } from './fight.ts';

const ctx = (o: Partial<SpendCtx> = {}): SpendCtx => ({ cls: 'krigare', pips: 0, targetFlags: 0, taunted: false, ringFriend: false, ...o });

describe('the spender: grey, ready or glowing', () => {
  it('is empty without a pip, whatever the target', () => {
    expect(spendView(ctx()).state).toBe('empty');
    expect(spendView(ctx({ targetFlags: MOB_FLAG.open | MOB_FLAG.dazed })).state).toBe('empty');
  });
  it('is ready (no glow) at one or two pips on a plain target', () => {
    expect(spendView(ctx({ pips: 1 }))).toEqual({ state: 'ready', why: null, mul: 1 });
    expect(spendView(ctx({ pips: 2 }))).toEqual({ state: 'ready', why: null, mul: 2.2 });
  });
  it('glows at three pips for every class', () => {
    for (const cls of CLASS_IDS) expect(spendView(ctx({ cls, pips: 3 }))).toEqual({ state: 'glow', why: 'full', mul: 4 });
  });
  it('glows at one pip on a monster that sees stars (Öppning)', () => {
    for (const cls of CLASS_IDS) expect(spendView(ctx({ cls, pips: 1, targetFlags: MOB_FLAG.open })).why).toBe('open');
  });
  it('glows at one pip when the class combo is primed, and only for that class', () => {
    expect(spendView(ctx({ cls: 'krigare', pips: 1, targetFlags: MOB_FLAG.dazed })).why).toBe('combo');
    expect(spendView(ctx({ cls: 'krigare', pips: 1, targetFlags: MOB_FLAG.slowed })).state).toBe('ready');
    expect(spendView(ctx({ cls: 'magiker', pips: 1, targetFlags: MOB_FLAG.slowed })).why).toBe('combo');
    expect(spendView(ctx({ cls: 'magiker', pips: 2, targetFlags: MOB_FLAG.dazed })).why).toBe('combo');
    expect(spendView(ctx({ cls: 'vaktare', pips: 1, taunted: true })).why).toBe('combo');
    expect(spendView(ctx({ cls: 'vaktare', pips: 1, targetFlags: MOB_FLAG.dazed })).state).toBe('ready');
    expect(spendView(ctx({ cls: 'helare', pips: 1, ringFriend: true })).why).toBe('combo');
    expect(spendView(ctx({ cls: 'helare', pips: 1, taunted: true })).state).toBe('ready');
  });
  it('a shielded or taunted flag alone primes nothing for the Krigare', () => {
    expect(comboPrimed(ctx({ targetFlags: MOB_FLAG.shielded | MOB_FLAG.taunted }))).toBe(false);
  });
});

describe('the primer', () => {
  it('is one of the class buttons, never the spender', () => {
    for (const cls of CLASS_IDS) {
      expect(CLASSES[cls].spells.slice(1)).toContain(PRIMER[cls]);
    }
  });
  it('is pointed at only in a fight, with pips, when ready and the combo is not there yet', () => {
    expect(primerHint(ctx({ pips: 1 }), true, true)).toBe(true);
    expect(primerHint(ctx({ pips: 0 }), true, true)).toBe(false);
    expect(primerHint(ctx({ pips: 1 }), false, true)).toBe(false);
    expect(primerHint(ctx({ pips: 1 }), true, false)).toBe(false);
    expect(primerHint(ctx({ pips: 1, targetFlags: MOB_FLAG.dazed }), true, true)).toBe(false);
    expect(primerHint(ctx({ pips: 1, targetFlags: MOB_FLAG.open }), true, true)).toBe(false);
  });
});

describe('the pip row', () => {
  it('fills from the left and pops only the new ones', () => {
    expect(pipCells(0, 0)).toEqual([{ on: false, pop: false }, { on: false, pop: false }, { on: false, pop: false }]);
    expect(pipCells(2, 1)).toEqual([{ on: true, pop: false }, { on: true, pop: true }, { on: false, pop: false }]);
    expect(pipCells(3, 0).every((c) => c.on && c.pop)).toBe(true);
    expect(pipCells(0, 3).some((c) => c.on || c.pop)).toBe(false);
    expect(pipCells(7, 3).filter((c) => c.on)).toHaveLength(3);
  });
  it('plays one note for each new pip, each higher than the last', () => {
    expect(newPips(1, 0)).toEqual([0]);
    expect(newPips(3, 1)).toEqual([1, 2]);
    expect(newPips(0, 3)).toEqual([]);
    expect(newPips(2, 2)).toEqual([]);
    expect(PIP_NOTES).toHaveLength(3);
    expect(PIP_NOTES[0]! < PIP_NOTES[1]! && PIP_NOTES[1]! < PIP_NOTES[2]!).toBe(true);
  });
  it('names the number by its pips', () => {
    expect([0, 1, 2, 3].map(spendClass)).toEqual(['', 'sp1', 'sp2', 'sp3']);
  });
});

describe('waits: the shared pause and the reactions outside it', () => {
  const now = 10_000;
  it('the reactions are Sköldslag, Sköldmur, Stormsteg, Isspjut and Blink', () => {
    expect(Object.keys(SPELLS).filter(isReaction).sort()).toEqual(['blink', 'isspjut', 'skoldmur', 'skoldslag', 'stormsteg']);
  });
  it('a ready spell inside the pause waits for the pause, marked as shared', () => {
    expect(waitOf('virvelvind', 0, now + 600, now)).toEqual({ left: 600, total: GCD_MS, shared: true });
  });
  it('a reaction never shows the shared pause', () => {
    for (const id of ['skoldslag', 'stormsteg', 'isspjut', 'blink', 'skoldmur']) expect(waitOf(id, 0, now + 600, now)).toEqual({ left: 0, total: SPELLS[id]!.cd, shared: false });
  });
  it('a reaction still shows its own cooldown', () => {
    expect(waitOf('stormsteg', now + 4000, now + 600, now)).toEqual({ left: 4000, total: SPELLS.stormsteg!.cd, shared: false });
  });
  it('the longer of the two waits wins', () => {
    expect(waitOf('virvelvind', now + 3000, now + 600, now).shared).toBe(false);
    expect(waitOf('virvelvind', now + 200, now + 600, now).shared).toBe(true);
  });
});

describe('interrupts', () => {
  const now = 5000;
  const snap = { c: { 7: ['heal', 4000, 6500, 1], 8: ['shot', 4500, 6000, 1], 9: ['slam', 4000, 5500, 0] } as Record<number, [string, number, number, 0 | 1]> };
  const at = (d: Record<number, number>) => (id: number) => d[id] ?? null;
  it('every class but the Helare has one', () => {
    expect(interruptOf('krigare')).toBe('stormsteg');
    expect(interruptOf('vaktare')).toBe('skoldslag');
    expect(interruptOf('magiker')).toBe('isspjut');
    expect(interruptOf('helare')).toBeNull();
  });
  it('goes for the stoppable cast in reach that lands first', () => {
    expect(castToStop(snap, at({ 7: 3, 8: 3, 9: 1 }), 7, now)).toBe(8);
  });
  it('never for a cast that cannot be stopped, is out of reach or has landed', () => {
    expect(castToStop(snap, at({ 9: 1 }), 7, now)).toBeNull();
    expect(castToStop(snap, at({ 7: 9, 8: 12 }), 1.8, now)).toBeNull();
    expect(castToStop(snap, at({ 7: 1, 8: 1 }), 7, 7000)).toBeNull();
    expect(castToStop(null, at({}), 7, now)).toBeNull();
  });
  it('keeps the chosen monster when it is one of them', () => {
    expect(castToStop(snap, at({ 7: 3, 8: 3 }), 7, now, 7)).toBe(7);
  });
  it('a cast fills from its start to its landing', () => {
    expect(castFill(['heal', 1000, 3000, 1], 1000)).toBe(0);
    expect(castFill(['heal', 1000, 3000, 1], 2000)).toBe(0.5);
    expect(castFill(['heal', 1000, 3000, 1], 9000)).toBe(1);
  });
});

describe('juice obeys the settings', () => {
  const on = { shake: true, calm: false };
  it('everything at full with the defaults', () => {
    const j = juiceOf(on, 'full');
    expect(j).toEqual({ shake: 1, stop: 1, flash: true, squash: true, edge: true, loops: true, particles: 1 });
    expect(hitStopMs('spend', j)).toBe(HIT_STOP.spend);
    expect(shakeOf('spend', j)).toBeGreaterThan(0);
  });
  it('hit-stop stays within 60 to 90 ms at full', () => {
    const j = juiceOf(on, 'full');
    for (const k of ['spend', 'kill', 'slam'] as const) {
      expect(hitStopMs(k, j)).toBeGreaterThanOrEqual(60);
      expect(hitStopMs(k, j)).toBeLessThanOrEqual(90);
    }
  });
  it('the shake setting off: no shake, the rest stays', () => {
    const j = juiceOf({ shake: false, calm: false }, 'full');
    expect(shakeOf('kill', j)).toBe(0);
    expect(shakeOf('mark', j)).toBe(0);
    expect(hitStopMs('spend', j)).toBe(HIT_STOP.spend);
    expect(j.flash).toBe(true);
  });
  it('calm screen: no shake, no hit-stop, no flash, no squash, no edge ring, no loops', () => {
    const j = juiceOf({ shake: true, calm: true }, 'full');
    expect(j).toMatchObject({ shake: 0, stop: 0, flash: false, squash: false, edge: false, loops: false });
    expect(hitStopMs('slam', j)).toBe(0);
  });
  it('effects Mindre: half the shake and particles, a shorter freeze', () => {
    const j = juiceOf(on, 'reduced');
    expect(j.shake).toBe(0.5);
    expect(j.particles).toBe(0.5);
    expect(hitStopMs('spend', j)).toBeLessThan(HIT_STOP.spend);
    expect(hitStopMs('spend', j)).toBeGreaterThan(0);
  });
  it('effects Av: no shake, no freeze, no flash, no particles', () => {
    const j = juiceOf(on, 'off');
    expect(j).toMatchObject({ shake: 0, stop: 0, flash: false, particles: 0 });
    expect(poofCount(j, true)).toBe(0);
  });
  it('a kill poof stays within the cap of 8 particles a body', () => {
    expect(poofCount(juiceOf(on, 'full'), true)).toBe(8);
    expect(poofCount(juiceOf(on, 'full'), false)).toBeLessThanOrEqual(8);
    expect(poofCount(juiceOf(on, 'reduced'), true)).toBeLessThanOrEqual(4);
  });
});
