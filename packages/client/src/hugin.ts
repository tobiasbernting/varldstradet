// Hugin, the raven who teaches: the tips he knows and the order he gives them in, with nothing of the page in it (so it can be
// tested). A tip is offered when its moment comes (ui/hugin.ts watches the game for them); the queue shows ONE at a time, each
// once on a device, never while a mark is about to land on the hero, a boss has just woken or a window is open, and with a
// breath between two. What has been shown is remembered, so the journal can list it again.
import { CLASSES, COMBO_TEXT, FIGHT_UI, HUGIN_T, PIP_ICONS, PIP_MAX, PIP_NAMES, ROLE_TEXT, RUN_T, SPELLS, SPEND_MUL, T, fmt, type ClassId } from '@varldstradet/shared';
import { PRIMER, interruptOf } from './fight.ts';

export interface TipDef {
  id: string;
  /** One picture: an emoji, or `role:shield`, `skull`, `star`, `bolt` for the drawn markers (ui/fightcard.ts). */
  pic: (cls: ClassId | null) => string;
  /** One short sentence, for this class (placeholders it does not fill come from the moment: `vars`). */
  text: (cls: ClassId | null) => string;
}

const fixed = (s: string) => (): string => s;
const withCls = (cls: ClassId | null): ClassId => cls ?? 'krigare';

/**
 * Every tip, in the order the journal lists them. A new rule gets one line here and one `offer()` where its moment is noticed.
 */
export const TIPS: readonly TipDef[] = [
  { id: 'menu', pic: fixed('☰'), text: fixed(HUGIN_T.tips.menu!) },
  { id: 'auto', pic: (c) => SPELLS[CLASSES[withCls(c)].auto]!.icon, text: fixed(HUGIN_T.tips.auto!) },
  { id: 'pips3', pic: (c) => PIP_ICONS[withCls(c)], text: (c) => fmt(HUGIN_T.tips.pips3!, { pips: PIP_NAMES[withCls(c)], spell: SPELLS[CLASSES[withCls(c)].spells[0]]!.name, n: SPEND_MUL[PIP_MAX]! }) },
  { id: 'combo', pic: (c) => SPELLS[PRIMER[withCls(c)]]!.icon, text: (c) => COMBO_TEXT[withCls(c)] },
  {
    id: 'interrupt',
    pic: fixed('bolt'),
    text: (c) => {
      const k = interruptOf(withCls(c));
      return k ? fmt(HUGIN_T.tips.interrupt!, { kick: SPELLS[k]!.name }) : HUGIN_T.tips.interruptNone!;
    },
  },
  { id: 'open', pic: fixed('💫'), text: fixed(T.sagaOpenText) },
  { id: 'shield', pic: fixed('role:shield'), text: fixed(ROLE_TEXT.shield) },
  { id: 'dunk', pic: fixed('💥'), text: fixed(T.sagaDunkText) },
  { id: 'mark', pic: fixed('🔴'), text: fixed(HUGIN_T.tips.mark!) },
  { id: 'skull', pic: fixed('skull'), text: fixed(HUGIN_T.tips.skull!) },
  { id: 'orb', pic: fixed('🔮'), text: (c) => fmt(HUGIN_T.tips.orb!, { pips: PIP_NAMES[withCls(c)] }) },
  { id: 'ring', pic: fixed('star'), text: fixed(FIGHT_UI.ringText) },
  { id: 'samslag', pic: fixed('🤝'), text: fixed(HUGIN_T.tips.samslag!) },
  { id: 'medal', pic: fixed(RUN_T.medalIcons[3] ?? '🥇'), text: fixed(HUGIN_T.tips.medal!) },
  { id: 'wipe', pic: fixed('💀'), text: fixed(HUGIN_T.tips.wipe!) },
  // Stjärnmonster, Hornet, Gillet, Svagheter, Perfekt block, Nära ögat, Skogen rör sig
  { id: 'star', pic: fixed('star'), text: fixed(HUGIN_T.tips.star!) },
  { id: 'horn', pic: fixed('📯'), text: fixed(HUGIN_T.tips.horn!) },
  { id: 'dish', pic: fixed('🍲'), text: fixed(HUGIN_T.tips.dish!) },
  { id: 'weak', pic: fixed('🔥'), text: fixed(HUGIN_T.tips.weak!) },
  { id: 'parry', pic: fixed('🛡️'), text: fixed(HUGIN_T.tips.parry!) },
  { id: 'near', pic: fixed('💨'), text: fixed(HUGIN_T.tips.near!) },
  { id: 'ambush', pic: fixed('🌲'), text: fixed(HUGIN_T.tips.ambush!) },
];
export const tipDef = (id: string): TipDef | undefined => TIPS.find((t) => t.id === id);

/** A tip as it is shown: its picture and its sentence, with the moment's own words filled in (a number, two names). */
export interface Tip {
  id: string;
  pic: string;
  text: string;
}
/** What a tip's sentence may still need from the moment when it is read again later in the journal. */
const LATER: Record<string, Record<string, string | number>> = {
  mark: { n: '35 %' },
  samslag: { a: FIGHT_UI.petName, b: T.sagaYou.toLowerCase() },
  horn: { power: 'en bosskraft' },
  dish: { dish: 'en rätt', text: '' },
  weak: { element: 'eld, is eller åska' },
};
export function tipFor(id: string, cls: ClassId | null, vars?: Record<string, string | number>): Tip | null {
  const d = tipDef(id);
  if (!d) return null;
  return { id, pic: d.pic(cls), text: fmt(d.text(cls), { ...(LATER[id] ?? {}), ...(vars ?? {}) }) };
}

/** Where the "seen" flags live (the device's storage in the game, a map in the tests). */
export interface TipStore {
  seen(id: string): boolean;
  mark(id: string): void;
}

/** What may hold a tip back right now. */
export interface Guards {
  /** A mark lands on the hero within 1.5 s. */
  markSoon: boolean;
  /** A boss woke less than 5 s ago. */
  bossYoung: boolean;
  /** A window covers the game. */
  windowOpen: boolean;
}

export const HUGIN = {
  /** He stays this long unless he is thanked sooner. */
  stayMs: 8000,
  /** A good while between two tips, so a first fight is not a lecture (a tip that waits too long is dropped and comes another time). */
  gapMs: 15_000,
  markSoonMs: 1500,
  bossYoungMs: 5000,
  /** A tip that could not be shown for this long is dropped (its moment has passed); it may be offered again. */
  staleMs: 20_000,
} as const;

interface Waiting {
  id: string;
  vars?: Record<string, string | number>;
  at: number;
}

/** The tips waiting to be shown, and the one on the screen. Times are any clock in ms (the tests pass their own). */
export class TipQueue {
  private waiting: Waiting[] = [];
  private shown: { id: string; since: number; vars?: Record<string, string | number> } | null = null;
  private idleFrom = -Infinity;

  constructor(
    private store: TipStore,
    private enabled: () => boolean,
  ) {}

  /** A tip's moment has come. False if he is off, the tip is unknown, was shown before, or is waiting or showing already. */
  offer(id: string, now: number, vars?: Record<string, string | number>): boolean {
    if (!this.enabled() || !tipDef(id) || this.store.seen(id) || this.shown?.id === id || this.waiting.some((w) => w.id === id)) return false;
    this.waiting.push({ id, vars, at: now });
    return true;
  }

  /** The tip on the screen (null: none). */
  get current(): { id: string; since: number; vars?: Record<string, string | number> } | null {
    return this.shown;
  }
  get pending(): number {
    return this.waiting.length;
  }

  /**
   * The next tip to show now, if one may be: none while one is up, during the breath after the last, while a guard holds, or when
   * he is off. Showing it marks it seen (it never comes twice, however quickly it was thanked).
   */
  next(now: number, g: Guards): { id: string; vars?: Record<string, string | number> } | null {
    this.waiting = this.waiting.filter((w) => now - w.at <= HUGIN.staleMs && !this.store.seen(w.id));
    if (this.shown || !this.enabled() || now - this.idleFrom < HUGIN.gapMs || g.markSoon || g.bossYoung || g.windowOpen) return null;
    const w = this.waiting.shift();
    if (!w) return null;
    this.shown = { id: w.id, since: now, vars: w.vars };
    this.store.mark(w.id);
    return { id: w.id, vars: w.vars };
  }

  /** Has the tip on the screen stayed its time? */
  due(now: number): boolean {
    return !!this.shown && now - this.shown.since >= HUGIN.stayMs;
  }

  /** The tip was thanked, or its time is up: he flies off, and the next waits a breath. */
  close(now: number): void {
    if (!this.shown) return;
    this.shown = null;
    this.idleFrom = now;
  }

  /** Everything waiting is forgotten (he was turned off, or the hero left the map). */
  clear(): void {
    this.waiting = [];
  }
}
