// Puts a floor under every font size in the HUD's stylesheets and makes them follow the text-size setting:
//   font-size: calc(4 * var(--u))          ->  max(var(--fs), calc(4 * var(--u) * var(--txt)))
//   font-size: max(16px, calc(4 * var(--u))) -> the same
//   font-size: 14px                         ->  var(--fs)       (anything under 16 px)
//   font-size: 20px                         ->  calc(20px * var(--txt))
// Gaps under 8 px become 8 px (gap: max(8px, ...)).
// --fs is 16px times the text size (ui/a11y.css, a11y.ts). Safe to run again: lines that already use --fs are left alone,
// so after a merge it can be run once more over files other branches have added rules to:
//   node packages/client/scripts/a11y-fontfloor.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '../src');
const files = ['style.css', 'ui/saga.css', 'ui/run.css', 'ui/looks.css', 'ui/lane.css', 'ui/log.css', 'hud.css'];
let total = 0;
for (const f of files) {
  const p = join(src, f);
  const before = readFileSync(p, 'utf8');
  const out = before
    .split('\n')
    .map((line) => {
      // gaps between things you touch: at least 8 px (the HUD's own unit is 3 px on a tablet)
      const g = line.match(/^(\s*)((?:column-|row-)?gap):\s*(.+?);\s*$/);
      if (g) {
        if (/max\(/.test(g[3])) return line;
        const parts = [];
        let depth = 0;
        let cur = '';
        for (const ch of g[3]) {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
          if (ch === ' ' && depth === 0) {
            if (cur) parts.push(cur);
            cur = '';
          } else cur += ch;
        }
        if (cur) parts.push(cur);
        const out = parts.map((p) => {
          const m = p.match(/^(?:var\(--u\)|calc\(\s*([\d.]+)\s*\*\s*var\(--u\)\s*\))$/);
          return m && (m[1] === undefined || Number(m[1]) < 2.7) ? `max(8px, ${p})` : p;
        });
        const joined = out.join(' ');
        return joined === g[3] ? line : `${g[1]}${g[2]}: ${joined};`;
      }
      if (!/font-size:/.test(line) || /--fs|--txt/.test(line)) return line;
      let m = line.match(/font-size:\s*calc\(\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)/);
      if (m) return line.replace(m[0], `font-size: max(var(--fs), calc(${m[1]} * var(--u) * var(--txt)))`);
      m = line.match(/font-size:\s*max\(\s*([\d.]+)px,\s*calc\(\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)\s*\)/);
      if (m) return line.replace(m[0], Number(m[1]) <= 16 ? `font-size: max(var(--fs), calc(${m[2]} * var(--u) * var(--txt)))` : `font-size: max(calc(${m[1]}px * var(--txt)), calc(${m[2]} * var(--u) * var(--txt)))`);
      m = line.match(/font-size:\s*([\d.]+)px/);
      if (m) return line.replace(m[0], Number(m[1]) < 16 ? 'font-size: var(--fs)' : `font-size: calc(${m[1]}px * var(--txt))`);
      return line;
    })
    .join('\n');
  if (out !== before) {
    writeFileSync(p, out);
    total += before.split('\n').filter((l, i) => l !== out.split('\n')[i]).length;
  }
}
console.log(`font sizes changed: ${total}`);
