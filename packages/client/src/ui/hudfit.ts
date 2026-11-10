// Where the bottom of the HUD goes, measured, so that nothing is drawn over anything at any screen size, text size or HUD size.
//
// The pieces: the chat/pet/more buttons and the runor chip at one side, the big "Slå" and "Spring" buttons on a touch screen at the
// other, the spell bar (one row when it fits between them, else two) or the hotbar in the lobby between them, the hero/target frames and
// the party's frames. The sizes come from CSS (hud.css: from the shorter side of the screen, the text size and the HUD size); this file
// measures what that made and sets the free space between the two sides as `--res-l` and `--res-r` (what the bar may not cross), and
// `--left-stack` (how high the pieces at the left reach, so the party's frames wrap before they get there).
import { bus } from '../state.ts';

const visible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement) || el.hidden) return false;
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
};

const EDGE = 12;
let started = false;
let last = '';

/** Below this the chat, pet and more buttons are one row of three and the rest waits behind the "more" button. */
export const compactScreen = (): boolean => window.innerWidth < 1240 || window.innerHeight <= 620;

function fit(): void {
  const body = document.body;
  const root = document.documentElement;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const touch = body.classList.contains('touch');
  body.classList.toggle('hud-compact', compactScreen());

  const q = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);
  const social = q('.social');
  const runor = q('.run-runor');
  const act = q('.act-btn');
  const run = q('.run-btn');
  const bar = q('.saga-bar');
  const hotbar = q('.hotbar');

  // what stands in the lower half of the screen, at the left or at the right (the runor chip may be at the top right: it is not part of the bottom)
  const lower = [social, runor, ...(touch ? [act, run] : [])].filter(visible).map((e) => e.getBoundingClientRect()).filter((r) => r.top + r.height / 2 > vh / 2);
  const atLeft = lower.filter((r) => r.left + r.width / 2 < vw / 2);
  const atRight = lower.filter((r) => r.left + r.width / 2 >= vw / 2);
  let resL = (atLeft.length ? Math.max(...atLeft.map((r) => r.right)) : 0) + EDGE;
  let resR = (atRight.length ? vw - Math.min(...atRight.map((r) => r.left)) : 0) + EDGE;
  const leftTop = atLeft.length ? Math.min(...atLeft.map((r) => r.top)) : vh;
  // (the runor chip stands on the buttons, so the buttons alone decide where it goes)
  const stackTop = visible(social) ? social.getBoundingClientRect().top : vh;
  // the spell bar: one row if it fits, else two; the lobby's hotbar scrolls in what is left
  let rows2 = false;
  const barUp = visible(bar);
  let need = 0;
  if (barUp) {
    const btns = [...bar!.querySelectorAll<HTMLElement>('.saga-spell')].filter(visible);
    const cs = getComputedStyle(bar!);
    const frame = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const bw = btns[0]?.offsetWidth ?? 0;
    const potion = touch ? 0 : EDGE; // (the potion stands a little apart from the spells on a computer)
    need = btns.length * bw + Math.max(0, btns.length - 1) * EDGE + frame + (btns.some((b) => b.classList.contains('potion')) ? potion : 0);
    const free = vw - resL - resR;
    if (touch) rows2 = need > free;
    else {
      const sym = Math.max(resL, resR);
      if (vw - 2 * sym >= need) resL = resR = sym;
      else {
        resR = EDGE;
        rows2 = vw - resL - resR < need;
        if (rows2 && vw - 2 * sym >= 4 * bw + 3 * EDGE + frame) resL = resR = sym;
      }
    }
  } else if (visible(hotbar)) {
    need = hotbar!.scrollWidth;
    if (!touch) {
      const sym = Math.max(resL, resR);
      if (vw - 2 * sym >= need) resL = resR = sym;
      else resR = EDGE;
    }
  }
  bar?.classList.toggle('rows2', rows2);
  // the hero's and the target's frames stand over the middle of the bar
  const bb = barUp ? bar!.getBoundingClientRect() : null;
  const cx = bb ? Math.round(bb.left + bb.width / 2) : 0;

  const key = [resL, resR, Math.round(leftTop), Math.round(stackTop), rows2, compactScreen(), cx].join();
  if (key === last) return;
  last = key;
  const st = root.style;
  st.setProperty('--res-l', `${Math.round(resL)}px`);
  st.setProperty('--res-r', `${Math.round(resR)}px`);
  st.setProperty('--left-stack', `${Math.round(vh - leftTop + EDGE)}px`);
  if (cx) st.setProperty('--bar-cx', `${cx}px`);
  else st.removeProperty('--bar-cx');
  st.setProperty('--social-up', `${Math.round(vh - stackTop + EDGE)}px`);
}

/** Starts the measuring: at a resize, a change of the settings or the device, a new state, and twice a second (windows come and go). */
export function initHudFit(): void {
  if (started) return;
  started = true;
  const go = (): void => fit();
  window.addEventListener('resize', go);
  document.addEventListener('vt:prefs', go);
  document.addEventListener('vt:device', go);
  bus.on('state', go);
  bus.on('me', go);
  bus.on('area', go);
  window.setInterval(go, 400);
  // twice: the first pass sets the classes the CSS needs, the second measures what they made
  go();
  window.requestAnimationFrame(go);
}
