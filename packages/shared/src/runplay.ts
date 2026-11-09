// A bot party that plays a whole run on a farm (for run.test.ts and the tuning of the numbers): families of one to four
// fighters, careful or clumsy, starting at the färdport and playing until the run is over. Not part of the game.
import { addObject } from './map.ts';
import { addItem } from './inventory.ts';
import { mulberry32 } from './rng.ts';
import { CLASSES, XP_LEVELS, newSagaProgress, type ClassId } from './saga.ts';
import { newMind, botStep, type BotMind, type BotStyle } from './runbot.ts';
import { ensureRunPlaces, fardportOf, archFrontOf, pickRuna, runOf, startRun, type StartOptions } from './runsim.ts';
import { grantPet } from './petsim.ts';
import { createPlayer, setOnline, tick, type SimCtx } from './sim.ts';
import { generateWorld } from './map.ts';
import type { Change } from './protocol.ts';
import { TILE, type PlayerState, type WorldState } from './types.ts';

export const SET: Record<ClassId, string> = { vaktare: 'jarnsvard', krigare: 'jarnyxa', helare: 'ekstav', magiker: 'ekstav' };

export interface Party {
  world: WorldState;
  players: PlayerState[];
  minds: Map<string, BotMind>;
  now: number;
  rnd: () => number;
  ctx: () => SimCtx;
}

/** A farm with the arch, and `classes.length` heroes of `level` in the starter set standing in front of it. */
export function makeParty(classes: ClassId[], opts: { level?: number; style?: BotStyle; seed?: number; longhall?: boolean; lane?: 'safe' | 'random'; pet?: string | string[] } = {}): Party {
  const world = generateWorld(opts.seed ?? 7);
  ensureRunPlaces(world);
  if (opts.longhall) {
    const f = archFrontOf(world);
    // the longhall (the fourth place and the hired companion) beside the arch, wherever it fits
    for (let r = 4; r < 30 && !Object.values(world.objects).some((o) => o.kind === 'longhall'); r++)
      for (let dx = -r; dx <= r; dx++) addObject(world, 'longhall', f.x + dx, f.y + r);
  }
  const party: Party = { world, players: [], minds: new Map(), now: 1_000_000, rnd: mulberry32((opts.seed ?? 7) * 31 + 5), ctx: () => ({ season: 'none', now: party.now, rnd: party.rnd }) };
  const front = archFrontOf(world);
  classes.forEach((cls, i) => {
    const p = createPlayer(world, `Bot${i + 1}`, { skin: '#f1c9a5', hair: '#2b2119', hairStyle: 'short' });
    p.saga = { ...newSagaProgress(), cls, heard: true, gear: { weapon: SET[cls], offhand: 'traskold', amulet: 'stenamulett' }, xp: XP_LEVELS[(opts.level ?? 3) - 1] ?? 0 };
    p.outfit = { ...p.outfit, hat: CLASSES[cls].outfit.hat, shirt: CLASSES[cls].outfit.shirt };
    addItem(p.inventory, 'healing_potion', 3);
    setOnline(world, p.id, true);
    p.x = (front.x + (i % 3) - 1) * TILE + TILE / 2;
    p.y = (front.y + 1 + Math.floor(i / 3)) * TILE + TILE / 2;
    party.players.push(p);
    const pet = Array.isArray(opts.pet) ? opts.pet[i] : opts.pet; // (every bot brings the same pet, or the list gives one per hero)
    if (pet) grantPet(world, p, pet, [], { quiet: true });
    party.minds.set(p.id, newMind(opts.style ?? 'careful', mulberry32(100 + i), opts.lane));
  });
  return party;
}

export interface Played {
  outcome: string;
  ms: number;
  changes: Change[];
  /** Run time (ms) when each new stop was entered. */
  zoneMs: number[];
  /** When the boss fell (ms of run time), if it did. */
  winMs?: number;
}

/** One 50 ms step: every bot thinks, the world ticks. */
export function step(party: Party, bots: boolean, out: Change[]): void {
  party.now += 50;
  const run = runOf(party.world);
  if (bots && run) {
    for (const p of party.players) {
      if (!run.party.includes(p.id)) continue;
      if (run.phase === 'pick' && run.offer && !(p.id in run.offer.votes)) out.push(...pickRuna(party.world, p.id, Math.floor(party.rnd() * run.offer.cards.length), party.ctx()));
      else if (run.phase !== 'pick') out.push(...botStep(party.world, p.id, party.minds.get(p.id)!, party.ctx(), 50));
    }
  }
  out.push(...tick(party.world, 50, party.ctx()));
}

/** Starts a run for the party and plays it until it is over (or `limitMs` of run time has passed). */
export function playRun(party: Party, start: StartOptions = {}, limitMs = 40 * 60_000): Played {
  const out: Change[] = [];
  const starter = party.players[0]!;
  const arch = fardportOf(party.world)!;
  void arch;
  out.push(...startRun(party.world, starter.id, start, party.ctx()));
  const run = runOf(party.world);
  if (!run) return { outcome: 'none', ms: 0, changes: out, zoneMs: [] };
  const zoneMs: number[] = [];
  let lastZone = 0;
  let at = 0;
  for (let t = 0; t < limitMs; t += 50) {
    step(party, true, out);
    at = run.elapsed;
    if (run.node !== lastZone) {
      zoneMs.push(at);
      lastZone = run.node;
    }
    if (run.phase === 'ended') break;
  }
  return { outcome: run.outcome ?? 'running', ms: at, changes: out, zoneMs, ...(run.victoryAt !== undefined ? { winMs: run.victoryAt } : {}) };
}
