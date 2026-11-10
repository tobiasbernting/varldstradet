// The message lane and the log.
//
// Everything the game writes on the screen for a moment (toasts, the title banners of a saga or a stop, a boss's shout, the
// aiming hint, the note after a boss) goes through `say()` / `lane.show()`. The lane is one column at the top centre, directly
// under the run bar and the round buttons, and between the stacks of frames on the left and the quest tracker on the right. The
// panels that stay up (the boss bar, the vote on the way on, the button that brings a window back) sit in the same column
// BELOW the lane (`.hud-center`), so a panel is never drawn over a message and a message never over a panel: the column grows
// downwards and the panels move down with it. Several messages stack; what does not fit waits its turn.
//
// `say()` also writes the line to the log (the "Logg" window, ui/log.ts): the last few hundred lines of the page session, in memory
// and in sessionStorage, so they survive an area change and a reconnect. Nothing is stored on the server.
import { LOG_T } from '@varldstradet/shared';
import { bus, client } from '../state.ts';
import { announce } from './access.ts';
import { h } from './dom.ts';
import './lane.css';

// ---------------------------------------------------------------------------------------------------------------- the log

export type LogKind = 'system' | 'story' | 'yell' | 'run' | 'loot' | 'level' | 'hero' | 'chat';
/** One picture per kind (the window writes the kind's word beside it too, so colour is never the only sign). */
export const KIND_ICON: Record<LogKind, string> = { system: 'ℹ️', story: '📜', yell: '📣', run: '🧭', loot: '🎁', level: '⭐', hero: '🛡️', chat: '💬' };

export interface LogLine {
  id: number;
  at: number;
  kind: LogKind;
  icon: string;
  text: string;
  sub?: string;
  /** Who it concerns, when that is not obvious from the text (a chat line's speaker, the hero who fell). */
  who?: string;
  /** For chat: a line the server sends again after a reconnect is not written twice. */
  key?: string;
}

const MAX_LINES = 300;
const LS = 'varldstradet.log';

class MsgLog {
  lines: LogLine[] = [];
  /** Lines written since the window was last open. */
  unread = 0;
  private next = 1;
  private listeners = new Set<() => void>();
  private keys = new Set<string>();
  private saveTimer = 0;
  private owner = '';

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  add(line: Omit<LogLine, 'id' | 'at'> & { at?: number }, silent = false): LogLine | null {
    if (line.key) {
      if (this.keys.has(line.key)) return null;
      this.keys.add(line.key);
    }
    const full: LogLine = { ...line, id: this.next++, at: line.at ?? Date.now() };
    // a history line from the server may be older than what is already there
    let i = this.lines.length;
    while (i > 0 && this.lines[i - 1]!.at > full.at && line.at !== undefined) i--;
    this.lines.splice(i, 0, full);
    if (this.lines.length > MAX_LINES) {
      const gone = this.lines.shift()!;
      if (gone.key) this.keys.delete(gone.key);
    }
    if (!silent) this.unread++;
    this.changed();
    return full;
  }

  markRead(): void {
    if (!this.unread) return;
    this.unread = 0;
    this.changed();
  }

  private changed(): void {
    this.listeners.forEach((fn) => fn());
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 400);
  }

  private save(): void {
    try {
      sessionStorage.setItem(LS, JSON.stringify({ me: this.owner, lines: this.lines, unread: this.unread }));
    } catch {
      /* no storage: the log lives in memory */
    }
  }

  /** At every welcome: the same character keeps its log (a reconnect, a reload of the tab); another one starts a new one. */
  bind(me: string): void {
    if (this.owner === me) return;
    const early = this.owner === '' ? this.lines : [];
    this.owner = me;
    this.lines = [];
    this.keys.clear();
    this.unread = 0;
    try {
      const raw = sessionStorage.getItem(LS);
      const saved = raw ? (JSON.parse(raw) as { me?: string; lines?: LogLine[]; unread?: number }) : null;
      if (saved && saved.me === me && Array.isArray(saved.lines)) {
        this.lines = saved.lines.filter((l) => l && typeof l.text === 'string').slice(-MAX_LINES);
        this.next = Math.max(0, ...this.lines.map((l) => l.id)) + 1;
        for (const l of this.lines) if (l.key) this.keys.add(l.key);
        this.unread = Math.min(saved.unread ?? 0, this.lines.length);
      }
    } catch {
      /* ignore */
    }
    // lines written before the welcome (a chat history that came first) join the saved ones
    for (const l of early) this.add({ kind: l.kind, icon: l.icon, text: l.text, sub: l.sub, who: l.who, key: l.key, at: l.at }, true);
    this.changed();
  }
}

export const msglog = new MsgLog();

// ---------------------------------------------------------------------------------------------------------------- reading time

/**
 * How long a message stays: a base and a share per letter, so a long sentence stays long enough to read. It is not made shorter by the
 * calm screen or the reduced-motion choice (those take away movement, not time).
 */
export function readMs(...texts: (string | undefined)[]): number {
  const n = texts.reduce((sum, t) => sum + (t?.length ?? 0), 0);
  return Math.min(14000, Math.max(3500, 1800 + n * 75));
}

// ---------------------------------------------------------------------------------------------------------------- the lane

export interface LaneItem {
  el: HTMLElement;
  /** How long it stays once it is up (ms). */
  ms: number;
  /** Called when it comes up (a sound, confetti). */
  onShow?: () => void;
  /** The same key twice in a row replaces: a message that is already up is not shown again. */
  key?: string;
  /** When it was asked for (set by the lane). */
  queuedAt?: number;
}

interface Shown {
  item: LaneItem;
  timer: number;
}

class Lane {
  readonly root = h('div', { class: 'msg-lane', 'data-lane': '1' });
  private pending: LaneItem[] = [];
  private shown: Shown[] = [];
  /** How tall the lane may get (px); the layout sets it. */
  budget = 260;
  /** The lowest the lane may reach (the spell bar's top, or the lower part of the screen). */
  limit = 9999;
  /** How low a second message may reach (a short screen keeps the middle, where the hero is, free). */
  soft = 9999;
  maxShown = 3;
  onCount: (n: number) => void = () => {};

  show(item: LaneItem): void {
    item.queuedAt = Date.now();
    if (item.key && (this.shown.some((s) => s.item.key === item.key) || this.pending.some((p) => p.key === item.key))) return;
    // a title card goes before the hints and notes that are waiting: it says what is happening now
    const card = item.el.classList.contains('saga-banner');
    const at = card ? this.pending.findIndex((p) => !p.el.classList.contains('saga-banner')) : -1;
    if (at >= 0) this.pending.splice(at, 0, item);
    else this.pending.push(item);
    this.pump();
  }

  count(): number {
    return this.shown.length;
  }

  /** Brings the next waiting messages up while there is room (one is always allowed: a lane that is empty shows it whatever its size). */
  pump(): void {
    // what has waited too long is no news any more (the log has it)
    const now = Date.now();
    this.pending = this.pending.filter((p) => now - (p.queuedAt ?? now) < 20000);
    while (this.pending.length && this.shown.length < this.maxShown) {
      const item = this.pending[0]!;
      item.el.classList.add('measuring');
      this.root.append(item.el);
      const top = this.root.getBoundingClientRect().top;
      const room = Math.min(this.budget, this.limit - top - 4);
      // a second message must also stay above the hero (soft); the first may go down to the pieces of the HUD (limit). One message is
      // always allowed when nothing else is up and nothing stands above the lane. Otherwise what does not fit waits (a vote on a short
      // screen leaves no room: the message comes when the vote is gone) and is dropped after 20 s (the log has it).
      const alone = !this.shown.length && top - (this.root.parentElement?.getBoundingClientRect().top ?? 0) < 4;
      const own = this.root.offsetHeight;
      if (!alone && (own > room || (this.shown.length > 0 && own > this.soft - top - 4))) {
        item.el.remove();
        item.el.classList.remove('measuring');
        return;
      }
      this.pending.shift();
      item.el.classList.remove('measuring');
      item.el.classList.add('in');
      this.shown.push({ item, timer: 0 });
      this.arm(item, item.ms);
      this.onCount(this.shown.length);
      try {
        item.onShow?.();
      } catch (e) {
        console.error(e);
      }
    }
  }

  /** A window over the screen hides the lane under its dimming: the message waits (up to 20 s) so it is read once the window is closed. */
  private arm(item: LaneItem, ms: number, waited = 0): void {
    const s = this.shown.find((x) => x.item === item);
    if (!s) return;
    s.timer = window.setTimeout(() => {
      if (waited < 20000 && document.querySelector('#ui .modal')) this.arm(item, 500, waited + 500);
      else this.hide(item);
    }, ms);
  }

  private hide(item: LaneItem): void {
    const i = this.shown.findIndex((s) => s.item === item);
    if (i < 0) return;
    this.shown.splice(i, 1);
    item.el.classList.add('out');
    window.setTimeout(() => {
      item.el.remove();
      this.onCount(this.shown.length);
      this.pump();
    }, 450);
  }

  /** At the end of a run or a change of map the waiting messages of the old place are dropped; what is up stays its time. */
  clearPending(): void {
    this.pending = [];
  }
}

export const lane = new Lane();

// ---------------------------------------------------------------------------------------------------------------- the column and its place

let column: HTMLElement | null = null;

/** The column at the top centre: the message lane first, then the panels that dock under it. Made once by the HUD. */
export function centerColumn(hudRoot?: HTMLElement): HTMLElement {
  if (column) return column;
  column = h('div', { class: 'hud-center' }, lane.root);
  if (hudRoot) hudRoot.append(column);
  lane.onCount = (n) => {
    column!.classList.toggle('has-msg', n > 0);
    // (what a panel in the column does when there is a message above it is in lane.css)
  };
  const place = (): void => layout();
  window.addEventListener('resize', place);
  window.setInterval(place, 500);
  bus.on('state', place);
  bus.on('me', place);
  bus.on('area', place);
  return column;
}

const visible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement) || el.hidden) return false;
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
};

/** Where the HUD's panels are (refreshed by the layout): a world label that would be drawn under one of them hides instead. */
let hudRects: DOMRect[] = [];
export function underHud(r: DOMRect): boolean {
  return hudRects.some((h) => r.left < h.right && r.right > h.left && r.top < h.bottom && r.bottom > h.top);
}

/**
 * Where the column goes: under the lowest of the run bar and the round buttons, between whatever stands at the left (the minimap,
 * the party's frames) and at the right (the quest tracker). Measured, not guessed, so it holds at every screen size and text size.
 */
function layout(): void {
  if (!column || !column.isConnected) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const root = column.offsetParent instanceof HTMLElement ? column.offsetParent : document.body;
  const origin = root.getBoundingClientRect();
  // the round buttons fold into one menu button on a short screen in a run (ui/run.css): they are then not part of the top
  const inRun = document.body.classList.contains('in-run');
  const menuMode = inRun && vh <= 500;
  const hudRight = document.querySelector('.hud-right');
  const rightBottom = visible(hudRight) && !menuMode ? hudRight.getBoundingClientRect().bottom : 0;
  const root0 = document.documentElement.style;
  root0.setProperty('--bar-top', `${vw >= 1400 || menuMode ? 8 : Math.round(rightBottom + 2)}px`);
  let top = 8;
  for (const sel of ['.hud-top', '.hud-right', '.run-bar', '.hud-menu-btn']) {
    const el = document.querySelector(sel);
    if (sel === '.hud-right' && menuMode) continue;
    if (visible(el)) top = Math.max(top, el.getBoundingClientRect().bottom + 8);
  }
  root0.setProperty('--hud-top', `${Math.round(top)}px`);
  const sbar = document.querySelector('.saga-bar');
  root0.setProperty('--bar-gap', visible(sbar) ? `${Math.round(vh - sbar.getBoundingClientRect().top + 8)}px` : 'calc(29 * var(--u))');
  const map = document.querySelector('.minimap');
  root0.setProperty('--party-top', `${Math.round(visible(map) ? map.getBoundingClientRect().bottom + 8 : top)}px`);
  let left = 8;
  let right = 8;
  for (const sel of ['.minimap', '.saga-party', '.saga-tracker', '.act-btn', '.run-btn', '.run-runor']) {
    const el = document.querySelector(sel);
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    // only what stands in the column's reach (a frame far down the screen does not matter)
    if (r.bottom < top || r.top > top + 340) continue;
    if (r.left + r.width / 2 < vw / 2) left = Math.max(left, r.right + 8);
    else right = Math.max(right, vw - r.left + 8);
  }
  // keep it centred when there is room for the widest message; otherwise take the room that is there
  const sym = Math.max(left, right);
  if (vw - 2 * sym >= 420) left = right = sym;
  column.style.setProperty('--lane-top', `${Math.round(top - origin.top)}px`);
  column.style.setProperty('--lane-left', `${Math.round(left - origin.left)}px`);
  column.style.setProperty('--lane-right', `${Math.round(origin.right - vw + right)}px`);
  hudRects = ['.run-bar', '.minimap', '.saga-party', '.saga-units', '.saga-bar', '.hud-center > *', '.hud-right > *', '.social', '.hotbar', '.act-btn', '.run-btn']
    .flatMap((sel) => [...document.querySelectorAll(sel)])
    .filter(visible)
    .map((e) => e.getBoundingClientRect());
  lane.budget = 320;
  const units = document.querySelector('.saga-units');
  const lowest = Math.min(visible(sbar) ? sbar.getBoundingClientRect().top : vh * 0.62, visible(units) ? units.getBoundingClientRect().top : 9999);
  // the big touch buttons stand at the side: the lane stops above them too; and on a short screen it stops above the hero (the middle)
  const side = ['.act-btn', '.run-btn'].map((s) => document.querySelector(s)).filter(visible).map((e) => e.getBoundingClientRect().top - 8);
  lane.limit = Math.min(lowest, ...side);
  lane.soft = vh < 700 ? vh * 0.42 : 9999;
  lane.maxShown = vh < 520 ? 2 : 3;
  lane.pump();
}

// ---------------------------------------------------------------------------------------------------------------- say

export interface SayOpts {
  kind?: LogKind;
  icon?: string;
  /** A second line (a banner's subtitle). */
  sub?: string;
  who?: string;
  /** How long it stays (ms); the default is by the length of the words. */
  ms?: number;
  /** Written to the log (default yes). */
  log?: boolean;
  /** Shown in the lane (default yes). */
  show?: boolean;
  /** Said to screen readers (default yes for what is shown). */
  announce?: boolean;
  /** A class for the item (a banner's kind). */
  cls?: string;
  /** Replaces the plain box (a banner with a picture in it). */
  el?: HTMLElement;
  onShow?: () => void;
}

/** What a toast is about, from its words (the server sends only text): a reward, a thing about the run, or just a message. */
export function classifyToast(text: string, inRun: boolean): LogKind {
  if (/^Bragd|^Nivå \d/i.test(text)) return 'level';
  if (/sagafrön|silver|trofé|utseende|titel|gåva|fick |nytt djur|rustning|grejer|garderoben|väskan|huset|hänger i/i.test(text)) return 'loot';
  if (/köpte/i.test(text)) return 'run';
  return inRun ? 'run' : 'system';
}

/** Writes a line to the log and puts it in the lane. Returns the log line. */
export function say(text: string, o: SayOpts = {}): LogLine | null {
  const kind = o.kind ?? 'system';
  const icon = o.icon ?? KIND_ICON[kind];
  const line = o.log === false ? null : msglog.add({ kind, icon, text, ...(o.sub ? { sub: o.sub } : {}), ...(o.who ? { who: o.who } : {}) });
  if (o.show !== false) {
    const el = o.el ?? h('div', { class: `toast ${o.cls ?? ''}`.trim() }, h('span', { class: 'ic', 'aria-hidden': 'true' }, icon), h('span', { class: 'tx' }, text));
    if (!el.classList.contains('lane-item')) el.classList.add('lane-item');
    lane.show({ el, ms: o.ms ?? readMs(text, o.sub), key: `${kind}:${text}`, onShow: o.onShow });
  }
  if (o.announce !== false && o.show !== false) announce(o.sub ? `${text}. ${o.sub}` : text);
  return line;
}

// ---------------------------------------------------------------------------------------------------------------- chat in the log

bus.on('welcome', () => msglog.bind(client.me));
bus.on('chat', (c) => {
  // a boss's shout is also sent as a chat line (so the chat can show it again); the log has it as a shout already
  if (!c.from) return;
  msglog.add({ kind: 'chat', icon: KIND_ICON.chat, text: c.text, who: c.name, at: c.at, key: `${c.from}|${c.at}|${c.text}` }, !!c.old || c.from === client.me);
});

export const logTexts = LOG_T;
