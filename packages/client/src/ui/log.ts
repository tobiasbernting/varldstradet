// "Logg": a window with everything the game wrote on the screen for a moment (ui/lane.ts keeps the lines). Opened from the 📜 button
// at the top right (one of the HUD's three), the key L, the help window and the gamepad (the HUD ring, or the help). It does not pause the game. The newest line is at
// the bottom and the view stays there unless the player scrolled up; a button goes back to the newest. Filters: Alla, Händelser, Chatt.
// A window like the others: a dialog, Escape and the gamepad's B close it, the focus comes back to what opened it.
import { A11Y_T, LOG_T } from '@varldstradet/shared';
import { prefs } from '../a11y.ts';
import { cards } from './info.ts';
import { KIND_ICON, msglog, type LogKind, type LogLine } from './lane.ts';
import { clear, h, onTap } from './dom.ts';
import './log.css';
import { canSpeak, speak } from './speech.ts';

type Filter = 'all' | 'events' | 'chat';
const FILTERS: Filter[] = ['all', 'events', 'chat'];
const FILTER_NAME: Record<Filter, string> = { all: LOG_T.all, events: LOG_T.events, chat: LOG_T.chat };
const FILTER_ICON: Record<Filter, string> = { all: '📜', events: '🧭', chat: '💬' };

const clock = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The HUD's button: a scroll with the word (the scroll alone where the run bar is narrow), and a dot when something was written since the window was last open. */
export function createLogButton(): HTMLElement {
  const dot = h('i', { class: 'dot', 'aria-hidden': 'true', hidden: true });
  const b = h('button', { class: 'round log-btn', type: 'button', 'aria-label': LOG_T.btn }, h('span', { class: 'ic', 'aria-hidden': 'true' }, '📜'), h('span', { class: 'lb' }, LOG_T.btn), dot);
  cards.info(b, '📜', LOG_T.title, LOG_T.btnInfo);
  cards.tap(b, () => document.dispatchEvent(new Event('vt:log')));
  const sync = (): void => {
    const has = msglog.unread > 0;
    dot.hidden = !has;
    b.classList.toggle('unread', has);
    b.setAttribute('aria-label', has ? `${LOG_T.btn}. ${LOG_T.newDot}` : LOG_T.btn);
  };
  msglog.on(sync);
  sync();
  return b;
}

export class LogUi {
  onChange: (open: boolean) => void = () => {};
  private modal: HTMLElement | null = null;
  private opener: HTMLElement | null = null;
  private filter: Filter = 'all';
  private list: HTMLElement | null = null;
  private toNewest: HTMLElement | null = null;
  /** The view follows the newest line until the player scrolls up. */
  private pinned = true;
  private chips = new Map<Filter, HTMLElement>();
  private shownIds = '';

  constructor(
    private ui: HTMLElement,
    private chatOpen: () => void,
  ) {
    document.addEventListener('vt:log', () => (this.modal ? this.close() : this.open()));
    document.addEventListener('vt:voices', () => this.modal && this.renderList());
    msglog.on(() => {
      if (!this.modal) return;
      msglog.markRead();
      this.renderList();
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.modal) return;
        const k = e.key;
        const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
        if (k === 'Escape' || ((k === 'l' || k === 'L') && !typing)) {
          e.preventDefault();
          e.stopPropagation();
          this.close();
          return;
        }
        // the keys that scroll the list are used here; the rest do not reach the game under the window
        const list = this.list;
        if (list && (k === 'ArrowUp' || k === 'ArrowDown' || k === 'PageUp' || k === 'PageDown' || k === 'Home' || k === 'End')) {
          e.preventDefault();
          e.stopPropagation();
          if (k === 'ArrowUp') list.scrollBy(0, -64);
          else if (k === 'ArrowDown') list.scrollBy(0, 64);
          else if (k === 'PageUp') list.scrollBy(0, -list.clientHeight * 0.85);
          else if (k === 'PageDown') list.scrollBy(0, list.clientHeight * 0.85);
          else if (k === 'Home') list.scrollTo(0, 0);
          else list.scrollTo(0, list.scrollHeight);
          return;
        }
        if (k !== 'Tab' && k !== 'Enter' && k !== ' ') e.stopPropagation();
      },
      true,
    );
  }

  isOpen(): boolean {
    return this.modal !== null;
  }

  open(): void {
    if (this.modal) return;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.modal = h('div', { class: 'modal log-modal' });
    this.modal.style.zIndex = '90';
    this.ui.append(this.modal);
    this.pinned = true;
    this.build();
    msglog.markRead();
    this.onChange(true);
  }

  close(): void {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    this.list = null;
    this.onChange(false);
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.opener = null;
  }

  private build(): void {
    if (!this.modal) return;
    const closeBtn = h('button', { class: 'close', type: 'button', 'aria-label': A11Y_T.close }, '✕');
    onTap(closeBtn, () => this.close());
    const chips = h('div', { class: 'log-chips', role: 'group', 'aria-label': LOG_T.filters });
    this.chips.clear();
    for (const f of FILTERS) {
      const b = h('button', { type: 'button', class: 'log-chip', 'data-filter': f, 'aria-pressed': String(f === this.filter) }, h('span', { 'aria-hidden': 'true' }, FILTER_ICON[f]), ' ', FILTER_NAME[f]);
      onTap(b, () => {
        this.filter = f;
        this.pinned = true;
        for (const [k, el] of this.chips) el.setAttribute('aria-pressed', String(k === f));
        this.renderList();
      });
      this.chips.set(f, b);
      chips.append(b);
    }
    this.list = h('ul', { class: 'body log-list', tabindex: '0', 'aria-label': LOG_T.title });
    this.list.addEventListener('scroll', () => {
      const l = this.list!;
      this.pinned = l.scrollHeight - l.scrollTop - l.clientHeight < 24;
      this.syncNewest();
    });
    this.toNewest = h('button', { type: 'button', class: 'log-newest', hidden: true }, `⬇️ ${LOG_T.newest}`);
    onTap(this.toNewest, () => {
      this.pinned = true;
      this.list?.scrollTo(0, this.list.scrollHeight);
      this.syncNewest();
    });
    const say = h('button', { type: 'button', class: 'alt log-say' }, `💬 ${LOG_T.say}`);
    onTap(say, () => {
      this.close();
      this.chatOpen();
    });
    cards.info(say, '💬', LOG_T.say, LOG_T.sayInfo);
    const panel = h(
      'div',
      { class: 'panel log-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'log-title' },
      h('h2', { id: 'log-title' }, `📜 ${LOG_T.title}`, h('span', { class: 'spacer' }), closeBtn),
      chips,
      this.list,
      h('div', { class: 'log-foot' }, this.toNewest, say),
    );
    this.modal.append(panel);
    this.renderList();
    cards.quiet = true;
    // the focus goes to the newest filter chip's group start, so a screen reader reads the window's name and the pad has a ring
    (this.chips.get(this.filter) ?? panel).focus({ preventScroll: true });
    cards.quiet = false;
  }

  private visibleLines(): LogLine[] {
    return msglog.lines.filter((l) => (this.filter === 'all' ? true : this.filter === 'chat' ? l.kind === 'chat' : l.kind !== 'chat'));
  }

  private renderList(): void {
    const list = this.list;
    if (!list) return;
    const lines = this.visibleLines();
    const sig = `${this.filter}:${lines.map((l) => l.id).join(',')}:${canSpeak() ? 1 : 0}`;
    if (sig === this.shownIds) return;
    this.shownIds = sig;
    const keepFromBottom = list.scrollHeight - list.scrollTop;
    clear(list);
    if (!lines.length) list.append(h('li', { class: 'log-empty' }, this.filter === 'chat' ? LOG_T.emptyChat : this.filter === 'events' ? LOG_T.emptyEvents : LOG_T.empty));
    for (const l of lines) list.append(this.row(l));
    if (this.pinned) list.scrollTop = list.scrollHeight;
    else list.scrollTop = Math.max(0, list.scrollHeight - keepFromBottom);
    this.syncNewest();
  }

  private row(l: LogLine): HTMLElement {
    const word = LOG_T.kinds[l.kind] ?? '';
    const showWho = !!l.who && (l.kind === 'chat' || !l.text.includes(l.who));
    const speakText = [showWho ? `${l.who}: ` : '', l.text, l.sub ? `. ${l.sub}` : ''].join('');
    const tag = h('span', { class: 'tag', title: undefined }, h('span', { class: 'ic', 'aria-hidden': 'true' }, l.icon || KIND_ICON[l.kind as LogKind]), h('span', { class: 'kw' }, word));
    const li = h(
      'li',
      { class: `log-line k-${l.kind}` },
      h('time', { class: 'tm', datetime: new Date(l.at).toISOString() }, clock(l.at)),
      tag,
      h('span', { class: 'tx' }, showWho ? h('b', { class: 'who' }, `${l.who}: `) : null, l.text, l.sub ? h('span', { class: 'sub' }, ` ${l.sub}`) : null),
    );
    if (canSpeak()) {
      const sp = h('button', { type: 'button', class: 'speak', 'aria-label': `${LOG_T.read}: ${speakText}` }, '🔊');
      onTap(sp, () => speak(speakText));
      li.append(sp);
    }
    return li;
  }

  private syncNewest(): void {
    if (this.toNewest) this.toNewest.hidden = this.pinned;
  }
}

/** Read-aloud as the settings have it (for a caller that wants to read a new line out loud as it comes). */
export const readsAloud = (): boolean => prefs().read && canSpeak();
