// Everything that makes the HUD and the windows work for keyboard, gamepad, screen readers and touch without each window doing
// it by hand: windows become dialogs (role, name, the focus goes in, stays in and comes back), round buttons and chips become real
// buttons for the keyboard, every hover-only `title=` becomes an info card, and `announce()` says important things to screen
// readers. It watches #ui, so windows and buttons the other parts of the game add later get the same treatment.
import { A11Y_T } from '@lilla-garden/shared';
import { cards } from './info.ts';
import { h } from './dom.ts';

const live = h('div', { class: 'a11y-live', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
const alertLive = h('div', { class: 'a11y-live', role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' });
let lastSaid = '';
let lastAt = 0;

/** A line for screen readers (it sits out of sight). `urgent` interrupts what is being read. The same line is not said twice in 2 s. */
export function announce(text: string, urgent = false): void {
  const now = performance.now();
  if (text === lastSaid && now - lastAt < 2000) return;
  lastSaid = text;
  lastAt = now;
  const el = urgent ? alertLive : live;
  el.textContent = '';
  // a changed text is what the reader notices
  window.setTimeout(() => (el.textContent = text), 30);
}

/** What a thing's accessible name should be when it only has a picture. */
const emojiOnly = (s: string): boolean => /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\s️‍\d]+$/u.test(s);

/** Elements that are clicked with a finger or a mouse but are not buttons: made reachable and usable from the keyboard. */
const PSEUDO = '.round, .chip.level, .slot, .saga-member, .swatch, .picker .card, .tnode';

function makeButton(el: HTMLElement): void {
  if (el.matches('button, a[href], input, select, textarea') || el.dataset.a11y) return;
  el.dataset.a11y = '1';
  if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  if (el.matches('.slot') && !el.hasAttribute('aria-label') && !el.dataset.infoName) el.setAttribute('aria-label', A11Y_T.emptySlot);
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.click();
    }
  });
  // onTap() handlers listen to pointerup and click: a click made here reaches them
}

/** Hover-only explanations (title=) become info cards. */
function titleToCard(el: HTMLElement): void {
  const title = el.getAttribute('title');
  if (!title) return;
  el.removeAttribute('title');
  const own = (el.textContent ?? '').trim();
  const long = title.length > 28 && own && own.length < title.length;
  const name = long ? own : title;
  const icon = emojiOnly(own) ? own : (own.match(/^\p{Extended_Pictographic}\S*/u)?.[0] ?? '');
  if (!el.getAttribute('aria-label') && (!own || emojiOnly(own))) el.setAttribute('aria-label', long ? `${name}. ${title}` : name);
  if (el.dataset.infoName) return;
  cards.info(el, icon, long ? name.replace(/^\p{Extended_Pictographic}\S*\s*/u, '') || name : name, long ? title : '');
}

let openers: HTMLElement[] = [];
let dialogs = 0;

function dialogOf(modal: HTMLElement): void {
  const panel = modal.querySelector<HTMLElement>(':scope > .panel');
  if (!panel || panel.dataset.dialog) return;
  panel.dataset.dialog = '1';
  if (!panel.hasAttribute('role')) panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const head = panel.querySelector<HTMLElement>('h2, h1');
  if (head) {
    if (!head.id) head.id = `dlg-${++dialogs}`;
    panel.setAttribute('aria-labelledby', head.id);
  }
  if (!panel.hasAttribute('tabindex')) panel.tabIndex = -1;
  // the close button is a real, big button with a name
  const close = panel.querySelector<HTMLElement>('button.close');
  if (close && !close.getAttribute('aria-label')) close.setAttribute('aria-label', 'Stäng');
  // the focus goes in (on the window itself, so a screen reader reads its name and Tab starts at the top)
  if (!modal.contains(document.activeElement)) {
    cards.quiet = true;
    panel.focus({ preventScroll: true });
    cards.quiet = false;
  }
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"]')].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
}

function scan(root: ParentNode): void {
  if (root instanceof HTMLElement) {
    if (root.hasAttribute('title')) titleToCard(root);
    if (root.matches(PSEUDO)) makeButton(root);
    if (root.matches('.modal')) dialogOf(root);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[title]')) titleToCard(el);
  for (const el of root.querySelectorAll<HTMLElement>(PSEUDO)) makeButton(el);
  for (const el of root.querySelectorAll<HTMLElement>('.modal')) dialogOf(el);
}

export function initAccess(ui: HTMLElement): void {
  ui.append(live, alertLive);
  cards.start();
  scan(ui);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') {
        if (m.attributeName === 'title') titleToCard(m.target as HTMLElement);
        continue;
      }
      for (const n of m.addedNodes) if (n instanceof HTMLElement) scan(n);
      for (const n of m.removedNodes) {
        if (n instanceof HTMLElement && n.matches('.modal') && !ui.querySelector('.modal')) {
          // the window is gone: the focus goes back to what opened it
          const back = openers.pop();
          openers = [];
          if (back?.isConnected) {
            cards.quiet = true;
            back.focus({ preventScroll: true });
            cards.quiet = false;
          }
        }
      }
    }
  }).observe(ui, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
  // remember what had the focus when a window opens (it is a div the window is added after: the observer runs later, so keep the last focus)
  let lastFocus: HTMLElement | null = null;
  document.addEventListener('focusin', (e) => {
    if (!(e.target as HTMLElement).closest?.('.modal')) lastFocus = e.target as HTMLElement;
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = (e.target as HTMLElement).closest?.<HTMLElement>('button, [role=button], .round');
      if (t && !t.closest('.modal')) lastFocus = t;
    },
    true,
  );
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n instanceof HTMLElement && n.matches('.modal') && lastFocus) openers.push(lastFocus);
  }).observe(ui, { childList: true });
  // Tab stays inside the open window (the run's windows do it themselves)
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Tab') return;
      const modal = ui.querySelector<HTMLElement>('.modal');
      if (!modal || modal.querySelector('.run-panel')) return;
      const list = focusables(modal);
      if (!list.length) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = at < 0 ? (e.shiftKey ? list.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + list.length) % list.length;
      e.preventDefault();
      e.stopPropagation();
      list[next]!.focus();
    },
    true,
  );
}
