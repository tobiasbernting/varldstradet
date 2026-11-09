// Minimal DOM helpers.

type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'disabled' || k === 'checked') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export const clear = (el: HTMLElement): void => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

export const icon = (url: string, alt = ''): HTMLImageElement => h('img', { src: url, alt, draggable: 'false' });

/** When the last tap was handled on pointerup, anywhere: the click a touch makes after it must not reach whatever the tap opened under the finger. */
let lastTapAt = -1e9;

/** Fire on tap/click without the 300ms delay and without double firing (also not on a window's button that opened where the finger was). */
export function onTap(el: HTMLElement, fn: (ev: Event) => void): void {
  el.addEventListener('pointerup', (ev) => {
    if (ev.button !== 0) return;
    lastTapAt = performance.now();
    fn(ev);
  });
  el.addEventListener('click', (ev) => {
    if (performance.now() - lastTapAt < 500) return;
    fn(ev);
  });
}
