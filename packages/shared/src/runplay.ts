// A bot party that plays a whole run on a farm (for run.test.ts and the tuning of the numbers): families of one to four
// fighters, careful or clumsy, starting at the färdport and playing until the run is over. Not part of the game.

import { addItem } from './inventory.ts';
import { mulberry32 } from './rng.ts';
import { CLASSES, XP_LEVELS, newSagaProgress, type ClassId } from './saga.ts';
import { DISHES } from './run.ts';
import { newMind, botStep, type BotMind, type BotStyle } from './runbot.ts';
import { eventDef } from './events.ts';
import { pathsOf } from './paths.ts';
import { ensureRunPlaces, fardportOf, archFrontOf, buyItem, choosePath, pickRuna, runOf, startRun, voteEvent, type StartOptions } from './runsim.ts';
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
export function makeParty(classes: ClassId[], opts: { level?: number; style?: BotStyle; seed?: number; lane?: 'safe' | 'random'; pet?: string | string[] } = {}): Party {
  const world = generateWorld(opts.seed ?? 7);
  ensureRunPlaces(world);
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
    const pet = (Array.isArray(opts.pet) ? opts.pet[i] : opts.pet) ?? (typeof process !== 'undefined' ? process.env.BOT_PET : undefined); // (BOT_PET=hund runs the bot tests with a pet each) (every bot brings the same pet, or the list gives one per hero)
    if (pet) grantPet(world, p, pet, [], { quiet: true, now: 0 });
    party.minds.set(p.id, newMind(opts.style ?? 'careful', mulberry32(100 + i), opts.lane));
    // (Gillet: a bot eats whatever dish its seed says, of the five; one that is not served that run becomes the first that is)
    p.runPrefs = { dish: DISHES[((opts.seed ?? 7) + i) % DISHES.length]!.id };
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
  /** The fight stops cleared: kind, how long it took (ms) and the party's medal. */
  stops: { kind: string; ms: number; medal: number }[];
}

/** One 50 ms step: every bot thinks, the world ticks. */
/** The stops where the bots have already shopped (a bot buys once at each Köpman). */
const bought = new Set<string>();

export function step(party: Party, bots: boolean, out: Change[]): void {
  party.now += 50;
  const run = runOf(party.world);
  if (bots && run) {
    for (const p of party.players) {
      if (!run.party.includes(p.id)) continue;
      if (run.phase === 'path') {
        if (!run.paths[p.id]) {
          const list = pathsOf(p.saga!.cls!);
          out.push(...choosePath(party.world, p.id, list[Math.floor(party.rnd() * list.length)]!.id, party.ctx()));
        }
      } else if (run.phase === 'pick') {
        const o = run.offers[p.id];
        if (o && o.picked === undefined && o.cards.length) out.push(...pickRuna(party.world, p.id, Math.floor(party.rnd() * o.cards.length), party.ctx()));
      } else if (run.phase === 'event') {
        // the bots vote for the first choice they can pay for, spread out by luck
        const ev = run.event && eventDef(run.event.id);
        if (ev && run.event && !(p.id in run.event.votes)) {
          const ok = ev.choices.map((c, i) => ({ c, i })).filter((x) => (x.c.cost ?? 0) <= run.purse);
          let pick = ok[Math.floor(party.rnd() * ok.length)]?.i ?? 0;
          if (ev.id === 'bakhall') {
            // Skogen rör sig: the masher fights, the careful and the adult when everyone is above 70 % health, the clumsy by luck
            const style = party.minds.get(p.id)!.style;
            const fs = Object.values(party.world.areas?.[run.key]?.saga?.fighters ?? {});
            const healthy = fs.every((f) => f.down === undefined && f.hp >= f.max * 0.7);
            if (style === 'masher') pick = 0;
            else if (style === 'careful' || style === 'adult') pick = healthy ? 0 : 1;
          }
          out.push(...voteEvent(party.world, p.id, pick, party.ctx()));
        }
      } else {
        // at the Köpman a bot buys what it can: its dearest runa first, then a potion (once per stop)
        if (run.shop && !bought.has(`${run.id}:${run.node}:${p.id}`) && run.plan.stops[run.node]!.kind === 'shop') {
          bought.add(`${run.id}:${run.node}:${p.id}`);
          const slots = [...(run.shop.slots[p.id] ?? [])].map((x, i) => ({ x, i })).reverse();
          for (const { x, i } of slots) if (!x.bought) out.push(...buyItem(party.world, p.id, { item: 'runa', slot: i }, party.ctx()));
          out.push(...buyItem(party.world, p.id, { item: 'potion' }, party.ctx()));
        }
        out.push(...botStep(party.world, p.id, party.minds.get(p.id)!, party.ctx(), 50));
      }
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
  if (!run) return { outcome: 'none', ms: 0, changes: out, zoneMs: [], stops: [] };
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
  const stops = Object.entries(run.medals).map(([n, medal]) => ({ kind: run.plan.stops[Number(n)]!.kind as string, ms: run.stopMs[Number(n)] ?? 0, medal }));
  return { outcome: run.outcome ?? 'running', ms: at, changes: out, zoneMs, stops, ...(run.victoryAt !== undefined ? { winMs: run.victoryAt } : {}) };
}
