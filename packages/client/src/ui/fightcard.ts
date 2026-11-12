// The fight in pictures, for the HUD, the world's labels and the windows: the pip row (three rune pips, hollow when empty), the
// special pack monsters' markers (a leaf, an arrow, a shield: told apart by shape as well as colour), a cast's circle, and the
// "how you fight" strip of the class card, the run's start, the path picker, the journal and the spender's info card.
import { CLASSES, COMBO_TEXT, FIGHT_UI, PIP_ICONS, PIP_MAX, PIP_NAMES, PIP_TEXT, ROLE_NAMES, ROLE_TEXT, SPELLS, T, fmt, type ClassId, type MobRole } from '@varldstradet/shared';
import { PRIMER, pipCells } from '../fight.ts';
import { h } from './dom.ts';
import './fight.css';

const svg = (cls: string, viewBox: string, inner: string): HTMLElement => {
  const s = h('span', { class: cls, 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="${viewBox}" focusable="false">${inner}</svg>`;
  return s;
};

// ---------------------------------------------------------------------------------------------------------------- pips

/** One rune pip: a diamond, hollow while empty; filled it carries a little rune (so it reads without colour). */
const pip = (): HTMLElement => svg('pip', '0 0 16 16', '<path class="d" d="M8 1.2 14.8 8 8 14.8 1.2 8Z"/><path class="r" d="M6.3 4.6v6.8M6.3 6.2l3.6-2M6.3 9l3.6-2"/>');

/** A row of three pips in the class's colour (`--c`). Update it with `setPips`. */
export function pipRow(cls: ClassId, extra = ''): HTMLElement {
  const row = h('span', { class: `pips-row${extra ? ` ${extra}` : ''}`, 'aria-hidden': 'true' });
  row.style.setProperty('--c', CLASSES[cls].color);
  for (let i = 0; i < PIP_MAX; i++) row.append(pip());
  row.dataset.n = '0';
  return row;
}

/** Fills the row to `n`; the pips that came since last time pop (CSS), unless `quiet`. Returns how many it showed before. */
export function setPips(row: HTMLElement, n: number, quiet = false): number {
  const before = Number(row.dataset.n ?? 0);
  if (before === n) return before;
  row.dataset.n = String(n);
  pipCells(n, before).forEach((c, i) => {
    const el = row.children[i] as HTMLElement | undefined;
    if (!el) return;
    el.classList.toggle('on', c.on);
    if (c.pop && !quiet) {
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    } else if (!c.on) el.classList.remove('pop');
  });
  row.classList.toggle('full', n >= PIP_MAX);
  return before;
}

// ---------------------------------------------------------------------------------------------------------------- the special monsters

const ROLE_ART: Record<MobRole, string> = {
  // a round badge with a leaf
  healer: '<circle class="bg" cx="12" cy="12" r="10"/><path class="fg" d="M12 5.2c4.2 1.6 5.6 5.2 4.2 9.2-1 2.8-3 4-4.2 4.4-1.2-.4-3.2-1.6-4.2-4.4C6.4 10.4 7.8 6.8 12 5.2Z"/><path class="ln" d="M12 7.5v10.5M12 11l2.6-1.8M12 14l-2.6-1.8"/>',
  // a diamond badge with an arrow flying up to the right
  archer: '<path class="bg" d="M12 1.5 22.5 12 12 22.5 1.5 12Z"/><path class="ln w" d="M7 17 16 8"/><path class="fg" d="M17.6 6.4 17 11.2 12.8 7Z"/><path class="ln w" d="M7 17l-.4-3M7 17l3 .4"/>',
  // a shield-shaped badge with a boss in the middle
  shield: '<path class="bg" d="M12 1.8 21 5v6.6c0 5-3.6 8.8-9 10.6-5.4-1.8-9-5.6-9-10.6V5Z"/><path class="ln w" d="M12 5.5v13M6 9.5h12"/><circle class="fg" cx="12" cy="9.5" r="2.4"/>',
};

/**
 * The marker of a special pack monster (Besvärjare, Skytt, Sköldbärare): over its head in the world, in the target frame and in
 * the journal. THE one place the marker is drawn: swap or add the drawn role gear (packages/art) here.
 */
export function roleMarker(role: MobRole, extra = ''): HTMLElement {
  return svg(`role-mark r-${role}${extra ? ` ${extra}` : ''}`, '0 0 24 24', ROLE_ART[role]);
}

/** A line of the journal about one role: its marker, its name and what to do about it. */
export const roleLine = (role: MobRole): HTMLElement => h('div', { class: 'role-line' }, roleMarker(role), h('div', null, h('b', null, ROLE_NAMES[role]), h('div', { class: 'tx' }, ROLE_TEXT[role])));

/** The lightning bolt of "this can be stopped" (a cast's badge, and the interrupt's button when it is time). */
export const boltBadge = (extra = ''): HTMLElement => svg(`bolt-badge${extra ? ` ${extra}` : ''}`, '0 0 16 16', '<circle class="bg" cx="8" cy="8" r="7.2"/><path class="fg" d="M9.4 1.8 4 9h3.2l-1 5.2L12 7H8.6Z"/>');

/** The star of "this is the right press now" (the spender and the big button). */
export const starBadge = (extra = ''): HTMLElement => svg(`star-badge${extra ? ` ${extra}` : ''}`, '0 0 16 16', '<path class="fg" d="M8 .8l2.1 4.6 5 .6-3.7 3.4 1 5-4.4-2.5-4.4 2.5 1-5L.9 6l5-.6Z"/>');

/** A cast's circle over a monster: it fills clockwise (`--k`, 0..1), with a leaf for healing or an arrow for a shot in the middle. */
export function castRing(kind: string, stoppable: boolean): HTMLElement {
  const icon = kind === 'heal' ? roleMarker('healer', 'in') : kind === 'shot' ? roleMarker('archer', 'in') : h('span', { class: 'in em' }, '⚠️');
  const el = h('span', { class: `cast-ring c-${kind === 'heal' ? 'heal' : kind === 'shot' ? 'shot' : 'boss'}${stoppable ? ' stop' : ''}` }, h('i', { class: 'fill' }), icon);
  if (stoppable) el.append(boltBadge());
  return el;
}

// ---------------------------------------------------------------------------------------------------------------- how you fight

const step = (pic: HTMLElement | string, word: string, cls = ''): HTMLElement => h('span', { class: `step ${cls}`.trim() }, typeof pic === 'string' ? h('span', { class: 'em' }, pic) : pic, h('span', { class: 'w' }, word));
const arrow = (ch = '➜'): HTMLElement => h('span', { class: 'arr', 'aria-hidden': 'true' }, ch);

/**
 * The fight in two rows of pictures: the auto-attack fills three pips which make the spender four times as strong; and the
 * class's combo (its primer, then the spender). A word under every picture.
 */
export function fightStrip(cls: ClassId): HTMLElement {
  const c = CLASSES[cls];
  const auto = SPELLS[c.auto]!;
  const spend = SPELLS[c.spells[0]]!;
  const primer = SPELLS[PRIMER[cls]]!;
  const row = pipRow(cls, 'demo');
  setPips(row, PIP_MAX, true);
  const strip = h(
    'div',
    { class: 'fight-strip' },
    h('div', { class: 'row' }, step(auto.icon, FIGHT_UI.howAuto), arrow(), step(row, fmt(FIGHT_UI.howPips, { pips: PIP_NAMES[cls] })), arrow(), step(h('span', { class: 'em big' }, spend.icon, starBadge()), FIGHT_UI.howBig)),
    h('div', { class: 'row combo' }, step(primer.icon, primer.name), arrow('+'), step(spend.icon, spend.name), arrow('='), step(starBadge('lone'), FIGHT_UI.howCombo)),
  );
  strip.style.setProperty('--c', c.color);
  return strip;
}

/** The strip with its three sentences: the auto-attack, the pips and the combo (the class card and the journal). */
export function fightExplain(cls: ClassId): HTMLElement {
  const c = CLASSES[cls];
  const auto = SPELLS[c.auto]!;
  const line = (icon: string, name: string, text: string): HTMLElement => h('div', { class: 'sp' }, h('span', { class: 'ic' }, icon), h('div', null, h('b', null, name), h('div', { class: 'tx' }, text)));
  return h(
    'div',
    { class: 'fight-explain' },
    h('div', { class: 'saga-head' }, `⚔️ ${FIGHT_UI.howTitle}`),
    fightStrip(cls),
    line(auto.icon, `${T.sagaAutoName}: ${auto.name}`, T.sagaAutoText),
    line(PIP_ICONS[cls], PIP_NAMES[cls], PIP_TEXT[cls]),
    line('⭐', FIGHT_UI.howCombo, COMBO_TEXT[cls]),
  );
}

/** What a screen reader (and the read-aloud voice) says for the strip. */
export const fightWords = (cls: ClassId): string => `${T.sagaAutoText} ${PIP_TEXT[cls]} ${COMBO_TEXT[cls]}`;
