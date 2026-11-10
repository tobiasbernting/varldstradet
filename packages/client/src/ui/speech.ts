// Reading aloud in Swedish through the browser's speech (speechSynthesis). It does nothing, and the speaker buttons stay hidden,
// when the device has no Swedish voice. Whether the words really come out can only be tried on a real device.
let voices: SpeechSynthesisVoice[] = [];
let wired = false;

function load(): void {
  try {
    voices = window.speechSynthesis?.getVoices?.() ?? [];
  } catch {
    voices = [];
  }
}

function wire(): void {
  if (wired) return;
  wired = true;
  load();
  try {
    window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
      load();
      document.dispatchEvent(new CustomEvent('lilla:voices'));
    });
  } catch {
    /* no speech */
  }
}

const swedish = (): SpeechSynthesisVoice | undefined => voices.find((v) => /^sv([-_]|$)/i.test(v.lang));

/** Is there a Swedish voice to read with? */
export function canSpeak(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return false;
  wire();
  return !!swedish();
}

/** Reads the text out loud (and stops whatever was being read). Quiet when there is no Swedish voice. */
export function speak(text: string): void {
  if (!canSpeak()) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'sv-SE';
    const v = swedish();
    try {
      if (v) u.voice = v;
    } catch {
      /* the language alone will do */
    }
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* no speech */
  }
}
