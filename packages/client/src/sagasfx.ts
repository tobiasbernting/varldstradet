// Sounds for Sagan om Världsträdet's dungeons, made in code like the game's other sounds: every spell, monsters'
// swipes and arrows, a boss winding up a big attack and landing it, a boss's shout, falling and getting up, and
// the fanfare of a treasure chest. Kept short and friendly: the players are small.
import { ensure, noise, tone } from './sound.ts';
import { PIP_NOTES } from './fight.ts';

/** Noise through a filter that sweeps from one pitch to another (whooshes, wind, fire). */
function sweep(dur: number, from: number, to: number, vol = 0.05, type: BiquadFilterType = 'bandpass', q = 1.2): void {
  const c = ensure();
  if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + Math.min(0.05, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

/** A tone that swells slowly instead of starting at once (a boss gathering power). */
function swell(freq: number, dur: number, to: number, vol = 0.05, type: OscillatorType = 'sine'): void {
  const c = ensure();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
  g.gain.setValueAtTime(0.001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

const later = (ms: number, fn: () => void): void => void setTimeout(fn, ms);
const notes = (freqs: number[], step: number, dur: number, type: OscillatorType = 'triangle', vol = 0.05): void =>
  freqs.forEach((f, i) => later(i * step, () => tone(f, dur, type, vol)));

const slash = (pitch = 1): void => {
  sweep(0.12, 2500 * pitch, 700 * pitch, 0.07, 'highpass', 0.7);
  tone(260 * pitch, 0.08, 'square', 0.035, -120);
};
const thud = (): void => {
  tone(110, 0.14, 'square', 0.06, -50);
  noise(0.06, 0.06);
};
const boom = (big = 1): void => {
  noise(0.25 + big * 0.15, 0.07 + big * 0.04);
  tone(80, 0.3 + big * 0.1, 'triangle', 0.08, -40);
};

/** One sound per spell id the server sends (the classes' spells, the potion, monsters' and bosses' attacks). */
const SPELL_SOUNDS: Record<string, () => void> = {
  hugg: () => slash(1),
  utmana: () => {
    tone(220, 0.28, 'sawtooth', 0.045, 110);
    later(90, () => tone(330, 0.3, 'sawtooth', 0.035, 60));
  },
  skoldslag: () => {
    thud();
    later(40, () => tone(1250, 0.12, 'triangle', 0.04, -300));
  },
  skoldmur: () => {
    tone(196, 0.5, 'triangle', 0.06, 98);
    later(60, () => tone(392, 0.4, 'sine', 0.04));
  },
  lakerunan: () => notes([660, 880, 1100], 60, 0.18, 'sine', 0.045),
  ljuspil: () => tone(1100, 0.16, 'triangle', 0.045, 900),
  lakekrets: () => notes([523, 659, 784, 1047, 1319], 70, 0.22, 'sine', 0.04),
  vackupp: () => notes([392, 523, 659, 784, 1047], 90, 0.3, 'triangle', 0.05),
  yxhugg: () => {
    slash(0.7);
    later(50, thud);
  },
  stormsteg: () => {
    sweep(0.3, 400, 2400, 0.07);
    later(220, thud);
  },
  virvelvind: () => {
    for (let i = 0; i < 3; i++) later(i * 110, () => sweep(0.16, 900 + i * 400, 2600 + i * 300, 0.06));
  },
  raseri: () => {
    tone(110, 0.5, 'sawtooth', 0.055, -30);
    tone(165, 0.45, 'square', 0.03, -40);
    sweep(0.4, 300, 1200, 0.04, 'lowpass');
  },
  eldboll: () => {
    sweep(0.3, 300, 1500, 0.06, 'lowpass', 0.6);
    later(260, () => boom(0.3));
  },
  isspjut: () => {
    tone(2100, 0.12, 'triangle', 0.04, -900);
    later(140, () => notes([2637, 3136], 40, 0.1, 'sine', 0.03));
  },
  askregn: () => {
    noise(0.35, 0.09);
    tone(60, 0.5, 'square', 0.05, -20);
    for (let i = 0; i < 3; i++) later(80 + i * 90, () => sweep(0.08, 4000, 1500, 0.06, 'highpass'));
  },
  blink: () => {
    tone(600, 0.16, 'sine', 0.05, 1400);
    later(90, () => tone(1800, 0.14, 'triangle', 0.035, 600));
  },
  potion: () => {
    tone(320, 0.08, 'sine', 0.06, 200);
    later(110, () => tone(360, 0.08, 'sine', 0.06, 240));
    later(240, () => notes([784, 1047], 60, 0.12, 'sine', 0.035));
  },
  // the pets (pets.ts): small and friendly
  pet_bite: () => {
    sweep(0.06, 2400, 900, 0.04, 'highpass');
    tone(520, 0.05, 'square', 0.025, -200);
  },
  pet_pounce: () => {
    sweep(0.12, 1500, 400, 0.05, 'highpass');
    thud();
  },
  pet_purr: () => notes([659, 784, 988], 55, 0.1, 'sine', 0.03),
  pet_roar: () => {
    tone(130, 0.3, 'sawtooth', 0.05, -40);
    sweep(0.3, 500, 180, 0.035, 'bandpass', 2);
  },
  pet_howl: () => {
    tone(440, 0.5, 'sine', 0.05, 330);
    later(250, () => tone(660, 0.5, 'sine', 0.04, -200));
  },
  pet_mark: () => notes([1319, 1760], 60, 0.1, 'triangle', 0.03),
  pet_ram: () => {
    thud();
    later(50, () => notes([392, 523], 60, 0.1, 'square', 0.03));
  },
  pet_dig: () => sweep(0.12, 900, 400, 0.025, 'lowpass'),
  claw: () => {
    sweep(0.08, 1800, 600, 0.05, 'highpass');
    tone(180, 0.06, 'square', 0.03, -80);
  },
  mob_draugbage: () => tone(900, 0.08, 'sine', 0.04, 500),
  mob_isande: () => tone(1500, 0.18, 'sine', 0.04, -700),
  charge_land: () => {
    boom(0.6);
    sweep(0.3, 2000, 300, 0.05, 'lowpass');
  },
};

/** A boss gathering power before a big attack: a rising hum as long as the warning on the ground. */
export function bossWindup(move: string, ms: number): void {
  const dur = Math.max(0.4, Math.min(3, ms / 1000));
  if (move === 'line') {
    // steam (or a tail) building up: a hiss that gets louder and higher
    sweep(dur, 300, 2600, 0.045, 'highpass', 0.8);
    swell(90, dur, 180, 0.04, 'sawtooth');
    return;
  }
  if (move === 'pull') {
    // a whirlpool: a low hum and wind turning round and round
    swell(60, dur, 120, 0.05, 'triangle');
    for (let i = 0; i < 3; i++) later((i * dur * 1000) / 3, () => sweep(dur / 3, 1800, 300, 0.04, 'bandpass', 2));
    return;
  }
  if (move === 'mend') {
    // falling asleep on the gold: a soft lullaby, slowly
    notes([392, 330, 294, 262], (dur * 1000) / 5, 0.5, 'sine', 0.035);
    swell(196, dur, 262, 0.02, 'sine');
    return;
  }
  if (move === 'summon') {
    // a howl calling for help
    swell(220, dur * 0.7, 440, 0.045, 'sawtooth');
    later(dur * 700, () => tone(440, 0.4, 'triangle', 0.035, -180));
    return;
  }
  const base = move === 'nova' ? 70 : move === 'freeze' || move === 'rain' ? 220 : move === 'pools' ? 90 : 110;
  swell(base, dur, base * 2.2, 0.05, 'triangle');
  swell(base * 1.5, dur, base * 3, 0.025, 'sine');
}

/** A boss's big attack lands. */
export function bossLand(move: string): void {
  if (move === 'freeze' || move === 'rain') {
    notes([1760, 1319, 2093], 30, 0.12, 'triangle', 0.04);
    noise(0.15, 0.05);
  } else if (move === 'pools') {
    sweep(0.5, 200, 900, 0.07, 'lowpass', 0.7);
    boom(0.3);
  } else if (move === 'cleave') {
    slash(0.5);
    boom(0.5);
  } else if (move === 'line') {
    sweep(0.45, 3000, 400, 0.08, 'bandpass', 0.8);
    boom(0.6);
  } else if (move === 'pull') {
    // sucked in: a whoosh that falls, and a thump
    sweep(0.35, 2500, 200, 0.07, 'lowpass', 0.7);
    later(280, thud);
  } else if (move === 'mend') notes([523, 659, 784], 70, 0.3, 'sine', 0.04);
  else if (move === 'summon') {
    noise(0.2, 0.06);
    later(80, () => tone(660, 0.12, 'triangle', 0.035, 300));
  } else boom(move === 'nova' ? 1.4 : 1);
}

/** The heroes' auto-attacks, swung about once a second: the same voices as the spells, much quieter and shorter. */
const AUTO_SOUNDS: Record<string, (v: number) => void> = {
  hugg: (v) => sweep(0.08, 2400, 900, 0.03 * v, 'highpass', 0.7),
  yxhugg: (v) => {
    sweep(0.09, 1700, 600, 0.03 * v, 'highpass', 0.7);
    tone(120, 0.06, 'square', 0.018 * v, -40);
  },
  eldboll: (v) => sweep(0.16, 400, 1300, 0.026 * v, 'lowpass', 0.6),
  ljuspil: (v) => tone(1100, 0.09, 'triangle', 0.02 * v, 700),
};

/** The four spenders, heavier with every pip (1..3): Jättehugg, Runsmäll, Dunderslag, Solstråle. */
function spendSound(id: string, pips: number): void {
  const k = Math.max(1, Math.min(3, pips));
  const big = (k - 1) / 2; // 0, 0.5, 1
  if (id === 'jattehugg') {
    slash(0.62 - big * 0.12);
    later(40, () => boom(0.2 + big * 0.9));
    if (k === 3) later(70, () => sweep(0.3, 2600, 500, 0.06, 'highpass', 0.8));
  } else if (id === 'runsmall') {
    sweep(0.18, 500, 2200 + big * 900, 0.05, 'bandpass', 2);
    later(120, () => {
      boom(0.2 + big * 0.9);
      notes([988, 1319, 1976].slice(0, k), 35, 0.12, 'triangle', 0.035);
    });
  } else if (id === 'dunderslag') {
    thud();
    later(30, () => boom(0.3 + big * 0.9));
    if (k >= 2) later(60, () => tone(1250 - big * 300, 0.16, 'triangle', 0.04, -400));
    if (k === 3) later(150, () => tone(196, 0.45, 'triangle', 0.05, 98));
  } else if (id === 'solstrale') {
    notes([784, 988, 1175, 1568].slice(0, k + 1), 55, 0.22 + big * 0.2, 'sine', 0.04);
    if (k === 3) later(160, () => tone(392, 0.6, 'sine', 0.035));
  }
}

export const SAGA_SFX = {
  /** A spell or an attack, by the server's spell id (unknown ones are quiet). */
  spell(id: string): void {
    if (id.startsWith('land_')) bossLand(id.slice(5));
    else if (!id.startsWith('cast_')) SPELL_SOUNDS[id]?.();
  },
  /** An auto-attack (about one a second for every hero): quiet, and quieter still for a friend's. True if it was one. */
  auto(id: string, mine: boolean): boolean {
    const f = AUTO_SOUNDS[id];
    f?.(mine ? 1 : 0.5);
    return !!f;
  },
  /** A spender going off with this many pips. */
  spend: spendSound,
  /** A pip fills: a pop and a note, one step higher for each (0, 1, 2). */
  pip: (i: number) => {
    const f = PIP_NOTES[Math.max(0, Math.min(PIP_NOTES.length - 1, i))]!;
    tone(f, 0.11, 'triangle', 0.05);
    tone(f * 2, 0.05, 'sine', 0.02);
    // the last one rings: the row is full
    if (i >= PIP_NOTES.length - 1) later(70, () => tone(f * 1.5, 0.3, 'sine', 0.03));
  },
  /** A combo: the spender landed at the right moment. One bright chord. */
  combo: () => {
    for (const f of [523, 659, 784, 1047]) tone(f, 0.38, 'triangle', 0.028);
    later(90, () => tone(1568, 0.3, 'sine', 0.025));
  },
  /** A hit from a ground mark: a heavy, low thud that nothing else makes (quieter when it is a friend). */
  mark: (mine: boolean) => {
    const v = mine ? 1 : 0.45;
    tone(70, 0.34, 'sine', 0.11 * v, -28);
    tone(104, 0.2, 'square', 0.045 * v, -50);
    noise(0.12, 0.08 * v);
  },
  /** A cast was stopped: a sharp crack, then a small chord of relief. */
  crack: () => {
    noise(0.05, 0.11);
    sweep(0.1, 5200, 900, 0.09, 'highpass', 0.6);
    tone(180, 0.1, 'square', 0.05, -90);
    later(70, () => notes([784, 1175], 70, 0.15, 'triangle', 0.045));
  },
  /** A Sköldbärare's dome breaks: glass cracking. */
  domeCrack: () => {
    notes([2349, 1865, 2794], 28, 0.07, 'triangle', 0.035);
    sweep(0.14, 6000, 1800, 0.06, 'highpass', 0.9);
    later(50, () => noise(0.08, 0.05));
  },
  /** A Skytt draws its bow: a creak that tightens. */
  creak: () => {
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(210, c.currentTime + 0.42);
    lfo.frequency.setValueAtTime(34, c.currentTime);
    lfo.frequency.linearRampToValueAtTime(58, c.currentTime + 0.42);
    lg.gain.value = 26;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.035, c.currentTime + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.45);
    o.connect(g).connect(c.destination);
    o.start();
    lfo.start();
    o.stop(c.currentTime + 0.46);
    lfo.stop(c.currentTime + 0.46);
  },
  /** A Besvärjare starts to heal a packmate: a small chant climbing as long as the cast. */
  chant: (ms: number) => notes([330, 392, 440, 523], Math.max(120, Math.min(900, ms / 4.5)), 0.32, 'sine', 0.028),
  /** Öppning: a shimmer that rises. */
  open: () => {
    notes([784, 988, 1175, 1568, 1976], 45, 0.2, 'sine', 0.035);
    sweep(0.4, 1500, 6500, 0.025, 'bandpass', 3);
  },
  /** "Now!": something that can be stopped is in reach of your interrupt. Two quick high ticks. */
  now: () => {
    tone(1760, 0.045, 'square', 0.03);
    later(70, () => tone(2349, 0.07, 'square', 0.03));
  },
  /** A boss throws something at a hero far away: a short whoosh that rises. */
  lob: () => {
    sweep(0.22, 500, 2200, 0.05, 'bandpass', 1.5);
    tone(180, 0.1, 'square', 0.03, 120);
  },
  /** A starred monster comes into view: a small bright chime. */
  starSeen: () => notes([1319, 1760, 2093], 60, 0.16, 'sine', 0.03),
  /** A starred monster falls: coins ringing, more for two stars. */
  coins: (stars: number) => {
    for (let i = 0; i < 3 + stars * 2; i++) later(i * 55, () => tone(1568 + (i % 3) * 262, 0.09, 'triangle', 0.03, 180));
  },
  /** Hornet: a horn call, two notes rising, then the power's own colour (low for the king's shout, bright for ice and light). */
  horn: (id: string) => {
    tone(196, 0.5, 'sawtooth', 0.05, 30);
    later(180, () => {
      tone(294, 0.8, 'sawtooth', 0.055, 20);
      tone(147, 0.8, 'triangle', 0.04);
    });
    later(420, () => {
      if (id === 'frost') notes([2093, 1760, 2637], 40, 0.2, 'triangle', 0.035);
      else if (id === 'surt') sweep(0.6, 300, 1600, 0.06, 'lowpass', 0.7);
      else if (id === 'hel' || id === 'dvarg') notes([523, 659, 784, 1047], 70, 0.4, 'sine', 0.04);
      else if (id === 'orm') sweep(0.7, 1800, 200, 0.07, 'lowpass', 0.6);
      else if (id === 'alv') swell(110, 0.9, 70, 0.04, 'sine');
      else if (id === 'fenrir') {
        tone(330, 0.7, 'sine', 0.05, 220);
        later(300, () => tone(550, 0.6, 'sine', 0.04, -200));
      } else if (id === 'loke') notes([784, 988, 1175, 1568, 1976], 45, 0.2, 'triangle', 0.035);
      else boom(1.2);
    });
  },
  /** A hit of the element the monster is weak to: a bright glassy sparkle. */
  weak: () => {
    notes([2349, 3136], 35, 0.09, 'sine', 0.03);
    sweep(0.1, 5000, 7000, 0.02, 'highpass', 2);
  },
  /** Perfekt block: a ringing clang. */
  parry: () => {
    noise(0.04, 0.09);
    tone(1865, 0.5, 'triangle', 0.05, -40);
    tone(2794, 0.4, 'sine', 0.03, -60);
    later(30, () => tone(932, 0.3, 'square', 0.02));
  },
  /** Nära ögat: a quick whoosh past. */
  near: (mine: boolean) => sweep(0.18, 700, 3600, mine ? 0.06 : 0.03, 'bandpass', 1.4),
  /** Skogen rör sig: a wave walks in: a low horn and three drum beats. */
  wave: () => {
    tone(147, 0.7, 'sawtooth', 0.05, 20);
    for (let i = 0; i < 3; i++) later(250 + i * 160, () => {
      tone(82, 0.14, 'triangle', 0.08, -30);
      noise(0.05, 0.05);
    });
  },
  /** Märke: the skull lands on a monster (a low knock and a rattle), or is taken away. */
  skull: (on: boolean) => {
    if (on) {
      tone(196, 0.09, 'square', 0.05, -60);
      later(70, () => notes([587, 494], 50, 0.07, 'triangle', 0.035));
    } else tone(392, 0.08, 'triangle', 0.03, -120);
  },
  /** Samslag: two heroes struck together. Two notes at once, a fifth apart, and a bang. */
  samslag: () => {
    tone(392, 0.45, 'triangle', 0.05);
    tone(587, 0.45, 'triangle', 0.045);
    later(40, () => boom(0.7));
    later(140, () => {
      tone(784, 0.4, 'sine', 0.03);
      tone(1175, 0.4, 'sine', 0.025);
    });
  },
  /** A Kraftklot lies on the floor: a soft hum that fades as its time runs out. */
  orbHum: (ms: number) => {
    const c = ensure();
    if (!c) return;
    const dur = Math.max(0.5, ms / 1000);
    for (const [f, v] of [
      [330, 0.016],
      [495, 0.01],
    ] as const) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(v, c.currentTime + 0.25);
      g.gain.linearRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    }
  },
  /** Someone took a Kraftklot (a friend: the three pip notes come from your own row when it is you). */
  orbTake: () => {
    sweep(0.2, 900, 4200, 0.04, 'bandpass', 3);
    tone(1319, 0.18, 'sine', 0.03);
  },
  /** Guldringen appears: a warm chime that says "come here" (nothing like the warning beeps of the red marks). */
  ringChime: () => {
    notes([523, 659, 784, 1047], 110, 0.6, 'sine', 0.045);
    later(60, () => tone(262, 0.9, 'triangle', 0.03));
  },
  /** The party stood in the ring: the boss's scream fizzles out, and a cheer. */
  ringWon: () => {
    sweep(0.5, 1800, 200, 0.05, 'lowpass', 0.8);
    tone(300, 0.4, 'sawtooth', 0.03, -200);
    later(260, () => notes([523, 659, 784, 1047, 1319], 70, 0.3, 'triangle', 0.045));
    later(700, () => noise(0.2, 0.04));
  },
  /** The ring was missed: the scream lands. */
  ringLost: () => {
    boom(1.2);
    tone(196, 0.5, 'sawtooth', 0.045, -90);
  },
  /** A Runmärke: bronze one note, silver two, gold a little fanfare. */
  medal: (m: number) => {
    if (m >= 3) {
      notes([523, 659, 784, 1047], 90, 0.3, 'triangle', 0.05);
      later(380, () => {
        tone(1319, 0.7, 'sine', 0.04);
        tone(1047, 0.7, 'triangle', 0.03);
      });
    } else if (m === 2) notes([659, 988], 120, 0.4, 'triangle', 0.045);
    else tone(440, 0.4, 'triangle', 0.045);
  },
  /** A monster beaten: a soft pop (heavier after a big blow). */
  kill: (big: boolean) => {
    noise(0.1, big ? 0.07 : 0.045);
    tone(big ? 150 : 220, 0.14, 'triangle', big ? 0.06 : 0.04, -90);
  },
  /** You were hit. */
  hurt: () => tone(300, 0.09, 'square', 0.045, -120),
  /** A monster you hit hard. */
  crit: () => {
    thud();
    later(30, () => tone(1600, 0.08, 'triangle', 0.035, -500));
  },
  /** Dazed or interrupted. */
  stun: () => notes([1568, 1319, 1568], 50, 0.07, 'triangle', 0.03),
  kick: () => {
    thud();
    later(60, () => notes([784, 1175], 70, 0.15, 'triangle', 0.05));
  },
  /** A boss shouts. */
  yell: () => {
    tone(150, 0.4, 'sawtooth', 0.05, -60);
    later(60, () => tone(98, 0.5, 'square', 0.035, -25));
    sweep(0.45, 500, 200, 0.04, 'bandpass', 2);
  },
  /** Big words across the screen: a dungeon's name, a new chapter. */
  banner: () => {
    tone(196, 1.2, 'sine', 0.06);
    tone(294, 1, 'sine', 0.035);
    later(120, () => tone(392, 0.8, 'triangle', 0.025));
  },
  /** A boss beaten, a dungeon cleared, a chapter's reward: a fanfare with fireworks popping. */
  fanfare: (big: boolean) => {
    notes([392, 523, 659, 784], 110, 0.22, 'square', 0.035);
    later(460, () => {
      tone(1047, 0.7, 'triangle', 0.05);
      tone(784, 0.7, 'triangle', 0.035);
      tone(523, 0.7, 'sine', 0.035);
    });
    if (big)
      for (let i = 0; i < 4; i++)
        later(800 + i * 280, () => {
          sweep(0.25, 600, 3000, 0.03, 'bandpass', 3);
          later(240, () => noise(0.18, 0.05));
        });
  },
  /** Everyone fell: low and slow. */
  sombre: () => {
    notes([294, 277, 220], 380, 0.7, 'sine', 0.05);
    tone(73, 1.6, 'triangle', 0.05);
  },
  /** A rest stone lights up: soft and calm. */
  calm: () => notes([523, 784, 1047, 784], 180, 0.6, 'sine', 0.03),
  /** A rune plate lights up, or all of them do: a bright little chime. */
  chime: () => {
    notes([1047, 1319, 1568, 2093], 70, 0.45, 'sine', 0.04);
    later(320, () => tone(2637, 0.6, 'triangle', 0.02));
  },
  /** One rune plate lit. */
  plate: () => notes([784, 1175], 90, 0.35, 'sine', 0.04),
  /** Hero mode on (a short call to arms) or off. */
  hero: (on: boolean) => (on ? notes([392, 523, 784], 80, 0.18, 'square', 0.03) : notes([523, 392], 90, 0.18, 'triangle', 0.035)),
  /** Something marked on the ground near you. */
  warn: () => {
    tone(880, 0.06, 'square', 0.025);
    later(110, () => tone(880, 0.06, 'square', 0.025));
  },
  /** You fell, you are up again. */
  fall: () => notes([440, 370, 294, 220], 130, 0.22, 'triangle', 0.05),
  rise: () => notes([330, 440, 554, 660], 90, 0.2, 'triangle', 0.05),
  /** Picked a target. */
  target: () => tone(900, 0.035, 'triangle', 0.03),
  /** Smed-Stina's hammer on the anvil: a ring for each blow, one more for every forge level, then a bright chime. */
  anvil: (level: number) => {
    const blows = Math.max(1, Math.min(5, level));
    for (let i = 0; i < blows; i++)
      later(i * 170, () => {
        tone(1760 + i * 40, 0.25, 'triangle', 0.04, -200);
        tone(2637, 0.12, 'sine', 0.02);
        noise(0.04, 0.05);
      });
    later(blows * 170 + 80, () => notes([784, 1047, 1319], 70, 0.35, 'sine', 0.04));
  },
  /** The loot window: a chest of treasure, longer and shinier for something legendary. */
  loot: (best: number) => {
    notes([523, 659, 784, 1047], 80, 0.25, 'triangle', 0.05);
    if (best >= 3) later(380, () => notes([1319, 1568, 2093], 70, 0.35, 'sine', 0.04));
    if (best >= 4) later(650, () => notes([1047, 1319, 1568, 2093, 2637], 60, 0.6, 'triangle', 0.035));
  },
};

/** For checks from outside (a script sets `window.__sfxLog = []`): every fight sound asked for is written down there. */
{
  const all = SAGA_SFX as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const k of Object.keys(all)) {
    const f = all[k]!;
    all[k] = (...a: unknown[]) => {
      (globalThis as { __sfxLog?: string[] }).__sfxLog?.push(a.length ? `${k}:${a.join(',')}` : k);
      return f(...a);
    };
  }
}
