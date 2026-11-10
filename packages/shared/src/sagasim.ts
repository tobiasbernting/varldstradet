// The rules of Sagan om Världsträdet's dungeons. A player picks a class at Kämpastenen and fights with
// its four spells; monsters wait in groups and fight together, go for whoever they hate most (the tank
// makes sure that is the tank) and give up when dragged too far from home. Bosses mark their big attacks
// on the ground before they land, call helpers at each new phase, and some attacks can be stopped with a
// stun. Rest stones heal and become where the family gets up after falling. Chests give each player their
// own loot. Völvan Sigrun tells the saga, the villagers give quests, and anyone can jump to a family member.
import { ITEMS, NPCS } from './data.ts';

import { awardTrophy } from './house.ts';
import { awardLooks, lookRng, syncLooks } from './looks.ts';
import { RUN_LEVEL_MEDEL } from './run.ts';
import { addItem, countItem, removeItem } from './inventory.ts';
import { addObject, inBounds, mapH, mapW, objectAt, removeObject, tileIndex } from './map.ts';
import type { Change } from './protocol.ts';

import {
  CALM_MS,
  CLASSES,
  DOWN_MS,
  attackSpellOf,
  DUNGEONS,
  GCD_MS,
  LEASH_TILES,
  BLOCK_SPECIES,
  REST_RADIUS,
  SAGA_XP,
  LEVEL_REWARDS,
  fighterMax,
  gearOf,
  gearSlotOf,
  fightStats,
  isGearSlot,
  xpLevel,
  XP_LEVELS,
  MAX_LEVEL,
  SAGA_BOSSES,
  SAGA_CHAPTERS,
  SAGA_LOOT,
  SAGA_MOBS,
  SAGA_QUESTS,
  SAGA_RESET_MS,
  SAGA_TREASURE,
  SPELLS,
  addCount,
  VOLVA_ID,
  WIPE_MS,
  bossHpScale,
  DUNGEON_IDS,
  isDungeonId,
  dungeonOfKey,
  isClassId,
  isSagaKey,
  mobDmgScale,
  mobHpScale,
  newSagaProgress,
  noBuffs,
  sagaItem,
  sagaKey,
  sagaQuest,
  type ClassId,
  type DungeonId,
  type SagaFighter,
  type SagaInstance,
  type SagaLoot,
  type SagaMob,
  type SagaProgress,
  type SagaQuest,
  type SagaZone,
  type BossAbility,
  type LevelReward,
  type SagaBest,
  type RunBuffs,
  type SpellMod,
  BURN_MS,
  SHIELD_CAP,
  SHIELD_MS,
  SAGOANDAN_HP,
  ENRAGE,
} from './saga.ts';
import { runHooks } from './runhooks.ts';
import { awardPetLooks, giveClearPets, petSoak, rollPetDrops, tickPets } from './petsim.ts';
import { sagaCheckpoint, spawnSagaMob } from './sagamap.ts';
import {
  bump,
  farmOf,
  fx,
  getArea,
  giveItems,
  isSolidForAnimal,
  isSolidForPlayer,
  lineOfSight,
  npcState,
  openTileNear,
  placeIn,
  playerChange,
  PLAYER_HALF_H,
  PLAYER_HALF_W,
  resolveMove,
  toast,
  type SimCtx,
} from './sim.ts';
import { RUN_T, T, fmt, fmtDuration, itemName } from './sv.ts';
import { TILE, type PlayerState, type WorldObject, type WorldState } from './types.ts';

const px = (t: number): number => t * TILE + TILE / 2;
const tileOf = (v: number): number => Math.floor(v / TILE);
/** Distance in tiles. */
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y) / TILE;
const MOB_HALF = 5;

/** A player's saga, created the first time something needs it. */
export const progressOf = (p: PlayerState): SagaProgress => (p.saga ??= newSagaProgress());
const EMPTY: SagaProgress = newSagaProgress();
/** A player's saga for reading (clients): never changes the player. */
export const readProgress = (p: PlayerState | undefined): SagaProgress => p?.saga ?? EMPTY;

export interface Here {
  farm: WorldState;
  area: WorldState;
  inst: SagaInstance;
  key: string;
}

function hereOf(world: WorldState, p: PlayerState): Here | null {
  if (!isSagaKey(p.area)) return null;
  const farm = farmOf(world);
  const area = farm.areas?.[p.area];
  return area?.saga ? { farm, area, inst: area.saga, key: p.area } : null;
}

/** The players in a dungeon right now (online, with a class). */
export const partyOf = (h: Here): PlayerState[] => Object.values(h.area.players).filter((p) => p.online && p.area === h.key && !!h.inst.fighters[p.id]);
/** What a run adds to this player in this map (all zeros in a dungeon and for anyone without runor). */
const ZERO_BUFFS: RunBuffs = noBuffs();
const buffsOf = (h: Here, id: string): RunBuffs => h.inst.run?.buffs[id] ?? ZERO_BUFFS;
/** Cooldown left after the run's reductions (never below 40 %). */
const cdOf = (rb: RunBuffs, spellId: string, cd: number): number => cd * (1 - Math.max(-0.5, Math.min(0.6, rb.cd + (rb.spellCd[spellId] ?? 0) + (rb.mods[spellId]?.cd ?? 0))));

const upright = (h: Here, p: PlayerState): boolean => {
  const f = h.inst.fighters[p.id];
  return !!f && f.down === undefined;
};

export const hit = (h: Here, on: string | number, n: number, kind: 'dmg' | 'heal' | 'crit' | 'block' | 'stun' | 'kick' | 'miss'): Change => ({ t: 'hit', area: h.key, on, n: Math.round(n), kind });
export const spellFx = (h: Here | string, by: string | number, spell: string, from: { x: number; y: number }, to?: { x: number; y: number }, on?: string | number): Change => ({
  t: 'spell',
  area: typeof h === 'string' ? h : h.key,
  by,
  spell,
  x: from.x,
  y: from.y,
  ...(to ? { tx: to.x, ty: to.y } : {}),
  ...(on !== undefined ? { on } : {}),
});
/** A sparkle (or other effect) on whatever map a player is on. */
const fxOn = (area: string, x: number, y: number, kind: 'sparkle' | 'poof'): Change => (area === 'farm' ? fx(x, y, kind) : { ...(fx(x, y, kind) as Extract<Change, { t: 'fx' }>), area });
const toEveryone = (h: Here, out: Change[], text: string): void => {
  for (const p of partyOf(h)) out.push(toast(p.id, text));
};
const yell = (h: Here, species: string, text: string): Change => ({ t: 'yell', area: h.key, name: SAGA_BOSSES[species]?.name ?? species, text });

// ---------------------------------------------------------------------------
// In and out
// ---------------------------------------------------------------------------

/** A fighter's full health: the class's, and in a run the run's hp buff (bit-identical to `fighterMax` without one). */
function maxHealth(h: Here | undefined, p: PlayerState, cls: ClassId): number {
  const base = fighterMax(p, cls);
  const hp = h ? buffsOf(h, p.id).hp : 0;
  return hp ? Math.round(base * (1 + hp)) : base;
}

/** A fresh fighter for a player with a class (full health). */
function makeFighter(h: Here, p: PlayerState): SagaFighter | null {
  const cls = p.saga?.cls;
  if (!cls) return null;
  ensureGear(p);
  const old = h.inst.fighters[p.id];
  if (old && old.cls === cls) return old;
  const max = maxHealth(h, p, cls);
  const f: SagaFighter = { cls, hp: max, max, cd: {}, gcd: 0, fightAt: 0 };
  h.inst.fighters[p.id] = f;
  return f;
}

/** After arriving in a dungeon (by its arch, a jump or a reconnect): a fighter and a welcome. */
function joined(h: Here, p: PlayerState, out: Change[], greet: boolean): void {
  makeFighter(h, p);
  delete h.inst.emptySince;
  if (greet) {
    const d = h.inst.run ?? DUNGEONS[h.inst.id];
    out.push({ t: 'banner', to: p.id, area: h.key, text: d.name, sub: d.intro, kind: 'enter' });
  }
}

function goInto(farm: WorldState, p: PlayerState, id: DungeonId, at: { x: number; y: number } | null): Change[] {
  const key = sagaKey(id);
  const area = getArea(farm, key);
  const inst = area?.saga;
  if (!area || !inst) return [];
  const out: Change[] = [];
  const spot = at ?? inst.start;
  if (!placeIn(farm, p, key, spot.x, spot.y, 'up', out)) return [];
  joined({ farm, area, inst, key }, p, out, true);
  out.push(playerChange(p));
  return out;
}

/** Leaves a dungeon by its way out: back in front of the arch. */
export function leaveSaga(world: WorldState, p: PlayerState): Change[] {
  const id = dungeonOfKey(p.area);
  if (!id) return [];
  const farm = farmOf(world);
  const h = hereOf(world, p);
  if (h) forget(h, p.id);
  const out: Change[] = [];
  const front = archFront(farm);
  placeIn(farm, p, 'farm', front.x, front.y, 'down', out);
  return out;
}

/** The tile in front of the färdport arch in the lobby, where a dungeon sends you back to. */
export function archFront(farm: WorldState): { x: number; y: number } {
  const arch = Object.values(farm.objects).find((o) => o.kind === 'fardport');
  return arch ? { x: arch.x + 1, y: arch.y + 2 } : { x: 15, y: 11 };
}

/** A player is no longer in the fight: monsters stop chasing them. */
function forget(h: Here, playerId: string): void {
  delete h.inst.fighters[playerId];
  for (const m of Object.values(h.inst.mobs)) {
    delete m.threat[playerId];
    if (m.target === playerId) delete m.target;
    if (m.tauntBy === playerId) delete m.tauntBy;
  }
}

/** Back online inside a dungeon (or the server restarted): up at the last rest stone, full health. */
export function rejoinSaga(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const id = p ? dungeonOfKey(p.area) : null;
  if (!p || !id) return [];
  const area = getArea(farm, p.area);
  if (!area?.saga || !p.saga?.cls) {
    // no class any more (or no dungeon): out in front of the arch
    const out: Change[] = [];
    const front = archFront(farm);
    placeIn(farm, p, 'farm', front.x, front.y, 'down', out);
    return out;
  }
  delete area.saga.fighters[p.id];
  return goInto(farm, p, id, sagaCheckpoint(area.saga));
}

/**
 * Development only (the server enables it with DEV_TELEPORT=1): puts a player straight into dungeon `id` from wherever
 * they are, the way its arch would, for a client that cannot walk to the arch yet (the native client has no world map
 * yet). A player without a class becomes a Krigare first, exactly as Kämpastenen would make them one. The dungeon
 * comes from the normal path (getArea → generateSaga), so it is the real thing: monsters, gate, rest stones, chests.
 */
export function devEnterSaga(world: WorldState, playerId: string, id: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !isDungeonId(id) || p.area === 'dungeon' || p.sleeping) return [];
  const out: Change[] = [];
  if (!p.saga?.cls) out.push(...chooseClass(farm, playerId, 'krigare'));
  const leaving = hereOf(world, p);
  if (leaving && leaving.key !== sagaKey(id)) forget(leaving, p.id);
  out.push(...goInto(farm, p, id, null));
  return out;
}

/**
 * Development only (DEV_TELEPORT=1, `dev unlock`): every dungeon but the last counts as cleared, so a check can walk to the
 * arch of a later chapter and go in by the arch's own rules (the class and the chapter lock stay; only the clearing is skipped).
 * Nothing for a player without a class.
 */
export function devUnlockChapters(world: WorldState, playerId: string): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p?.saga?.cls) return [];
  for (const id of DUNGEON_IDS.slice(0, -1)) if (!p.saga.cleared.includes(id)) p.saga.cleared.push(id);
  return [playerChange(p)];
}

/** Moves a player within the map they are on (blink, charge, getting up, a boss's pull): the client jumps there too. */
function warp(h: Here | string, p: PlayerState, tx: number, ty: number, out: Change[], exact?: { x: number; y: number }): void {
  p.x = exact?.x ?? px(tx);
  p.y = exact?.y ?? px(ty);
  p.moving = false;
  p.moveLock = 6;
  out.push({ t: 'warp', id: p.id, x: p.x, y: p.y, area: typeof h === 'string' ? h : h.key }, playerChange(p));
}

// ---------------------------------------------------------------------------
// Out in the world: the arches, Kämpastenen, Völvan and the villagers
// ---------------------------------------------------------------------------

/** Kämpastenen: picks (or changes) a class. The class's clothes go to the wardrobe and are put on. */
export function chooseClass(world: WorldState, playerId: string, cls: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !isClassId(cls)) return [];
  if (isSagaKey(p.area)) return [toast(p.id, T.sagaClassChange)];
  const prog = progressOf(p);
  const first = !prog.cls;
  prog.cls = cls;
  ensureGear(p);
  const c = CLASSES[cls];
  for (const piece of [c.outfit.hat, c.outfit.shirt]) if (!p.wardrobe.includes(piece)) p.wardrobe.push(piece);
  p.outfit = { ...p.outfit, hat: c.outfit.hat, shirt: c.outfit.shirt };
  syncLooks(p); // (the looks of the new class)
  const out: Change[] = [toast(p.id, fmt(T.sagaClassChosen, { cls: c.name })), fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle')];
  if (first) {
    // every new hero gets a few healing potions to start with
    giveItems(farm, p, 'healing_potion', FIRST_POTIONS, out);
    bump(p, 'sagaClass', 1, out);
  }
  out.push(playerChange(p));
  return out;
}

const FIRST_POTIONS = 3;

const nearNpc = (farm: WorldState, p: PlayerState, npcId: string): boolean => {
  const n = NPCS[npcId];
  if (!n || (n.area ?? 'farm') !== p.area) return false;
  const area = p.area === 'farm' ? farm : farm.areas?.[p.area];
  if (!area) return false;
  const st = npcState(area, npcId);
  return Math.hypot(st.x - p.x, st.y - p.y) <= 4 * TILE;
};

/** Is the goal of the chapter Völvan has told done? Every part of it: the task out in the world and the dungeon. */
export const chapterDone = (prog: SagaProgress): boolean => {
  const ch = SAGA_CHAPTERS[prog.chapter];
  if (!ch) return false;
  if (!ch.dungeon) return !!prog.cls;
  return prog.cleared.includes(ch.dungeon);
};

/** Talking to Völvan: hear the next chapter, or hand in the one you have done. */
export function sagaChapter(world: WorldState, playerId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !nearNpc(farm, p, VOLVA_ID)) return [];
  const prog = progressOf(p);
  const ch = SAGA_CHAPTERS[prog.chapter];
  if (!ch) return [toast(p.id, T.sagaAllDone)];
  const out: Change[] = [];
  if (!prog.heard) {
    prog.heard = true;
    out.push({ t: 'banner', to: p.id, text: prog.chapter === 0 ? ch.title : fmt(T.sagaChapter, { n: prog.chapter, title: ch.title }), sub: ch.goal, kind: 'chapter' }, playerChange(p));
    return out;
  }
  if (!chapterDone(prog)) return [toast(p.id, ch.goal)];
  const r = ch.reward;
  p.stars += r.stars;
  if (r.item) giveItems(farm, p, r.item, 1, out);
  if (r.title && !prog.titles.includes(r.title)) {
    prog.titles.push(r.title);
    out.push(toast(p.id, fmt(T.sagaTitle, { title: r.title })));
  }
  if (prog.chapter === SAGA_CHAPTERS.length - 1) bump(p, 'sagaAct2', 1, out);
  prog.chapter++;
  prog.heard = false;
  giveXp(p, SAGA_XP.chapter, out);
  out.push({ t: 'banner', to: p.id, kind: 'reward', text: fmt(T.sagaChapterDone, { title: ch.title }), sub: `+${r.stars} ⭐${r.item ? ` · ${itemName(r.item)}` : ''}` }, fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle'), playerChange(p));
  return out;
}

/** Where a villager's quest stands for a player. */
export function questState(p: PlayerState | undefined, q: SagaQuest): 'locked' | 'offer' | 'active' | 'ready' | 'done' {
  const prog = readProgress(p);
  if (prog.done.includes(q.id)) return 'done';
  const have = prog.quests[q.id];
  if (have !== undefined) return questCount(p!, q) >= q.count ? 'ready' : 'active';
  const ch = DUNGEONS[q.dungeon].chapter;
  return prog.cleared.includes(q.dungeon) || prog.chapter > ch || (prog.chapter === ch && prog.heard) ? 'offer' : 'locked';
}
/** How far a player has got with a quest (collect quests count what is in the bag). */
export const questCount = (p: PlayerState, q: SagaQuest): number => (q.kind === 'collect' ? countItem(p.inventory, q.target) : (p.saga?.quests[q.id] ?? 0));

/** A villager's quest: take it, or hand it in when it is done. */
export function sagaQuestAct(world: WorldState, playerId: string, questId: string): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  const q = sagaQuest(questId);
  if (!p || !q || !nearNpc(farm, p, q.npc)) return [];
  const prog = progressOf(p);
  const st = questState(p, q);
  if (st === 'offer') {
    prog.quests[q.id] = 0;
    return [toast(p.id, fmt(T.sagaQuestTaken, { title: q.title })), playerChange(p)];
  }
  if (st !== 'ready') return st === 'active' ? [toast(p.id, fmt(T.sagaQuestProgress, { goal: q.goal, n: questCount(p, q), count: q.count }))] : [];
  if (q.kind === 'collect' && !removeItem(p.inventory, q.target, q.count)) return [];
  delete prog.quests[q.id];
  prog.done.push(q.id);
  const out: Change[] = [];
  p.stars += q.reward.stars;
  if (q.reward.item) giveItems(farm, p, q.reward.item, q.reward.count ?? 1, out);
  bump(p, 'sagaQuests', 1, out);
  giveXp(p, SAGA_XP.quest, out);
  out.push(toast(p.id, fmt(T.sagaQuestDone, { title: q.title })), fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle'), playerChange(p));
  return out;
}

// ---------------------------------------------------------------------------
// Acting inside a dungeon: the way out, chests, rest stones, potions
// ---------------------------------------------------------------------------

/** Pressing the action button inside a dungeon. Farm tools do nothing in here. */
export function sagaAct(world: WorldState, p: PlayerState, tx: number, ty: number, ctx: SimCtx): Change[] {
  const h = hereOf(world, p);
  if (!h) return [];
  const obj = objectAt(h.area, tx, ty);
  if (obj?.kind === 'saga_exit') return leaveSaga(world, p);
  if (obj?.kind === 'run_exit') return runHooks.exit?.(world, p, obj, ctx) ?? [];
  if (obj?.kind === 'saga_chest') return openChest(h, p, obj, ctx);
  if (obj?.kind === 'saga_rest') return [toast(p.id, T.sagaRestHint)];
  if (obj?.kind === 'saga_gate' && h.inst.puzzleGate.some((g) => g.x === obj.x && g.y === obj.y)) return [toast(p.id, T.sagaPuzzleShut)];
  if (obj?.kind === 'saga_plate' && !h.inst.puzzleOpen) return [toast(p.id, T.sagaPlatesHint)];
  if (p.inventory[p.selected]?.item === 'healing_potion') return drinkPotion(world, p.id, ctx);
  if (p.inventory[p.selected]?.item === STRENGTH_POTION) return drinkStrength(world, p.id, ctx);
  // nothing to use: the use key (E, space, the ✋ button, a tap next to you) swings your everyday attack at the
  // nearest monster in reach, quietly when there is none (the key is pressed a lot while walking about)
  const f = h.inst.fighters[p.id];
  if (f) return castSpell(world, p.id, attackSpellOf(f.cls), undefined, ctx, { quiet: true });
  return [];
}

const POTION_HEAL = 0.6;
/** Time between two healing potions (the client's potion button shows it too). */
export const POTION_CD = 15_000;

/** Drinks a healing potion (the potion button, or pressing action with one in hand). */
export function drinkPotion(world: WorldState, playerId: string, ctx: SimCtx): Change[] {
  const p = farmOf(world).players[playerId];
  const h = p ? hereOf(world, p) : null;
  const f = h && p ? h.inst.fighters[p.id] : undefined;
  if (!p || !h || !f || f.down !== undefined || f.frozen !== undefined) return [];
  if (ctx.now < (f.potionAt ?? 0)) return [toast(p.id, T.sagaNotReady)];
  if (!removeItem(p.inventory, 'healing_potion', 1)) return [toast(p.id, T.sagaNoPotion)];
  f.potionAt = ctx.now + POTION_CD;
  const out: Change[] = [];
  heal(h, p, f, f.max * (POTION_HEAL + buffsOf(h, p.id).potion), out);
  out.push(spellFx(h, p.id, 'potion', p), playerChange(p));
  return out;
}

/** The strength potion (Styrkedryck): a quarter more power for a little while, in a dungeon or out in the world. */
export const STRENGTH_POTION = 'styrkedryck';
const STRENGTH_MS = 20_000;
const STRENGTH_MUL = 1.25;

export function drinkStrength(world: WorldState, playerId: string, ctx: SimCtx): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p || !p.saga?.cls) return [];
  const h = hereOf(world, p);
  const f = h ? h.inst.fighters[p.id] : undefined;
  if (h && (!f || f.down !== undefined || f.frozen !== undefined)) return [];
  if (!h) return [];
  if (!removeItem(p.inventory, STRENGTH_POTION, 1)) return [toast(p.id, T.sagaNoStrength)];
  const until = ctx.now + STRENGTH_MS;
  if (f) f.strong = until;
  return [spellFx(h ?? p.area, p.id, 'strength', p), toast(p.id, T.sagaStrength), playerChange(p)];
}

/** Opens a chest: everyone gets their own loot from it once. */
function openChest(h: Here, p: PlayerState, chest: WorldObject, ctx: SimCtx): Change[] {
  // the hired companion of a run never takes loot
  if (p.bot) return [];
  const looted = (h.inst.looted[chest.id] ??= []);
  if (looted.includes(p.id)) return [toast(p.id, T.sagaLooted)];
  const d = DUNGEONS[h.inst.id];
  const kind = chest.variant ?? 0;
  if (kind === 0) {
    // the side room's treasure is guarded
    const guard = Object.values(h.inst.mobs).some((m) => m.kind === 'mob' && h.area.animals[m.id] && dist(h.area.animals[m.id]!, { x: px(chest.x), y: px(chest.y) }) < 7);
    if (guard) return [toast(p.id, T.sagaChestGuarded)];
  }
  const species = kind === 1 ? d.mini : d.boss;
  const table = kind === 0 ? SAGA_TREASURE[h.inst.id] : SAGA_LOOT[species];
  if (!table) return [];
  looted.push(p.id);
  const out: Change[] = [];
  if (kind === 0) {
    rollLoot(h, p, table, T.sagaTreasureName, ctx, out);
    return out;
  }
  // a boss's chest gives its full loot once a game day per player; after that the same day, the replay chest
  const prog = progressOf(p);
  const days = (prog.chestDay ??= {});
  const today = h.farm.day;
  if (days[species] === today) replayChest(h, p, table, SAGA_BOSSES[species]!.name, ctx, out);
  else {
    days[species] = today;
    rollLoot(h, p, table, SAGA_BOSSES[species]!.name, ctx, out);
  }
  return out;
}

/** The smaller chest of a boss already looted today: a healing potion, no stars. */
function replayChest(h: Here, p: PlayerState, table: SagaLoot, from: string, ctx: SimCtx, out: Change[]): void {
  const items = [{ item: 'healing_potion', count: 1 }];
  for (const it of items) giveItems(h.area, p, it.item, it.count, out);
  bump(p, 'loot', 1, out);
  out.push({ t: 'loot', to: p.id, from, items, stars: 0, replay: true }, playerChange(p));
}

/** How many steps up from common a piece of gear is (a level's loot bonus adds weight per step). */
const RARITY_STEP: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

/** Things that come once each (clothes, weapons, offhands, amulets, pets, mounts), so the same one does not come twice while there are new ones. */
const unique = (id: string): boolean => {
  const k = sagaItem(id)?.kind;
  return k === 'weapon' || k === 'offhand' || k === 'amulet' || k === 'hat' || k === 'shirt' || k === 'pet' || k === 'mount';
};

function rollLoot(h: Here, p: PlayerState, table: SagaLoot, from: string, ctx: SimCtx, out: Change[], extra: { item: string; count: number }[] = []): void {
  const prog = progressOf(p);
  const items: { item: string; count: number }[] = [];
  const fresh = table.gear.filter((g) => !unique(g.item) || !prog.found.includes(g.item));
  const pool = fresh.length ? fresh : table.gear;
  const total = pool.reduce((n, g) => n + g.weight, 0);
  const rank = h.inst.run?.lootRank ?? 0;
  const wt = (g: { item: string; weight: number }): number => g.weight * (1 + rank * RARITY_STEP[sagaItem(g.item)?.rarity ?? 'common']!);
  const sum = pool.reduce((n, g) => n + wt(g), 0);
  let r = ctx.rnd() * (rank ? sum : total);
  let pick = pool[0]!;
  for (const g of pool) {
    r -= rank ? wt(g) : g.weight;
    if (r <= 0) {
      pick = g;
      break;
    }
  }
  items.push({ item: pick.item, count: pick.item === 'healing_potion' ? 2 : 1 });
  for (const rare of table.rare ?? []) if (!prog.found.includes(rare.item) && ctx.rnd() < rare.chance * (h.inst.run?.lootRare ?? 1)) items.push({ item: rare.item, count: 1 });
  for (const pet of rollPetDrops(h.farm, p, from, h.inst.run?.lootRare ?? 1, ctx.rnd, out)) items.push({ item: pet, count: 1 }); // (pets.ts: kept by the player, never twice)
  items.push(...extra);
  p.stars += table.stars;
  for (const it of items) {
    if (unique(it.item) && prog.found.includes(it.item) && !fresh.length) {
      // everything here is found already: a potion instead of a second copy
      it.item = 'healing_potion';
      it.count = 2;
    }
    if (unique(it.item)) prog.found.push(it.item);
    if (ITEMS[it.item]?.category === 'clothing') {
      if (!p.wardrobe.includes(it.item)) p.wardrobe.push(it.item);
    } else giveItems(h.area, p, it.item, it.count, out);
  }
  bump(p, 'loot', 1, out);
  out.push({ t: 'loot', to: p.id, from, items, stars: table.stars }, playerChange(p));
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

/** Every hero's spells are equally strong (a strength potion adds to that, while it lasts). */
const spellPower = (p: PlayerState, strongUntil: number | undefined, now: number): number => fightStats(p).power * (strongUntil !== undefined && now < strongUntil ? STRENGTH_MUL : 1);

const CRIT_CHANCE = 0.12;
const RAGE_LEECH = 0.3;
/** Sköldmur also gives back a little health. */
const WALL_HEAL = 0.15;

/** Can a player stand with the middle of their body here (no corner of it in a wall)? Blink and charge land only where it fits. */
const bodyFits = (area: WorldState, x: number, y: number): boolean => ![-1, 1].some((sx) => [-1, 1].some((sy) => isSolidForPlayer(area, tileOf(x + sx * PLAYER_HALF_W), tileOf(y + sy * PLAYER_HALF_H))));

/** A monster a spell can hit: in a fight or waiting (not on its way home), close enough, in sight for ranged spells. */
function pickMob(h: Here, p: PlayerState, f: SagaFighter, range: number, wanted: number | undefined, sight: boolean): SagaMob | null {
  const ok = (m: SagaMob | undefined): m is SagaMob => {
    if (!m || m.state === 'home') return false;
    const a = h.area.animals[m.id];
    return !!a && dist(a, p) <= range + 0.6 && (!sight || lineOfSight(h.area, p.x, p.y, a.x, a.y));
  };
  for (const id of [wanted, f.target]) {
    const m = id !== undefined ? h.inst.mobs[id] : undefined;
    if (ok(m)) return m;
  }
  let best: SagaMob | null = null;
  let bestD = Infinity;
  for (const m of Object.values(h.inst.mobs)) {
    if (!ok(m)) continue;
    // monsters already fighting come first, then the closest
    const d = dist(h.area.animals[m.id]!, p) - (m.state === 'fight' ? 100 : 0);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** A friend a heal can reach: the one asked for, else whoever is hurt worst (yourself too). */
function pickFriend(h: Here, p: PlayerState, range: number, wanted: string | undefined, down: boolean): PlayerState | null {
  const party = partyOf(h);
  const ok = (q: PlayerState | undefined): q is PlayerState => {
    const f = q ? h.inst.fighters[q.id] : undefined;
    return !!q && !!f && (f.down !== undefined) === down && dist(q, p) <= range + 0.6;
  };
  const asked = wanted ? party.find((q) => q.id === wanted) : undefined;
  if (ok(asked) && (down || h.inst.fighters[asked.id]!.hp < h.inst.fighters[asked.id]!.max)) return asked;
  let best: PlayerState | null = null;
  let worst = down ? Infinity : 0.999;
  for (const q of party) {
    if (!ok(q)) continue;
    const f = h.inst.fighters[q.id]!;
    const v = down ? dist(q, p) : f.hp / f.max;
    if (v < worst) {
      worst = v;
      best = q;
    }
  }
  return best;
}

/**
 * Casts one of the player's spells at `target` (a monster's animal id or a friend's player id; left out, the server
 * picks). `quiet`: no toast when nothing is in reach.
 */
export function castSpell(world: WorldState, playerId: string, spellId: string, target: number | string | undefined, ctx: SimCtx, opts: { quiet?: boolean } = {}): Change[] {
  const p = farmOf(world).players[playerId];
  const h = p ? hereOf(world, p) : null;
  const f = h && p ? h.inst.fighters[p.id] : undefined;
  const sp = SPELLS[spellId];
  // out in the world in hero mode, the same spells work on Loke's roaming servants
  if (!p || !h || !f || !sp || !CLASSES[f.cls].spells.includes(spellId)) return [];
  const now = ctx.now;
  if (f.down !== undefined || f.frozen !== undefined || now < f.gcd || now < (f.cd[spellId] ?? 0)) return [];
  const out: Change[] = [];
  const rb = buffsOf(h, p.id);
  // the hero's path (paths.ts): what it changes in this spell, and the berserk trait below half health
  const mod: SpellMod = rb.mods[spellId] ?? {};
  const berserk = rb.traits.low && f.hp < f.max * 0.5 ? rb.traits.low : 0;
  const reach = sp.range + (mod.range ?? 0);
  const radius = (sp.radius ?? 0) + (mod.radius ?? 0);
  const gear = spellPower(p, f.strong, now) * (1 + rb.power + (rb.spell[spellId] ?? 0) + (mod.power ?? 0) + berserk) * (f.howl && now < f.howl.until ? 1 + f.howl.mul : 1);
  const power = (base: number): { n: number; crit: boolean } => {
    const crit = ctx.rnd() < CRIT_CHANCE + rb.crit;
    return { n: base * gear * (f.rage !== undefined && now < f.rage ? 1.5 : 1) * (crit ? 1.5 : 1), crit };
  };
  const raging = f.rage !== undefined && now < f.rage;
  const strike = (m: SagaMob, base: number, extras = true): void => {
    const pw = power(base);
    hurtMob(h, m, p.id, pw.n, (sp.threat ?? 1) * (1 + rb.threat), pw.crit, ctx, out);
    // a raging berserker heals a little from every blow
    if (raging) heal(h, p, f, pw.n * RAGE_LEECH, out);
    if (rb.leech) heal(h, p, f, pw.n * rb.leech, out);
    // a path's added effects: burning, slowing, a freeze, and lightning that jumps on
    const live = h.inst.mobs[m.id];
    if (live && mod.burn) live.burn = { until: now + BURN_MS, per: (pw.n * mod.burn) / (BURN_MS / 1000), next: now + 1000, by: p.id };
    if (live && mod.slow) live.slowUntil = Math.max(live.slowUntil ?? 0, now + mod.slow);
    if (live && mod.stun) stun(h, live, mod.stun, now, out);
    if (extras && mod.chain && live) {
      const at = mobAt(live);
      const near = mobsNear(h, at, 3)
        .filter((o) => o.id !== m.id)
        .sort((a, b) => dist(mobAt(a), at) - dist(mobAt(b), at))
        .slice(0, mod.chain);
      for (const o of near) {
        out.push(spellFx(h, p.id, sp.id, at, mobAt(o), o.id));
        strike(o, base * 0.4, false);
      }
    }
  };
  const mobAt = (m: SagaMob): { x: number; y: number } => h.area.animals[m.id] ?? m.home;
  const noTarget = (): Change[] => (opts.quiet ? [] : [toast(p.id, T.sagaNoTarget)]);
  const wantMob = typeof target === 'number' ? target : undefined;
  const wantFriend = typeof target === 'string' ? target : undefined;
  switch (sp.kind) {
    case 'melee':
    case 'bolt':
    case 'lance':
    case 'bash': {
      const m = pickMob(h, p, f, reach, wantMob, sp.kind === 'bolt' || sp.kind === 'lance');
      if (!m) return noTarget();
      f.target = m.id;
      out.push(spellFx(h, p.id, sp.id, p, mobAt(m), m.id));
      strike(m, sp.power);
      if (sp.kind === 'lance' && h.inst.mobs[m.id]) {
        m.slowUntil = now + (sp.ms ?? 3000) + (mod.ms ?? 0);
        // the ice also stops a boss's big attack
        if (m.cast) stun(h, m, 0, now, out);
      }
      if (sp.kind === 'bash' && h.inst.mobs[m.id]) stun(h, m, (sp.ms ?? 1500) + (mod.ms ?? 0), now, out);
      break;
    }
    case 'charge': {
      const m = pickMob(h, p, f, reach, wantMob, true);
      if (!m) return noTarget();
      f.target = m.id;
      const a = mobAt(m);
      const d = Math.max(1, Math.hypot(p.x - a.x, p.y - a.y));
      const to = { x: a.x + ((p.x - a.x) / d) * TILE, y: a.y + ((p.y - a.y) / d) * TILE };
      const from = { x: p.x, y: p.y };
      if (bodyFits(h.area, to.x, to.y)) warp(h, p, 0, 0, out, to);
      out.push(spellFx(h, p.id, sp.id, from, a, m.id));
      strike(m, sp.power);
      if (h.inst.mobs[m.id]) stun(h, m, (sp.ms ?? 1000) + (mod.ms ?? 0), now, out);
      break;
    }
    case 'storm': {
      const m = pickMob(h, p, f, reach, wantMob, true);
      if (!m) return noTarget();
      f.target = m.id;
      const at = { ...mobAt(m) };
      out.push(spellFx(h, p.id, sp.id, p, at));
      for (const o of mobsNear(h, at, radius || 2)) strike(o, sp.power, false);
      break;
    }
    case 'whirl': {
      out.push(spellFx(h, p.id, sp.id, p));
      for (const o of mobsNear(h, p, radius || 2)) strike(o, sp.power, false);
      break;
    }
    case 'taunt': {
      out.push(spellFx(h, p.id, sp.id, p));
      for (const m of mobsNear(h, p, radius || 5)) {
        if (m.state === 'idle') pull(h, m, p.id, now, out);
        const top = Math.max(0, ...Object.values(m.threat));
        m.threat[p.id] = top * 1.2 + 20;
        m.tauntBy = p.id;
        m.tauntUntil = now + (sp.ms ?? 4000) + (mod.ms ?? 0);
        m.target = p.id;
        // a taunt that hurts (the Hämnare)
        if (mod.base) strike(m, mod.base, false);
      }
      break;
    }
    case 'heal': {
      const q = pickFriend(h, p, reach, wantFriend, false);
      if (!q) return [toast(p.id, T.sagaAllWell)];
      out.push(spellFx(h, p.id, sp.id, p, q, q.id));
      const pw = power(sp.power);
      heal(h, q, h.inst.fighters[q.id]!, pw.n * (1 + rb.heal), out, pw.crit);
      healThreat(h, p.id, pw.n);
      if (mod.hot) giveHot(h.inst.fighters[q.id]!, now, (pw.n * (1 + rb.heal) * mod.hot) / 4);
      break;
    }
    case 'hot': {
      out.push(spellFx(h, p.id, sp.id, p));
      const ms = (sp.ms ?? 6000) + (mod.ms ?? 0);
      for (const q of partyOf(h)) {
        const qf = h.inst.fighters[q.id]!;
        if (qf.down === undefined && dist(q, p) <= (radius || 4)) qf.hot = { until: now + ms, per: (sp.power * gear * (1 + rb.heal)) / (ms / 1000) };
      }
      healThreat(h, p.id, sp.power / 2);
      break;
    }
    case 'revive': {
      const q = pickFriend(h, p, reach, wantFriend, true);
      if (!q) return [toast(p.id, T.sagaNoneDown)];
      const qf = h.inst.fighters[q.id]!;
      delete qf.down;
      qf.hp = Math.max(1, Math.round(qf.max * ((sp.power + (mod.base ?? 0)) / 100 + rb.reviveHp)));
      if (mod.hot) giveHot(qf, now, (qf.hp * mod.hot) / 4);
      qf.fightAt = now;
      out.push(spellFx(h, p.id, sp.id, p, q, q.id), hit(h, q.id, qf.hp, 'heal'), playerChange(q));
      toEveryone(h, out, fmt(T.sagaUp, { name: q.name }));
      break;
    }
    case 'wall':
      f.wall = now + (sp.ms ?? 6000) + (mod.ms ?? 0);
      out.push(spellFx(h, p.id, sp.id, p));
      heal(h, p, f, f.max * WALL_HEAL, out);
      break;
    case 'rage':
      f.rage = now + Math.max(2000, (sp.ms ?? 8000) + (mod.ms ?? 0));
      p.boostUntil = f.rage;
      out.push(spellFx(h, p.id, sp.id, p), playerChange(p));
      break;
    case 'blink': {
      const dir = p.facing === 'left' ? [-1, 0] : p.facing === 'right' ? [1, 0] : p.facing === 'up' ? [0, -1] : [0, 1];
      let to = { x: p.x, y: p.y };
      for (let s = 0.5; s <= reach; s += 0.5) {
        const nx = p.x + dir[0]! * s * TILE;
        const ny = p.y + dir[1]! * s * TILE;
        // the whole body must fit (a spot whose middle is free but whose edge is in the wall would trap the player)
        if (!bodyFits(h.area, nx, ny)) break;
        to = { x: nx, y: ny };
      }
      out.push(spellFx(h, p.id, sp.id, p, to));
      warp(h, p, 0, 0, out, to);
      break;
    }
  }
  // a path's shields: for the caster, and for the friends near
  if (mod.shield) giveShield(f, mod.shield, now);
  if (mod.partyShield)
    for (const q of partyOf(h)) {
      const qf = h.inst.fighters[q.id];
      if (qf && qf.down === undefined && dist(q, p) <= 5) giveShield(qf, mod.partyShield, now);
    }
  f.gcd = now + GCD_MS;
  // (berserk: half as much faster cooldowns below half health)
  f.cd[spellId] = now + cdOf(rb, spellId, sp.cd) * (1 - berserk / 2);
  if (inFight(h)) f.fightAt = now;
  return out;
}

/** A shield of `frac` of the fighter's max health (never above SHIELD_CAP of it), for SHIELD_MS. */
function giveShield(f: SagaFighter, frac: number, now: number): void {
  const cap = f.max * SHIELD_CAP;
  f.shield = { hp: Math.min(cap, (f.shield && now < f.shield.until ? f.shield.hp : 0) + f.max * frac), until: now + SHIELD_MS };
}

/** A heal over time from a path: the stronger of what the fighter has and this. */
function giveHot(f: SagaFighter, now: number, per: number): void {
  if (!f.hot || now >= f.hot.until || f.hot.per < per) f.hot = { until: now + 4000, per };
}

const mobsNear = (h: Here, at: { x: number; y: number }, r: number): SagaMob[] =>
  Object.values(h.inst.mobs).filter((m) => m.state !== 'home' && h.area.animals[m.id] && dist(h.area.animals[m.id]!, at) <= r + 0.4);

/** Healing makes the monsters in the fight a little cross with the healer. */
function healThreat(h: Here, by: string, amount: number): void {
  const fighting = Object.values(h.inst.mobs).filter((m) => m.state === 'fight');
  for (const m of fighting) m.threat[by] = (m.threat[by] ?? 0) + (amount * 0.5) / fighting.length;
}

/** A stun: a monster stands dazed; a boss is only stopped in a big attack that can be stopped. */
export function stun(h: Here, m: SagaMob, ms: number, now: number, out: Change[]): void {
  if (m.kind === 'boss' || m.kind === 'mini') {
    const move = m.cast ? SAGA_BOSSES[m.species]?.moves[m.cast.move] : undefined;
    if (!move?.interrupt) return;
    for (const id of m.cast!.zones) dropZone(h, id, out);
    delete m.cast;
    out.push(hit(h, m.id, 0, 'kick'));
    toEveryone(h, out, fmt(T.sagaInterrupt, { move: move.name }));
    return;
  }
  m.stunUntil = now + ms;
  out.push(hit(h, m.id, 0, 'stun'));
}

const inFight = (h: Here): boolean => Object.values(h.inst.mobs).some((m) => m.state === 'fight');

// ---------------------------------------------------------------------------
// Damage, healing, falling and getting up
// ---------------------------------------------------------------------------

export function heal(h: Here, p: PlayerState, f: SagaFighter, amount: number, out: Change[], crit = false): void {
  if (f.down !== undefined) return;
  const before = f.hp;
  f.hp = Math.min(f.max, f.hp + Math.round(amount));
  if (f.hp > before || crit) out.push(hit(h, p.id, f.hp - before, crit ? 'crit' : 'heal'));
}

/** The särdrag that make a monster hit harder: Stormig (bosses), Stärkande (per fallen pack member) and Jakten (below a quarter health). */
function mobBoost(h: Here, by: SagaMob | null): number {
  const run = h.inst.run;
  if (!run || !by) return 1;
  let n = 1;
  if (run.bossDmg && (by.kind === 'boss' || by.kind === 'mini')) n *= run.bossDmg;
  if (run.grow && by.fallen) n *= 1 + run.grow * by.fallen;
  if (run.enrage && by.kind === 'mob' && by.hp < by.max * ENRAGE.below) n *= 1.15;
  return n;
}

/** The most damage a friend's aura (the Murvakt path) takes off a hit on `p`: heroes within 7 tiles. */
function auraAt(h: Here, p: PlayerState, now: number): number {
  let best = 0;
  for (const q of partyOf(h)) {
    const a = buffsOf(h, q.id).traits.aura;
    if (a && a > best && upright(h, q) && dist(q, p) <= 7) best = a;
  }
  void now;
  return best;
}

/** The Hämnare path: the monster that hit takes some of the blow back. */
function thorns(h: Here, p: PlayerState, amount: number, by: SagaMob | null, now: number, out: Change[]): void {
  const t = buffsOf(h, p.id).traits.thorns;
  if (!t || !by || !tickCtx || !h.inst.mobs[by.id]) return;
  void now;
  hurtMob(h, by, p.id, amount * t * (h.inst.run?.dmgMul ?? 1) + 1, 1, false, tickCtx, out);
}

/** The context of the tick being run (the thorns of a path need it to hurt a monster from inside a monster's blow). */
let tickCtx: SimCtx | null = null;

function hurtFighter(h: Here, p: PlayerState, amount: number, by: SagaMob | null, now: number, out: Change[]): void {
  const f = h.inst.fighters[p.id];
  // the ice that holds a frozen player keeps everything else out too
  if (!f || f.down !== undefined || f.frozen !== undefined) return;
  const rb = buffsOf(h, p.id);
  const armor = Math.min(0.6, fightStats(p).armor + rb.armor);
  let n = Math.max(1, Math.round(amount * mobDmgScale(partyOf(h).length) * (h.inst.run?.dmgMul ?? 1) * mobBoost(h, by) * (1 - armor) * (1 - Math.min(0.5, rb.taken)) * (f.wall !== undefined && now < f.wall ? 0.4 : 1)));
  // a path's Murvakt: friends near the hero (and the hero) take less
  const aura = auraAt(h, p, now);
  if (aura) n = Math.max(1, Math.round(n * (1 - aura)));
  n = Math.max(1, petSoak(h, p, n, now, out)); // a guarding pet takes a share
  // a path's shield takes the blow first
  if (f.shield && now < f.shield.until && f.shield.hp > 0) {
    const taken = Math.min(f.shield.hp, n);
    f.shield.hp -= taken;
    n -= taken;
    if (taken > 0) out.push(hit(h, p.id, taken, 'block'));
    if (n <= 0) {
      f.fightAt = now;
      thorns(h, p, amount, by, now, out);
      return;
    }
  }
  if (n >= f.hp && f.hp > f.max * 0.5 && n < f.max) n = f.hp - 1; // one hit from full health never knocks you down
  f.hp -= n;
  thorns(h, p, amount, by, now, out);
  f.fightAt = now;
  out.push(hit(h, p.id, n, f.wall !== undefined && now < f.wall ? 'block' : 'dmg'));
  if (f.hp > 0) return;
  f.hp = 0;
  f.down = now;
  delete f.hot;
  if (f.frozen !== undefined) melt(h, f.frozen, out);
  for (const m of Object.values(h.inst.mobs)) {
    delete m.threat[p.id];
    if (m.target === p.id) delete m.target;
  }
  toEveryone(h, out, fmt(T.sagaDown, { name: p.name }));
  if (by && (by.kind === 'boss' || by.kind === 'mini')) out.push(yell(h, by.species, SAGA_BOSSES[by.species]!.yells.kill));
  out.push(playerChange(p));
}

/** Gets a fallen player up at the last rest stone, with full health. */
function standUp(h: Here, p: PlayerState, now: number, out: Change[], hpFraction = 1): void {
  const f = h.inst.fighters[p.id];
  if (!f) return;
  delete f.down;
  delete f.frozen;
  f.hp = Math.max(1, Math.round(f.max * hpFraction));
  f.fightAt = now;
  const at = sagaCheckpoint(h.inst);
  const spot = openTileNear(h.area, at.x, at.y);
  warp(h, p, spot.x, spot.y, out);
  out.push(fxOn(h.key, spot.x, spot.y, 'sparkle'));
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

/** The party's size now (monsters get tougher with more players). */
const partySize = (h: Here): number => Math.max(1, partyOf(h).length);

/** Wakes a monster (and its whole group, or a boss): they all come for `by`. */
function pull(h: Here, m: SagaMob, by: string, now: number, out: Change[]): void {
  const group = m.pack >= 0 ? h.inst.packs[m.pack]!.members.map((id) => h.inst.mobs[id]).filter((x): x is SagaMob => !!x) : [m];
  const n = partySize(h);
  for (const g of group) {
    if (g.state === 'fight') continue;
    g.state = 'fight';
    g.threat[by] = Math.max(g.threat[by] ?? 0, 1);
    g.atkAt = now + 600;
    if (g.hp >= g.max && (g.kind === 'mob' || g.kind === 'boss' || g.kind === 'mini')) {
      // tougher the more of the family is here
      const base = SAGA_BOSSES[g.species]?.hp ?? SAGA_MOBS[g.species]?.hp ?? g.max;
      const run = h.inst.run;
      g.max = Math.round(base * (g.kind === 'mob' ? mobHpScale(n) * (run?.hpMul ?? 1) : bossHpScale(n) * (run?.bossMul ?? 1)));
      g.hp = g.max;
    }
    g.pulledAt = now;
    const boss = SAGA_BOSSES[g.species];
    if (boss) {
      g.phase = g.phase ?? 0;
      g.next = boss.moves.map((mv) => now + mv.first);
      out.push(yell(h, g.species, boss.yells.pull));
    }
  }
}

/** A monster loses health; at zero it is beaten. */
export function hurtMob(h: Here, m: SagaMob, by: string, amount: number, threatMul: number, crit: boolean, ctx: SimCtx, out: Change[]): void {
  if (!h.inst.mobs[m.id] || m.state === 'home') return;
  if (m.state === 'idle') pull(h, m, by, ctx.now, out);
  const n = Math.max(1, Math.round(m.mark && ctx.now < m.mark.until ? amount * (1 + m.mark.bonus) : amount)); // (a korp's mark)
  m.hp -= n;
  if (m.kind !== 'ice') m.threat[by] = (m.threat[by] ?? 0) + n * threatMul;
  const f = h.inst.fighters[by];
  if (f) f.fightAt = ctx.now;
  out.push(hit(h, m.id, n, crit ? 'crit' : 'dmg'));
  if (m.hp <= 0) {
    mobDown(h, m, by, ctx, out);
    return;
  }
  // a boss gets a new phase at each health mark: a shout and helpers
  const boss = SAGA_BOSSES[m.species];
  if (boss && m.phase !== undefined && m.phase < boss.phases.length && m.hp / m.max <= boss.phases[m.phase]!) {
    const line = boss.yells.phase[m.phase] ?? boss.yells.phase[0] ?? '';
    m.phase++;
    if (line) out.push(yell(h, m.species, line));
    const a = h.area.animals[m.id];
    if (boss.phaseAdds && a) {
      const party = partyOf(h).filter((p) => upright(h, p));
      const n = addCount(boss.phaseAdds.count, partySize(h));
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + ctx.rnd();
        const at = { x: a.x + Math.cos(ang) * 3 * TILE, y: a.y + Math.sin(ang) * 3 * TILE };
        const spot = isSolidForAnimal(h.area, tileOf(at.x), tileOf(at.y)) ? { x: a.x, y: a.y } : at;
        const add = spawnSagaMob(h.area, h.inst, boss.phaseAdds.species, spot.x, spot.y, 'add', -1);
        const am = h.inst.mobs[add.id]!;
        am.max = Math.round(am.max * mobHpScale(partySize(h)) * (h.inst.run?.levelHp ?? 1));
        am.hp = am.max;
        am.state = 'fight';
        am.atkAt = ctx.now + 800;
        const victim = party[Math.floor(ctx.rnd() * party.length)];
        if (victim) am.threat[victim.id] = 5;
        out.push({ t: 'animal', id: add.id, animal: add, area: h.key }, fxOn(h.key, tileOf(spot.x), tileOf(spot.y), 'poof'));
      }
    }
  }
}

/**
 * A monster is beaten (by `by`): quest credit for everyone there, now and then a Monsteressens for whoever beat a
 * dungeon monster, the gate opens after the mid-boss, a chest after a boss, and the family's best time after the last.
 */
function mobDown(h: Here, m: SagaMob, by: string, ctx: SimCtx, out: Change[]): void {
  const a = h.area.animals[m.id];
  delete h.inst.mobs[m.id];
  delete h.area.animals[m.id];
  const at = a ? { x: a.x, y: a.y } : m.home;
  out.push({ t: 'animal', id: m.id, animal: null, area: h.key }, fxOn(h.key, tileOf(at.x), tileOf(at.y), 'poof'));
  if (m.kind === 'ice') {
    freeFrom(h, m, out);
    return;
  }
  const party = partyOf(h);
  const xp = m.kind === 'boss' ? SAGA_XP.boss : m.kind === 'mini' ? SAGA_XP.mini : m.kind === 'add' ? SAGA_XP.add : SAGA_XP.mob;
  for (const p of party) {
    if (h.inst.fighters[p.id]?.target === m.id) delete h.inst.fighters[p.id]!.target;
    questCredit(h.area, p, m.species, ctx, out, true);
    bump(p, 'sagaMobs', 1, out);
    giveXp(p, xp, out, h);
  }
  if (m.pack >= 0) {
    const pack = h.inst.packs[m.pack]!;
    if (h.inst.run?.grow) for (const id of pack.members) if (id !== m.id && h.inst.mobs[id]) h.inst.mobs[id]!.fallen = (h.inst.mobs[id]!.fallen ?? 0) + 1;
    if (pack.members.every((id) => !h.inst.mobs[id])) pack.dead = true;
  }
  const boss = SAGA_BOSSES[m.species];
  if (!boss || (m.kind !== 'boss' && m.kind !== 'mini')) {
    for (const p of party) out.push(playerChange(p));
    return;
  }
  // the boss's helpers and attacks go with it
  for (const z of h.inst.zones.filter((z) => z.by === m.id)) dropZone(h, z.id, out);
  for (const add of Object.values(h.inst.mobs).filter((x) => x.kind === 'add' || x.kind === 'ice')) {
    if (add.kind === 'ice') freeFrom(h, add, out);
    delete h.inst.mobs[add.id];
    delete h.area.animals[add.id];
    out.push({ t: 'animal', id: add.id, animal: null, area: h.key });
  }
  out.push(yell(h, m.species, boss.yells.death));
  const tx = tileOf(at.x);
  const ty = tileOf(at.y);
  // the chest appears where the boss fell, but never on top of (or right next to) someone
  const clear = (x: number, y: number): boolean => !Object.values(h.area.players).some((p) => Math.abs(tileOf(p.x) - x) <= 1 && Math.abs(tileOf(p.y) - y) <= 1);
  let chest: WorldObject | null = null;
  for (let r = 0; r <= 4 && !chest; r++)
    for (let dy = -r; dy <= r && !chest; dy++)
      for (let dx = -r; dx <= r && !chest; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !clear(tx + dx, ty + dy)) continue;
        chest = addObject(h.area, 'saga_chest', tx + dx, ty + dy, { variant: m.kind === 'mini' ? 1 : 2 });
      }
  if (chest) out.push({ t: 'object', id: chest.id, obj: chest, area: h.key });
  const d = DUNGEONS[h.inst.id];
  if (m.kind === 'mini') {
    h.inst.miniDown = true;
    h.inst.gateOpen = true;
    for (const g of h.inst.gate) {
      const o = objectAt(h.area, g.x, g.y);
      if (o?.kind === 'saga_gate') {
        removeObject(h.area, o.id);
        out.push({ t: 'object', id: o.id, obj: null, area: h.key });
      }
    }
    for (const p of party) out.push({ t: 'banner', to: p.id, area: h.key, text: fmt(T.sagaBossDown, { boss: boss.name }), sub: T.sagaGateOpen, kind: 'boss' });
  } else {
    h.inst.bossDown = true;
    const names: string[] = [];
    for (const p of party) {
      // a run's chapter is cleared for its party by runsim.ts (offline members too); the hired companion has no record
      if (p.bot) continue;
      const prog = progressOf(p);
      if (!prog.cleared.includes(h.inst.id)) {
        prog.cleared.push(h.inst.id);
        giveClearPets(h.farm, p, h.inst.id, out);
        bump(p, CLEARED_STAT[h.inst.id], 1, out);
      }
      names.push(p.name);
      if (!h.inst.run) {
        // (a run's trophies and looks come with its win, at its level)
        awardTrophy(h.farm, p, d.boss, RUN_LEVEL_MEDEL, out);
        awardLooks(p, h.inst.id, RUN_LEVEL_MEDEL, lookRng(p, h.inst.id), out);
        awardPetLooks(h.farm, p, h.inst.id, RUN_LEVEL_MEDEL, out);
      }
      out.push({ t: 'banner', to: p.id, area: h.key, text: fmt(T.sagaBossDown, { boss: boss.name }), sub: h.inst.run ? RUN_T.winSub : fmt(T.sagaCleared, { dungeon: d.name }), kind: 'cleared' });
    }
    out.push(toast(null, fmt(T.sagaFamilyWin, { names: names.join(' och '), boss: boss.name })));
    // a run keeps its own records (the dungeon's best time is the dungeon's)
    if (!h.inst.run) bestTime(h, names, ctx.now, out);
  }
  for (const p of party) out.push(playerChange(p));
}

/** The family's best time through a dungeon: from the first one in to the boss's fall. A new best is told to everyone. */
function bestTime(h: Here, names: string[], now: number, out: Change[]): void {
  if (h.inst.startedAt === undefined || !names.length) return;
  recordBestTime(h.farm, h.inst.id, names, Math.max(0, now - h.inst.startedAt), out);
}

/** Keeps a time as the dungeon's best when it beats the old one (and tells everyone). */
function recordBestTime(farm: WorldState, id: DungeonId, names: string[], ms: number, out: Change[]): void {
  const all = (farm.sagaBest ??= {});
  const old = all[id];
  if (old && old.ms <= ms) return;
  const best: SagaBest = { ms, names: [...names], day: farm.day };
  all[id] = best;
  out.push({ t: 'sagaBest', dungeon: id, best });
  if (old) out.push(toast(null, fmt(T.sagaBestBeaten, { names: names.join(' och '), dungeon: DUNGEONS[id].name, time: fmtDuration(ms) })));
}

/**
 * Development only (DEV_TELEPORT=1): records `ms` as the family's time through dungeon `id`, by the player alone, through the same
 * path as a real clear (a faster time replaces the old one and is told, a slower one changes nothing), so a client check can show the
 * server's own `sagaBest` instead of a made-up one.
 */
export function devSagaBest(world: WorldState, playerId: string, id: string, ms: number): Change[] {
  const farm = farmOf(world);
  const p = farm.players[playerId];
  if (!p || !isDungeonId(id) || !Number.isFinite(ms) || ms < 0) return [];
  const out: Change[] = [];
  recordBestTime(farm, id, [p.name], Math.round(ms), out);
  return out;
}

/** Development only (`dev level`): gives the experience that makes the player hero level `level` (1..MAX_LEVEL), with the level-up banner and rewards. */
export function devHeroLevel(world: WorldState, playerId: string, level: number): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p || !Number.isFinite(level)) return [];
  const goal = XP_LEVELS[Math.max(1, Math.min(MAX_LEVEL, Math.round(level))) - 1]!;
  const out: Change[] = [];
  giveXp(p, Math.max(1, goal - (p.saga?.xp ?? 0)), out);
  return out;
}

/** The achievement stat for clearing each dungeon. */
export const CLEARED_STAT: Record<DungeonId, string> = { draug: 'sagaDraug', frost: 'sagaFrost', surt: 'sagaSurt', hel: 'sagaHel', dvarg: 'sagaDvarg', orm: 'sagaOrm', alv: 'sagaAlv', fenrir: 'sagaFenrir', loke: 'sagaLoke' };

/** Kill quests count the monster; collect quests may find what the villager wants on it (in a dungeon). */
function questCredit(area: WorldState, p: PlayerState, species: string, ctx: SimCtx, out: Change[], collect: boolean): void {
  const prog = p.saga;
  if (!prog) return;
  for (const q of SAGA_QUESTS) {
    if (prog.quests[q.id] === undefined) continue;
    if (q.kind === 'kill' && q.target === species && prog.quests[q.id]! < q.count) {
      prog.quests[q.id]!++;
      out.push(toast(p.id, fmt(T.sagaQuestProgress, { goal: q.goal, n: prog.quests[q.id]!, count: q.count })));
    }
    if (collect && q.kind === 'collect' && q.from?.includes(species) && countItem(p.inventory, q.target) < q.count && ctx.rnd() < (q.chance ?? 0.5)) {
      giveItems(area, p, q.target, 1, out);
      out.push(toast(p.id, fmt(T.sagaQuestProgress, { goal: q.goal, n: countItem(p.inventory, q.target), count: q.count })));
    }
  }
}

/** Sends a monster home: full health, no grudges. A boss also loses its helpers and its half-done attack. */
function resetMob(h: Here, m: SagaMob, out: Change[]): void {
  m.state = 'home';
  m.threat = {};
  m.hp = m.max;
  delete m.target;
  delete m.tauntBy;
  delete m.stunUntil;
  delete m.slowUntil;
  if (m.cast) for (const id of m.cast.zones) dropZone(h, id, out);
  delete m.cast;
  if (SAGA_BOSSES[m.species] && (m.kind === 'boss' || m.kind === 'mini')) {
    m.phase = 0;
    for (const z of h.inst.zones.filter((z) => z.by === m.id)) dropZone(h, z.id, out);
    for (const add of Object.values(h.inst.mobs).filter((x) => x.kind === 'add' || x.kind === 'ice')) {
      if (add.kind === 'ice') freeFrom(h, add, out);
      delete h.inst.mobs[add.id];
      delete h.area.animals[add.id];
      out.push({ t: 'animal', id: add.id, animal: null, area: h.key });
    }
  }
}

/** The ice around a frozen player breaks (or melts). */
function freeFrom(h: Here, ice: SagaMob, out: Change[]): void {
  const p = ice.holds ? h.farm.players[ice.holds] : undefined;
  const f = p ? h.inst.fighters[p.id] : undefined;
  if (p && f && f.frozen === ice.id) {
    delete f.frozen;
    out.push(playerChange(p));
  }
}
function melt(h: Here, iceId: number, out: Change[]): void {
  const ice = h.inst.mobs[iceId];
  if (!ice) return;
  delete h.inst.mobs[iceId];
  delete h.area.animals[iceId];
  out.push({ t: 'animal', id: iceId, animal: null, area: h.key });
  freeFrom(h, ice, out);
}

/** Who a monster goes for: whoever taunted it, else whoever it hates most (it only switches for a lot more). */
function chooseTarget(h: Here, m: SagaMob, now: number): PlayerState | null {
  const ok = (id: string | undefined): PlayerState | null => {
    const p = id ? h.farm.players[id] : undefined;
    return p && p.online && p.area === h.key && upright(h, p) ? p : null;
  };
  if (m.tauntBy && now < (m.tauntUntil ?? 0)) {
    const t = ok(m.tauntBy);
    if (t) return t;
  }
  const cur = ok(m.target);
  let best: PlayerState | null = null;
  let top = 0;
  for (const [id, v] of Object.entries(m.threat)) {
    const p = ok(id);
    if (p && v > top) {
      top = v;
      best = p;
    }
  }
  if (cur && best && best !== cur && top < (m.threat[cur.id] ?? 0) * 1.1) best = cur;
  m.target = best?.id;
  return best;
}

/** Steps along the floor towards the target, around corners when the way straight is blocked. */
function stepTowards(h: Here, m: SagaMob, a: { x: number; y: number; facing: string; moving: boolean }, goal: { x: number; y: number }, speed: number, dtMs: number, field: Int16Array | null): void {
  const step = (speed * dtMs) / 1000;
  let tx = goal.x;
  let ty = goal.y;
  if (field && !lineOfSight(h.area, a.x, a.y, goal.x, goal.y)) {
    // follow the distance field: the neighbouring tile closest to the target
    const cx = tileOf(a.x);
    const cy = tileOf(a.y);
    let best = field[tileIndex(h.area, cx, cy)] ?? -1;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx!;
      const ny = cy + dy!;
      if (!inBounds(h.area, nx, ny)) continue;
      const v = field[tileIndex(h.area, nx, ny)]!;
      if (v >= 0 && (best < 0 || v < best)) {
        best = v;
        tx = px(nx);
        ty = px(ny);
      }
    }
  }
  const dx = tx - a.x;
  const dy = ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) {
    a.moving = false;
    return;
  }
  const s = Math.min(step, d);
  const r = resolveMove((x, y) => isSolidForAnimal(h.area, x, y), a.x, a.y, a.x + (dx / d) * s, a.y + (dy / d) * s, MOB_HALF, MOB_HALF, h.area);
  a.moving = r.x !== a.x || r.y !== a.y;
  a.x = r.x;
  a.y = r.y;
  a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  void m;
}

/** How many steps every floor tile is from a player (to find the way around walls). */
function distanceField(h: Here, from: { x: number; y: number }): Int16Array {
  const W = mapW(h.area);
  const H = mapH(h.area);
  const field = new Int16Array(W * H).fill(-1);
  const start = tileIndex(h.area, tileOf(from.x), tileOf(from.y));
  field[start] = 0;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const k = q[i]!;
    const x = k % W;
    const y = Math.floor(k / W);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx!;
      const ny = y + dy!;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = tileIndex(h.area, nx, ny);
      if (field[j] !== -1 || isSolidForAnimal(h.area, nx, ny)) continue;
      field[j] = field[k]! + 1;
      if (field[j]! < 60) q.push(j);
    }
  }
  return field;
}

/** One monster's turn. */
function tickMob(h: Here, m: SagaMob, dtMs: number, ctx: SimCtx, fields: Map<string, Int16Array>, out: Change[]): void {
  const a = h.area.animals[m.id];
  if (!a) {
    delete h.inst.mobs[m.id];
    return;
  }
  const now = ctx.now;
  if (m.kind === 'ice') {
    a.moving = false;
    if (now >= (m.meltAt ?? Infinity)) melt(h, m.id, out);
    return;
  }
  const boss = SAGA_BOSSES[m.species];
  const def = SAGA_MOBS[m.species];
  const stats = boss ?? def;
  if (!stats) return;
  if (m.state === 'idle') {
    a.moving = false;
    const sight = (boss ? 5 : (def?.aggro ?? 4)) * (h.inst.run?.sight ?? 1);
    for (const p of partyOf(h)) {
      if (!upright(h, p) || dist(p, a) > sight || !lineOfSight(h.area, a.x, a.y, p.x, p.y)) continue;
      pull(h, m, p.id, now, out);
      break;
    }
    return;
  }
  if (m.state === 'home') {
    stepTowards(h, m, a, m.home, stats.speed * TILE * 1.6, dtMs, null);
    if (Math.hypot(a.x - m.home.x, a.y - m.home.y) < 3 || !a.moving) {
      a.x = m.home.x;
      a.y = m.home.y;
      a.moving = false;
      a.facing = 'down';
      m.state = 'idle';
      m.hp = m.max;
    }
    return;
  }
  // fighting: a monster dragged too far gives up; a boss keeps to its hall and gives up only when everyone has left it
  // the fog of a run (dimma) lets monsters in packs hold on longer; a boss keeps its hall as before
  const leash = LEASH_TILES + (m.kind === 'mob' ? (h.inst.run?.leash ?? 0) : 0);
  if (boss ? !partyOf(h).some((p) => upright(h, p) && dist(p, m.home) <= leash) : dist(a, m.home) > leash) {
    resetMob(h, m, out);
    return;
  }
  if (now < (m.stunUntil ?? 0)) {
    a.moving = false;
    return;
  }
  if (boss && m.cast) {
    a.moving = false;
    if (now >= m.cast.at) landCast(h, m, ctx, out);
    return;
  }
  const target = chooseTarget(h, m, now);
  if (!target) {
    resetMob(h, m, out);
    return;
  }
  if (boss && m.next && startCast(h, m, a, ctx, out)) return;
  const reach = stats.reach;
  const raged = !!h.inst.run?.enrage && m.kind === 'mob' && m.hp < m.max * ENRAGE.below;
  const d = dist(a, target);
  const ranged = reach > 2.5;
  const see = lineOfSight(h.area, a.x, a.y, target.x, target.y);
  if (d <= reach && (!ranged || see)) {
    a.moving = false;
    const dx = target.x - a.x;
    const dy = target.y - a.y;
    a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (now >= m.atkAt) {
      m.atkAt = now + stats.atkMs / (raged ? ENRAGE.rate : 1);
      if (ranged) out.push(spellFx(h, m.id, `mob_${m.species}`, a, target, target.id));
      else out.push(spellFx(h, m.id, 'claw', a, target, target.id));
      hurtFighter(h, target, stats.dmg, m, now, out);
      if (def?.slows) {
        const f = h.inst.fighters[target.id];
        if (f) f.slow = now + 2500;
      }
    }
    return;
  }
  const slow = now < (m.slowUntil ?? 0) ? 0.5 : 1;
  let field = fields.get(target.id);
  if (!field && !see) {
    field = distanceField(h, target);
    fields.set(target.id, field);
  }
  const was = { x: a.x, y: a.y };
  stepTowards(h, m, a, target, stats.speed * TILE * slow * (raged ? ENRAGE.speed : 1), dtMs, field ?? null);
  if (boss && dist(a, m.home) > BOSS_HALL && dist(a, m.home) > dist(was, m.home)) {
    // a boss stops at the edge of its hall
    a.x = was.x;
    a.y = was.y;
    a.moving = false;
  }
}

/** How far from its place a boss follows anyone (tiles). */
const BOSS_HALL = 11;

// ---------------------------------------------------------------------------
// Boss attacks: marked on the ground, then they land
// ---------------------------------------------------------------------------

function addZone(h: Here, m: SagaMob, z: Omit<SagaZone, 'id' | 'by'>, out: Change[]): string {
  const zone: SagaZone = { ...z, id: `${h.inst.id}${h.inst.seq++}`, by: m.id };
  h.inst.zones.push(zone);
  out.push({ t: 'zone', area: h.key, id: zone.id, zone });
  return zone.id;
}
function dropZone(h: Here, id: string, out: Change[]): void {
  const i = h.inst.zones.findIndex((z) => z.id === id);
  if (i < 0) return;
  h.inst.zones.splice(i, 1);
  out.push({ t: 'zone', area: h.key, id, zone: null });
}

/** Starts the next ready attack, if any. True if the boss is now busy with it. */
function startCast(h: Here, m: SagaMob, a: { x: number; y: number; facing: string }, ctx: SimCtx, out: Change[]): boolean {
  const boss = SAGA_BOSSES[m.species]!;
  const now = ctx.now;
  const unlocked = h.inst.run?.moves;
  const i = boss.moves.findIndex((mv, k) => (mv.phase ?? 0) <= (m.phase ?? 0) && now >= m.next![k]! && (!unlocked || unlocked.includes(k)));
  if (i < 0) return false;
  const mv = boss.moves[i]!;
  // Lätt: the warning lasts longer (the zones, the cast and the snapshot all use this)
  const warn = Math.round(mv.warn * (h.inst.run?.warnMul ?? 1));
  m.next![i] = now + mv.every + warn;
  const party = partyOf(h).filter((p) => upright(h, p));
  // the ice prison needs a friend to break it: never on someone alone
  if (!party.length || (mv.move === 'freeze' && party.length < 2)) return false;
  const at = now + warn;
  const zones: string[] = [];
  const tank = m.target ? h.farm.players[m.target] : undefined;
  const others = party.filter((p) => p !== tank);
  const someone = (): PlayerState => (others.length ? others : party)[Math.floor(ctx.rnd() * (others.length ? others.length : party.length))]!;
  const circle = (x: number, y: number, r: number, extra: Partial<SagaZone> = {}): void => {
    zones.push(addZone(h, m, { shape: 'circle', x, y, r, at, dmg: mv.dmg, ...extra }, out));
  };
  switch (mv.move) {
    case 'cleave': {
      const t = tank ?? party[0]!;
      const dir = Math.atan2(t.y - a.y, t.x - a.x);
      zones.push(addZone(h, m, { shape: 'cone', x: a.x, y: a.y, r: mv.radius, dir, arc: mv.arc ?? 90, at, dmg: mv.dmg }, out));
      break;
    }
    case 'slam':
    case 'nova':
    case 'pull':
      circle(a.x, a.y, mv.radius);
      break;
    case 'line': {
      // a long strip from the boss towards the one it is fighting
      const t = tank ?? party[0]!;
      const dir = Math.atan2(t.y - a.y, t.x - a.x);
      zones.push(addZone(h, m, { shape: 'line', x: a.x, y: a.y, r: mv.radius, w: mv.width ?? 1.6, dir, at, dmg: mv.dmg }, out));
      break;
    }
    case 'mend':
      // the boss curls up and glows (only a picture: nobody is hurt)
      circle(a.x, a.y, mv.radius || 1, { dmg: 0 });
      toEveryone(h, out, fmt(T.sagaMending, { boss: boss.name }));
      break;
    case 'rain':
    case 'pools': {
      for (const p of party) circle(p.x, p.y, mv.radius, mv.linger ? { until: at + mv.linger } : {});
      for (let k = 0; k < (mv.count ?? 0); k++) {
        const p = party[Math.floor(ctx.rnd() * party.length)]!;
        const ang = ctx.rnd() * Math.PI * 2;
        const r = (2 + ctx.rnd() * 3) * TILE;
        const x = p.x + Math.cos(ang) * r;
        const y = p.y + Math.sin(ang) * r;
        if (!isSolidForAnimal(h.area, tileOf(x), tileOf(y))) circle(x, y, mv.radius, mv.linger ? { until: at + mv.linger } : {});
      }
      break;
    }
    case 'charge':
    case 'freeze': {
      const p = someone();
      circle(p.x, p.y, mv.radius);
      break;
    }
    case 'summon':
      break;
  }
  m.cast = { move: i, at, zones };
  const dx = (tank ?? party[0]!).x - a.x;
  a.facing = Math.abs(dx) > 0 ? (dx > 0 ? 'right' : 'left') : a.facing;
  out.push(spellFx(h, m.id, `cast_${mv.move}`, a));
  return true;
}

export const inZone = (z: SagaZone, p: { x: number; y: number }): boolean => {
  if (z.shape === 'line') {
    // along the strip (from a little behind the boss to its far end) and no further to the side than half its width
    const dx = (p.x - z.x) / TILE;
    const dy = (p.y - z.y) / TILE;
    const c = Math.cos(z.dir ?? 0);
    const s = Math.sin(z.dir ?? 0);
    const along = dx * c + dy * s;
    return along >= -0.6 && along <= z.r && Math.abs(-dx * s + dy * c) <= (z.w ?? 1.6) / 2;
  }
  const d = Math.hypot(p.x - z.x, p.y - z.y) / TILE;
  if (d > z.r) return false;
  if (z.shape === 'circle') return true;
  if (d < 0.6) return true;
  const ang = Math.atan2(p.y - z.y, p.x - z.x);
  let diff = Math.abs(ang - (z.dir ?? 0));
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  return diff <= (((z.arc ?? 90) / 2) * Math.PI) / 180;
};

/** The attack lands: whoever is still standing in its marks is hit. */
function landCast(h: Here, m: SagaMob, ctx: SimCtx, out: Change[]): void {
  const boss = SAGA_BOSSES[m.species]!;
  const cast = m.cast!;
  delete m.cast;
  const mv = boss.moves[cast.move]!;
  const now = ctx.now;
  const a = h.area.animals[m.id];
  const zones = cast.zones.map((id) => h.inst.zones.find((z) => z.id === id)).filter((z): z is SagaZone => !!z);
  const party = partyOf(h).filter((p) => upright(h, p));
  if (mv.move === 'charge' && a && zones[0]) {
    // the boss lands where the mark was
    const z = zones[0];
    const from = { x: a.x, y: a.y };
    if (!isSolidForAnimal(h.area, tileOf(z.x), tileOf(z.y))) {
      a.x = z.x;
      a.y = z.y;
    }
    out.push(spellFx(h, m.id, 'charge_land', from, z));
  }
  if (mv.move === 'mend' && a) {
    // nobody stopped it: the boss gets some of its health back
    const n = Math.min(m.max - m.hp, Math.round(m.max * (mv.heal ?? 0.1)));
    if (n > 0) {
      m.hp += n;
      out.push(hit(h, m.id, n, 'heal'));
    }
    toEveryone(h, out, fmt(T.sagaMended, { boss: boss.name }));
  }
  let pulled = false;
  for (const z of zones) {
    out.push(spellFx(h, m.id, `land_${mv.move}`, z));
    if (mv.move === 'mend') {
      dropZone(h, z.id, out);
      continue;
    }
    for (const p of party) {
      if (!inZone(z, p)) continue;
      if (mv.move === 'freeze') {
        freeze(h, m, p, mv, ctx, out);
        continue;
      }
      if (mv.move === 'pull' && a) {
        pullIn(h, a, p, out);
        pulled = true;
      }
      hurtFighter(h, p, mv.dmg, m, now, out);
    }
    if (z.until !== undefined) {
      // burning ground stays a while, hurting a little every second
      z.dmg = mv.dmg;
      z.at = now;
      out.push({ t: 'zone', area: h.key, id: z.id, zone: z });
    } else dropZone(h, z.id, out);
  }
  if (pulled) toEveryone(h, out, fmt(T.sagaPulled, { boss: boss.name }));
  if (mv.move === 'summon' && a && mv.add) {
    for (let i = 0; i < addCount(mv.count ?? 2, partySize(h)); i++) {
      const add = spawnSagaMob(h.area, h.inst, mv.add, a.x + (i - 0.5) * 2 * TILE, a.y + TILE, 'add', -1);
      const am = h.inst.mobs[add.id]!;
      // (Lätt: the summoned adds are softer too; `levelHp` is 1 on Vanlig, so nothing else changes)
      am.max = Math.max(1, Math.round(am.max * (h.inst.run?.levelHp ?? 1)));
      am.hp = am.max;
      am.state = 'fight';
      am.atkAt = now + 800;
      if (party[0]) am.threat[party[i % party.length]!.id] = 5;
      out.push({ t: 'animal', id: add.id, animal: add, area: h.key });
    }
  }
}

/** A boss's pull: the player lands on a free tile one or two steps from the boss, on their own side of it. */
function pullIn(h: Here, a: { x: number; y: number }, p: PlayerState, out: Change[]): void {
  const d = Math.max(1, Math.hypot(p.x - a.x, p.y - a.y));
  const bx = tileOf(a.x);
  const by = tileOf(a.y);
  for (const step of [1.5, 2, 1, 2.5]) {
    const tx = tileOf(a.x + ((p.x - a.x) / d) * step * TILE);
    const ty = tileOf(a.y + ((p.y - a.y) / d) * step * TILE);
    if ((tx !== bx || ty !== by) && !isSolidForPlayer(h.area, tx, ty)) {
      warp(h, p, tx, ty, out);
      return;
    }
  }
  const spot = openTileNear(h.area, bx, by + 1);
  warp(h, p, spot.x, spot.y, out);
}

const ICE_HP = 45;
const ICE_MS = 9000;

/** Freezes a player in a block of ice (or a spider's web): no walking or spells until someone breaks it (or it melts). */
function freeze(h: Here, m: SagaMob, p: PlayerState, mv: BossAbility, ctx: SimCtx, out: Change[]): void {
  const f = h.inst.fighters[p.id];
  if (!f || f.frozen !== undefined) return;
  const block = mv.block && BLOCK_SPECIES.has(mv.block) ? mv.block : 'isblock';
  const ice = spawnSagaMob(h.area, h.inst, block, p.x, p.y + 1, 'ice', -1);
  const im = h.inst.mobs[ice.id]!;
  im.max = Math.round(ICE_HP * mobHpScale(partySize(h)) * (h.inst.run?.levelHp ?? 1));
  im.hp = im.max;
  im.state = 'fight';
  im.holds = p.id;
  im.meltAt = ctx.now + ICE_MS;
  f.frozen = ice.id;
  out.push({ t: 'animal', id: ice.id, animal: ice, area: h.key });
  toEveryone(h, out, fmt(block === 'spindelnat' ? T.sagaWebbed : T.sagaFrozen, { name: p.name }));
  hurtFighter(h, p, mv.dmg, m, ctx.now, out);
  out.push(playerChange(p));
}

// ---------------------------------------------------------------------------
// The dungeon's tick
// ---------------------------------------------------------------------------

const REGEN = 0.03;
const REST_REGEN = 0.3;

/** Runs a dungeon for one tick while anyone is inside. */
export function tickSaga(area: WorldState, key: string, dtMs: number, ctx: SimCtx, out: Change[]): void {
  const inst = area.saga;
  if (!inst) return;
  const farm = farmOf(area);
  const h: Here = { farm, area, inst, key };
  const now = ctx.now;
  tickCtx = ctx;
  const party = partyOf(h);
  // burning monsters (a path's Eld): a second's damage each second
  for (const m of Object.values(inst.mobs)) {
    if (!m.burn) continue;
    if (now >= m.burn.until || m.state === 'home') delete m.burn;
    else if (now >= m.burn.next) {
      m.burn.next += 1000;
      const by = m.burn.by;
      hurtMob(h, m, by, m.burn.per, 0.5, false, ctx, out);
    }
  }
  // players who left (or lost their class) are out of the fight
  for (const id of Object.keys(inst.fighters)) {
    const p = farm.players[id];
    if (!p || p.area !== key || !p.saga?.cls) forget(h, id);
    else if (!p.online) {
      for (const m of Object.values(inst.mobs)) delete m.threat[id];
    }
  }
  for (const p of Object.values(area.players)) if (p.online && p.area === key && !inst.fighters[p.id] && p.saga?.cls) makeFighter(h, p);
  // the clock of the family's best time starts when the first fighter is in a fresh dungeon
  if (inst.startedAt === undefined && Object.keys(inst.fighters).length) inst.startedAt = now;
  const fighting = inFight(h);
  const sec = dtMs / 1000;
  for (const p of party) {
    const f = inst.fighters[p.id]!;
    if (f.down !== undefined) {
      if (!inst.wipeAt && now - f.down >= DOWN_MS * (1 - Math.min(0.8, buffsOf(h, p.id).down))) standUp(h, p, now, out);
      continue;
    }
    // the healing ring
    if (f.hot && now < f.hot.until) {
      const before = f.hp;
      f.hp = Math.min(f.max, f.hp + f.hot.per * sec);
      if (Math.floor(f.hp) > Math.floor(before) && Math.floor(now / 1000) !== Math.floor((now - dtMs) / 1000)) out.push(hit(h, p.id, f.hot.per, 'heal'));
    } else if (f.hot) delete f.hot;
    // rest stones: they light up when someone comes near, heal, and become where you get up
    inst.rests.forEach((r, i) => {
      if (dist(p, { x: px(r.x), y: px(r.y) }) > REST_RADIUS) return;
      if (i > inst.checkpoint) {
        inst.checkpoint = i;
        const o = objectAt(area, r.x, r.y);
        if (o) {
          o.variant = 1;
          out.push({ t: 'object', id: o.id, obj: o, area: key });
        }
        for (const q of party) out.push({ t: 'banner', to: q.id, area: key, text: T.sagaRestLit, sub: T.sagaRestSub, kind: 'rest' });
      }
      if (!fighting) f.hp = Math.min(f.max, f.hp + f.max * REST_REGEN * (1 + buffsOf(h, p.id).rest) * sec);
    });
    // out of the fight, health slowly comes back
    if (!fighting && now - f.fightAt > CALM_MS) f.hp = Math.min(f.max, f.hp + f.max * REGEN * (1 + buffsOf(h, p.id).regen) * sec);
  }
  // a puzzle room's plates light up under anyone standing on them; all of them lit opens the way on
  if (!inst.puzzleOpen) {
    for (const plate of inst.plates) {
      if (plate.lit || !party.some((p) => upright(h, p) && tileOf(p.x) === plate.x && tileOf(p.y) === plate.y)) continue;
      plate.lit = true;
      const o = objectAt(area, plate.x, plate.y);
      if (o) {
        o.variant = 1;
        out.push({ t: 'object', id: o.id, obj: o, area: key });
      }
      out.push(fxOn(key, plate.x, plate.y, 'sparkle'));
      toEveryone(h, out, fmt(T.sagaPlateLit, { n: inst.plates.filter((q) => q.lit).length, count: inst.plates.length }));
    }
    if (inst.plates.length && inst.plates.every((q) => q.lit)) openPuzzle(h, out);
  }
  // monsters
  const fields = new Map<string, Int16Array>();
  for (const m of Object.values(inst.mobs)) tickMob(h, m, dtMs, ctx, fields, out);
  // the pets (pets.ts) act after the monsters have moved
  tickPets(h, dtMs, ctx, out);
  // burning ground
  for (const z of [...inst.zones]) {
    if (z.until === undefined || now < z.at) continue;
    if (now >= z.until) {
      dropZone(h, z.id, out);
      continue;
    }
    if (Math.floor(now / 1000) === Math.floor((now - dtMs) / 1000)) continue;
    for (const p of party) if (upright(h, p) && inZone(z, p)) hurtFighter(h, p, z.dmg, inst.mobs[z.by] ?? null, now, out);
  }
  // everyone fell: a short pause, then up at the last rest stone, and the monsters go home. In a run that happens only with
  // a Sagoandan (or on Lätt, where a wipe never ends the run); otherwise runsim.ts ends the run when the pause is over.
  if (party.length && party.every((p) => !upright(h, p))) {
    const link = inst.run;
    if (inst.wipeAt === undefined) {
      inst.wipeAt = now + WIPE_MS;
      // a Sagoandan is for a run still being fought; once the boss is down only Lätt (which never ends on a wipe) gets everyone up, free
      const spirits = inst.bossDown ? 0 : (link?.spirit ?? 0);
      if (link && (spirits > 0 || link.soft)) link.revive = true;
      const boss = Object.values(inst.mobs).find((m) => (m.kind === 'boss' || m.kind === 'mini') && m.state === 'fight');
      if (boss) out.push(yell(h, boss.species, SAGA_BOSSES[boss.species]!.yells.wipe));
      for (const p of party) {
        if (link?.revive) {
          const left = Math.max(0, spirits - 1);
          out.push({ t: 'banner', to: p.id, area: key, text: spirits > 0 ? RUN_T.spirit : RUN_T.spiritFree, sub: spirits > 0 ? fmt(RUN_T.spiritSub, { n: left }) : RUN_T.spiritFreeSub, kind: 'level' });
        } else out.push({ t: 'banner', to: p.id, area: key, text: T.sagaWipe, sub: link?.wipeSub ?? T.sagaWipeSub, kind: 'wipe' });
      }
    } else if (now >= inst.wipeAt && (!link || link.revive)) {
      delete inst.wipeAt;
      let fraction = 1;
      if (link) {
        delete link.revive;
        if (!inst.bossDown) link.used = (link.used ?? 0) + 1;
        if (!inst.bossDown && (link.spirit ?? 0) > 0) {
          link.spirit = (link.spirit ?? 0) - 1;
          fraction = SAGOANDAN_HP;
        }
      }
      for (const m of Object.values(inst.mobs)) if (m.state === 'fight') resetMob(h, m, out);
      for (const z of [...inst.zones]) dropZone(h, z.id, out);
      for (const p of party) standUp(h, p, now, out, fraction);
    }
  } else {
    delete inst.wipeAt;
    if (inst.run) delete inst.run.revive;
  }
}

/** Every plate is lit: the puzzle room's gate goes, like the gate after the mid-boss. */
function openPuzzle(h: Here, out: Change[]): void {
  h.inst.puzzleOpen = true;
  for (const g of h.inst.puzzleGate) {
    const o = objectAt(h.area, g.x, g.y);
    if (o?.kind === 'saga_gate') {
      removeObject(h.area, o.id);
      out.push({ t: 'object', id: o.id, obj: null, area: h.key });
    }
  }
  for (const p of partyOf(h)) out.push({ t: 'banner', to: p.id, area: h.key, text: T.sagaPuzzleOpen, sub: T.sagaPuzzleOpenSub, kind: 'rest' });
}

/** A dungeon nobody is in: after a while it starts over. Returns true when it should be thrown away. */
export function idleSaga(farm: WorldState, key: string, area: WorldState, now: number): boolean {
  const inst = area.saga;
  // a run's zones live and die with the run (runsim.ts)
  if (!inst || inst.run) return false;
  inst.emptySince ??= now;
  if (now - inst.emptySince < SAGA_RESET_MS) return false;
  // anyone still inside (offline) waits in front of the arch instead
  const id = dungeonOfKey(key);
  if (id) {
    const front = archFront(farm);
    for (const p of Object.values(farm.players)) {
      if (p.area !== key) continue;
      p.area = 'farm';
      p.x = px(front.x);
      p.y = px(front.y);
    }
  }
  return true;
}

/** A fallen or frozen player cannot walk. */
export function sagaRooted(world: WorldState, p: PlayerState): boolean {
  const h = hereOf(world, p);
  const f = h?.inst.fighters[p.id];
  return !!f && (f.down !== undefined || f.frozen !== undefined);
}

/** A slowed player walks at this speed (client prediction). */
export const SLOW_MUL = 0.6;

// ---------------------------------------------------------------------------
// What clients need every tenth of a second
// ---------------------------------------------------------------------------

export interface SagaSnap {
  /** Players: health, max, flags (1 fallen, 2 shield wall, 4 rage, 8 healing ring, 16 slowed, 32 frozen). */
  f: Record<string, [number, number, number]>;
  /** Monsters that are fighting or hurt: health and max. */
  m: Record<number, [number, number]>;
  /** The boss in a fight: its id, phase, and the attack it is getting ready (name, when it lands, warning ms, stoppable). */
  b?: { id: number; phase: number; cast?: { name: string; at: number; warn: number; kick: boolean } };
}

export function sagaSnapshot(farm: WorldState, now: number): Record<string, SagaSnap> | undefined {
  let res: Record<string, SagaSnap> | undefined;
  for (const [k, a] of Object.entries(farm.areas ?? {})) {
    const inst = a.saga;
    if (!inst || !Object.values(a.players).some((p) => p.online)) continue;
    const snap: SagaSnap = { f: {}, m: {} };
    for (const [id, f] of Object.entries(inst.fighters)) {
      const flags = (f.down !== undefined ? 1 : 0) | (f.wall !== undefined && now < f.wall ? 2 : 0) | (f.rage !== undefined && now < f.rage ? 4 : 0) | (f.hot && now < f.hot.until ? 8 : 0) | (f.slow !== undefined && now < f.slow ? 16 : 0) | (f.frozen !== undefined ? 32 : 0) | (f.shield && now < f.shield.until && f.shield.hp > 0 ? 64 : 0);
      snap.f[id] = [Math.ceil(f.hp), f.max, flags];
    }
    for (const m of Object.values(inst.mobs)) {
      if (m.state === 'fight' || m.hp < m.max) snap.m[m.id] = [Math.max(0, Math.ceil(m.hp)), m.max];
      if ((m.kind === 'boss' || m.kind === 'mini') && m.state === 'fight') {
        const mv = m.cast ? SAGA_BOSSES[m.species]?.moves[m.cast.move] : undefined;
        snap.b = { id: m.id, phase: m.phase ?? 0 };
        if (mv && m.cast) snap.b.cast = { name: mv.name, at: m.cast.at, warn: Math.round(mv.warn * (inst.run?.warnMul ?? 1)), kick: !!mv.interrupt };
      }
    }
    (res ??= {})[k] = snap;
  }
  return res;
}

// ---------------------------------------------------------------------------
// Act II: gear, hero levels, hero mode out in the world, field tasks and Loke's roaming servants
// ---------------------------------------------------------------------------

/** Saves from before gear: the gear record is made and the best weapon in the bag is put on. True if it changed. */
export function ensureGear(p: PlayerState): boolean {
  const prog = p.saga;
  if (!prog || prog.gear) return false;
  const best = gearOf(p).weapon;
  prog.gear = {};
  if (best && removeItem(p.inventory, best, 1)) prog.gear.weapon = best;
  return true;
}

/** A fighter's full health: the class's (they keep what they gained or lost). */
function refreshMax(p: PlayerState, f: SagaFighter, h?: Here): void {
  const max = maxHealth(h, p, f.cls);
  if (max === f.max) return;
  if (f.down === undefined) f.hp = Math.max(1, Math.min(max, f.hp + Math.max(0, max - f.max)));
  f.max = max;
}

/**
 * Puts a weapon, an offhand or an amulet from the bag on (`itemId` null takes the slot's piece off, back into the
 * bag). Anywhere, but not while fallen or frozen in a dungeon.
 */
export function equipGear(world: WorldState, playerId: string, slot: string, itemId: string | null): Change[] {
  const p = farmOf(world).players[playerId];
  if (!p || !isGearSlot(slot)) return [];
  const prog = progressOf(p);
  ensureGear(p);
  const gear = prog.gear!;
  const h = hereOf(world, p);
  const f = h?.inst.fighters[p.id];
  if (f && (f.down !== undefined || f.frozen !== undefined)) return [toast(p.id, T.sagaEquipNotNow)];
  const old = gear[slot];
  const out: Change[] = [];
  if (itemId === null) {
    if (!old) return [];
    if (addItem(p.inventory, old, 1) > 0) return [toast(p.id, T.sagaEquipBagFull)];
    delete gear[slot];
    out.push(toast(p.id, fmt(T.sagaUnequipped, { item: itemName(old) })));
  } else {
    if (gearSlotOf(itemId) !== slot) return [toast(p.id, fmt(T.sagaEquipNoFit, { item: itemName(itemId) }))];
    if (old === itemId) return [];
    if (!removeItem(p.inventory, itemId, 1)) return [toast(p.id, fmt(T.sagaEquipMissing, { item: itemName(itemId) }))];
    if (old && addItem(p.inventory, old, 1) > 0) {
      addItem(p.inventory, itemId, 1);
      return [toast(p.id, T.sagaEquipBagFull)];
    }
    gear[slot] = itemId;
    out.push(toast(p.id, fmt(T.sagaEquipped, { item: itemName(itemId) })));
    if (sagaItem(itemId)?.rarity === 'legendary' && !p.stats?.sagaLegendary) {
      bump(p, 'sagaLegendary', 1, out);
      out.push(toast(null, fmt(T.sagaLegendaryOn, { name: p.name, item: itemName(itemId) })));
    }
  }
  if (f) refreshMax(p, f, h ?? undefined);
  out.push(playerChange(p));
  return out;
}

/**
 * Hero experience, for everyone (the saga record is made if there is none; spells still need a class). A floating
 * "+n xp" for the player, and at each new level a banner naming the level's reward, a sparkle, the reward itself
 * (levels give nothing that changes a fight).
 */
export function giveXp(p: PlayerState, n: number, out: Change[], h?: Here): void {
  if (n <= 0) return;
  const prog = progressOf(p);
  const before = xpLevel(prog.xp ?? 0);
  prog.xp = (prog.xp ?? 0) + n;
  const level = xpLevel(prog.xp);
  prog.level = level;
  out.push({ t: 'xp', to: p.id, n, x: p.x, y: p.y, ...(p.area !== 'farm' ? { area: p.area } : {}) });
  // the rewards of the levels just reached, and any an old save is still owed
  ensureLevelRewards(p, out);
  if ((p.stats?.sagaLevel ?? 0) < level) bump(p, 'sagaLevel', level - (p.stats?.sagaLevel ?? 0), out);
  if (level <= before) return;
  const lines: string[] = [];
  for (let l = before + 1; l <= level; l++) lines.push(...rewardLines(LEVEL_REWARDS[l]));
  out.push(
    { t: 'banner', to: p.id, ...(h ? { area: h.key } : {}), kind: 'level', text: fmt(T.sagaLevelUp, { n: level }), sub: lines.length ? lines.join(' ') : T.sagaLevelSub },
    fxOn(p.area, tileOf(p.x), tileOf(p.y), 'sparkle'),
  );
  const f = h?.inst.fighters[p.id];
  if (f) refreshMax(p, f, h);
}

/** What the level banner says about a level's reward ("Du får Glödkransen!", "Ny titel: Vandrare"). */
const rewardLines = (r: LevelReward | undefined): string[] => {
  if (!r) return [];
  const lines: string[] = [];
  if (r.item) lines.push(fmt(T.sagaLevelItem, { item: itemName(r.item) }));
  if (r.title) lines.push(fmt(T.sagaLevelTitle, { title: r.title }));
  if (r.aura) lines.push(r.aura === 2 ? T.sagaLevelAura2 : T.sagaLevelAura1);
  return lines;
};

/**
 * Hands out every hero level reward a player has reached and not had yet: clothes to the wardrobe, pets, mounts and
 * amulets to the bag, titles to the saga's list. Each item comes once (it is noted in the saga's `found`); one that
 * does not fit in a full bag waits for the next time. giveXp runs it, and the server on load (saves from before the
 * rewards). With `out`, a toast for each. True if anything changed.
 */
export function ensureLevelRewards(p: PlayerState, out?: Change[]): boolean {
  const xp = p.saga?.xp ?? 0;
  if (!xp) return false;
  const prog = progressOf(p);
  prog.found ??= [];
  prog.titles ??= [];
  const level = xpLevel(xp);
  let changed = prog.level !== level;
  prog.level = level;
  for (let l = 2; l <= level; l++) {
    const r = LEVEL_REWARDS[l];
    if (!r) continue;
    if (r.title && !prog.titles.includes(r.title)) {
      prog.titles.push(r.title);
      changed = true;
    }
    if (!r.item || prog.found.includes(r.item)) continue;
    if (ITEMS[r.item]?.category === 'clothing') {
      if (!p.wardrobe.includes(r.item)) {
        p.wardrobe.push(r.item);
        out?.push(toast(p.id, fmt(T.sagaLevelToWardrobe, { item: itemName(r.item) })));
      }
    } else if (addItem(p.inventory, r.item, 1) > 0) {
      out?.push(toast(p.id, fmt(T.sagaLevelBagFull, { item: itemName(r.item) })));
      continue;
    } else out?.push(toast(p.id, fmt(ITEMS[r.item]?.category === 'placeable' ? T.sagaLevelToHouse : T.sagaLevelToBag, { item: itemName(r.item) })));
    prog.found.push(r.item);
    changed = true;
  }
  return changed;
}

/** What a player holds in the picture: their weapon while a hero (and in a dungeon), else what they have selected. */
export const shownHeld = (p: PlayerState): string | null => {
  const weapon = p.saga?.gear?.weapon;
  if (weapon && isSagaKey(p.area)) return weapon;
  return p.inventory[p.selected]?.item ?? null;
};

