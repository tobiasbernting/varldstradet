// The info card: one card for everything that needs explaining without doing it. A thing is marked with `cards.info(el, icon,
// name, text)`; then a long press (the length is a setting), keyboard focus, the gamepad's focus ring, hovering with a mouse, and
// a tap while the "Förklara" mode is on all show the same big card (icon, name, one sentence, a speaker button). A press that
// opened a card does not use the thing when it is let go. The card sits in the open window above its buttons, or floats in the
// HUD (above the spell bar in a fight). Used by the run windows, the spell bar, the HUD's buttons and every `title=` there was.
import { A11Y_T, RUN_UI } from '@lilla-garden/shared';
import { prefs } from '../a11y.ts';
import { clear, h, onTap } from './dom.ts';
import { canSpeak, speak } from './speech.ts';

export interface Info {
  icon: string;
  name: string;
  text: string;
}

type Listener = (on: boolean) => void;

class InfoCards {
  readonly el = h('div', { class: 'run-info', role: 'status', 'aria-live': 'polite' });
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
    const name = el.dataset.infoName;
    const text = el.dataset.infoText ?? '';
    clear(this.el);
    const sp = this.speaker(`${name}. ${text}`);
    const img = !el.dataset.infoIcon ? el.querySelector('img') : null;
    this.el.append(img ? h('span', { class: 'ic pic' }, img.cloneNode()) : h('span', { class: 'ic' }, el.dataset.infoIcon ?? ''), h('div', { class: 'tx' }, h('b', null, name), text ? h('span', null, text) : null));
    if (sp) this.el.append(sp);
    this.el.append(h('span', { class: 'dismiss' }, RUN_UI.dismiss));
    // in a window the card sits in the window above the buttons (it never covers one); in the HUD it floats
    const panel = document.querySelector('.modal .panel');
    const host = document.getElementById('ui')!;
    this.el.classList.toggle('in-panel', !!panel);
    const bar = !panel ? el.closest('.saga-bar') : null;
    this.el.classList.toggle('near-bar', !!bar);
    // above the bar, wherever it is and however big it has grown
    this.el.style.bottom = bar ? `${Math.max(8, window.innerHeight - bar.getBoundingClientRect().top + 12)}px` : '';
    if (panel) panel.insertBefore(this.el, panel.querySelector('.foot'));
    else if (this.el.parentElement !== host) host.append(this.el);
    this.el.hidden = false;
    this.forEl = el;
    if (this.barMode) this.setMode(true, 10000);
    if (prefs().read) speak(`${name}. ${text}`);
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

  private speaker(text: string): HTMLElement | null {
    if (!canSpeak()) return null;
    const b = h('button', { class: 'speak', 'aria-label': A11Y_T.readAloud, type: 'button' }, `🔊 ${A11Y_T.readAloud}`);
    for (const ev of ['pointerdown', 'pointerup', 'click']) b.addEventListener(ev, (e) => e.stopPropagation());
    b.addEventListener('click', () => speak(text));
    return b;
  }

  /** Everything that wakes the card up. Set up once, on the first thing marked. */
  private init(): void {
    if (this.ready) return;
    this.ready = true;
    const host = document.getElementById('ui')!;
    this.el.hidden = true;
    host.append(this.el);
    onTap(this.el, () => this.hide());
    const own = (el: EventTarget | null): HTMLElement | null => (el as HTMLElement | null)?.closest?.<HTMLElement>('[data-info-name]') ?? null;
    let timer = 0;
    document.addEventListener(
      'pointerdown',
      (e) => {
        clearTimeout(timer);
        const t = own(e.target);
        if (!t) {
          if (!(e.target as HTMLElement).closest?.('.run-info')) {
            this.hide();
            if (this.barMode && !(e.target as HTMLElement).closest?.('.saga-bar')) this.setMode(false);
          }
          return;
        }
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
    // a mouse hovering over a thing in the HUD or a window
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const t = own(e.target);
      if (t && t !== this.forEl && !this.on) this.show(t);
    });
    document.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse') return;
      const t = own(e.target);
      if (t && t === this.forEl && !(e.relatedTarget as HTMLElement | null)?.closest?.('.run-info') && !this.on) this.hide();
    });
    document.addEventListener('focusin', (e) => {
      const t = own(e.target);
      if (t && !this.quiet && (e.target as HTMLElement).matches?.(':focus-visible') && t.closest('.modal, .hud, .run-bar, .run-vote, .run-runor, .saga-bar')) this.show(t);
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
        if (has && !had) this.show(t);
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
