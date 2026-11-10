// The pixel art of pet gear (shared/src/looks.ts: PET_LOOK_SETS): a piece is drawn on the animal's own sprite at one of its three anchors
// (pets.ts: head, neck, back), per walk frame, in the set's palette, and has the same five shine tiers as hero looks: 1 plain,
// 2 trimmed, 3 a lit gem or rune, 4 glints (the client adds the first particle effect), 5 the full flourish (the client adds its aura).
//
// Where a piece sits, whatever the animal: the head anchor is the top of the head (the piece reaches up to 3 pixels above it and
// 2 below), the neck anchor is the front of the neck (a collar 4 wide and a tag hanging 3 below) and the back anchor is the top of the
// back (a cape or blanket 6 wide and 4 deep, trailing backwards, so to the left on a sprite facing right).
// To draw a new piece: add a case to the function of its slot, keeping inside those boxes. A test draws every piece on every pet.
import type { DecodedLook, LookPal, PetAnchor } from '@lilla-garden/shared';
import { Px } from './px.js';
import { OUTLINE } from './world.js';

/** A glint: a bright pixel with a dimmer one beside it. */
const glint = (p: Px, x: number, y: number, pal: LookPal): void => {
  p.px(x, y, pal.accent).px(x + 1, y, pal.glow);
};

function head(p: Px, l: DecodedLook, x: number, y: number): void {
  const { tier, pal } = l;
  switch (l.piece.set) {
    case 'pet_draug': {
      // a small helm of old bone with a pale horn on each side and a green flame
      p.rect(x - 2, y, 5, 2, pal.main).rect(x - 2, y + 2, 5, 1, pal.dark).px(x - 3, y - 1, pal.light).px(x + 3, y - 1, pal.light);
      if (tier >= 2) p.rect(x - 2, y + 1, 5, 1, pal.trim);
      if (tier >= 3) p.px(x, y - 1, pal.glow).px(x, y, pal.accent);
      if (tier >= 5) p.px(x, y - 2, pal.glow).px(x - 1, y - 1, pal.glow).px(x + 1, y - 1, pal.glow).px(x, y - 3, pal.accent);
      break;
    }
    case 'pet_frost': {
      // a circlet with three ice spikes
      p.rect(x - 2, y + 1, 5, 1, pal.main).px(x - 2, y, pal.light).px(x, y, pal.light).px(x, y - 1, pal.light).px(x + 2, y, pal.light);
      if (tier >= 2) p.rect(x - 2, y + 2, 5, 1, pal.trim);
      if (tier >= 3) p.px(x, y + 1, pal.glow).px(x, y, pal.accent);
      if (tier >= 5) p.px(x - 2, y - 1, pal.light).px(x + 2, y - 1, pal.light).px(x, y - 2, pal.accent);
      break;
    }
    case 'pet_alv': {
      // a wreath of living leaves
      p.rect(x - 2, y, 5, 1, pal.main).px(x - 2, y + 1, pal.dark).px(x + 2, y + 1, pal.dark).px(x - 1, y - 1, pal.light).px(x + 1, y - 1, pal.light).px(x, y - 1, pal.dark);
      if (tier >= 2) p.px(x - 2, y, pal.trim).px(x + 2, y, pal.trim);
      if (tier >= 3) p.px(x, y, pal.glow);
      if (tier >= 5) p.px(x - 3, y + 1, pal.light).px(x + 3, y + 1, pal.light).px(x, y - 2, pal.accent);
      break;
    }
    case 'pet_hel': {
      // a band with a black feather standing up and leaning forward
      p.rect(x - 2, y + 1, 5, 1, pal.main).px(x, y, pal.dark).px(x + 1, y - 1, pal.main).px(x + 1, y - 2, pal.light).px(x + 2, y - 3, pal.main);
      if (tier >= 2) p.rect(x - 2, y + 2, 5, 1, pal.trim);
      if (tier >= 3) p.px(x + 2, y - 3, pal.glow).px(x - 1, y + 1, pal.glow);
      if (tier >= 5) p.px(x - 1, y - 1, pal.main).px(x - 1, y - 2, pal.light).px(x - 2, y - 3, pal.dark);
      break;
    }
    default: {
      // pet_fenrir: a little helm with two horns
      p.rect(x - 2, y + 1, 5, 2, pal.main).px(x - 3, y, pal.light).px(x - 3, y - 1, pal.light).px(x - 2, y - 2, pal.light).px(x + 3, y, pal.light).px(x + 3, y - 1, pal.light).px(x + 2, y - 2, pal.light);
      if (tier >= 2) p.rect(x - 2, y + 1, 5, 1, pal.trim);
      if (tier >= 3) p.px(x + 1, y + 2, pal.glow).px(x - 1, y + 2, pal.glow);
      if (tier >= 5) p.px(x, y, pal.glow).px(x, y - 1, pal.accent);
    }
  }
  if (tier >= 4) glint(p, x + 2, y - 1, pal);
}

function neck(p: Px, l: DecodedLook, x: number, y: number, f: number): void {
  const { tier, pal } = l;
  switch (l.piece.set) {
    case 'pet_draug': {
      // a collar of iron rings and a green rune tag
      for (let i = 0; i < 4; i++) p.px(x - 2 + i, y, i % 2 ? pal.light : pal.main).px(x - 2 + i, y + 1, i % 2 ? pal.main : pal.dark);
      p.rect(x - 1, y + 2, 2, 2, pal.dark);
      if (tier >= 2) p.px(x - 2, y, pal.trim).px(x + 1, y, pal.trim);
      if (tier >= 3) p.px(x - 1, y + 2, pal.glow).px(x, y + 3, pal.glow);
      if (tier >= 5) p.px(x - 2, y + 2, pal.glow).px(x + 1, y + 3, pal.accent);
      break;
    }
    case 'pet_surt': {
      // a black chain with a tag that glows like an ember
      for (let i = 0; i < 4; i++) p.px(x - 2 + i, y, pal.dark).px(x - 2 + i, y + 1, i % 2 ? pal.main : pal.dark);
      p.rect(x - 1, y + 2, 2, 2, pal.dark);
      if (tier >= 2) p.px(x - 2, y, pal.trim).px(x + 1, y + 1, pal.trim);
      if (tier >= 3) p.rect(x - 1, y + 2, 2, 2, pal.glow).px(x - 1, y + 2, pal.accent);
      if (tier >= 5) p.px(x - 2, y + 2 + f, pal.glow).px(x + 1, y + 4, pal.glow);
      break;
    }
    case 'pet_alv': {
      // a green ribbon with a drop of light hanging from it
      p.rect(x - 2, y, 4, 2, pal.main).rect(x - 2, y, 4, 1, pal.light);
      p.px(x, y + 2, pal.dark).px(x, y + 3 + f, pal.light);
      if (tier >= 2) p.px(x - 2, y + 1, pal.trim).px(x + 1, y + 1, pal.trim);
      if (tier >= 3) p.px(x, y + 3 + f, pal.glow).px(x, y + 2, pal.accent);
      if (tier >= 5) p.px(x - 2, y + 2, pal.light).px(x + 1, y + 2, pal.light);
      break;
    }
    default: {
      // pet_fenrir: a red scarf with a knot, two ends that flutter, and a rune tag
      p.rect(x - 2, y, 4, 3, pal.main).rect(x - 2, y, 1, 3, pal.light).rect(x + 1, y + 1, 1, 2, pal.dark);
      p.px(x, y + 3, pal.main).px(x - 1, y + 4 + f, pal.dark).px(x + 1, y + 4, pal.main);
      if (tier >= 2) p.rect(x - 2, y, 4, 1, pal.trim);
      if (tier >= 3) p.px(x, y + 1, pal.glow).px(x - 1, y + 2, pal.glow);
      if (tier >= 5) p.px(x - 2, y + 3, pal.light).px(x + 2, y + 4, pal.light);
    }
  }
  if (tier >= 4) glint(p, x - 2, y - 1, pal);
}

function back(p: Px, l: DecodedLook, x: number, y: number, f: number): void {
  const { tier, pal } = l;
  switch (l.piece.set) {
    case 'pet_frost': {
      // a blue cape with a white fur edge
      p.rect(x - 3, y, 6, 4, pal.main).rect(x - 3, y + 3, 6, 1, pal.dark).rect(x - 3, y, 6, 1, pal.trim);
      p.px(x - 3 - f, y + 4, pal.dark).px(x - 1, y + 4, pal.dark);
      if (tier >= 2) p.px(x - 3, y + 1, pal.light).px(x - 3, y + 2, pal.light);
      if (tier >= 3) p.px(x - 1, y + 1, pal.glow).px(x + 1, y + 2, pal.glow);
      if (tier >= 5) p.px(x + 2, y, pal.accent).px(x - 4, y + 3 + f, pal.light).px(x - 4, y + 2, pal.light);
      break;
    }
    case 'pet_surt': {
      // a black saddle blanket with a glowing hem
      p.rect(x - 3, y, 6, 3, pal.dark).rect(x - 3, y + 3, 6, 1, pal.main).px(x - 2, y + 1, pal.main).px(x + 1, y + 1, pal.main);
      if (tier >= 2) p.rect(x - 3, y, 6, 1, pal.trim);
      if (tier >= 3) p.rect(x - 3, y + 3, 6, 1, pal.glow);
      if (tier >= 5) p.px(x - 1, y + 2, pal.accent).px(x + 1, y + 2, pal.glow).px(x - 3, y + 4, pal.glow).px(x + 2, y + 4 - f, pal.glow);
      break;
    }
    default: {
      // pet_hel: a cape of black feathers with a ragged edge
      p.rect(x - 3, y, 6, 3, pal.main).px(x - 3, y + 3, pal.main).px(x - 1, y + 3 + f, pal.main).px(x + 1, y + 3, pal.main);
      p.px(x - 2, y + 1, pal.light).px(x, y + 1, pal.light).px(x + 2, y + 1, pal.dark).px(x - 3, y, pal.dark);
      if (tier >= 2) p.rect(x - 3, y, 6, 1, pal.dark).px(x - 2, y, pal.trim).px(x + 1, y, pal.trim);
      if (tier >= 3) p.px(x - 1, y + 2, pal.glow).px(x + 2, y + 2, pal.glow);
      if (tier >= 5) p.px(x - 4, y + 2 + f, pal.main).px(x - 4, y + 3, pal.light).px(x - 2, y + 4, pal.main).px(x, y + 4, pal.light);
    }
  }
  if (tier >= 4) glint(p, x + 1, y - 1, pal);
}

/** One piece of pet gear on a sprite: at `anchor` (x, y) on walk frame `frame`. */
export function drawPetLook(p: Px, l: DecodedLook, anchor: PetAnchor, x: number, y: number, frame: number): void {
  if (l.piece.petSlot !== anchor) return;
  if (anchor === 'head') head(p, l, x, y);
  else if (anchor === 'neck') neck(p, l, x, y, frame);
  else back(p, l, x, y, frame);
}

/** A piece of pet gear as an icon (16x16): drawn alone, small, and blown up two times with an outline. */
export function petLookIcon(l: DecodedLook): Px {
  const small = new Px(8, 8);
  const at: Record<PetAnchor, [number, number]> = { head: [4, 4], neck: [4, 2], back: [4, 2] };
  const slot = l.piece.petSlot ?? 'head';
  drawPetLook(small, l, slot, at[slot][0], at[slot][1], 0);
  const out = new Px(16, 16);
  out.blitScaled(small, 0, 0, 16, 16);
  out.outline(OUTLINE);
  return out;
}
