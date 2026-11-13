// Hugin, the raven who teaches. The first time something new happens he flies in from the edge of the screen, lands beside the
// hero (in the world, where the view says there is room: never on the hero, never in a telegraph; on a small screen beside the
// party's frames), caws once, and says ONE thing: a picture and a short sentence in a speech bubble. He stays until he is
// thanked (a tap, Escape, the gamepad's B) or 8 seconds, then flies off. Calm screen: he simply appears and disappears.
// The tips and their order are in ../hugin.ts; this file watches the game for their moments and puts him on the screen.
import { FIGHT_UI, HUGIN_T, MOB_FLAG, PIP_MAX, SAGA_BOSSES, TILE, fmt, isHomeKey, isSagaKey } from '@varldstradet/shared';
import { huginCanvas, type HuginPose } from '@art/hugin.ts';
import { calm, prefs } from '../a11y.ts';
import { HUGIN, TIPS, TipQueue, tipFor, type Guards, type Tip, type TipStore } from '../hugin.ts';
import { myRun } from '../run.ts';
import { FLAG, inSaga, myClass, pipsOf, sagaSnap } from '../saga.ts';
import { activeWorld, bus, client, myPlayer, serverNow } from '../state.ts';
import { tone } from '../sound.ts';
import { announce } from './access.ts';
import { h, onTap } from './dom.ts';
import { boltBadge, roleMarker, skullMark, starBadge } from './fightcard.ts';
import { speak } from './speech.ts';
import './hugin.css';

// ---------------------------------------------------------------------------------------------------------------- seen flags

const key = (id: string): string => `varldstradet.hugin.${id}`;
const memory = new Set<string>();
/** The device's storage (and this visit's memory where there is none). */
export const tipStore: TipStore = {
  seen(id) {
    if (memory.has(id)) return true;
    try {
      return localStorage.getItem(key(id)) === '1';
    } catch {
      return false;
    }
  },
  mark(id) {
    memory.add(id);
    try {
      localStorage.setItem(key(id), '1');
    } catch {
      /* no storage: once a visit */
    }
  },
};
/** The tips already shown on this device, in the registry's order (the journal's "Hugins tips"). */
export const seenTips = (): Tip[] => TIPS.filter((t) => tipStore.seen(t.id)).map((t) => tipFor(t.id, myClass()?.id ?? null)!);

// ---------------------------------------------------------------------------------------------------------------- where he lands

/** What the world's view gives: a free spot beside the hero (world px), and where a world spot is on the screen. */
export interface HuginView {
  pick(): { wx: number; wy: number } | null;
  screen(wx: number, wy: number): { x: number; y: number };
}
let view: HuginView | null = null;
export const setHuginView = (v: HuginView): void => void (view = v);

/** A small screen: he sits beside the party's frames instead of in the world (the world is mostly under the HUD there). */
const docked = (): boolean => window.innerHeight < 480 || window.innerWidth < 700;

// ---------------------------------------------------------------------------------------------------------------- the raven

/** A friendly caw, quieter than the fight: two short rasps falling a little. */
function caw(): void {
  for (const [at, f] of [
    [0, 620],
    [150, 560],
  ] as const)
    window.setTimeout(() => {
      tone(f, 0.11, 'sawtooth', 0.022, -160);
      tone(f * 1.5, 0.08, 'square', 0.008, -200);
    }, at);
  (globalThis as { __sfxLog?: string[] }).__sfxLog?.push('caw');
}

export const tipPic = (pic: string): HTMLElement =>
  pic.startsWith('role:') ? roleMarker(pic.slice(5) as 'shield') : pic === 'skull' ? skullMark() : pic === 'star' ? starBadge('lone') : pic === 'bolt' ? boltBadge() : h('span', { class: 'em' }, pic);

type Phase = 'idle' | 'in' | 'up' | 'out';
const FLY_IN = 850;
const FLY_OUT = 700;

class Hugin {
  readonly queue = new TipQueue(tipStore, () => prefs().hugin);
  private root = h('div', { class: 'hugin', hidden: true });
  private bird = h('div', { class: 'hugin-bird', 'aria-hidden': 'true' });
  private bubble = h('div', { class: 'hugin-bubble', role: 'status' });
  private phase: Phase = 'idle';
  private since = 0;
  private pose: HuginPose | '' = '';
  /** Where he lands: a spot of the world, or (docked) a place on the screen; and the edge he comes from. */
  private spot: { wx: number; wy: number } | null = null;
  private fromLeft = true;
  private bossSince = 0;
  private bossId = -1;
  private started = false;

  /** Puts him in the page and starts watching (once, when the game's UI is up). */
  start(ui: HTMLElement): void {
    if (this.started) return;
    this.started = true;
    this.bubble.hidden = true;
    this.root.append(this.bird, this.bubble);
    ui.append(this.root);
    onTap(this.bubble, () => this.thank());
    onTap(this.bird, () => this.thank());
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || this.phase !== 'up' || document.querySelector('.modal')) return;
        e.stopImmediatePropagation();
        this.thank();
      },
      { capture: true },
    );
    document.addEventListener('vt:prefs', () => {
      if (!prefs().hugin) {
        this.queue.clear();
        this.thank();
      }
    });
    this.watch();
    const frame = (): void => {
      requestAnimationFrame(frame);
      this.frame();
    };
    requestAnimationFrame(frame);
  }

  /** Is a tip on the screen (the gamepad's B thanks him instead of casting)? */
  get up(): boolean {
    return this.phase === 'up' || this.phase === 'in';
  }

  /** A tip's moment has come. */
  offer(id: string, vars?: Record<string, string | number>): void {
    this.queue.offer(id, performance.now(), vars);
  }

  /** He is thanked (or his time is up): the bubble goes and he flies off. True if he was there. */
  thank(): boolean {
    if (this.phase !== 'up' && this.phase !== 'in') return false;
    this.queue.close(performance.now());
    this.bubble.hidden = true;
    if (calm()) this.hide();
    else {
      this.phase = 'out';
      this.since = performance.now();
    }
    return true;
  }

  private hide(): void {
    this.phase = 'idle';
    this.root.hidden = true;
    this.spot = null;
  }

  // ---- what may hold him back ----

  private guards(): Guards {
    const me = myPlayer();
    const now = serverNow();
    const zones = inSaga() ? (activeWorld()?.saga?.zones ?? []) : [];
    const markSoon = !!me && zones.some((z) => z.kind !== 'gold' && z.kind !== 'orb' && z.dmg > 0 && z.at > now && z.at - now < HUGIN.markSoonMs && Math.hypot(me.x - z.x, me.y - z.y) <= z.r * TILE + 8);
    const b = sagaSnap()?.b;
    if ((b?.id ?? -1) !== this.bossId) {
      this.bossId = b?.id ?? -1;
      this.bossSince = performance.now();
    }
    return { markSoon, bossYoung: !!b && performance.now() - this.bossSince < HUGIN.bossYoungMs, windowOpen: !!document.querySelector('.modal') };
  }

  // ---- every frame ----

  private frame(): void {
    const now = performance.now();
    if (this.phase === 'idle') {
      if (!this.queue.pending || !myPlayer()) return;
      const next = this.queue.next(now, this.guards());
      if (next) this.show(tipFor(next.id, myClass()?.id ?? null, next.vars)!);
      return;
    }
    if (this.phase === 'up' && this.queue.due(now)) this.thank();
    this.place(now);
  }

  private show(tip: Tip): void {
    this.spot = docked() ? null : (view?.pick() ?? null);
    const me = myPlayer();
    const at = this.spot && me ? this.spot.wx < me.x : true;
    this.fromLeft = at;
    this.bubble.replaceChildren(
      h('span', { class: 'pic', 'aria-hidden': 'true' }, tipPic(tip.pic)),
      h('span', { class: 'tx' }, h('b', { class: 'who' }, HUGIN_T.name), h('span', null, tip.text)),
      h('button', { class: 'x', type: 'button', 'aria-label': HUGIN_T.close }, '✕'),
    );
    this.bubble.hidden = true;
    this.root.hidden = false;
    this.root.dataset.tip = tip.id;
    this.since = performance.now();
    this.phase = calm() ? 'up' : 'in';
    if (this.phase === 'up') this.land(tip);
    else this.pendingTip = tip;
    this.place(this.since);
  }
  private pendingTip: Tip | null = null;

  /** He is down: the caw, the bubble, the words for a screen reader, and read aloud when that is on. */
  private land(tip: Tip): void {
    this.setPose('land');
    caw();
    this.bubble.hidden = false;
    announce(fmt(HUGIN_T.says, { text: tip.text }));
    if (prefs().read) speak(tip.text);
  }

  private setPose(p: HuginPose): void {
    if (p === this.pose) return;
    this.pose = p;
    const c = huginCanvas(p);
    const copy = document.createElement('canvas');
    copy.width = c.width;
    copy.height = c.height;
    copy.getContext('2d')!.drawImage(c, 0, 0);
    this.bird.replaceChildren(copy);
  }

  /** Where he is now: on his spot, or on the way to or from the edge of the screen (wings beating). */
  private place(now: number): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let tx: number;
    let ty: number;
    if (this.spot && view) {
      const s = view.screen(this.spot.wx, this.spot.wy);
      tx = Math.max(40, Math.min(vw - 40, s.x));
      ty = Math.max(110, Math.min(vh - 150, s.y));
    } else {
      // docked: beside the party's frames (under the top of the HUD when there are none)
      const party = document.querySelector<HTMLElement>('.saga-party:not([hidden])')?.getBoundingClientRect();
      tx = party && party.width > 0 ? party.right + 36 : 44;
      ty = party && party.width > 0 ? party.top + 44 : Math.min(vh - 120, 118);
    }
    let x = tx;
    let y = ty;
    const edge = this.fromLeft ? -60 : vw + 60;
    if (this.phase === 'in') {
      const k = Math.min(1, (now - this.since) / FLY_IN);
      const e = 1 - Math.pow(1 - k, 3);
      x = edge + (tx - edge) * e;
      y = ty - 90 * (1 - e) - Math.sin(k * Math.PI) * 18;
      this.setPose(Math.floor(now / 110) % 2 ? 'up' : 'down');
      if (k >= 1 && this.pendingTip) {
        this.phase = 'up';
        this.since = now;
        this.land(this.pendingTip);
        this.pendingTip = null;
      }
    } else if (this.phase === 'out') {
      const k = Math.min(1, (now - this.since) / FLY_OUT);
      const e = k * k;
      x = tx + (edge - tx) * e;
      y = ty - 110 * e;
      this.setPose(Math.floor(now / 110) % 2 ? 'up' : 'down');
      if (k >= 1) return this.hide();
    }
    // he looks at the hero: towards the middle of the screen
    const flip = this.phase === 'out' ? (this.fromLeft ? -1 : 1) : this.fromLeft ? 1 : -1;
    this.bird.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%) scaleX(${flip})`;
    if (this.bubble.hidden) return;
    // the bubble: over him and away from the hero in the world; beside him when docked. Always whole on the screen.
    // (docked it may be as wide as the room beside him, so it is as low as it can be and stays over the hero's head)
    this.bubble.style.maxWidth = this.spot ? '' : `${Math.max(220, vw - (tx + 40) - 8)}px`;
    const bw = this.bubble.offsetWidth;
    const bh = this.bubble.offsetHeight;
    const birdH = this.bird.offsetHeight;
    let bx: number;
    let by: number;
    if (this.spot) {
      bx = this.fromLeft ? tx + 34 - bw : tx - 34;
      by = ty - birdH - 10 - bh;
    } else {
      bx = tx + 40;
      by = ty - birdH;
    }
    bx = Math.max(8, Math.min(vw - bw - 8, bx));
    by = Math.max(64, Math.min(vh - bh - 8, by));
    this.bubble.style.transform = `translate(${Math.round(bx)}px, ${Math.round(by)}px)`;
    this.bubble.classList.toggle('left', this.fromLeft && !!this.spot);
  }

  // ---- the moments ----

  /** Watches the game for the moment of each tip. (A tip already seen costs one look at the storage; `offer` drops it.) */
  private watch(): void {
    const lobby = (): void => {
      const me = myPlayer();
      if (me && !isSagaKey(me.area) && !isHomeKey(me.area) && !myRun()) window.setTimeout(() => !inSaga() && this.offer('menu'), 3500);
    };
    bus.on('welcome', lobby);
    bus.on('area', () => {
      this.queue.clear();
      lobby();
    });
    bus.on('medal', () => this.offer('medal'));
    bus.on('change', (c) => {
      if (!inSaga()) return;
      if (c.t === 'spell' && c.by === client.me && c.spell === myClass()?.auto && c.on !== undefined) this.offer('auto');
      else if (c.t === 'hit' && c.mark && c.on === client.me && (c.kind === 'dmg' || c.kind === 'block')) this.offer('mark', { n: c.n });
      else if (c.t === 'hit' && c.kind === 'combo' && c.by) {
        const name = (id: string): string => (id.startsWith('pet:') ? FIGHT_UI.petName : (client.world?.players[id]?.name ?? ''));
        this.offer('samslag', { a: name(c.by[0]), b: name(c.by[1]) });
      }
    });
    bus.on('state', () => {
      const snap = sagaSnap();
      if (!snap) return;
      const pips = pipsOf(client.me);
      const mobs = Object.entries(snap.m);
      const fighting = mobs.length;
      if (pips >= PIP_MAX) this.offer('pips3');
      // the combo: once the pips are known, with one or two to spend in a fight
      else if (pips >= 1 && fighting && tipStore.seen('pips3')) this.offer('combo');
      if (snap.o && Object.keys(snap.o).length) this.offer('open');
      const animals = activeWorld()?.animals ?? {};
      for (const [ids, c] of Object.entries(snap.c ?? {})) {
        const a = animals[Number(ids)];
        if (c[0] === 'slam' && a && !SAGA_BOSSES[a.species]) this.offer('dunk');
        else if (c[3]) this.offer('interrupt');
      }
      if (mobs.some(([, m]) => m[2] & MOB_FLAG.shielded)) this.offer('shield');
      if (fighting >= 3 && tipStore.seen('auto')) this.offer('skull');
      for (const z of activeWorld()?.saga?.zones ?? []) {
        if (z.kind === 'orb') this.offer('orb');
        else if (z.kind === 'gold') this.offer('ring');
      }
      if ((snap.f[client.me]?.[2] ?? 0) & FLAG.down && (myRun()?.level ?? 0) >= 2) this.offer('wipe');
    });
  }
}

export const hugin = new Hugin();
