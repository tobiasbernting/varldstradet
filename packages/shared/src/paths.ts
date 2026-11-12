// Vägar (paths): after the Mellanboss each hero chooses one of two or three ways their class goes on, WoW-spec style. A path is data: for
// each of the class's five spells (the auto-attack and the four buttons, `classSpells`) what it changes (numbers and added effects, `SpellMod` in saga.ts, read generically by castSpell), a
// few traits that are no spell's, and a plain `RunEffect` for the rest. Roles stay: a Väktare path is still a tank, a Helare path a
// healer. Names and sentences are in sv.ts (PATH_NAMES, PATH_TEXT, PATH_SPELLS).
import type { RunEffect } from './run.ts';
import type { ClassId, PathTraits, SpellMod } from './saga.ts';

export interface PathDef {
  id: string;
  cls: ClassId;
  icon: string;
  /** A plain effect (health, crit, regen…) that comes with the path. */
  effect: RunEffect;
  traits: PathTraits;
  /** By spell id: the class's auto-attack and each of its four buttons (`classSpells`) has an entry that changes something. */
  mods: Record<string, SpellMod>;
}

export const PATHS: PathDef[] = [
  // Magiker: eld, is, åska
  {
    id: 'eld', cls: 'magiker', icon: '🔥', effect: {}, traits: {},
    mods: { eldboll: { burn: 0.075 }, runsmall: { burn: 0.06 }, isspjut: { power: 0.015, burn: 0.06 }, askregn: { radius: 1, burn: 0.06 }, blink: { cd: 0.06, range: 1 } },
  },
  {
    id: 'frost', cls: 'magiker', icon: '🧊', effect: {}, traits: {},
    mods: { eldboll: { slow: 1000 }, runsmall: { slow: 1500 }, isspjut: { ms: 2000, stun: 500, shield: 0.015 }, askregn: { slow: 1500, radius: 0.4 }, blink: { shield: 0.04, cd: 0.05 } },
  },
  {
    id: 'aska', cls: 'magiker', icon: '🌩️', effect: {}, traits: {},
    mods: { eldboll: { cd: 0.025, chain: 1 }, runsmall: { chain: 1 }, isspjut: { cd: 0.03, chain: 1 }, askregn: { cd: 0.05, power: 0.015, radius: 0.5 }, blink: { cd: 0.1, range: 2 } },
  },
  // Krigare: bärsärk, vapenmästare
  {
    id: 'barsark', cls: 'krigare', icon: '😡', effect: { leech: 0.02 }, traits: { low: 0.25 },
    mods: { yxhugg: { power: 0.015, cd: 0.015 }, jattehugg: { power: 0.05 }, stormsteg: { cd: 0.06, power: 0.05 }, virvelvind: { radius: 0.5, power: 0.03 }, raseri: { ms: 2500, cd: 0.05 } },
  },
  {
    id: 'vapen', cls: 'krigare', icon: '🎯', effect: { crit: 0.04 }, traits: {},
    mods: { yxhugg: { power: 0.06, cd: -0.08 }, jattehugg: { power: 0.03, radius: 1 }, stormsteg: { stun: 900, cd: 0.05, power: 0.06 }, virvelvind: { stun: 300, power: 0.015 }, raseri: { cd: 0.075, ms: -1500 } },
  },
  // Väktare: murvakt, hämnare
  {
    id: 'murvakt', cls: 'vaktare', icon: '🧱', effect: { armor: 0.02 }, traits: { aura: 0.05 },
    mods: { hugg: { power: 0.015, shield: 0.005 }, dunderslag: { power: 0.015, shield: 0.01 }, utmana: { ms: 1500, partyShield: 0.01 }, skoldslag: { shield: 0.02, ms: 400 }, skoldmur: { ms: 2000, cd: 0.05, partyShield: 0.02 } },
  },
  {
    id: 'hamnare', cls: 'vaktare', icon: '🌵', effect: { threat: 0.08 }, traits: { thorns: 0.3 },
    mods: { hugg: { power: 0.05 }, dunderslag: { power: 0.075 }, utmana: { base: 8, radius: 1 }, skoldslag: { power: 0.075 }, skoldmur: { cd: 0.075, ms: 600 } },
  },
  // Helare: ljus, natur
  {
    id: 'ljus', cls: 'helare', icon: '☀️', effect: { heal: 0.02 }, traits: {},
    mods: { solstrale: { power: 0.05 }, lakerunan: { power: 0.1, cd: -0.2 }, ljuspil: { power: 0.05 }, lakekrets: { radius: 1, power: 0.015 }, vackupp: { cd: 0.1, base: 15, range: 2 } },
  },
  {
    id: 'natur', cls: 'helare', icon: '🌳', effect: { regen: 0.1 }, traits: {},
    mods: { solstrale: { hot: 0.15 }, lakerunan: { hot: 0.1, power: -0.1 }, ljuspil: { slow: 1200 }, lakekrets: { ms: 2000, power: 0.04, radius: 0.5 }, vackupp: { hot: 0.2, cd: 0.04 } },
  },
];

export const pathDef = (id: string | undefined): PathDef | undefined => (id ? PATHS.find((p) => p.id === id) : undefined);
export const pathsOf = (cls: ClassId): PathDef[] => PATHS.filter((p) => p.cls === cls);
/** The path a hero gets when the clock runs out (the first of the class). */
export const defaultPath = (cls: ClassId): PathDef => pathsOf(cls)[0]!;
