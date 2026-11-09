// "Effekter": how much the looks' sparks, smoke and glints may move (full / reduced / off). Kept on the device, not in the
// save: a tablet may want fewer than a computer. Reduced motion in the system settings turns "full" into "reduced".
export type FxSetting = 'full' | 'reduced' | 'off';
export const FX_SETTINGS: readonly FxSetting[] = ['full', 'reduced', 'off'];
const KEY = 'varldstradet.fx';
let cached: FxSetting | null = null;

/** What the player chose (full if nothing is saved, or the storage is not there). */
export function fxSetting(): FxSetting {
  if (cached) return cached;
  let v: string | null = null;
  try {
    v = localStorage.getItem(KEY);
  } catch {
    /* no storage */
  }
  cached = v === 'reduced' || v === 'off' || v === 'full' ? v : 'full';
  return cached;
}

export function setFxSetting(v: FxSetting): void {
  cached = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* no storage */
  }
  document.dispatchEvent(new CustomEvent('lilla:fx'));
}

/** What is drawn: the setting, with "full" cut to "reduced" when the system asks for reduced motion. */
export function effectiveFx(): FxSetting {
  const s = fxSetting();
  if (s === 'full') {
    try {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced';
    } catch {
      /* no matchMedia */
    }
  }
  return s;
}
