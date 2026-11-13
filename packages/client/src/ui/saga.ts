// Sagan om Världsträdet's windows and dungeon HUD, as HTML over the game. Out in the world: Kämpastenen's class
// cards, Völvan Sigrun's story and the saga's journal, the villagers' saga quests, a quest tracker, the family list
// to jump to someone. Inside a dungeon: the spell bar (keys 1–4 and a potion on 5) instead of the hotbar, your
// health and your target's, the party, the boss's health and the attack it is getting ready, its shouts, big
// banners (with fireworks for a beaten boss), the loot window, and what happens while you are fallen or frozen.
// Out in the world with hero mode on, the spell bar and your frame (hearts for health) and your target's come along,
// and the gear window puts a weapon, an offhand and an amulet on the hero.
import {
  RUN_T,
  LOG_T,
  A11Y_T,
  ATTACK_KINDS,
  BLOCK_SPECIES,
  CLASSES,
  COMBO_TEXT,
  FIGHT_UI,
  HUGIN_T,
  MOB_FLAG,
  MOB_ROLES,
  PIP_MAX,
  PIP_NAMES,
  SPEND_MUL,
  CLASS_IDS,
  DOWN_MS,
  FRIEND_KINDS,
  DUNGEONS,
  DUNGEON_IDS,
  LEVEL_REWARDS,
  MAX_LEVEL,
  MAX_HEARTS,
  NPCS,
  RARITY_COLORS,
  RARITY_NAMES,
  SAGA_BOSSES,
  SAGA_CHAPTERS,
  SAGA_QUESTS,
  SPELLS,
  SPELL_LABEL,
  T,
  TILE,
  VOLVA_ID,
  areaName,
  chapterDone,
  combatDef,
  fmt,
  heroLevel,
  isSagaKey,
  LOOK_T,
  LOOK_TIER_NAMES,
  encodeLook,
  lookPiece,
  setsOf,
  wearableBy,
  itemName,
  levelSpan,
  previousDungeon,
  questCount,
  questState,
  PETS,
  PET_T,
  readProgress,
  sagaItem,
  type Change,
  type ClassId,
  type Rarity,
  type SagaQuest,
  MOB_ARCHETYPE,
  MOB_T,
  MOB_TEXT,
  SPECIES_NAMES,
  dungeonSpecies,
  mobVariant,
  RUN_LEVELS,
} from '@varldstradet/shared';
import { getArt, portraitUrl } from '@art/textures.ts';
import { drawAnimal } from '@art/animals.ts';
import { net } from '../net.ts';
import {
  FLAG,
  castSlot,
  classOf,
  cooldown,
  cycleTarget,
  drinkPotion,
  fightMode,
  flagsOf,
  markedMob,
  spendTarget,
  toggleMark,
  getTarget,
  inSaga,
  inSharedPause,
  mySpend,
  pipHalf,
  pipsOf,
  spendCtx,
  stopTarget,
  levelOf,
  liveTarget,
  myClass,
  posOf,
  potionCooldown,
  potionCount,
  pressedAt,
  sagaSnap,
  sagaTick,
  setTarget,
  titleOf,
  webbed,
} from '../saga.ts';
import { PRIMER, isInterrupt, isReaction, newPips, primerHint, type SpendView } from '../fight.ts';
import { boltBadge, fightExplain, fightStrip, pipRow, roleLine, roleMarker, setPips, skullMark, starBadge } from './fightcard.ts';
import { myRun, pathOf } from '../run.ts';
import { TIPS } from '../hugin.ts';
import { seenTips, tipPic } from './hugin.ts';
import { huginCanvas } from '@art/hugin.ts';
import { pathIcon } from './runpick.ts';
import { SAGA_SFX } from '../sagasfx.ts';
import { lootLookCard, rememberLooks, renderLooks, resetLooksWindow } from './looks.ts';
import { SFX } from '../sound.ts';
import { activeWorld, bus, client, myPlayer, serverNow } from '../state.ts';
import { clear, h, onTap } from './dom.ts';
import { announce } from './access.ts';
import { cards } from './info.ts';
import { centerColumn, readMs, say, type LogKind } from './lane.ts';
import { calm, currentDevice } from '../a11y.ts';
import type { Menus } from './menus.ts';
import './saga.css';

/** Spells aimed at a monster, and at a friend: out of reach shows on their button. */
const AT_MONSTER = ATTACK_KINDS;
const AT_FRIEND = FRIEND_KINDS;
const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const KIND_EMOJI: Record<string, string> = { weapon: '⚔️', offhand: '🛡️', amulet: '📿', hat: '🪖', shirt: '👕', pet: '🐾', mount: '🐎', potion: '🧪', decor: '✨', quest: '📦', material: '💠' };
const FLAG_ICONS: [number, string][] = [
  [FLAG.down, '💀'],
  [FLAG.frozen, '🧊'],
  [FLAG.wall, '🧱'],
  [FLAG.rage, '🔥'],
  [FLAG.hot, '🌿'],
  [FLAG.slow, '🐌'],
  [FLAG.shield, '🔰'],
];

type Win = 'class' | 'volva' | 'journal' | 'family' | 'loot' | 'gear';
/** The windows that are tabs of the saga's book. */
const BOOK: readonly Win[] = ['journal', 'gear'];
type LootChange = Extract<Change, { t: 'loot' }>;
type BannerChange = Extract<Change, { t: 'banner' }>;

const flagIcons = (fl: number): string => FLAG_ICONS.filter(([f]) => fl & f).map(([, e]) => e).join('');
/** A monster's states in the target frame: sees stars (Öppning), dazed, slowed, behind a shield, under a Utmana!. */
const MOB_ICONS: [number, string][] = [
  [MOB_FLAG.open, '💫'],
  [MOB_FLAG.dazed, '⭐'],
  [MOB_FLAG.slowed, '❄️'],
  [MOB_FLAG.shielded, '🛡️'],
  [MOB_FLAG.taunted, '📣'],
];
const mobIcons = (fl: number): string => MOB_ICONS.filter(([f]) => fl & f).map(([, e]) => e).join('');
const hpColor = (k: number): string => (k > 0.5 ? '#4fcf5a' : k > 0.25 ? '#f2c33a' : '#e8473a');
/** Sets CSS custom properties (a style object can't). */
const vars = <E extends HTMLElement>(el: E, v: Record<string, string>): E => {
  for (const [k, val] of Object.entries(v)) el.style.setProperty(k, val);
  return el;
};

/** A health bar that is updated in place, so it slides. */
class Meter {
  readonly el: HTMLElement;
  private fill = h('i');
  private label = h('span');
  /** The piece just lost to a ground mark: it stays a moment, so the size of the mistake is seen. */
  private lost = h('u', { class: 'lost' });
  private k = 1;
  private lostTimer = 0;
  constructor(cls = 'hp') {
    this.lost.hidden = true;
    this.el = h('div', { class: cls }, this.fill, this.lost, this.label);
  }
  /** Shows `part` (0..1 of the bar) as just lost, from where the bar stands now down. */
  ghost(part: number): void {
    const to = Math.max(0, this.k - part);
    this.lost.style.left = `${to * 100}%`;
    this.lost.style.width = `${(this.k - to) * 100}%`;
    this.lost.hidden = false;
    this.lost.classList.remove('go');
    void this.lost.offsetWidth;
    this.lost.classList.add('go');
    clearTimeout(this.lostTimer);
    this.lostTimer = window.setTimeout(() => (this.lost.hidden = true), 1300);
  }
  set(k: number, text: string, color?: string): void {
    this.k = Math.max(0, Math.min(1, k));
    const w = `${Math.max(0, Math.min(1, k)) * 100}%`;
    if (this.fill.style.width !== w) this.fill.style.width = w;
    if (color && this.fill.dataset.c !== color) {
      this.fill.dataset.c = color;
      this.fill.style.background = color;
    }
    if (this.label.textContent !== text) this.label.textContent = text;
    // low health is a mark and stripes as well as red (see a11y.css)
    this.el.classList.toggle('low', k > 0 && k <= 0.25);
    this.el.classList.toggle('mid', k > 0.25 && k <= 0.5);
  }
}

/** A portrait line: emoji, name, flags and a health bar (you, your target, each friend). */
class UnitView {
  readonly el: HTMLElement;
  private em = h('span', { class: 'em' });
  private nm = h('span', { class: 'txt' });
  private fl = h('span', { class: 'fl' });
  readonly meter = new Meter();
  constructor(cls: string) {
    this.el = h('div', { class: cls }, this.em, h('div', { class: 'col' }, h('div', { class: 'nm' }, this.nm, this.fl), this.meter.el));
  }
  private roleFor = '';
  set(emoji: string, name: string, f: [number, number, number, ...number[]] | null, color: string, numbers = true, mob?: { role?: (typeof MOB_ROLES)[number]; flags: number }): void {
    const k = f ? Math.max(0, f[0] / Math.max(1, f[1])) : 1;
    // a special pack monster shows its marker where the others have a face
    const role = mob?.role ?? '';
    if (role !== this.roleFor) {
      this.roleFor = role;
      this.em.textContent = '';
      if (mob?.role) this.em.append(roleMarker(mob.role));
    }
    if (!role && this.em.textContent !== emoji) this.em.textContent = emoji;
    if (this.nm.textContent !== name) this.nm.textContent = name;
    const icons = mob ? mobIcons(mob.flags) : f ? flagIcons(f[2]) : '';
    if (this.fl.textContent !== icons) this.fl.textContent = icons;
    this.el.style.setProperty('--c', color);
    this.el.classList.toggle('dead', !mob && !!f && !!(f[2] & FLAG.down));
    this.el.classList.toggle('frozen', !mob && !!f && !!(f[2] & FLAG.frozen));
    this.el.classList.toggle('open', !!mob && !!(mob.flags & MOB_FLAG.open));
    this.meter.set(k, f && numbers ? `${f[0]} / ${f[1]}` : f ? String(f[0]) : '', hpColor(k));
  }
}

/** Has this item a picture of its own (not empty, nor the magenta square of art still to be drawn)? */
const drawn = new Map<string, boolean>();
function hasIcon(id: string): boolean {
  let ok = drawn.get(id);
  if (ok === undefined) {
    const c = getArt().icons[id]?.canvas;
    const d = c?.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, c.width, c.height).data;
    let solid = 0;
    let magenta = 0;
    for (let i = 0; d && i < d.length; i += 4) {
      if (d[i + 3]! < 128) continue;
      solid++;
      if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) magenta++;
    }
    ok = solid > 12 && magenta < solid / 2;
    drawn.set(id, ok);
  }
  return ok;
}
/** An item's picture for the HTML windows (an emoji while it has none yet). */
export const itemIcon = (id: string, fallback?: string): HTMLElement => {
  const url = getArt().iconUrl[id];
  return url && hasIcon(id) ? h('img', { src: url, alt: '', draggable: 'false' }) : h('span', { class: 'em' }, fallback ?? KIND_EMOJI[sagaItem(id)?.kind ?? ''] ?? '🎁');
};
/** A level-up banner's golden line: what the new level gives, with its picture. */
function levelSub(c: BannerChange): HTMLElement {
  const n = Number(/\d+/.exec(c.text)?.[0] ?? heroLevel(myPlayer()?.saga));
  const r = LEVEL_REWARDS[n];
  const pic = r?.item ? itemIcon(r.item) : r?.title ? h('span', { class: 'em' }, '👑') : r?.aura ? h('span', { class: 'em' }, r.aura === 2 ? '🌈' : '✨') : null;
  return h('div', { class: 'sub reward' }, pic ? h('span', { class: 'pic' }, pic) : null, h('span', null, c.sub ?? ''));
}
const rewardText = (r: { stars: number; item?: string; count?: number; title?: string }): string =>
  [`+${r.stars} ⭐`, r.item ? `${itemName(r.item)}${(r.count ?? 1) > 1 ? ` × ${r.count}` : ''}` : '', r.title ? `👑 ${r.title}` : ''].filter(Boolean).join(' · ');

/** The experience bar: how far into this level, and the experience needed for the next. */
function xpMeter(xp: number): HTMLElement {
  const span = levelSpan(xp);
  const k = span.next === null ? 1 : (xp - span.from) / Math.max(1, span.next - span.from);
  return h('div', { class: 'saga-meter xp' }, h('i', { style: { width: `${Math.max(0, Math.min(1, k)) * 100}%` } }), h('span', null, span.next === null ? T.sagaXpMax : fmt(T.sagaXpOf, { xp, next: span.next })));
}
/** What a level gives, as small pieces: a picture and a name for each item, title and glow. */
function rewardParts(level: number): HTMLElement[] {
  const r = LEVEL_REWARDS[level];
  if (!r) return [];
  const parts: HTMLElement[] = [];
  if (r.item) {
    const d = sagaItem(r.item);
    const el = h('span', { class: `rw${d ? ` rar-${d.rarity}` : ''}` }, itemIcon(r.item), h('b', null, itemName(r.item)));
    if (d) vars(el, { '--r': RARITY_COLORS[d.rarity] });
    parts.push(el);
  }
  if (r.title) parts.push(h('span', { class: 'rw title' }, h('span', { class: 'em' }, '👑'), h('b', null, fmt(T.sagaRewardTitle, { title: r.title }))));
  if (r.aura) parts.push(h('span', { class: `rw aura a${r.aura}` }, h('span', { class: 'em' }, r.aura === 2 ? '🌈' : '✨'), h('b', null, r.aura === 2 ? T.sagaRewardAura2 : T.sagaRewardAura1)));
  return parts;
}

// ---------------------------------------------------------------------------
// Upptäcktsboken: the landmarks of the wild maps
// ---------------------------------------------------------------------------

/** "4:07" from milliseconds. */
const clock = (ms: number): string => {
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/** Where someone is, for the family list. */
function placeOf(area: string): string {
  return isSagaKey(area) ? `⚔️ ${areaName(area)}` : areaName(area);
}

// ---------------------------------------------------------------------------
// The villagers' saga quests (in their window: ui/menus.ts)
// ---------------------------------------------------------------------------

/** The first chapter of Act II, Lokes list (a heading over it in the journal). */
const ACT_TWO = 4;

const questsOf = (npcId: string): SagaQuest[] => SAGA_QUESTS.filter((q) => q.npc === npcId);

/** Does this villager have a saga quest for you to take, follow or hand in? */
export function hasSagaQuests(npcId: string): boolean {
  const me = myPlayer();
  return questsOf(npcId).some((q) => {
    const st = questState(me, q);
    return st === 'offer' || st === 'active' || st === 'ready';
  });
}

/** A villager's saga quests: new ones with their story, ones in progress, and ones to hand in. */
export function sagaQuestRows(npcId: string): HTMLElement {
  const me = myPlayer()!;
  const wrap = h('div', { class: 'saga-quests' }, h('div', { class: 'saga-head' }, T.sagaQuestsHead));
  for (const q of questsOf(npcId)) {
    const st = questState(me, q);
    if (st === 'locked' || st === 'done') continue;
    const card = h('div', { class: `saga-quest ${st}` }, h('div', { class: 'q-title' }, `${st === 'ready' ? '❓' : st === 'offer' ? '❗' : '📜'} ${q.title}`));
    if (st === 'offer' || st === 'ready') card.append(h('div', { class: 'q-say' }, (st === 'offer' ? q.tell : q.done).join(' ')));
    if (st !== 'ready') card.append(h('div', { class: 'q-goal' }, `🎯 ${q.goal}`));
    if (st === 'active') {
      const n = Math.min(q.count, questCount(me, q));
      card.append(h('div', { class: 'saga-meter' }, h('i', { style: { width: `${(n / q.count) * 100}%` } }), h('span', null, fmt(T.sagaQuestAt, { n, count: q.count }))));
    }
    card.append(h('div', { class: 'q-reward' }, fmt(T.sagaReward, { reward: rewardText(q.reward) })));
    if (st !== 'active') {
      const b = h('button', null, st === 'offer' ? T.sagaTakeQuest : T.sagaHandIn);
      onTap(b, () => net.send({ t: 'saga', a: 'quest', id: q.id }));
      card.append(h('div', { class: 'q-act' }, b));
    }
    wrap.append(card);
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// The HUD and the windows
// ---------------------------------------------------------------------------

interface Slot {
  el: HTMLElement;
  sweep: HTMLElement;
  num: HTMLElement;
  /** Spell id, 'potion' or 'aim' (the next monster, on touch screens). */
  id: string;
  wasCooling: boolean;
  last: string;
  /** The tag on the button (too far, can stop the boss, none left) and the words a screen reader says. */
  tag: HTMLElement;
  name: string;
  text: string;
  /** The spender's pip row. */
  pips?: HTMLElement;
}

export class SagaUi {
  /** Called when a saga window opens or closes (the game stops reading keys and taps meanwhile). */
  onChange: (open: boolean) => void = () => {};

  private modal: HTMLElement | null = null;
  private win: Win | null = null;
  /** Völvan's window: the line she is on, and which chapter and part those lines belong to. */
  private line = 0;
  private lineKey = '';
  private volvaTab: 'story' | 'journal' = 'story';
  /** Kämpastenen: the class looked at. */
  private pickCls: ClassId | null = null;
  private loots: LootChange[] = [];
  /** Garderoben opened from a gear stand in the house: the stand's object id (else null). */
  private standObj: number | null = null;
  /** A line over the wardrobe (Smed-Stina's). */
  private looksNote: string | null = null;

  private bar = h('div', { class: 'saga-bar' });
  private slots: Slot[] = [];
  private explainBtn: HTMLElement | null = null;
  /** The big "Slå" button's pip row and star (it spends the pips too), and the red ring of a mark hit. */
  private actPips: HTMLElement | null = null;
  private actStar: HTMLElement | null = null;
  private markFlash = h('div', { class: 'saga-markflash', 'aria-hidden': 'true' });
  /** Märke: the skull button beside the target's frame (it marks the monster you aim at for the whole party). */
  private skullBtn = h('button', { class: 'saga-skull', type: 'button', 'aria-pressed': 'false', 'aria-label': T.sagaSkull }, skullMark(), h('span', { class: 'lb' }, FIGHT_UI.skullBtn), h('span', { class: 'key k' }, FIGHT_UI.skullKey));
  /** The pips the row showed last (a new one pops and sounds), the glow's last reason and the last "stop it now" cue. */
  private pipsShown = 0;
  private spendSaid = '';
  private nowCue = 0;
  private castSaid = '';
  private barFor = '';
  private units = h('div', { class: 'saga-units' });
  private meFrame = new UnitView('saga-unit me');
  private targetFrame = new UnitView('saga-unit target');
  private party = h('div', { class: 'saga-party' });
  private partyRows = new Map<string, UnitView>();
  /** The pets of the party (pets.ts): a small frame each with a state icon, after the party's rows. */
  private petRows = new Map<number, HTMLElement>();
  private boss = h('div', { class: 'saga-boss' });
  private bossFor = -1;
  private bossMeter = new Meter();
  private bossPhase = h('span', { class: 'pips' });
  private castBar = h('div', { class: 'saga-cast' });
  private castFill = h('i');
  private castName = h('span', { class: 'nm' });
  /** Who was down at the last snapshot (the log writes a line when someone falls or gets up). */
  private downIds = new Set<string>();
  private downSeen = false;
  private down = h('div', { class: 'saga-down' });
  private downSince = 0;
  private wasDown = false;
  private wasFrozen = false;
  private tracker = h('div', { class: 'saga-tracker' });
  private trackerOpen = true;
  /** The dungeon the aiming hint was shown for (it shows once when you come in). */
  private hintFor = '';

  constructor(
    private ui: HTMLElement,
    hudRoot: HTMLElement,
    private menus: Menus,
    social: HTMLElement,
  ) {
    this.units.append(this.meFrame.el, this.targetFrame.el, this.skullBtn);
    cards.info(this.skullBtn, '💀', T.sagaSkull, T.sagaSkullText);
    cards.tap(this.skullBtn, () => toggleMark());
    document.addEventListener('vt:mark', () => toggleMark());
    this.castBar.append(this.castFill, this.castName);
    this.markFlash.hidden = true;
    hudRoot.append(this.party, this.units, this.bar, this.tracker, this.down, this.markFlash);
    // the spender's card (and the big button's) shows how a fight goes, in pictures
    cards.picture = (key) => (key in CLASSES ? fightStrip(key as ClassId) : null);
    // the boss bar and the cast bar hang in the column under the message lane (ui/lane.ts)
    centerColumn(hudRoot).prepend(this.boss, this.castBar);
    // the tracker hangs under the HUD's round buttons, wherever they wrap to (on a short screen they take two rows)
    const place = (): void => {
      const hr = document.querySelector<HTMLElement>('.hud-right');
      const root = this.tracker.offsetParent as HTMLElement | null;
      if (!hr || !root) return;
      this.tracker.style.top = `${Math.max(0, hr.getBoundingClientRect().bottom - root.getBoundingClientRect().top + 8)}px`;
    };
    window.addEventListener('resize', place);
    window.setInterval(place, 700);
    onTap(this.tracker, () => {
      this.trackerOpen = !this.trackerOpen;
      this.renderTracker();
    });
    // the gamepad's face buttons (ui/gamepad.ts): a spell, or its card while the explain mode is on
    document.addEventListener('vt:spell', (e) => this.padPress((e as CustomEvent<number>).detail));
    document.addEventListener('vt:explain', () => this.setExplain(!cards.mode));
    document.addEventListener('vt:device', () => this.refreshLabels());
    // the family list sits with the chat button
    const fam = h('div', { class: 'round small', title: T.familyBtn }, '👪');
    onTap(fam, () => this.open('family'));
    (social.querySelector('.social-more') ?? social).append(fam); // (behind the "more" button on a short screen)

    // the gear window: the HUD's ⚔️ button and the gamepad's Select ask for it
    document.addEventListener('vt:gear', () => {
      this.openLooks();
    });
    // the journal's level page: the HUD's level chip asks for it
    document.addEventListener('vt:journal', () => this.open('journal'));
    // Smed-Stina's window (ui/menus.ts) opens the wardrobe on the sets tab with a line about collecting them
    document.addEventListener('vt:sets', () => this.openLooks(null, { tab: 'set', note: LOOK_T.stinaLine }));
    document.addEventListener('vt:looks-arch', () => this.openLooks());
    document.addEventListener('vt:pet-gear', () => this.openLooks(null, { tab: 'pet' })); // (the kennel's and the pet button's way in)
    bus.on('open', (c) => {
      if (c.ui === 'sagaClass') this.open('class');
      else if (c.ui === 'saga') this.open('volva');
      else if (c.ui === 'looks') this.openLooks(c.id ?? null);
    });
    bus.on('change', (c) => this.fromServer(c));
    bus.on('me', () => {
      this.sync();
      this.renderTracker();
      if (this.modal && this.win !== 'loot') this.render();
      this.renderUnits();
    });
    bus.on('area', () => this.sync());
    bus.on('welcome', () => {
      this.sync();
      this.renderTracker();
    });
    bus.on('state', () => this.onState());
    bus.on('target', () => {
      this.renderUnits();
      if (liveTarget() !== null) SAGA_SFX.target();
    });
    bus.on('connection', (s) => {
      if (s !== 'open') this.close();
    });
    const frame = (): void => {
      requestAnimationFrame(frame);
      this.frame();
    };
    requestAnimationFrame(frame);
    this.sync();
  }

  isOpen(): boolean {
    return this.modal !== null;
  }

  /**
   * Keys: 1–4 spells and 5 a potion in a fight (a dungeon, or hero mode out in the world), Tab the next monster,
   * J the saga's journal, G the gear window. True if used.
   */
  key(e: KeyboardEvent): boolean {
    if (this.modal) {
      if (e.key === 'Escape' || (this.win === 'gear' && (e.key === 'g' || e.key === 'G')) || (this.win !== null && BOOK.includes(this.win) && (e.key === 'j' || e.key === 'J'))) this.close();
      return true;
    }
    // no hotbar in a fight: the number keys are spells, even with the backpack open
    if (fightMode() && /^[1-8]$/.test(e.key)) {
      if (this.menus.isOpen()) return true;
      // (the spell bar decides: it goes off, or while the explain mode is on its card comes up)
      if (e.key <= '5') document.dispatchEvent(new CustomEvent('vt:spell', { detail: Number(e.key) - 1 }));
      return true;
    }
    // ? is the explain mode (the ❔ button); then 1-5 read a spell instead of casting it
    if (fightMode() && e.key === '?' && !this.menus.isOpen()) {
      document.dispatchEvent(new Event('vt:explain'));
      return true;
    }
    if (this.menus.isOpen()) return false;
    if (e.key === 'j' || e.key === 'J') {
      this.open('journal');
      return true;
    }
    if (e.key === 'g' || e.key === 'G') {
      this.openLooks();
      return true;
    }
    if (!fightMode()) return false;
    if ((e.key === 'z' || e.key === 'Z') && inSaga()) {
      toggleMark();
      return true;
    }
    if (e.key === 'Tab' && !e.shiftKey && !(document.activeElement && document.activeElement !== document.body && document.activeElement.closest('#ui'))) {
      // Tab is the next monster; once the focus is on a HUD button (Shift+Tab gets there) it moves the focus as usual
      e.preventDefault();
      cycleTarget();
    } else if (e.key === 'Escape' && document.activeElement && document.activeElement !== document.body && document.activeElement.closest('#ui')) (document.activeElement as HTMLElement).blur();
    else if (e.key === 'Escape' && getTarget() !== null) setTarget(null);
    else if (e.key !== 'Tab') return false;
    return true;
  }

  // ---- reacting to the server ----

  private fromServer(c: Change): void {
    if (c.t === 'hit') {
      if (c.mark && c.on === client.me && (c.kind === 'dmg' || c.kind === 'block')) this.markHit(c.n);
      return;
    }
    if (c.t === 'loot') {
      if (c.looks) rememberLooks(c.looks);
      this.logLoot(c);
      this.loots.push(c);
      if (this.win !== 'loot') this.nextLoot();
    } else if (c.t === 'banner') this.banner(c);
    else if (c.t === 'yell') this.yell(c.name, c.text);
  }

  /** What a loot window hands out, as a line in the log (the window itself is a window, not a message). */
  private logLoot(c: Extract<Change, { t: 'loot' }>): void {
    const parts = c.items.map((it) => `${itemName(it.item)}${it.count > 1 ? ` × ${it.count}` : ''}`);
    if (c.stars > 0) parts.push(fmt(LOG_T.lootStars, { n: c.stars }));
    if (c.looks?.drops.length) parts.push(...c.looks.drops.map((d) => lookPiece(d.piece)?.name ?? LOG_T.lootLook));
    if (!parts.length) return;
    say(fmt(LOG_T.loot, { items: parts.join(', ') }), { kind: 'loot', show: false, announce: false });
  }

  /** In a fight or not: the spell bar instead of the hotbar, and the class's own buttons. */
  private sync(): void {
    const here = inSaga();
    const fight = fightMode();
    document.body.classList.toggle('in-saga', here);
    document.body.classList.toggle('saga-fight', fight);
    const cls = myClass();
    const want = fight && cls ? cls.id : '';
    if (want !== this.barFor) this.buildBar();
    this.renderUnits();
    if (!here) {
      this.party.hidden = true;
      this.boss.hidden = true;
      this.castBar.hidden = true;
      this.down.hidden = true;
      this.wasDown = false;
      // out in the world: the aiming hint once when hero mode goes on
      if (!fight) {
        this.hintFor = '';
      } else if (this.hintFor !== 'hero') {
        this.hintFor = 'hero';
        this.showHint();
      }
      // out of a boss fight too (the tracker shows again)
      if (document.body.classList.contains('saga-bossfight')) {
        document.body.classList.remove('saga-bossfight');
        this.renderTracker();
      }
    } else if (this.hintFor !== myPlayer()?.area) {
      // a hint about aiming when you come in, fading after a while
      this.hintFor = myPlayer()?.area ?? '';
      this.showHint();
    }
  }

  private showHint(): void {
    say(document.body.classList.contains('touch') ? T.sagaTargetHintTouch : T.sagaTargetHint, { kind: 'system', icon: '🎯', cls: 'hint', log: false, announce: false, ms: 9000 });
  }

  // ---- the spell bar ----

  private buildBar(): void {
    for (const s of this.slots) s.el.remove();
    this.slots = [];
    this.explainBtn?.remove();
    this.explainBtn = null;
    this.actPips?.remove();
    this.actStar?.remove();
    this.actPips = this.actStar = null;
    this.pipsShown = 0;
    this.spendSaid = '';
    const actBtn = document.querySelector<HTMLElement>('.act-btn');
    actBtn?.classList.remove('spend-empty', 'spend-glow');
    delete actBtn?.dataset.infoPic;
    const cls = myClass();
    this.barFor = fightMode() && cls ? cls.id : '';
    this.bar.hidden = !this.barFor;
    if (!cls || !this.barFor) return;
    // the pad's buttons for each place on the bar (keys 1-5 on a keyboard)
    const pad = ['X', 'Y', 'B', 'RB', 'LB'];
    const add = (id: string, icon: HTMLElement, key: string, padKey: string, label: string, name: string, text: string, act: () => void, extra = ''): void => {
      const sweep = h('i', { class: 'sweep' });
      const num = h('b', { class: 'cd' });
      const tag = h('span', { class: 'tag' });
      const el = h('button', { class: `saga-spell${extra}`, type: 'button', 'aria-label': name }, h('span', { class: 'ic' }, icon), h('span', { class: 'lb' }, label), sweep, num, h('span', { class: 'key k' }, key), h('span', { class: 'key p' }, padKey), tag);
      cards.info(el, '', name, text);
      el.dataset.infoIcon = icon.textContent && !icon.querySelector('img') ? icon.textContent : '';
      cards.press(el, act);
      el.dataset.slot = String(this.slots.length);
      this.bar.append(el);
      this.slots.push({ el, sweep, num, id, wasCooling: false, last: '', tag, name, text });
    };
    cls.spells.forEach((id, i) => {
      const sp = SPELLS[id]!;
      // slot 1 is the spender (its card tells the combo too); the reactions say that they never wait
      const spender = i === 0;
      const text = spender ? `${sp.text} ${COMBO_TEXT[cls.id]}` : isReaction(id) ? `${sp.text} ${FIGHT_UI.reactionText}` : sp.text;
      add(id, h('span', null, sp.icon), String(i + 1), pad[i]!, SPELL_LABEL[id] ?? sp.name, sp.name, `${text} ${this.numbers(sp)}`, () => castSlot(i), `${spender ? ' spender' : ''}${isReaction(id) ? ' react' : ''}`);
      const s = this.slots[this.slots.length - 1]!;
      if (spender) {
        s.pips = pipRow(cls.id, 'on-btn');
        s.el.append(s.pips, starBadge('now'));
        s.el.dataset.infoPic = cls.id;
      }
      if (isReaction(id)) s.el.append(h('i', { class: 'free-mark', 'aria-hidden': 'true' }));
      if (isInterrupt(id)) s.el.append(boltBadge('now'));
    });
    // the big "Slå" button spends the pips too: the same row and the same star on it
    if (actBtn) {
      this.actPips = pipRow(cls.id, 'on-act');
      this.actStar = starBadge('now');
      actBtn.append(this.actPips, this.actStar);
      actBtn.dataset.infoPic = cls.id;
    }
    add('potion', itemIcon('healing_potion', '🧪'), '5', pad[4]!, A11Y_T.potion, T.sagaPotionKey, sagaItem('healing_potion')?.text ?? '', drinkPotion, ' potion');
    // touch screens have no Tab key: a button for the next monster
    add('aim', h('span', null, '🎯'), 'Tab', '◀ ▶', A11Y_T.aim, T.sagaAimName, T.sagaAimText, cycleTarget, ' aim');
    // "Förklara": while it is on a tap tells what a button does instead of doing it
    const ex = h('button', { class: 'saga-spell explain', type: 'button', 'aria-label': A11Y_T.explain, 'aria-pressed': String(cards.mode) }, h('span', { class: 'ic' }, h('span', null, '❔')), h('span', { class: 'lb' }, A11Y_T.explain), h('span', { class: 'key p' }, 'R3'));
    cards.info(ex, '❔', A11Y_T.explain, A11Y_T.explainBar);
    onTap(ex, () => {
      if (cards.suppressed()) return;
      this.setExplain(!cards.mode);
    });
    this.explainBtn = ex;
    this.bar.append(ex);
    this.refreshLabels();
  }

  /** The explain mode on or off, with its card (and the pad and the button agreeing). */
  private setExplain(on: boolean): void {
    cards.setMode(on, on ? 10000 : 0);
    if (on) cards.note('❔', A11Y_T.explain, A11Y_T.explainBar);
    else cards.hide();
    this.explainBtn?.setAttribute('aria-pressed', String(on));
    this.explainBtn?.classList.toggle('on', on);
  }

  /** Cooldown and reach as numbers for a card. */
  private numbers(sp: { cd: number; range: number }): string {
    return `${fmt(A11Y_T.cooldownIs, { n: Math.round(sp.cd / 100) / 10 })} ${sp.range > 0 ? fmt(A11Y_T.rangeIs, { n: sp.range }) : A11Y_T.rangeSelf}`;
  }

  /** The words a screen reader says about a button: its name, how to press it and what state it is in. */
  private refreshLabels(): void {
    const dev = currentDevice();
    for (const s of this.slots) {
      const i = Number(s.el.dataset.slot);
      const how = dev === 'pad' ? fmt(A11Y_T.padIs, { key: ['X', 'Y', 'B', 'RB', 'LB', ''][Math.min(i, 5)]! }) : dev === 'key' || dev === 'mouse' ? (s.id === 'aim' ? 'Tab.' : fmt(A11Y_T.keyIs, { key: String(Math.min(i + 1, 5)) })) : '';
      const c = s.el.classList;
      const st = c.contains('cooling') ? fmt(A11Y_T.cooling, { n: s.num.textContent || '' }) : c.contains('far') ? A11Y_T.far : c.contains('off') ? A11Y_T.none : c.contains('empty') ? FIGHT_UI.spendEmpty : c.contains('kick') ? FIGHT_UI.kickNow : s.id === 'aim' ? '' : A11Y_T.ready;
      // the spender says its pips, and why it glows
      const cls = myClass();
      const pips = s.pips && cls ? fmt(FIGHT_UI.pipsAre, { n: pipsOf(client.me), pips: PIP_NAMES[cls.id] }) : '';
      const why = s.pips && c.contains('glow') ? this.spendSaid : '';
      s.el.setAttribute('aria-label', [s.name, pips, why || st, isReaction(s.id) ? FIGHT_UI.reaction : '', how].filter(Boolean).join('. '));
    }
  }

  /** The gamepad's face buttons: a spell goes off, or while the explain mode is on its card comes up. i is 0-3 spells, 4 the potion. */
  private padPress(i: number): void {
    const s = this.slots[i];
    if (!s) return;
    if (cards.mode) cards.show(s.el);
    else if (i < 4) castSlot(i);
    else drinkPotion();
  }

  /** Is the spell's target out of reach (or none in reach at all)? */
  private outOfReach(spell: string): boolean {
    const sp = SPELLS[spell];
    const me = myPlayer();
    const t = liveTarget();
    if (!sp || !me || t === null) return false;
    const aimed = (AT_MONSTER.has(sp.kind) && typeof t === 'number') || (AT_FRIEND.has(sp.kind) && typeof t === 'string');
    if (!aimed) return false;
    const at = posOf(t);
    return !!at && Math.hypot(at.x - me.x, at.y - me.y) / TILE > sp.range + 0.6;
  }

  /** Every frame in a fight: cooldown sweeps, the boss's attack filling up, being fallen or frozen. */
  private frame(): void {
    if (!fightMode()) return;
    sagaTick();
    const fl = flagsOf(client.me);
    const off = !!(fl & (FLAG.down | FLAG.frozen));
    const now = performance.now();
    const view = this.syncSpend(off);
    const ctx = spendCtx();
    const shared = inSharedPause();
    const fighting = !!Object.keys(sagaSnap()?.m ?? {}).length;
    const primer = ctx ? PRIMER[ctx.cls] : '';
    let stopping = false;
    for (const s of this.slots) {
      if (s.id === 'aim') continue;
      const cd = s.id === 'potion' ? potionCooldown() : cooldown(s.id);
      const cooling = cd.left > 0;
      const k = cooling ? 1 - cd.left / cd.total : 1;
      const num = cd.left > 1000 ? String(Math.ceil(cd.left / 1000)) : '';
      const sp = SPELLS[s.id];
      const pots = s.id === 'potion' ? potionCount() : 1;
      const press = now - (pressedAt[s.id] ?? 0) < 140;
      const far = !!sp && this.outOfReach(s.id);
      // something that can be stopped is being cast within this spell's reach: now!
      const stop = !!sp && !cooling && !off && isInterrupt(s.id) && stopTarget(s.id) !== null;
      stopping ||= stop;
      // the spender: grey without a pip, glowing when it is the right press; the primer of its combo is pointed at softly
      const empty = !!s.pips && view?.state === 'empty';
      const glow = !!s.pips && view?.state === 'glow' && !off;
      const prime = s.id === primer && !!ctx && !off && primerHint(ctx, !cooling, fighting);
      // a reaction that is ready while the others wait for the shared pause
      const free = !!sp && isReaction(s.id) && shared && !cooling && !off;
      const state = `${+cooling}${+off}${+press}${+far}${+stop}${pots}${+empty}${+glow}${+prime}${+free}${+cd.shared}`;
      if (cooling) s.sweep.style.setProperty('--p', `${(k * 100).toFixed(1)}%`);
      if (num !== s.num.textContent) {
        s.num.textContent = num;
        if (cooling && cd.left % 5000 < 300) this.refreshLabels();
      }
      if (state !== s.last) {
        s.last = state;
        const none = pots <= 0;
        s.el.classList.toggle('cooling', cooling);
        s.el.classList.toggle('off', off || none);
        s.el.classList.toggle('press', press);
        s.el.classList.toggle('far', far);
        s.el.classList.toggle('kick', stop);
        s.el.classList.toggle('empty', empty && !off);
        s.el.classList.toggle('glow', glow);
        s.el.classList.toggle('prime', prime && !glow);
        s.el.classList.toggle('free', free);
        s.el.classList.toggle('shared', cooling && cd.shared);
        // a word on the button too, so no state is only a colour: too far away, can stop the cast, none left, fallen
        const tag = none ? `✖ ${A11Y_T.none}` : off ? `✖ ${flagsOf(client.me) & FLAG.frozen ? A11Y_T.frozen : A11Y_T.down}` : stop ? A11Y_T.kick : far ? `↔ ${A11Y_T.far}` : '';
        if (s.tag.textContent !== tag) s.tag.textContent = tag;
        s.el.classList.toggle('tagged', !!tag);
        if (s.id === 'potion') s.el.dataset.n = String(pots);
        this.refreshLabels();
      }
      if (s.wasCooling && !cooling) {
        // ready again: a quick shine
        s.el.classList.remove('ready');
        void s.el.offsetWidth;
        s.el.classList.add('ready');
      }
      s.wasCooling = cooling;
    }
    // a short cue the moment an interrupt can stop something (once for each cast)
    if (stopping && now - this.nowCue > 1500) SAGA_SFX.now();
    if (stopping) this.nowCue = now;
    this.frameCast();
    this.frameDown(fl);
  }

  /**
   * The pips and the glow, on the spender's button and on the big "Slå" button: a new pip pops with its note, the first full
   * row on this device gets one line of help, and the glow's reason is kept for the screen reader.
   */
  private syncSpend(off: boolean): SpendView | null {
    const cls = myClass();
    const view = inSaga() ? mySpend() : null;
    const pips = view ? pipsOf(client.me) : 0;
    const spender = this.slots[0];
    if (cls && pips !== this.pipsShown) {
      newPips(pips, this.pipsShown).forEach((i, k) => window.setTimeout(() => SAGA_SFX.pip(i), k * 90));
      this.pipsShown = pips;
      if (spender?.pips) setPips(spender.pips, pips, false, pipHalf(client.me));
      if (this.actPips) setPips(this.actPips, pips, false, pipHalf(client.me));
    }
    // (half a pip: the first of the two auto-attacks a pip takes has landed)
    if (cls && view) {
      if (spender?.pips) setPips(spender.pips, pips, false, pipHalf(client.me));
      if (this.actPips) setPips(this.actPips, pips, false, pipHalf(client.me));
    }
    const said = view?.state === 'glow' ? (view.why === 'full' ? fmt(FIGHT_UI.glowFull, { n: SPEND_MUL[PIP_MAX]! }) : view.why === 'open' ? FIGHT_UI.glowOpen : FIGHT_UI.glowCombo) : '';
    if (said !== this.spendSaid) {
      this.spendSaid = said;
      if (said) announce(said);
      this.refreshLabels();
    }
    const act = this.actPips?.parentElement;
    if (act) {
      act.classList.toggle('spend-empty', view?.state === 'empty' && !off);
      act.classList.toggle('spend-glow', view?.state === 'glow' && !off);
    }
    return view;
  }

  /** A ground mark hit you: the piece of health it took lingers on your bar, and a red ring flashes at the screen's edge (not when calm). */
  private markHit(n: number): void {
    const f = sagaSnap()?.f[client.me];
    if (f) this.meFrame.meter.ghost(n / Math.max(1, f[1]));
    if (calm()) return;
    this.markFlash.hidden = false;
    this.markFlash.classList.remove('go');
    void this.markFlash.offsetWidth;
    this.markFlash.classList.add('go');
    window.setTimeout(() => (this.markFlash.hidden = true), 600);
  }

  // ---- your health and your target's ----

  private renderUnits(): void {
    const snap = sagaSnap();
    const me = myPlayer();
    const cls = myClass();
    if (!snap) {
      this.skullBtn.hidden = true;
      // out in the world: your hearts, and the monster you aim at with its hearts
      this.units.hidden = !fightMode() || inSaga();
      if (this.units.hidden || !me) return;
      this.meFrame.set(cls?.emoji ?? '🙂', me.name, [Math.max(0, me.hearts), MAX_HEARTS, 0], cls?.color ?? '#ffe98a');
      const t = liveTarget();
      const a = typeof t === 'number' ? activeWorld()?.animals[t] : undefined;
      this.targetFrame.el.hidden = !a;
      if (!a) return;
      const max = combatDef(a)?.hp;
      this.targetFrame.set(combatDef(a)?.boss ? '💀' : '👹', a.name, max ? [Math.max(0, a.hp ?? max), max, 0] : null, '#ff8a70');
      return;
    }
    this.units.hidden = false;
    this.meFrame.set(cls?.emoji ?? '🙂', me?.name ?? T.sagaYou, snap.f[client.me] ?? null, cls?.color ?? '#ffe98a');
    // the skull button: there while there is a monster to mark; pressed while the one you aim at carries the mark
    const aim = typeof liveTarget() === 'number' ? (liveTarget() as number) : spendTarget();
    const marked = markedMob();
    this.skullBtn.hidden = aim === null && marked === null;
    const on = marked !== null && (aim === marked || aim === null);
    if (this.skullBtn.getAttribute('aria-pressed') !== String(on)) this.skullBtn.setAttribute('aria-pressed', String(on));
    const t = liveTarget();
    // the boss has its own bar at the top
    this.targetFrame.el.hidden = t === null || t === snap.b?.id;
    if (t === null || t === snap.b?.id) return;
    if (typeof t === 'string') {
      const p = client.world?.players[t];
      const c = classOf(p);
      this.targetFrame.set(c?.emoji ?? '🙂', p?.name ?? '', snap.f[t] ?? null, c?.color ?? '#9fe08a');
    } else {
      const a = activeWorld()?.animals[t];
      const m = snap.m[t];
      // a monster still waiting has its full health (the server only sends those that are fighting or hurt)
      // a special pack monster: its role beside its name and its marker for a face; and what state it is in
      this.targetFrame.set(a?.species === 'spindelnat' ? '🕸️' : a && BLOCK_SPECIES.has(a.species) ? '🧊' : a && SAGA_BOSSES[a.species] ? '💀' : '👹', a?.name ?? '', m ? [m[0], m[1], 0] : null, '#ff8a70', !!m, { role: a?.role, flags: m?.[2] ?? 0 });
    }
  }

  // ---- the party ----

  private renderParty(): void {
    const snap = sagaSnap();
    const ids = snap ? Object.keys(snap.f) : [];
    this.party.hidden = ids.length === 0;
    const name = (id: string): string => client.world?.players[id]?.name ?? '';
    ids.sort((a, b) => (a === client.me ? -1 : b === client.me ? 1 : name(a).localeCompare(name(b))));
    for (const [id, row] of this.partyRows)
      if (!ids.includes(id)) {
        row.el.remove();
        this.partyRows.delete(id);
      }
    const t = liveTarget();
    for (const id of ids) {
      const isDown = !!(snap!.f[id]![2] & FLAG.down);
      if (isDown !== this.downIds.has(id) && this.downSeen) {
        say(fmt(isDown ? LOG_T.heroDown : LOG_T.heroUp, { name: name(id) }), { kind: 'hero', icon: isDown ? '💀' : '💪', who: name(id), show: false, announce: false });
      }
      if (isDown) this.downIds.add(id);
      else this.downIds.delete(id);
    }
    if (!ids.length) this.downIds.clear();
    this.downSeen = ids.length > 0;
    ids.forEach((id, i) => {
      let row = this.partyRows.get(id);
      if (!row) {
        row = new UnitView('saga-member');
        // a friend to heal: tap their frame
        onTap(row.el, () => setTarget(liveTarget() === id ? null : id));
        this.partyRows.set(id, row);
      }
      if (this.party.children[i] !== row.el) this.party.insertBefore(row.el, this.party.children[i] ?? null);
      const c = classOf(client.world?.players[id]);
      row.set(pathOf(id) ? `${c?.emoji ?? ''}${pathIcon(pathOf(id))}` : (c?.emoji ?? '🙂'), name(id), snap!.f[id]!, c?.color ?? '#cccccc', false);
      row.el.classList.toggle('sel', t === id);
    });
    this.renderPets(ids);
  }

  /** A pet in the party area: its picture, its name and what it is doing (helping, scared, hidden). Tap or long press: what it does. */
  private renderPets(ids: string[]): void {
    const w = activeWorld();
    const pets = Object.values(w?.animals ?? {}).filter((a) => !!a.petKind && !!a.owner && ids.includes(a.owner) && !!PETS[a.petKind]);
    for (const [id, el] of this.petRows)
      if (!pets.some((a) => a.id === id)) {
        el.remove();
        this.petRows.delete(id);
      }
    for (const a of pets) {
      const def = PETS[a.petKind!]!;
      const st = a.pf?.st ?? 'help';
      const icon = st === 'scared' ? '😨' : st === 'hidden' ? '🌿' : '🐾';
      const state = st === 'scared' ? PET_T.stateScared : st === 'hidden' ? PET_T.stateHidden : PET_T.stateHelp;
      let el = this.petRows.get(a.id);
      if (!el) {
        el = h('div', { class: 'saga-pet', role: 'group' }, h('span', { class: 'em' }), h('span', { class: 'nm' }), h('span', { class: 'st' }));
        this.petRows.set(a.id, el);
      }
      if (el.parentElement !== this.party || el !== this.party.lastElementChild) this.party.append(el);
      const [em, nm, stEl] = [el.children[0]!, el.children[1]!, el.children[2]!];
      if (em.textContent !== def.emoji) em.textContent = def.emoji;
      if (nm.textContent !== a.name) nm.textContent = a.name;
      if (stEl.textContent !== icon) stEl.textContent = icon;
      el.className = `saga-pet ${st}`;
      el.dataset.infoIcon = def.emoji;
      el.dataset.infoName = `${a.name} · ${PET_T[`role${def.role[0]!.toUpperCase()}${def.role.slice(1)}` as 'roleAttack']}`;
      el.dataset.infoText = `${state}. ${def.trickText}`;
      el.setAttribute('aria-label', `${a.name}: ${state}`);
    }
  }

  // ---- the boss ----

  private renderBoss(): void {
    const snap = sagaSnap();
    const b = snap?.b;
    const a = b ? activeWorld()?.animals[b.id] : undefined;
    const def = a ? SAGA_BOSSES[a.species] : undefined;
    this.boss.hidden = !def;
    document.body.classList.toggle('saga-bossfight', !!def);
    if (!b || !def) {
      this.castBar.hidden = true;
      this.bossFor = -1;
      return;
    }
    if (this.bossFor !== b.id) {
      // a new boss: its name, title, and marks on the bar where its phases begin
      this.bossFor = b.id;
      clear(this.boss);
      this.bossMeter = new Meter();
      for (const p of def.phases) this.bossMeter.el.append(h('b', { class: 'mark', style: { left: `${p * 100}%` } }));
      this.boss.append(h('div', { class: 'top' }, h('span', { class: 'crown' }, def.mini ? '💀' : '👑'), h('b', null, def.name), h('span', { class: 'title' }, def.title), this.bossPhase), this.bossMeter.el);
    }
    const m = snap!.m[b.id];
    this.bossMeter.set(m ? m[0] / Math.max(1, m[1]) : 1, m ? `${m[0]} / ${m[1]}` : '');
    clear(this.bossPhase);
    if (def.phases.length) this.bossPhase.append(fmt(T.sagaPhase, { n: b.phase + 1 }), ...[0, ...def.phases].map((_, i) => h('i', { class: i <= b.phase ? 'on' : '' })));
    const cast = b.cast;
    this.castBar.hidden = !cast;
    // a screen reader hears what is coming (once for each wind-up)
    const castKey = cast ? `${cast.name}:${cast.at}` : '';
    if (castKey !== this.castSaid) {
      this.castSaid = castKey;
      if (cast) announce(fmt(cast.kick ? A11Y_T.annKick : A11Y_T.annBoss, { boss: def.name, move: cast.name }), true);
    }
    if (cast) {
      // Guldringen is the one cast to run INTO: gold, a star, and "Spring IN!"
      const ring = snap!.c?.[b.id]?.[0] === 'ring';
      this.castBar.classList.toggle('kick', cast.kick);
      this.castBar.classList.toggle('ring', ring);
      const label = ring ? `⭐ ${cast.name} · ${FIGHT_UI.ringBar}` : `${cast.kick ? '🛡️ ' : '⚠️ '}${cast.name}${cast.kick ? ` · ${T.sagaCanKick}` : ''}`;
      if (this.castName.textContent !== label) this.castName.textContent = label;
    }
  }

  private frameCast(): void {
    const cast = sagaSnap()?.b?.cast;
    if (!cast || this.castBar.hidden) return;
    const k = 1 - Math.max(0, cast.at - serverNow()) / Math.max(1, cast.warn);
    this.castFill.style.width = `${Math.min(100, k * 100).toFixed(1)}%`;
  }

  private onState(): void {
    if (!fightMode()) return;
    this.renderUnits();
    if (!inSaga()) return;
    this.renderParty();
    this.renderBoss();
    this.tracker.hidden = this.trackerHidden();
  }

  // ---- shouts, banners, fallen and frozen ----

  private yell(name: string, text: string): void {
    const el = h('div', { class: 'lane-item yell' }, h('span', { class: 'ic', 'aria-hidden': 'true' }, '📣'), h('span', { class: 'tx' }, h('b', null, `${name}: `), text));
    say(text, { kind: 'yell', who: name, el, onShow: () => SAGA_SFX.yell() });
    // (the shout is also sent as a chat line, so the chat can show it again: the log skips that copy)
    bus.emit('chat', { t: 'chat', from: '', name: `⚔️ ${name}`, text, at: Date.now() });
  }

  /** A title banner: a card in the message lane, and a line in the log (a plain prompt like "Välj väg!" is only shown). */
  private banner(c: BannerChange): void {
    const kind = c.kind ?? 'enter';
    const el = h('div', { class: `lane-item saga-banner ${kind}` }, h('div', { class: 'big' }, c.text), c.sub ? (kind === 'level' ? levelSub(c) : h('div', { class: 'sub' }, c.sub)) : null);
    const prompt = [RUN_T.pickTitle, RUN_T.routeTitle, RUN_T.pathTitle, RUN_T.zoneClear].includes(c.text);
    const logKind: LogKind = kind === 'level' ? 'level' : kind === 'enter' || kind === 'chapter' || kind === 'boss' ? 'story' : 'run';
    const icon = { enter: '🏰', chapter: '📜', boss: '👑', cleared: '🏆', reward: '🎁', rest: '💚', wipe: '💀', level: '⭐' }[kind];
    say(c.text, {
      kind: logKind,
      icon,
      ...(c.sub ? { sub: c.sub } : {}),
      log: !prompt,
      el,
      // the two big cards (a boss down, the run won) leave sooner: they come when nothing is being fought, and a card is not left on the screen
      ...(kind === 'boss' || kind === 'cleared' ? { ms: Math.min(readMs(c.text, c.sub), 5000) } : {}),
      onShow: () => this.bannerFx(c, kind),
    });
  }

  private bannerFx(c: BannerChange, kind: string): void {
    if (kind === 'boss' || kind === 'cleared') {
      this.confetti(kind === 'cleared' ? 90 : 55, true);
      SAGA_SFX.fanfare(true);
    } else if (kind === 'reward') {
      this.confetti(45, false);
      SAGA_SFX.fanfare(false);
    } else if (kind === 'level') {
      this.confetti(50, false);
      SAGA_SFX.fanfare(false);
    } else if (kind === 'wipe') SAGA_SFX.sombre();
    else if (kind === 'rest' && c.text === T.sagaPuzzleOpen) {
      // the rune plates all lit: a chime and a shower of golden sparkles
      SAGA_SFX.chime();
      this.sparkles(30);
    } else if (kind === 'rest') SAGA_SFX.calm();
    else SAGA_SFX.banner();
  }

  /** Golden sparkles drifting down (a puzzle solved). */
  private sparkles(n: number): void {
    const layer = h('div', { class: 'saga-confetti sparkle' });
    for (let i = 0; i < n; i++)
      layer.append(h('i', { style: { left: `${10 + Math.random() * 80}%`, animationDelay: `${Math.random() * 0.8}s`, animationDuration: `${1.8 + Math.random() * 1.4}s` } }));
    this.ui.append(layer);
    setTimeout(() => layer.remove(), 4000);
  }

  /** Confetti raining down, and fireworks bursting for a beaten boss. */
  private confetti(n: number, fireworks: boolean): void {
    const colours = ['#ffd23f', '#ff5a8a', '#5fd38d', '#4fa8ff', '#b06ef0', '#ff8a3a', '#ffffff'];
    const layer = h('div', { class: 'saga-confetti' });
    for (let i = 0; i < n; i++) {
      const c = colours[i % colours.length]!;
      layer.append(
        h('i', {
          style: {
            left: `${Math.random() * 100}%`,
            background: c,
            animationDelay: `${Math.random() * 0.9}s`,
            animationDuration: `${2.2 + Math.random() * 1.6}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          },
        }),
      );
    }
    if (fireworks)
      for (let f = 0; f < 5; f++) {
        const burst = h('div', { class: 'burst', style: { left: `${15 + Math.random() * 70}%`, top: `${12 + Math.random() * 35}%`, animationDelay: `${0.3 + f * 0.45}s` } });
        const c = colours[f % colours.length]!;
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          burst.append(vars(h('b', { style: { background: c, boxShadow: `0 0 6px ${c}`, animationDelay: `${0.3 + f * 0.45}s` } }), { '--dx': `${(Math.cos(a) * 34).toFixed(1)}`, '--dy': `${(Math.sin(a) * 34).toFixed(1)}` }));
        }
        layer.append(burst);
      }
    this.ui.append(layer);
    setTimeout(() => layer.remove(), 5200);
  }

  private frameDown(fl: number): void {
    const isDown = !!(fl & FLAG.down);
    const frozen = !!(fl & FLAG.frozen);
    if (isDown && !this.wasDown) {
      this.downSince = serverNow();
      SAGA_SFX.fall();
      announce(A11Y_T.annDown, true);
    } else if (frozen && !isDown && !this.wasFrozen) announce(A11Y_T.annFrozen, true);
    if (!isDown && this.wasDown) {
      SAGA_SFX.rise();
      announce(A11Y_T.annUp);
    }
    this.wasFrozen = frozen;
    this.wasDown = isDown;
    this.down.hidden = !isDown && !frozen;
    // a spider's web holds you like the ice does
    const web = frozen && !isDown && webbed(client.me);
    this.down.classList.toggle('ice', frozen && !isDown && !web);
    this.down.classList.toggle('web', web);
    if (this.down.hidden) return;
    let title = web ? T.sagaWebbedTitle : T.sagaFrozenTitle;
    let sub = web ? T.sagaWebbedSub : T.sagaFrozenSub;
    if (isDown) {
      title = T.sagaFallenTitle;
      // from Medel up the fight is lost when every HUMAN hero is down, whatever the Hirdmannen does (RUN_LEVELS[l].humansOnly)
      const run = myRun();
      const humansOnly = !!run && !!RUN_LEVELS[run.level]?.humansOnly;
      const all = Object.entries(sagaSnap()?.f ?? {}).every(([id, f]) => !!(f[2] & FLAG.down) || (humansOnly && !!client.world?.players[id]?.bot));
      sub = all ? T.sagaWipeSub : fmt(T.sagaFallenSub, { s: Math.max(1, Math.ceil((DOWN_MS - (serverNow() - this.downSince)) / 1000)) });
    }
    const text = `${title}\n${sub}`;
    if (this.down.dataset.text !== text) {
      this.down.dataset.text = text;
      clear(this.down);
      this.down.append(h('div', { class: 'box' }, h('b', null, `${isDown ? '💀' : web ? '🕸️' : '🧊'} ${title}`), h('span', null, sub)));
    }
  }

  // ---- the quest tracker ----

  private trackerHidden(): boolean {
    return !myPlayer() || document.body.classList.contains('saga-bossfight');
  }

  private renderTracker(): void {
    const me = myPlayer();
    this.tracker.hidden = this.trackerHidden();
    if (!me || this.tracker.hidden) return;
    const prog = readProgress(me);
    clear(this.tracker);
    this.tracker.append(h('div', { class: 'head' }, T.sagaJournalTab, h('span', null, this.trackerOpen ? '▾' : '▸')));
    if (!this.trackerOpen) return;
    const ch = SAGA_CHAPTERS[prog.chapter];
    if (ch) {
      const line = !prog.heard ? T.sagaVisitVolva : chapterDone(prog) ? T.sagaBackToVolva : ch.goal;
      this.tracker.append(h('div', { class: `line${prog.heard && chapterDone(prog) ? ' done' : ''}` }, `${prog.heard ? '🎯' : '❗'} ${line}`));
    }
    for (const q of SAGA_QUESTS) {
      const st = questState(me, q);
      if (st !== 'active' && st !== 'ready') continue;
      const npc = NPCS[q.npc]?.name ?? q.npc;
      this.tracker.append(h('div', { class: `line${st === 'ready' ? ' done' : ''}` }, `${q.title}: `, h('b', null, st === 'ready' ? fmt(T.sagaQuestReadyAt, { npc }) : fmt(T.sagaQuestAt, { n: Math.min(q.count, questCount(me, q)), count: q.count }))));
    }
  }

  // ---- windows ----

  /** Garderoben (the wardrobe of looks); `stand`: the gear stand in the house it is picking a look for. */
  openLooks(stand: number | null = null, opts: { tab?: 'wear' | 'set' | 'pet'; note?: string } = {}): void {
    this.close();
    this.standObj = stand;
    this.looksNote = opts.note ?? null;
    resetLooksWindow(undefined, opts.tab);
    this.open('gear');
  }

  open(win: Win): void {
    if (win === 'gear' && this.win !== 'gear' && this.standObj === null) resetLooksWindow();
    this.close();
    this.win = win;
    if (win === 'volva') this.volvaTab = 'story';
    if (win === 'class') this.pickCls = readProgress(myPlayer()).cls ?? null;
    this.modal = h('div', { class: 'modal saga-modal' });
    this.modal.addEventListener('pointerdown', (e) => {
      // (only the journal is read-only: the class stone, Völvan, the family list and the wardrobe hold choices)
      if (e.target === this.modal && this.win === 'journal') this.close();
    });
    this.ui.append(this.modal);
    this.render();
    this.onChange(true);
  }

  close(): void {
    if (!this.modal) return;
    if (this.win === 'loot') this.loots.shift();
    this.modal.remove();
    this.modal = null;
    this.win = null;
    this.standObj = null;
    this.looksNote = null;
    this.onChange(false);
    // treasure that came while another window was open
    if (this.loots.length) setTimeout(() => this.nextLoot(), 250);
  }

  private render(): void {
    if (!this.modal || !this.win) return;
    const me = myPlayer();
    if (!me) return;
    clear(this.modal);
    const closeBtn = h('button', { class: 'close' }, '✕');
    onTap(closeBtn, () => this.close());
    const titles: Record<Win, string> = {
      class: `🗿 ${T.sagaStoneTitle}`,
      volva: `🔮 ${NPCS[VOLVA_ID]?.name ?? ''}`,
      journal: `📖 ${T.sagaJournalTitle}`,
      family: `👪 ${T.familyTitle}`,
      loot: '',
      gear: `👕 ${LOOK_T.title}`,
    };
    const body = h('div', { class: 'body' });
    const panel = h('div', { class: `panel saga-panel ${this.win}` });
    if (this.win !== 'loot') panel.append(h('h2', null, titles[this.win], h('span', { class: 'spacer' }), closeBtn));
    panel.append(body);
    if (this.win === 'class') this.renderClass(body);
    else if (this.win === 'volva') this.renderVolva(panel, body);
    else if (BOOK.includes(this.win)) {
      // the journal, the wardrobe (Garderoben) and the discoveries are tabs of one book (the wardrobe with a class or a look)
      const pages: [Win, string][] = [['journal', T.sagaJournalTab]];
      pages.push(['gear', `👕 ${LOOK_T.title}`]);
      if (this.standObj === null) {
        const tabs = h('div', { class: 'tabs' });
        for (const [w, label] of pages) {
          const b = h('button', { class: this.win === w ? 'on' : '' }, label);
          onTap(b, () => {
            if (this.win === w) return;
            this.win = w;
            SFX.talk();
            this.render();
          });
          tabs.append(b);
        }
        panel.insertBefore(tabs, body);
      }
      if (this.win === 'gear') renderLooks({ rerender: () => this.render(), close: () => this.close(), stand: this.standObj, note: this.looksNote, clothes: () => { this.close(); this.menus.open('wardrobe'); } }, body);
      else this.renderJournal(body);
    } else if (this.win === 'family') this.renderFamily(body);
    else this.renderLoot(panel, body);
    this.modal.append(panel);
  }

  // Kämpastenen: the four classes, one looked at closely, and the one you have
  private renderClass(body: HTMLElement): void {
    const mine = readProgress(myPlayer()).cls;
    const pick = this.pickCls ?? mine ?? CLASS_IDS[0]!;
    body.append(h('p', { class: 'saga-intro' }, T.sagaStoneIntro));
    const tabs = h('div', { class: 'saga-classes' });
    for (const id of CLASS_IDS) {
      const c = CLASSES[id];
      const b = vars(h('button', { class: `cls${id === pick ? ' on' : ''}` }, h('span', { class: 'em' }, c.emoji), h('span', { class: 'nm' }, c.name), h('span', { class: 'role' }, c.roleName), id === mine ? h('span', { class: 'mine' }, `✓ ${T.sagaMine}`) : null), { '--c': c.color });
      onTap(b, () => {
        this.pickCls = id;
        SFX.talk();
        this.render();
      });
      tabs.append(b);
    }
    body.append(tabs);
    const c = CLASSES[pick];
    const spells = h('div', { class: 'saga-spells' });
    c.spells.forEach((id, i) => {
      const sp = SPELLS[id]!;
      spells.append(h('div', { class: 'sp' }, h('span', { class: 'ic' }, sp.icon), h('div', null, h('b', null, `${sp.name} `, h('span', { class: 'k' }, String(i + 1))), h('div', { class: 'tx' }, sp.text))));
    });
    const choose = h('button', { class: 'pick', disabled: pick === mine }, pick === mine ? `✓ ${T.sagaMine}` : `${T.sagaPick}: ${c.emoji} ${c.name}`);
    onTap(choose, () => {
      if (pick === mine) return;
      net.send({ t: 'saga', a: 'class', cls: pick });
      SAGA_SFX.spell('lakekrets');
      setTimeout(() => this.close(), 350);
    });
    const top = h('div', { class: 'top' }, h('span', { class: 'em' }, c.emoji), h('div', null, h('b', null, c.name), h('div', { class: 'tags' }, h('span', { class: 'role' }, c.roleName), h('span', null, `❤️ ${fmt(T.sagaHealth, { hp: c.hp })}`))));
    const card = h('div', { class: 'saga-classcard' }, top, h('p', { class: 'blurb' }, c.blurb), fightExplain(pick), h('div', { class: 'saga-head' }, T.sagaSpellsTitle), spells, h('div', { class: 'q-act' }, choose));
    body.append(vars(card, { '--c': c.color }));
  }

  // Völvan Sigrun: the chapter as a story, line by line; the journal; or a chat
  private renderVolva(panel: HTMLElement, body: HTMLElement): void {
    const tabs = h('div', { class: 'tabs' });
    const tab = (label: string, on: boolean, fn: () => void): void => {
      const b = h('button', { class: on ? 'on' : '' }, label);
      onTap(b, fn);
      tabs.append(b);
    };
    tab(T.sagaStoryTab, this.volvaTab === 'story', () => {
      this.volvaTab = 'story';
      this.render();
    });
    tab(T.sagaJournalTab, this.volvaTab === 'journal', () => {
      this.volvaTab = 'journal';
      this.render();
    });
    tab(T.sagaTalk, false, () => {
      this.close();
      this.menus.talkTo(VOLVA_ID);
    });
    panel.insertBefore(tabs, body);
    if (this.volvaTab === 'journal') {
      this.renderJournal(body);
      return;
    }
    const me = myPlayer()!;
    const prog = readProgress(me);
    const npc = NPCS[VOLVA_ID]!;
    const ch = SAGA_CHAPTERS[prog.chapter];
    const portrait = h('img', { class: 'portrait', src: portraitUrl(npc.appearance, npc.outfit, 4) });
    if (!ch) {
      body.append(h('div', { class: 'npc-talk' }, portrait, h('div', { class: 'bubble-text' }, T.sagaAllDone)));
      return;
    }
    const mode = !prog.heard ? 'tell' : chapterDone(prog) ? 'done' : 'goal';
    const lines = mode === 'tell' ? ch.tell : mode === 'done' ? ch.done : [ch.tell[ch.tell.length - 1]!];
    const key = `${prog.chapter}:${mode}`;
    if (key !== this.lineKey) {
      this.lineKey = key;
      this.line = 0;
    }
    const heading = prog.chapter === 0 ? ch.title : fmt(T.sagaChapter, { n: prog.chapter, title: ch.title });
    const said = h('div', { class: 'saga-lines' });
    lines.slice(0, this.line + 1).forEach((l, i) => said.append(h('p', { class: i === this.line ? 'now' : '' }, l)));
    body.append(h('div', { class: 'saga-chapter' }, `📜 ${heading}`), h('div', { class: 'npc-talk' }, portrait, said));
    const act = h('div', { class: 'q-act' });
    if (this.line < lines.length - 1) {
      const more = h('button', null, T.sagaMore);
      onTap(more, () => {
        this.line++;
        SFX.talk();
        this.render();
      });
      act.append(more);
    } else if (mode === 'tell') {
      body.append(h('div', { class: 'saga-goal' }, h('b', null, `🎯 ${T.sagaGoal}: `), ch.goal), h('div', { class: 'q-reward' }, fmt(T.sagaReward, { reward: rewardText(ch.reward) })));
      const yes = h('button', null, T.sagaPromise);
      onTap(yes, () => net.send({ t: 'saga', a: 'chapter' }));
      act.append(yes);
    } else if (mode === 'done') {
      body.append(h('div', { class: 'q-reward big' }, fmt(T.sagaReward, { reward: rewardText(ch.reward) })));
      const take = h('button', { class: 'gold' }, `🎁 ${T.sagaTakeReward}`);
      onTap(take, () => net.send({ t: 'saga', a: 'chapter' }));
      act.append(take);
    } else {
      body.append(h('div', { class: 'saga-goal' }, h('b', null, `🎯 ${T.sagaGoal}: `), ch.goal));
    }
    // the four classes are picked (and changed between runs) with Völvan
    const way = h('button', { class: prog.cls ? 'alt' : '' }, prog.cls ? `🔄 ${T.sagaChangeWay}` : T.sagaChooseWay);
    onTap(way, () => this.open('class'));
    if (this.line >= lines.length - 1) act.append(way);
    body.append(act);
  }

  // The saga so far: chapters, the dungeons and how to beat their bosses, titles
  private renderJournal(body: HTMLElement): void {
    const prog = readProgress(myPlayer());
    this.renderLevels(body);
    body.append(h('div', { class: 'saga-head' }, T.sagaChapters));
    const chapters = h('div', { class: 'saga-list' });
    SAGA_CHAPTERS.forEach((ch, i) => {
      if (i > prog.chapter) return;
      // the second part of the saga begins after Surt
      if (i === ACT_TWO) chapters.append(h('div', { class: 'act' }, `🌀 ${T.sagaActTwo}`));
      const done = i < prog.chapter;
      const name = i === 0 ? ch.title : fmt(T.sagaChapter, { n: i, title: ch.title });
      const need = h('span', { class: 'need' }, done ? ch.done[0]! : prog.heard ? ch.goal : T.sagaVisitVolva);
      chapters.append(
        h(
          'div',
          { class: `row${done ? ' done' : ''}` },
          h('span', { class: 'badge' }, done ? '✅' : '📜'),
          h('span', { class: 'name' }, name, h('br'), need),
          done ? null : h('span', { class: 'price' }, T.sagaChapterNow),
        ),
      );
    });
    body.append(chapters, h('div', { class: 'saga-head' }, T.sagaDungeons));
    for (const id of DUNGEON_IDS) {
      const d = DUNGEONS[id];
      const cleared = prog.cleared.includes(id);
      const prev = previousDungeon(id);
      const open = cleared || (!!prog.cls && (!prev || prog.cleared.includes(prev)));
      const card = h('div', { class: `saga-dungeon${cleared ? ' cleared' : ''}${open ? '' : ' sealed'}` }, h('div', { class: 'top' }, h('b', null, `⚔️ ${d.name}`), h('span', { class: 'tag' }, cleared ? T.sagaClearedTag : open ? '' : `🔒 ${T.sagaSealed}`)));
      if (!open) card.append(h('div', { class: 'tx' }, T.sagaUnknown));
      else {
        // today's treasure from each boss (full once a day, a smaller chest after that), and the family's best time
        const chests = h('div', { class: 'chests' });
        for (const b of [d.mini, d.boss]) {
          const def = SAGA_BOSSES[b]!;
          const taken = prog.chestDay?.[b] === client.day;
          chests.append(h('span', { class: `chest-day ${taken ? 'taken' : 'left'}`, title: taken ? T.sagaChestTakenTip : T.sagaChestLeftTip }, `${taken ? '📦' : '🎁'} ${def.name}: `, h('b', null, `${T.sagaChestToday} ${taken ? T.sagaChestTaken : T.sagaChestLeft}`)));
        }
        const best = client.world?.sagaBest?.[id];
        chests.append(h('span', { class: `best${best ? '' : ' none'}` }, best ? `⏱️ ${fmt(T.sagaBestTime, { time: clock(best.ms), names: best.names.join(', ') })}` : `⏱️ ${T.sagaNoBestTime}`));
        card.append(chests);
        // the dungeon's monsters: a picture, the name, what kind of fighter it is and a sentence (Bifrost: the ones Loke copies)
        const mobs = h('div', { class: 'mobs' });
        for (const sp of dungeonSpecies(id)) {
          const px = drawAnimal(sp, 0, false, false, mobVariant(0, !!d.illusions));
          const kind = MOB_ARCHETYPE[sp];
          mobs.append(
            h(
              'div',
              { class: 'mob' },
              h('span', { class: 'pic' }, h('img', { src: px.dataUrl(), alt: '', draggable: 'false', style: { width: `${px.w * 2}px`, height: `${px.h * 2}px` } })),
              h('span', { class: 'what' }, h('b', null, SPECIES_NAMES[sp] ?? sp), kind ? h('span', { class: 'kind' }, ` · ${MOB_T.archetype[kind]}`) : null, h('br'), MOB_TEXT[sp] ?? ''),
            ),
          );
        }
        card.append(h('div', { class: 'boss' }, h('b', null, `👾 ${MOB_T.journalHead}`), mobs));
        for (const b of [d.mini, d.boss]) {
          const def = SAGA_BOSSES[b]!;
          const moves = h('ul', { class: 'moves' });
          for (const mv of def.moves) moves.append(h('li', null, h('b', null, `${mv.interrupt ? '🛡️ ' : '🔴 '}${mv.name}: `), mv.text));
          card.append(h('div', { class: 'boss' }, h('div', null, h('b', null, `${def.mini ? '💀' : '👑'} ${def.name}`), h('span', { class: 'title' }, ` · ${def.title}`)), cleared ? h('div', { class: 'lore' }, def.lore) : null, h('div', { class: 'tx' }, fmt(T.sagaHowToFight, { boss: def.name })), moves));
        }
      }
      body.append(card);
    }
    // the special pack monsters and Öppning: what they are and what to do about them
    body.append(h('div', { class: 'saga-head' }, `👹 ${T.sagaRolesTitle}`));
    body.append(h('div', { class: 'saga-roles' }, ...MOB_ROLES.map(roleLine), h('div', { class: 'role-line' }, h('span', { class: 'em' }, '💥'), h('div', null, h('b', null, T.sagaDunkName), h('div', { class: 'tx' }, T.sagaDunkText))), h('div', { class: 'role-line open' }, h('span', { class: 'em' }, '💫'), h('div', null, h('b', null, FIGHT_UI.openTitle), h('div', { class: 'tx' }, T.sagaOpenText)))));
    if (prog.cls) body.append(fightExplain(prog.cls));
    // Hugins tips: every tip the raven has shown on this device, to read again
    const tips = seenTips();
    const bird = document.createElement('canvas');
    const src = huginCanvas('land');
    bird.width = src.width;
    bird.height = src.height;
    bird.getContext('2d')!.drawImage(src, 0, 0);
    body.append(h('div', { class: 'saga-head' }, `🐦‍⬛ ${HUGIN_T.page}`));
    body.append(
      h(
        'div',
        { class: 'hugin-tips' },
        h('div', { class: 'head' }, bird, h('span', { class: 'count' }, tips.length ? fmt(HUGIN_T.pageCount, { n: tips.length, max: TIPS.length }) : HUGIN_T.pageNone)),
        ...tips.map((t) => h('div', { class: 'tip' }, h('span', { class: 'pic', 'aria-hidden': 'true' }, tipPic(t.pic)), h('span', { class: 'tx' }, t.text))),
      ),
    );
    // fighting together: Märke, Samslag, Kraftklot, Guldringen and Runmärken
    const line = (pic: HTMLElement | string, name: string, text: string): HTMLElement => h('div', { class: 'role-line' }, typeof pic === 'string' ? h('span', { class: 'em' }, pic) : pic, h('div', null, h('b', null, name), h('div', { class: 'tx' }, text)));
    body.append(h('div', { class: 'saga-head' }, `🤝 ${FIGHT_UI.fightPage}`));
    body.append(
      h(
        'div',
        { class: 'saga-roles' },
        line(skullMark(), T.sagaSkull, T.sagaSkullText),
        line('🤝', T.sagaSamslag, FIGHT_UI.samslagLine),
        line('🔮', T.sagaOrb, T.sagaOrbText),
        line('⭐', FIGHT_UI.ringTitle, FIGHT_UI.ringText),
        line(h('span', { class: 'em medals' }, '🥇'), FIGHT_UI.medalsTitle, RUN_T.medalText),
        line('🎯', T.sagaFarName, T.sagaFarText),
        line('💀', T.sagaWipe, RUN_T.wipeRule),
      ),
    );
    body.append(h('div', { class: 'saga-head' }, T.sagaTitles));
    body.append(prog.titles.length ? h('div', { class: 'saga-titles' }, ...prog.titles.map((t) => h('span', null, `👑 ${t}`))) : h('div', { class: 'hint' }, T.sagaNoTitles));
  }

  // The hero level: where you are, the experience bar, and what every level gives (the ones reached shine)
  private renderLevels(body: HTMLElement): void {
    const me = myPlayer()!;
    const xp = me.saga?.xp ?? 0;
    const level = levelOf(me);
    body.append(h('div', { class: 'saga-head' }, `⭐ ${T.sagaHeroLevelHead}`));
    body.append(h('div', { class: 'saga-level' }, h('b', { class: 'lvl' }, `⭐ ${fmt(T.sagaLevelOf, { n: level, max: MAX_LEVEL })}`), xpMeter(xp), h('p', { class: 'tx' }, T.sagaLevelIntro)));
    const list = h('div', { class: 'saga-levels' });
    let next = true;
    for (const n of Object.keys(LEVEL_REWARDS).map(Number).sort((a, b) => a - b)) {
      const got = level >= n;
      const row = h('div', { class: `lv${got ? ' got' : ''}${!got && next ? ' next' : ''}` }, h('span', { class: 'n' }, got ? `✓ ${n}` : fmt(T.sagaRewardLocked, { n })), h('span', { class: 'rws' }, ...rewardParts(n)));
      if (!got) next = false;
      list.append(row);
    }
    body.append(list);
  }

  // Everyone in the family: where they are, and a jump to their side
  private renderFamily(body: HTMLElement): void {
    body.append(h('p', { class: 'saga-intro' }, T.familyHint));
    const rows = h('div', { class: 'rows' });
    const players = Object.values(client.world?.players ?? {}).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    for (const p of players) {
      const me = p.id === client.me;
      const c = classOf(p);
      const title = titleOf(p);
      const where = p.online ? placeOf(p.area) : T.familyAway;
      const row = h(
        'div',
        { class: `row${p.online ? '' : ' off'}` },
        h('img', { class: 'face', src: portraitUrl(p.appearance, p.outfit, 2) }),
        h('span', { class: 'name' }, `${c ? `${c.emoji} ` : ''}${p.name}${me ? ` (${T.sagaYou.toLowerCase()})` : ''}`, title ? h('span', { class: 'ttl' }, ` <${title}>`) : null, h('br'), h('span', { class: 'need' }, where)),
      );
      rows.append(row);
    }
    body.append(rows);
  }

  // ---- loot ----

  private nextLoot(): void {
    if (!this.loots.length || this.modal) return;
    this.open('loot');
  }

  private renderLoot(panel: HTMLElement, body: HTMLElement): void {
    const c = this.loots[0];
    if (!c) return;
    let best = 0;
    const rows = h('div', { class: 'saga-loot' });
    for (const it of c.items) {
      const d = sagaItem(it.item);
      const rar: Rarity = d?.rarity ?? 'common';
      best = Math.max(best, RARITY_ORDER.indexOf(rar));
      rows.append(
        vars(
          h(
            'div',
            { class: `loot rar-${rar}` },
            h('span', { class: 'pic' }, itemIcon(it.item)),
            h('div', { class: 'col' }, h('b', { class: 'nm' }, `${itemName(it.item)}${it.count > 1 ? ` × ${it.count}` : ''}`), h('span', { class: 'rar' }, RARITY_NAMES[rar]), d?.text ? h('div', { class: 'tx' }, d.text) : null),
          ),
          { '--r': RARITY_COLORS[rar] },
        ),
      );
    }
    // a completed dungeon's looks: each with its effect playing, and a button to put it on
    const lk = c.looks;
    if (lk) {
      const prog = readProgress(myPlayer());
      for (const dr of lk.drops) {
        const piece = lookPiece(dr.piece);
        if (!piece) continue;
        best = Math.max(best, dr.signature ? 4 : 3);
        const way = undefined;
        const lines = [dr.signature ? LOOK_T.lootSig : dr.isNew ? fmt(LOOK_T.lootNew, { name: piece.name }) : fmt(LOOK_T.lootMore, { name: piece.name }), fmt(LOOK_T.lootNow, { tier: LOOK_TIER_NAMES[dr.tier - 1]!, n: dr.tier })];
        const cls = prog.cls ?? prog.lookCls;
        const can = wearableBy(dr.piece, cls) && !!cls;
        rows.append(lootLookCard(encodeLook(dr.piece, dr.tier, way), dr.piece, lines, can ? () => net.send({ t: 'look', slot: piece.slot, piece: dr.piece, cls }) : null));
      }
      // pet gear from the same clear (a pet was along): each piece with its effect playing, and a button to put it on that pet
      if (lk.pet) {
        const pet = lk.pet;
        for (const dr of pet.drops) {
          const piece = lookPiece(dr.piece);
          if (!piece?.petSlot) continue;
          best = Math.max(best, 3);
          const lines = [fmt(PET_T.lootPet, { pet: pet.name }), dr.isNew ? fmt(LOOK_T.lootNew, { name: piece.name }) : fmt(LOOK_T.lootMore, { name: piece.name }), fmt(LOOK_T.lootNow, { tier: LOOK_TIER_NAMES[dr.tier - 1]!, n: dr.tier })];
          const anchor = piece.petSlot;
          rows.append(lootLookCard(encodeLook(dr.piece, dr.tier), dr.piece, lines, () => net.send({ t: 'pet', a: 'wear', anchor, piece: dr.piece, kind: pet.kind })));
        }
      }
      for (const w of lk.ways) {
        const dun = DUNGEONS[lk.dungeon as keyof typeof DUNGEONS];
        const set = dun ? setsOf(dun.id)[0] : undefined;
        if (set) rows.append(h('div', { class: 'loot way' }, h('span', { class: 'pic' }, h('span', { class: 'em' }, '🎨')), h('div', { class: 'col' }, h('b', { class: 'nm' }, fmt(LOOK_T.lootWay, { name: set.ways[w].name })), h('span', { class: 'tx' }, `${DUNGEONS[dun!.id].name}: ${w === 'svar' ? LOOK_T.levelSvar : LOOK_T.levelExtrem}`))));
      }
      for (const t of lk.titles) rows.append(h('div', { class: 'loot title' }, h('span', { class: 'pic' }, h('span', { class: 'em' }, '👑')), h('div', { class: 'col' }, h('b', { class: 'nm' }, fmt(LOOK_T.lootTitle, { title: t })))));
    }
    if (c.stars > 0) rows.append(h('div', { class: 'loot coins' }, h('span', { class: 'pic' }, h('span', { class: 'em' }, '⭐')), h('b', { class: 'stars' }, `+${c.stars} ⭐`)));
    const rar = RARITY_ORDER[best]!;
    // the day's second (and later) chest from a boss: a plainer one, no rays and no fireworks
    const replay = !!c.replay;
    panel.classList.add(`best-${rar}`);
    if (replay) panel.classList.add('replay');
    panel.style.setProperty('--r', RARITY_COLORS[rar]);
    const ok = h('button', { class: 'gold' }, T.sagaLootOk);
    onTap(ok, () => this.close());
    panel.insertBefore(h('h2', null, h('span', { class: 'chest' }, replay ? '📦' : '🎁'), lk ? LOOK_T.lootHead : fmt(replay ? T.sagaReplayChest : T.sagaLootTitle, { from: c.from })), body);
    if (replay) body.prepend(h('p', { class: 'replay-note' }, T.sagaReplaySub));
    else if (rar === 'legendary') panel.prepend(h('div', { class: 'rays' }));
    body.append(rows, h('div', { class: 'q-act' }, ok));
    SAGA_SFX.loot(replay ? Math.min(best, 2) : best);
    if (best >= 4 && !replay) this.confetti(60, true);
  }
}

