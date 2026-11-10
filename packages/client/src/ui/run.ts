// Färderna (runs) as HTML over the game: the arch window where a run is chosen and started, the HUD of a run (the road
// rail, the clock, the Sagoandar, the runor you hold, the vote on the way on), the three cards of a runa, the map of the
// route, the summary of a run that ended and the sagaträd. The windows are `.modal`s like everybody else's, so the touch
// screen, the keys and the gamepad (ui/gamepad.ts) all work in them. The fight itself (spell bar, party frames, boss bar,
// telegraphs) is the saga's HUD (ui/saga.ts) and is not repeated here.
import {
  DUNGEONS,
  DUNGEON_IDS,
  RUNA_TEXT,
  RUN_JOIN_RADIUS,
  RUN_LEVEL_IDS,
  RUN_LEVEL_DEFAULT,
  AFFIX_IDS,
  MODIFIER_ICON,
  MODIFIER_NAMES,
  MODIFIER_TEXT,
  SPELLS,
  T,
  runPickMs,
  isRunKey,
  type RunLevel,
  RUN_PARTY_MAX,
  EVENT_NAMES,
  RUN_T,
  RUN_UI,
  SEED_TREE,
  STOP_NAMES,
  STOP_WORDS,
  TILE,
  TREE_STAGES,
  BRANCH_NAMES,
  TREE_TEXT,
  chapterBoss,
  PATH_TEXT,
  pathsOf,
  companionClass,
  fmt,
  fmtDuration,
  itemName,
  parseRunLevel,
  plantError,
  runa,
  runaName,
  runnableDungeons,
  treeName,
  CLASSES,
  type ClassId,
  type DungeonId,
  type NodeKind,
  type PlayerState,
  type RouteNodeSnap,
  type RunSnap,
  type TreeNode,
} from '@lilla-garden/shared';
import { CLASS_IDS, LOOK_T, PETS, PET_T, activePet, ownedPetIds } from '@lilla-garden/shared';
import { lookSummary } from './looks.ts';
import { portraitUrl } from '@art/textures.ts';
import { net } from '../net.ts';
import { KIND_COLOR, KIND_ICON, myRun, offerLeft, pickLeft, routeLeft, runClient, runElapsed } from '../run.ts';
import { renderEventWindow, renderShopWindow } from './runshop.ts';
import { pathIcon, pathName, pathTimeText, renderHoldWindow, renderOfferWindow, renderPathWindow, renderRestWindow } from './runpick.ts';
import { SFX } from '../sound.ts';
import { bus, client, myPlayer } from '../state.ts';
import { clear, h, onTap } from './dom.ts';
import { itemIcon } from './saga.ts';

/** What the info card (tap and hold, the ? button, keyboard and gamepad focus) shows about a thing. */
export interface Info {
  icon: string;
  name: string;
  text: string;
}
import './run.css';

/** One picture for each chapter's dungeon. */
const DUNGEON_ICON: Record<DungeonId, string> = { draug: '💀', frost: '❄️', surt: '🔥', hel: '👻', dvarg: '⛏️', orm: '🐍', alv: '🧚', fenrir: '🐺', loke: '🌈' };
/** What a sagaträd node's first effect looks like as a picture. */
const EFFECT_ICON: Record<string, string> = {
  power: '✨', hp: '❤️', crit: '🎯', armor: '🛡️', potion: '🧪', cd: '⚡', rest: '🪨', down: '🌄', reroll: '🎲', heal: '💚', companion: '🤝', seeds: '🌱', slots: '🍞', food: '🥧', animal: '🐾', potions: '🧪', coins: '🪙', bossSeeds: '👑',
};
const BRANCH_ICON: Record<string, string> = { hjalte: '⚔️', gemenskap: '🤝', gard: '🌾' };
const BRANCHES = ['hjalte', 'gemenskap', 'gard'] as const;
const ROWS = 10;

type Win = 'fard' | 'offer' | 'path' | 'rest' | 'shop' | 'event' | 'map' | 'tree' | 'summary' | 'runor' | 'leave';

const NS = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

/** An icon from the shared tables ('emoji:🔥') as text. */
const ico = (s: string | undefined): string => (s ?? '').replace(/^emoji:/, '');
/** A level as the windows show it: the shared names, icons and blurbs (T.runLevelName, T.runLevelIcon, T.runLevelBlurb). */
const levelInfo = (level: number): { level: number; name: string; icon: string; blurb: string } => ({ level, name: T.runLevelName[level] ?? String(level), icon: ico(T.runLevelIcon[level]) || '⚔️', blurb: T.runLevelBlurb[level] ?? '' });
const ms = (v: number): string => fmtDuration(Math.max(0, v));
const dungeonName = (id: DungeonId | undefined): string => (id ? DUNGEONS[id].name : '');

/** The family members the arch would take along: standing near it, on the farm, with a class. */
function atArch(): { me: PlayerState | undefined; party: PlayerState[]; extra: PlayerState[]; near: boolean } {
  const farm = client.world;
  const me = myPlayer();
  const arch = farm ? Object.values(farm.objects).find((o) => o.kind === 'fardport') : undefined;
  if (!farm || !me || !arch) return { me, party: me ? [me] : [], extra: [], near: false };
  const ax = (arch.x + 1.5) * TILE;
  const ay = (arch.y + 1) * TILE;
  const at = (p: PlayerState): number => {
    const s = p.id === client.me ? p : (client.snaps.players.get(p.id) ?? p);
    return Math.hypot(s.x - ax, s.y - ay) / TILE;
  };
  const near = me.area === 'farm' && at(me) <= RUN_JOIN_RADIUS;
  const others = Object.values(farm.players)
    .filter((q) => q.id !== me.id && !q.bot && q.online && q.area === 'farm' && !!q.saga?.cls && at(q) <= RUN_JOIN_RADIUS)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { me, party: [me, ...others.slice(0, RUN_PARTY_MAX - 1)], extra: others.slice(RUN_PARTY_MAX - 1), near };
}

export class RunUi {
  /** Called when a window of the run opens or closes (the game stops reading keys and taps meanwhile). */
  onChange: (open: boolean) => void = () => {};

  private modal: HTMLElement | null = null;
  private win: Win | null = null;
  // the arch window's choices
  private dungeon: DungeonId | null = null;
  private level: number = RUN_LEVEL_DEFAULT;
  private lookCls: ClassId | null = null;
  private companion = true;
  private fardSig = '';
  // the tree window's choice
  private treePick: string | null = null;
  /** The offer the cards were last opened for (a new offer opens them again). */
  private offerSeen = '';
  private lastPhase = '';
  private wasIn = false;
  /** The server sent my summary (a player who goes home alone gets none: the window makes one from what it knew). */
  private gotEnded = true;
  private leaving = false;
  private leaveMs = 0;

  // the HUD of a run
  private bar = h('div', { class: 'run-bar' });
  private clockEl = h('span', { class: 'clock' }, '0:00');
  private clockFill = h('i');
  private vote = h('div', { class: 'run-vote' });
  private voteLeftEl: HTMLElement | null = null;
  private cardsBtn = h('button', { class: 'run-cards-btn' });
  private runorStrip = h('button', { class: 'run-runor', 'aria-label': RUN_UI.runorHeld });
  private note = h('div', { class: 'run-note' });
  private seenStop = '';
  private reopenWin: Win = 'offer';
  private offerBars: { fill: HTMLElement; text: HTMLElement } | null = null;

  // explaining things, focus and the screen reader
  private infoEl = h('div', { class: 'run-info', role: 'status', 'aria-live': 'polite' });
  private infoFor: HTMLElement | null = null;
  private infoMode = false;
  private noTapUntil = 0;
  private opener: HTMLElement | null = null;
  private fresh = false;
  private quiet = false;
  private live = h('div', { class: 'run-live', role: 'status', 'aria-live': 'polite' });
  private announced = '';

  constructor(
    private ui: HTMLElement,
    hudRoot: HTMLElement,
  ) {
    hudRoot.append(this.bar, this.vote, this.cardsBtn, this.runorStrip, this.note, this.live);
    this.bar.hidden = this.vote.hidden = this.cardsBtn.hidden = this.runorStrip.hidden = this.note.hidden = true;
    this.infoEl.hidden = true;
    ui.append(this.infoEl);
    onTap(this.infoEl, () => this.hideInfo());
    this.tap(this.cardsBtn, () => this.open(this.reopenWin));
    this.tap(this.runorStrip, () => this.open('runor'));
    this.info(this.runorStrip, '🎴', RUN_UI.runorHeld, RUN_UI.infoRunor);
    this.setupInfo();

    bus.on('open', (c) => {
      if (c.ui === 'run') this.open('fard');
      else if (c.ui === 'seed') this.open('tree');
    });
    bus.on('change', (c) => {
      if (c.t === 'run') this.fromRun(c);
      else if (c.t === 'seed') {
        if (this.win === 'tree' || this.win === 'fard') this.render();
      }
    });
    bus.on('toast', (text) => {
      if (this.win === 'fard') this.hint(text, 6000);
    });
    bus.on('welcome', () => {
      // a reload in the middle of a run: the server puts us back in the stop (rejoinRun) and sends the run; asking makes sure
      net.send({ t: 'run', a: 'state' });
      net.send({ t: 'seed', a: 'state' });
      this.wasIn = false;
      this.sync();
    });
    bus.on('me', () => {
      if (this.win === 'fard' || this.win === 'tree') this.render();
    });
    bus.on('state', () => {
      if (this.win !== 'fard') return;
      const sig = this.archSig();
      if (sig !== this.fardSig) this.render();
    });
    bus.on('area', () => this.sync());
    bus.on('connection', (s) => {
      if (s !== 'open') this.close(true);
    });
    const tick = (): void => {
      this.tick();
      setTimeout(tick, 250);
    };
    tick();
  }

  isOpen(): boolean {
    return this.modal !== null;
  }

  /** Keys while a window of the run is open; K opens the map of the route in a run. True if used. */
  key(e: KeyboardEvent): boolean {
    if (this.modal) {
      // while a window of the run is up the spell keys do nothing
      if (e.key === 'Tab') {
        // the focus stays inside the window
        e.preventDefault();
        const list = this.focusables();
        if (list.length) {
          const at = list.indexOf(document.activeElement as HTMLElement);
          list[(at + (e.shiftKey ? -1 : 1) + list.length) % list.length]!.focus();
        }
      } else if (e.key === 'Escape') {
        if (this.infoFor && !this.infoEl.hidden) this.hideInfo();
        else this.close();
      }
      else if (this.win === 'offer' && runClient.offer) {
        if (/^[1-3]$/.test(e.key)) this.pick(Number(e.key) - 1);
        else if (e.key === 'r' || e.key === 'R') this.reroll();
      } else if (this.win === 'path' && /^[1-3]$/.test(e.key)) {
        const cls = myPlayer()?.saga?.cls;
        const list = cls ? pathsOf(cls) : [];
        const path = list[Number(e.key) - 1];
        if (path) this.choosePath(path.id);
      }
      return true;
    }
    if ((e.key === 'k' || e.key === 'K') && myRun()) {
      this.open('map');
      return true;
    }
    return false;
  }

  // ---- explaining things, focus, the screen reader ----

  /** A tap: explains the thing instead of using it while the ? button is on, and is ignored right after a long press. */
  private tap(el: HTMLElement, fn: (ev: Event) => void): void {
    onTap(el, (ev) => {
      if (performance.now() < this.noTapUntil) return;
      if (this.infoMode && el.dataset.infoName) {
        this.showInfo(el);
        return;
      }
      fn(ev);
    });
  }

  /** Marks a thing as explainable: an icon, a name and one short sentence. */
  private info<E extends HTMLElement>(el: E, icon: string, name: string, text: string): E {
    el.dataset.infoIcon = icon;
    el.dataset.infoName = name;
    el.dataset.infoText = text;
    return el;
  }

  private showInfo(el: HTMLElement): void {
    if (!el.dataset.infoName) return;
    clear(this.infoEl);
    this.infoEl.append(h('span', { class: 'ic' }, el.dataset.infoIcon ?? ''), h('div', { class: 'tx' }, h('b', null, el.dataset.infoName), h('span', null, el.dataset.infoText ?? '')), h('span', { class: 'dismiss' }, RUN_UI.dismiss));
    // in a window the card sits in the window above the buttons (it never covers one); in the HUD it floats
    const panel = this.modal?.querySelector('.panel');
    if (panel) {
      panel.insertBefore(this.infoEl, panel.querySelector('.foot'));
      this.infoEl.classList.add('in-panel');
    } else {
      if (this.infoEl.parentElement !== this.ui) this.ui.append(this.infoEl);
      this.infoEl.classList.remove('in-panel');
    }
    this.infoEl.hidden = false;
    this.infoFor = el;
  }

  private hideInfo(): void {
    this.infoEl.hidden = true;
    this.infoFor = null;
  }

  /** The info card comes up on a long press, on keyboard focus and on the gamepad's focus ring. */
  private setupInfo(): void {
    const own = (el: EventTarget | null): HTMLElement | null => {
      const t = (el as HTMLElement | null)?.closest?.('[data-info-name]') as HTMLElement | null;
      return t && (this.ui.contains(t) || document.body.contains(t)) ? t : null;
    };
    let timer = 0;
    document.addEventListener(
      'pointerdown',
      (e) => {
        clearTimeout(timer);
        const t = own(e.target);
        if (!t) {
          if (!(e.target as HTMLElement).closest?.('.run-info')) this.hideInfo();
          return;
        }
        timer = window.setTimeout(() => {
          this.noTapUntil = performance.now() + 800;
          this.showInfo(t);
        }, 450);
      },
      true,
    );
    for (const ev of ['pointerup', 'pointercancel', 'pointermove']) document.addEventListener(ev, () => clearTimeout(timer), true);
    document.addEventListener('contextmenu', (e) => {
      if (own(e.target)) e.preventDefault();
    });
    document.addEventListener('focusin', (e) => {
      const t = own(e.target);
      if (t && !this.quiet && (e.target as HTMLElement).matches?.(':focus-visible') && (this.modal?.contains(t) || this.bar.contains(t) || this.vote.contains(t) || this.runorStrip === t || t.classList.contains('pet-toggle'))) this.showInfo(t);
    });
    document.addEventListener('focusout', (e) => {
      if (this.infoFor && e.target === this.infoFor) this.hideInfo();
    });
    // the gamepad moves a ring (the class pad-focus) instead of the browser's focus
    new MutationObserver((muts) => {
      for (const m of muts) {
        const t = m.target as HTMLElement;
        if (!t.dataset?.infoName) continue;
        if (t.classList.contains('pad-focus')) this.showInfo(t);
        else if (this.infoFor === t) this.hideInfo();
      }
    }).observe(this.ui, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  /** A line for screen readers (and a quiet one for everybody: it sits out of sight). */
  private say(text: string): void {
    if (text === this.announced) return;
    this.announced = text;
    this.live.textContent = text;
  }

  private focusables(): HTMLElement[] {
    return this.modal ? [...this.modal.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')].filter((e) => e.offsetParent !== null) : [];
  }

  // ---- reacting to the server ----

  private fromRun(c: Extract<import('@lilla-garden/shared').Change, { t: 'run' }>): void {
    if (c.ev === 'state') {
      const run = myRun();
      const was = this.wasIn;
      this.wasIn = !!run;
      if (run && !was) {
        // we are in a run now (started, hung on, or came back after a reload)
        if (this.win === 'fard') this.close(true);
        this.gotEnded = false;
        this.leaving = false;
      }
      if (!run && was && !this.gotEnded && this.leaving) setTimeout(() => this.leaveSummary(), 600);
      if (!run && this.win && ['offer', 'path', 'rest', 'shop', 'event', 'map', 'runor', 'leave'].includes(this.win)) this.close(true);
      // everyone chooses a path after the Mellanboss: the window opens by itself and goes when the choosing is over
      if (run?.phase === 'path' && this.win !== 'path') this.open('path');
      else if (this.win === 'path' && run?.phase !== 'path') this.close(true);
      else if (this.win === 'path') this.render();
      this.autoOpen(run);
      if (this.win === 'fard' || this.win === 'map' || this.win === 'shop' || this.win === 'rest') this.render();
      this.sync();
    } else if (c.ev === 'offer') {
      const o = runClient.offer;
      if (!o || !myRun()) {
        if (this.win === 'offer') this.close(true);
        this.sync();
        return;
      }
      const sig = `${o.node}:${o.cards.join(',')}`;
      if (sig !== this.offerSeen) {
        this.offerSeen = sig;
        this.open('offer');
      } else if (this.win === 'offer') this.render();
      this.sync();
    } else if (c.ev === 'ended' && c.to === client.me) {
      this.offerSeen = '';
      this.gotEnded = true;
      this.open('summary');
      SFX.talk();
    }
  }

  // ---- the HUD ----

  /** Draws the HUD from the state: shown only while I am in a run. */
  private sync(): void {
    const run = myRun();
    // (the run's area counts at once, before its first state arrives: no flash of the farm's buttons)
    document.body.classList.toggle('in-run', !!run || isRunKey(myPlayer()?.area));
    document.body.classList.toggle('run-route', run?.phase === 'route');
    if (!run) {
      this.bar.hidden = this.vote.hidden = this.cardsBtn.hidden = this.runorStrip.hidden = this.note.hidden = true;
      this.lastPhase = '';
      return;
    }
    this.renderBar(run);
    const cur = run.route.find((n) => n.id === run.node);
    this.say(run.phase === 'route' ? RUN_UI.ann.vote : run.phase === 'pick' ? RUN_UI.ann.offer : run.phase === 'path' ? RUN_UI.ann.path : fmt(RUN_UI.ann.stop, { name: cur ? (STOP_NAMES[cur.kind] ?? '') : '' }));
    this.renderVote(run);
    this.renderRunor(run);
    const offer = runClient.offer;
    // one button brings back the window the stop is about: my cards, the Vilosten's choice or the Köpman
    const reopen: { win: Win; label: string } | null = offer && run.phase === 'pick' && this.win !== 'offer' ? { win: 'offer', label: `🎴 ${RUN_UI.cardsReopen}` } : run.shop && run.kind === 'shop' && this.win !== 'shop' && run.phase !== 'pick' ? { win: 'shop', label: `🪙 ${RUN_UI.shopOpen}` } : (run.restChoice ?? []).includes(client.me) && this.win !== 'rest' && run.phase !== 'pick' ? { win: 'rest', label: `💚 ${RUN_UI.restReopen}` } : null;
    this.reopenWin = reopen?.win ?? 'offer';
    this.cardsBtn.hidden = !reopen;
    if (reopen) {
      clear(this.cardsBtn);
      this.cardsBtn.append(reopen.label);
    }
    this.note.hidden = run.phase !== 'victory';
    this.note.textContent = run.phase === 'victory' ? `🏆 ${RUN_UI.victory}` : '';
    this.lastPhase = run.phase;
  }

  private renderBar(run: RunSnap): void {
    const lvl = levelInfo(run.level);
    const mine = run.earned[client.me] ?? 0;
    const cur = run.route.find((n) => n.id === run.node);
    clear(this.bar);
    this.bar.hidden = false;
    const rail = h('div', { class: 'rail', role: 'img', 'aria-label': fmt(RUN_UI.step, { n: run.row, max: ROWS }) });
    for (let row = 1; row <= ROWS; row++) {
      const nodes = run.route.filter((n) => n.row === row);
      const pathNode = run.path.map((id) => run.route.find((n) => n.id === id)).find((n) => n?.row === row);
      const kinds = [...new Set(nodes.map((n) => n.kind))];
      const kind: NodeKind | null = pathNode ? pathNode.kind : kinds.length === 1 ? kinds[0]! : null;
      const state = row < run.row ? 'done' : row === run.row ? 'now' : 'next';
      const dot = h('span', { class: `dot ${state}${kind ? '' : ' unknown'}`, title: kind ? STOP_NAMES[kind] : '' }, kind ? KIND_ICON[kind] : '·');
      if (kind && state !== 'next') dot.style.setProperty('--c', KIND_COLOR[kind]);
      rail.append(dot);
    }
    const chip = (cls: string, text: string | Node, label: string, i: Info): HTMLElement => {
      const el = h('button', { class: `chip-btn ${cls}`, 'aria-label': label }, text);
      this.tap(el, () => this.showInfo(el));
      return this.info(el, i.icon, i.name, i.text);
    };
    const spirit = chip('spirit', `🌟 ${run.spirit}`, `${RUN_UI.spirits}: ${run.spirit}`, { icon: '🌟', name: RUN_UI.spirits, text: RUN_UI.infoSpirit });
    const purse = chip('purse', `🪙 ${run.purse}`, `${RUN_UI.purse}: ${run.purse}`, { icon: '🪙', name: RUN_UI.purse, text: RUN_UI.infoPurse });
    const seeds = chip('seeds', `🌱 ${mine}`, `${RUN_UI.seeds}: ${mine}`, { icon: '🌱', name: RUN_UI.seeds, text: RUN_UI.infoSeeds });
    const myPath = run.paths[client.me];
    const pathChip = myPath ? chip('path', `${pathIcon(myPath)} ${pathName(myPath)}`, `${RUN_UI.pathMine}: ${pathName(myPath)}`, { icon: pathIcon(myPath), name: `${RUN_UI.pathMine}: ${pathName(myPath)}`, text: PATH_TEXT[myPath] ?? '' }) : null;
    const level = chip('level', `${lvl.icon} ${lvl.name}`, `${RUN_UI.level}: ${lvl.name}`, { icon: lvl.icon, name: lvl.name, text: lvl.blurb });
    const clock = chip('clockbox', h('span', null, '⏱ ', this.clockEl), RUN_UI.time, { icon: '⏱', name: RUN_UI.time, text: RUN_UI.infoClock });
    const stopTxt = `${cur ? `${KIND_ICON[cur.kind]} ${STOP_WORDS[cur.kind]}` : ''} · ${fmt(RUN_UI.step, { n: run.row, max: ROWS })}`;
    const stop = chip('stop', stopTxt, stopTxt, { icon: cur ? KIND_ICON[cur.kind] : '🧭', name: cur ? STOP_NAMES[cur.kind] ?? '' : '', text: `${cur ? RUN_UI.kinds[cur.kind] : ''} ${RUN_UI.infoStep}` });
    const ask = h('button', { class: `round-btn${this.infoMode ? ' on' : ''}`, 'aria-label': RUN_UI.explain, 'aria-pressed': String(this.infoMode) }, '❔');
    onTap(ask, () => {
      this.infoMode = !this.infoMode;
      if (this.infoMode) {
        this.infoEl.hidden = false;
        clear(this.infoEl);
        this.infoEl.append(h('span', { class: 'ic' }, '❔'), h('div', { class: 'tx' }, h('b', null, RUN_UI.explain), h('span', null, RUN_UI.explainOn)));
      } else this.hideInfo();
      this.sync();
    });
    this.info(ask, '❔', RUN_UI.explain, RUN_UI.explainOn);
    const map = h('button', { class: 'round-btn', 'aria-label': RUN_UI.route }, '🗺️');
    this.tap(map, () => this.open('map'));
    this.info(map, '🗺️', RUN_UI.route, RUN_UI.infoMap);
    const home = h('button', { class: 'round-btn danger', 'aria-label': RUN_UI.home }, '🚪');
    this.tap(home, () => this.open('leave'));
    this.info(home, '🚪', RUN_UI.home, RUN_UI.infoHome);
    const affixes = run.modifiers.filter((m) => AFFIX_IDS.includes(m)).map((m) => chip('affix', `${ico(MODIFIER_ICON[m])} ${MODIFIER_NAMES[m] ?? m}`, MODIFIER_NAMES[m] ?? m, { icon: ico(MODIFIER_ICON[m]), name: MODIFIER_NAMES[m] ?? m, text: MODIFIER_TEXT[m] ?? '' }));
    this.bar.append(h('div', { class: 'line1' }, stop, level, pathChip, ...affixes, clock, spirit, purse, seeds, ask, map, home), rail, h('div', { class: 'clockbar' }, this.clockFill));
    this.tickClock(run);
  }

  private tickClock(run: RunSnap): void {
    const t = runElapsed();
    this.clockEl.textContent = ms(t);
    this.clockFill.style.width = `${Math.min(100, (t / run.max) * 100)}%`;
    this.bar.classList.toggle('late', t > run.max);
  }

  private renderRunor(run: RunSnap): void {
    clear(this.runorStrip);
    const mine = run.hold[client.me] ?? [];
    this.runorStrip.hidden = !mine.length && !run.runor.length;
    for (const hd of mine) this.runorStrip.append(h('span', { class: `r rar-${runa(hd.id)?.rarity ?? 'vanlig'}`, title: runaName(hd.id) }, runa(hd.id)?.icon ?? '🔹'));
    for (const id of run.runor) this.runorStrip.append(h('span', { class: 'r party', title: `${RUN_UI.cardsAll}: ${runaName(id)}` }, runa(id)?.icon ?? '🔹'));
  }

  /** The vote on the way on: a card for each rune on the floor, who stands on it and the clock. */
  private renderVote(run: RunSnap): void {
    clear(this.vote);
    this.voteLeftEl = null;
    this.vote.hidden = !(run.phase === 'route' && run.choices?.length);
    if (this.vote.hidden) return;
    const names = new Map(run.party.map((p) => [p.id, p.name]));
    const head = h('div', { class: 'head' }, h('b', null, `🧭 ${RUN_UI.voteTitle}`));
    this.voteLeftEl = h('span', { class: 'left' });
    head.append(this.voteLeftEl);
    const finder = run.finder ? names.get(run.finder) : null;
    const cards = h('div', { class: 'choices' });
    for (const c of run.choices!) {
      const card = h('div', { class: `choice${c.on.length ? ' on' : ''}` });
      card.style.setProperty('--c', KIND_COLOR[c.kind]);
      card.append(h('span', { class: 'ic' }, KIND_ICON[c.kind]), h('span', { class: 'nm' }, STOP_WORDS[c.kind]));
      card.append(h('span', { class: 'who' }, c.on.length ? `🧍 ${c.on.map((id) => names.get(id) ?? '').join(', ')}` : '·'));
      card.setAttribute('tabindex', '-1');
      this.info(card, KIND_ICON[c.kind], STOP_NAMES[c.kind] ?? '', RUN_UI.kinds[c.kind] ?? '');
      cards.append(card);
    }
    this.vote.append(head, cards, h('div', { class: 'sub' }, `${RUN_UI.voteNone}${finder ? ` · 🧭 ${RUN_UI.finder}: ${finder}` : ''}`));
    this.updateVoteClock();
  }

  private updateVoteClock(): void {
    if (!this.voteLeftEl) return;
    const left = routeLeft();
    this.voteLeftEl.textContent = left < 0 ? '' : fmt(RUN_UI.voteLeft, { n: Math.ceil(left / 1000) });
  }

  private tick(): void {
    const run = myRun();
    if (run) {
      this.tickClock(run);
      this.updateVoteClock();
    }
    if (this.win === 'path' && this.offerBars) {
      const left = pickLeft();
      this.offerBars.fill.style.width = `${Math.min(100, (left / runPickMs(myRun()?.level ?? 2)) * 100)}%`;
      this.offerBars.text.textContent = pathTimeText(left);
    }
    if (this.win === 'event' && this.offerBars) {
      const left = Math.max(0, (myRun()?.event?.left ?? 0) - (performance.now() - runClient.runAt));
      this.offerBars.fill.style.width = `${Math.min(100, (left / runPickMs(myRun()?.level ?? 2)) * 100)}%`;
      this.offerBars.text.textContent = pathTimeText(left);
    }
    if (this.win === 'offer' && this.offerBars) {
      const o = runClient.offer;
      const left = offerLeft();
      this.offerBars.fill.style.width = `${o ? Math.min(100, (left / runPickMs(myRun()?.level ?? 2)) * 100) : 0}%`;
      this.offerBars.text.textContent = fmt(RUN_UI.cardsLeft, { n: Math.ceil(left / 1000) });
    }
  }

  // ---- windows ----

  open(win: Win): void {
    if (win === 'offer' && !runClient.offer) return;
    this.close(true);
    this.win = win;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.fresh = true;
    if (win === 'fard') {
      net.send({ t: 'run', a: 'state' });
      net.send({ t: 'seed', a: 'state' });
    }
    if (win === 'tree') {
      this.treePick = null;
      net.send({ t: 'seed', a: 'state' });
    }
    this.modal = h('div', { class: `modal run-modal ${win}` });
    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.close();
    });
    this.ui.append(this.modal);
    this.render();
    this.onChange(true);
    this.sync();
  }

  /** Closes the window. The cards of a runa cannot be closed by a tap beside them (only `force`, when the vote is over). */
  close(force = false): void {
    if (!this.modal) return;
    if ((this.win === 'offer' || this.win === 'path' || this.win === 'event') && !force) return;
    this.modal.remove();
    this.modal = null;
    this.win = null;
    this.offerBars = null;
    this.hideInfo();
    this.infoMode = false;
    this.onChange(false);
    this.sync();
    // the focus goes back to what opened the window
    if (this.opener?.isConnected) this.opener.focus();
    this.opener = null;
  }

  private render(): void {
    if (!this.modal || !this.win) return;
    const me = myPlayer();
    if (!me) return;
    this.offerBars = null;
    // what had the focus (by its place in the window), so a redraw does not take it away
    const before = this.focusables();
    const at = before.indexOf(document.activeElement as HTMLElement);
    clear(this.modal);
    const body = h('div', { class: 'body' });
    const closeBtn = h('button', { class: 'close', 'aria-label': RUN_UI.close }, '✕');
    onTap(closeBtn, () => this.close());
    const explain = h('button', { class: `explain${this.infoMode ? ' on' : ''}`, 'aria-pressed': String(this.infoMode), 'aria-label': RUN_UI.explain }, `❔ ${RUN_UI.explain}`);
    onTap(explain, () => {
      this.infoMode = !this.infoMode;
      if (!this.infoMode) this.hideInfo();
      this.render();
    });
    const panel = h('div', { class: `panel run-panel ${this.win}`, role: 'dialog', 'aria-modal': 'true' });
    const titles: Record<Win, string> = {
      fard: `🌈 ${RUN_UI.fardport}`,
      offer: `🎴 ${RUN_UI.cardsTitle}`,
      path: `✨ ${RUN_UI.pathTitle}`,
      rest: `💚 ${STOP_NAMES.rest}`,
      shop: `🪙 ${RUN_UI.shopTitle}`,
      event: `❓ ${EVENT_NAMES[myRun()?.event?.id ?? ''] ?? RUN_UI.eventTitle}`,
      map: `🗺️ ${RUN_UI.route}`,
      tree: `🌳 ${RUN_UI.treeTitle}`,
      summary: `📜 ${RUN_UI.summary}`,
      runor: `🎴 ${RUN_UI.runorHeld}`,
      leave: `🚪 ${RUN_UI.homeAsk}`,
    };
    const foot = h('div', { class: 'foot' });
    panel.setAttribute('aria-label', titles[this.win]);
    const canExplain = ['fard', 'map', 'tree', 'runor', 'path', 'offer', 'rest', 'shop', 'event'].includes(this.win);
    panel.append(h('h2', null, titles[this.win], h('span', { class: 'spacer' }), canExplain ? explain : null, this.win === 'offer' || this.win === 'path' || this.win === 'event' ? null : closeBtn), ...(this.infoMode && canExplain ? [h('div', { class: 'explain-hint' }, RUN_UI.explainOn)] : []), body, foot);
    this.modal.append(panel);
    switch (this.win) {
      case 'fard':
        this.renderFard(body);
        break;
      case 'offer':
        this.renderOffer(body);
        break;
      case 'path': {
        const run = myRun();
        if (run) this.offerBars = renderPathWindow({ tap: (el, fn) => this.tap(el, fn), info: (el, i, n, t) => this.info(el, i, n, t) }, body, run, client.me, me.saga?.cls, (id) => this.choosePath(id));
        this.tick();
        break;
      }
      case 'rest':
        this.renderRest(body);
        break;
      case 'shop': {
        const run = myRun();
        if (run) renderShopWindow({ tap: (el, fn) => this.tap(el, fn), info: (el, i, n, t) => this.info(el, i, n, t) }, body, run, client.me, { buy: (item, slot, id) => this.buy(item, slot, id) });
        break;
      }
      case 'event': {
        const run = myRun();
        if (run) this.offerBars = renderEventWindow({ tap: (el, fn) => this.tap(el, fn), info: (el, i, n, t) => this.info(el, i, n, t) }, body, run, client.me, (i) => this.voteEvent(i));
        this.tick();
        break;
      }
      case 'map':
        this.renderMap(body);
        break;
      case 'tree':
        this.renderTree(body);
        break;
      case 'summary':
        this.renderSummary(body);
        break;
      case 'runor':
        this.renderRunorList(body);
        break;
      case 'leave':
        this.renderLeave(body);
        break;
    }
    // the buttons that start, plant or go home stay in view under the scrolling part
    for (const el of [...body.querySelectorAll('.sticky')]) foot.append(el);
    foot.hidden = !foot.childElementCount;
    // the focus: on the first visit the choice or the main button, later where it was
    const now = this.focusables();
    if (this.fresh) {
      this.fresh = false;
      this.quiet = true;
      (this.modal.querySelector<HTMLElement>('.tile.sel, .runa-card, button.go, .actions button, .foot button') ?? now.find((e) => !e.classList.contains('close')))?.focus({ preventScroll: true });
      this.quiet = false;
    } else if (at >= 0) {
      this.quiet = true;
      now[Math.min(at, now.length - 1)]?.focus({ preventScroll: true });
      this.quiet = false;
    }
  }

  // ---- the arch ----

  private archSig(): string {
    const a = atArch();
    const pets = a.me?.pets;
    return `${a.near}:${a.party.map((p) => p.id).join(',')}:${a.extra.length}:${pets?.active ?? ''}:${pets?.out ? 1 : 0}:${Object.keys(pets?.owned ?? {}).join(',')}`;
  }

  private renderFard(body: HTMLElement): void {
    const me = myPlayer()!;
    const arch = atArch();
    this.fardSig = this.archSig();
    const cls = me.saga?.cls;
    const cleared = me.saga?.cleared ?? [];
    const open = runnableDungeons(cleared);
    const next = chapterBoss(cleared);
    if (!this.dungeon || !open.includes(this.dungeon)) this.dungeon = next ?? open[0] ?? DUNGEON_IDS[0]!;
    const levels = RUN_LEVEL_IDS.filter((l) => parseRunLevel(l) !== null).map(levelInfo);
    if (!levels.some((l) => l.level === this.level)) this.level = RUN_LEVEL_DEFAULT;
    const tree = runClient.tree;
    const running = runClient.run && runClient.run.phase !== 'ended' ? runClient.run : null;

    // the sagafrön shortcut to the tree
    const treeBtn = h('button', { class: 'alt tree-btn' }, `🌳 ${RUN_UI.treeBtn}${tree ? ` · 🌱 ${Math.floor(tree.seeds)}` : ''}`);
    this.tap(treeBtn, () => this.open('tree'));
    body.append(h('div', { class: 'toprow' }, treeBtn));

    if (running) {
      // a run is on: who is in it, and a way to hang on
      const lvl = levelInfo(running.level);
      body.append(
        h('div', { class: 'runon' }, h('span', { class: 'big' }, DUNGEON_ICON[running.boss]), h('div', null, h('b', null, `${RUN_UI.running}: ${dungeonName(running.boss)}`), h('div', { class: 'small' }, `${fmt(RUN_UI.step, { n: running.row, max: ROWS })} · ${lvl.icon} ${lvl.name}`))),
        h('div', { class: 'faces' }, running.party.map((p) => this.face(client.world?.players[p.id], p.name, !!p.bot))),
      );
      const join = h('button', { disabled: !cls }, `➕ ${RUN_UI.join}`);
      this.tap(join, () => {
        net.send({ t: 'run', a: 'join' });
      });
      body.append(h('div', { class: 'actions sticky' }, join, !cls ? h('span', { class: 'hint' }, RUN_UI.noClass) : null));
      return;
    }

    // where to
    body.append(h('div', { class: 'sect' }, `🧭 ${RUN_UI.whereTo}`));
    const grid = h('div', { class: 'tiles dungeons' });
    for (const id of DUNGEON_IDS) {
      const unlocked = open.includes(id);
      const done = cleared.includes(id);
      // a locked one is no button (the gamepad skips it) but a tap still says why
      const t = h(
        unlocked ? 'button' : 'div',
        { class: `tile${this.dungeon === id ? ' sel' : ''}${unlocked ? '' : ' locked'}`, title: DUNGEONS[id].name, 'aria-disabled': unlocked ? undefined : 'true' },
        h('span', { class: 'ic' }, unlocked ? DUNGEON_ICON[id] : '🔒'),
        h('span', { class: 'nm' }, DUNGEONS[id].name),
        h('span', { class: 'st' }, !unlocked ? `🔒 ${RUN_UI.locked}` : this.dungeon === id ? `✔ ${RUN_UI.chosen}` : done ? `✔ ${RUN_UI.cleared}` : '⭐'),
      );
      this.info(t, unlocked ? DUNGEON_ICON[id] : '🔒', DUNGEONS[id].name, unlocked ? DUNGEONS[id].intro.split(/(?<=[.!?…])\s/)[0]! : RUN_UI.lockedHint);
      this.tap(t, () => {
        if (!unlocked) {
          this.hint(RUN_UI.lockedHint);
          return;
        }
        this.dungeon = id;
        SFX.talk();
        this.render();
      });
      grid.append(t);
    }
    body.append(grid);

    // how hard
    body.append(h('div', { class: 'sect' }, `💪 ${RUN_UI.howHard}`));
    const lv = h('div', { class: 'tiles levels' });
    for (const l of levels) {
      const t = h('button', { class: `tile level${this.level === l.level ? ' sel' : ''}`, 'aria-pressed': String(this.level === l.level) }, h('span', { class: 'ic' }, l.icon), h('span', { class: 'nm' }, this.level === l.level ? `✔ ${l.name}` : l.name));
      this.info(t, l.icon, l.name, l.blurb);
      this.tap(t, () => {
        this.level = l.level;
        SFX.talk();
        this.render();
      });
      lv.append(t);
    }
    body.append(lv, h('div', { class: 'blurb' }, levelInfo(this.level).blurb));

    // who am I today: the four classes, and what each spell does
    body.append(h('div', { class: 'sect' }, `🎭 ${RUN_UI.whoToday}`));
    const look = this.lookCls ?? cls ?? CLASS_IDS[0]!;
    const row = h('div', { class: 'classes' });
    for (const id of CLASS_IDS) {
      const c = CLASSES[id];
      const mine = cls === id;
      const b = h('button', { class: `classcard${mine ? ' sel' : ''}${look === id ? ' look' : ''}`, 'aria-pressed': String(mine), style: { '--c': c.color } }, h('span', { class: 'ic' }, c.emoji), h('span', { class: 'nm' }, mine ? `✔ ${c.name}` : c.name), h('span', { class: 'role' }, c.roleName));
      this.info(b, c.emoji, `${c.name} · ${c.roleName}`, c.blurb);
      this.tap(b, () => {
        this.lookCls = id;
        if (!mine) net.send({ t: 'saga', a: 'class', cls: id });
        SFX.talk();
        this.render();
      });
      b.addEventListener('focus', () => {
        if (this.lookCls !== id && !this.quiet) {
          this.lookCls = id;
          this.render();
        }
      });
      row.append(b);
    }
    body.append(row);
    const spells = h('div', { class: 'spellrow' });
    for (const sid of CLASSES[look].spells) {
      const sp = SPELLS[sid]!;
      const b = h('button', { class: 'alt spell', 'aria-label': sp.name }, h('span', { class: 'ic' }, sp.icon), h('span', { class: 'nm' }, sp.name));
      this.tap(b, () => this.showInfo(b));
      spells.append(this.info(b, sp.icon, sp.name, sp.text));
    }
    body.append(spells);

    // which animal comes along (pets.ts): one on a run, chosen here (or in the lobby at the kennel)
    this.petRow(body, me);

    // who comes
    body.append(h('div', { class: 'sect' }, `👪 ${RUN_UI.whoComes}`));
    const classes = arch.party.map((p) => p.saga?.cls).filter((c): c is ClassId => !!c);
    const help = companionClass(classes);
    const faces = h('div', { class: 'faces' }, arch.party.map((p) => this.face(p, p.id === client.me ? RUN_UI.me : p.name, false)));
    if (help && this.companion) faces.append(this.face(undefined, `${RUN_UI.helper}: ${CLASSES[help].name}`, true, CLASSES[help].emoji));
    body.append(faces);
    if (arch.extra.length) body.append(h('div', { class: 'hint' }, `+${arch.extra.length}: ${RUN_UI.full}`));
    if (help) {
      const t = h('button', { class: `alt toggle${this.companion ? ' on' : ''}` }, this.companion ? `✔ 🤝 ${RUN_UI.helperOn}` : `✖ ${RUN_UI.helperOff}`);
      this.tap(t, () => {
        this.companion = !this.companion;
        this.render();
      });
      body.append(h('div', { class: 'actions' }, t));
    }

    const go = h('button', { class: 'go', disabled: !cls || !arch.near }, `▶️ ${RUN_UI.start}`);
    this.tap(go, () => {
      if (!cls || !arch.near || !this.dungeon) return;
      net.send({ t: 'run', a: 'start', level: this.level as RunLevel, dungeon: this.dungeon, ...(help && !this.companion ? { companion: false } : {}) });
    });
    // Garderoben (the looks of the class chosen above): a shortcut, since the looks are worn per class
    const wardrobe = h('button', { class: 'alt wardrobe-btn', type: 'button' }, `👕 ${LOOK_T.title}`);
    this.tap(wardrobe, () => document.dispatchEvent(new Event('lilla:looks-arch')));
    body.append(h('div', { class: 'actions sticky' }, wardrobe, go));
    if (!cls) body.append(h('div', { class: 'hint' }, RUN_UI.noClass));
    else if (!arch.near) body.append(h('div', { class: 'hint' }, RUN_UI.nearGate));
  }

  /** "Vilket djur följer med?": the pets you have, one chosen; each one explains itself on the info card. */
  private petRow(body: HTMLElement, me: PlayerState): void {
    body.append(h('div', { class: 'sect' }, `🐾 ${PET_T.title}`));
    const owned = ownedPetIds(me);
    if (!owned.length) {
      body.append(h('div', { class: 'hint' }, PET_T.noneRow));
      return;
    }
    const here = activePet(me);
    const row = h('div', { class: 'tiles pets' });
    for (const id of owned) {
      const d = PETS[id]!;
      const mine = me.pets?.active === id;
      const name = me.pets?.owned[id]?.name || d.name;
      const roleName = PET_T[`role${d.role[0]!.toUpperCase()}${d.role.slice(1)}` as 'roleAttack'];
      const t = h(
        'button',
        { class: `tile pet${mine ? ' sel' : ''}`, 'aria-pressed': String(mine), title: name },
        h('span', { class: 'ic' }, d.emoji),
        h('span', { class: 'nm' }, mine ? `✔ ${name}` : name),
        h('span', { class: 'st' }, mine && !here ? PET_T.stateOut : mine ? PET_T.chosen : roleName),
      );
      this.info(t, d.emoji, `${name} · ${roleName} · ${PET_T.rarity[d.rarity]}`, `${d.trickText} ${d.blurb}`);
      this.tap(t, () => {
        net.send({ t: 'pet', a: 'pick', id });
        SFX.talk();
      });
      row.append(t);
    }
    body.append(row);
  }

  private face(p: PlayerState | undefined, name: string, bot: boolean, emoji?: string): HTMLElement {
    const c = p?.saga?.cls ? CLASSES[p.saga.cls] : null;
    return h(
      'div',
      { class: `face${bot ? ' bot' : ''}` },
      p ? h('img', { src: portraitUrl(p.appearance, p.outfit, 3), alt: '' }) : h('span', { class: 'emo' }, emoji ?? '🤝'),
      h('span', { class: 'nm' }, name),
      c ? h('span', { class: 'cls', title: c.name }, c.emoji) : null,
      c ? h('span', { class: 'rolew' }, c.roleName) : null,
    );
  }

  /** A short line in the window (a toast would be under it). */
  private hint(text: string, ms = 2400): void {
    this.modal?.querySelector('.flash')?.remove();
    const el = h('div', { class: 'flash' }, text);
    this.modal?.querySelector('.panel')?.append(el);
    setTimeout(() => el.remove(), ms);
  }

  // ---- the cards of a runa ----

  private pick(i: number): void {
    net.send({ t: 'run', a: 'pick', card: i });
    SFX.talk();
  }

  private buy(item: 'runa' | 'party' | 'potion' | 'spirit' | 'sharpen', slot?: number, id?: string): void {
    net.send({ t: 'run', a: 'buy', item, ...(slot !== undefined ? { slot } : {}), ...(id !== undefined ? { id } : {}) });
    SFX.talk();
  }

  private voteEvent(choice: number): void {
    net.send({ t: 'run', a: 'event', choice });
    SFX.talk();
  }

  /** The windows that open by themselves: the path, a Händelse, and once for each stop the Köpman's camp and a Vilosten's choice. */
  private autoOpen(run: RunSnap | null): void {
    if (!run) return;
    if (run.phase === 'event') {
      if (this.win !== 'event') this.open('event');
      else this.render();
      return;
    }
    if (this.win === 'event') this.close(true);
    const key = `${run.id}:${run.node}`;
    const mineRest = (run.restChoice ?? []).includes(client.me);
    if (run.shop && run.kind === 'shop' && this.seenStop !== `shop:${key}` && (!this.win || this.win === 'map')) {
      this.seenStop = `shop:${key}`;
      this.open('shop');
    } else if (mineRest && this.seenStop !== `rest:${key}` && !this.win) {
      this.seenStop = `rest:${key}`;
      this.open('rest');
    } else if (this.win === 'rest' && !mineRest) this.render();
  }

  private choosePath(id: string): void {
    if (myRun()?.paths[client.me]) return;
    net.send({ t: 'run', a: 'path', id });
    SFX.talk();
  }

  private reroll(): void {
    if ((runClient.offer?.rerolls ?? 0) > 0) net.send({ t: 'run', a: 'reroll' });
  }

  private renderOffer(body: HTMLElement): void {
    const o = runClient.offer;
    const run = myRun();
    if (!o || !run) return;
    this.offerBars = renderOfferWindow({ tap: (el, fn) => this.tap(el, fn), info: (el, i, n, t) => this.info(el, i, n, t) }, body, run, o, client.me, myPlayer()?.saga?.cls, (i) => this.pick(i), () => this.reroll());
    this.tick();
  }

  // ---- the map of the route ----

  private renderMap(body: HTMLElement): void {
    const run = myRun() ?? runClient.run;
    if (!run) return;
    const colW = 52;
    const rowH = 44;
    const lanesMax = Math.max(...run.route.map((n) => n.lanes), 1);
    const W = colW * ROWS + 20;
    const H = rowH * lanesMax + 24;
    const pos = (n: RouteNodeSnap): { x: number; y: number } => ({ x: 20 + (n.row - 1) * colW, y: H / 2 + (n.lane - (n.lanes - 1) / 2) * rowH });
    const byId = new Map(run.route.map((n) => [n.id, n]));
    const onPath = new Set(run.path);
    const choice = new Set((run.choices ?? []).map((c) => c.node));
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'route-svg', role: 'img' });
    for (const n of run.route)
      for (const nx of n.next) {
        const m = byId.get(nx);
        if (!m) continue;
        const a = pos(n);
        const b = pos(m);
        const walked = onPath.has(n.id) && onPath.has(nx);
        s.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `edge${walked ? ' walked' : ''}` }));
      }
    for (const n of run.route) {
      const { x, y } = pos(n);
      const state = n.id === run.node ? 'now' : onPath.has(n.id) ? 'done' : choice.has(n.id) ? 'choice' : 'next';
      const g = svg('g', { class: `node ${state}`, style: `--c:${KIND_COLOR[n.kind]}` });
      if (state === 'now') g.append(svg('text', { x, y: y - 19, 'text-anchor': 'middle', class: 'em' }, '📍'));
      g.append(svg('circle', { cx: x, cy: y, r: 15, ...(state === 'choice' ? { 'stroke-dasharray': '4 3' } : {}) }), svg('text', { x, y: y + 5, 'text-anchor': 'middle', class: 'em' }, KIND_ICON[n.kind]));
      s.append(g);
    }
    for (let r = 1; r <= ROWS; r++) s.append(svg('text', { x: 20 + (r - 1) * colW, y: 14, 'text-anchor': 'middle', class: 'rownum' }, String(r)));
    body.append(h('p', { class: 'intro' }, RUN_UI.mapHint), h('div', { class: 'route-wrap' }, s));
    const legend = h('div', { class: 'legend' });
    for (const k of ['flock', 'elite', 'treasure', 'event', 'shop', 'rest', 'mini', 'boss'] as NodeKind[]) {
      const b = h('button', { class: 'alt legend-btn' }, `${KIND_ICON[k]} ${STOP_WORDS[k]}`);
      this.tap(b, () => this.showInfo(b));
      legend.append(this.info(b, KIND_ICON[k], STOP_NAMES[k] ?? '', RUN_UI.kinds[k] ?? ''));
    }
    body.append(legend);
  }

  // ---- the runor you hold ----

  private renderRunorList(body: HTMLElement): void {
    const run = myRun();
    if (!run) return;
    renderHoldWindow({ tap: (el, fn) => this.tap(el, fn), info: (el, i, n, t) => this.info(el, i, n, t) }, body, run, client.me);
  }

  /** The choice at a Vilosten: Vila or skärp a runa. */
  private renderRest(body: HTMLElement): void {
    const run = myRun();
    if (!run) return;
    renderRestWindow({ tap: (el, fn) => this.tap(el, fn), info: (el, i, n, t) => this.info(el, i, n, t) }, body, run, client.me, () => { net.send({ t: 'run', a: 'rest' }); SFX.talk(); }, (id) => { net.send({ t: 'run', a: 'sharpen', id }); SFX.talk(); });
  }

  // ---- going home early ----

  private renderLeave(body: HTMLElement): void {
    const yes = h('button', { class: 'danger' }, `🚪 ${RUN_UI.homeYes}`);
    this.tap(yes, () => {
      this.leaving = true;
      this.leaveMs = runElapsed();
      net.send({ t: 'run', a: 'leave' });
      this.close(true);
    });
    const no = h('button', { class: 'alt' }, `↩️ ${RUN_UI.homeNo}`);
    this.tap(no, () => this.close());
    body.append(h('p', { class: 'intro' }, RUN_UI.homeSub), h('div', { class: 'actions sticky' }, no, yes));
  }

  // ---- the end of a run ----

  /** Going home alone ends the run without a message for the one who left: the summary is made from the last state. */
  private leaveSummary(): void {
    const last = runClient.last;
    if (this.gotEnded || !last || myRun()) return;
    this.gotEnded = true;
    runClient.ended = {
      outcome: 'leave',
      ms: this.leaveMs || last.elapsed,
      seeds: last.earned[client.me] ?? 0,
      zones: 0,
      runor: [...last.runor],
      level: last.level,
      spiritUsed: last.spiritUsed,
      path: last.path.map((id) => last.route.find((n) => n.id === id)?.kind).filter((k): k is NodeKind => !!k),
    };
    this.open('summary');
  }

  private renderSummary(body: HTMLElement): void {
    const e = runClient.ended;
    if (!e) return;
    const last = runClient.last;
    const lvl = levelInfo(e.level ?? last?.level ?? RUN_LEVEL_DEFAULT);
    body.append(h('div', { class: `outcome ${e.outcome}` }, h('span', { class: 'big' }, RUN_UI.outcomes[e.outcome] ?? '🏁'), h('b', null, RUN_T.ended[e.outcome] ?? ''), last ? h('span', { class: 'where' }, `${DUNGEON_ICON[last.boss]} ${dungeonName(last.boss)}`) : null));
    const stat = (icon: string, label: string, value: string | HTMLElement): HTMLElement => h('div', { class: 'stat' }, h('span', { class: 'ic' }, icon), h('span', { class: 'lb' }, label), h('b', { class: 'val' }, value));
    const path = h('span', { class: 'path' }, (e.path ?? []).map((k) => h('span', { title: STOP_NAMES[k] }, KIND_ICON[k])));
    const runor = h('span', { class: 'path' }, e.runor.length ? e.runor.map((id) => h('span', { title: runaName(id) }, runa(id)?.icon ?? '🔹')) : '–');
    body.append(
      h(
        'div',
        { class: 'stats' },
        stat('⏱', RUN_UI.time, ms(e.ms)),
        stat('👣', RUN_UI.steps, `${e.path?.length ?? 0}`),
        stat('🎴', RUN_UI.runor, e.runor.length ? `${e.runor.length}` : '–'),
        stat('🌱', RUN_UI.seeds, `+${e.seeds}`),
        stat(lvl.icon, RUN_UI.level, lvl.name),
        stat('🌟', RUN_UI.spiritsUsed, `${e.spiritUsed ?? 0}`),
      ),
    );
    if (e.trophy) body.append(h('div', { class: 'stat trophy' }, h('span', { class: 'ic' }, itemIcon(e.trophy, '🏆')), h('span', { class: 'lb' }, RUN_UI.trophy), h('b', { class: 'val' }, `${itemName(e.trophy)} (${RUN_UI.trophyWhere[e.trophyWhere ?? 'bag'] ?? ''})`)));
    if (e.path?.length) body.append(h('div', { class: 'trail' }, h('span', null, '👣'), path));
    if (e.runor.length) body.append(h('div', { class: 'trail' }, h('span', null, '🎴'), runor));
    const lookRow = e.outcome === 'win' ? lookSummary() : null;
    if (lookRow) body.append(lookRow);
    const home = h('button', { class: 'go' }, `🏠 ${RUN_UI.backHome}`);
    this.tap(home, () => this.close());
    const tree = h('button', { class: 'alt' }, `🌳 ${RUN_UI.treeBtn}`);
    this.tap(tree, () => this.open('tree'));
    body.append(h('div', { class: 'actions sticky' }, tree, home));
  }

  // ---- the sagaträd ----

  private renderTree(body: HTMLElement): void {
    const me = myPlayer()!;
    const t = runClient.tree ?? { seeds: me.run?.seeds ?? 0, earned: me.run?.earned ?? 0, tree: me.run?.tree ?? [], stage: 0 };
    const save = { seeds: t.seeds, earned: t.earned, tree: t.tree, runs: 0, wins: 0, wipes: 0, timeouts: 0, zones: 0, best: {}, clears: {} };
    const stage = RUN_UI.stages[Math.min(t.stage, RUN_UI.stages.length - 1)]!;
    body.append(
      h(
        'div',
        { class: 'treehead' },
        h('span', { class: 'big' }, ['🌱', '🌿', '🌳', '🌳', '🌟'][Math.min(t.stage, 4)]),
        h('div', null, h('b', null, fmt(RUN_UI.treeYou, { n: Math.floor(t.seeds) })), h('div', { class: 'small' }, `${fmt(RUN_UI.treeStage, { name: stage })} (${t.stage + 1}/${TREE_STAGES.length})`)),
      ),
      h('p', { class: 'intro' }, RUN_UI.treeSub),
    );
    const cols = h('div', { class: 'treecols' });
    const depth = (n: TreeNode): number => (n.needs ? 1 + depth(SEED_TREE.find((x) => x.id === n.needs)!) : 0);
    for (const b of BRANCHES) {
      const col = h('div', { class: `treecol ${b}` }, h('div', { class: 'bh' }, `${BRANCH_ICON[b]} ${BRANCH_NAMES[b]}`));
      const nodes = SEED_TREE.filter((n) => n.branch === b).sort((a, c) => depth(a) - depth(c) || a.cost - c.cost);
      for (const n of nodes) {
        const planted = t.tree.includes(n.id);
        const err = plantError(save, n.id);
        const state = planted ? 'planted' : err === 'needs' ? 'locked' : err === 'seeds' ? 'poor' : 'ready';
        const eff = Object.keys(n.effect)[0] ?? '';
        const el = h(
          'button',
          { class: `tnode ${state}${this.treePick === n.id ? ' sel' : ''}`, style: { marginLeft: `${depth(n) * 2}px` } },
          h('span', { class: 'ic' }, planted ? '✔' : (EFFECT_ICON[eff] ?? '🌱')),
          h('span', { class: 'nm' }, treeName(n.id)),
          h('span', { class: 'cost' }, planted ? '' : `${state === 'locked' ? '🔒 ' : ''}🌱 ${n.cost}${state === 'poor' ? ' ✖' : ''}`),
        );
        this.info(el, planted ? '✔' : (EFFECT_ICON[eff] ?? '🌱'), treeName(n.id), TREE_TEXT[n.id] ?? '');
        this.tap(el, () => {
          this.treePick = n.id;
          SFX.talk();
          this.render();
        });
        col.append(el);
      }
      cols.append(col);
    }
    body.append(cols);
    // the node looked at: what it does, and the button
    const pick = this.treePick ? SEED_TREE.find((n) => n.id === this.treePick) : null;
    if (!pick) {
      body.append(h('div', { class: 'treeinfo hint sticky' }, RUN_UI.treeHint));
      return;
    }
    const planted = t.tree.includes(pick.id);
    const err = plantError(save, pick.id);
    const need = pick.needs ? treeName(pick.needs) : '';
    const btn = h('button', { class: 'go', disabled: planted || err !== null }, planted ? `✔ ${RUN_UI.planted}` : `🌱 ${RUN_UI.plant} · ${pick.cost}`);
    this.tap(btn, () => {
      if (planted || err) return;
      net.send({ t: 'seed', a: 'plant', node: pick.id });
    });
    body.append(
      h(
        'div',
        { class: 'treeinfo sticky' },
        h('div', { class: 'ti' }, h('b', null, `${EFFECT_ICON[Object.keys(pick.effect)[0] ?? ''] ?? '🌱'} ${treeName(pick.id)}`), h('span', null, TREE_TEXT[pick.id] ?? ''), h('span', { class: 'small' }, planted ? '' : err === 'needs' ? `🔒 ${fmt(RUN_UI.needs, { name: need })}` : err === 'seeds' ? `🌱 ${RUN_UI.tooFew}` : fmt(RUN_UI.cost, { n: pick.cost }))),
        btn,
      ),
    );
  }
}
