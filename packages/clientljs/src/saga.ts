// Sagan om Världsträdet in the world: a boss's attacks marked on the ground (filling up until they land, burning
// pools that pulse), every spell and attack as light and motion (fireballs, ice lances, lightning, healing runes,
// shield walls, whirlwinds…), numbers floating up from hits, health bars over monsters and friends, a ring under
// your target, and friends lying down when fallen or standing in ice when frozen. Drawn in four layers: on the
// ground (lit with the scene), into the light map (so magic lights up a dark dungeon), in the y-sorted queue, and
// glowing on top. Out in the world a hero's spells and hits are drawn the same way (the telegraphs, bars and the
// fallen and frozen are the dungeons' only).
import { cameraShake, drawEllipse, drawLine, drawLineList, drawPoly, rgb, setAdditiveBlendMode, vec2, type Color, type Vector2 } from 'littlejsengine';
import { BLOCK_SPECIES, CLASSES, CLASS_IDS, FIGHT_UI, MOB_FLAG, PIP_MAX, ROLE, SAGA_BOSSES, SAGA_MOBS, SPELLS, SPEND, T, TILE, fmt, isSagaKey, type Change, type MobRole, type SagaZone } from '@varldstradet/shared';
import { FLAG, classOf, fightMode, firstTime, flagsOf, isFoe, pipHalf, liveTarget, markedMob, sagaSnap, setTarget, webbed } from '@v1/saga.ts';
import { castFill, hitStopMs, juiceOf, poofCount, shakeOf, spendClass, type Juice } from '@v1/fight.ts';
import { effectiveFx } from '@v1/fxprefs.ts';
import { castRing, pipRow, roleMarker, setPips, skullMark, tickMark } from '@v1/ui/fightcard.ts';
import { SAGA_SFX, bossWindup } from '@v1/sagasfx.ts';
import { activeWorld, bus, client, myPlayer, serverNow } from '@v1/state.ts';
import { zoomPx } from '@v1/ui/hud.ts';
import { calm, prefs } from '@v1/a11y.ts';
import type { Sprites } from './art.ts';
import type { Effects } from './fx.ts';
import { clamp01, DrawQueue, drawSprite, easeOutBack, easeOutCubic, lerp, rgba } from './gfx.ts';

/** Where an actor stands (feet, world pixels) and how big its picture is. */
export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Find = (id: string | number) => Spot | null;

type Layer = 'ground' | 'bright' | 'light';
interface Fx {
  /** Seconds since it started (below zero while it waits to start). */
  t: number;
  dur: number;
  /** Start and end (world pixels); `on` follows a target that moves. */
  x: number;
  y: number;
  tx: number;
  ty: number;
  on?: string | number;
  draw: (layer: Layer, f: Fx, k: number) => void;
}

interface Floater {
  el: HTMLDivElement;
  on: string | number;
  x: number;
  y: number;
  /** Where it rises, beside and above the others that came with it. */
  dx: number;
  dy: number;
  born: number;
  /** Seconds it is shown (as long as its animation in saga.css). */
  life: number;
  /** Shown from this time (a fireball's number waits until it lands). */
  at: number;
}

const TAU = Math.PI * 2;
/** The heroes' auto-attacks (swung about once a second: a quiet sound) and their spenders (slot 1: as big as its pips). */
const AUTOS: ReadonlySet<string> = new Set(CLASS_IDS.map((c) => CLASSES[c].auto));
const SPENDERS: ReadonlySet<string> = new Set(CLASS_IDS.map((c) => CLASSES[c].spells[0]));
/** What a monster's label shows over its bar: its role's marker, a cast's circle, a hero's pips. */
interface BarTop {
  role?: MobRole;
  /** A cast in progress: [kind, started, lands at, stoppable]. */
  cast?: readonly [string, number, number, 0 | 1];
  flags?: number;
  /** A hero's pips, in their class's colour. */
  pips?: { cls: keyof typeof CLASSES; n: number; half?: boolean };
  mine?: boolean;
  /** Märke: the party's skull is on this monster. */
  skull?: boolean;
  /** This hero stands in Guldringen. */
  inRing?: boolean;
}
interface BarParts {
  role: string;
  castKey: string;
  ring: HTMLElement | null;
  pips: HTMLElement | null;
  pipsCls: string;
  skull: HTMLElement | null;
  tick: HTMLElement | null;
}
/** The warning colour of a wind-up on the ground: red, or (colour-blind-safe) the orange of the Okabe-Ito palette, which keeps its light-
 *  ness against dark floors and is not mixed up with green or brown; the stripes and the white edge carry the meaning in both. */
const warnColour = (): [number, number, number] => (prefs().cb ? [0.9, 0.62, 0] : [0.85, 0.08, 0.06]);
/** The colour of what is GOOD to stand in (Guldringen, a Kraftklot): gold, or sky blue beside the colour-blind-safe orange dangers. */
const goodColour = (): [number, number, number] => (prefs().cb ? [0.34, 0.71, 0.91] : [1, 0.82, 0.2]);
const W = (v: number): number => v / TILE;
const P = (x: number, y: number): Vector2 => vec2(x / TILE, -y / TILE);
const col = (r: number, g: number, b: number, a = 1): Color => rgb(r, g, b, Math.max(0, Math.min(1, a)));
/** Light painted into the light map: kept gentle, so a lit dungeon is not washed out by the night glow. */
const LIGHT = 0.5;
const light = (r: number, g: number, b: number, a: number): number => rgba(r, g, b, a * LIGHT);
/** Colours of a boss's moves while it gathers power. */
const MOVE_COLOUR: Record<string, [number, number, number]> = {
  cleave: [1, 0.55, 0.15],
  slam: [1, 0.75, 0.35],
  rain: [0.55, 0.85, 1],
  charge: [1, 1, 1],
  freeze: [0.5, 0.95, 1],
  pools: [1, 0.4, 0.1],
  nova: [0.85, 0.3, 1],
  summon: [0.5, 1, 0.5],
  line: [1, 0.85, 0.55],
  pull: [0.55, 0.45, 1],
  mend: [0.45, 1, 0.55],
  ring: [1, 0.82, 0.2],
};
/** Some bosses' moves look like where they live: the frost giant's breath and snowstorm are icy, Surt's wrath is fire. */
const BOSS_MOVE_COLOUR: Record<string, Record<string, [number, number, number]>> = {
  rimturs: { cleave: [0.55, 0.88, 1], nova: [0.75, 0.92, 1] },
  surt: { nova: [1, 0.45, 0.12] },
  hel: { nova: [0.6, 1, 0.8], pull: [0.55, 1, 0.75] },
  jarnvakten: { line: [1, 1, 1] },
  blackis: { line: [0.6, 0.5, 0.9] },
  jormungand: { line: [0.4, 0.9, 1], pull: [0.35, 0.75, 1], nova: [0.5, 1, 0.3] },
  fafner: { cleave: [1, 0.6, 0.15], mend: [1, 0.85, 0.35] },
  nattmara: { nova: [0.6, 0.45, 1], mend: [0.75, 0.6, 1] },
  loke: { line: [0.4, 0.9, 1], pull: [0.55, 1, 0.75], mend: [0.5, 1, 0.4] },
};
const moveColour = (move: string, by: string | number | undefined): [number, number, number] => {
  const species = typeof by === 'number' ? activeWorld()?.animals[by]?.species : undefined;
  return (species ? BOSS_MOVE_COLOUR[species]?.[move] : undefined) ?? MOVE_COLOUR[move] ?? [1, 0.4, 0.2];
};
/** The bottom of the boss's bars at the top of the screen (screen px; 0 without them). */
function hudFloor(): number {
  let floor = 0;
  for (const el of document.querySelectorAll<HTMLElement>('.saga-boss, .saga-cast')) floor = Math.max(floor, el.getBoundingClientRect().bottom);
  return floor;
}
/** Spells that fly from the caster to the target (pixels a second) and their colour. */
const BOLTS: Record<string, { speed: number; c: [number, number, number]; size: number }> = {
  eldboll: { speed: 210, c: [1, 0.5, 0.12], size: 12 },
  isspjut: { speed: 300, c: [0.55, 0.9, 1], size: 9 },
  ljuspil: { speed: 320, c: [1, 0.92, 0.45], size: 8 },
  mob_isande: { speed: 170, c: [0.6, 0.9, 1], size: 8 },
};
/** Monsters' ranged attacks that have no look of their own: a ghostly green bolt. */
const MOB_BOLT = { speed: 190, c: [0.55, 1, 0.55] as [number, number, number], size: 7 };

export class SagaView {
  /** In a saga dungeon (telegraphs, bars, the fallen and frozen), or just on a map (spells and numbers). */
  private on = false;
  private live = false;
  private area = '';
  /** The move each boss is winding up, and the move each telegraph belongs to (for pulls and mends). */
  private castMove = new Map<number, string>();
  private zoneMove = new Map<string, string>();
  private t = 0;
  private list: Fx[] = [];
  private floaters: Floater[] = [];
  /** When each telegraph was first seen (server ms), for the fill. */
  private born = new Map<string, number>();
  /** A number about to come for a target hit by something still in the air. */
  private delay: { on: string | number; until: number } | null = null;
  private bars = new Map<string, HTMLDivElement>();
  /** A boss's gathering of power, so it can end when the attack is stopped. */
  private windups = new Map<number, Fx>();
  private lastHurtSound = 0;
  private lastCritSound = 0;
  private lastMarkSound = 0;
  private barParts = new Map<string, BarParts>();
  /** Every hero's pips at the last look (a spender's blow is as big as the pips it used). */
  private pipsSeen = new Map<string, number>();
  /** The spender that just went off: the hits that come with it are its numbers. */
  private spent: { until: number; pips: number; by: string } | null = null;
  /** Monsters that see stars (Öppning) and Sköldbärare whose dome is up, to notice the change. */
  private openSeen = new Set<number>();
  private domeUp = new Map<number, { x: number; y: number }>();
  private castSeen = new Map<number, string>();
  /** Märke: the monster that carried the skull at the last look (undefined before the first). */
  private skullSeen: number | null | undefined = undefined;
  /** Where each monster stood last (a beaten one's poof). */
  private lastSpot = new Map<number, Spot>();
  /** Hit-stop: until when (performance.now) the fight's pictures stand still, and who is frozen. */
  private stopUntil = 0;
  private stopped_ = new Set<string | number>();
  /** A hit monster flashes white: when (this.t) and how hard. */
  private flashes = new Map<number, { at: number; power: number }>();
  /** The view's hook: a hit body squashes. */
  onPunch: ((id: string | number, power: number) => void) | null = null;

  constructor(
    private art: Sprites,
    private labels: HTMLElement,
    private fx: Effects,
    private find: Find,
  ) {
    bus.on('change', (c) => this.onChange(c));
  }

  /** A new map: dungeons have all of this, the world a hero's spells. */
  load(area: string): void {
    this.clear();
    this.area = area;
    this.live = true;
    this.on = isSagaKey(area);
    if (!this.on) return;
    const now = serverNow();
    for (const z of activeWorld()?.saga?.zones ?? []) this.born.set(z.id, Math.min(now, z.at - 1200));
  }

  clear(): void {
    this.list = [];
    for (const f of this.floaters) f.el.remove();
    this.floaters = [];
    for (const b of this.bars.values()) b.remove();
    this.bars.clear();
    this.windups.clear();
    this.born.clear();
    this.delay = null;
    this.castMove.clear();
    this.zoneMove.clear();
    this.barParts.clear();
    this.pipsSeen.clear();
    this.openSeen.clear();
    this.domeUp.clear();
    this.castSeen.clear();
    this.skullSeen = undefined;
    this.lastSpot.clear();
    this.flashes.clear();
    this.stopped_.clear();
    this.spent = null;
    this.on = false;
    this.live = false;
  }

  // ------------------------------------------------------------------ juice, under the settings

  private juice(): Juice {
    return juiceOf(prefs(), effectiveFx());
  }

  private shake(what: Parameters<typeof shakeOf>[0]): void {
    const v = shakeOf(what, this.juice());
    if (v > 0) cameraShake(v);
  }

  /** A blink of stillness: the fight's effects and the bodies named stop moving (never the input, the camera or the network). */
  private hitStop(what: Parameters<typeof hitStopMs>[0], who: (string | number | undefined)[]): void {
    const ms = hitStopMs(what, this.juice());
    (globalThis as { __juiceLog?: string[] }).__juiceLog?.push(`stop:${what}:${ms}`);
    if (ms <= 0) return;
    const now = performance.now();
    if (now >= this.stopUntil) this.stopped_.clear();
    this.stopUntil = Math.max(this.stopUntil, now + ms);
    for (const id of who) if (id !== undefined) this.stopped_.add(id);
  }

  /** How far (screen px) a hero's name is lifted to stand clear of the pips over their bar. */
  nameLift(id: string): number {
    const row = this.on ? this.barParts.get(`p${id}`)?.pips : null;
    return row ? row.offsetHeight + 3 : 0;
  }

  /** Is this body held still by a hit-stop right now? (The view skips its animation meanwhile.) */
  held(id: string | number): boolean {
    return performance.now() < this.stopUntil && this.stopped_.has(id);
  }

  /** How white a hit monster is right now (0..1), for the view's additive tint. */
  flashOf(id: number): number {
    const f = this.flashes.get(id);
    if (!f) return 0;
    const k = (this.t - f.at) / 0.14;
    if (k >= 1 || k < 0) {
      this.flashes.delete(id);
      return 0;
    }
    return (1 - k) * f.power;
  }

  /** A monster was hit: a white flash and a squash (bigger for a big blow), as the settings allow. */
  private punch(id: number, power: number): void {
    const j = this.juice();
    if (j.flash) this.flashes.set(id, { at: this.t, power: Math.min(1, 0.55 + power * 0.15) });
    if (j.squash) this.onPunch?.(id, 1.2 + power * 0.9);
  }

  /** Fallen (lying down) or frozen (in the ice), for drawing a player. */
  pose(id: string): 'down' | 'frozen' | null {
    if (!this.on) return null;
    const fl = flagsOf(id);
    return fl & FLAG.down ? 'down' : fl & FLAG.frozen ? 'frozen' : null;
  }

  /** Dungeon monsters show their own bars instead of the name labels. */
  ownsLabel(species: string): boolean {
    return this.on && (!!SAGA_MOBS[species] || !!SAGA_BOSSES[species]);
  }

  /** The monster at a spot of the world (a right click or a long press marks it). */
  mobAt(wx: number, wy: number): number | null {
    if (!this.on) return null;
    let best: number | null = null;
    let bestD = Infinity;
    for (const a of Object.values(activeWorld()?.animals ?? {})) {
      if (!isFoe(a) || BLOCK_SPECIES.has(a.species)) continue;
      const s = this.find(a.id);
      if (!s || Math.abs(wx - s.x) > s.w / 2 + 6 || wy < s.y - s.h - 2 || wy > s.y + 9) continue;
      const d = Math.hypot(wx - s.x, wy - (s.y + 4 - s.h / 2));
      if (d < bestD) {
        bestD = d;
        best = a.id;
      }
    }
    return best;
  }

  /** A click or tap on the world: a monster (or a friend) there becomes the target. True if something was picked. */
  pick(wx: number, wy: number): boolean {
    if (!this.on && !(this.live && fightMode())) return false;
    let best: string | number | null = null;
    let bestD = Infinity;
    const consider = (id: string | number): void => {
      const s = this.find(id);
      if (!s) return;
      const top = s.y + 4 - s.h;
      if (Math.abs(wx - s.x) > s.w / 2 + 4 || wy < top - 3 || wy > s.y + 7) return;
      const d = Math.hypot(wx - s.x, wy - (s.y + 4 - s.h / 2));
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    };
    for (const a of Object.values(activeWorld()?.animals ?? {})) if (isFoe(a)) consider(a.id);
    for (const id of Object.keys(sagaSnap()?.f ?? {})) if (id !== client.me) consider(id);
    if (best === null) return false;
    setTarget(best);
    return true;
  }

  // ------------------------------------------------------------------ from the server

  private onChange(c: Change): void {
    if (!this.live) return;
    if (c.t === 'spell' && c.area === this.area) return this.spell(c);
    if (c.t === 'hit' && c.area === this.area) return this.hit(c);
    // experience for you, on the map you are on (the farm's has no area)
    if (c.t === 'xp' && c.to === client.me && (c.area ?? 'farm') === this.area) return this.xp(c.n);
    if (!this.on) return;
    if (c.t === 'animal' && !c.animal && (c.area ?? '') === this.area) return this.gone(c.id);
    if (c.t === 'object' && c.obj?.kind === 'saga_plate' && c.obj.variant === 1 && (c.area ?? '') === this.area) return this.plateLit(c.obj.x, c.obj.y);
    if (c.t === 'zone') {
      if (c.zone && !this.born.has(c.id)) {
        this.born.set(c.id, serverNow());
        const move = this.castMove.get(c.zone.by);
        if (move && c.zone.at > serverNow()) this.zoneMove.set(c.id, move);
        const me = myPlayer();
        // something is about to land near you
        // (a Skytt's line: its bow creaks as it is drawn)
        if (c.zone.kind === 'gold') SAGA_SFX.ringChime();
        else if (c.zone.kind === 'orb') {
          if (me && Math.hypot(me.x - c.zone.x, me.y - c.zone.y) / TILE < 12) SAGA_SFX.orbHum((c.zone.until ?? c.zone.at) - serverNow());
        } else if (c.zone.kind === 'shot') {
          if (me && Math.hypot(me.x - c.zone.x, me.y - c.zone.y) / TILE < 14) SAGA_SFX.creak();
        } else if (me && serverNow() < c.zone.at && Math.hypot(me.x - c.zone.x, me.y - c.zone.y) / TILE < c.zone.r + 2.5) SAGA_SFX.warn();
      } else if (!c.zone)
        setTimeout(() => {
          this.born.delete(c.id);
          this.zoneMove.delete(c.id);
        }, 100);
    }
  }

  /** A rune plate lights up under someone's feet: a chime and a fountain of sparkles. */
  private plateLit(tx: number, ty: number): void {
    const at = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
    SAGA_SFX.plate();
    this.fx.spawn(at.x, at.y - 4, 'sparkle');
    this.add(0.9, (layer, f, k) => {
      if (layer === 'light') {
        drawSprite(this.art.glow, at.x, at.y, 70, 70, 0, light(1, 0.9, 0.5, 0.8 * (1 - k)));
        return;
      }
      if (layer === 'ground') {
        this.runeCircle(at.x, at.y, 6 + 10 * easeOutCubic(k), this.t * 2, col(1, 0.9, 0.5, 1 - k), 4);
        return;
      }
      drawSprite(this.art.glow, at.x, at.y - 10 * k, 10, 28 * (1 - k * 0.5), 0, rgba(1, 0.92, 0.55, 0.6 * (1 - k)));
    }, at);
  }

  /** The move a telegraph belongs to (known for zones that came with a boss's wind-up). */
  private moveOf(z: SagaZone): string | undefined {
    // a mend's mark is a small harmless circle on the boss itself
    return this.zoneMove.get(z.id) ?? (z.dmg === 0 && z.r <= 1 ? 'mend' : undefined);
  }

  private add(dur: number, draw: Fx['draw'], at: { x: number; y: number }, to?: { x: number; y: number }, on?: string | number, delay = 0): Fx {
    const f: Fx = { t: -delay, dur, x: at.x, y: at.y, tx: to?.x ?? at.x, ty: to?.y ?? at.y, on, draw };
    this.list.push(f);
    return f;
  }

  /** The middle of someone's body (where things hit them). */
  private body(id: string | number | undefined, fallback: { x: number; y: number }): { x: number; y: number } {
    const s = id !== undefined ? this.find(id) : null;
    return s ? { x: s.x, y: s.y + 4 - s.h * 0.55 } : { x: fallback.x, y: fallback.y - 8 };
  }

  private spell(c: Extract<Change, { t: 'spell' }>): void {
    const me = myPlayer();
    const mine = c.by === client.me;
    const near = !me || Math.hypot(me.x - c.x, me.y - c.y) < 16 * TILE;
    if (c.spell === 'ring_won' || c.spell === 'ring_lost') return this.ringEnd(c.spell === 'ring_won', c.by, { x: c.x, y: c.y });
    if (mine || near) {
      if (c.spell === 'cast_ring') {
        /* (the ring's own chime plays when it appears on the floor) */
      } else if (c.spell === 'cast_far') SAGA_SFX.lob();
      else if (c.spell.startsWith('cast_')) {
        const a = typeof c.by === 'number' ? activeWorld()?.animals[c.by] : undefined;
        const move = c.spell.slice(5);
        bossWindup(move, SAGA_BOSSES[a?.species ?? '']?.moves.find((m) => m.move === move)?.warn ?? 1500);
      } else if (typeof c.by === 'string' && SPENDERS.has(c.spell)) {
        /* (its sound is as big as its pips: spend()) */
      } else if (!(typeof c.by === 'string' && AUTOS.has(c.spell) && this.on && SAGA_SFX.auto(c.spell, mine))) SAGA_SFX.spell(c.spell);
    }
    const from = { x: c.x, y: c.y };
    const to = c.tx !== undefined && c.ty !== undefined ? { x: c.tx, y: c.ty } : null;
    const s = c.spell;
    const bolt = BOLTS[s] ?? (s.startsWith('mob_') && s !== 'mob_draugbage' ? MOB_BOLT : null);
    if (bolt && to) return this.bolt(s, bolt, from, to, c.on, c.by);
    if (s === 'mob_draugbage' && to) {
      // an arrow from the bow
      const end = this.body(c.on, to);
      this.fx.spawn(end.x, end.y + 6, 'arrow', { x: from.x, y: from.y - 2 });
      this.holdNumbers(c.on, Math.min(0.26, Math.hypot(end.x - from.x, end.y - from.y) * 0.0025));
      return;
    }
    if (s === 'cast_far') return to ? this.lob(c.by, from, to) : undefined;
    if (s.startsWith('cast_')) {
      const move = s.slice(5);
      if (typeof c.by === 'number') {
        this.castMove.set(c.by, move);
        // telegraphs that arrived before the wind-up's own message
        for (const z of activeWorld()?.saga?.zones ?? []) if (z.by === c.by && z.at > serverNow() && !this.zoneMove.has(z.id)) this.zoneMove.set(z.id, move);
      }
      return this.windup(move, c.by, from);
    }
    if (s.startsWith('land_')) return this.land(s.slice(5), from, c.by);
    if (typeof c.by === 'string' && SPENDERS.has(s)) return this.spend(c, from, to ?? from, mine || near);
    switch (s) {
      case 'hugg':
        return this.slash(c.on, to ?? from, [0.9, 0.95, 1], 10, 1);
      case 'yxhugg':
        this.fx.spawn((to ?? from).x, (to ?? from).y, 'chop');
        return this.slash(c.on, to ?? from, [1, 0.55, 0.25], 12, 1.6);
      case 'claw':
        return this.claw(c.on, to ?? from);
      // the pets (pets.ts)
      case 'pet_bite':
        return this.slash(c.on, to ?? from, [1, 0.92, 0.75], 7, 0.9);
      case 'pet_pounce':
        this.fx.spawn((to ?? from).x, (to ?? from).y, 'chop');
        return this.slash(c.on, to ?? from, [1, 0.7, 0.3], 13, 1.7);
      case 'pet_purr':
        return this.healRune(c.on ?? c.by, to ?? from, 13, 0.9);
      case 'pet_roar':
        return this.taunt(c.by, from);
      case 'pet_howl':
        return this.burstRing(c.by, from, [0.7, 0.85, 1], 32, 0.7);
      case 'pet_mark':
        return this.explode(to ?? from, [1, 0.45, 0.85], 12, c.on);
      case 'pet_ram':
        return this.charge(from, to ?? from, c.on);
      case 'pet_dig':
        return this.explode({ x: from.x + 4, y: from.y }, [1, 0.9, 0.45], 7);
      case 'utmana':
        return this.taunt(c.by, from);
      case 'skoldslag':
        return this.bash(c.on, to ?? from);
      case 'skoldmur':
        return this.burstRing(c.by, from, [1, 0.85, 0.45], 26, 0.45);
      case 'lakerunan':
        return this.healRune(c.on ?? c.by, to ?? from, 18, 0.9);
      case 'lakekrets':
        return this.healRing(c.by, from, (SPELLS.lakekrets?.radius ?? 4) * TILE);
      case 'vackupp':
        return this.sunrise(c.on, to ?? from);
      case 'stormsteg':
        return this.charge(from, to ?? from, c.on);
      case 'virvelvind':
        return this.whirl(c.by, from, (SPELLS.virvelvind?.radius ?? 2.2) * TILE);
      case 'raseri':
        return this.burstRing(c.by, from, [1, 0.3, 0.1], 30, 0.5);
      case 'askregn':
        return this.storm(to ?? from, (SPELLS.askregn?.radius ?? 2.4) * TILE);
      case 'blink':
        return this.blink(from, to ?? from);
      case 'potion':
        return this.potion(c.by, from);
      case 'charge_land':
        return this.bossCharge(from, to ?? from);
    }
  }

  /** A fireball, an ice lance, a light arrow or a monster's bolt: flies, then bursts on the target. */
  private bolt(id: string, b: { speed: number; c: [number, number, number]; size: number }, from: { x: number; y: number }, to: { x: number; y: number }, on: string | number | undefined, by: string | number): void {
    const start = this.body(by, from);
    const end0 = this.body(on, to);
    const dist = Math.hypot(end0.x - start.x, end0.y - start.y);
    const travel = Math.max(0.1, Math.min(0.6, dist / b.speed));
    this.holdNumbers(on, travel);
    const [r, g, bl] = b.c;
    const ice = id === 'isspjut' || id === 'mob_isande';
    const fire = id === 'eldboll';
    const trail: { x: number; y: number; t: number }[] = [];
    this.add(travel, (layer, f, k) => {
      const end = this.body(f.on, { x: f.tx, y: f.ty });
      const x = lerp(start.x, end.x, k);
      const y = lerp(start.y, end.y, k) - Math.sin(k * Math.PI) * (fire ? 6 : 2);
      const ang = Math.atan2(end.y - start.y, end.x - start.x);
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y, 56, 56, 0, light(r, g, bl, 0.55));
        return;
      }
      if (layer !== 'bright') return;
      if (trail.length === 0 || this.t - trail[trail.length - 1]!.t > 0.016) trail.push({ x, y, t: this.t });
      for (const p of trail) {
        const age = (this.t - p.t) / 0.22;
        if (age >= 1) continue;
        const sz = b.size * (1 - age) * (fire ? 1.1 : 0.8);
        drawSprite(this.art.glow, p.x + (fire ? Math.sin(p.t * 40) * 1.2 : 0), p.y - (fire ? age * 4 : 0), sz, sz, 0, rgba(r, g * (fire ? 0.8 - age * 0.4 : 1), bl, 0.55 * (1 - age)));
      }
      if (ice) {
        // a long shard pointing where it flies
        drawSprite(this.art.glow, x, y, b.size * 2.2, b.size * 0.55, ang, rgba(r, g, bl, 0.9));
        drawSprite(this.art.glow, x + Math.cos(ang) * 3, y + Math.sin(ang) * 3, b.size * 1.1, b.size * 0.3, ang, rgba(1, 1, 1, 1));
      } else {
        drawSprite(this.art.glow, x, y, b.size * 1.8, b.size * 1.8, 0, rgba(r, g, bl, 0.75));
        drawSprite(this.art.glow, x, y, b.size * 0.75, b.size * 0.75, 0, rgba(1, 1, 0.9, 1));
      }
    }, from, to, on);
    // the burst where it lands
    if (fire) this.explode(end0, [1, 0.5, 0.12], 22, on, travel);
    else if (ice) this.shatter(end0, [0.6, 0.92, 1], on, travel);
    else this.explode(end0, b.c, 12, on, travel);
  }

  /** A burst of light and sparks (on someone: it follows them; after a delay: when a bolt lands). */
  private explode(spot: { x: number; y: number }, c: [number, number, number], size: number, on?: string | number, delay = 0): void {
    const [r, g, b] = c;
    const sparks = [...Array(7)].map((_, i) => ({ a: (i / 7) * TAU + Math.random() * 0.6, v: 18 + Math.random() * 16 }));
    this.add(0.4, (layer, f, k) => {
      const at = on !== undefined ? this.body(on, spot) : spot;
      if (layer === 'light') {
        drawSprite(this.art.glow, at.x, at.y, size * 5, size * 5, 0, light(r, g, b, 0.7 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      const e = easeOutCubic(k);
      drawSprite(this.art.glow, at.x, at.y, size * (0.8 + e * 1.6), size * (0.8 + e * 1.6), 0, rgba(r, g, b, 0.85 * (1 - k)));
      drawSprite(this.art.glow, at.x, at.y, size * 0.7 * (1 - k), size * 0.7 * (1 - k), 0, rgba(1, 1, 0.85, 1 - k));
      for (const s of sparks) drawSprite(this.art.glow, at.x + Math.cos(s.a) * s.v * e, at.y + Math.sin(s.a) * s.v * e - 4 * e, 3.5, 3.5, 0, rgba(r, g, b, 1 - k));
    }, spot, undefined, on, delay);
  }

  private shatter(spot: { x: number; y: number }, c: [number, number, number], on?: string | number, delay = 0): void {
    const [r, g, b] = c;
    const bits = [...Array(8)].map((_, i) => ({ a: (i / 8) * TAU + Math.random() * 0.5, v: 12 + Math.random() * 14, spin: (Math.random() - 0.5) * 12 }));
    this.add(0.5, (layer, f, k) => {
      const at = on !== undefined ? this.body(on, spot) : spot;
      if (layer === 'light') {
        drawSprite(this.art.glow, at.x, at.y, 60, 60, 0, light(r, g, b, 0.5 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      const e = easeOutCubic(k);
      drawSprite(this.art.glow, at.x, at.y, 20 * (1 - k * 0.5), 20 * (1 - k * 0.5), 0, rgba(r, g, b, 0.6 * (1 - k)));
      for (const s of bits) drawSprite(this.art.glow, at.x + Math.cos(s.a) * s.v * e, at.y + Math.sin(s.a) * s.v * e + 8 * k * k, 6, 2, s.a + s.spin * k, rgba(0.85, 0.97, 1, 1 - k));
    }, spot, undefined, on, delay);
  }

  /** A sword or axe swipe across the target. */
  private slash(on: string | number | undefined, at: { x: number; y: number }, c: [number, number, number], radius: number, width: number): void {
    const [r, g, b] = c;
    const a0 = -2.4 + Math.random() * 0.5;
    this.add(0.26, (layer, f, k) => {
      if (layer !== 'bright') return;
      const m = this.body(f.on, at);
      const reveal = easeOutCubic(Math.min(1, k * 1.8));
      const n = 9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        if (u > reveal) break;
        const a = a0 + u * 2.3;
        const x = m.x + Math.cos(a) * radius;
        const y = m.y + Math.sin(a) * radius * 0.75;
        const fade = (1 - k) * Math.sin(u * Math.PI);
        drawSprite(this.art.glow, x, y, 5 * width, 5 * width, 0, rgba(r, g, b, 0.9 * fade));
        drawSprite(this.art.glow, x, y, 2 * width, 2 * width, 0, rgba(1, 1, 1, fade));
      }
      if (k < 0.4) drawSprite(this.art.glow, m.x, m.y, 14, 14, 0, rgba(1, 1, 1, 0.5 * (1 - k / 0.4)));
    }, at, undefined, on);
  }

  /** A monster's claws: three red scratches. */
  private claw(on: string | number | undefined, at: { x: number; y: number }): void {
    this.add(0.3, (layer, f, k) => {
      if (layer !== 'bright') return;
      const m = this.body(f.on, at);
      const reveal = Math.min(1, k * 3);
      for (let i = -1; i <= 1; i++) {
        const x0 = m.x - 5 + i * 3;
        const y0 = m.y - 6;
        drawLine(P(x0, y0), P(x0 + 7 * reveal, y0 + 10 * reveal), W(1.2), col(1, 0.25, 0.2, 0.9 * (1 - k)));
      }
    }, at, undefined, on);
  }

  /** Utmana!: a shout ringing out, and every monster it reaches flashes. */
  private taunt(by: string | number, at: { x: number; y: number }): void {
    const reach = (SPELLS.utmana?.radius ?? 5) * TILE;
    const hit = Object.values(activeWorld()?.animals ?? {}).filter((a) => isFoe(a) && Math.hypot(a.x - at.x, a.y - at.y) <= reach + 6);
    this.add(0.6, (layer, f, k) => {
      const m = this.body(by, at);
      if (layer === 'ground') {
        this.ring(m.x, m.y + 6, reach * easeOutCubic(k), 2.5 * (1 - k) + 0.5, col(1, 0.45, 0.2, 0.8 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      drawSprite(this.art.glow, m.x, m.y, 26, 26, 0, rgba(1, 0.4, 0.15, 0.6 * (1 - k)));
      for (const a of hit) {
        const s = this.find(a.id);
        if (s) drawSprite(this.art.glow, s.x, s.y + 4 - s.h - 4, 12, 12, 0, rgba(1, 0.25, 0.1, (1 - k) * 0.9));
      }
    }, at);
  }

  /** Sköldslag: a blue flash, and stars circling a dazed head. */
  private bash(on: string | number | undefined, at: { x: number; y: number }): void {
    const ms = (SPELLS.skoldslag?.ms ?? 1500) / 1000;
    this.burstRing(on, at, [0.5, 0.75, 1], 16, 0.35);
    if (!this.on) this.stars(on, at, ms); // (in a dungeon the stars follow the monster's dazed state: drawAuras)
  }

  private stars(on: string | number | undefined, at: { x: number; y: number }, dur: number): void {
    this.add(dur, (layer, f, k) => {
      if (layer !== 'bright') return;
      const s = f.on !== undefined ? this.find(f.on) : null;
      const hx = s?.x ?? at.x;
      const hy = s ? s.y + 4 - s.h - 2 : at.y - 18;
      for (let i = 0; i < 3; i++) {
        const a = this.t * 7 + (i / 3) * TAU;
        drawSprite(this.art.glow, hx + Math.cos(a) * 6, hy + Math.sin(a) * 2, 4, 4, 0, rgba(1, 0.95, 0.4, Math.min(1, (1 - k) * 4)));
      }
    }, at, undefined, on);
  }

  /** A ring of light bursting out of someone (shield wall, rage, a stun). */
  private burstRing(on: string | number | undefined, at: { x: number; y: number }, c: [number, number, number], size: number, dur: number): void {
    const [r, g, b] = c;
    this.add(dur, (layer, f, k) => {
      const m = this.body(f.on, at);
      if (layer === 'light') {
        drawSprite(this.art.glow, m.x, m.y, size * 4, size * 4, 0, light(r, g, b, 0.6 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      const e = easeOutCubic(k);
      this.ring(m.x, m.y, size * (0.3 + e), 2 * (1 - k) + 0.4, col(r, g, b, 1 - k));
      drawSprite(this.art.glow, m.x, m.y, size * 1.4, size * 1.4, 0, rgba(r, g, b, 0.55 * (1 - k)));
    }, at, undefined, on);
  }

  /** Läkerunan: a green rune circle under a friend and light rising from it. */
  private healRune(on: string | number | undefined, at: { x: number; y: number }, size: number, dur: number): void {
    const motes = [...Array(7)].map(() => ({ x: (Math.random() - 0.5) * 14, d: Math.random() * 0.4, v: 14 + Math.random() * 10 }));
    this.add(dur, (layer, f, k) => {
      const s = f.on !== undefined ? this.find(f.on) : null;
      const x = s?.x ?? at.x;
      const y = (s?.y ?? at.y) + 4;
      const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      if (layer === 'ground') {
        this.runeCircle(x, y, size * (0.7 + 0.3 * easeOutBack(Math.min(1, k * 3))), this.t * 1.5, col(0.45, 1, 0.55, 0.9 * fade));
        return;
      }
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y - 8, 70, 70, 0, light(0.4, 1, 0.5, 0.55 * fade));
        return;
      }
      drawSprite(this.art.glow, x, y - 12, 12, 40, 0, rgba(0.5, 1, 0.6, 0.35 * fade));
      for (const m of motes) {
        const u = clamp01((k - m.d) / (1 - m.d));
        if (u <= 0 || u >= 1) continue;
        drawSprite(this.art.glow, x + m.x, y - 4 - u * m.v * 1.4, 4, 4, 0, rgba(0.6, 1, 0.65, 1 - u));
      }
    }, at, undefined, on);
  }

  /** Läkekrets: a big ring of runes spreading round the healer. */
  private healRing(by: string | number, at: { x: number; y: number }, radius: number): void {
    this.add(1.3, (layer, f, k) => {
      const s = this.find(by);
      const x = s?.x ?? at.x;
      const y = (s?.y ?? at.y) + 4;
      const e = easeOutCubic(Math.min(1, k * 2));
      const fade = 1 - Math.max(0, k - 0.5) / 0.5;
      if (layer === 'ground') {
        this.runeCircle(x, y, radius * e, -this.t * 0.8, col(0.45, 1, 0.55, 0.85 * fade), 12);
        this.ring(x, y, radius * e * 0.6, 1, col(0.6, 1, 0.65, 0.5 * fade));
        return;
      }
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y, radius * 3, radius * 3, 0, light(0.4, 1, 0.5, 0.45 * fade));
        return;
      }
      drawSprite(this.art.glow, x, y - 6, 30, 30, 0, rgba(0.5, 1, 0.6, 0.5 * fade));
    }, at);
  }

  /** Väck upp!: morning light pours down on a fallen friend. */
  private sunrise(on: string | number | undefined, at: { x: number; y: number }): void {
    this.add(1.4, (layer, f, k) => {
      const s = f.on !== undefined ? this.find(f.on) : null;
      const x = s?.x ?? at.x;
      const y = (s?.y ?? at.y) + 2;
      const fade = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y - 10, 90, 90, 0, light(1, 0.85, 0.45, 0.7 * fade));
        return;
      }
      if (layer === 'ground') {
        this.runeCircle(x, y + 2, 16, this.t, col(1, 0.85, 0.4, 0.9 * fade), 8);
        return;
      }
      drawSprite(this.art.glow, x, y - 40, 18, 90, 0, rgba(1, 0.9, 0.55, 0.55 * fade));
      drawSprite(this.art.glow, x, y - 40, 7, 90, 0, rgba(1, 1, 0.85, 0.7 * fade));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + this.t * 2;
        drawSprite(this.art.glow, x + Math.cos(a) * 12 * fade, y - 8 + Math.sin(a) * 4, 4, 4, 0, rgba(1, 0.95, 0.6, fade));
      }
    }, at, undefined, on);
  }

  /** Stormsteg: a rush of wind from where you were to the monster, and a thump. */
  private charge(from: { x: number; y: number }, to: { x: number; y: number }, on: string | number | undefined): void {
    for (let i = 0; i <= 4; i++) this.fx.dust(lerp(from.x, to.x, i / 4), lerp(from.y, to.y, i / 4) + 4, 2);
    this.add(0.45, (layer, f, k) => {
      if (layer !== 'bright') return;
      const fade = 1 - k;
      for (let i = -1; i <= 1; i++) {
        const ox = i * 3;
        drawLine(P(from.x + ox, from.y - 8 + ox), P(to.x + ox, to.y - 8 + ox), W(1.4 - Math.abs(i) * 0.5), col(0.85, 0.95, 1, 0.75 * fade));
      }
    }, from, to);
    this.burstRing(on, to, [1, 1, 1], 18, 0.35);
    if (!this.on) this.stars(on, to, (SPELLS.stormsteg?.ms ?? 1000) / 1000);
    cameraShake(0.15);
  }

  /** Virvelvind: blades of wind spinning round the warrior. */
  private whirl(by: string | number, at: { x: number; y: number }, radius: number): void {
    this.add(0.55, (layer, f, k) => {
      const s = this.find(by);
      const x = s?.x ?? at.x;
      const y = (s?.y ?? at.y) - 4;
      const fade = k < 0.2 ? 1 : 1 - (k - 0.2) / 0.8;
      if (layer === 'ground') {
        this.ring(x, y + 8, radius, 1, col(0.85, 0.9, 1, 0.5 * fade));
        return;
      }
      if (layer !== 'bright') return;
      for (let blade = 0; blade < 3; blade++) {
        const base = this.t * 16 + (blade / 3) * TAU;
        for (let i = 0; i < 6; i++) {
          const a = base - i * 0.16;
          drawSprite(this.art.glow, x + Math.cos(a) * radius * 0.85, y + Math.sin(a) * radius * 0.5, 6 - i * 0.7, 6 - i * 0.7, 0, rgba(0.92, 0.96, 1, (0.85 - i * 0.12) * fade));
        }
      }
    }, at);
  }

  /** Åskregn: lightning strikes all over the spot. */
  private storm(at: { x: number; y: number }, radius: number): void {
    const strikes = [...Array(5)].map((_, i) => {
      const a = Math.random() * TAU;
      const d = i === 0 ? 0 : Math.random() * radius * 0.85;
      const x = at.x + Math.cos(a) * d;
      const y = at.y + Math.sin(a) * d;
      // a jagged bolt from high above
      const pts: [number, number][] = [];
      let px = x + (Math.random() - 0.5) * 20;
      for (let j = 0; j <= 6; j++) {
        const u = j / 6;
        pts.push([lerp(px, x, u) + (j > 0 && j < 6 ? (Math.random() - 0.5) * 9 : 0), lerp(y - 70, y, u)]);
        if (j === 0) px = pts[0]![0];
      }
      return { x, y, at: i * 0.07, pts };
    });
    let shook = false;
    this.add(0.6, (layer, f, k) => {
      const t = k * 0.6;
      if (layer === 'ground') {
        this.ring(at.x, at.y, radius, 1.2, col(0.6, 0.8, 1, 0.7 * (1 - k)));
        return;
      }
      for (const s of strikes) {
        const age = (t - s.at) / 0.18;
        if (age < 0 || age > 1) continue;
        if (!shook) {
          shook = true;
          cameraShake(0.25);
        }
        if (layer === 'light') {
          drawSprite(this.art.glow, s.x, s.y, 110, 110, 0, light(0.7, 0.85, 1, 0.9 * (1 - age)));
          continue;
        }
        if (layer !== 'bright') continue;
        const pts = s.pts.map(([x, y]) => P(x, y));
        drawLineList(pts, W(4), col(0.45, 0.65, 1, 0.6 * (1 - age)));
        drawLineList(pts, W(1.3), col(1, 1, 1, 1 - age));
        drawSprite(this.art.glow, s.x, s.y, 26, 14, 0, rgba(0.7, 0.85, 1, 1 - age));
      }
    }, at);
  }

  /** Blink: a puff of purple sparkles where you were and where you land. */
  private blink(from: { x: number; y: number }, to: { x: number; y: number }): void {
    for (const at of [from, to]) {
      const motes = [...Array(8)].map((_, i) => ({ a: (i / 8) * TAU, v: 10 + Math.random() * 8 }));
      this.add(0.5, (layer, f, k) => {
        if (layer === 'light') {
          drawSprite(this.art.glow, at.x, at.y - 8, 60, 60, 0, light(0.75, 0.45, 1, 0.6 * (1 - k)));
          return;
        }
        if (layer !== 'bright') return;
        const e = easeOutCubic(k);
        drawSprite(this.art.glow, at.x, at.y - 8, 22 * (1 - k), 26 * (1 - k), 0, rgba(0.7, 0.45, 1, 0.8));
        for (const m of motes) drawSprite(this.art.glow, at.x + Math.cos(m.a + k * 3) * m.v * e, at.y - 8 + Math.sin(m.a + k * 3) * m.v * e, 3.5, 3.5, 0, rgba(0.9, 0.75, 1, 1 - k));
      }, at);
    }
  }

  /** A healing potion: bubbles, then a green glow. */
  private potion(by: string | number, at: { x: number; y: number }): void {
    const bubbles = [...Array(6)].map(() => ({ x: (Math.random() - 0.5) * 10, d: Math.random() * 0.5, s: 2 + Math.random() * 2.5 }));
    this.add(1, (layer, f, k) => {
      if (layer !== 'bright') return;
      const s = this.find(by);
      const x = s?.x ?? at.x;
      const y = (s?.y ?? at.y) - 12;
      for (const b of bubbles) {
        const u = clamp01((k - b.d) / 0.5);
        if (u <= 0 || u >= 1) continue;
        drawSprite(this.art.glow, x + b.x + Math.sin(u * 9) * 1.5, y - u * 16, b.s, b.s, 0, rgba(1, 0.45, 0.6, 1 - u));
      }
      if (k > 0.4) drawSprite(this.art.glow, x, y + 4, 26, 30, 0, rgba(0.45, 1, 0.55, 0.5 * (1 - (k - 0.4) / 0.6)));
    }, at);
  }

  /** A boss gathering power: its colour swells around it and sparks rush in. */
  private windup(move: string, by: string | number, at: { x: number; y: number }): void {
    const a = typeof by === 'number' ? activeWorld()?.animals[by] : undefined;
    const warn = (SAGA_BOSSES[a?.species ?? '']?.moves.find((m) => m.move === move)?.warn ?? 1500) / 1000;
    const [r, g, b] = moveColour(move, by);
    if (move === 'mend') return this.mendWindup(by, at, warn, [r, g, b]);
    const sparks = [...Array(10)].map((_, i) => ({ a: (i / 10) * TAU, d: Math.random() * 0.7 }));
    const fx = this.add(warn, (layer, f, k) => {
      const s = this.find(by);
      const x = s?.x ?? at.x;
      const y = s ? s.y + 4 - s.h * 0.5 : at.y - 12;
      const pulse = 0.75 + 0.25 * Math.sin(this.t * (8 + k * 16));
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y, 60 + 60 * k, 60 + 60 * k, 0, light(r, g, b, 0.5 * k * pulse));
        return;
      }
      if (layer !== 'bright') return;
      const size = (s?.w ?? 24) * (1 + k * 0.8);
      drawSprite(this.art.glow, x, y, size * 1.6, size * 1.6, 0, rgba(r, g, b, (0.25 + 0.45 * k) * pulse));
      for (const sp of sparks) {
        const u = (k * 2.2 + sp.d) % 1;
        const dist = (1 - u) * 34;
        drawSprite(this.art.glow, x + Math.cos(sp.a + u) * dist, y + Math.sin(sp.a + u) * dist * 0.7, 4, 4, 0, rgba(r, g, b, u));
      }
    }, at, undefined, by);
    if (typeof by === 'number') this.windups.set(by, fx);
  }

  /** A boss curling up to heal: soft green pulses rising off it and little "z"s, until it is woken (or heals). */
  private mendWindup(by: string | number, at: { x: number; y: number }, warn: number, c: [number, number, number]): void {
    const [r, g, b] = c;
    const fx = this.add(warn, (layer, f, k) => {
      const s = this.find(by);
      const x = s?.x ?? at.x;
      const y = s ? s.y + 4 - s.h * 0.5 : at.y - 12;
      const w = s?.w ?? 24;
      const beat = (this.t * 1.4) % 1;
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y, 70 + 30 * k, 70 + 30 * k, 0, light(r, g, b, 0.5 * (0.6 + 0.4 * Math.sin(this.t * 4))));
        return;
      }
      if (layer === 'ground') {
        // rings breathing out from under it, slow like sleep
        for (let i = 0; i < 2; i++) {
          const u = (beat + i * 0.5) % 1;
          this.ring(x, (s?.y ?? at.y) + 4, w * (0.4 + u * 0.9), 1.2 * (1 - u) + 0.3, col(r, g, b, 0.7 * (1 - u)));
        }
        return;
      }
      drawSprite(this.art.glow, x, y, w * 1.8, w * 1.8, 0, rgba(r, g, b, 0.18 + 0.14 * Math.sin(this.t * 4)));
      for (let i = 0; i < 6; i++) {
        const u = (this.t * 0.6 + i / 6) % 1;
        drawSprite(this.art.glow, x + Math.sin(i * 2.3 + u * 4) * w * 0.5, y + 6 - u * 30, 4 * (1 - u) + 1, 4 * (1 - u) + 1, 0, rgba(r, g, b, 1 - u));
      }
      // sleepy z's drifting up from the head
      const top = s ? s.y + 4 - s.h : at.y - 24;
      for (let i = 0; i < 3; i++) {
        const u = (this.t * 0.5 + i / 3) % 1;
        const zx = x + 6 + u * 10;
        const zy = top - u * 16;
        const sz = 2 + u * 2.5;
        const cz = col(1, 1, 1, 0.9 * (1 - u));
        drawLineList([P(zx - sz, zy - sz), P(zx + sz, zy - sz), P(zx - sz, zy + sz), P(zx + sz, zy + sz)], W(0.9), cz);
      }
    }, at, undefined, by);
    if (typeof by === 'number') this.windups.set(by, fx);
  }

  /** A boss's attack was stopped (Sköldslag, Stormsteg, Isspjut): its power bursts away in blue. */
  private stopped(id: number): void {
    const w = this.windups.get(id);
    if (w) w.t = w.dur;
    this.windups.delete(id);
    const s = this.find(id);
    if (!s) return;
    this.burstRing(id, s, [0.5, 0.85, 1], 26, 0.55);
    this.shatter({ x: s.x, y: s.y + 4 - s.h * 0.55 }, [0.55, 0.85, 1], id);
    cameraShake(0.3);
  }

  /** A boss's big attack lands where it was marked. */
  private land(move: string, at: { x: number; y: number }, by: string | number): void {
    const zone = (activeWorld()?.saga?.zones ?? []).find((z) => Math.abs(z.x - at.x) < 1 && Math.abs(z.y - at.y) < 1);
    const r = (zone?.r ?? 2) * TILE;
    const [cr, cg, cb] = moveColour(move, by);
    if (move === 'cleave' && zone?.shape === 'cone') {
      const dir = zone.dir ?? 0;
      const arc = ((zone.arc ?? 90) * Math.PI) / 180;
      this.add(0.45, (layer, f, k) => {
        if (layer === 'light') {
          drawSprite(this.art.glow, at.x + Math.cos(dir) * r * 0.5, at.y + Math.sin(dir) * r * 0.5, r * 2.6, r * 2.6, 0, light(cr, cg, cb, 0.7 * (1 - k)));
          return;
        }
        if (layer !== 'bright') return;
        // the blade sweeping through the cone, leaving a trail of fire or frost
        const sweep = easeOutCubic(Math.min(1, k * 1.6));
        for (let i = 0; i < 14; i++) {
          const u = i / 13;
          if (u > sweep) break;
          const a = dir - arc / 2 + arc * u;
          for (const d of [0.45, 0.7, 0.95]) drawSprite(this.art.glow, at.x + Math.cos(a) * r * d, at.y + Math.sin(a) * r * d, 10, 10, 0, rgba(cr, cg, cb, 0.75 * (1 - k)));
        }
      }, at);
      cameraShake(0.35);
      return;
    }
    if (move === 'rain' || move === 'freeze') {
      const shards = [...Array(move === 'freeze' ? 6 : 4)].map(() => ({ x: (Math.random() - 0.5) * r, y: (Math.random() - 0.5) * r, d: Math.random() * 0.15 }));
      this.add(0.6, (layer, f, k) => {
        if (layer === 'light') {
          drawSprite(this.art.glow, at.x, at.y, r * 3, r * 3, 0, light(0.6, 0.9, 1, 0.6 * (1 - k)));
          return;
        }
        if (layer !== 'bright') return;
        for (const s of shards) {
          const u = clamp01((k - s.d) / 0.25);
          if (u < 1) drawSprite(this.art.glow, at.x + s.x, at.y + s.y - 50 * (1 - u), 3, 12, 0, rgba(0.85, 0.97, 1, 0.9));
        }
        const e = easeOutCubic(clamp01((k - 0.25) / 0.75));
        if (k > 0.25) {
          this.ring(at.x, at.y, r * (0.4 + e * 0.8), 2 * (1 - e) + 0.4, col(0.7, 0.95, 1, 1 - e));
          drawSprite(this.art.glow, at.x, at.y, r * 1.6, r * 1.6, 0, rgba(0.6, 0.9, 1, 0.5 * (1 - e)));
        }
      }, at);
      this.shatter(at, [0.6, 0.92, 1]);
      return;
    }
    if (move === 'pools') {
      this.explode(at, [1, 0.45, 0.1], r * 0.8);
      this.fx.dust(at.x, at.y, 4);
      return;
    }
    if (move === 'line') return this.landLine(at, zone, [cr, cg, cb]);
    if (move === 'pull') return this.landPull(at, r, by, [cr, cg, cb]);
    if (move === 'mend') {
      // healed (unless it was stopped, then the wind-up ended in blue already): a green bloom
      this.burstRing(by, at, [cr, cg, cb], 30, 0.7);
      this.healRune(by, at, 26, 1);
      return;
    }
    if (move === 'summon') return this.poofRing(by, at, [cr, cg, cb]);
    // slam, nova, charge, summon: a shockwave out to the edge of the mark
    const big = move === 'nova';
    if (move === 'slam') this.hitStop('slam', [by, client.me]);
    this.add(big ? 0.8 : 0.55, (layer, f, k) => {
      const e = easeOutCubic(k);
      if (layer === 'light') {
        drawSprite(this.art.glow, at.x, at.y, r * 2.8, r * 2.8, 0, light(cr, cg, cb, 0.8 * (1 - k)));
        return;
      }
      if (layer === 'ground') {
        drawEllipse(P(at.x, at.y), vec2(W(r * 2 * e), W(r * 2 * e)), col(cr, cg, cb, 0.25 * (1 - k)));
        return;
      }
      this.ring(at.x, at.y, r * e, 3 * (1 - k) + 0.5, col(cr, cg, cb, 1 - k));
      this.ring(at.x, at.y, r * e * 0.7, 1.5 * (1 - k) + 0.3, col(1, 1, 1, 0.8 * (1 - k)));
      drawSprite(this.art.glow, at.x, at.y, r * (0.6 + e), r * (0.6 + e), 0, rgba(cr, cg, cb, 0.5 * (1 - k)));
    }, at);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      this.fx.dust(at.x + Math.cos(a) * r * 0.8, at.y + Math.sin(a) * r * 0.8, 1);
    }
    cameraShake(big ? 0.7 : 0.45);
  }

  /** A line attack: steam, a tail or a tentacle sweeping down the whole strip from the boss outwards. */
  private landLine(at: { x: number; y: number }, zone: SagaZone | undefined, c: [number, number, number]): void {
    const [r, g, b] = c;
    const dir = zone?.dir ?? 0;
    const len = (zone?.r ?? 6) * TILE;
    const wide = (zone?.w ?? 1.6) * TILE;
    const ux = Math.cos(dir);
    const uy = Math.sin(dir);
    this.add(0.5, (layer, f, k) => {
      const reach = easeOutCubic(Math.min(1, k * 2.2));
      const fade = 1 - clamp01((k - 0.35) / 0.65);
      if (layer === 'light') {
        drawSprite(this.art.glow, at.x + ux * len * 0.5, at.y + uy * len * 0.5, len * 1.4, wide * 3, dir, light(r, g, b, 0.8 * fade));
        return;
      }
      if (layer === 'ground') {
        this.strip(at.x, at.y, dir, len * reach, wide, col(r, g, b, 0.3 * fade));
        return;
      }
      if (layer !== 'bright') return;
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        if (u > reach) break;
        const wob = Math.sin(u * 12 + this.t * 20) * wide * 0.15;
        const x = at.x + ux * len * u - uy * wob;
        const y = at.y + uy * len * u + ux * wob;
        drawSprite(this.art.glow, x, y, wide * 1.3, wide * 1.3, 0, rgba(r, g, b, 0.6 * fade));
        drawSprite(this.art.glow, x, y, wide * 0.5, wide * 0.5, 0, rgba(1, 1, 1, 0.7 * fade));
      }
    }, at);
    for (let i = 1; i <= 5; i++) this.fx.dust(at.x + ux * len * (i / 5), at.y + uy * len * (i / 5), 1);
    cameraShake(0.45);
  }

  /** A pull lands: streaks rushing in to the boss from all round the circle, and a thump in the middle. */
  private landPull(at: { x: number; y: number }, r: number, by: string | number, c: [number, number, number]): void {
    const [cr, cg, cb] = c;
    const streaks = [...Array(14)].map((_, i) => ({ a: (i / 14) * TAU + Math.random() * 0.3, d: 0.6 + Math.random() * 0.4 }));
    this.add(0.45, (layer, f, k) => {
      const s = this.find(by);
      const x = s?.x ?? at.x;
      const y = s?.y ?? at.y;
      const e = easeOutCubic(k);
      if (layer === 'light') {
        drawSprite(this.art.glow, x, y, r * 2 * (1 - e) + 40, r * 2 * (1 - e) + 40, 0, light(cr, cg, cb, 0.8 * (1 - k)));
        return;
      }
      if (layer === 'ground') {
        this.ring(x, y, r * (1 - e), 2.5 * (1 - k) + 0.4, col(cr, cg, cb, 0.9 * (1 - k)));
        return;
      }
      for (const st of streaks) {
        const d0 = r * st.d * (1 - e);
        const d1 = d0 + r * 0.25 * (1 - k);
        const a = st.a + e * 1.2;
        drawLine(P(x + Math.cos(a) * d0, y + Math.sin(a) * d0), P(x + Math.cos(a - 0.15) * d1, y + Math.sin(a - 0.15) * d1), W(1.6), col(cr, cg, cb, 0.9 * (1 - k)));
      }
      if (k > 0.6) drawSprite(this.art.glow, x, y - 6, 40, 40, 0, rgba(cr, cg, cb, (1 - k) * 2));
    }, at);
    cameraShake(0.4);
  }

  /** Helpers summoned: a ring of smoke puffs round the boss, and a flash. */
  private poofRing(by: string | number, at: { x: number; y: number }, c: [number, number, number]): void {
    const s = this.find(by);
    const x = s?.x ?? at.x;
    const y = s?.y ?? at.y;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      this.fx.dust(x + Math.cos(a) * 26, y + Math.sin(a) * 18, 2);
    }
    this.fx.spawn(x, y, 'poof');
    this.burstRing(by, at, c, 34, 0.6);
  }

  /** A boss rushing at someone: a trail of dust and a crash. */
  private bossCharge(from: { x: number; y: number }, to: { x: number; y: number }): void {
    for (let i = 0; i <= 6; i++) this.fx.dust(lerp(from.x, to.x, i / 6), lerp(from.y, to.y, i / 6) + 4, 2);
    this.add(0.5, (layer, f, k) => {
      if (layer !== 'bright') return;
      drawLine(P(from.x, from.y - 10), P(to.x, to.y - 10), W(6 * (1 - k)), col(1, 1, 1, 0.35 * (1 - k)));
    }, from, to);
    cameraShake(0.5);
  }

  // ------------------------------------------------------------------ floating numbers (HTML)

  /** Numbers for a target that something in flight is about to hit wait until it lands. */
  private holdNumbers(on: string | number | undefined, sec: number): void {
    if (on !== undefined) this.delay = { on, until: this.t + sec };
  }

  /** A name for a Samslag: a hero's, or their pet's. */
  private nameOf(id: string): string {
    const players = client.world?.players ?? {};
    if (id.startsWith('pet:')) {
      const owner = id.slice(4);
      const pet = Object.values(activeWorld()?.animals ?? {}).find((a) => a.owner === owner && !!a.petKind);
      return pet?.name ?? FIGHT_UI.petName;
    }
    return players[id]?.name ?? '';
  }

  /** Samslag: two heroes struck together. Both names over the monster, a two-note chord, a big burst, a blink of stillness. */
  private samslag(on: number, by: [string, string] | undefined): void {
    const a = by ? this.nameOf(by[0]) : '';
    const b = by ? this.nameOf(by[1]) : '';
    this.word(on, `🤝 ${T.sagaSamslag}${a && b ? ` ${fmt(FIGHT_UI.samslagBy, { a, b })}` : ''}`, 'big');
    SAGA_SFX.samslag();
    const s = this.find(on);
    if (s) {
      const at = { x: s.x, y: s.y + 4 - s.h * 0.5 };
      this.explode(at, [1, 0.85, 0.3], 30, on);
      this.groundBurst({ x: s.x, y: s.y + 4 }, 2.2 * TILE, [1, 0.85, 0.3]);
    }
    this.punch(on, 3);
    this.hitStop('spend', [on, by?.[1]]);
    this.shake('spend');
    // the first one on this device: what it was, in a line
    if (a && b && firstTime('samslag')) bus.emit('toast', fmt(T.sagaSamslagText, { a, b }));
  }

  /** Guldringen ends: the party stood in it (the scream fizzles into stars, a cheer) or not (the scream lands). */
  private ringEnd(won: boolean, by: string | number, at: { x: number; y: number }): void {
    if (won) {
      SAGA_SFX.ringWon();
      const stars = [...Array(Math.round(10 * this.juice().particles) + 2)].map((_, i, arr) => ({ a: (i / arr.length) * TAU, v: 26 + Math.random() * 22 }));
      this.add(0.9, (layer, f, k) => {
        const m = this.body(by, at);
        if (layer === 'light') {
          drawSprite(this.art.glow, m.x, m.y, 120, 120, 0, light(1, 0.85, 0.3, 0.8 * (1 - k)));
          return;
        }
        if (layer !== 'bright') return;
        const e = easeOutCubic(k);
        for (const st of stars) this.star(m.x + Math.cos(st.a) * st.v * e, m.y + Math.sin(st.a) * st.v * e - 8 * e, 3.5 * (1 - k) + 1, col(1, 0.9, 0.35, 1 - k));
      }, at, undefined, by);
    } else {
      SAGA_SFX.ringLost();
      this.land('nova', at, by);
    }
  }

  private hit(c: Extract<Change, { t: 'hit' }>): void {
    if (c.kind === 'combo') {
      if (typeof c.on === 'number') this.samslag(c.on, c.by);
      return;
    }
    if (c.kind === 'orb') {
      // a Kraftklot taken: three pips at once (your own row plays its three notes), sparkles and a word
      this.word(c.on, `🔮 ${FIGHT_UI.orbGot}`);
      if (c.on !== client.me) SAGA_SFX.orbTake();
      const sp = this.find(c.on);
      if (sp) this.fx.spawn(sp.x, sp.y - 8, 'sparkle');
      return;
    }
    const s = this.find(c.on);
    if (!s) return;
    const monster = typeof c.on === 'number';
    let text = '';
    let cls: string = c.kind;
    if (c.kind === 'dmg') text = `-${c.n}`;
    else if (c.kind === 'crit') text = monster ? `${c.n}!` : `+${c.n}!`;
    else if (c.kind === 'heal') text = `+${c.n}`;
    else if (c.kind === 'block') text = `${T.sagaHitBlock} -${c.n}`;
    else if (c.kind === 'stun') text = `⭐ ${T.sagaHitStun}`;
    else if (c.kind === 'kick') text = `🛡️ ${T.sagaHitKick}`;
    else if (c.kind === 'miss') text = T.sagaHitMiss;
    if (c.kind === 'crit' && !monster) cls = 'crit heal';
    if (c.on === client.me && (c.kind === 'dmg' || c.kind === 'block')) cls += ' me';
    const hurt = c.kind === 'dmg' || c.kind === 'crit' || c.kind === 'block';
    // a spender's blow is as big as its pips; a monster that sees stars takes gold numbers; a body that is hit flashes and squashes
    const spent = monster && hurt && this.spent && performance.now() < this.spent.until ? this.spent : null;
    if (spent) cls += ` ${spendClass(spent.pips)}`;
    if (monster && hurt && (sagaSnap()?.m[c.on as number]?.[2] ?? 0) & MOB_FLAG.open) cls += ' onopen';
    if (monster && hurt) this.punch(c.on as number, spent ? spent.pips : 0);
    // a ground mark hit a hero: a heavy number, and the lost piece stays on their bar a moment
    const marked = !!c.mark && !monster && (c.kind === 'dmg' || c.kind === 'block');
    if (marked) {
      cls += ' mark';
      this.ghost(String(c.on), c.n);
    }
    // healing someone already well (a lucky heal on full health) shows nothing
    if ((c.kind === 'heal' || (c.kind === 'crit' && !monster)) && c.n <= 0) return;
    const el = document.createElement('div');
    el.className = `label saga-fct ${cls}`;
    el.textContent = text;
    const now = this.t;
    const at = this.delay && this.delay.on === c.on && this.delay.until > now ? this.delay.until : now;
    el.style.visibility = at > now ? 'hidden' : '';
    if (at === now) this.labels.appendChild(el);
    // numbers that come together on the same body rise beside and above each other; healing rises to the right
    const n = this.floaters.filter((f) => f.on === c.on && Math.abs(f.born - at) < 0.4).length % 3;
    const side = cls.includes('heal') ? 10 : 0;
    const life = c.kind === 'kick' ? 1.5 : marked || spent?.pips === PIP_MAX ? 1.4 : c.kind === 'crit' ? 1.25 : 1.1;
    this.floaters.push({ el, on: c.on, x: s.x, y: s.y + 4 - s.h, dx: side + [0, 9, -9][n]! + (Math.random() - 0.5) * 3, dy: -6 * n, born: at, life, at });
    // sounds for what matters to you
    const t = performance.now();
    if (marked) {
      // its own thud (quieter for a friend), and for you a shake
      if (t - this.lastMarkSound > 150) {
        this.lastMarkSound = t;
        SAGA_SFX.mark(c.on === client.me);
      }
      if (c.on === client.me) this.shake('mark');
    } else if (c.on === client.me && c.kind === 'dmg' && t - this.lastHurtSound > 180) {
      this.lastHurtSound = t;
      SAGA_SFX.hurt();
    } else if (monster && c.kind === 'crit' && t - this.lastCritSound > 150) {
      this.lastCritSound = t;
      SAGA_SFX.crit();
    } else if (c.kind === 'stun') SAGA_SFX.stun();
    else if (c.kind === 'kick') {
      SAGA_SFX.crack();
      if (typeof c.on === 'number') this.stopped(c.on);
    }
  }

  /** A word rising from someone ("Öppning!", "Kombo!"). */
  private word(on: string | number, text: string, extra = ''): void {
    const s = this.find(on);
    if (!s) return;
    const el = document.createElement('div');
    el.className = `label saga-fct word${extra ? ` ${extra}` : ''}`;
    el.textContent = text;
    this.labels.appendChild(el);
    this.floaters.push({ el, on, x: s.x, y: s.y + 4 - s.h, dx: 0, dy: -14, born: this.t, life: 1.6, at: this.t });
  }

  /** The piece of health a mark took stays on the hero's bar over their head for a moment. */
  private ghost(id: string, n: number): void {
    const f = sagaSnap()?.f[id];
    const b = this.bars.get(`p${id}`)?.querySelector('b');
    if (!f || !b) return;
    const from = Math.max(0, Math.min(1, f[0] / Math.max(1, f[1])));
    const to = Math.max(0, from - n / Math.max(1, f[1]));
    b.querySelector('u')?.remove();
    const u = document.createElement('u');
    u.style.left = `${to * 100}%`;
    u.style.width = `${(from - to) * 100}%`;
    u.className = 'go';
    b.appendChild(u);
    setTimeout(() => u.remove(), 1300);
  }

  // ------------------------------------------------------------------ spenders, kills

  /**
   * A spender (slot 1) goes off: as big as the pips it used, with its class's look. Three pips freeze the blow for a blink
   * and shake the camera; a combo (a dazed, frozen or challenged monster, a friend in the ring) gets its chord and its word.
   */
  private spend(c: Extract<Change, { t: 'spell' }>, from: { x: number; y: number }, to: { x: number; y: number }, heard: boolean): void {
    const by = String(c.by);
    const mine = by === client.me;
    // (Solstråle sends one for every friend it heals: they are all the same blow)
    const again = this.spent && this.spent.by === by && performance.now() < this.spent.until;
    const pips = again ? this.spent!.pips : Math.max(1, Math.min(PIP_MAX, this.pipsSeen.get(by) ?? 1));
    this.pipsSeen.set(by, 0);
    this.spent = { until: performance.now() + 40, pips, by };
    if (!again) (globalThis as { __juiceLog?: string[] }).__juiceLog?.push(`spend:${pips}`);
    const snap = sagaSnap();
    const fl = typeof c.on === 'number' ? (snap?.m[c.on]?.[2] ?? 0) : 0;
    const s = c.spell;
    const combo =
      s === 'jattehugg' ? !!(fl & MOB_FLAG.dazed) : s === 'runsmall' ? !!(fl & (MOB_FLAG.slowed | MOB_FLAG.dazed)) : s === 'dunderslag' ? Object.values(snap?.m ?? {}).some((m) => m[2] & MOB_FLAG.taunted) : typeof c.on === 'string' && !!((snap?.f[c.on]?.[2] ?? 0) & FLAG.hot);
    const full = pips >= PIP_MAX;
    if (!again) {
      if (heard) SAGA_SFX.spend(s, pips);
      if (combo) {
        if (mine) setTimeout(() => SAGA_SFX.combo(), 60);
        if (c.on !== undefined) this.word(c.on, `⭐ ${FIGHT_UI.combo}`);
      }
      if (full) {
        this.hitStop('spend', [c.by, c.on]);
        if (mine || heard) this.shake('spend');
      }
    }
    const k = (pips - 1) / (PIP_MAX - 1); // 0, 0.5, 1
    if (s === 'jattehugg') {
      this.fx.spawn(to.x, to.y, 'chop');
      this.slash(c.on, to, [1, 0.55, 0.25], 12 + 6 * k, 1.6 + 1.2 * k);
      if (full) this.arc(from, to, SPEND.jattehugg.arc * TILE, (SPEND.jattehugg.deg * Math.PI) / 180, [1, 0.6, 0.2]);
    } else if (s === 'runsmall') {
      this.explode(to, [0.78, 0.5, 1], 14 + 12 * k, c.on);
      if (combo) this.shatter(this.body(c.on, to), [0.7, 0.9, 1], c.on);
      if (full || combo) this.groundBurst(to, (SPELLS.runsmall?.radius ?? SPEND.runsmall.radius) * TILE, [0.78, 0.5, 1]);
    } else if (s === 'dunderslag') {
      this.burstRing(c.on, to, [1, 0.85, 0.4], 14 + 10 * k, 0.4);
      this.thunder(c.on, to, 0.6 + k);
      if (full) this.burstRing(c.by, from, [0.5, 0.75, 1], 24, 0.6);
    } else {
      this.beam(c.by, from, c.on, to, [1, 0.9, 0.45], 2 + 3 * k);
      this.healRune(c.on ?? c.by, to, 14 + 6 * k, 0.9);
    }
  }

  /** Ranged pressure: a boss lobs something at a hero far away (its red circle is already on the ground where it will land). */
  private lob(by: string | number, from: { x: number; y: number }, to: { x: number; y: number }): void {
    const [r, g, b] = warnColour();
    this.add(0.45, (layer, f, k) => {
      if (layer !== 'bright') return;
      const a = this.body(by, from);
      const x = lerp(a.x, to.x, k);
      const y = lerp(a.y, to.y, k) - Math.sin(k * Math.PI) * 26;
      drawSprite(this.art.glow, x, y, 12, 12, 0, rgba(r, g, b, 0.9));
      drawSprite(this.art.glow, x, y, 5, 5, 0, rgba(1, 1, 1, 1));
    }, from, to);
  }

  /** Jättehugg at three pips: the blade's sweep through everything in front. */
  private arc(from: { x: number; y: number }, to: { x: number; y: number }, r: number, wide: number, c: [number, number, number]): void {
    const [cr, cg, cb] = c;
    const dir = Math.atan2(to.y - from.y, to.x - from.x);
    this.add(0.38, (layer, f, k) => {
      if (layer === 'light') {
        drawSprite(this.art.glow, from.x + Math.cos(dir) * r * 0.5, from.y + Math.sin(dir) * r * 0.5, r * 2.4, r * 2.4, 0, light(cr, cg, cb, 0.6 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      const sweep = easeOutCubic(Math.min(1, k * 1.8));
      for (let i = 0; i < 12; i++) {
        const u = i / 11;
        if (u > sweep) break;
        const a = dir - wide / 2 + wide * u;
        for (const d of [0.55, 0.8, 1]) drawSprite(this.art.glow, from.x + Math.cos(a) * r * d, from.y - 6 + Math.sin(a) * r * d, 9, 9, 0, rgba(cr, cg, cb, 0.8 * (1 - k)));
      }
    }, from);
  }

  /** A ring bursting out along the ground (Runsmäll's splash). */
  private groundBurst(at: { x: number; y: number }, r: number, c: [number, number, number]): void {
    const [cr, cg, cb] = c;
    this.add(0.45, (layer, f, k) => {
      const e = easeOutCubic(k);
      if (layer === 'ground') {
        drawEllipse(P(at.x, at.y), vec2(W(r * 2 * e), W(r * 2 * e)), col(cr, cg, cb, 0.22 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      this.ring(at.x, at.y, r * e, 2.5 * (1 - k) + 0.4, col(cr, cg, cb, 1 - k));
    }, at);
  }

  /** Dunderslag: a bolt from above onto the monster. */
  private thunder(on: string | number | undefined, at: { x: number; y: number }, size: number): void {
    const jag = [...Array(6)].map((_, j) => (j > 0 && j < 5 ? (Math.random() - 0.5) * 9 : 0));
    this.add(0.22, (layer, f, k) => {
      const m = this.body(f.on, at);
      if (layer === 'light') {
        drawSprite(this.art.glow, m.x, m.y, 90 * size, 90 * size, 0, light(1, 0.9, 0.5, 0.9 * (1 - k)));
        return;
      }
      if (layer !== 'bright') return;
      const pts = jag.map((dx, j) => P(m.x + dx, lerp(m.y - 60, m.y, j / 5)));
      drawLineList(pts, W(3 * size), col(1, 0.8, 0.3, 0.6 * (1 - k)));
      drawLineList(pts, W(1.1 * size), col(1, 1, 1, 1 - k));
    }, at, undefined, on);
  }

  /** Solstråle: a warm beam from the healer to the friend. */
  private beam(by: string | number, from: { x: number; y: number }, on: string | number | undefined, to: { x: number; y: number }, c: [number, number, number], width: number): void {
    const [r, g, b] = c;
    this.add(0.45, (layer, f, k) => {
      if (layer !== 'bright') return;
      const a = this.body(by, from);
      const z = this.body(on, to);
      const fade = 1 - k;
      drawLine(P(a.x, a.y), P(z.x, z.y), W(width * 1.8), col(r, g, b, 0.45 * fade));
      drawLine(P(a.x, a.y), P(z.x, z.y), W(width * 0.6), col(1, 1, 0.9, 0.9 * fade));
      drawSprite(this.art.glow, z.x, z.y, 26, 26, 0, rgba(r, g, b, 0.7 * fade));
    }, from, to, on);
  }

  /** A monster is gone: a bigger poof than the server's own, a pop, a small shake and a blink of stillness. A Sköldbärare's dome breaks with it. */
  private gone(id: number): void {
    const s = this.lastSpot.get(id);
    this.lastSpot.delete(id);
    this.openSeen.delete(id);
    this.castSeen.delete(id);
    if (this.domeUp.has(id)) this.domeBreak(id);
    if (!s) return;
    const j = this.juice();
    const big = !!this.spent && performance.now() < this.spent.until + 120 && this.spent.pips >= PIP_MAX;
    const at = { x: s.x, y: s.y + 4 - s.h * 0.5 };
    const n = poofCount(j, big);
    (globalThis as { __juiceLog?: string[] }).__juiceLog?.push(`kill:${n}`);
    const bits = [...Array(n)].map((_, i) => ({ a: (i / Math.max(1, n)) * TAU + Math.random() * 0.5, v: 16 + Math.random() * 14 }));
    this.add(0.5, (layer, f, k) => {
      if (layer !== 'bright') return;
      const e = easeOutCubic(k);
      drawSprite(this.art.glow, at.x, at.y, s.w * (0.8 + e), s.h * (0.8 + e), 0, rgba(1, 1, 1, 0.5 * (1 - k)));
      for (const b of bits) drawSprite(this.art.glow, at.x + Math.cos(b.a) * b.v * e, at.y + Math.sin(b.a) * b.v * e - 5 * e, 5 * (1 - k) + 1.5, 5 * (1 - k) + 1.5, 0, rgba(1, 0.95, 0.75, 1 - k));
    }, at);
    if (n > 0) this.fx.dust(s.x, s.y + 2, Math.min(3, n));
    SAGA_SFX.kill(big);
    this.shake('kill');
    this.hitStop('kill', this.spent && performance.now() < this.spent.until + 120 ? [this.spent.by] : []);
  }

  /** A Sköldbärare's dome breaks (it fell, or it is dazed): glass cracking, shards, and a word. */
  private domeBreak(id: number): void {
    const at = this.domeUp.get(id);
    this.domeUp.delete(id);
    if (!at) return;
    SAGA_SFX.domeCrack();
    this.shatter(at, [0.6, 0.8, 1]);
    const s = this.find(id);
    if (s) this.word(id, `🛡️ ${FIGHT_UI.domeDown}`, 'blue');
  }

  /** Every frame in a dungeon: who has how many pips, who sees stars, whose dome is up, who starts a cast. */
  private watch(): void {
    const snap = sagaSnap();
    if (!snap) return;
    for (const [id, f] of Object.entries(snap.f)) this.pipsSeen.set(id, f[3] ?? 0);
    // Öppning: a shimmer and the word, once
    for (const ids of Object.keys(snap.o ?? {})) {
      const id = Number(ids);
      if (this.openSeen.has(id)) continue;
      this.openSeen.add(id);
      SAGA_SFX.open();
      this.word(id, `💫 ${T.sagaOpen}`);
    }
    for (const id of this.openSeen) if (!snap.o?.[id]) this.openSeen.delete(id);
    // a Besvärjare starts to heal: a small chant
    for (const [ids, c] of Object.entries(snap.c ?? {})) {
      const id = Number(ids);
      const key = `${c[0]}:${c[1]}`;
      if (this.castSeen.get(id) === key) continue;
      this.castSeen.set(id, key);
      if (c[0] === 'heal') SAGA_SFX.chant(c[2] - c[1]);
    }
    for (const id of this.castSeen.keys()) if (!snap.c?.[id]) this.castSeen.delete(id);
    // Märke: the skull moved (a knock), or is gone; your own aim follows the party's mark
    const k = markedMob();
    if (k !== this.skullSeen) {
      if (this.skullSeen !== undefined) SAGA_SFX.skull(k !== null);
      this.skullSeen = k;
      if (k !== null) setTarget(k);
    }
    // the Sköldbärare's dome: up while it fights and is not dazed
    const animals = activeWorld()?.animals ?? {};
    for (const [ids, m] of Object.entries(snap.m)) {
      const id = Number(ids);
      if (animals[id]?.role !== 'shield') continue;
      const s = this.find(id);
      if (m[2] & MOB_FLAG.dazed) {
        if (this.domeUp.has(id)) this.domeBreak(id);
      } else if (s) this.domeUp.set(id, { x: s.x, y: s.y + 4 - s.h * 0.5 });
    }
  }

  /** Experience for a monster beaten (yours or a friend's nearby): a small golden "+4 xp" rising from you. */
  private xp(n: number): void {
    if (n <= 0 || !this.find(client.me)) return;
    const s = this.find(client.me)!;
    const el = document.createElement('div');
    el.className = 'label saga-fct xp';
    el.textContent = fmt(T.sagaXpFloat, { n });
    this.labels.appendChild(el);
    // from your shoulder (below your name, beside the damage numbers over your head); a second one rises above it
    const k = this.floaters.filter((f) => f.on === client.me && f.el.classList.contains('xp') && this.t - f.born < 0.6).length % 3;
    this.floaters.push({ el, on: client.me, x: s.x, y: s.y + 4 - s.h, dx: 18, dy: s.h - 8 - 7 * k, born: this.t, life: 1.3, at: this.t });
  }

  // ------------------------------------------------------------------ every frame

  update(dt: number): void {
    if (!this.live) return;
    this.t += dt;
    // (a hit-stop holds the fight's effects still for a blink; the numbers and everything else go on)
    if (performance.now() >= this.stopUntil) for (const f of this.list) f.t += dt;
    if (this.list.some((f) => f.t >= f.dur)) this.list = this.list.filter((f) => f.t < f.dur);
    if (this.delay && this.t > this.delay.until + 0.05) this.delay = null;
    for (const f of this.floaters) {
      if (f.at > this.t || f.el.isConnected) continue;
      this.labels.appendChild(f.el);
      f.el.style.visibility = '';
    }
    const old = this.floaters.filter((f) => this.t - f.born > f.life + 0.05);
    if (old.length) {
      for (const f of old) f.el.remove();
      this.floaters = this.floaters.filter((f) => this.t - f.born <= f.life + 0.05);
    }
    for (const [id, w] of this.windups) if (w.t >= w.dur) this.windups.delete(id);
    if (this.on) this.watch();
  }

  /** Telegraphs and runes on the ground, under everyone (lit with the scene). */
  drawGround(): void {
    if (!this.live) return;
    const now = serverNow();
    if (this.on) for (const z of activeWorld()?.saga?.zones ?? []) this.drawZone(z, now);
    this.drawTargetRing();
    for (const f of this.list) if (f.t >= 0) f.draw('ground', f, clamp01(f.t / f.dur));
  }

  /** Into the light map: telegraphs glow red, magic lights up the dark. */
  paintLight(): void {
    if (!this.live) return;
    const now = serverNow();
    for (const z of this.on ? (activeWorld()?.saga?.zones ?? []) : []) {
      const burning = z.until !== undefined && now >= z.at;
      const k = burning ? 1 : this.fill(z, now);
      const r = z.r * TILE;
      const move = this.moveOf(z);
      if (move === 'mend') continue;
      if (z.kind === 'gold' || z.kind === 'orb') {
        // warm light, never the red of a danger
        const [gr, gg, gb] = goodColour();
        drawSprite(this.art.glow, z.x, z.y, r * 2.8, r * 2.8, 0, light(gr, gg, gb, z.kind === 'orb' ? 0.5 : 0.6));
        continue;
      }
      const reach = z.shape === 'cone' || z.shape === 'line' ? 0.5 : 0;
      const cx = z.x + Math.cos(z.dir ?? 0) * r * reach;
      const cy = z.y + Math.sin(z.dir ?? 0) * r * reach;
      const fl = burning ? 0.8 + 0.2 * Math.sin(this.t * 5 + z.x) : 0.5 + 0.5 * k;
      if (z.shape === 'line') drawSprite(this.art.glow, cx, cy, r * 1.5, (z.w ?? 1.6) * TILE * 2.4, z.dir ?? 0, light(1, 0.12, 0.08, 0.7 * fl));
      else if (move === 'pull') drawSprite(this.art.glow, cx, cy, r * 2.4, r * 2.4, 0, light(0.5, 0.35, 1, 0.5 * fl));
      else drawSprite(this.art.glow, cx, cy, r * 2.6, r * 2.6, 0, burning ? light(1, 0.45, 0.12, 0.8 * fl) : light(1, 0.12, 0.08, 0.7 * fl));
    }
    for (const f of this.list) if (f.t >= 0) f.draw('light', f, clamp01(f.t / f.dur));
    // fallen friends lie in a little light so they can be found
    for (const id of Object.keys(sagaSnap()?.f ?? {})) {
      const fl = flagsOf(id);
      const s = fl & (FLAG.down | FLAG.frozen) ? this.find(id) : null;
      if (s) drawSprite(this.art.glow, s.x, s.y - 4, 50, 50, 0, fl & FLAG.frozen ? light(0.5, 0.85, 1, 0.8) : light(0.85, 0.85, 1, 0.6));
    }
  }

  /** In the y-sorted queue: the ice around a frozen friend. */
  queue(q: DrawQueue): void {
    if (!this.on) return;
    const white = this.art.white;
    for (const id of Object.keys(sagaSnap()?.f ?? {})) {
      if (!(flagsOf(id) & FLAG.frozen)) continue;
      const s = this.find(id);
      if (!s) continue;
      if (webbed(id)) {
        // a spider's web: white threads wound round and round, and a few strands across
        q.push(s.y + 4.6, white, s.x, s.y - 10, 22, 30, 0, rgba(0.95, 0.95, 1, 0.22));
        for (let i = 0; i < 5; i++) q.push(s.y + 4.61, white, s.x, s.y - 20 + i * 5.5, 20 - Math.abs(i - 2) * 3, 0.8, (i % 2 ? 0.25 : -0.25), rgba(1, 1, 1, 0.75));
        q.push(s.y + 4.62, white, s.x - 3, s.y - 10, 0.8, 26, 0.35, rgba(1, 1, 1, 0.6));
        q.push(s.y + 4.62, white, s.x + 3, s.y - 10, 0.8, 26, -0.35, rgba(1, 1, 1, 0.6));
        continue;
      }
      const shine = 0.5 + 0.5 * Math.sin(this.t * 2.5);
      // tall enough for a helmet in the frame's headroom too
      q.push(s.y + 4.6, white, s.x, s.y - 10, 22, 32, 0, rgba(0.65, 0.88, 1, 0.42));
      q.push(s.y + 4.61, white, s.x - 6, s.y - 12, 2.5, 18, 0.25, rgba(1, 1, 1, 0.35 + 0.3 * shine));
      q.push(s.y + 4.61, white, s.x + 7, s.y - 2, 1.5, 9, 0.25, rgba(1, 1, 1, 0.3));
    }
  }

  /** On top of the lit scene: everything that glows by itself. */
  drawBright(): void {
    if (!this.live) return;
    setAdditiveBlendMode(true);
    const now = serverNow();
    if (this.on) for (const z of activeWorld()?.saga?.zones ?? []) this.drawZoneEdge(z, now);
    for (const f of this.list) if (f.t >= 0) f.draw('bright', f, clamp01(f.t / f.dur));
    this.drawAuras();
    setAdditiveBlendMode(false);
  }

  // ------------------------------------------------------------------ telegraphs

  /** 0 → 1 as an attack marked on the ground gets ready to land. */
  private fill(z: SagaZone, now: number): number {
    const born = this.born.get(z.id) ?? z.at - 1200;
    return clamp01((now - born) / Math.max(1, z.at - born));
  }

  private drawZone(z: SagaZone, now: number): void {
    const r = z.r * TILE;
    if (z.kind === 'orb') return this.drawOrb(z, r, now, false);
    const move = this.moveOf(z);
    if (move === 'pull' && now < z.at) {
      // a whirlpool: a dark violet disc turning, darker as it gets ready
      const k = this.fill(z, now);
      const [cr, cg, cb] = moveColour('pull', z.by);
      this.zoneShape(z, r, col(cr * 0.5, cg * 0.5, cb * 0.7, 0.16 + 0.12 * k));
      for (let i = 0; i < 3; i++) this.ring(z.x, z.y, r * ((1 - ((this.t * 0.7 + i / 3) % 1)) * 0.95), 1, col(cr, cg, cb, 0.5));
      return;
    }
    if (move === 'mend') return;
    if (z.until !== undefined && now >= z.at) {
      // burning ground: lava that pulses and bubbles until it cools
      const left = clamp01((z.until - now) / 2000);
      const pulse = 0.85 + 0.15 * Math.sin(this.t * 4 + z.x * 0.1);
      this.zoneShape(z, r, col(0.95, 0.32, 0.05, 0.55 * left * pulse));
      this.zoneShape(z, r * 0.7, col(1, 0.6, 0.15, 0.45 * left * pulse));
      this.ring(z.x, z.y, r, 1.2, col(1, 0.75, 0.3, 0.8 * left));
      return;
    }
    const k = this.fill(z, now);
    if (z.kind === 'shot') return this.drawShot(z, r, k);
    if (z.kind === 'gold') return this.drawGold(z, r, k, false);
    // blinking stays under 3 times a second, and stops when the screen is calm (the filling-up ring tells the time)
    const blink = calm() ? 0.5 : 0.5 + 0.5 * Math.sin(this.t * (6 + k * 11));
    const [fr, fg, fb] = warnColour();
    this.zoneShape(z, r, col(fr, fg, fb, 0.22 + 0.1 * blink));
    // it fills up from the middle (from the boss for a cone) until it lands
    this.zoneShape(z, r * k, col(fr, fg, fb, 0.3 + 0.1 * k));
    // stripes over the whole danger, so it reads without any colour at all
    this.hatch(z, r, col(1, 1, 1, 0.55));
  }

  /**
   * Guldringen: the opposite of every red mark. Gold (sky blue when the telegraphs are colour-blind-safe, where the dangers are
   * orange), a rim of star points, arrowheads all round pointing IN, and a white ring that closes in on the middle as the time
   * runs out. Nothing in it is striped like a danger.
   */
  private drawGold(z: SagaZone, r: number, k: number, edge: boolean): void {
    const [gr, gg, gb] = goodColour();
    const still = calm();
    if (!edge) {
      drawEllipse(P(z.x, z.y), vec2(W(r * 2), W(r * 2)), col(gr, gg, gb, 0.2));
      drawEllipse(P(z.x, z.y), vec2(W(r * 1.2), W(r * 1.2)), col(1, 1, 1, 0.12));
      return;
    }
    // the rim: star points all the way round, dark under bright
    const pts: Vector2[] = [];
    const n = 24;
    const turn = still ? 0 : this.t * 0.25;
    for (let i = 0; i < n * 2; i++) {
      const a = turn + (i / (n * 2)) * TAU;
      const rr = i % 2 ? r * 1.1 : r * 0.98;
      pts.push(P(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr));
    }
    drawLineList(pts, W(3), col(0.05, 0.03, 0.08, 0.85), true);
    drawLineList(pts, W(1.5), col(gr, gg, gb, 1), true);
    // the time left: a white ring closing in
    this.ring(z.x, z.y, Math.max(2, r * (1 - k)), 1.8, col(0.05, 0.03, 0.08, 0.8));
    this.ring(z.x, z.y, Math.max(2, r * (1 - k)), 0.9, col(1, 1, 1, 0.95));
    // arrowheads pointing at the middle, sliding in
    const spokes = 8;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU + 0.2;
      for (let j = 0; j < 2; j++) {
        const u = still ? 0.25 + j * 0.4 : (this.t * 0.7 + j / 2) % 1;
        const d = r * (1.45 - u * 1.0);
        const x = z.x + Math.cos(a) * d;
        const y = z.y + Math.sin(a) * d;
        const inA = a + Math.PI;
        const sz = 5;
        const head = [P(x + Math.cos(inA + 2.5) * sz, y + Math.sin(inA + 2.5) * sz), P(x, y), P(x + Math.cos(inA - 2.5) * sz, y + Math.sin(inA - 2.5) * sz)];
        const fade = still ? 0.9 : Math.sin(u * Math.PI);
        drawLineList(head, W(2.6), col(0.05, 0.03, 0.08, 0.7 * fade));
        drawLineList(head, W(1.4), col(1, 1, 1, 0.95 * fade));
      }
    }
    // a star in the middle: here
    this.star(z.x, z.y, 5, col(1, 1, 1, 0.95));
  }

  /** A Kraftklot: a glowing rune ball that bobs gently (still when the screen is calm), in a ring that shrinks as its time runs out. */
  private drawOrb(z: SagaZone, r: number, now: number, bright: boolean): void {
    const until = z.until ?? z.at;
    const left = clamp01((until - now) / Math.max(1, until - z.at));
    if (left <= 0) return;
    const [gr, gg, gb] = goodColour();
    if (!bright) {
      this.ring(z.x, z.y + 4, r * (0.35 + 0.65 * left), 1.8, col(0.05, 0.03, 0.08, 0.7));
      this.ring(z.x, z.y + 4, r * (0.35 + 0.65 * left), 0.9, col(gr, gg, gb, 0.95));
      return;
    }
    const bob = calm() ? 0 : Math.sin(this.t * 3 + z.x) * 1.8;
    const y = z.y - 6 + bob;
    const pulse = calm() ? 1 : 0.85 + 0.15 * Math.sin(this.t * 5);
    drawSprite(this.art.glow, z.x, y, 26 * pulse, 26 * pulse, 0, rgba(gr, gg, gb, 0.55));
    drawSprite(this.art.glow, z.x, y, 12, 12, 0, rgba(1, 1, 1, 0.95));
    // the rune in it: a diamond with a stroke, like a pip
    const d = 4.2;
    drawLineList([P(z.x, y - d), P(z.x + d, y), P(z.x, y + d), P(z.x - d, y)], W(1), col(1, 1, 1, 0.95), true);
    drawLine(P(z.x - 1, y - 2), P(z.x - 1, y + 2), W(0.8), col(0.1, 0.06, 0.16, 0.9));
    drawLine(P(z.x - 1, y - 1), P(z.x + 1.4, y - 2.2), W(0.8), col(0.1, 0.06, 0.16, 0.9));
  }

  /**
   * A Skytt's line: narrow, red, and striped ACROSS like a ladder with arrowheads flying along it (a boss's line has slanting
   * stripes), so the two are told apart without colour. It fills from the bow outwards until the arrow flies.
   */
  private drawShot(z: SagaZone, r: number, k: number): void {
    const [fr, fg, fb] = warnColour();
    const dir = z.dir ?? 0;
    const wide = (z.w ?? 1.2) * TILE;
    const ux = Math.cos(dir);
    const uy = Math.sin(dir);
    const nx = -uy * (wide / 2);
    const ny = ux * (wide / 2);
    this.strip(z.x, z.y, dir, r, wide, col(fr, fg, fb, 0.2));
    this.strip(z.x, z.y, dir, r * k, wide, col(fr, fg, fb, 0.4));
    // rungs across, and arrowheads that slide towards where it will hit (still when the screen is calm)
    const gap = 10;
    const slide = calm() ? 0 : (this.t * 1.2) % 1;
    for (let d = gap * 0.5; d < r; d += gap) drawLine(P(z.x + ux * d + nx, z.y + uy * d + ny), P(z.x + ux * d - nx, z.y + uy * d - ny), W(0.9), col(1, 1, 1, 0.5));
    for (let d = gap * 2 * slide; d < r - 4; d += gap * 2) {
      const tx = z.x + ux * (d + 4);
      const ty = z.y + uy * (d + 4);
      drawLineList([P(z.x + ux * d + nx * 0.7, z.y + uy * d + ny * 0.7), P(tx, ty), P(z.x + ux * d - nx * 0.7, z.y + uy * d - ny * 0.7)], W(1.3), col(1, 1, 1, 0.9));
    }
  }

  private drawZoneEdge(z: SagaZone, now: number): void {
    const r = z.r * TILE;
    if (z.kind === 'orb') return this.drawOrb(z, r, now, true);
    if (z.kind === 'gold') return this.drawGold(z, r, this.fill(z, now), true);
    const move = this.moveOf(z);
    if (move === 'mend') return;
    if (move === 'pull' && now < z.at) return this.pullArrows(z, r, now);
    if (z.until !== undefined && now >= z.at) {
      // embers rising from the pool
      for (let i = 0; i < 4; i++) {
        const u = (this.t * 0.6 + i * 0.25 + z.x * 0.013) % 1;
        const a = (i * 2.4 + z.y) % TAU;
        drawSprite(this.art.glow, z.x + Math.cos(a) * r * 0.6, z.y + Math.sin(a) * r * 0.5 - u * 14, 4, 4, 0, rgba(1, 0.6, 0.2, 1 - u));
      }
      return;
    }
    const k = this.fill(z, now);
    const blink = calm() ? 0.5 : 0.55 + 0.45 * Math.sin(this.t * (6 + k * 11));
    const [fr, fg, fb] = warnColour();
    // a dark line under a light one: the edge shows on any floor, in any colours
    const dark = col(0.05, 0.03, 0.08, 0.9);
    const c = prefs().cb ? col(1, 1, 1, 0.75 + 0.2 * blink) : col(Math.min(1, fr + 0.15), fg + 0.1, fb + 0.1, 0.55 + 0.4 * blink);
    const edge = (w: number, cc: Color): void => {
      if (z.shape === 'cone') this.coneOutline(z, r, W(w), cc);
      else if (z.shape === 'line') this.stripOutline(z.x, z.y, z.dir ?? 0, r, (z.w ?? 1.6) * TILE, W(w), cc);
      else this.ring(z.x, z.y, r, w, cc);
    };
    edge(2.6, dark);
    edge(1.2, c);
    if (z.shape === 'circle') {
      this.ring(z.x, z.y, r * k, 1.6, dark);
      this.ring(z.x, z.y, r * k, 0.8, col(1, 1, 1, 0.9));
    }
  }

  /** Slanting stripes over a danger zone (the same for every colour setting): lines across the shape, slowly sliding unless calm. */
  private hatch(z: SagaZone, r: number, c: Color): void {
    if (r <= 2) return;
    let pts: Vector2[];
    if (z.shape === 'line') pts = this.stripPoints(z.x, z.y, z.dir ?? 0, r, (z.w ?? 1.6) * TILE);
    else if (z.shape === 'cone') {
      const dir = z.dir ?? 0;
      const arc = ((z.arc ?? 90) * Math.PI) / 180;
      pts = [P(z.x, z.y)];
      for (let i = 0; i <= 14; i++) {
        const a = dir - arc / 2 + (arc * i) / 14;
        pts.push(P(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r));
      }
    } else {
      pts = [];
      for (let i = 0; i < 32; i++) pts.push(P(z.x + Math.cos((i / 32) * TAU) * r, z.y + Math.sin((i / 32) * TAU) * r));
    }
    const gap = W(7);
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) {
      lo = Math.min(lo, p.x + p.y);
      hi = Math.max(hi, p.x + p.y);
    }
    const slide = calm() ? 0 : (this.t * 0.6) % 1;
    for (let d = Math.ceil(lo / gap) * gap + slide * gap; d < hi; d += gap) {
      // where the line x + y = d crosses the (convex) shape
      const hit: Vector2[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const da = a.x + a.y - d;
        const db = b.x + b.y - d;
        if (da === db || da * db > 0) continue;
        const u = da / (da - db);
        hit.push(vec2(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u));
      }
      if (hit.length >= 2) drawLine(hit[0]!, hit[hit.length - 1]!, W(0.9), c);
    }
  }

  /** A pull getting ready: arrows all round the circle sliding in towards the boss, turning like water down a drain. */
  private pullArrows(z: SagaZone, r: number, now: number): void {
    const k = this.fill(z, now);
    const [cr, cg, cb] = moveColour('pull', z.by);
    this.ring(z.x, z.y, r, 1.2, col(cr, cg, cb, 0.6 + 0.3 * Math.sin(this.t * 8)));
    const spokes = 8;
    for (let i = 0; i < spokes; i++) {
      for (let j = 0; j < 2; j++) {
        const u = (this.t * (0.6 + k) + j / 2 + i * 0.13) % 1;
        const d = r * (0.95 - u * 0.75);
        const a = (i / spokes) * TAU + u * 1.4 + this.t * 0.4;
        const x = z.x + Math.cos(a) * d;
        const y = z.y + Math.sin(a) * d;
        // a chevron pointing at the middle
        const inA = a + Math.PI;
        const s = 5;
        const pts = [P(x + Math.cos(inA + 2.5) * s, y + Math.sin(inA + 2.5) * s), P(x, y), P(x + Math.cos(inA - 2.5) * s, y + Math.sin(inA - 2.5) * s)];
        drawLineList(pts, W(1.3), col(cr, cg, cb, 0.85 * Math.sin(u * Math.PI)));
      }
    }
  }

  /** A strip from (x, y) along `dir`: `len` long and `wide` across (world pixels). */
  private stripPoints(x: number, y: number, dir: number, len: number, wide: number): Vector2[] {
    const ux = Math.cos(dir);
    const uy = Math.sin(dir);
    const nx = -uy * (wide / 2);
    const ny = ux * (wide / 2);
    return [P(x + nx, y + ny), P(x + ux * len + nx, y + uy * len + ny), P(x + ux * len - nx, y + uy * len - ny), P(x - nx, y - ny)];
  }

  private strip(x: number, y: number, dir: number, len: number, wide: number, c: Color): void {
    if (len <= 0.5) return;
    drawPoly(this.stripPoints(x, y, dir, len, wide), c);
  }

  private stripOutline(x: number, y: number, dir: number, len: number, wide: number, width: number, c: Color): void {
    drawLineList(this.stripPoints(x, y, dir, len, wide), width, c, true);
  }

  private zoneShape(z: SagaZone, r: number, c: Color): void {
    if (r <= 0.5) return;
    // a line fills up from the boss outwards, its width staying the same
    if (z.shape === 'line') return this.strip(z.x, z.y, z.dir ?? 0, r, (z.w ?? 1.6) * TILE, c);
    if (z.shape === 'cone') {
      const dir = z.dir ?? 0;
      const arc = ((z.arc ?? 90) * Math.PI) / 180;
      const pts: Vector2[] = [P(z.x, z.y)];
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = dir - arc / 2 + (arc * i) / n;
        pts.push(P(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r));
      }
      drawPoly(pts, c);
    } else drawEllipse(P(z.x, z.y), vec2(W(r * 2), W(r * 2)), c);
  }

  private coneOutline(z: SagaZone, r: number, width: number, c: Color): void {
    const dir = z.dir ?? 0;
    const arc = ((z.arc ?? 90) * Math.PI) / 180;
    const pts: Vector2[] = [P(z.x, z.y)];
    for (let i = 0; i <= 14; i++) {
      const a = dir - arc / 2 + (arc * i) / 14;
      pts.push(P(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r));
    }
    drawLineList(pts, width, c, true);
  }

  private ring(x: number, y: number, r: number, width: number, c: Color, n = 40): void {
    if (r <= 0.5) return;
    const pts: Vector2[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      pts.push(P(x + Math.cos(a) * r, y + Math.sin(a) * r));
    }
    drawLineList(pts, W(width), c, true);
  }

  /** A circle with little rune marks round it, turning slowly. */
  private runeCircle(x: number, y: number, r: number, turn: number, c: Color, marks = 6): void {
    if (r <= 1) return;
    this.ring(x, y, r, 1, c);
    this.ring(x, y, r * 0.78, 0.6, c, 32);
    for (let i = 0; i < marks; i++) {
      const a = turn + (i / marks) * TAU;
      const mx = x + Math.cos(a) * r * 0.89;
      const my = y + Math.sin(a) * r * 0.89;
      drawLine(P(mx - 1.6, my - 1.6), P(mx + 1.6, my + 1.6), W(0.8), c);
      drawLine(P(mx - 1.6, my + 1.6), P(mx + 1.6, my - 1.6), W(0.8), c);
    }
  }

  /** A turning ring under your target: red under a monster, green under a friend. */
  private drawTargetRing(): void {
    const t = liveTarget();
    if (t === null) return;
    const s = this.find(t);
    if (!s) return;
    const friend = typeof t === 'string';
    const rx = Math.max(9, s.w * 0.55);
    const ry = rx * 0.5;
    const c = friend ? col(0.45, 1, 0.5, 0.95) : col(1, 0.82, 0.25, 0.95);
    const segs = 8;
    const turn = calm() ? 0 : this.t * 1.6;
    // a dark ring under the bright one: it shows on any floor
    const under: Vector2[] = [];
    for (let j = 0; j < 28; j++) under.push(P(s.x + Math.cos((j / 28) * TAU) * rx, s.y + 4 + Math.sin((j / 28) * TAU) * ry));
    drawLineList(under, W(2.6), col(0.05, 0.03, 0.08, 0.7), true);
    for (let i = 0; i < segs; i++) {
      const a0 = turn + (i / segs) * TAU;
      const a1 = a0 + (TAU / segs) * 0.6;
      const pts: Vector2[] = [];
      for (let j = 0; j <= 4; j++) {
        const a = lerp(a0, a1, j / 4);
        pts.push(P(s.x + Math.cos(a) * rx, s.y + 4 + Math.sin(a) * ry));
      }
      drawLineList(pts, W(1.8), c);
    }
  }

  /** Lasting looks: a shield wall's bubble, rage's flames, the healing ring's leaves, a fallen friend's glow. */
  private drawAuras(): void {
    const snap = sagaSnap();
    if (!snap) return;
    for (const [id, f] of Object.entries(snap.f)) {
      const fl = f[2];
      if (!fl) continue;
      const s = this.find(id);
      if (!s) continue;
      const cx = s.x;
      const cy = s.y - 8;
      if (fl & FLAG.wall) {
        const pulse = 0.8 + 0.2 * Math.sin(this.t * 4);
        drawSprite(this.art.glow, cx, cy, 30, 34, 0, rgba(0.55, 0.75, 1, 0.22 * pulse));
        const pts: Vector2[] = [];
        for (let i = 0; i < 6; i++) {
          const a = this.t * 0.8 + (i / 6) * TAU;
          pts.push(P(cx + Math.cos(a) * 14, cy + Math.sin(a) * 15));
        }
        drawLineList(pts, W(0.9), col(1, 0.88, 0.5, 0.75 * pulse), true);
      }
      if (fl & FLAG.rage) {
        for (let i = 0; i < 5; i++) {
          const u = (this.t * 1.8 + i * 0.2) % 1;
          const ox = Math.sin(i * 2.1 + this.t * 3) * 6;
          drawSprite(this.art.glow, cx + ox, s.y + 2 - u * 22, 7 * (1 - u) + 2, 9 * (1 - u) + 2, 0, rgba(1, 0.35 + 0.3 * u, 0.08, 0.75 * (1 - u)));
        }
      }
      if (fl & FLAG.hot) {
        for (let i = 0; i < 3; i++) {
          const u = (this.t * 0.7 + i / 3) % 1;
          const a = i * 2.1 + this.t;
          drawSprite(this.art.glow, cx + Math.cos(a) * 8, cy + 6 - u * 18, 3.5, 3.5, 0, rgba(0.5, 1, 0.55, 1 - u));
        }
      }
      if (fl & FLAG.slow) drawSprite(this.art.glow, cx, s.y + 2, 20, 8, 0, rgba(0.5, 0.75, 1, 0.35));
      if (fl & FLAG.down) {
        // a little halo over a fallen friend
        const bob = Math.sin(this.t * 2) * 1.5;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + this.t;
          drawSprite(this.art.glow, cx + Math.cos(a) * 6, s.y - 6 + bob + Math.sin(a) * 2, 2.5, 2.5, 0, rgba(1, 0.95, 0.7, 0.8));
        }
      }
      if (fl & FLAG.frozen) {
        const tw = Math.max(0, Math.sin(this.t * 3 + cx));
        drawSprite(this.art.glow, cx - 5, cy - 9, 6 * tw, 6 * tw, 0, rgba(1, 1, 1, tw));
      }
    }
    this.drawMobAuras();
    // the boss winding up something that can be stopped: a blue shield over its head
    const b = snap.b;
    if (b?.cast?.kick) {
      const s = this.find(b.id);
      if (s) {
        const pulse = 0.6 + 0.4 * Math.sin(this.t * 10);
        drawSprite(this.art.glow, s.x, s.y + 4 - s.h - 10, 22, 22, 0, rgba(0.5, 0.85, 1, 0.6 * pulse));
      }
    }
  }

  /**
   * The monsters' lasting looks: stars round a dazed head; a gold outline and bigger stars on one that sees stars (Öppning);
   * frost under a slowed one; a blue dome over a Sköldbärare with links to the packmates it protects.
   */
  private drawMobAuras(): void {
    const snap = sagaSnap();
    if (!snap) return;
    const still = calm();
    const animals = activeWorld()?.animals ?? {};
    const domes: { id: number; s: Spot }[] = [];
    for (const [ids, m] of Object.entries(snap.m)) {
      const id = Number(ids);
      const fl = m[2];
      const a = animals[id];
      const s = a ? this.find(id) : null;
      if (!a || !s) continue;
      this.lastSpot.set(id, s);
      const top = s.y + 4 - s.h - 2;
      const cy = s.y + 4 - s.h * 0.5;
      if (fl & MOB_FLAG.open) {
        // a gold outline round the whole body, and five stars turning over the head
        const pulse = still ? 1 : 0.75 + 0.25 * Math.sin(this.t * 9);
        const pts: Vector2[] = [];
        for (let j = 0; j < 28; j++) pts.push(P(s.x + Math.cos((j / 28) * TAU) * (s.w * 0.6 + 2), cy + Math.sin((j / 28) * TAU) * (s.h * 0.58 + 2)));
        drawLineList(pts, W(1.6), col(1, 0.84, 0.25, 0.95 * pulse), true);
        drawSprite(this.art.glow, s.x, cy, s.w * 1.8, s.h * 1.6, 0, rgba(1, 0.8, 0.2, 0.16 * pulse));
        for (let i = 0; i < 5; i++) {
          const ang = (still ? 0 : this.t * 5) + (i / 5) * TAU;
          this.star(s.x + Math.cos(ang) * (s.w * 0.45 + 3), top - 2 + Math.sin(ang) * 2.5, 3.2, col(1, 0.92, 0.35, 1));
        }
      } else if (fl & MOB_FLAG.dazed) {
        for (let i = 0; i < 3; i++) {
          const ang = (still ? 0.5 : this.t * 7) + (i / 3) * TAU;
          this.star(s.x + Math.cos(ang) * 6, top + Math.sin(ang) * 2, 2.2, col(1, 0.95, 0.4, 1));
        }
      }
      if (fl & MOB_FLAG.slowed) drawSprite(this.art.glow, s.x, s.y + 2, s.w * 1.1, 8, 0, rgba(0.5, 0.8, 1, 0.5));
      if (a.role === 'shield' && !(fl & MOB_FLAG.dazed)) domes.push({ id, s });
    }
    for (const d of domes) {
      const s = d.s;
      const cy = s.y + 4 - s.h * 0.5;
      const rx = s.w * 0.75 + 4;
      const ry = s.h * 0.68 + 4;
      const breathe = still ? 1 : 0.85 + 0.15 * Math.sin(this.t * 3);
      drawSprite(this.art.glow, s.x, cy, rx * 2.6, ry * 2.6, 0, rgba(0.35, 0.6, 1, 0.22 * breathe));
      // the dome: an arch over the monster, standing on the ground
      const arch: Vector2[] = [];
      for (let j = 0; j <= 20; j++) {
        const ang = Math.PI + (j / 20) * Math.PI;
        arch.push(P(s.x + Math.cos(ang) * rx, s.y + 4 + Math.sin(ang) * ry * 1.7));
      }
      drawLineList(arch, W(1.6), col(0.6, 0.82, 1, 0.95 * breathe));
      drawLine(P(s.x - rx, s.y + 4), P(s.x + rx, s.y + 4), W(1), col(0.6, 0.82, 1, 0.6 * breathe));
      // thin links to every packmate behind the shield
      for (const [ids, m] of Object.entries(snap.m)) {
        const id = Number(ids);
        if (id === d.id || !(m[2] & MOB_FLAG.shielded)) continue;
        const o = this.find(id);
        if (!o || Math.hypot(o.x - s.x, o.y - s.y) / TILE > ROLE.shield.radius + 1) continue;
        const oy = o.y + 4 - o.h * 0.5;
        const len = Math.hypot(o.x - s.x, oy - cy);
        const n = Math.max(2, Math.floor(len / 5));
        const slide = still ? 0 : (this.t * 0.8) % 1;
        for (let i = 0; i < n; i++) {
          const u0 = (i + slide) / n;
          const u1 = Math.min(1, u0 + 0.55 / n);
          if (u0 >= 1) continue;
          drawLine(P(lerp(s.x, o.x, u0), lerp(cy, oy, u0)), P(lerp(s.x, o.x, u1), lerp(cy, oy, u1)), W(1.1), col(0.7, 0.88, 1, 0.85));
        }
        drawSprite(this.art.glow, o.x, oy, o.w * 1.3, o.h * 1.2, 0, rgba(0.35, 0.6, 1, 0.14));
      }
    }
  }

  /** A little four-pointed star (two crossed lines and a bright middle). */
  private star(x: number, y: number, r: number, c: Color): void {
    drawLine(P(x - r, y), P(x + r, y), W(1), c);
    drawLine(P(x, y - r), P(x, y + r), W(1), c);
    drawSprite(this.art.glow, x, y, r * 2.2, r * 2.2, 0, rgba(1, 0.95, 0.5, 0.8));
  }

  // ------------------------------------------------------------------ labels

  /** Floating numbers and health bars follow whoever they belong to. */
  /** `screenY`: where a world y is on the screen (px), to keep the numbers out from under the boss's bars. */
  placeLabels(place: (el: HTMLElement, x: number, y: number) => void, screenY: (y: number) => number): void {
    if (!this.live) return;
    // the lowest world y a number may end at: its text just below the boss's bars
    const floor = this.floaters.length && sagaSnap()?.b ? hudFloor() : 0;
    const zoom = screenY(1) - screenY(0);
    const minY = floor && zoom > 0 ? (floor + 8 * zoomPx() - screenY(0)) / zoom : -Infinity;
    for (const f of this.floaters) {
      if (!f.el.isConnected) continue;
      const k = clamp01((this.t - f.born) / f.life);
      const s = this.find(f.on);
      if (s) {
        f.x = s.x;
        f.y = s.y + 4 - s.h;
      }
      place(f.el, f.x + f.dx * (0.6 + 0.4 * k), Math.max(minY, f.y + f.dy - 4 - 16 * easeOutCubic(k)));
    }
    // out in the world the monsters' own labels show their hearts
    if (this.on) this.placeBars(place);
  }

  private placeBars(place: (el: HTMLElement, x: number, y: number) => void): void {
    const snap = sagaSnap();
    const seen = new Set<string>();
    const t = liveTarget();
    const bar = (key: string, s: Spot, k: number, cls: string, name: string | null, top: BarTop = {}): void => {
      seen.add(key);
      let el = this.bars.get(key);
      if (!el) {
        el = document.createElement('div');
        el.innerHTML = '<em></em><span></span><b><i></i></b>';
        this.labels.appendChild(el);
        this.bars.set(key, el);
        this.barParts.set(key, { role: '', castKey: '', ring: null, pips: null, pipsCls: '', skull: null, tick: null });
      }
      const fl = top.flags ?? 0;
      const want = `label saga-bar-${cls}${fl & MOB_FLAG.shielded ? ' shielded' : ''}${fl & MOB_FLAG.open ? ' opened' : ''}${top.mine ? ' mine' : ''}`;
      if (el.className !== want) el.className = want;
      this.barTop(el, this.barParts.get(key)!, top);
      const nm = el.children[1] as HTMLElement;
      if (nm.textContent !== (name ?? '')) nm.textContent = name ?? '';
      const fill = el.querySelector('i')!;
      const w = `${Math.max(0, Math.min(1, k)) * 100}%`;
      if (fill.style.width !== w) fill.style.width = w;
      fill.style.background = cls === 'friend' ? (k > 0.5 ? '#4fcf5a' : k > 0.25 ? '#f2c33a' : '#e8473a') : '';
      place(el, s.x, s.y + 4 - s.h - (cls === 'friend' ? 1 : 2));
    };
    const animals = activeWorld()?.animals ?? {};
    const skull = markedMob();
    const rings = (activeWorld()?.saga?.zones ?? []).filter((z) => z.kind === 'gold');
    const inRing = (sp: Spot): boolean => rings.some((z) => Math.hypot(sp.x - z.x, sp.y - z.y) <= z.r * TILE);
    if (snap) {
      for (const [ids, m] of Object.entries(snap.m)) {
        const id = Number(ids);
        const a = animals[id];
        const s = a ? this.find(id) : null;
        if (!a || !s || id === snap.b?.id) continue;
        const boss = SAGA_BOSSES[a.species];
        const named = boss || t === id || BLOCK_SPECIES.has(a.species);
        bar(`m${id}`, s, m[0] / Math.max(1, m[1]), boss ? 'boss' : BLOCK_SPECIES.has(a.species) ? 'ice' : t === id ? 'target' : 'mob', named ? a.name : null, { role: a.role, cast: snap.c?.[id], flags: m[2], skull: id === skull });
      }
      for (const [id, f] of Object.entries(snap.f)) {
        const s = this.find(id);
        const c = classOf(client.world?.players[id]);
        if (s && !(f[2] & FLAG.down)) bar(`p${id}`, s, f[0] / Math.max(1, f[1]), 'friend', null, { pips: c ? { cls: c.id, n: f[3] ?? 0, half: pipHalf(id) } : undefined, mine: id === client.me, inRing: inRing(s) });
      }
    }
    // a waiting monster you aim at shows its name too
    if (typeof t === 'number' && t !== snap?.b?.id && !seen.has(`m${t}`)) {
      const a = animals[t];
      const s = a ? this.find(t) : null;
      if (a && s) bar(`m${t}`, s, 1, 'target', a.name, { role: a.role, skull: t === skull });
    }
    // the special monsters show their marker before their pack is woken, so the party can plan (and a marked one its skull)
    for (const a of Object.values(animals)) {
      if ((!a.role && a.id !== skull) || seen.has(`m${a.id}`) || !(SAGA_MOBS[a.species] || SAGA_BOSSES[a.species]) || a.id === snap?.b?.id) continue;
      const s = this.find(a.id);
      if (s) bar(`m${a.id}`, s, 1, 'idle', null, { role: a.role, skull: a.id === skull });
    }
    for (const [key, el] of this.bars)
      if (!seen.has(key)) {
        el.remove();
        this.bars.delete(key);
        this.barParts.delete(key);
      }
  }

  /** What stands over a bar: a special monster's marker, the circle of its cast (filling), a hero's pips. */
  private barTop(el: HTMLElement, p: BarParts, top: BarTop): void {
    const row = el.firstElementChild as HTMLElement;
    const role = top.role ?? '';
    const castKey = top.cast ? `${top.cast[0]}:${top.cast[1]}` : '';
    if (role !== p.role || castKey !== p.castKey) {
      p.role = role;
      p.castKey = castKey;
      row.querySelector('.role-mark:not(.in)')?.remove();
      p.ring?.remove();
      p.ring = null;
      // while it casts, the circle (with its leaf or arrow in the middle) stands in the marker's place
      if (top.cast) {
        p.ring = castRing(top.cast[0], !!top.cast[3]);
        row.prepend(p.ring);
      } else if (top.role) row.prepend(roleMarker(top.role));
    }
    if (p.ring && top.cast) p.ring.style.setProperty('--k', castFill(top.cast, serverNow()).toFixed(3));
    const pipsCls = top.pips?.cls ?? '';
    if (pipsCls !== p.pipsCls) {
      p.pipsCls = pipsCls;
      p.pips?.remove();
      p.pips = top.pips ? pipRow(top.pips.cls, 'over') : null;
      if (p.pips) row.append(p.pips);
    }
    if (p.pips && top.pips) setPips(p.pips, top.pips.n, !this.juice().loops, top.pips.half);
    if (!!top.skull !== !!p.skull) {
      p.skull?.remove();
      p.skull = top.skull ? skullMark() : null;
      if (p.skull) row.append(p.skull);
    }
    if (!!top.inRing !== !!p.tick) {
      p.tick?.remove();
      p.tick = top.inRing ? tickMark() : null;
      if (p.tick) row.prepend(p.tick);
    }
  }
}
