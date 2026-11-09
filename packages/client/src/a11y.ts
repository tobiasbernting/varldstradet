// What a player chose for how the game looks and sounds to them ("Inställningar"): text size, high contrast, calm screen, no
// shaking, colour-blind-safe telegraphs, how long a press must be held to explain, left-handed buttons, reading aloud. Kept on
// the device (a tablet may want other things than a computer), applied at once to the page as classes and CSS variables, and
// announced with a 'lilla:prefs' event for the parts that draw by themselves (the world's telegraphs and the camera).
// The effects setting (sparks, smoke) lives in fxprefs.ts and is shown in the same window.
export type TextSize = 'normal' | 'large' | 'xlarge';
export type Device = 'touch' | 'mouse' | 'key' | 'pad';
export interface Prefs {
  text: TextSize;
  contrast: boolean;
  /** Calm screen: no loops, no flashes. Starts as the system's reduced-motion choice. */
  calm: boolean;
  shake: boolean;
  /** Telegraphs in colours a colour-blind player can tell apart. */
  cb: boolean;
  /** Milliseconds a finger must stay down on a thing to show what it is. */
  hold: number;
  left: boolean;
  /** Read the info cards out loud when they come up. */
  read: boolean;
}
export const TEXT_SCALE: Record<TextSize, number> = { normal: 1, large: 1.25, xlarge: 1.5 };
export const HOLD_CHOICES = [300, 450, 700] as const;
const KEY = 'varldstradet.a11y';

const systemCalm = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const defaults = (): Prefs => ({ text: 'normal', contrast: false, calm: systemCalm(), shake: true, cb: false, hold: 450, left: false, read: false });

let cur: Prefs | null = null;

function load(): Prefs {
  const p = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Prefs>;
      if (o.text === 'normal' || o.text === 'large' || o.text === 'xlarge') p.text = o.text;
      for (const k of ['contrast', 'calm', 'shake', 'cb', 'left', 'read'] as const) if (typeof o[k] === 'boolean') p[k] = o[k]!;
      if (typeof o.hold === 'number' && o.hold >= 200 && o.hold <= 1500) p.hold = o.hold;
    }
  } catch {
    /* no storage, or a broken value: the defaults */
  }
  return p;
}

export function prefs(): Prefs {
  return (cur ??= load());
}

/** Puts the settings on the page: classes on <html> and the text scale as a CSS variable. */
export function applyPrefs(): void {
  const p = prefs();
  const root = document.documentElement;
  root.style.setProperty('--txt', String(TEXT_SCALE[p.text]));
  root.classList.toggle('a11y-contrast', p.contrast);
  root.classList.toggle('a11y-calm', p.calm);
  root.classList.toggle('a11y-cb', p.cb);
  root.classList.toggle('a11y-left', p.left);
  root.classList.toggle('a11y-big', p.text !== 'normal');
}

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void {
  const p = prefs();
  p[k] = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* no storage */
  }
  applyPrefs();
  document.dispatchEvent(new CustomEvent('lilla:prefs'));
}

/** Calm screen on (the player's choice, or the system's): the world and the HUD stop their loops and flashes. */
export const calm = (): boolean => prefs().calm;

// ---- which device the player is using right now (the spell buttons show its key or button) ----
let device: Device = (() => {
  try {
    return matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
  } catch {
    return 'mouse';
  }
})();
export const currentDevice = (): Device => device;
export function setDevice(d: Device): void {
  if (d === device) return;
  device = d;
  for (const k of ['touch', 'mouse', 'key', 'pad'] as const) document.body.classList.toggle(`dev-${k}`, k === d);
  document.dispatchEvent(new CustomEvent('lilla:device'));
}

let started = false;
/** Reads the saved settings onto the page and watches which device is used. Call once at start. */
export function initA11y(): void {
  if (started) return;
  started = true;
  applyPrefs();
  document.body.classList.add(`dev-${device}`);
  window.addEventListener('pointerdown', (e) => setDevice(e.pointerType === 'mouse' ? 'mouse' : 'touch'), { capture: true });
  window.addEventListener('keydown', () => setDevice('key'), { capture: true });
  // the system's choice follows along while the player has not chosen
  try {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
      let saved = false;
      try {
        saved = localStorage.getItem(KEY) !== null;
      } catch {
        /* none */
      }
      if (!saved) {
        prefs().calm = systemCalm();
        applyPrefs();
        document.dispatchEvent(new CustomEvent('lilla:prefs'));
      }
    });
  } catch {
    /* no matchMedia */
  }
}
