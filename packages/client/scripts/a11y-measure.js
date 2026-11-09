// Injected into the page by a11y-audit.cjs: measures every visible interactive element (size, gaps), the computed font size
// of every visible text node and the contrast of its text against whatever is behind it (DOM backing, else a screenshot sample).
(function () {
  const INTERACTIVE = 'button, [role=button], [role=tab], [role=checkbox], [role=switch], [tabindex]:not([tabindex="-1"]), a[href], input, select, textarea, .saga-spell, .slot, .round, .chip.level, button.chip, .swatch, .card';
  // is something else (a window's dimming, a panel) on top of the element's middle?
  const covered = (el, r) => {
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    return !!top && top !== el && !el.contains(top) && !top.contains(el);
  };
  const vis = (el) => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      // scrolled or cut off by a parent that hides what overflows
      if (e !== el && /(auto|scroll|hidden|clip)/.test(cs.overflowY + cs.overflowX)) {
        const pr = e.getBoundingClientRect();
        const cut = Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top);
        if (cut < Math.min(r.height, 24) * 0.6 || Math.min(r.right, pr.right) - Math.max(r.left, pr.left) < Math.min(r.width, 24) * 0.6) return false;
      }
      if (cs.pointerEvents === 'none' && e === el) return false;
      if (cs.clip && cs.clip !== 'auto' && cs.position === 'absolute' && r.width <= 1) return false;
    }
    return true;
  };
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    }
    const c = s.match(/color\(srgb ([^)]+)\)/);
    if (c) {
      const p = c[1].split(/[ /]+/).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] === undefined ? 1 : p[3] };
    }
    return { r: 0, g: 0, b: 0, a: 0 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, bot) => { const a = top.a + bot.a * (1 - top.a); if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }; return { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a }; };
  // the backing: the layers from the text's element up, composited; alpha tells how solid it is
  const backing = (el) => {
    let acc = { r: 0, g: 0, b: 0, a: 0 };
    let gradient = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) gradient = true;
      if (c.a > 0) acc = over(acc, c);
      if (acc.a >= 0.995) break;
    }
    return { color: acc, gradient };
  };
  const textColor = (el) => parse(getComputedStyle(el).color);
  window.__a11y = function (opts) {
    const touch = !!opts.touch;
    const out = { targets: [], gaps: [], fonts: [], contrast: [], noName: [] };
    const els = [...document.querySelectorAll(INTERACTIVE)].filter((e) => vis(e) && !covered(e, e.getBoundingClientRect()));
    // keep the outermost interactive elements out of nested duplicates: an element inside another interactive one is not a target of its own
    const set = new Set(els);
    const outer = els.filter((e) => { for (let p = e.parentElement; p; p = p.parentElement) if (set.has(p) && !(p.matches('.card, .slot') && !e.matches('button'))) return false; return true; });
    const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('data-info-name') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const sel = (e) => (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''));
    for (const e of outer) {
      const r = e.getBoundingClientRect();
      out.targets.push({ sel: sel(e), name: name(e), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) });
      const accessible = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.textContent || '').trim() || e.getAttribute('title') || e.getAttribute('alt') || e.querySelector('img[alt]:not([alt=""])');
      if (!accessible && !(e instanceof HTMLInputElement && e.labels && e.labels.length)) out.noName.push({ sel: sel(e), x: Math.round(r.left), y: Math.round(r.top) });
    }
    // gaps between neighbours that do not nest
    for (let i = 0; i < outer.length; i++) for (let j = i + 1; j < outer.length; j++) {
      const a = outer[i].getBoundingClientRect(), b = outer[j].getBoundingClientRect();
      if (outer[i].contains(outer[j]) || outer[j].contains(outer[i])) continue;
      const dx = Math.max(b.left - a.right, a.left - b.right), dy = Math.max(b.top - a.bottom, a.top - b.bottom);
      const gap = Math.max(dx, dy);
      if (gap < 8 && !(dx < 0 && dy < 0)) out.gaps.push({ a: sel(outer[i]) + ' ' + name(outer[i]), b: sel(outer[j]) + ' ' + name(outer[j]), gap: Math.round(gap) });
      else if (dx < 0 && dy < 0) out.gaps.push({ a: sel(outer[i]) + ' ' + name(outer[i]), b: sel(outer[j]) + ' ' + name(outer[j]), gap: -1 });
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue.trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || el.closest('script, style, canvas, svg, noscript')) continue;
      if (!vis(el)) continue;
      // the words only: a leading picture (an emoji keeps its own colours) is left out of the box that is sampled
      const raw = n.nodeValue;
      const lead = raw.match(/^[\s\p{Extended_Pictographic}\p{Emoji_Presentation}️‍]+/u);
      const rg = document.createRange(); rg.setStart(n, lead ? lead[0].length : 0); rg.setEnd(n, raw.length);
      const rr = rg.getBoundingClientRect();
      if (rr.width < 2 || rr.height < 2) continue;
      if (covered(el, rr)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      const bk = backing(el);
      const fg = textColor(el);
      const isImg = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\s️‍\d⭐]+$/u.test(t);
      out.fonts.push({ sel: sel(el), text: t.slice(0, 24), fs: Math.round(fs * 10) / 10, emoji: isImg });
      out.contrast.push({ sel: sel(el), text: t.slice(0, 24), fg, bg: bk.color, solid: bk.color.a, gradient: bk.gradient, fs, bold: parseInt(cs.fontWeight) >= 700, rect: { x: rr.left, y: rr.top, w: rr.width, h: rr.height }, shadow: cs.textShadow !== 'none' });
    }
    return out;
  };
  window.__a11yRatio = ratio;
})();
