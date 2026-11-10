// "Inställningar": text size, strong contrast, effects, calm screen, shaking, colour-blind-safe warnings, how long to hold to read,
// left-handed buttons and reading aloud. Opened from the HUD's ⚙️, the help window and the character picker (event 'vt:settings').
// Every change is applied at once and saved on the device (a11y.ts, fxprefs.ts). A window like the others: a dialog, Escape and the
// gamepad's B close it, the focus comes back to what opened it.
import { A11Y_T } from '@varldstradet/shared';
import { HOLD_CHOICES, prefs, setPref, textCapped, type Prefs, type TextSize } from '../a11y.ts';
import { FX_SETTINGS, fxSetting, setFxSetting, type FxSetting } from '../fxprefs.ts';
import { clear, h, onTap } from './dom.ts';
import { canSpeak, speak } from './speech.ts';

export class SettingsUi {
  onChange: (open: boolean) => void = () => {};
  private modal: HTMLElement | null = null;
  private opener: HTMLElement | null = null;

  constructor(private ui: HTMLElement) {
    document.addEventListener('vt:settings', () => (this.modal ? this.close() : this.open()));
    document.addEventListener('vt:voices', () => this.modal && this.render());
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.modal || e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        this.close();
      },
      true,
    );
  }

  isOpen(): boolean {
    return this.modal !== null;
  }

  open(): void {
    if (this.modal) return;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.modal = h('div', { class: 'modal settings-modal' });
    this.modal.style.zIndex = '90';
    this.ui.append(this.modal);
    this.render();
    this.onChange(true);
  }

  close(): void {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    this.onChange(false);
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.opener = null;
  }

  private render(): void {
    if (!this.modal) return;
    const keep = (document.activeElement as HTMLElement | null)?.dataset?.key;
    clear(this.modal);
    const closeBtn = h('button', { class: 'close', type: 'button', 'aria-label': A11Y_T.close }, '✕');
    onTap(closeBtn, () => this.close());
    const body = h('div', { class: 'body' });
    const panel = h('div', { class: 'panel settings-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'settings-title' }, h('h2', { id: 'settings-title' }, `⚙️ ${A11Y_T.settings}`, h('span', { class: 'spacer' }), closeBtn), body);
    const p = prefs();
    const choice = <V extends string | number>(key: string, label: string, text: string, options: [V, string][], value: V, set: (v: V) => void): void => {
      const group = h('div', { class: 'choices', role: 'group', 'aria-label': label });
      for (const [v, name] of options) {
        const b = h('button', { type: 'button', 'data-key': `${key}-${v}`, 'aria-pressed': String(v === value) }, v === value ? `✔ ${name}` : name);
        onTap(b, () => {
          set(v);
          this.render();
        });
        group.append(b);
      }
      body.append(h('div', { class: 'row' }, h('div', { class: 'lbl' }, label, text ? h('span', null, text) : null), group));
    };
    const toggle = (key: keyof Prefs, label: string, text: string, disabled = false): void => {
      const on = !!p[key];
      const b = h('button', { type: 'button', 'data-key': `t-${key}`, 'aria-pressed': String(on), disabled }, on ? `✔ ${A11Y_T.on}` : A11Y_T.off);
      onTap(b, () => {
        setPref(key, !on as Prefs[typeof key]);
        this.render();
      });
      body.append(h('div', { class: 'row' }, h('div', { class: 'lbl' }, label, text ? h('span', null, text) : null), h('div', { class: 'choices' }, b)));
    };

    body.append(h('p', { class: 'note' }, A11Y_T.settingsInfo));
    body.append(h('h3', null, A11Y_T.secText));
    choice<TextSize>('text', A11Y_T.textSize, '', [['normal', A11Y_T.textNormal], ['large', A11Y_T.textLarge], ['xlarge', A11Y_T.textXlarge]], p.text, (v) => setPref('text', v));
    if (textCapped()) body.append(h('p', { class: 'note' }, A11Y_T.textCapped));
    toggle('contrast', A11Y_T.contrast, A11Y_T.contrastText);
    body.append(h('h3', null, A11Y_T.secMotion));
    choice<FxSetting>('fx', A11Y_T.fx, A11Y_T.fxText, FX_SETTINGS.map((v) => [v, v === 'full' ? A11Y_T.fxFull : v === 'reduced' ? A11Y_T.fxReduced : A11Y_T.fxOff] as [FxSetting, string]), fxSetting(), (v) => setFxSetting(v));
    toggle('calm', A11Y_T.calm, A11Y_T.calmText);
    toggle('shake', A11Y_T.shake, A11Y_T.shakeText);
    body.append(h('h3', null, A11Y_T.secColour));
    toggle('cb', A11Y_T.cb, A11Y_T.cbText);
    body.append(h('h3', null, A11Y_T.secButtons));
    choice<number>('hold', A11Y_T.hold, A11Y_T.holdText, [[HOLD_CHOICES[0], A11Y_T.holdShort], [HOLD_CHOICES[1], A11Y_T.holdMid], [HOLD_CHOICES[2], A11Y_T.holdLong]], HOLD_CHOICES.includes(p.hold as 300) ? p.hold : 450, (v) => setPref('hold', v));
    toggle('left', A11Y_T.left, A11Y_T.leftText);
    body.append(h('h3', null, A11Y_T.secRead));
    const can = canSpeak();
    toggle('read', A11Y_T.read, can ? A11Y_T.readText : A11Y_T.readNone, !can);
    if (can) {
      const test = h('button', { type: 'button', 'data-key': 'test' }, `🔊 ${A11Y_T.readAloud}`);
      onTap(test, () => speak(A11Y_T.readText));
      body.append(h('div', { class: 'row' }, h('div', { class: 'lbl' }, A11Y_T.readAloud), h('div', { class: 'choices' }, test)));
    }
    this.modal.append(panel);
    const again = keep ? this.modal.querySelector<HTMLElement>(`[data-key="${keep}"]`) : null;
    (again ?? panel).focus({ preventScroll: true });
  }
}
