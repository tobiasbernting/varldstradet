// The one place sagasim.ts reaches runsim.ts through (runsim.ts imports sagasim.ts, so sagasim cannot import it back).
// No imports here on purpose: this module is always ready, whichever of the cyclic modules is loaded first.
import type { Change } from './protocol.ts';
import type { PlayerState, WorldObject, WorldState } from './types.ts';
import type { SimCtx } from './sim.ts';

/** Pressing the use key on a run's zone exit. */
export const runHooks: {
  exit?: (world: WorldState, p: PlayerState, obj: WorldObject, ctx: SimCtx) => Change[];
  /** Blowing the party's horn (the bots reach it through here). */
  horn?: (world: WorldState, playerId: string, ctx: SimCtx) => Change[];
} = {};
