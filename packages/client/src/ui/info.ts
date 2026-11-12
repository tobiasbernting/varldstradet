// The info card: one card for everything that needs explaining without doing it. A thing is marked with `cards.info(el, icon,
// name, text)`; then a long press (the length is a setting), keyboard focus, the gamepad's focus ring, hovering with a mouse, and
// a tap while the "Förklara" mode is on show the same card (icon, name, one sentence, a small speaker button). A mouse that only
// rests on a thing gets a small tooltip instead (`.run-tip`, after HOVER_MS, never on something that already says its own name
// and has nothing to add). A press that opened a card does not use the thing when it is let go. The card sits in the open window
// above its buttons, or floats in the HUD beside the thing (above the bar for the things in a bar), never on top of it. Used by
// the run windows, the spell bar, the HUD's buttons and every `title=` there was.
import { A11Y_T, RUN_UI } from '@varldstradet/shared';
import { prefs } from '../a11y.ts';
import { clear, h, onTap, tapGuard } from './dom.ts';
import { canSpeak, speak } from './speech.ts';

export interface Info {
  icon: string;
  name: string;
  text: string;
}

type Listener = (on: boolean) => void;

/** How long a mouse must rest on a thing before its tooltip comes up. */
const HOVER_MS = 550;
/** A mouse that moves less than this has not moved. */
const HOVER_SLOP = 3;

const norm = (s: string): string => s.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u200d\ufe0f]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Does the thing already show its name as text it has on it? (A tooltip saying the same is noise.) */
function nameShown(el: HTMLElement): boolean {
  const seen = norm(el.textContent ?? '');
  const name = norm(el.dataset.infoName ?? '');
  return seen.length > 0 && name.length > 0 && (name.includes(seen) || seen.includes(name));
}

/** Has the thing something to say on a hover, a focus or a pad ring? Text, or a picture with no visible name. */
export function explains(el: HTMLElement): boolean {
  return !!el.dataset.infoText || !nameShown(el);
}

const visible = (e: HTMLElement): boolean => e.offsetParent !== null || getComputedStyle(e).position === 'fixed';

/**
 * Puts `box` (already in the page, `position: fixed`) beside `anchor`: above by default, then below, right, left. A place counts
 * when it is on the screen, not on the anchor, not on any other thing that explains itself (a neighbour in the same bar) and
 * not under the pointer. When nothing fits cleanly the least covering place wins.
 */
function place(box: HTMLElement, el: HTMLElement, anchor: DOMRect, pointer: { x: number; y: number } | null, gap: number): void {
  box.style.left = '0px';
  box.style.top = '0px';
  const b = box.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const m = 8;
  const clampX = (x: number): number => Math.max(m, Math.min(vw - b.width - m, x));
  const clampY = (y: number): number => Math.max(m, Math.min(vh - b.height - m, y));
  // beside the bar, level with the thing itself
  const own = el.getBoundingClientRect();
  const cx = own.left + own.width / 2 - b.width / 2;
  const cy = own.top + own.height / 2 - b.height / 2;
  const cands: [number, number][] = [
    [clampX(cx), anchor.top - gap - b.height],
    [clampX(cx), anchor.bottom + gap],
    [anchor.right + gap, clampY(cy)],
    [anchor.left - gap - b.width, clampY(cy)],
  ];
  const others: DOMRect[] = [];
  for (const o of document.querySelectorAll<HTMLElement>('[data-info-name]')) {
    if (o === el || o.contains(el) || el.contains(o) || !visible(o)) continue;
    const r = o.getBoundingClientRect();
    if (r.width * r.height > vw * vh * 0.25 || r.width === 0) continue;
    others.push(r);
  }
  const area = (x: number, y: number, r: DOMRect): number => Math.max(0, Math.min(x + b.width, r.right) - Math.max(x, r.left)) * Math.max(0, Math.min(y + b.height, r.bottom) - Math.max(y, r.top));
  let best = cands[0]!;
  let bestCost = Infinity;
  for (const [x, y] of cands) {
    const off = Math.max(0, m - x) + Math.max(0, m - y) + Math.max(0, x + b.width - (vw - m)) + Math.max(0, y + b.height - (vh - m));
    let cost = off * 1000 + area(x, y, anchor) * 4 + area(x, y, own) * 4;
    for (const r of others) cost += area(x, y, r);
    if (pointer && pointer.x > x - 6 && pointer.x < x + b.width + 6 && pointer.y > y - 6 && pointer.y < y + b.height + 6) cost += 1e5;
    if (cost < bestCost) {
      bestCost = cost;
      best = [x, y];
    }
    if (cost === 0) break;
  }
  box.style.left = `${Math.round(clampX(best[0]))}px`;
  box.style.top = `${Math.round(clampY(best[1]))}px`;
}

/** A thing in a row of buttons keeps the whole row clear: the card goes above or beside the bar, not above the one button. */
const BARS = '.hotbar, .saga-bar, .run-bar';

class InfoCards {
  readonly el = h('div', { class: 'run-info', role: 'status', 'aria-live': 'polite' });
  /** The mouse's small tooltip: no buttons, never catches the pointer, not read out (the thing has its own name). */
  readonly tip = h('div', { class: 'run-tip', 'aria-hidden': 'true' });
  private tipFor: HTMLElement | null = null;
  private stopHover: (press?: boolean) => void = () => undefined;
  private forEl: HTMLElement | null = null;
  private on = false;
  private noTapUntil = 0;
  /** A long press has put a card up and the finger is still down (or only just let go). */
  private held = false;
  private modeTimer = 0;
  /** The mode was started from the fight's spell bar: a tap anywhere else ends it. */
  private barMode = false;
  private listeners: Listener[] = [];
  /** True while a window moves the focus by itself, so no card pops up for that. */
  quiet = false;
  /** Pictures under a card's sentence, for a thing marked with `data-info-pic` (the spender's "how you fight" strip). */
  picture: ((key: string) => HTMLElement | null) | null = null;
  private ready = false;

  get mode(): boolean {
    return this.on;
  }

  /** The "Förklara" mode: taps explain instead of doing. `autoOff` ends it after that long without a card (the fight bar). */
  setMode(v: boolean, autoOff = 0): void {
    clearTimeout(this.modeTimer);
    if (v === this.on && !autoOff) return;
    this.on = v;
    this.barMode = v && autoOff > 0;
    document.body.classList.toggle('explain-on', v);
    if (v && autoOff) this.modeTimer = window.setTimeout(() => this.setMode(false), autoOff);
    if (!v && this.forEl && this.forEl.closest('.saga-bar')) this.hide();
    for (const l of this.listeners) l(v);
  }

  /** Called whenever the mode changes (a button's pressed state follows it). */
  onMode(fn: Listener): void {
    this.listeners.push(fn);
  }

  /** Marks a thing as explainable: an icon, a name and one short sentence. Gives it its accessible name too. */
  info<E extends HTMLElement>(el: E, icon: string, name: string, text: string): E {
    this.init();
    el.dataset.infoIcon = icon;
    el.dataset.infoName = name;
    el.dataset.infoText = text;
    if (!el.hasAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', name);
    return el;
  }

  /** A tap: explains the thing instead of using it while the mode is on, and is ignored right after a long press. */
  tap(el: HTMLElement, fn: (ev: Event) => void): void {
    onTap(el, (ev) => {
      if (this.suppressed()) return;
      if (this.on && el.dataset.infoName) {
        this.show(el);
        return;
      }
      fn(ev);
    });
  }

  /**
   * A button that does its thing when it is let go (not when it is touched): a finger that slides off, or a press that
   * opened a card (a long press, or the explain mode), does nothing. 12 px of slop, a guard against double taps, and Enter
   * or Space (a click with no pointer) work too.
   */
  press(el: HTMLElement, act: () => void): void {
    this.init();
    let id = -1;
    let last = 0;
    const go = (): void => {
      if (this.suppressed()) return;
      if (this.on && el.dataset.infoName) {
        this.show(el);
        return;
      }
      const now = performance.now();
      if (now - last < 120) return;
      last = now;
      act();
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      id = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable */
      }
      el.classList.add('held');
    });
    const end = (): void => {
      id = -1;
      el.classList.remove('held');
    };
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== id) return;
      end();
      const r = el.getBoundingClientRect();
      const slop = 12;
      if (e.clientX < r.left - slop || e.clientX > r.right + slop || e.clientY < r.top - slop || e.clientY > r.bottom + slop) return;
      go();
    });
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', () => el.classList.remove('held'));
    // the keyboard and screen readers click without a pointer
    el.addEventListener('click', (e) => {
      if ((e as MouseEvent).detail === 0) go();
    });
  }

  /** Right after a card came up from a press: the release that follows must not use the thing. */
  suppressed(): boolean {
    return this.held || performance.now() < this.noTapUntil;
  }

  show(el: HTMLElement): void {
    if (!el.dataset.infoName) return;
    this.init();
    this.stopHover();
    const name = el.dataset.infoName;
    const text = el.dataset.infoText ?? '';
    clear(this.el);
    const sp = this.speaker(`${name}. ${text}`);
    const img = !el.dataset.infoIcon ? el.querySelector('img') : null;
    this.el.append(img ? h('span', { class: 'ic pic' }, img.cloneNode()) : h('span', { class: 'ic' }, el.dataset.infoIcon ?? ''), h('div', { class: 'tx' }, h('b', null, name), text ? h('span', null, text) : null));
    if (sp) this.el.append(sp);
    this.el.append(h('span', { class: 'dismiss', 'aria-hidden': 'true' }, '✕'));
    const pic = el.dataset.infoPic ? this.picture?.(el.dataset.infoPic) : null;
    this.el.classList.toggle('with-pic', !!pic);
    if (pic) this.el.querySelector('.tx')?.append(pic);
    // in a window the card sits in the window above the buttons (it never covers one); in the HUD it floats beside the thing
    const panel = document.querySelector('.modal .panel');
    const host = document.getElementById('ui')!;
    this.el.classList.toggle('in-panel', !!panel);
    this.el.classList.toggle('float', !panel);
    this.el.classList.toggle('near-bar', !panel && !!el.closest(BARS));
    this.el.style.left = '';
    this.el.style.top = '';
    this.el.style.bottom = '';
    if (panel) panel.insertBefore(this.el, panel.querySelector('.foot'));
    else if (this.el.parentElement !== host) host.append(this.el);
    this.el.hidden = false;
    this.forEl = el;
    if (!panel) place(this.el, el, (el.closest(BARS) ?? el).getBoundingClientRect(), null, 12);
    if (this.barMode) this.setMode(true, 10000);
    if (prefs().read) speak(`${name}. ${text}`);
  }

  /** The mouse's tooltip: small, beside the thing, only once the pointer has rested on it. */
  private showTip(el: HTMLElement, pointer: { x: number; y: number }): void {
    if (!el.dataset.infoName || !el.isConnected || !explains(el) || this.shown === el) return;
    const name = el.dataset.infoName;
    const text = el.dataset.infoText ?? '';
    clear(this.tip);
    // a thing that already says its name only needs its sentence
    if (!text || !nameShown(el)) this.tip.append(h('b', null, name));
    if (text) this.tip.append(h('span', null, text));
    const host = document.getElementById('ui')!;
    if (this.tip.parentElement !== host) host.append(this.tip);
    this.tip.hidden = false;
    this.tipFor = el;
    place(this.tip, el, (el.closest(BARS) ?? el).getBoundingClientRect(), pointer, 10);
  }

  hideTip(): void {
    this.tip.hidden = true;
    this.tipFor = null;
  }

  hide(): void {
    this.el.hidden = true;
    this.forEl = null;
  }

  get shown(): HTMLElement | null {
    return this.el.hidden ? null : this.forEl;
  }

  /** A line in the card itself (the mode is on: "tap a thing"). */
  note(icon: string, name: string, text: string): void {
    this.init();
    clear(this.el);
    this.el.append(h('span', { class: 'ic' }, icon), h('div', { class: 'tx' }, h('b', null, name), h('span', null, text)));
    this.el.hidden = false;
    this.forEl = null;
  }

  /** A small speaker in the card's corner; there is none when the device has no Swedish voice. */
  private speaker(text: string): HTMLElement | null {
    if (!canSpeak()) return null;
    const b = h('button', { class: 'speak', 'aria-label': A11Y_T.readAloud, type: 'button' }, '🔊');
    for (const ev of ['pointerdown', 'pointerup', 'click']) b.addEventListener(ev, (e) => e.stopPropagation());
    b.addEventListener('click', () => speak(text));
    return b;
  }

  /** Everything that wakes the card up. Set up once, on the first thing marked. */
  private init(): void {
    if (this.ready) return;
    this.ready = true;
    tapGuard.suppressed = () => this.suppressed();
    const host = document.getElementById('ui')!;
    this.el.hidden = true;
    this.tip.hidden = true;
    host.append(this.el, this.tip);
    onTap(this.el, () => this.hide());
    const own = (el: EventTarget | null): HTMLElement | null => (el as HTMLElement | null)?.closest?.<HTMLElement>('[data-info-name]') ?? null;
    let timer = 0;
    document.addEventListener(
      'pointerdown',
      (e) => {
        clearTimeout(timer);
        // any press puts the tooltip away and starts the wait again (a click, a spell, a move with the mouse)
        this.stopHover(e.pointerType !== 'touch');
        const t = own(e.target);
        // a press anywhere but on the card puts the card away (a long press on a thing then brings up its own)
        if (!(e.target as HTMLElement).closest?.('.run-info')) {
          this.hide();
          if (this.barMode && !(e.target as HTMLElement).closest?.('.saga-bar')) this.setMode(false);
        }
        if (!t) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        timer = window.setTimeout(() => {
          this.noTapUntil = performance.now() + 800;
          this.held = true;
          this.show(t);
        }, prefs().hold);
      },
      true,
    );
    for (const ev of ['pointerup', 'pointercancel']) {
      document.addEventListener(ev, () => clearTimeout(timer), true);
      // the release (and the click after it) of a long press does nothing; after that things work again
      document.addEventListener(ev, () => this.held && window.setTimeout(() => (this.held = false), 500));
    }
    // a finger that slides away is not a long press (a little wobble is fine)
    let sx = 0;
    let sy = 0;
    document.addEventListener('pointerdown', (e) => ((sx = e.clientX), (sy = e.clientY)), true);
    document.addEventListener(
      'pointermove',
      (e) => {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 14) clearTimeout(timer);
      },
      true,
    );
    document.addEventListener('contextmenu', (e) => {
      if (own(e.target)) e.preventDefault();
    });
    // a mouse resting on a thing in the HUD or a window: a small tooltip after a short wait, never while a button is held
    let hoverTimer = 0;
    let hx = -99;
    let hy = -99;
    let hoverEl: HTMLElement | null = null;
    /** After a press the same thing gets no tooltip until the pointer has left it and come back. */
    let blocked: HTMLElement | null = null;
    this.stopHover = (press = false): void => {
      clearTimeout(hoverTimer);
      hoverTimer = 0;
      this.hideTip();
      if (press) blocked = hoverEl;
    };
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const t = own(e.target);
      if (t !== hoverEl) {
        hoverEl = t;
        blocked = null;
      }
      if (e.buttons !== 0) {
        this.stopHover();
        return;
      }
      if (!t || t === blocked || this.on || t === this.forEl || !explains(t)) {
        this.stopHover();
        return;
      }
      if (Math.hypot(e.clientX - hx, e.clientY - hy) < HOVER_SLOP && (this.tipFor === t || hoverTimer)) return;
      hx = e.clientX;
      hy = e.clientY;
      // a pointer that moves puts the tooltip away and waits again: it is for a pointer that rests
      this.stopHover();
      const pointer = { x: e.clientX, y: e.clientY };
      hoverTimer = window.setTimeout(() => {
        hoverTimer = 0;
        this.showTip(t, pointer);
      }, HOVER_MS);
    });
    document.addEventListener('pointerout', (e) => {
      if (e.pointerType === 'touch') return;
      if (own(e.relatedTarget) !== hoverEl) this.stopHover();
    });
    for (const ev of ['keydown', 'wheel', 'blur']) window.addEventListener(ev, () => this.stopHover(), true);
    document.documentElement.addEventListener('mouseleave', () => this.stopHover());
    document.addEventListener('focusin', (e) => {
      const t = own(e.target);
      if (t && !this.quiet && explains(t) && (e.target as HTMLElement).matches?.(':focus-visible') && t.closest('.modal, .hud, .run-bar, .run-vote, .run-runor, .saga-bar, .pet-toggle')) this.show(t);
    });
    document.addEventListener('focusout', (e) => {
      if (this.forEl && e.target === this.forEl) this.hide();
    });
    // the gamepad moves a ring (the class pad-focus) instead of the browser's focus
    new MutationObserver((muts) => {
      for (const m of muts) {
        const t = m.target as HTMLElement;
        if (!t.dataset?.infoName) continue;
        const had = (m.oldValue ?? '').split(' ').includes('pad-focus');
        const has = t.classList.contains('pad-focus');
        if (has && !had && explains(t)) this.show(t);
        else if (had && !has && this.forEl === t) this.hide();
      }
    }).observe(host, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });
    // ? opens the card of what has the focus; Escape puts it away
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.shown) {
          this.hide();
          e.stopPropagation();
        } else if ((e.key === '?' || (e.key === 'F10' && e.shiftKey)) && document.activeElement instanceof HTMLElement && own(document.activeElement) && !(e.target instanceof HTMLInputElement)) {
          this.show(own(document.activeElement)!);
          e.stopPropagation();
        }
      },
      true,
    );
  }

  /** Starts the card's watchers (the HUD calls this once, so even things marked later work). */
  start(): void {
    this.init();
  }
}

export const cards = new InfoCards();
