// HUD: top chips, the three round buttons at the top right, hotbar, toasts, touch controls.
import { A11Y_T, HOTBAR_SIZE, HOUSE_T, MAX_HEARTS, MENU_T, RUN_UI, SPELLS, T, areaName, fmt, houseTitle, isHomeKey, isSagaKey, itemText, ownerOfHome, stackName, type ItemStack } from '@varldstradet/shared';
import { Minimap } from './minimap.ts';
import { stackIconUrl } from '@art/stackicon.ts';
import { net } from '../net.js';
import { bus, client, furnish, inOwnHouse, myPlayer, serverNow } from '../state.js';
import { clear, h, icon, onTap } from './dom.js';
import { levelOf, showsLevel } from '../saga.ts';
import { cards } from './info.ts';
import { centerColumn, classifyToast, say } from './lane.ts';
import { createLogButton } from './log.ts';
import { myRun } from '../run.ts';

/** What the HUD drives on the game view (the 2D scene or the 3D view). */
export interface HudTarget {
  joystick: { dx: number; dy: number };
  runHeld: boolean;
  act(): void;
  /** A quick tap on the joystick's side of the screen (the dungeons aim at a monster tapped there). */
  tap?(clientX: number, clientY: number): void;
  /** A finger held still there for `ms` and let go. */
  hold?(clientX: number, clientY: number, ms: number): void;
}

export function slotEl(stack: ItemStack | null, opts: { selected?: boolean; picked?: boolean; dim?: boolean; key?: string; onTap?: () => void } = {}): HTMLDivElement {
  const el = h('div', { class: `slot${opts.selected ? ' selected' : ''}${opts.picked ? ' picked' : ''}${opts.dim ? ' dim' : ''}` });
  if (opts.key) el.append(h('span', { class: 'key' }, opts.key));
  if (stack) {
    el.append(icon(stackIconUrl(stack), stackName(stack)));
    el.dataset.infoName = stackName(stack);
    el.dataset.infoText = itemText(stack.item);
    el.setAttribute('aria-label', stackName(stack));
    if (stack.count > 1) el.append(h('span', { class: 'count' }, stack.count));
  }
  if (opts.onTap) onTap(el, opts.onTap);
  return el;
}

export class Hud {
  root: HTMLElement;
  private top: HTMLElement;
  private hotbar: HTMLElement;
  private heldName: HTMLElement;
  private joy: HTMLElement;
  private joyKnob: HTMLElement;
  private menuBtn!: HTMLElement;
  minimap!: Minimap;
  /** Extra chips after the built-in ones (the 2D game adds the weather). */
  topExtras: (() => HTMLElement | null)[] = [];

  constructor(
    private ui: HTMLElement,
    private scene: () => HudTarget | null,
    private openMenu: (ui: 'inventory') => void,
  ) {
    this.root = h('div', { class: 'hud' });
    this.top = h('div', { class: 'hud-top' });
    // the top row is drawn anew with every state: the level chip's tap (it opens the journal's level page) is caught here
    onTap(this.top, (ev) => {
      if ((ev.target as HTMLElement | null)?.closest?.('.chip.level')) document.dispatchEvent(new Event('vt:journal'));
    });
    this.hotbar = h('div', { class: 'hotbar' });
    this.heldName = h('div', { class: 'hud-name' });
    this.joyKnob = h('i');
    this.joy = h('div', { class: 'joy' }, this.joyKnob);
    const zone = h('div', { class: 'joy-zone' }, this.joy);
    // the two big buttons on a touch screen: they have words too (in a fight "Slå", else "Använd")
    const act = h('button', { class: 'act-btn', type: 'button', 'aria-label': `${A11Y_T.hit} / ${A11Y_T.use}` }, h('span', { class: 'ic' }, '✋'), h('span', { class: 'lb use' }, A11Y_T.use), h('span', { class: 'lb hit' }, A11Y_T.hit));
    cards.info(act, '✋', `${A11Y_T.hit} / ${A11Y_T.use}`, A11Y_T.hitText);
    cards.press(act, () => this.scene()?.act());
    const run = h('button', { class: 'run-btn', type: 'button', 'aria-label': A11Y_T.run }, h('span', { class: 'ic' }, '🏃'), h('span', { class: 'lb' }, A11Y_T.run));
    const setRun = (v: boolean) => {
      const s = this.scene();
      if (s) s.runHeld = v;
    };
    run.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      setRun(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) run.addEventListener(ev, () => setRun(false));
    // The top right: three round buttons, in the lobby and in a run alike. The Logg (it carries the unread dot), the map (out of a
    // run the little map of where you are, in a run the map of the road: ui/run.css shows the one that fits) and ☰, which opens
    // the menu with everything else (ui/hudmenu.ts). ☰ stands in the corner, where it is easiest to hit.
    const mapBtn = this.roundBtn('🧭', () => this.minimap.toggle(), A11Y_T.map, A11Y_T.btnMap);
    mapBtn.classList.add('map-btn');
    const routeBtn = this.roundBtn('🗺️', () => document.dispatchEvent(new Event('vt:runmap')), RUN_UI.route, RUN_UI.infoMap);
    routeBtn.classList.add('route-btn');
    // (onTap, not cards.tap: while "Förklara" is on the menu still opens, and the mode is turned off in it)
    const menuBtn = (this.menuBtn = h('button', { class: 'round hud-menu-btn', type: 'button', 'aria-label': MENU_T.title, 'aria-haspopup': 'dialog' }, '☰'));
    cards.info(menuBtn, '☰', MENU_T.title, MENU_T.btnInfo);
    onTap(menuBtn, () => document.dispatchEvent(new Event('vt:menu')));
    const right = h('div', { class: 'hud-right' }, createLogButton(), mapBtn, routeBtn, menuBtn);
    this.minimap = new Minimap();
    document.addEventListener('vt:minimap', () => this.minimap.toggle());
    this.root.append(this.top, right, this.hotbar, this.heldName, zone, act, run, this.minimap.el);
    centerColumn(this.root);
    ui.append(this.root);
    this.setupJoystick(zone);

    bus.on('me', () => this.render());
    bus.on('area', () => this.renderFurnish());
    bus.on('state', () => this.renderTop());
    bus.on('day', () => this.renderTop());
    // long ones (how to let the microphone in) stay long enough to be read: the lane times a message by its length
    bus.on('toast', (text) => this.toast(text));
    this.render();
  }

  private roundBtn(label: string, fn: () => void, name: string, text: string): HTMLElement {
    const b = h('button', { class: 'round', type: 'button' }, label);
    cards.info(b, label, name, text);
    cards.tap(b, fn);
    return b;
  }

  /** A message in the lane (and the log). `ms` only to stay longer than the reading time. */
  toast(text: string, ms = 0): void {
    say(text, { kind: classifyToast(text, !!myRun()), ...(ms ? { ms: Math.max(ms, 3500) } : {}) });
  }

  /** Möblera on or off (only in your own house). */
  toggleFurnish(): void {
    if (!inOwnHouse()) return;
    furnish.on = !furnish.on;
    this.toast(furnish.on ? HOUSE_T.furnishOn : HOUSE_T.furnishOff, furnish.on ? 4500 : 2000);
    this.renderFurnish();
  }

  private renderFurnish(): void {
    if (!inOwnHouse()) furnish.on = false;
    // Möblera is in the menu: while it is on, ☰ carries a little chair, so it is plain where to turn it off
    this.menuBtn.classList.toggle('furnishing', furnish.on);
  }

  render(): void {
    this.renderTop();
    this.renderFurnish();
    const me = myPlayer();
    clear(this.hotbar);
    if (!me) return;
    // nothing to hold (no tools any more): no bar either
    const hasStuff = me.inventory.slice(0, HOTBAR_SIZE).some(Boolean);
    this.hotbar.hidden = !hasStuff;
    for (let i = 0; hasStuff && i < HOTBAR_SIZE; i++) {
      const s = me.inventory[i] ?? null;
      this.hotbar.append(
        slotEl(s, {
          selected: me.selected === i,
          key: String(i + 1),
          onTap: () => {
            if (me.selected === i) this.openMenu('inventory');
            else this.select(i);
          },
        }),
      );
    }
    const held = me.inventory[me.selected];
    this.heldName.textContent = held ? stackName(held) : '';
  }

  select(i: number): void {
    const me = myPlayer();
    if (!me) return;
    me.selected = i;
    net.send({ t: 'select', slot: i });
    this.render();
  }

  renderTop(): void {
    const me = myPlayer();
    clear(this.top);
    const f = client.timeMs / (10 * 60 * 1000);
    const clock = f < 0.3 ? '🌅' : f < 0.65 ? '☀️' : f < 0.8 ? '🌇' : '🌙';
    this.top.append(h('div', { class: 'chip' }, clock));
    // (no purse: nothing in the game spends kronor any more; the shop, the smithy and the crafts are gone)
    if (me && me.stars > 0) this.top.append(h('div', { class: 'chip' }, `⭐ ${me.stars}`));
    // the hero level, for anyone past the first or with a class; a tap opens the journal's level page
    if (me && showsLevel(me)) {
      this.top.append(h('div', { class: 'chip level', title: T.sagaLevelChipTip }, `⭐ ${fmt(T.sagaLevelChip, { n: levelOf(me) })}`));
    }
    // pizza power, or a berserker's rage in a dungeon
    if (me && me.boostUntil !== undefined && me.boostUntil > serverNow()) this.top.append(isSagaKey(me.area) ? h('div', { class: 'chip', title: SPELLS.raseri?.name }, '🔥💨') : h('div', { class: 'chip', title: T.pizzaPower }, '🍕💨'));
    // hearts: in the cave, when hurt, and always while walking the world as a hero
    if (me && me.hearts < MAX_HEARTS) this.top.append(h('div', { class: 'chip hearts' }, '❤️'.repeat(Math.max(0, me.hearts)) + '🖤'.repeat(Math.max(0, MAX_HEARTS - me.hearts))));
    if (me && isHomeKey(me.area)) {
      // whose house this is
      const owner = client.world?.players[ownerOfHome(me.area)];
      this.top.append(h('div', { class: 'chip house' }, `🏠 ${owner && owner.id !== me.id ? houseTitle(owner.name) : HOUSE_T.myHouse}`));
    } else if (me && isSagaKey(me.area)) this.top.append(h('div', { class: 'chip' }, `⚔️ ${areaName(me.area)}`));

    if (client.season !== 'none') {
      const glyph = { halloween: '🎃', jul: '🎄', pask: '🐣', midsommar: '🌸', none: '' }[client.season];
      this.top.append(h('div', { class: 'chip' }, glyph));
    }
    for (const extra of this.topExtras) {
      const el = extra();
      if (el) this.top.append(el);
    }
  }

  private setupJoystick(zone: HTMLElement): void {
    let active = false;
    let ox = 0;
    let oy = 0;
    let id = -1;
    /** When and where the finger came down, to tell a tap from a push of the stick. */
    let downAt = 0;
    let moved = 0;
    const radius = () => 14 * zoomPx();
    const set = (dx: number, dy: number) => {
      const s = this.scene();
      if (s) s.joystick = { dx, dy };
    };
    zone.addEventListener('pointerdown', (e) => {
      if (active) return;
      active = true;
      id = e.pointerId;
      downAt = performance.now();
      moved = 0;
      const r = zone.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      this.joy.style.left = `${ox}px`;
      this.joy.style.top = `${oy}px`;
      this.joy.style.display = 'block';
      this.joyKnob.style.transform = 'translate(-50%,-50%)';
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== id) return;
      const r = zone.getBoundingClientRect();
      let dx = e.clientX - r.left - ox;
      let dy = e.clientY - r.top - oy;
      const len = Math.hypot(dx, dy);
      moved = Math.max(moved, len);
      const rad = radius();
      if (len > rad) {
        dx = (dx / len) * rad;
        dy = (dy / len) * rad;
      }
      this.joyKnob.style.transform = `translate(-50%,-50%) translate(${dx}px, ${dy}px)`;
      const dead = rad * 0.2;
      if (len < dead) set(0, 0);
      else set(dx / rad, dy / rad);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      active = false;
      this.joy.style.display = 'none';
      set(0, 0);
      if (e.type === 'pointerup' && moved < 3 * zoomPx() && performance.now() - downAt < 350) this.scene()?.tap?.(e.clientX, e.clientY);
      // a finger held still on the stick's side: a long press there (Märke: mark the monster under it)
      else if (e.type === 'pointerup' && moved < 3 * zoomPx()) this.scene()?.hold?.(e.clientX, e.clientY, performance.now() - downAt);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
}

export const zoomPx = (): number => Number(getComputedStyle(document.documentElement).getPropertyValue('--z')) || 4;
