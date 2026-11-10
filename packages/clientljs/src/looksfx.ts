// The effects of the looks (shared/src/looks.ts): a small data-driven vocabulary of glows and particles that read at sprite size.
// A piece names its effects by id and anchor; from shine tier 3 it glows, from tier 4 it throws its first effect, at tier 5 both,
// and the set adds an aura (a ground glow, or a ghost trail). Everything is drawn as 1-4 pixel rectangles from a pool, with a hard
// cap per player (8 live particles; procedural arcs and glints count against 4 more) and a global one, never a new object per
// particle. Drawn in the bright pass, before the dungeon's telegraphs, so a boss's marks always lie over it. "Effekter: full /
// mindre / av" is kept on the device (client/src/fxprefs.ts); reduced keeps only the glows and glitter, off keeps nothing.
import { setAdditiveBlendMode } from 'littlejsengine';
import { decodeLook, FX_FULL_TIER, FX_KINDS, FX_PROCEDURAL, FX_TIER, type DecodedLook, type FxAnchor, type FxId, type FxKind, type LookSlot } from '@lilla-garden/shared';
import { effectiveFx } from '@v1/fxprefs.ts';
import type { Sprites } from './art.ts';
import { drawSprite, rgba } from './gfx.ts';

/** Live particles one player may have, the extra arcs and glints they may show, and the whole screen's. */
export const FX_PLAYER_CAP = 8;
export const FX_PROCEDURAL_CAP = 4;
export const FX_GLOBAL_CAP = 120;
/** A pet's own, smaller budget (its gear never eats into its owner's): 3 live particles and 2 procedural effects, a small aura, no trail. */
export const FX_PET_CAP = 3;
export const FX_PET_PROCEDURAL_CAP = 2;

const KINDS = FX_KINDS;
const PROCEDURAL = FX_PROCEDURAL;

const SLOT_ANCHOR: Record<LookSlot, FxAnchor> = { hat: 'head', shoulders: 'shoulders', shirt: 'chest', cloak: 'back', weapon: 'tip', offhand: 'hand', amulet: 'chest' };

interface Particle {
  live: boolean;
  owner: string;
  kind: FxKind;
  id: FxId;
  x: number;
  y: number;
  age: number;
  life: number;
  vx: number;
  vy: number;
  size: number;
  seed: number;
  r: number;
  g: number;
  b: number;
}

/** One effect of one player: what, where on the figure, in which colours, and its own beat. */
interface Emitter {
  fx: FxId;
  at: FxAnchor;
  pal: DecodedLook['pal'];
  /** Seconds to the next particle. */
  next: number;
  /** The tier: 3 only glows, 4 and 5 throw. */
  tier: number;
}

/** What the view tells about each player in sight, every frame. */
export interface FxActor {
  id: string;
  x: number;
  /** The feet. */
  y: number;
  facing: 'up' | 'down' | 'left' | 'right';
  moving: boolean;
  seed: number;
  /** The `piece|tier|way` codes worn (`outfit.looks`), or undefined. */
  looks: Partial<Record<LookSlot, string>> | undefined;
  /** A pet (its gear, hat = head, amulet = neck, cloak = back): the world positions of its head, neck and back this frame. */
  pet?: { head: [number, number]; chest: [number, number]; back: [number, number] };
}

interface Rig {
  key: string;
  /** Decoded pieces by slot. */
  looks: DecodedLook[];
  emitters: Emitter[];
  /** Procedural effects: glints, arcs, glows. */
  glows: { at: FxAnchor; pal: DecodedLook['pal']; fx: FxId }[];
  aura: { kind: 'ring' | 'trail'; pal: DecodedLook['pal'] } | null;
  /** Positions the trail's ghosts stand at (newest first). */
  ghosts: { x: number; y: number; age: number; facing: FxActor['facing'] }[];
  ghostNext: number;
  lastX: number;
  lastY: number;
}

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const hsv = (h: number): [number, number, number] => {
  const k = (n: number): number => (n + h * 6) % 6;
  const f = (n: number): number => 1 - 0.55 * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [f(5), f(3), f(1)];
};
const noise = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export class LooksFx {
  private pool: Particle[] = [];
  private rigs = new Map<string, Rig>();
  private count = new Map<string, number>();
  private live = 0;
  /** Timing of the last frame (ms) and what was on screen, for the frame cost check. */
  stats = { ms: 0, live: 0, actors: 0, procedural: 0 };

  constructor(private art: Sprites) {
    for (let i = 0; i < FX_GLOBAL_CAP; i++) this.pool.push({ live: false, owner: '', kind: KINDS.embers!, id: 'embers', x: 0, y: 0, age: 0, life: 1, vx: 0, vy: 0, size: 1, seed: 0, r: 1, g: 1, b: 1 });
  }

  clear(): void {
    for (const p of this.pool) p.live = false;
    this.live = 0;
    this.rigs.clear();
  }

  /** The rig of a player: what they wear, decoded once for as long as the outfit stays the same. */
  private rigOf(a: FxActor): Rig | null {
    const looks = a.looks;
    if (!looks) {
      this.rigs.delete(a.id);
      return null;
    }
    const key = Object.values(looks).join(',');
    let rig = this.rigs.get(a.id);
    if (rig && rig.key === key) return rig;
    const decoded: DecodedLook[] = [];
    for (const c of Object.values(looks)) {
      const d = decodeLook(c);
      if (d) decoded.push(d);
    }
    // a hard budget: every effect is named once however many pieces share it (the sets repeat their signature effect)
    const emitters: Emitter[] = [];
    const glows: Rig['glows'] = [];
    for (const d of decoded) {
      // (a pet's gear throws one small effect from tier 4 and never a second: tier 5 adds the ground glow instead)
      const specs = a.pet ? (d.tier >= FX_TIER ? [d.piece.fx[0]] : []) : d.tier >= FX_FULL_TIER ? [d.piece.fx[0], d.piece.fx[1]] : d.tier >= FX_TIER ? [d.piece.fx[0]] : [];
      for (const s of specs) {
        if (!s) continue;
        if (PROCEDURAL.has(s.fx)) {
          if (!glows.some((g) => g.fx === s.fx && g.at === s.at)) glows.push({ at: s.at, pal: d.pal, fx: s.fx });
        } else if (!emitters.some((e) => e.fx === s.fx && e.at === s.at)) emitters.push({ fx: s.fx, at: s.at, pal: d.pal, next: Math.random() * 0.4, tier: d.tier });
      }
      // from tier 3 a piece glows where it is (a soft pulse, no particles)
      if (d.tier >= 3) glows.push({ at: SLOT_ANCHOR[d.piece.slot], pal: d.pal, fx: 'runepulse' });
    }
    // the procedural ones too have a budget: the effects themselves first, the soft glows after
    glows.sort((x, y) => Number(x.fx === 'runepulse') - Number(y.fx === 'runepulse'));
    glows.length = Math.min(glows.length, a.pet ? FX_PET_PROCEDURAL_CAP : FX_PROCEDURAL_CAP);
    const top = decoded.find((d) => d.tier >= FX_FULL_TIER);
    const set = top ? top.piece.set : '';
    const trail = !a.pet && top && (set === 'bjornbarsark' || set === 'skuggornas' || set === 'lokeslek' || set === 'sig_gungner');
    rig = { key, looks: decoded, emitters, glows, aura: top ? { kind: trail ? 'trail' : 'ring', pal: top.pal } : null, ghosts: rig?.ghosts ?? [], ghostNext: 0, lastX: a.x, lastY: a.y };
    this.rigs.set(a.id, rig);
    return rig;
  }

  /** Where on a figure standing at (x, y) an effect comes from. */
  private anchor(at: FxAnchor, a: FxActor, k: number): [number, number] {
    if (a.pet) {
      // a pet: the three points the view worked out from the animal's own table (head, neck, back), nothing on the feet or in a hand
      const q = at === 'head' ? a.pet.head : at === 'back' ? a.pet.back : a.pet.chest;
      return [q[0] + (k % 2 ? -1 : 1), q[1]];
    }
    const sx = a.facing === 'left' ? -1 : 1;
    const side = a.facing === 'left' || a.facing === 'right';
    switch (at) {
      case 'head':
        return [a.x + (k % 2 ? -3 : 3) * (side ? 0.4 : 1), a.y - 26];
      case 'shoulders':
        return [a.x + (side ? 0 : k % 2 ? -6 : 6), a.y - 17];
      case 'chest':
        return [a.x + (side ? sx : 0), a.y - 14];
      case 'back':
        return a.facing === 'up' ? [a.x + (k % 2 ? -4 : 4), a.y - 9] : side ? [a.x - sx * 6, a.y - 10] : [a.x + (k % 2 ? -7 : 7), a.y - 5];
      case 'feet':
        return [a.x, a.y];
      case 'hand':
        return a.facing === 'up' ? [a.x + 8, a.y - 9] : side ? [a.x - sx * 1, a.y - 8] : [a.x - 7, a.y - 8];
      default:
        // the weapon's tip, up and out in front of the hero's hand
        return a.facing === 'up' ? [a.x - 9, a.y - 14] : a.facing === 'down' ? [a.x + 9, a.y - 11] : [a.x + sx * 11, a.y - 13];
    }
  }

  private spawn(a: FxActor, e: Emitter, k: number): void {
    const kind = KINDS[e.fx];
    if (!kind) return;
    let slot: Particle | undefined;
    for (const p of this.pool) {
      if (!p.live) {
        slot = p;
        break;
      }
    }
    if (!slot) return;
    const [x, y] = this.anchor(e.at, a, k);
    const base = rgbOf(e.pal[kind.color]);
    const c = kind.color === 'glow' ? mix(base, rgbOf(e.pal.accent), 0.3 * Math.random()) : base;
    slot.live = true;
    slot.owner = a.id;
    slot.kind = kind;
    slot.id = e.fx;
    slot.x = x + (Math.random() - 0.5) * 3;
    slot.y = y + (Math.random() - 0.5) * 2;
    slot.age = 0;
    slot.life = kind.life * (0.8 + Math.random() * 0.4);
    slot.vx = (Math.random() - 0.5) * 2 * kind.vx;
    slot.vy = kind.vy * (0.8 + Math.random() * 0.4);
    slot.size = kind.size[0] + Math.random() * (kind.size[1] - kind.size[0]);
    slot.seed = Math.random() * 6.28;
    [slot.r, slot.g, slot.b] = c;
    this.live++;
    this.count.set(a.id, (this.count.get(a.id) ?? 0) + 1);
  }

  /**
   * Advances the effects by `dt` seconds. `actors` are the players in sight (others are forgotten); a player with no looks costs
   * nothing here.
   */
  update(dt: number, actors: FxActor[]): void {
    const t0 = performance.now();
    const level = effectiveFx();
    // age and move what flies
    this.count.clear();
    for (const p of this.pool) {
      if (!p.live) continue;
      p.age += dt;
      if (p.age >= p.life || level !== 'full') {
        p.live = false;
        this.live--;
        continue;
      }
      p.vy += (p.kind.gy ?? 0) * dt;
      p.x += (p.vx + (p.kind.sway ? Math.sin(p.age * 4 + p.seed) * p.kind.sway : 0)) * dt;
      p.y += p.vy * dt;
      this.count.set(p.owner, (this.count.get(p.owner) ?? 0) + 1);
    }
    const seen = new Set<string>();
    let procedural = 0;
    if (level !== 'off') {
      for (const a of actors) {
        const rig = this.rigOf(a);
        if (!rig) continue;
        seen.add(a.id);
        procedural += rig.glows.length;
        if (level !== 'full') continue;
        // the ghost trail of a set at tier 5 that leaves one: a few fading copies behind a mover
        if (rig.aura?.kind === 'trail') {
          const moved = Math.hypot(a.x - rig.lastX, a.y - rig.lastY) > 0.2;
          rig.lastX = a.x;
          rig.lastY = a.y;
          rig.ghostNext -= dt;
          if (moved && a.moving && rig.ghostNext <= 0) {
            rig.ghostNext = 0.09;
            rig.ghosts.unshift({ x: a.x, y: a.y, age: 0, facing: a.facing });
            if (rig.ghosts.length > 3) rig.ghosts.pop();
          }
          for (const g of rig.ghosts) g.age += dt;
          while (rig.ghosts.length && rig.ghosts[rig.ghosts.length - 1]!.age > 0.4) rig.ghosts.pop();
        } else rig.ghosts.length = 0;
        // throw particles, the player's budget shared by their emitters in turn
        let k = 0;
        for (const e of rig.emitters) {
          const kind = KINDS[e.fx]!;
          e.next -= dt;
          if (e.next > 0) continue;
          e.next += (1 / kind.rate) * (1.3 + rig.emitters.length * 0.35) * (0.7 + Math.random() * 0.6);
          if ((this.count.get(a.id) ?? 0) >= (a.pet ? FX_PET_CAP : FX_PLAYER_CAP) || this.live >= FX_GLOBAL_CAP) continue;
          this.spawn(a, e, k++);
        }
        // a hero who stands still sparkles a little less than one who runs
        void a.seed;
      }
    }
    // players who left the picture lose their rigs
    for (const id of this.rigs.keys()) if (!seen.has(id)) this.rigs.delete(id);
    this.stats.live = this.live;
    this.stats.actors = seen.size;
    this.stats.procedural = procedural;
    this.stats.ms = performance.now() - t0;
  }

  /** The ghosts of a mover with a trail, newest first, for the view to draw as tinted copies of the figure. */
  ghostsOf(id: string): { x: number; y: number; alpha: number; facing: FxActor['facing']; tint: [number, number, number] }[] {
    const rig = this.rigs.get(id);
    if (!rig || !rig.ghosts.length || effectiveFx() !== 'full' || !rig.aura) return [];
    const tint = rgbOf(rig.aura.pal.glow);
    return rig.ghosts.map((g) => ({ x: g.x, y: g.y, alpha: 0.34 * (1 - g.age / 0.4), facing: g.facing, tint }));
  }

  /** Draws the effects: the dark ones with normal blending, then the lights. Call before the dungeon's telegraphs are drawn. */
  draw(t: number, actors: FxActor[]): void {
    const level = effectiveFx();
    if (level === 'off') return;
    const t0 = performance.now();
    const px = this.art.white;
    const glow = this.art.glow;
    // 1. dark things (normal blend): smoke, leaves, tendrils
    if (level === 'full') {
      setAdditiveBlendMode(false);
      for (const p of this.pool) {
        if (!p.live || p.kind.add) continue;
        const k = p.age / p.life;
        if (p.id === 'tendrils') {
          // a curling thread of four pixels rising
          for (let i = 0; i < 4; i++) drawSprite(px, Math.round(p.x + Math.sin(p.age * 5 + p.seed + i * 0.9) * (1 + i * 0.5)), Math.round(p.y - i * 2), 1, 2, 0, rgba(p.r, p.g, p.b, p.kind.alpha * (1 - k) * (1 - i * 0.18)));
        } else if (p.id === 'smoke') {
          const s = p.size * (1 + k);
          drawSprite(px, Math.round(p.x), Math.round(p.y), Math.round(s), Math.round(s), 0, rgba(p.r, p.g, p.b, p.kind.alpha * (1 - k)));
        } else drawSprite(px, Math.round(p.x), Math.round(p.y), Math.round(p.size), Math.round(p.size), 0, rgba(p.r, p.g, p.b, p.kind.alpha * Math.min(1, (1 - k) * 2)));
      }
    }
    // 2. lights (additive): particles, then the glows, glitter, arcs and bands, then each aura
    setAdditiveBlendMode(true);
    if (level === 'full') {
      for (const p of this.pool) {
        if (!p.live || !p.kind.add) continue;
        const k = p.age / p.life;
        const a = p.kind.alpha * (1 - k);
        const w = Math.round(p.size);
        drawSprite(px, Math.round(p.x), Math.round(p.y), w, p.kind.tall ? w * 2 : w, 0, rgba(p.r, p.g, p.b, a));
        if (p.id === 'embers') drawSprite(glow, p.x, p.y, 5, 5, 0, rgba(p.r, p.g, p.b, a * 0.25));
      }
    }
    for (const a of actors) {
      const rig = this.rigs.get(a.id);
      if (!rig) continue;
      for (const g of rig.glows) this.drawProcedural(g, a, rig, t, level === 'full', px, glow);
      if (rig.aura && level === 'full') this.drawAura(rig, a, t, px, glow);
    }
    setAdditiveBlendMode(false);
    this.stats.ms += performance.now() - t0;
  }

  private drawProcedural(g: Rig['glows'][number], a: FxActor, rig: Rig, t: number, full: boolean, px: Sprites['white'], glow: Sprites['glow']): void {
    const [x, y] = this.anchor(g.at, a, 0);
    const c = rgbOf(g.pal.glow);
    switch (g.fx) {
      case 'runepulse': {
        // the item's own light breathing on a 1.5 s sine
        const k = 0.5 + 0.5 * Math.sin((t / 1.5) * Math.PI * 2 + a.seed);
        const sz = a.pet ? 0.6 : 1;
        drawSprite(glow, x, y, (9 + 3 * k) * sz, (9 + 3 * k) * sz, 0, rgba(c[0], c[1], c[2], 0.12 + 0.16 * k));
        break;
      }
      case 'glitter': {
        // three fixed spots near the item that twinkle in turn
        for (let i = 0; i < (g.at === 'chest' || g.at === 'hand' ? 1 : 3); i++) {
          const tw = Math.sin(t * 3.1 + i * 2.1 + a.seed * 3);
          if (tw < 0.55) continue;
          const [ax, ay] = this.anchor(g.at, a, i);
          const ox = (noise(a.seed + i * 3.3) - 0.5) * (a.pet ? 4 : 9);
          const oy = (noise(a.seed + i * 7.9) - 0.5) * (a.pet ? 3 : 7);
          const al = (tw - 0.55) / 0.45;
          const ac = rgbOf(i % 2 ? g.pal.accent : g.pal.glow);
          drawSprite(px, Math.round(ax + ox), Math.round(ay + oy), 1, 1, 0, rgba(ac[0], ac[1], ac[2], al));
          if (al > 0.6) drawSprite(px, Math.round(ax + ox), Math.round(ay + oy), 3, 1, 0, rgba(ac[0], ac[1], ac[2], al * 0.45)), drawSprite(px, Math.round(ax + ox), Math.round(ay + oy), 1, 3, 0, rgba(ac[0], ac[1], ac[2], al * 0.45));
        }
        break;
      }
      case 'lightning': {
        if (!full) break;
        // a zig-zag of three or four segments that jumps to a new shape a few times a second, and is dark between
        const slot = Math.floor(t * 6.5 + a.seed);
        if (noise(slot * 1.7 + a.seed) < 0.35) break;
        const ang = noise(slot * 3.1 + a.seed) * 6.28;
        const len = 6 + noise(slot * 5.3) * 4;
        let cx = x;
        let cy = y;
        for (let i = 0; i < 4; i++) {
          const nx = x + Math.cos(ang) * (len * (i + 1)) / 4 + (noise(slot + i * 9.1) - 0.5) * 4;
          const ny = y + Math.sin(ang) * (len * (i + 1)) / 4 + (noise(slot + i * 4.7) - 0.5) * 4;
          const steps = Math.max(Math.abs(nx - cx), Math.abs(ny - cy));
          for (let s = 0; s <= steps; s++) {
            const u = steps ? s / steps : 0;
            drawSprite(px, Math.round(cx + (nx - cx) * u), Math.round(cy + (ny - cy) * u), 1, 1, 0, rgba(1, 1, 1, 0.9));
          }
          cx = nx;
          cy = ny;
        }
        drawSprite(glow, x, y, 8, 8, 0, rgba(c[0], c[1], c[2], 0.3));
        break;
      }
      case 'aurora': {
        if (!full || (g.at !== 'back' && g.at !== 'head')) break; // one band on the cloak and one on the hat: calm, not a rainbow all over
        // a band of four bigger squares that cycles through the colours across the item
        for (let i = 0; i < 4; i++) {
          const [r, gg, b] = hsv((t * 0.2 + i * 0.12 + a.seed * 0.1) % 1);
          drawSprite(px, Math.round(x - 5 + i * 3.4), Math.round(y + Math.sin(t * 2 + i) * 1.5), 3, 3, 0, rgba(r, gg, b, 0.5));
        }
        break;
      }
      default:
    }
    void rig;
  }

  /** A look standing on a gear stand in a house: its glow and a few glints (tier 3 and up), at the stand's arms. */
  drawStand(x: number, y: number, code: string, t: number): void {
    const level = effectiveFx();
    const d = decodeLook(code);
    if (!d || level === 'off' || d.tier < 3) return;
    setAdditiveBlendMode(true);
    const c = rgbOf(d.pal.glow);
    const k = 0.5 + 0.5 * Math.sin((t / 1.5) * Math.PI * 2 + x);
    drawSprite(this.art.glow, x, y, 18 + 4 * k, 18 + 4 * k, 0, rgba(c[0], c[1], c[2], 0.18 + 0.2 * k));
    if (d.tier >= FX_TIER && level === 'full') {
      for (let i = 0; i < 3; i++) {
        const tw = Math.sin(t * 2.7 + i * 2.3 + x);
        if (tw < 0.4) continue;
        const ac = rgbOf(i % 2 ? d.pal.accent : d.pal.glow);
        drawSprite(this.art.white, Math.round(x + (noise(x + i * 3.3) - 0.5) * 14), Math.round(y - 6 + (noise(x + i * 7.9) - 0.5) * 12 - ((t * 5 + i * 4) % 6)), 1, 1, 0, rgba(ac[0], ac[1], ac[2], (tw - 0.4) / 0.6));
      }
    }
    setAdditiveBlendMode(false);
  }

  /** The tier 5 aura: a glow on the ground round the feet with a few glints circling, or a ghost trail behind a mover (the view draws those). */
  private drawAura(rig: Rig, a: FxActor, t: number, px: Sprites['white'], glow: Sprites['glow']): void {
    if (!rig.aura) return;
    // never the colour of a boss's warning on the ground: a red or orange glow gives way to the pale accent colour
    let c = rgbOf(rig.aura.pal.glow);
    if (c[0] > 0.8 && c[1] < 0.72 && c[2] < 0.5) c = rgbOf(rig.aura.pal.accent);
    const k = 0.5 + 0.5 * Math.sin(t * 2 + a.seed);
    // a pet's aura is a small soft ground glow
    const sc = a.pet ? 0.55 : 1;
    drawSprite(glow, a.x, a.y + 1, 24 * sc, 8 * sc, 0, rgba(c[0], c[1], c[2], 0.16 + 0.1 * k));
    // (a pet gets the soft glow only: no pixels circling it)
    for (let i = 0; i < (a.pet ? 0 : 3); i++) {
      const ang = t * 1.3 + (i / (a.pet ? 2 : 3)) * 6.28 + a.seed;
      drawSprite(px, Math.round(a.x + Math.cos(ang) * 9 * sc), Math.round(a.y + 1 + Math.sin(ang) * 3 * sc), 1, 1, 0, rgba(1, 1, 1, 0.55 + 0.3 * Math.sin(t * 5 + i)));
    }
  }
}
