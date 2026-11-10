// Runor v2 (GAME2.md section 3): the cards a hero takes during a run. Every runa has a rarity (vanlig, ovanlig, sällsynt, legendarisk) and
// one or two tags; two and four runor of one tag give a small and a big set bonus; offers are personal (each hero draws their own three,
// leaning to their class and path), the rarity of a card is rolled by weights that depend on the stop and on the sagaträd's luck, and
// a runa a hero holds can be sharpened (skärpa: x1.25 a step) at a Vilosten, at the Köpman or by a smith. Data and rules only; the run's
// state is runsim.ts and the Swedish names and sentences are in sv.ts (RUNA_NAMES, RUNA_TEXT, TAG_*, SET_*, RARITY_*).
import { addEffect, type RunEffect } from './run.ts';
import type { ClassId } from './saga.ts';
import { pathDef } from './paths.ts';

export type RunRarity = 'vanlig' | 'ovanlig' | 'sallsynt' | 'legendarisk';
export const RARITIES: readonly RunRarity[] = ['vanlig', 'ovanlig', 'sallsynt', 'legendarisk'];
export const rarityIndex = (r: RunRarity): number => RARITIES.indexOf(r);

export type RunTag = 'eld' | 'is' | 'aska' | 'skold' | 'liv' | 'hugg' | 'tur' | 'djur';
export const RUN_TAGS: readonly RunTag[] = ['eld', 'is', 'aska', 'skold', 'liv', 'hugg', 'tur', 'djur'];

export interface RunaDef {
  id: string;
  /** Helps only this class (left out: the whole party; a gemensam runa comes from events, the mid-boss, a boss or the Köpman, never from a personal offer). */
  cls?: ClassId;
  icon: string;
  rarity: RunRarity;
  tags: RunTag[];
  effect: RunEffect;
}

const rn = (id: string, cls: ClassId | undefined, icon: string, rarity: RunRarity, tags: RunTag[], effect: RunEffect): RunaDef => ({ id, ...(cls ? { cls } : {}), icon, rarity, tags, effect });
const V: RunRarity = 'vanlig';
const O: RunRarity = 'ovanlig';
const S: RunRarity = 'sallsynt';
const L: RunRarity = 'legendarisk';

export const RUNOR: RunaDef[] = [
  // Väktare
  rn('v_tjock', 'vaktare', '🛡️', V, ['skold'], { armor: 0.08 }),
  rn('v_hugg', 'vaktare', '🗡️', V, ['hugg'], { spell: { hugg: 0.25 } }),
  rn('v_ropet', 'vaktare', '📣', O, ['skold'], { spellCd: { utmana: 0.3 } }),
  rn('v_mur', 'vaktare', '🧱', O, ['skold'], { spellCd: { skoldmur: 0.25 } }),
  rn('v_slag', 'vaktare', '💥', S, ['hugg'], { spell: { skoldslag: 0.4 } }),
  rn('v_hjarta', 'vaktare', '❤️', V, ['skold'], { hp: 0.15 }),
  rn('v_trots', 'vaktare', '😤', V, ['skold'], { threat: 0.3 }),
  rn('v_lugn', 'vaktare', '🌊', O, ['skold'], { taken: 0.1 }),
  rn('v_taggar', 'vaktare', '🌵', O, ['skold', 'hugg'], { traits: { thorns: 0.3 } }),
  rn('v_skyddar', 'vaktare', '🔰', O, ['skold'], { mods: { utmana: { partyShield: 0.06 } } }),
  rn('v_skjuts', 'vaktare', '🔨', S, ['hugg'], { mods: { skoldslag: { stun: 800, power: 0.3 } } }),
  rn('v_eko', 'vaktare', '🔔', V, ['hugg'], { mods: { hugg: { chain: 1 } } }),
  rn('v_vakt', 'vaktare', '🏰', V, ['skold'], { hp: 0.08, armor: 0.03 }),
  rn('v_titan', 'vaktare', '🗿', L, ['skold'], { mods: { skoldmur: { ms: 4000, partyShield: 0.15 } }, taken: 0.08 }),
  // Helare
  rn('h_runa', 'helare', '💚', V, ['liv'], { spell: { lakerunan: 0.25 } }),
  rn('h_ring', 'helare', '🌿', O, ['liv'], { spell: { lakekrets: 0.35 } }),
  rn('h_pil', 'helare', '✨', V, ['aska'], { spell: { ljuspil: 0.4 } }),
  rn('h_vack', 'helare', '🌅', O, ['liv'], { reviveHp: 0.25 }),
  rn('h_snabb', 'helare', '⚡', S, ['aska'], { cd: 0.12 }),
  rn('h_flod', 'helare', '💧', O, ['liv'], { heal: 0.15 }),
  rn('h_ro', 'helare', '🍃', V, ['liv', 'djur'], { regen: 0.5 }),
  rn('h_skydd', 'helare', '🕊️', V, ['skold'], { armor: 0.06 }),
  rn('h_ranka', 'helare', '🌱', O, ['liv'], { mods: { ljuspil: { slow: 2000 } } }),
  rn('h_efter', 'helare', '💞', O, ['liv'], { mods: { lakerunan: { hot: 0.5 } } }),
  rn('h_stjarna', 'helare', '🌟', V, ['liv'], { mods: { lakekrets: { radius: 1 } } }),
  rn('h_skal', 'helare', '🫧', S, ['skold'], { mods: { lakekrets: { partyShield: 0.06 } } }),
  rn('h_under', 'helare', '🌄', S, ['liv'], { mods: { vackupp: { cd: 0.4, base: 25 } } }),
  rn('h_livsflod', 'helare', '🌊', L, ['liv'], { mods: { lakekrets: { power: 0.5, radius: 1.5 } }, heal: 0.1 }),
  // Krigare
  rn('k_yx', 'krigare', '🪓', V, ['hugg'], { spell: { yxhugg: 0.3 } }),
  rn('k_storm', 'krigare', '💨', O, ['aska'], { spellCd: { stormsteg: 0.35 } }),
  rn('k_virvel', 'krigare', '🌪️', O, ['hugg'], { spell: { virvelvind: 0.35 } }),
  rn('k_raseri', 'krigare', '🔥', S, ['eld'], { spellCd: { raseri: 0.3 } }),
  rn('k_glupsk', 'krigare', '🍖', O, ['djur'], { leech: 0.08 }),
  rn('k_hjarta', 'krigare', '💪', V, ['djur'], { hp: 0.12 }),
  rn('k_kraft', 'krigare', '⚔️', S, ['hugg', 'eld'], { power: 0.1 }),
  rn('k_egg', 'krigare', '🎯', V, ['tur'], { crit: 0.1 }),
  rn('k_hammare', 'krigare', '🔨', O, ['hugg'], { mods: { stormsteg: { stun: 600 } } }),
  rn('k_skar', 'krigare', '🌀', O, ['hugg'], { mods: { virvelvind: { radius: 0.8 } } }),
  rn('k_eldyxa', 'krigare', '🌋', S, ['eld'], { mods: { yxhugg: { burn: 0.6 } } }),
  rn('k_dubbel', 'krigare', '🪚', V, ['hugg'], { mods: { yxhugg: { chain: 1 } } }),
  rn('k_mod', 'krigare', '🦁', V, ['tur', 'djur'], { crit: 0.06, hp: 0.05 }),
  rn('k_ragnarok', 'krigare', '🌑', L, ['eld'], { mods: { raseri: { ms: 4000, cd: 0.5 } }, power: 0.06 }),
  // Magiker
  rn('m_eld', 'magiker', '☄️', V, ['eld'], { spell: { eldboll: 0.3 } }),
  rn('m_is', 'magiker', '❄️', O, ['is'], { spell: { isspjut: 0.35 } }),
  rn('m_ask', 'magiker', '⚡', O, ['aska'], { spell: { askregn: 0.35 } }),
  rn('m_blink', 'magiker', '🌀', V, ['aska'], { spellCd: { blink: 0.4 } }),
  rn('m_snabb', 'magiker', '🪄', S, ['aska'], { cd: 0.12 }),
  rn('m_kraft', 'magiker', '🔮', S, ['eld'], { power: 0.1 }),
  rn('m_tur', 'magiker', '🍀', O, ['tur'], { crit: 0.12 }),
  rn('m_skal', 'magiker', '🫧', V, ['is'], { taken: 0.08 }),
  rn('m_glod', 'magiker', '🔥', V, ['eld'], { mods: { eldboll: { burn: 0.5 } } }),
  rn('m_frost', 'magiker', '🧊', O, ['is'], { mods: { eldboll: { slow: 1500 } } }),
  rn('m_kedja', 'magiker', '🔗', O, ['aska'], { mods: { eldboll: { chain: 1 } } }),
  rn('m_sprak', 'magiker', '🌩️', S, ['aska'], { mods: { askregn: { radius: 0.8, cd: 0.25 } } }),
  rn('m_isskal', 'magiker', '💠', V, ['is'], { mods: { blink: { shield: 0.12 } } }),
  rn('m_stormen', 'magiker', '🌪️', L, ['aska', 'eld'], { mods: { askregn: { power: 0.6, radius: 1, burn: 0.4 } } }),
  // The whole party (they come from events, the mid-boss, bosses and the Köpman, never from a personal offer)
  rn('p_hjarta', undefined, '🧡', V, ['djur'], { hp: 0.1 }),
  rn('p_vila', undefined, '🪨', V, ['liv'], { rest: 0.6 }),
  rn('p_kraft', undefined, '🌟', O, ['tur'], { power: 0.08 }),
  rn('p_flaska', undefined, '🧪', V, ['liv'], { potions: 2, potion: 0.15 }),
  rn('p_vakna', undefined, '🌄', V, ['liv'], { down: 0.4 }),
  rn('p_fro', undefined, '🌱', O, ['tur'], { seeds: 0.25 }),
  rn('p_mod', undefined, '🛡️', V, ['skold'], { armor: 0.04 }),
  rn('p_hast', undefined, '💫', O, ['aska'], { cd: 0.06 }),
  rn('p_lycka', undefined, '🍀', V, ['tur'], { crit: 0.06 }),
  rn('p_sang', undefined, '🎶', O, ['liv'], { heal: 0.1 }),
  rn('p_djur', undefined, '🐾', S, ['djur'], { hp: 0.06, regen: 0.3 }),
  rn('p_yggdrasil', undefined, '🌳', L, ['liv', 'djur'], { hp: 0.15, power: 0.1, regen: 0.5 }),
];

export const runa = (id: string): RunaDef | undefined => RUNOR.find((r) => r.id === id);
export const isPartyRuna = (id: string): boolean => runa(id)?.cls === undefined;

// ---------------------------------------------------------------------------
// Held runor, skärpa and set bonuses
// ---------------------------------------------------------------------------

/** A runa a hero holds: its id and how many times it has been sharpened (skärpa). */
export interface RunaHeld {
  id: string;
  up: number;
}

/** Skärpa: each step makes the runa this much stronger; a runa can be sharpened up to sällsynt (a vanlig twice, an ovanlig once). */
export const SKARPA_MUL = 1.25;
export const skarpaMul = (up: number): number => Math.pow(SKARPA_MUL, up);
/** The rarity a held runa has now (its own, raised by skärpa up to sällsynt; legendariska stay). */
export function heldRarity(h: RunaHeld): RunRarity {
  const def = runa(h.id);
  if (!def) return 'vanlig';
  const base = rarityIndex(def.rarity);
  return RARITIES[base >= 3 ? 3 : Math.min(2, base + h.up)]!;
}
/** Can this runa be sharpened one more step (it is below sällsynt)? */
export const canSharpen = (h: RunaHeld): boolean => {
  const def = runa(h.id);
  return !!def && rarityIndex(def.rarity) < 2 && rarityIndex(def.rarity) + h.up < 2;
};

/** How many runor of each tag a hero holds (a runa with two tags counts for both). */
export function tagCounts(held: readonly RunaHeld[], party: readonly string[] = []): Record<RunTag, number> {
  const n = Object.fromEntries(RUN_TAGS.map((t) => [t, 0])) as Record<RunTag, number>;
  for (const id of [...held.map((h) => h.id), ...party]) for (const t of runa(id)?.tags ?? []) n[t]++;
  return n;
}

/** The set bonuses: two runor of a tag give the first, four the second as well (GAME2.md 3.1). Plain effects, so the tests' "every effect changes something" covers them. */
export const SET_BONUS: Record<RunTag, [RunEffect, RunEffect]> = {
  eld: [{ power: 0.03 }, { power: 0.04, leech: 0.02 }],
  is: [{ taken: 0.03 }, { taken: 0.03, cd: 0.03 }],
  aska: [{ cd: 0.03 }, { cd: 0.03, crit: 0.03 }],
  skold: [{ armor: 0.03 }, { armor: 0.02, hp: 0.05 }],
  liv: [{ heal: 0.05, regen: 0.2 }, { heal: 0.06, rest: 0.3, reviveHp: 0.1 }],
  hugg: [{ crit: 0.03 }, { crit: 0.03, power: 0.03 }],
  tur: [{ crit: 0.03, coins: 0.2 }, { coins: 0.25, seeds: 0.1 }],
  djur: [{ hp: 0.04 }, { hp: 0.04, regen: 0.3 }],
};
export const SET_STEPS: readonly [number, number] = [2, 4];

/** The set bonuses a count of tags earns, summed. */
export function setEffect(counts: Record<RunTag, number>): RunEffect {
  const e: RunEffect = {};
  for (const t of RUN_TAGS) {
    if (counts[t] >= SET_STEPS[0]) addEffect(e, SET_BONUS[t][0]);
    if (counts[t] >= SET_STEPS[1]) addEffect(e, SET_BONUS[t][1]);
  }
  return e;
}

/** What one held runa gives (its effect, stronger by skärpa). */
export function heldEffect(h: RunaHeld): RunEffect {
  const e: RunEffect = {};
  const def = runa(h.id);
  if (def) addEffect(e, def.effect, skarpaMul(h.up));
  return e;
}

// ---------------------------------------------------------------------------
// Offers: personal cards with a rarity
// ---------------------------------------------------------------------------

/** Where an offer comes from: the weights of the four rarities (GAME2.md 3.2; the sagaträd's `luck` raises the rarer ones). */
export type OfferSource = 'flock' | 'stark' | 'skatt' | 'mini' | 'shop';
export const OFFER_WEIGHTS: Record<OfferSource, readonly [number, number, number, number]> = {
  flock: [60, 30, 10, 0],
  stark: [30, 40, 25, 5],
  skatt: [30, 40, 25, 5],
  mini: [0, 30, 50, 20],
  shop: [40, 35, 20, 5],
};

/** The weights with `luck` (a fraction, from the tree) applied: a rarity k steps up counts (1 + luck × k) times as much. */
export const rarityWeights = (source: OfferSource, luck = 0): number[] => OFFER_WEIGHTS[source].map((w, i) => w * (1 + luck * i));

/** How many offers in a row without an ovanlig or better a hero may have: the next one has one (the pity rule). */
export const PITY_AFTER = 2;

/** Which tags a path likes: offers lean towards runor of these tags. */
export const PATH_TAGS: Record<string, RunTag[]> = { eld: ['eld'], frost: ['is'], aska: ['aska'], barsark: ['hugg', 'eld'], vapen: ['hugg', 'tur'], murvakt: ['skold'], hamnare: ['skold', 'hugg'], ljus: ['liv'], natur: ['liv', 'djur'] };
/** How much more a runa of the hero's own path tag is drawn (the class's own runor are all they are offered). */
export const PATH_LEAN = 2.5;

export interface OfferOpts {
  cls: ClassId;
  path?: string;
  held: readonly RunaHeld[];
  source: OfferSource;
  luck?: number;
  /** Offers in a row without an ovanlig or better (the hero's counter). */
  pity?: number;
  size?: number;
  /** Ids that may not come (cards already on the table, a reroll's old cards). */
  avoid?: readonly string[];
}

/**
 * One hero's cards: for each card a rarity is rolled by the stop's weights, then a runa of the hero's class of that rarity is drawn (leaning
 * to the tags of their path; one already held or on the table never comes again; a rarity with nothing left gives way to the next one down).
 * After `PITY_AFTER` offers without an ovanlig or better, one card is at least ovanlig. Deterministic for a given `rnd`. Returns the card ids and the new pity count.
 */
export function offerFor(rnd: () => number, o: OfferOpts): { cards: string[]; pity: number } {
  const size = o.size ?? 3;
  const taken = new Set([...o.held.map((h) => h.id), ...(o.avoid ?? [])]);
  const weights = rarityWeights(o.source, o.luck ?? 0);
  const likes = new Set(o.path ? (PATH_TAGS[o.path] ?? []) : []);
  const pool = RUNOR.filter((r) => r.cls === o.cls);
  const cards: string[] = [];
  const draw = (min: number): string | null => {
    // roll a rarity (at least `min`), walking down to what the class still has
    const w = weights.map((x, i) => (i >= min ? x : 0));
    let total = w.reduce((a, b) => a + b, 0);
    let ri = 0;
    if (total > 0) {
      let r = rnd() * total;
      for (; ri < w.length - 1; ri++) {
        r -= w[ri]!;
        if (r < 0) break;
      }
    }
    for (let tier = ri; tier >= 0; tier--) {
      const cands = pool.filter((r) => rarityIndex(r.rarity) === tier && !taken.has(r.id) && !cards.includes(r.id));
      if (!cands.length) continue;
      const cw = cands.map((r) => (r.tags.some((t) => likes.has(t)) ? PATH_LEAN : 1));
      total = cw.reduce((a, b) => a + b, 0);
      let x = rnd() * total;
      for (let i = 0; i < cands.length; i++) {
        x -= cw[i]!;
        if (x < 0) return cands[i]!.id;
      }
      return cands[cands.length - 1]!.id;
    }
    // nothing of that rarity or below: any card the class still has
    const any = pool.filter((r) => !taken.has(r.id) && !cards.includes(r.id));
    return any.length ? any[Math.floor(rnd() * any.length)]!.id : null;
  };
  const forced = (o.pity ?? 0) >= PITY_AFTER ? Math.floor(rnd() * size) : -1;
  for (let i = 0; i < size; i++) {
    const id = draw(i === forced ? 1 : 0);
    if (id) cards.push(id);
  }
  // (a pity card that came out below ovanlig because the class had none above it is left as it is)
  const good = cards.some((id) => rarityIndex(runa(id)!.rarity) >= 1);
  return { cards, pity: good ? 0 : (o.pity ?? 0) + 1 };
}

/** A path's own runor are the ones tagged for it: a helper for the card ("fits your path"). */
export const fitsPath = (id: string, path: string | undefined): boolean => !!path && !!pathDef(path) && (runa(id)?.tags ?? []).some((t) => (PATH_TAGS[path] ?? []).includes(t));

/** A runa of the hero's class of exactly this rarity (else the nearest below, then above), not held and not in `avoid`; leaning to the path's tags. Null when the class has none left. */
export function runaOfRarity(rnd: () => number, o: { cls: ClassId; path?: string; held: readonly RunaHeld[]; rarity: RunRarity; avoid?: readonly string[] }): string | null {
  const taken = new Set([...o.held.map((h) => h.id), ...(o.avoid ?? [])]);
  const likes = new Set(o.path ? (PATH_TAGS[o.path] ?? []) : []);
  const pool = RUNOR.filter((r) => r.cls === o.cls && !taken.has(r.id));
  const want = rarityIndex(o.rarity);
  const order = [want, ...[...Array(want).keys()].reverse(), ...[3, 2, 1].filter((i) => i > want)];
  for (const tier of order) {
    const cands = pool.filter((r) => rarityIndex(r.rarity) === tier);
    if (!cands.length) continue;
    const w = cands.map((r) => (r.tags.some((t) => likes.has(t)) ? PATH_LEAN : 1));
    let x = rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) {
      x -= w[i]!;
      if (x < 0) return cands[i]!.id;
    }
    return cands[cands.length - 1]!.id;
  }
  return null;
}

/** A party-wide runa for a boss, a Mellanboss, an event or the Köpman: of at least `min` rarity (and of one of `tags` when there are any left), not held by the party yet. */
export function partyRuna(rnd: () => number, have: readonly string[], min: RunRarity = 'ovanlig', tags?: readonly RunTag[]): string | null {
  const free = RUNOR.filter((r) => r.cls === undefined && !have.includes(r.id));
  const byRarity = free.filter((r) => rarityIndex(r.rarity) >= rarityIndex(min));
  const byTag = (xs: RunaDef[]): RunaDef[] => (tags?.length ? xs.filter((r) => r.tags.some((t) => tags.includes(t))) : xs);
  const from = [byTag(byRarity), byRarity, byTag(free), free].find((xs) => xs.length) ?? [];
  return from.length ? from[Math.floor(rnd() * from.length)]!.id : null;
}
