// Accessibility audit of the running game (Playwright, headless Chromium). Not part of the test run: it needs a server.
//   node packages/client/scripts/a11y-audit.cjs [--url http://localhost:8110/] [--out dir] [--tag after] [--only 1024x768]
// For four viewports it plays to each screen (picker, lobby, bag, class window, journal, wardrobe, settings, fight HUD, arch
// window, run stop with the cards, summary) and measures every visible interactive element (size, gap to the next), the computed
// font size of every text, and the contrast of text against what is really behind it (a screenshot taken with the text hidden).
// It prints and writes a JSON with the counts of violations. Playwright is not a dependency of the repo: it must be installed.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8110/');
const OUT = arg('out', path.join(__dirname, '../../../.a11y-out'));
const TAG = arg('tag', 'run');
const ONLY = arg('only', '');
const SCENES = arg('scenes', '').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
const MEASURE = fs.readFileSync(path.join(__dirname, 'a11y-measure.js'), 'utf8');
const VIEWPORTS = [
  { w: 1024, h: 768, touch: true },
  { w: 768, h: 1024, touch: true },
  { w: 1280, h: 720, touch: false },
  { w: 640, h: 360, touch: true },
].filter((v) => !ONLY || `${v.w}x${v.h}` === ONLY);
const MIN_TARGET = 48;
const MIN_FONT = 16;

async function newPage(browser, v, storage) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, hasTouch: v.touch, isMobile: v.touch, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errs.push(m.text()); });
  page.on('pageerror', (e) => page.errs.push('PAGEERROR: ' + e.message));
  await page.addInitScript(() => { const W = window.WebSocket; window.WebSocket = function (...a) { const w = new W(...a); window.__ws = w; return w; }; window.WebSocket.prototype = W.prototype; for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) window.WebSocket[k] = W[k]; });
  await page.addInitScript((s) => { try { localStorage.setItem('varldstradet.helpSeen', '1'); for (const [k, x] of Object.entries(s || {})) localStorage.setItem(k, x); } catch {} }, storage || {});
  page.send = (o) => page.evaluate((o) => window.__ws.send(JSON.stringify(o)), o);
  return page;
}
async function join(page, name, cls) {
  await page.goto(URL);
  await page.waitForSelector('.card.new', { state: 'attached' });
}
async function create(page, name, cls) {
  await page.evaluate(() => document.querySelector('.card.new').click());
  await page.fill('.opts input', name);
  await page.evaluate(() => document.querySelector('.opts .tabs button:not(.alt):not([data-style])').click());
  await page.waitForTimeout(3000);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
  if (cls) { await page.send({ t: 'saga', a: 'class', cls }); await page.waitForTimeout(500); }
}
const me = (page) => page.evaluate(() => { const c = window.varldstradet.client; const p = c.world.players[c.me]; return { x: p.x, y: p.y, area: p.area }; });
async function walkTo(page, tx, ty) {
  const m = await me(page);
  let x = m.x, y = m.y; const gx = (tx + 0.5) * 16, gy = (ty + 0.5) * 16;
  while (Math.hypot(gx - x, gy - y) > 3) {
    const d = Math.hypot(gx - x, gy - y); const s = Math.min(6, d);
    x += (gx - x) / d * s; y += (gy - y) / d * s;
    await page.send({ t: 'move', x, y, facing: 'down', moving: true });
    await page.waitForTimeout(30);
  }
  await page.send({ t: 'move', x, y, facing: 'down', moving: false });
}

// pixels behind each text: a screenshot with the text hidden, sampled inside the text's box
async function sampleBackings(page, items) {
  await page.addStyleTag({ content: '*{color:transparent !important;text-shadow:none !important;-webkit-text-fill-color:transparent !important}' }).then(async (h) => {
    await page.waitForTimeout(60);
    const png = await page.screenshot();
    await h.evaluate((n) => n.remove());
    const b64 = png.toString('base64');
    const res = await page.evaluate(async ({ b64, items }) => {
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      return items.map((it) => {
        const px = [];
        const { x, y, w, h } = it.rect;
        for (let i = 0; i < 12; i++) for (let j = 0; j < 4; j++) {
          const sx = Math.min(img.width - 1, Math.max(0, Math.round(x + (w * (i + 0.5)) / 12))), sy = Math.min(img.height - 1, Math.max(0, Math.round(y + (h * (j + 0.5)) / 4)));
          const d = g.getImageData(sx, sy, 1, 1).data; px.push([d[0], d[1], d[2]]);
        }
        return px;
      });
    }, { b64, items });
    items.forEach((it, i) => (it.px = res[i]));
  });
}
const lumOf = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratioOf = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

async function measure(page, v, label, res) {
  if (SCENES.length && !SCENES.includes(label)) return;
  await page.evaluate(MEASURE);
  const d = await page.evaluate((o) => window.__a11y(o), { touch: v.touch });
  const textual = d.contrast.filter((c) => !/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\s️‍\d]+$/u.test(c.text));
  await sampleBackings(page, textual);
  const bad = { small: [], tiny: [], gap: [], noName: d.noName, contrast: [] };
  for (const t of d.targets) if (t.w < MIN_TARGET || t.h < MIN_TARGET) bad.small.push(`${t.sel} "${t.name}" ${t.w}x${t.h} @${t.x},${t.y}`);
  const isSpell = (s) => /saga-spell/.test(s);
  for (const g of d.gaps) if (g.gap < (isSpell(g.a) && isSpell(g.b) ? 12 : 8)) bad.gap.push(`${g.a} | ${g.b} gap ${g.gap}`);
  for (const f of d.fonts) { if (f.emoji) continue; if (f.fs < MIN_FONT) bad.tiny.push(`${f.sel} "${f.text}" ${f.fs}px`); }
  for (const c of textual) {
    const fg = [c.fg.r, c.fg.g, c.fg.b];
    const rs = c.px.map((p) => ratioOf(fg, p)).sort((a, b) => a - b);
    const worst = rs[Math.floor(rs.length * 0.1)] ?? 21;
    const large = c.fs >= 24 || (c.fs >= 18.66 && c.bold);
    const need = c.solid < 0.85 ? 7 : 4.5;
    if (worst < (large ? Math.min(need, 3) : need)) bad.contrast.push(`${c.sel} "${c.text}" ${worst.toFixed(1)}:1 need ${large ? 3 : need} (${c.fs}px)`);
  }
  await page.screenshot({ path: path.join(OUT, `${TAG}-${v.w}x${v.h}-${label}.png`) });
  res[label] = { targets: d.targets.length, small: bad.small.length, gap: bad.gap.length, tiny: bad.tiny.length, noName: bad.noName.length, contrast: bad.contrast.length, texts: textual.length, detail: bad };
  console.log(`${v.w}x${v.h} ${label}: targets ${d.targets.length} small ${bad.small.length} gaps ${bad.gap.length} tinyText ${bad.tiny.length} noName ${bad.noName.length} lowContrast ${bad.contrast.length}`);
}

async function scenarios(browser, v, res) {
  const tag = async (page, label) => { try { await measure(page, v, label, res); } catch (e) { console.log('measure failed', label, e.message); } };
  // picker
  let page = await newPage(browser, v);
  await join(page);
  await page.waitForTimeout(600);
  await tag(page, 'picker');
  await create(page, 'Tabbe', 'krigare');
  await tag(page, 'lobby');
  const press = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(500); };
  const shut = async () => { for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); } };
  for (const [label, key] of [['bag', 'i'], ['journal', 'j'], ['gear', 'g'], ['help', 'h'], ['emotes', 'f']]) {
    await press(key);
    if (await page.$('.modal')) await tag(page, label); else console.log('no window for key', key);
    await shut();
  }
  // the settings window, when there is one
  await page.evaluate(() => document.dispatchEvent(new Event('vt:settings')));
  await page.waitForTimeout(400);
  if (await page.$('.settings-panel')) await tag(page, 'settings'); else console.log('no settings window');
  await shut();
  // the class window
  await page.evaluate(() => window.varldstradet.bus.emit('open', { ui: 'sagaClass' }));
  await page.waitForTimeout(500);
  if (await page.$('.modal')) await tag(page, 'class');
  await shut();
  // pets: the HUD's pet buttons, the kennel (and "Klä djuret"), the wardrobe's pet tab
  await page.send({ t: 'dev', a: 'pet', id: 'hund' });
  await page.send({ t: 'dev', a: 'petgear', tier: 3 });
  await page.waitForTimeout(1200);
  await tag(page, 'lobby-pet');
  await page.evaluate(() => window.varldstradet.bus.emit('open', { ui: 'kennel' }));
  await page.waitForTimeout(500);
  if (await page.$('.modal')) await tag(page, 'kennel'); else console.log('no kennel window');
  await page.evaluate(() => [...document.querySelectorAll('.modal button.gold')].find((b) => /Klä|grejer/.test(b.textContent))?.click());
  await page.waitForTimeout(700);
  if (await page.$('.modal')) await tag(page, 'pet-wardrobe'); else console.log('no pet wardrobe');
  await shut();
  // the arch window and a run
  await walkTo(page, 26, 13);
  await page.send({ t: 'act', tx: 26, ty: 12 });
  await page.waitForTimeout(900);
  if (await page.$('.run-panel')) {
    await tag(page, 'arch');
    await page.evaluate(() => document.querySelector('.run-panel .tile.level')?.click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('.run-panel button.go')?.click());
    await page.waitForTimeout(3500);
    await tag(page, 'run-offer');
    await page.evaluate(() => document.querySelector('.run-panel .runa-card')?.click());
    await page.waitForTimeout(800);
    await tag(page, 'run-hud');
    // the windows of the roguelike's depth, reached with the dev jump (DEV_TELEPORT): cards, the Köpman, a Händelse, a Vilosten, the path pick, the loot
    const jump = async (label, msg, wait = 3500, after) => { await page.send(msg); await page.waitForTimeout(wait); if (after) await after(); await tag(page, label); };
    await jump('run-cards', { t: 'dev', a: 'runclear' }, 7000);
    await jump('run-shop', { t: 'dev', a: 'runnext', kind: 'shop', purse: 60 }, 7000);
    await jump('run-shop-wares', { t: 'dev', a: 'runnext', kind: 'shop', purse: 60 }, 200, async () => { await page.evaluate(() => [...document.querySelectorAll('.shop-tabs button')][1]?.click()); await page.waitForTimeout(300); });
    await jump('run-event', { t: 'dev', a: 'runnext', kind: 'event', purse: 20 });
    await jump('run-rest', { t: 'dev', a: 'runnext', kind: 'rest' });
    await page.send({ t: 'dev', a: 'runnext', kind: 'mini' });
    await page.waitForTimeout(1500);
    await jump('run-path', { t: 'dev', a: 'runclear' }, 7000);
    await page.send({ t: 'dev', a: 'runnext', kind: 'boss' });
    await page.waitForTimeout(2500);
    await jump('run-loot', { t: 'dev', a: 'runclear' }, 7000);
  } else console.log('no arch window');
  await page.context().close();
  // a fight
  page = await newPage(browser, v);
  await join(page);
  await create(page, 'Fajtare', 'magiker');
  await page.send({ t: 'dev', a: 'pet', id: 'hund' });
  await page.send({ t: 'dev', a: 'saga', id: 'draug' });
  await page.waitForTimeout(3500);
  await tag(page, 'fight');
  await page.context().close();
}

(async () => {
  const browser = await chromium.launch();
  const all = {};
  for (const v of VIEWPORTS) {
    const res = {};
    try { await scenarios(browser, v, res); } catch (e) { console.log('scenario failed', v, e.message); }
    all[`${v.w}x${v.h}`] = res;
  }
  const sum = { small: 0, gap: 0, tiny: 0, noName: 0, contrast: 0 };
  for (const vp of Object.values(all)) for (const r of Object.values(vp)) for (const k of Object.keys(sum)) sum[k] += r[k];
  console.log('TOTAL', JSON.stringify(sum));
  fs.writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify({ sum, all }, null, 1));
  await browser.close();
})();
