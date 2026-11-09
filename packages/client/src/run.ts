// Runs (färdar) on the client: the run the server last told us about, its card offer, the sagaträd and the summary of the
// run that just ended, plus the clocks that tick between two server messages. The windows and the HUD are in ui/run.ts.
import type { Change, NodeKind, RunOfferSnap, RunOutcome, RunSnap } from '@lilla-garden/shared';
import { bus, client } from './state.ts';

/** The pictures of the stops of a route (the väg-runor on the floor carry the same ones) and their colours. */
export const KIND_ICON: Record<NodeKind, string> = { flock: '⚔️', mini: '👹', rest: '💚', boss: '👑' };
export const KIND_COLOR: Record<NodeKind, string> = { flock: '#ff9a3c', mini: '#c07cff', rest: '#4fe39a', boss: '#ffd23f' };

export interface RunEnded {
  outcome: RunOutcome;
  ms: number;
  seeds: number;
  zones: number;
  runor: string[];
  level?: number;
  spiritUsed?: number;
  path?: NodeKind[];
}
export interface TreeInfo {
  seeds: number;
  earned: number;
  tree: string[];
  stage: number;
}

export const runClient = {
  /** The run on the farm (any family member sees it, to be able to hang on) and when it arrived. */
  run: null as RunSnap | null,
  runAt: 0,
  offer: null as RunOfferSnap | null,
  offerAt: 0,
  tree: null as TreeInfo | null,
  ended: null as RunEnded | null,
  /** The last run I was in, as the summary needs its chapter. */
  last: null as RunSnap | null,
};

/** The run I am in (null: none, or I only see it from the farm). */
export const myRun = (): RunSnap | null => {
  const r = runClient.run;
  return r && r.phase !== 'ended' && r.party.some((p) => p.id === client.me) ? r : null;
};

/** Run time now (ms): the server's number plus what has passed since it arrived. */
export const runElapsed = (): number => (runClient.run ? runClient.run.elapsed + (performance.now() - runClient.runAt) : 0);
/** Time left of the vote on the way on (ms), or -1 until someone has stepped onto a rune. */
export const routeLeft = (): number => {
  const r = runClient.run;
  if (!r || r.routeLeft === undefined) return -1;
  return r.routeLeft < 0 ? -1 : Math.max(0, r.routeLeft - (performance.now() - runClient.runAt));
};
/** Time left of the vote on a runa (ms). */
export const offerLeft = (): number => (runClient.offer ? Math.max(0, runClient.offer.left - (performance.now() - runClient.offerAt)) : 0);

bus.on('change', (c: Change) => {
  if (c.t === 'run') {
    if (c.ev === 'state') {
      runClient.run = c.run;
      runClient.runAt = performance.now();
      if (!c.run) runClient.offer = null;
      if (myRun()) runClient.last = c.run;
    } else if (c.ev === 'offer') {
      runClient.offer = c.offer;
      runClient.offerAt = performance.now();
    } else if (c.ev === 'ended' && c.to === client.me) runClient.ended = { outcome: c.outcome, ms: c.ms, seeds: c.seeds, zones: c.zones, runor: c.runor, level: c.level, spiritUsed: c.spiritUsed, path: c.path };
  } else if (c.t === 'seed' && c.ev === 'tree' && c.to === client.me) runClient.tree = { seeds: c.seeds, earned: c.earned, tree: c.tree, stage: c.stage };
});
