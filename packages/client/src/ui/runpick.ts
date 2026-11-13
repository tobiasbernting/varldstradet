// The personal choices of a run, in windows of their own so ui/run.ts stays what it was: the path (väg) every hero picks after the
// Mellanboss. Everyone picks at once, nobody waits for a slow friend longer than the clock, and a choice can be explained by touch.
import { fightStrip, fightWords } from './fightcard.ts';
import {
  CLASSES,
  PATHS,
  PATH_NAMES,
  PATH_SPELLS,
  classSpells,
  PATH_TEXT,
  RUNA_NAMES,
  RUNA_RARITY_NAMES,
  RUNA_RARITY_STARS,
  RUNA_TEXT,
  RUN_T,
  RUN_TAGS,
  RUN_UI,
  SET_NAMES,
  SET_STEPS,
  SET_TEXT,
  SPELLS,
  TAG_ICON,
  TAG_NAMES,
  canSharpen,
  fitsPath,
  fmt,
  heldRarity,
  pathDef,
  pathsOf,
  runa,
  tagCounts,
  type ClassId,
  type RunOfferSnap,
  type RunSnap,
} from '@varldstradet/shared';
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
        ...classSpells(path.cls).map((sid) => h('li', null, h('span', { class: 'si' }, SPELLS[sid]!.icon), h('span', null, PATH_SPELLS[path.id]![sid]))),
      ),
      h('span', { class: 'for' }, chosen ? `✔ ${RUN_UI.pathDone}` : mine ? '' : RUN_UI.pathPick),
    );
    card.style.setProperty('--c', CLASSES[path.cls].color);
    host.tap(card, () => choose(path.id));
    host.info(card, path.icon, PATH_NAMES[path.id] ?? '', PATH_TEXT[path.id] ?? '');
    cards.append(card);
  });
  body.append(cards);
  // how the class fights, whatever the path: the auto-attack, the pips and the combo, in pictures
  if (cls) body.append(h('div', { class: 'fight-how', role: 'img', 'aria-label': fightWords(cls) }, fightStrip(cls)));
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

// ---------------------------------------------------------------------------
// Runor: the personal cards, the runor you hold and the choice at a Vilosten
// ---------------------------------------------------------------------------

export interface RunaCardOpts {
  id: string;
  /** How many times it has been sharpened (skärpa). */
  up?: number;
  /** The key that picks it (1..3). */
  key?: number;
  /** My tags so far: the card shows what taking it does to them. A runa already held does not count itself twice. */
  counts?: Record<string, number>;
  held?: boolean;
  path?: string;
  /** Shown as chosen. */
  chosen?: boolean;
  /** A runa for the whole party. */
  party?: boolean;
  /** Smaller, for the lists. */
  compact?: boolean;
}

/** The card of one runa: rarity as a word, stars and a border pattern (never only a colour), the tags with their set progress, one sentence with a number. */
export function runaCard(host: PickHost, tag: 'button' | 'div', o: RunaCardOpts, onTap?: () => void): HTMLElement {
  const def = runa(o.id);
  const rar = def ? heldRarity({ id: o.id, up: o.up ?? 0 }) : 'vanlig';
  const cls = def?.cls ? CLASSES[def.cls] : null;
  const counts = (o.counts ?? {}) as Record<string, number>;
  const tags = def?.tags ?? [];
  // what taking this card does to the sets
  let setLine = '';
  const tagEls = tags.map((t) => {
    const have = counts[t] ?? 0;
    const after = o.held ? have : have + 1;
    const step = after >= SET_STEPS[1] ? SET_STEPS[1] : after >= SET_STEPS[0] ? SET_STEPS[1] : SET_STEPS[0];
    const hit = !o.held && (after === SET_STEPS[0] || after === SET_STEPS[1]);
    if (hit) setLine = `${TAG_ICON[t]} ${SET_NAMES[t]?.[after === SET_STEPS[0] ? 0 : 1]}: ${SET_TEXT[t]?.[after === SET_STEPS[0] ? 0 : 1]}`;
    return h('span', { class: `tag${hit ? ' hit' : ''}` }, `${TAG_ICON[t]} ${TAG_NAMES[t]} ${after}/${step}${hit ? ' ✔' : ''}`);
  });
  const card = h(
    tag,
    { class: `runa-card rar-${rar}${o.chosen ? ' mine' : ''}${o.compact ? ' compact' : ''}${o.party ? ' party' : ''}`, 'aria-label': `${RUNA_RARITY_NAMES[rar]}. ${RUNA_NAMES[o.id] ?? o.id}. ${RUNA_TEXT[o.id] ?? ''}`, ...(tag === 'button' ? { 'aria-pressed': String(!!o.chosen) } : {}) },
    o.key ? h('span', { class: 'key' }, String(o.key)) : null,
    h('span', { class: 'rar' }, `${RUNA_RARITY_STARS[rar]} ${RUNA_RARITY_NAMES[rar]}${(o.up ?? 0) > 0 ? ` ⚒${o.up}` : ''}`),
    h('span', { class: 'ic' }, def?.icon ?? '🔹'),
    h('span', { class: 'nm' }, RUNA_NAMES[o.id] ?? o.id),
    h('span', { class: 'tx' }, RUNA_TEXT[o.id] ?? ''),
    h('span', { class: 'tags' }, ...tagEls),
    setLine ? h('span', { class: 'set' }, setLine) : null,
    o.path && fitsPath(o.id, o.path) ? h('span', { class: 'fit' }, `✔ ${RUN_UI.fitsPath}`) : null,
    h('span', { class: 'for' }, o.party ? `👪 ${RUN_UI.cardsAll}` : cls ? `${cls.emoji} ${cls.name}` : `👪 ${RUN_UI.cardsAll}`),
    o.chosen ? h('span', { class: 'chosen' }, `✔ ${RUN_UI.pathDone}`) : null,
  );
  if (onTap) host.tap(card, onTap);
  host.info(card, def?.icon ?? '🔹', `${RUNA_NAMES[o.id] ?? o.id} · ${RUNA_RARITY_NAMES[rar]}`, `${RUNA_TEXT[o.id] ?? ''}${setLine ? ` ${setLine}` : ''}`);
  return card;
}

/** My own three cards (everyone picks at once; the choice can be changed until everyone has chosen or the clock ends). */
export function renderOfferWindow(host: PickHost, body: HTMLElement, run: RunSnap, offer: RunOfferSnap, me: string, cls: ClassId | undefined, pick: (i: number) => void, reroll: () => void): { fill: HTMLElement; text: HTMLElement } {
  void cls;
  const names = new Map(run.party.map((p) => [p.id, p.name]));
  const hold = run.hold[me] ?? [];
  const counts = tagCounts(hold, run.runor);
  body.append(h('p', { class: 'intro' }, RUN_T.pickSub));
  const cards = h('div', { class: 'runa-cards' });
  offer.cards.forEach((id, i) => cards.append(runaCard(host, 'button', { id, key: i + 1, counts, path: run.paths[me], chosen: offer.picked === i }, () => pick(i))));
  body.append(cards);
  const humans = run.party.filter((p) => !p.bot);
  const done = new Set(offer.done);
  if (humans.length > 1) body.append(h('div', { class: 'path-who', 'aria-live': 'polite' }, ...humans.map((p) => h('span', { class: `who${done.has(p.id) ? ' done' : ''}` }, `${done.has(p.id) ? '✔' : '…'} ${names.get(p.id) ?? ''}`))));
  const fill = h('i');
  const text = h('span');
  const foot = h('div', { class: 'offer-foot sticky' }, h('div', { class: 'timer' }, fill), text);
  const re = h('button', { class: 'alt', disabled: offer.rerolls <= 0 }, `🎲 ${offer.rerolls > 0 ? RUN_UI.cardsReroll : RUN_UI.cardsNoReroll}`);
  host.tap(re, reroll);
  foot.append(re);
  body.append(foot);
  if (offer.picked !== undefined && humans.some((p) => !done.has(p.id))) body.append(h('div', { class: 'hint' }, RUN_UI.cardsWaiting));
  return { fill, text };
}

/** The runor you hold (with their rarity and tags), the tag bar with the set bonuses, and the whole party's. */
export function renderHoldWindow(host: PickHost, body: HTMLElement, run: RunSnap, me: string): void {
  const hold = run.hold[me] ?? [];
  if (!hold.length && !run.runor.length) {
    body.append(h('p', { class: 'intro' }, RUN_UI.noRunor));
    return;
  }
  const counts = tagCounts(hold, run.runor);
  // the tag bar: each tag with a count towards its two set bonuses
  const bar = h('div', { class: 'tagbar', role: 'list' });
  for (const t of RUN_TAGS) {
    const n = counts[t];
    if (!n) continue;
    const step = n >= SET_STEPS[1] ? SET_STEPS[1] : n >= SET_STEPS[0] ? SET_STEPS[1] : SET_STEPS[0];
    const lvl = n >= SET_STEPS[1] ? 1 : n >= SET_STEPS[0] ? 0 : -1;
    const el = h('button', { class: `tagchip${lvl >= 0 ? ' on' : ''}`, role: 'listitem' }, `${TAG_ICON[t]} ${TAG_NAMES[t]} ${n}/${step}${lvl >= 0 ? ' ✔' : ''}`);
    host.tap(el, () => undefined);
    host.info(el, TAG_ICON[t] ?? '', `${TAG_NAMES[t]} ${n}/${step}`, `${SET_NAMES[t]?.[0]}: ${SET_TEXT[t]?.[0]} · ${SET_NAMES[t]?.[1]}: ${SET_TEXT[t]?.[1]}`);
    bar.append(el);
  }
  body.append(bar);
  const list = h('div', { class: 'runor-list2' });
  for (const hd of hold) list.append(runaCard(host, 'div', { id: hd.id, up: hd.up, held: true, compact: true, counts }));
  for (const id of run.runor) list.append(runaCard(host, 'div', { id, held: true, party: true, compact: true, counts }));
  body.append(list);
}

/** The choice at a Vilosten: Vila (a quarter more health) or skärp one of your runor (one step up). */
export function renderRestWindow(host: PickHost, body: HTMLElement, run: RunSnap, me: string, rest: () => void, sharpen: (id: string) => void): void {
  body.append(h('p', { class: 'intro' }, RUN_UI.restIntro));
  const spent = !(run.restChoice ?? []).includes(me);
  const vila = h('button', { class: 'go', disabled: spent }, `🛌 ${RUN_UI.restMore}`);
  host.tap(vila, rest);
  host.info(vila, '🛌', RUN_UI.restMore, RUN_UI.restMoreText);
  body.append(h('div', { class: 'actions' }, vila));
  const hold = (run.hold[me] ?? []).filter((x) => canSharpen(x));
  body.append(h('div', { class: 'sect' }, `⚒️ ${RUN_UI.sharpen}`));
  if (!hold.length) body.append(h('p', { class: 'intro' }, RUN_UI.noSharpen));
  const counts = tagCounts(run.hold[me] ?? [], run.runor);
  const cards = h('div', { class: 'runa-cards' });
  for (const x of hold) {
    const next = heldRarity({ id: x.id, up: x.up + 1 });
    const card = runaCard(host, 'button', { id: x.id, up: x.up, held: true, counts }, () => {
      if (!spent) sharpen(x.id);
    });
    card.append(h('span', { class: 'chosen' }, `⚒️ → ${RUNA_RARITY_NAMES[next]}`));
    if (spent) card.setAttribute('aria-disabled', 'true');
    cards.append(card);
  }
  body.append(cards);
}
