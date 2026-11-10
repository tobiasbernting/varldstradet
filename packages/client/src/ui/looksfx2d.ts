// A small animated picture of a look and its effect, for the wardrobe's detail card and the loot window: the same vocabulary as the
// world's effects (shared FX_KINDS), drawn on a 2D canvas instead of the game's WebGL batch. Stops by itself when it leaves the page.
import { FX_KINDS, FX_PROCEDURAL, FX_FULL_TIER, FX_TIER, decodeLook, type DecodedLook, type FxSpec } from '@varldstradet/shared';
import { lookIcon } from '@art/characters.ts';
import { effectiveFx } from '../fxprefs.ts';

const SIZE = 22; // logical pixels each way; the canvas is shown at 4x or more with pixelated scaling
const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
interface P {
  x: number;
  y: number;
  age: number;
  life: number;
  vx: number;
  vy: number;
  size: number;
  seed: number;
  fx: FxSpec;
  rgb: [number, number, number];
}

/** Where on a 16x16 picture of the piece each anchor lies. */
const ANCHOR: Record<string, [number, number]> = { tip: [13, 2], head: [8, 3], shoulders: [8, 5], chest: [8, 8], back: [8, 10], feet: [8, 14], hand: [4, 8] };

/** A canvas with the look drawn small and its effects playing (at the tier it is at). `scale` is the size on screen in CSS pixels per pixel. */
export function lookPreview(code: string, scale = 5): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  canvas.style.cssText = `width:${SIZE * scale}px;height:${SIZE * scale}px;image-rendering:pixelated`;
  canvas.setAttribute('aria-hidden', 'true');
  const d: DecodedLook | null = decodeLook(code);
  const ctx = canvas.getContext('2d');
  if (!d || !ctx) return canvas;
  const icon = lookIcon(d).canvas;
  const off = (SIZE - 16) / 2;
  const specs: FxSpec[] = d.tier >= FX_FULL_TIER ? [d.piece.fx[0], ...(d.piece.fx[1] ? [d.piece.fx[1]] : [])] : d.tier >= FX_TIER ? [d.piece.fx[0]] : [];
  const parts: P[] = [];
  let last = performance.now();
  const next = specs.map(() => Math.random() * 0.3);
  const frame = (now: number): void => {
    if (!canvas.isConnected && now - last > 2000) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const level = effectiveFx();
    ctx.clearRect(0, 0, SIZE, SIZE);
    const t = now / 1000;
    // the soft glow of a tier 3 look, breathing
    if (d.tier >= 3 && level !== 'off') {
      const k = 0.5 + 0.5 * Math.sin((t / 1.5) * Math.PI * 2);
      const [r, g, b] = hex(d.pal.glow);
      const gr = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 1, SIZE / 2, SIZE / 2, 10);
      gr.addColorStop(0, `rgba(${r},${g},${b},${0.2 + 0.2 * k})`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
    ctx.drawImage(icon, off, off);
    if (level === 'off') return;
    specs.forEach((s, i) => {
      const [ax, ay] = ANCHOR[s.at] ?? [8, 8];
      const x0 = off + ax;
      const y0 = off + ay;
      if (FX_PROCEDURAL.has(s.fx)) {
        if (s.fx === 'glitter') {
          for (let k = 0; k < 3; k++) {
            const tw = Math.sin(t * 3.1 + k * 2.1 + i);
            if (tw < 0.5) continue;
            const [r, g, b] = hex(k % 2 ? d.pal.accent : d.pal.glow);
            ctx.fillStyle = `rgba(${r},${g},${b},${(tw - 0.5) * 2})`;
            ctx.fillRect(Math.round(x0 + (k - 1) * 3), Math.round(y0 - 2 + ((k * 5) % 4)), 1, 1);
          }
        } else if (s.fx === 'lightning' && level === 'full') {
          const slot = Math.floor(t * 6.5 + i);
          const n = (v: number): number => Math.abs(Math.sin(v * 12.9898) * 43758.5453) % 1;
          if (n(slot) < 0.35) return;
          const ang = n(slot * 3.1) * 6.28;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          let cx = x0;
          let cy = y0;
          for (let k = 1; k <= 4; k++) {
            const nx = x0 + Math.cos(ang) * 2 * k + (n(slot + k) - 0.5) * 3;
            const ny = y0 + Math.sin(ang) * 2 * k + (n(slot + k * 2) - 0.5) * 3;
            const steps = Math.max(1, Math.ceil(Math.max(Math.abs(nx - cx), Math.abs(ny - cy))));
            for (let q = 0; q <= steps; q++) ctx.fillRect(Math.round(cx + ((nx - cx) * q) / steps), Math.round(cy + ((ny - cy) * q) / steps), 1, 1);
            cx = nx;
            cy = ny;
          }
        } else if (s.fx === 'aurora' && level === 'full') {
          for (let k = 0; k < 6; k++) {
            ctx.fillStyle = `hsla(${((t * 90 + k * 32) % 360) | 0},90%,65%,0.7)`;
            ctx.fillRect(Math.round(x0 - 6 + k * 2.2), Math.round(y0 + Math.sin(t * 2 + k) * 1.5), 2, 2);
          }
        } else if (s.fx === 'runepulse') {
          const k = 0.5 + 0.5 * Math.sin((t / 1.5) * Math.PI * 2);
          const [r, g, b] = hex(d.pal.glow);
          ctx.fillStyle = `rgba(${r},${g},${b},${0.15 + 0.2 * k})`;
          ctx.fillRect(Math.round(x0 - 2), Math.round(y0 - 2), 4, 4);
        }
        return;
      }
      const kind = FX_KINDS[s.fx];
      if (!kind || level !== 'full') return;
      next[i]! -= dt;
      if (next[i]! <= 0 && parts.length < 8) {
        next[i] = (1 / kind.rate) * 1.6 * (0.7 + Math.random() * 0.6);
        parts.push({ x: x0 + (Math.random() - 0.5) * 3, y: y0, age: 0, life: kind.life * (0.8 + Math.random() * 0.4), vx: (Math.random() - 0.5) * 2 * kind.vx, vy: kind.vy, size: kind.size[0], seed: Math.random() * 6, fx: s, rgb: hex(d.pal[kind.color]) });
      }
    });
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]!;
      const kind = FX_KINDS[p.fx.fx]!;
      p.age += dt;
      if (p.age >= p.life) {
        parts.splice(i, 1);
        continue;
      }
      p.vy += (kind.gy ?? 0) * dt;
      p.x += (p.vx + (kind.sway ? Math.sin(p.age * 4 + p.seed) * kind.sway : 0)) * dt;
      p.y += p.vy * dt;
      const k = p.age / p.life;
      ctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${kind.alpha * (1 - k)})`;
      const w = Math.max(1, Math.round(p.size * (p.fx.fx === 'smoke' ? 1 + k : 1)));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), w, kind.tall ? w * 2 : w);
    }
  };
  requestAnimationFrame(frame);
  return canvas;
}
