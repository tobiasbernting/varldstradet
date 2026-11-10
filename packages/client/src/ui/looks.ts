// Garderoben: the window for looks (cool gear that is only for show, shared/src/looks.ts). Dress each class from the collection (free and
// instant), see what every piece is, where it comes from and how to make it shine more, the sets and how far each has come, and
// pick a look for a gear stand in the house. For small hands and big screens alike: every target is at least 48 px, the text at least
// 16 px, every look is explained by tapping it (no hover), tier and "worn" and "not yet" are words and stars as well as colours, and
// it works with the keyboard (Tab, Enter) and the gamepad (every control is a button). Effects: full / mindre / av.
import {
  ALL_PIECES,
  CLASSES,
  CLASS_IDS,
  DUNGEONS,
  FX_NAMES,
  FX_FULL_TIER,
  FX_TIER,
  LOOK_SETS,
  LOOK_SLOTS,
  LOOK_SLOT_EMOJI,
  LOOK_SLOT_NAMES,
  LOOK_T,
  LOOK_TIER_HINTS,
  LOOK_TIER_MAX,
  LOOK_TIER_NAMES,
  PETS,
  PET_ANCHORS,
  PET_LOOK_SETS,
  PET_T,
  SIGNATURE_AFTER,
  SIGNATURE_WEAPONS,
  WAY_IDS,
  decodeLook,
  dungeonOfPiece,
  encodeLook,
  fmt,
  hasLooks,
  hasWay,
  looksOutfit,
  lookPalOf,
  lookPiece,
  ownedPetIds,
  ownsLook,
  setOfPiece,
  setProgress,
  setsOf,
  tierOf,
  waysOf,
  wearClass,
  wearOf,
  wearableBy,
  type ClassId,
  type LookPiece,
  type LookSlot,
  type PetAnchor,
  type WayId,
} from '@lilla-garden/shared';
import { drawAnimal } from '@art/animals.ts';
import { lookIcon } from '@art/characters.ts';
import { portraitUrl } from '@art/textures.ts';
import { FX_SETTINGS, effectiveFx, fxSetting, setFxSetting, type FxSetting } from '../fxprefs.ts';
import { net } from '../net.ts';
import { readProgress } from '@lilla-garden/shared';
import { SFX } from '../sound.ts';
import { myPlayer } from '../state.ts';
import { h, onTap } from './dom.ts';
import { lookPreview } from './looksfx2d.ts';
import './looks.css';

/** What the window remembers between openings. */
const st: { cls: ClassId | null; sel: string | null; tab: 'wear' | 'set' | 'pet'; pet: string | null; scroll: Record<string, number> } = { cls: null, sel: null, tab: 'wear', pet: null, scroll: {} };

const urls = new Map<string, string>();
/** A look's picture as a data URL (cached by code). */
export function lookIconUrl(code: string): string {
  let u = urls.get(code);
  if (u === undefined) {
    const d = decodeLook(code);
    u = d ? lookIcon(d).dataUrl() : '';
    urls.set(code, u);
  }
  return u;
}
const stars = (tier: number): string => '★'.repeat(tier) + '☆'.repeat(LOOK_TIER_MAX - tier);
const WAY_LEVEL: Record<WayId, string> = { svar: LOOK_T.levelSvar, extrem: LOOK_T.levelExtrem };

/** The way a piece is worn in right now (for the class being dressed), or undefined. */
const wornWay = (piece: string, cls: ClassId | undefined): WayId | undefined => {
  const prog = readProgress(myPlayer());
  const slot = lookPiece(piece)?.slot;
  const w = slot ? wearOf(prog, cls)[slot] : undefined;
  return w?.piece === piece ? w.way : undefined;
};
const isWorn = (piece: string, cls: ClassId | undefined): boolean => {
  const slot = lookPiece(piece)?.slot;
  return !!slot && wearOf(readProgress(myPlayer()), cls)[slot]?.piece === piece;
};

/** What the wardrobe needs from its window. */
export interface LooksHost {
  /** Draws the window again (after something changed). */
  rerender(): void;
  close(): void;
  /** A gear stand being filled (its object id), or null. */
  stand: number | null;
  /** Opens the clothes window (hat, shirt, trousers, shoes): the base the looks are worn over. */
  clothes?: () => void;
  /** A line from someone (Stina) shown on top. */
  note?: string | null;
  /** The tab to show first. */
  tab?: 'wear' | 'set' | 'pet';
}

/** The code of a piece as the player has it now (tier from the collection), in a way. */
const codeOf = (pieceId: string, way?: WayId): string => encodeLook(pieceId, Math.max(1, tierOf(readProgress(myPlayer()), pieceId)), way);

/** One look as a card: its picture, name, stars and state (worn, owned, locked), tapped to wear it (if owned) and to read about it. */
function card(host: LooksHost, piece: LookPiece, cls: ClassId | undefined, opts: { stand?: boolean } = {}): HTMLElement {
  const prog = readProgress(myPlayer());
  const tier = tierOf(prog, piece.id);
  const have = tier > 0;
  const worn = !opts.stand && isWorn(piece.id, cls);
  const way = wornWay(piece.id, cls);
  const shownCode = encodeLook(piece.id, Math.max(1, tier), way);
  const state = opts.stand ? (have ? '' : LOOK_T.locked) : worn ? LOOK_T.worn : have ? '' : LOOK_T.locked;
  const b = h(
    'button',
    { class: `look-card${worn ? ' worn' : ''}${have ? '' : ' locked'}${st.sel === piece.id ? ' sel' : ''}`, type: 'button', 'aria-pressed': worn ? 'true' : 'false', 'aria-label': `${piece.name}. ${have ? fmt(LOOK_T.shine, { n: tier }) : LOOK_T.locked}${worn ? `. ${LOOK_T.worn}` : ''}` },
    h('img', { class: 'pic', src: lookIconUrl(shownCode), alt: '', draggable: 'false' }),
    h('span', { class: 'col' }, h('b', { class: 'nm' }, piece.name), have ? h('span', { class: 'stars' }, `${stars(tier)} ${tier}/5`) : h('span', { class: 'stars none' }, LOOK_T.locked), state && have ? h('span', { class: 'state' }, state) : null),
  );
  onTap(b, () => {
    SFX.talk();
    st.sel = piece.id;
    if (have && opts.stand && host.stand !== null) {
      net.send({ t: 'look', slot: piece.slot, piece: piece.id, ...(way ? { way } : {}), obj: host.stand });
      host.close();
      return;
    }
    // a look you have is put on at once (free, and it is easy to take off again); one you do not have is only explained
    if (have && !opts.stand && wearableBy(piece.id, cls) && !worn) net.send({ t: 'look', slot: piece.slot, piece: piece.id, ...(cls ? { cls } : {}) });
    host.rerender();
  });
  void shownCode;
  return b;
}

/** The card with everything about the look you tapped: where it comes from, its shine, its effects (playing) and its colours. */
function detail(host: LooksHost, cls: ClassId | undefined): HTMLElement {
  const prog = readProgress(myPlayer());
  const box = h('div', { class: 'look-detail', role: 'region', 'aria-live': 'polite' });
  const id = st.sel;
  const piece = id ? lookPiece(id) : undefined;
  if (!piece || !id) {
    box.append(h('p', { class: 'hint' }, LOOK_T.tapToLearn));
    return box;
  }
  const tier = tierOf(prog, id);
  const dungeon = dungeonOfPiece(id);
  const d = dungeon ? DUNGEONS[dungeon] : undefined;
  const set = setOfPiece(id);
  const sig = SIGNATURE_WEAPONS.find((s) => s.id === id);
  const way = wornWay(id, cls);
  const code = encodeLook(id, Math.max(1, tier), way);
  const top = h('div', { class: 'top' });
  top.append(tier > 0 ? lookPreview(code, 4) : h('img', { class: 'pic big', src: lookIconUrl(code), alt: '' }));
  top.append(h('div', { class: 'who' }, h('b', { class: 'nm' }, piece.name), h('span', { class: 'tx' }, piece.text), h('span', { class: 'meta' }, `${LOOK_SLOT_EMOJI[piece.slot]} ${LOOK_SLOT_NAMES[piece.slot]}`)));
  box.append(top);
  const lines = h('ul', { class: 'lines' });
  // first how to get it and how to make it shine (what a child asks first), then what it is part of and what it throws
  if (d && !sig) lines.append(h('li', null, fmt(LOOK_T.from, { dungeon: d.name })));
  if (sig) {
    const n = prog.lookClears?.[sig.dungeon] ?? 0;
    lines.append(h('li', null, tier > 0 ? LOOK_T.sigOwned : fmt(LOOK_T.sigHow, { dungeon: d?.name ?? '', n: SIGNATURE_AFTER })));
    if (tier === 0) lines.append(h('li', null, fmt(LOOK_T.sigCount, { n: Math.min(n, SIGNATURE_AFTER), max: SIGNATURE_AFTER })));
  } else if (tier === 0) lines.append(h('li', null, fmt(LOOK_T.getIt, { dungeon: d?.name ?? '' })));
  else {
    lines.append(h('li', { class: 'shine' }, `${stars(tier)} ${LOOK_TIER_NAMES[tier - 1]} (${fmt(LOOK_T.shine, { n: tier })}). ${LOOK_TIER_HINTS[tier - 1]}`));
    lines.append(h('li', null, tier >= LOOK_TIER_MAX ? LOOK_T.maxed : fmt(LOOK_T.raise, { dungeon: d?.name ?? '' })));
  }
  if (set) lines.append(h('li', null, `${fmt(LOOK_T.setOf, { set: set.name })}. ${set.cls ? fmt(LOOK_T.forClass, { cls: `${CLASSES[set.cls].emoji} ${CLASSES[set.cls].name}` }) : LOOK_T.forAll}`));
  else lines.append(h('li', null, LOOK_T.forAll));
  // what it throws: now, or what the next steps give
  const e1 = FX_NAMES[piece.fx[0].fx];
  const e2 = piece.fx[1] ? FX_NAMES[piece.fx[1].fx] : null;
  if (!sig || tier > 0) {
    if (tier >= FX_FULL_TIER) lines.append(h('li', null, fmt(LOOK_T.effectNow, { fx: e2 ? `${e1}, ${e2}` : e1 })));
    else if (tier >= FX_TIER) {
      lines.append(h('li', null, fmt(LOOK_T.effectNow, { fx: e1 })));
      if (e2) lines.append(h('li', null, fmt(LOOK_T.effectFull, { fx: e2 })));
    } else {
      lines.append(h('li', null, fmt(LOOK_T.effectNext, { fx: e1 })));
      if (e2) lines.append(h('li', null, fmt(LOOK_T.effectFull, { fx: e2 })));
    }
  } else lines.append(h('li', null, fmt(LOOK_T.effectNow, { fx: e2 ? `${e1}, ${e2}` : e1 })));
  box.append(lines);
  // the colourways of this dungeon
  if (dungeon && !sig && tier > 0) {
    const ways = h('div', { class: 'ways', role: 'group', 'aria-label': LOOK_T.ways });
    const mk = (label: string, w: WayId | undefined, on: boolean, locked: boolean, pal?: ReturnType<typeof lookPalOf>): HTMLElement => {
      const swatch = pal ? h('i', { class: 'sw', style: { background: pal.main, borderColor: pal.trim } }) : h('i', { class: 'sw plain' });
      const b = h('button', { class: `way${on ? ' on' : ''}${locked ? ' off' : ''}`, type: 'button', 'aria-pressed': on ? 'true' : 'false', disabled: locked }, swatch, h('span', null, `${on ? '✓ ' : ''}${label}`));
      onTap(b, () => {
        if (locked) return;
        SFX.talk();
        net.send({ t: 'look', slot: piece.slot, piece: id, ...(w ? { way: w } : {}), ...(cls ? { cls } : {}) });
      });
      return b;
    };
    ways.append(mk(LOOK_T.wayPlain, undefined, !way, false));
    for (const w of WAY_IDS) {
      const own = hasWay(prog, dungeon, w);
      const name = set?.ways[w].name ?? w;
      ways.append(own ? mk(`${name} (${WAY_LEVEL[w]})`, w, way === w, false, lookPalOf(id, w)) : mk(fmt(LOOK_T.wayLocked, { dungeon: d?.name ?? '', level: WAY_LEVEL[w] }), w, false, true));
    }
    box.append(ways);
  }
  // wear or take off
  if (tier > 0 && !host.stand && wearableBy(id, cls)) {
    const worn = isWorn(id, cls);
    const b = h('button', { class: 'wear-btn', type: 'button' }, worn ? `✖ ${LOOK_T.takeOff}` : `✔ ${LOOK_T.putOn}`);
    onTap(b, () => {
      SFX.talk();
      net.send({ t: 'look', slot: piece.slot, piece: worn ? null : id, ...(way ? { way } : {}), ...(cls ? { cls } : {}) });
    });
    box.append(b);
  }
  return box;
}

/** The effects setting: three buttons on this device. */
function fxSettingRow(host: LooksHost): HTMLElement {
  const row = h('div', { class: 'fx-set', role: 'group', 'aria-label': LOOK_T.fxTitle });
  const names: Record<FxSetting, [string, string]> = { full: ['✨', LOOK_T.fxFull], reduced: ['🌤️', LOOK_T.fxReduced], off: ['🚫', LOOK_T.fxOff] };
  for (const s of FX_SETTINGS) {
    const on = fxSetting() === s;
    const b = h('button', { class: `fx${on ? ' on' : ''}`, type: 'button', 'aria-pressed': on ? 'true' : 'false' }, h('span', { class: 'em' }, names[s][0]), h('span', null, `${on ? '✓ ' : ''}${names[s][1]}`));
    onTap(b, () => {
      SFX.talk();
      setFxSetting(s);
      host.rerender();
    });
    row.append(b);
  }
  return h('div', { class: 'fx-box' }, h('b', null, `${LOOK_T.fxTitle}:`), row, h('p', { class: 'hint' }, effectiveFx() === 'reduced' && fxSetting() === 'full' ? LOOK_T.fxCalm : LOOK_T.fxHint));
}


// ---------------------------------------------------------------------------
// The "Djur" tab: dress the pets (pet gear is looks worn at an animal's head, neck or back)
// ---------------------------------------------------------------------------

const petDress = (me: NonNullable<ReturnType<typeof myPlayer>>, kind: string, anchor: PetAnchor) => me.pets?.dress?.[kind]?.[anchor];
const petTierOf = (me: NonNullable<ReturnType<typeof myPlayer>>, piece: string): number => me.pets?.gear?.[piece]?.tier ?? 0;
const petName = (me: NonNullable<ReturnType<typeof myPlayer>>, kind: string): string => me.pets?.owned[kind]?.name || PETS[kind]?.name || kind;
const petAnchorOf = (id: string): PetAnchor | undefined => lookPiece(id)?.petSlot;

/** The pet as it looks now, drawn from its table entry and what it wears, as a picture. */
function petPicture(me: NonNullable<ReturnType<typeof myPlayer>>, kind: string, scale: number): HTMLElement {
  const def = PETS[kind]!;
  const wear: Partial<Record<PetAnchor, string>> = {};
  for (const a of PET_ANCHORS) {
    const w = petDress(me, kind, a);
    const tier = w ? petTierOf(me, w.piece) : 0;
    const dungeon = w ? dungeonOfPiece(w.piece) : undefined;
    if (w && tier > 0) wear[a] = encodeLook(w.piece, tier, w.way && dungeon && hasWay(readProgress(me), dungeon, w.way) ? w.way : undefined);
  }
  const px = drawAnimal(def.species, 0, false, false, 0, wear);
  return h('img', { class: 'pet-pic', src: px.dataUrl(), alt: petName(me, kind), draggable: 'false', style: { width: `${px.w * scale}px`, height: `${px.h * scale}px` } });
}

function petCard(host: LooksHost, me: NonNullable<ReturnType<typeof myPlayer>>, kind: string, piece: LookPiece): HTMLElement {
  const tier = petTierOf(me, piece.id);
  const have = tier > 0;
  const anchor = piece.petSlot!;
  const w = petDress(me, kind, anchor);
  const worn = have && w?.piece === piece.id;
  const code = encodeLook(piece.id, Math.max(1, tier), worn ? w?.way : undefined);
  const b = h(
    'button',
    { class: `look-card${worn ? ' worn' : ''}${have ? '' : ' locked'}${st.sel === piece.id ? ' sel' : ''}`, type: 'button', 'aria-pressed': worn ? 'true' : 'false', 'aria-label': `${piece.name}. ${have ? fmt(LOOK_T.shine, { n: tier }) : LOOK_T.locked}${worn ? `. ${LOOK_T.worn}` : ''}` },
    h('img', { class: 'pic', src: lookIconUrl(code), alt: '', draggable: 'false' }),
    h('span', { class: 'col' }, h('b', { class: 'nm' }, piece.name), have ? h('span', { class: 'stars' }, `${stars(tier)} ${tier}/5`) : h('span', { class: 'stars none' }, LOOK_T.locked), worn ? h('span', { class: 'state' }, LOOK_T.worn) : null),
  );
  onTap(b, () => {
    SFX.talk();
    st.sel = piece.id;
    if (have && !worn) net.send({ t: 'pet', a: 'wear', anchor, piece: piece.id, kind });
    host.rerender();
  });
  return b;
}

function petDetail(me: NonNullable<ReturnType<typeof myPlayer>>, kind: string): HTMLElement {
  const prog = readProgress(me);
  const box = h('div', { class: 'look-detail', role: 'region', 'aria-live': 'polite' });
  const id = st.sel;
  const piece = id ? lookPiece(id) : undefined;
  if (!piece || !id || !piece.petSlot) {
    box.append(h('p', { class: 'hint' }, PET_T.gearTap));
    return box;
  }
  const anchor = piece.petSlot;
  const tier = petTierOf(me, id);
  const dungeon = dungeonOfPiece(id);
  const d = dungeon ? DUNGEONS[dungeon] : undefined;
  const set = setOfPiece(id);
  const dressed = petDress(me, kind, anchor);
  const worn = tier > 0 && dressed?.piece === id;
  const way = worn ? dressed?.way : undefined;
  const code = encodeLook(id, Math.max(1, tier), way);
  const top = h('div', { class: 'top' });
  top.append(lookPreview(code, 4));
  top.append(h('div', { class: 'who' }, h('b', { class: 'nm' }, piece.name), h('span', { class: 'tx' }, piece.text), h('span', { class: 'meta' }, `${PET_T.gearSlotEmoji[anchor]} ${PET_T.gearSlot[anchor]}`)));
  box.append(top);
  const lines = h('ul', { class: 'lines' });
  if (d) lines.append(h('li', null, fmt(LOOK_T.from, { dungeon: d.name })));
  if (tier === 0) lines.append(h('li', null, fmt(PET_T.gearGet, { dungeon: d?.name ?? '' })));
  else {
    lines.append(h('li', { class: 'shine' }, `${stars(tier)} ${LOOK_TIER_NAMES[tier - 1]} (${fmt(LOOK_T.shine, { n: tier })}). ${LOOK_TIER_HINTS[tier - 1]}`));
    lines.append(h('li', null, tier >= LOOK_TIER_MAX ? LOOK_T.maxed : fmt(LOOK_T.raise, { dungeon: d?.name ?? '' })));
  }
  if (set) lines.append(h('li', null, `${fmt(PET_T.gearOf, { set: set.name })}. ${PET_T.gearAny}`));
  const e1 = FX_NAMES[piece.fx[0].fx];
  const e2 = piece.fx[1] ? FX_NAMES[piece.fx[1].fx] : null;
  if (tier >= FX_FULL_TIER) lines.append(h('li', null, fmt(LOOK_T.effectNow, { fx: e2 ? `${e1}, ${e2}` : e1 })));
  else if (tier >= FX_TIER) {
    lines.append(h('li', null, fmt(LOOK_T.effectNow, { fx: e1 })));
    if (e2) lines.append(h('li', null, fmt(LOOK_T.effectFull, { fx: e2 })));
  } else {
    lines.append(h('li', null, fmt(LOOK_T.effectNext, { fx: e1 })));
    if (e2) lines.append(h('li', null, fmt(LOOK_T.effectFull, { fx: e2 })));
  }
  box.append(lines);
  if (dungeon && tier > 0) {
    const ways = h('div', { class: 'ways', role: 'group', 'aria-label': LOOK_T.ways });
    const mk = (label: string, w: WayId | undefined, on: boolean, locked: boolean, pal?: ReturnType<typeof lookPalOf>): HTMLElement => {
      const swatch = pal ? h('i', { class: 'sw', style: { background: pal.main, borderColor: pal.trim } }) : h('i', { class: 'sw plain' });
      const b = h('button', { class: `way${on ? ' on' : ''}${locked ? ' off' : ''}`, type: 'button', 'aria-pressed': on ? 'true' : 'false', disabled: locked }, swatch, h('span', null, `${on ? '✓ ' : ''}${label}`));
      onTap(b, () => {
        if (locked) return;
        SFX.talk();
        net.send({ t: 'pet', a: 'wear', anchor, piece: id, ...(w ? { way: w } : {}), kind });
      });
      return b;
    };
    ways.append(mk(LOOK_T.wayPlain, undefined, !way, false));
    for (const w of WAY_IDS) {
      const own = hasWay(prog, dungeon, w);
      const name = set?.ways[w].name ?? w;
      ways.append(own ? mk(`${name} (${WAY_LEVEL[w]})`, w, way === w, false, lookPalOf(id, w)) : mk(fmt(LOOK_T.wayLocked, { dungeon: d?.name ?? '', level: WAY_LEVEL[w] }), w, false, true));
    }
    box.append(ways);
  }
  if (tier > 0) {
    const b = h('button', { class: 'wear-btn', type: 'button' }, worn ? `✖ ${PET_T.takeOff}` : `✔ ${fmt(PET_T.put, { pet: petName(me, kind) })}`);
    onTap(b, () => {
      SFX.talk();
      net.send({ t: 'pet', a: 'wear', anchor, piece: worn ? null : id, ...(way ? { way } : {}), kind });
    });
    box.append(b);
  }
  return box;
}

function renderPetTab(host: LooksHost, root: HTMLElement, me: NonNullable<ReturnType<typeof myPlayer>>): void {
  const owned = ownedPetIds(me);
  if (!owned.length) {
    root.append(h('p', { class: 'empty' }, PET_T.gearNoPets));
    return;
  }
  const kind = st.pet && owned.includes(st.pet) ? st.pet : me.pets?.active && owned.includes(me.pets.active) ? me.pets.active : owned[0]!;
  // which pet is being dressed
  const row = h('div', { class: 'looks-classes', role: 'group', 'aria-label': PET_T.gearDress });
  for (const id of owned) {
    const on = id === kind;
    const b = h('button', { class: `cls${on ? ' on' : ''}`, type: 'button', 'aria-pressed': on ? 'true' : 'false' }, h('span', { class: 'em' }, PETS[id]!.emoji), h('span', null, `${on ? '✓ ' : ''}${petName(me, id)}`));
    b.style.setProperty('--c', '#c8a060');
    onTap(b, () => {
      SFX.talk();
      st.pet = id;
      st.sel = null;
      host.rerender();
    });
    row.append(b);
  }
  root.append(h('div', { class: 'looks-head' }, row));
  const has = Object.keys(me.pets?.gear ?? {}).length > 0;
  const left = h('div', { class: 'looks-left' });
  left.append(h('div', { class: 'who' }, petPicture(me, kind, 8), h('div', { class: 'name' }, h('b', null, petName(me, kind)), h('span', null, PETS[kind]!.name))));
  left.append(petDetail(me, kind), fxSettingRow(host));
  const right = h('div', { class: 'looks-right' });
  right.append(h('p', { class: 'hint' }, PET_T.gearIntro));
  if (!has) right.append(h('p', { class: 'empty' }, PET_T.gearEmpty));
  for (const anchor of PET_ANCHORS) {
    const sec = h('section', { class: 'slot-sec' }, h('h3', null, h('span', { class: 'em' }, PET_T.gearSlotEmoji[anchor]), ` ${PET_T.gearSlot[anchor]}`));
    const cards = h('div', { class: 'cards' });
    const dressed = petDress(me, kind, anchor);
    const none = h('button', { class: `look-card none${dressed ? '' : ' worn'}`, type: 'button', 'aria-pressed': dressed ? 'false' : 'true' }, h('span', { class: 'em pic' }, '🚫'), h('span', { class: 'col' }, h('b', { class: 'nm' }, PET_T.gearNone), dressed ? null : h('span', { class: 'state' }, LOOK_T.worn)));
    onTap(none, () => {
      SFX.talk();
      net.send({ t: 'pet', a: 'wear', anchor, piece: null, kind });
    });
    cards.append(none);
    const pieces = PET_LOOK_SETS.flatMap((s) => s.pieces).filter((p) => p.petSlot === anchor);
    pieces.sort((a, b) => petTierOf(me, b.id) - petTierOf(me, a.id));
    for (const p of pieces) cards.append(petCard(host, me, kind, p));
    sec.append(cards);
    right.append(sec);
  }
  root.append(h('div', { class: 'looks-cols' }, left, right));
}

/** The whole window's body (the class tabs, the tabs, the preview and the lists). */
export function renderLooks(host: LooksHost, body: HTMLElement): void {
  const me = myPlayer();
  if (!me) return;
  const prog = readProgress(me);
  const cls: ClassId | undefined = st.cls ?? wearClass(prog) ?? undefined;
  if (host.stand !== null) return renderStand(host, body);
  const root = h('div', { class: 'looks' });

  // the class being dressed
  const tabs = h('div', { class: 'looks-classes', role: 'group', 'aria-label': LOOK_T.dressing });
  for (const id of CLASS_IDS) {
    const c = CLASSES[id];
    const on = id === cls;
    const b = h('button', { class: `cls${on ? ' on' : ''}`, type: 'button', 'aria-pressed': on ? 'true' : 'false' }, h('span', { class: 'em' }, c.emoji), h('span', null, `${on ? '✓ ' : ''}${c.name}`));
    b.style.setProperty('--c', c.color);
    onTap(b, () => {
      SFX.talk();
      st.cls = id;
      st.sel = null;
      host.rerender();
    });
    tabs.append(b);
  }
  const pages = h('div', { class: 'looks-pages', role: 'group' });
  for (const [t, label] of [['wear', `👕 ${LOOK_T.tabWear}`], ['set', `🏆 ${LOOK_T.tabSet}`], ['pet', `🐾 ${PET_T.gearTab}`]] as const) {
    const b = h('button', { class: `pg${st.tab === t ? ' on' : ''}`, type: 'button', 'aria-pressed': st.tab === t ? 'true' : 'false' }, label);
    onTap(b, () => {
      SFX.talk();
      st.tab = t;
      host.rerender();
    });
    pages.append(b);
  }
  if (host.note) root.append(h('p', { class: 'looks-note', role: 'status' }, `🔨 ${host.note}`));
  if (host.clothes) {
    const cb = h('button', { class: 'pg', type: 'button' }, '👖 Kläder');
    onTap(cb, () => host.clothes!());
    pages.append(cb);
  }
  if (st.tab === 'pet') {
    root.append(h('div', { class: 'looks-head' }, pages));
    renderPetTab(host, root, me);
    body.append(root);
    return;
  }
  root.append(h('div', { class: 'looks-head' }, tabs, pages));

  // left: the hero as dressed; right: the lists
  const preview = h('div', { class: 'looks-left' });
  const wearNow = looksOutfit(prog, cls);
  const outfit = { ...me.outfit, ...(wearNow ? { looks: wearNow } : { looks: undefined }) };
  if (!wearNow) delete outfit.looks;
  preview.append(h('div', { class: 'who' }, h('img', { class: 'portrait', src: portraitUrl(me.appearance, outfit, 4), alt: `${me.name}` }), h('div', { class: 'name' }, h('b', null, me.name), cls ? h('span', null, `${CLASSES[cls].emoji} ${CLASSES[cls].name}`) : h('span', null, LOOK_T.classNote))));
  preview.append(detail(host, cls), fxSettingRow(host));
  const right = h('div', { class: 'looks-right' });
  if (!hasLooks(prog)) right.append(h('p', { class: 'empty' }, LOOK_T.empty));
  if (st.tab === 'wear') {
    for (const slot of LOOK_SLOTS) {
      const pieces = ALL_PIECES.filter((p) => p.slot === slot && wearableBy(p.id, cls));
      if (!pieces.length) continue;
      pieces.sort((a, b) => Number(ownsLook(prog, b.id)) - Number(ownsLook(prog, a.id)));
      const sec = h('section', { class: 'slot-sec' }, h('h3', null, h('span', { class: 'em' }, LOOK_SLOT_EMOJI[slot]), ` ${LOOK_SLOT_NAMES[slot]}`));
      const row = h('div', { class: 'cards' });
      const none = h('button', { class: `look-card none${wearOf(prog, cls)[slot] ? '' : ' worn'}`, type: 'button', 'aria-pressed': wearOf(prog, cls)[slot] ? 'false' : 'true' }, h('span', { class: 'em pic' }, '🚫'), h('span', { class: 'col' }, h('b', { class: 'nm' }, LOOK_T.none), wearOf(prog, cls)[slot] ? null : h('span', { class: 'state' }, LOOK_T.worn)));
      onTap(none, () => {
        SFX.talk();
        net.send({ t: 'look', slot, piece: null, ...(cls ? { cls } : {}) });
      });
      row.append(none);
      for (const p of pieces) row.append(card(host, p, cls));
      sec.append(row);
      right.append(sec);
    }
  } else {
    for (const set of LOOK_SETS) {
      const pr = setProgress(prog, set);
      const sec = h('section', { class: 'slot-sec set' });
      const cl = set.cls ? CLASSES[set.cls] : null;
      sec.append(h('h3', null, `${cl ? cl.emoji : '🌈'} ${set.name}`, h('small', null, ` · ${DUNGEONS[set.dungeon].name}${cl ? '' : ' · alla'}`)));
      sec.append(h('div', { class: 'meter', role: 'img', 'aria-label': fmt(LOOK_T.setProgress, { n: pr.have, max: pr.max }) }, h('i', { style: { width: `${(pr.have / pr.max) * 100}%` } }), h('span', null, pr.have >= pr.max ? `✓ ${LOOK_T.setComplete}` : fmt(LOOK_T.setProgress, { n: pr.have, max: pr.max }))));
      const row = h('div', { class: 'cards' });
      for (const p of set.pieces) row.append(card(host, p, set.cls ?? cls));
      sec.append(row);
      right.append(sec);
    }
    const sec = h('section', { class: 'slot-sec set' }, h('h3', null, `⭐ ${LOOK_T.sigHead}`));
    const row = h('div', { class: 'cards' });
    for (const s of SIGNATURE_WEAPONS) row.append(card(host, s, cls));
    sec.append(row);
    right.append(sec);
  }
  root.append(h('div', { class: 'looks-cols' }, preview, right));
  body.append(root);
  // keep the lists where they were
  const k = `${st.tab}:${cls}`;
  right.addEventListener('scroll', () => (st.scroll[k] = right.scrollTop));
  queueMicrotask(() => (right.scrollTop = st.scroll[k] ?? 0));
  for (const side of [preview]) side.addEventListener('scroll', () => (st.scroll.left = side.scrollTop));
  queueMicrotask(() => (preview.scrollTop = st.scroll.left ?? 0));
}

/** A gear stand's picker: every look in the collection, one tap to put it on the stand. */
function renderStand(host: LooksHost, body: HTMLElement): void {
  const prog = readProgress(myPlayer());
  const root = h('div', { class: 'looks stand' });
  root.append(h('p', { class: 'intro' }, LOOK_T.standHint));
  const clearBtn = h('button', { class: 'wear-btn', type: 'button' }, `✖ ${LOOK_T.standClear}`);
  onTap(clearBtn, () => {
    net.send({ t: 'look', slot: 'weapon', piece: null, obj: host.stand! });
    host.close();
  });
  root.append(clearBtn);
  const owned = ALL_PIECES.filter((p) => ownsLook(prog, p.id));
  if (!owned.length) root.append(h('p', { class: 'empty' }, LOOK_T.empty));
  const cards = h('div', { class: 'cards' });
  for (const p of owned) cards.append(card(host, p, undefined, { stand: true }));
  root.append(cards);
  body.append(root);
}

/** A drop of the loot window: the new look with its effect playing, and a button to put it on. */
export function lootLookCard(code: string, pieceId: string, lines: string[], onWear: (() => void) | null): HTMLElement {
  const d = decodeLook(code);
  const el = h('div', { class: `loot-look tier-${d?.tier ?? 1}` });
  el.append(lookPreview(code, 6));
  const col = h('div', { class: 'col' }, h('b', { class: 'nm' }, lookPiece(pieceId)?.name ?? ''));
  for (const l of lines) col.append(h('span', { class: 'ln' }, l));
  if (d) col.append(h('span', { class: 'stars' }, `${stars(d.tier)} ${LOOK_TIER_NAMES[d.tier - 1]}`));
  if (onWear) {
    const b = h('button', { class: 'wear-btn', type: 'button' }, `✔ ${LOOK_T.lootWear}`);
    onTap(b, () => {
      onWear();
      b.textContent = LOOK_T.lootWearing;
      b.setAttribute('disabled', 'true');
    });
    col.append(b);
  }
  el.append(col);
  return el;
}

/** Sets the class the wardrobe dresses (the player's own, when it opens). */
export function resetLooksWindow(selectPiece?: string, tab?: 'wear' | 'set' | 'pet'): void {
  st.cls = null;
  if (tab) st.tab = tab;
  st.sel = selectPiece ?? null;
}
export { setsOf };

/** The looks the last victory gave, kept for the run's summary (it opens after the loot window has come and gone). */
let lastDrops: { looks: import('@lilla-garden/shared').LootLooks; at: number } | null = null;
export function rememberLooks(looks: import('@lilla-garden/shared').LootLooks): void {
  lastDrops = { looks, at: Date.now() };
}
/** A row for the run's end summary: each look that dropped (picture, name, shine), the colourway and the title. Null if none lately. */
export function lookSummary(): HTMLElement | null {
  if (!lastDrops || Date.now() - lastDrops.at > 30 * 60_000) return null;
  const { looks } = lastDrops;
  const row = h('div', { class: 'look-summary', role: 'group', 'aria-label': LOOK_T.lootHead });
  row.append(h('b', { class: 'hd' }, `✨ ${LOOK_T.lootHead}`));
  for (const d of looks.drops) {
    const p = lookPiece(d.piece);
    if (!p) continue;
    row.append(h('span', { class: 'chip' }, h('img', { src: lookIconUrl(encodeLook(d.piece, d.tier)), alt: '', draggable: 'false' }), h('span', null, `${p.name} ${stars(d.tier)}${d.isNew ? ` (${LOOK_T.lootNew.replace(': {name}', '')})` : ''}`)));
  }
  for (const d of looks.pet?.drops ?? []) {
    const p = lookPiece(d.piece);
    if (!p) continue;
    row.append(h('span', { class: 'chip' }, h('img', { src: lookIconUrl(encodeLook(d.piece, d.tier)), alt: '', draggable: 'false' }), h('span', null, `🐾 ${p.name} ${stars(d.tier)}${d.isNew ? ` (${LOOK_T.lootNew.replace(': {name}', '')})` : ''}`)));
  }
  for (const t of looks.titles) row.append(h('span', { class: 'chip' }, `👑 ${t}`));
  if (looks.ways.length) row.append(h('span', { class: 'chip' }, `🎨 ${LOOK_T.ways}`));
  return row.childElementCount > 1 ? row : null;
}
