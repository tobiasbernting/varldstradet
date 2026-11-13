// "Meny": the one place for every window and switch that does not have a button of its own at the top of the screen. Opened by the
// HUD's ☰ (event 'vt:menu'). Big tiles, a picture and one word each, in three groups: what is mine (clothes, bag, feelings, the book,
// furnishing in your own house), help and settings (help, explain, settings, sound, fullscreen), and in a run the run (the little map,
// and going home, which stands apart at the end and still asks before it does anything).
// A window like the others: a dialog, Escape and the gamepad's B close it, the focus comes back to ☰. A key that opens a window
// (G, Q, F, B or J, L, M, K, H) closes the menu and does its thing. While "Förklara" is on a tap on a tile tells what it does.
import { A11Y_T, HOUSE_T, MENU_T, RUN_UI, T } from '@varldstradet/shared';
import { myRun } from '../run.ts';
import { isMuted, setMuted } from '../sound.ts';
import { furnish, inOwnHouse } from '../state.ts';
import { clear, h, onTap } from './dom.ts';
import './hudmenu.css';
import { cards } from './info.ts';

export interface HudMenuActions {
  /** The bag, the feelings and the help are windows of ui/menus.ts. */
  open(kind: 'inventory' | 'emotes' | 'help'): void;
  minimap(): void;
  furnish(): void;
  toast(text: string, ms?: number): void;
}

/** The keys that open a window by themselves: with the menu up they close it and go on to the game's own key handler. */
const PASS_KEYS = new Set(['g', 'q', 'i', 'f', 'b', 'j', 'l', 'm', 'k', 'h', '?']);
const event = (name: string) => (): void => void document.dispatchEvent(new Event(name));

export class HudMenu {
  onChange: (open: boolean) => void = () => {};
  private modal: HTMLElement | null = null;
  private opener: HTMLElement | null = null;

  constructor(
    private ui: HTMLElement,
    private act: HudMenuActions,
  ) {
    document.addEventListener('vt:menu', () => (this.modal ? this.close() : this.open()));
    cards.onMode(() => this.modal && this.render());
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.modal) return;
        const k = e.key;
        if (k === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          if (cards.shown) cards.hide();
          else this.close();
        } else if (k === 'Tab') {
          // the focus stays inside the window
          e.preventDefault();
          e.stopPropagation();
          this.step(e.shiftKey ? -1 : 1);
        } else if (k.startsWith('Arrow')) {
          e.preventDefault();
          e.stopPropagation();
          this.arrow(k);
        } else if (PASS_KEYS.has(k.toLowerCase()) && !e.ctrlKey && !e.metaKey && !e.altKey) this.close();
        else if (k !== 'Enter' && k !== ' ') e.stopPropagation();
      },
      true,
    );
  }

  isOpen(): boolean {
    return this.modal !== null;
  }

  open(): void {
    if (this.modal) return;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : document.querySelector<HTMLElement>('.hud-menu-btn');
    this.modal = h('div', { class: 'modal menu-modal' });
    this.modal.style.zIndex = '90';
    // a tap beside the sheet puts it away (it holds no choice that could be lost); on the release, so nothing under it is tapped
    onTap(this.modal, (e) => {
      if (e.target === this.modal) this.close();
    });
    this.ui.append(this.modal);
    this.render(true);
    this.onChange(true);
  }

  close(): void {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    cards.hide();
    this.onChange(false);
    const back = this.opener?.isConnected ? this.opener : document.querySelector<HTMLElement>('.hud-menu-btn');
    cards.quiet = true;
    back?.focus({ preventScroll: true });
    cards.quiet = false;
    this.opener = null;
  }

  private tiles(): HTMLElement[] {
    return this.modal ? [...this.modal.querySelectorAll<HTMLElement>('button')].filter((b) => b.offsetParent !== null) : [];
  }

  private step(d: number): void {
    const list = this.tiles();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    list[(at + d + list.length) % list.length]!.focus();
  }

  /** The arrow keys walk the tiles: left and right in reading order, up and down to the nearest one in that direction. */
  private arrow(key: string): void {
    const cur = document.activeElement as HTMLElement | null;
    const list = this.tiles();
    if (!cur || !list.includes(cur)) return void list[0]?.focus();
    if (key === 'ArrowLeft') return this.step(-1);
    if (key === 'ArrowRight') return this.step(1);
    const from = cur.getBoundingClientRect();
    const dir = key === 'ArrowUp' ? -1 : 1;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of list) {
      const r = el.getBoundingClientRect();
      const dy = (r.top + r.height / 2 - (from.top + from.height / 2)) * dir;
      if (el === cur || dy < 8) continue;
      const score = dy + Math.abs(r.left + r.width / 2 - (from.left + from.width / 2)) * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    best?.focus();
  }

  private render(first = false, focus?: string): void {
    if (!this.modal) return;
    const keep = focus ?? (first ? null : ((document.activeElement as HTMLElement | null)?.dataset?.key ?? null));
    clear(this.modal);
    const run = !!myRun();
    const closeBtn = h('button', { class: 'close', type: 'button', 'aria-label': A11Y_T.close }, '✕');
    onTap(closeBtn, () => this.close());
    const body = h('div', { class: 'body' });

    /** A tile: a picture and one word (`shown` is the word with a soft hyphen in it); `key` is the keyboard's shortcut (shown on a computer), `stay` keeps the menu up (a switch). */
    const tile = (id: string, icon: string, word: string, text: string, fn: () => void, o: { key?: string; pressed?: boolean; stay?: boolean; cls?: string; shown?: string } = {}): HTMLElement => {
      const b = h(
        'button',
        { class: `menu-tile ${o.cls ?? ''}`.trim(), type: 'button', 'data-key': id, 'aria-label': word, ...(o.pressed === undefined ? {} : { 'aria-pressed': String(o.pressed) }) },
        h('span', { class: 'ic', 'aria-hidden': 'true' }, icon),
        h('span', { class: 'lb' }, o.shown ?? word),
        o.key ? h('kbd', { class: 'kb', 'aria-hidden': 'true' }, o.key) : null,
      );
      cards.info(b, icon, word, o.key ? `${text} ${MENU_T.keyIs.replace('{key}', o.key)}` : text);
      cards.tap(b, () => {
        if (o.stay) {
          fn();
          this.render(false, id);
        } else {
          // the menu goes first (the focus is back on ☰), then the thing opens: closing that brings the focus to ☰ too
          this.close();
          fn();
        }
      });
      return b;
    };
    const group = (name: string, ...tiles: (HTMLElement | null | false)[]): HTMLElement => h('section', { class: 'menu-group', role: 'group', 'aria-label': name }, h('h3', null, name), h('div', { class: 'menu-tiles' }, ...tiles));

    // "Förklara" is a switch: it is turned on and off here, so it does not explain itself instead of switching (onTap, not cards.tap)
    const explain = h('button', { class: 'menu-tile', type: 'button', 'data-key': 'explain', 'aria-label': A11Y_T.explain, 'aria-pressed': String(cards.mode) }, h('span', { class: 'ic dark', 'aria-hidden': 'true' }, '❔'), h('span', { class: 'lb' }, A11Y_T.explain));
    cards.info(explain, '❔', A11Y_T.explain, RUN_UI.explainOn);
    onTap(explain, () => {
      if (cards.suppressed()) return;
      if (cards.mode) {
        cards.setMode(false);
        cards.hide();
        return;
      }
      // on: the menu goes away so the things on the screen can be tapped; ☰ carries a ? while it is on, and it is turned off here
      this.close();
      cards.setMode(true);
      cards.note('❔', A11Y_T.explain, RUN_UI.explainOn);
    });

    const fsEl = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
    const muted = isMuted();
    body.append(
      group(
        MENU_T.mine,
        tile('gear', '👕', MENU_T.gear, A11Y_T.btnGear, event('vt:gear'), { key: 'G' }),
        tile('bag', '🎒', T.inventory, A11Y_T.btnBag, () => this.act.open('inventory'), { key: 'Q' }),
        tile('emotes', '😊', A11Y_T.emotes, A11Y_T.btnEmotes, () => this.act.open('emotes'), { key: 'F' }),
        tile('journal', '📖', MENU_T.journal, A11Y_T.btnJournal, event('vt:journal'), { key: 'B' }),
        inOwnHouse() && tile('furnish', '🪑', HOUSE_T.furnish, A11Y_T.btnFurnish, () => this.act.furnish(), { pressed: furnish.on }),
      ),
      group(
        MENU_T.help,
        tile('help', '❓', T.help, A11Y_T.btnHelp, () => this.act.open('help'), { key: 'H' }),
        explain,
        tile('settings', '⚙️', A11Y_T.settings, A11Y_T.settingsInfo, event('vt:settings'), { shown: MENU_T.settings }),
        tile(
          'sound',
          muted ? '🔇' : '🔊',
          muted ? MENU_T.soundOff : MENU_T.soundOn,
          A11Y_T.btnSound,
          () => {
            setMuted(!isMuted());
            try {
              localStorage.setItem('varldstradet.muted', isMuted() ? '1' : '0');
            } catch {
              /* ignore */
            }
          },
          { pressed: !muted, stay: true },
        ),
        // (a game started from the home screen already fills the screen)
        !standalone &&
          tile('fullscreen', '⛶', T.fullscreen, A11Y_T.btnFullscreen, () => {
            // iPhone Safari can't make a page fullscreen; a game started from the home screen fills the screen instead
            if (!fsEl.requestFullscreen && !fsEl.webkitRequestFullscreen) return this.act.toast(T.fullscreenIphone, 8000);
            if (document.fullscreenElement) void document.exitFullscreen();
            else void (fsEl.requestFullscreen?.() ?? fsEl.webkitRequestFullscreen?.())?.catch(() => {});
          }, { pressed: !!document.fullscreenElement }),
      ),
    );
    if (run) {
      // going home ends the run for you: it stands apart, at the end, and the window it opens asks first
      const leave = tile('leave', '🚪', RUN_UI.home, RUN_UI.infoHome, event('vt:runleave'), { cls: 'danger' });
      body.append(h('div', { class: 'menu-run' }, group(MENU_T.run, tile('minimap', '🧭', MENU_T.minimap, A11Y_T.btnMap, () => this.act.minimap(), { key: 'M' })), h('div', { class: 'menu-leave' }, leave)));
    }
    const panel = h('div', { class: 'panel menu-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'menu-title' }, h('h2', { id: 'menu-title' }, `☰ ${MENU_T.title}`, h('span', { class: 'spacer' }), closeBtn), body);
    this.modal.append(panel);
    cards.quiet = true;
    ((keep ? this.modal.querySelector<HTMLElement>(`[data-key="${keep}"]`) : null) ?? body.querySelector<HTMLElement>('button') ?? closeBtn).focus({ preventScroll: true });
    cards.quiet = false;
  }
}
