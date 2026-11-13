// The fight's rules as the HUD and the world need to read them, with nothing of the page in it (so it can be tested): when the
// spender's button glows and why, how the pip row looks, how a button's wait is shown (the reactions are outside the shared
// pause), which monster an interrupt should go for, and how much the screen may shake, freeze and flash under the settings.
import { CLASSES, GCD_MS, MOB_FLAG, PIP_MAX, SPELLS, SPEND_MUL, type ClassId, type SagaSnap } from '@varldstradet/shared';
import type { FxSetting } from './fxprefs.ts';

// ---------------------------------------------------------------------------------------------------------------- the spender

/** What the hero's spender (slot 1 and the big "Slå" button) is looking at. */
export interface SpendCtx {
  cls: ClassId;
  pips: number;
  /** The flags (`MOB_FLAG`) of the monster the spender would hit: the chosen one, else the nearest one fighting. 0 without one. */
  targetFlags: number;
  /** Väktare: a monster in the fight is under the hero's own Utmana!. */
  taunted: boolean;
  /** Helare: a hurt friend stands in the hero's own Läkekrets. */
  ringFriend: boolean;
}

/** Why the button glows: all the pips, a monster that sees stars, or the class's combo. */
export type GlowWhy = 'full' | 'open' | 'combo';
export interface SpendView {
  /** `empty`: no pip, the button is grey. `ready`: it works. `glow`: this is the right press now. */
  state: 'empty' | 'ready' | 'glow';
  why: GlowWhy | null;
  /** How many times as strong the press would be (`SPEND_MUL`). */
  mul: number;
}

/** Is the class's combo there to be used (the moment its spender is at its best, whatever the pips)? */
export function comboPrimed(c: SpendCtx): boolean {
  switch (c.cls) {
    case 'krigare':
      return !!(c.targetFlags & MOB_FLAG.dazed);
    case 'magiker':
      return !!(c.targetFlags & (MOB_FLAG.slowed | MOB_FLAG.dazed));
    case 'vaktare':
      return c.taunted;
    case 'helare':
      return c.ringFriend;
  }
}

/** The spender's button: grey at no pips, glowing at three, or at one or two when the target is open or primed for the combo. */
export function spendView(c: SpendCtx): SpendView {
  const pips = Math.max(0, Math.min(PIP_MAX, c.pips));
  const mul = SPEND_MUL[pips] ?? 0;
  if (pips < 1) return { state: 'empty', why: null, mul };
  if (pips >= PIP_MAX) return { state: 'glow', why: 'full', mul };
  if (c.targetFlags & MOB_FLAG.open) return { state: 'glow', why: 'open', mul };
  if (comboPrimed(c)) return { state: 'glow', why: 'combo', mul };
  return { state: 'ready', why: null, mul };
}

/** The button that sets the class's combo up (Stormsteg, Isspjut, Utmana!, Läkekrets). */
export const PRIMER: Record<ClassId, string> = { krigare: 'stormsteg', magiker: 'isspjut', vaktare: 'utmana', helare: 'lakekrets' };

/** Should the primer be pointed at: there are pips to spend, the combo is not set up yet, and the primer is ready? */
export function primerHint(c: SpendCtx, primerReady: boolean, fighting: boolean): boolean {
  return fighting && primerReady && c.pips >= 1 && !comboPrimed(c) && !(c.targetFlags & MOB_FLAG.open);
}

/** The pip row: which are filled, and which one has just come (it pops and sounds). */
export interface PipCell {
  on: boolean;
  pop: boolean;
}
export function pipCells(pips: number, before: number): PipCell[] {
  const n = Math.max(0, Math.min(PIP_MAX, pips));
  return Array.from({ length: PIP_MAX }, (_, i) => ({ on: i < n, pop: i < n && i >= before }));
}

/** The note of each pip as it fills, one step higher than the last (Hz: a major triad going up). */
export const PIP_NOTES: readonly number[] = [523, 659, 784];
/** The pips that came since the last look (their notes are played in order); none when the row emptied. */
export const newPips = (pips: number, before: number): number[] => {
  const out: number[] = [];
  for (let i = Math.max(0, before); i < Math.min(PIP_MAX, pips); i++) out.push(i);
  return out;
};

// ---------------------------------------------------------------------------------------------------------------- waits

export interface Wait {
  left: number;
  total: number;
  /** The wait is the shared pause, not the spell's own (drawn lighter, and never on a reaction). */
  shared: boolean;
}

/** Time left before a spell can go, and how long that wait is in all. A reaction (`offGcd`) never waits for the shared pause. */
export function waitOf(spell: string, readyAt: number, gcdUntil: number, now: number): Wait {
  const sp = SPELLS[spell];
  const own = Math.max(0, readyAt - now);
  const gcd = sp?.offGcd ? 0 : Math.max(0, gcdUntil - now);
  return own >= gcd ? { left: own, total: sp?.cd ?? 1, shared: false } : { left: gcd, total: GCD_MS, shared: true };
}

/** Is this one of the class's reactions (outside the shared pause)? */
export const isReaction = (spell: string): boolean => !!SPELLS[spell]?.offGcd;

/** Spells that stop a cast (Sköldslag, Stormsteg, Isspjut). */
export const INTERRUPT_KINDS: ReadonlySet<string> = new Set(['bash', 'charge', 'lance']);
export const isInterrupt = (spell: string): boolean => INTERRUPT_KINDS.has(SPELLS[spell]?.kind ?? '');
/** The class's interrupt, if it has one (the Helare has none). */
export const interruptOf = (cls: ClassId): string | null => CLASSES[cls].spells.find(isInterrupt) ?? null;

/**
 * The monster an interrupt should go for: one that is casting something stoppable and stands within `range` tiles, the one whose
 * cast lands first. `wanted` (the chosen monster) wins if it is one of them. Null when there is nothing to stop in reach.
 */
export function castToStop(snap: Pick<SagaSnap, 'c'> | null, tilesTo: (id: number) => number | null, range: number, now: number, wanted?: number | null): number | null {
  let best: number | null = null;
  let bestAt = Infinity;
  for (const [ids, c] of Object.entries(snap?.c ?? {})) {
    const id = Number(ids);
    if (!c[3] || c[2] <= now) continue;
    const d = tilesTo(id);
    if (d === null || d > range + 0.6) continue;
    if (id === wanted) return id;
    if (c[2] < bestAt) {
      bestAt = c[2];
      best = id;
    }
  }
  return best;
}

/** How far a cast has come, 0..1 (the circle over the caster). */
export const castFill = (c: readonly [string, number, number, 0 | 1], now: number): number => Math.max(0, Math.min(1, (now - c[1]) / Math.max(1, c[2] - c[1])));

// ---------------------------------------------------------------------------------------------------------------- juice

/** What the settings let the fight do to the screen. */
export interface Juice {
  /** Camera shake, 0..1 of what is asked for. */
  shake: number;
  /** Hit-stop: how much of the asked freeze is kept (0: none). */
  stop: number;
  /** White flash and squash on a hit monster. */
  flash: boolean;
  squash: boolean;
  /** A red ring at the screen's edge for a mark hit on the hero. */
  edge: boolean;
  /** Loops (the glow's pulse, the stars turning). */
  loops: boolean;
  /** How many of the asked particles are made (0..1). */
  particles: number;
}

/** The settings as the fight's juice: the shake setting, effects Alla / Mindre / Av, calm screen (which is also reduced motion). */
export function juiceOf(p: { shake: boolean; calm: boolean }, fx: FxSetting): Juice {
  const calm = p.calm;
  return {
    shake: !p.shake || calm ? 0 : fx === 'full' ? 1 : fx === 'reduced' ? 0.5 : 0,
    stop: calm || fx === 'off' ? 0 : fx === 'reduced' ? 0.6 : 1,
    flash: !calm && fx !== 'off',
    squash: !calm,
    edge: !calm,
    loops: !calm,
    particles: fx === 'off' ? 0 : fx === 'reduced' || calm ? 0.5 : 1,
  };
}

/** The moments that freeze the fight for a blink (ms, before the settings). */
export const HIT_STOP = { spend: 80, kill: 60, slam: 90 } as const;
export const hitStopMs = (what: keyof typeof HIT_STOP, j: Juice): number => Math.round(HIT_STOP[what] * j.stop);
/** How hard each moment shakes the camera (LittleJS's cameraShake strength, before the settings). */
export const SHAKE = { spend: 0.3, kill: 0.22, slam: 0.45, mark: 0.35 } as const;
export const shakeOf = (what: keyof typeof SHAKE, j: Juice): number => SHAKE[what] * j.shake;
/** Particles of a monster's last poof, by the pips of the blow that felled it (within the looks' cap of 8 a body). */
export const poofCount = (j: Juice, big: boolean): number => Math.round((big ? 8 : 5) * j.particles);

/** The class a spender's number gets, by its pips ("BIG" at three). */
export const spendClass = (pips: number): string => (pips >= PIP_MAX ? 'sp3' : pips === 2 ? 'sp2' : pips === 1 ? 'sp1' : '');
