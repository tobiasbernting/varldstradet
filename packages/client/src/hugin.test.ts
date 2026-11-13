// Hugin's tips: the registry (every tip has a picture and one sentence for every class) and the queue (one at a time, once
// each, held back by a mark about to land, a boss that has just woken and an open window, with a breath between two).
import { describe, expect, it } from 'vitest';
import { CLASS_IDS } from '@varldstradet/shared';
import { HUGIN, TIPS, TipQueue, tipFor, type Guards, type TipStore } from './hugin.ts';

const free: Guards = { markSoon: false, bossYoung: false, windowOpen: false };
const store = (): TipStore & { ids: Set<string> } => {
  const ids = new Set<string>();
  return { ids, seen: (id) => ids.has(id), mark: (id) => void ids.add(id) };
};

describe('the registry', () => {
  it('covers what the fight has now', () => {
    expect(TIPS.map((t) => t.id)).toEqual(['menu', 'auto', 'pips3', 'combo', 'interrupt', 'open', 'shield', 'dunk', 'mark', 'skull', 'orb', 'ring', 'samslag', 'medal', 'wipe', 'star', 'horn', 'dish', 'weak', 'parry', 'near', 'ambush']);
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
  });
  it('every tip has one picture and one short sentence with nothing left to fill in, for every class and for none', () => {
    for (const cls of [...CLASS_IDS, null])
      for (const t of TIPS) {
        const tip = tipFor(t.id, cls)!;
        expect(tip.pic.length).toBeGreaterThan(0);
        expect(tip.text.trim().length).toBeGreaterThan(10);
        expect(tip.text.length).toBeLessThanOrEqual(130);
        expect(tip.text).not.toMatch(/[{}]/);
      }
  });
  it('fills in the moment (a number, two names)', () => {
    expect(tipFor('mark', 'krigare', { n: 48 })!.text).toContain('48');
    expect(tipFor('samslag', 'krigare', { a: 'Ada', b: 'Bo' })!.text).toContain('Ada och Bo');
  });
  it('speaks of the class: its pips, its spender, its interrupt', () => {
    expect(tipFor('pips3', 'magiker')!.text).toContain('Runsmäll');
    expect(tipFor('pips3', 'krigare')!.text).toContain('Glöd');
    expect(tipFor('interrupt', 'vaktare')!.text).toContain('Sköldslag');
    expect(tipFor('interrupt', 'helare')!.text).not.toContain('Avbryt med');
  });
  it('an unknown tip is nothing', () => {
    expect(tipFor('nope', 'krigare')).toBeNull();
  });
});

describe('the queue', () => {
  it('shows one tip at a time, in the order they were offered', () => {
    const q = new TipQueue(store(), () => true);
    expect(q.offer('auto', 0)).toBe(true);
    expect(q.offer('pips3', 10)).toBe(true);
    expect(q.next(20, free)?.id).toBe('auto');
    expect(q.next(30, free)).toBeNull(); // one is up
    expect(q.current?.id).toBe('auto');
    q.close(1000);
    expect(q.next(1000 + HUGIN.gapMs - 1, free)).toBeNull(); // a breath between two
    expect(q.next(1000 + HUGIN.gapMs, free)?.id).toBe('pips3');
  });
  it('shows a tip once on a device, however quickly it was thanked', () => {
    const s = store();
    const q = new TipQueue(s, () => true);
    q.offer('auto', 0);
    q.next(0, free);
    expect(s.ids.has('auto')).toBe(true);
    q.close(10);
    expect(q.offer('auto', 5000)).toBe(false);
    // and a new queue on the same device knows it too
    expect(new TipQueue(s, () => true).offer('auto', 0)).toBe(false);
  });
  it('does not take the same tip twice while it waits or shows, nor an unknown one', () => {
    const q = new TipQueue(store(), () => true);
    expect(q.offer('open', 0)).toBe(true);
    expect(q.offer('open', 1)).toBe(false);
    expect(q.offer('what', 1)).toBe(false);
    q.next(2, free);
    expect(q.offer('open', 3)).toBe(false);
    expect(q.pending).toBe(0);
  });
  it('waits while a mark is about to land, a boss has just woken or a window is open', () => {
    const q = new TipQueue(store(), () => true);
    q.offer('ring', 0);
    expect(q.next(100, { ...free, markSoon: true })).toBeNull();
    expect(q.next(200, { ...free, bossYoung: true })).toBeNull();
    expect(q.next(300, { ...free, windowOpen: true })).toBeNull();
    expect(q.current).toBeNull();
    expect(q.next(400, free)?.id).toBe('ring');
  });
  it('carries the moment with the tip', () => {
    const q = new TipQueue(store(), () => true);
    q.offer('mark', 0, { n: 63 });
    expect(q.next(1, free)).toEqual({ id: 'mark', vars: { n: 63 } });
  });
  it('stays 8 seconds unless thanked', () => {
    const q = new TipQueue(store(), () => true);
    q.offer('auto', 0);
    q.next(100, free);
    expect(q.due(100 + HUGIN.stayMs - 1)).toBe(false);
    expect(q.due(100 + HUGIN.stayMs)).toBe(true);
    q.close(100 + HUGIN.stayMs);
    expect(q.due(99999)).toBe(false);
    expect(HUGIN.stayMs).toBe(8000);
  });
  it('drops a tip whose moment passed long ago without marking it seen, so it can come again', () => {
    const s = store();
    const q = new TipQueue(s, () => true);
    q.offer('orb', 0);
    expect(q.next(HUGIN.staleMs + 1, free)).toBeNull();
    expect(s.ids.has('orb')).toBe(false);
    expect(q.offer('orb', HUGIN.staleMs + 2)).toBe(true);
  });
  it('turned off: takes nothing and shows nothing, and nothing is marked seen', () => {
    const s = store();
    let on = false;
    const q = new TipQueue(s, () => on);
    expect(q.offer('auto', 0)).toBe(false);
    on = true;
    expect(q.offer('auto', 1)).toBe(true);
    on = false;
    expect(q.next(2, free)).toBeNull();
    expect(s.ids.size).toBe(0);
    q.clear();
    expect(q.pending).toBe(0);
  });
});
