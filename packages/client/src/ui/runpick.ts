// The personal choices of a run, in windows of their own so ui/run.ts stays what it was: the path (väg) every hero picks after the
// Mellanboss. Everyone picks at once, nobody waits for a slow friend longer than the clock, and a choice can be explained by touch.
import { CLASSES, PATHS, PATH_NAMES, PATH_SPELLS, PATH_TEXT, RUN_UI, SPELLS, fmt, pathDef, pathsOf, type ClassId, type RunSnap } from '@lilla-garden/shared';
import { h } from './dom.ts';

/** What the pick windows need from the run window (ui/run.ts): tapping that respects the ? button, and the info card. */
export interface PickHost {
  tap(el: HTMLElement, fn: () => void): void;
  info<E extends HTMLElement>(el: E, icon: string, name: string, text: string): E;
}

export const pathIcon = (id: string | undefined): string => pathDef(id)?.icon ?? '';
export const pathName = (id: string | undefined): string => (id ? (PATH_NAMES[id] ?? id) : '');

/** The cards of the paths of my class. Returns the bar and the text the window's clock fills. */
export function renderPathWindow(host: PickHost, body: HTMLElement, run: RunSnap, me: string, cls: ClassId | undefined, choose: (id: string) => void): { fill: HTMLElement; text: HTMLElement } {
  const mine = run.paths[me];
  const names = new Map(run.party.map((p) => [p.id, p.name]));
  body.append(h('p', { class: 'intro' }, RUN_UI.pathIntro));
  const cards = h('div', { class: 'runa-cards path-cards' });
  const list = cls ? pathsOf(cls) : [];
  list.forEach((path, i) => {
    const chosen = mine === path.id;
    const card = h(
      'button',
      { class: `runa-card path-card${chosen ? ' mine' : ''}`, 'aria-pressed': String(chosen), 'aria-label': `${PATH_NAMES[path.id]}. ${PATH_TEXT[path.id]}` },
      h('span', { class: 'key' }, String(i + 1)),
      h('span', { class: 'ic' }, path.icon),
      h('span', { class: 'nm' }, PATH_NAMES[path.id]),
      h('span', { class: 'tx' }, PATH_TEXT[path.id]),
      h(
        'ul',
        { class: 'path-spells' },
        ...CLASSES[path.cls].spells.map((sid, k) => h('li', null, h('span', { class: 'si' }, SPELLS[sid]!.icon), h('span', null, PATH_SPELLS[path.id]![k]))),
      ),
      h('span', { class: 'for' }, chosen ? `✔ ${RUN_UI.pathDone}` : mine ? '' : RUN_UI.pathPick),
    );
    card.style.setProperty('--c', CLASSES[path.cls].color);
    host.tap(card, () => choose(path.id));
    host.info(card, path.icon, PATH_NAMES[path.id] ?? '', PATH_TEXT[path.id] ?? '');
    cards.append(card);
  });
  body.append(cards);
  // who has chosen already (a word and a check, not only a colour)
  const done = new Set(run.pick?.kind === 'path' ? run.pick.done : Object.keys(run.paths));
  const humans = run.party.filter((p) => !p.bot);
  body.append(h('div', { class: 'path-who', 'aria-live': 'polite' }, ...humans.map((p) => h('span', { class: `who${done.has(p.id) ? ' done' : ''}` }, `${done.has(p.id) ? '✔' : '…'} ${names.get(p.id) ?? ''}${run.paths[p.id] ? ` · ${pathIcon(run.paths[p.id])} ${pathName(run.paths[p.id])}` : ''}`))));
  const fill = h('i');
  const text = h('span');
  body.append(h('div', { class: 'offer-foot sticky' }, h('div', { class: 'timer' }, fill), text));
  if (mine && humans.some((p) => !done.has(p.id))) body.append(h('div', { class: 'hint' }, RUN_UI.pathWaiting));
  return { fill, text };
}

export const pathTimeText = (leftMs: number): string => fmt(RUN_UI.pathLeft, { n: Math.ceil(leftMs / 1000) });
export { PATHS };
