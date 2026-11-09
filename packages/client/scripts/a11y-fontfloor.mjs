// Puts a floor under every font size in the HUD's stylesheets and makes them follow the text-size setting:
//   font-size: calc(4 * var(--u))          ->  max(var(--fs), calc(4 * var(--u) * var(--txt)))
//   font-size: max(16px, calc(4 * var(--u))) -> the same
//   font-size: 14px                         ->  var(--fs)       (anything under 16 px)
//   font-size: 20px                         ->  calc(20px * var(--txt))
// --fs is 16px times the text size (ui/a11y.css, a11y.ts). Safe to run again: lines that already use --fs are left alone,
// so after a merge it can be run once more over files other branches have added rules to:
//   node packages/client/scripts/a11y-fontfloor.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '../src');
const files = ['style.css', 'ui/saga.css', 'ui/run.css', 'ui/looks.css'];
let total = 0;
for (const f of files) {
  const p = join(src, f);
  const before = readFileSync(p, 'utf8');
  const out = before
    .split('\n')
    .map((line) => {
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
