// The tame animals of pets.ts that have no sprite of their own: a young bear, wolf, lynx, goat kid and fox. Side view facing
// right (flipped for left), two walk frames; drawAnimal outlines them. Smaller and rounder than their wild cousins, with big
// friendly eyes: the pets are the kids' friends.
import { Px } from './px.js';
import { lump, pal } from './saga.ts';

type Draw = (p: Px, f: number, v?: number) => void;
const K = '#1e1a22';

/** Legs that take turns: x of the back and the front leg on frame f. */
const stride = (f: number, back: number, front: number, reach = 2): [number, number] => (f ? [back + reach, front - reach] : [back, front]);

/** A big friendly eye: dark, with a light in it. */
const eye = (p: Px, x: number, y: number, c = K): void => {
  p.rect(x, y, 2, 2, c).px(x + 1, y, '#ffffff');
};

function pet_korp(p: Px, f: number): void {
  // a raven: glossy blue-black, a thick beak, a bright eye, wings folded, hopping on thin legs
  const c = pal('#0e0c18', '#1c1a30', '#2e2c4e', '#4a4878', '#7674a8');
  const hop = f ? 1 : 0;
  p.rect(8, 12 - hop, 1, 3 + hop, '#4a3a30').rect(12, 12 + hop - 1, 1, 3 - hop + 1, '#4a3a30'); // legs
  p.rect(7, 14, 3, 1, '#4a3a30').rect(11, 14, 3, 1, '#4a3a30'); // feet
  p.rect(0, 8, 5, 3, c.d).rect(0, 10, 4, 2, c.d2).rect(2, 9, 3, 1, c.b); // tail feathers
  lump(p, 3, 3 - hop, 12, 9, c, 0.2, 251, 0.3); // the plump body
  p.rect(4, 6 - hop, 8, 4, c.b).rect(5, 7 - hop, 6, 1, c.l).rect(5, 9 - hop, 7, 1, c.d).px(4, 9 - hop, c.d2); // a folded wing with feather lines
  lump(p, 11, 0, 7, 7, c, 0.15, 252, 0.35); // the head
  p.rect(16, 3, 4, 3, '#3a3a46').rect(16, 3, 4, 1, '#6a6a78').rect(17, 5, 3, 1, '#22222c'); // a thick beak
  p.rect(14, 2, 2, 2, '#e8e8f4').px(15, 3, K); // an eye you can see
}

function pet_bear(p: Px, f: number): void {
  // a young brown bear: round, soft, with a tan muzzle and little round ears
  const fur = pal('#3a2414', '#573520', '#7a4c2c', '#a06a40', '#c08c5c');
  const tan = pal('#6a4a2c', '#8a6640', '#b08a5c', '#cca878', '#e2c498');
  const [b, fr] = stride(f, 3, 12);
  p.rect(b, 10, 4, 7, fur.d).rect(b, 15, 4, 2, fur.d2); // back legs (far one darker)
  p.rect(fr, 10, 4, 7, fur.b).rect(fr, 15, 4, 2, fur.d);
  p.rect(b + 4, 10, 3, 6, fur.b).rect(fr - 3, 10, 3, 6, fur.d);
  lump(p, 0, 3, 15, 9, fur, 0.2, 201, 0.3); // the round back and belly
  p.rect(0, 6, 2, 3, fur.d).px(0, 6, fur.b); // tail nub
  lump(p, 12, 2, 10, 10, fur, 0.15, 202, 0.35); // the head
  p.circle(14, 2, 2, fur.b).circle(20, 2, 2, fur.b).px(14, 2, tan.b).px(20, 2, tan.b); // ears with pink-tan insides
  lump(p, 17, 6, 5, 5, tan, 0.1, 203, 0.4); // muzzle
  p.rect(20, 6, 2, 2, K).px(20, 6, '#6a5a60'); // nose
  p.px(19, 9, K).px(20, 9, K); // smile
  eye(p, 16, 4);
  p.rect(12, 9, 3, 3, fur.l).px(13, 9, fur.l2); // cheek fluff
}

function pet_wolf(p: Px, f: number): void {
  // a young grey wolf: pointed ears, a pale muzzle and belly, a bushy tail with a dark tip
  const fur = pal('#2c3038', '#454b56', '#6a7280', '#9aa2b0', '#c4cad4');
  const pale = pal('#8a929e', '#aab2be', '#cdd4dc', '#e6eaee', '#ffffff');
  const [b, fr] = stride(f, 4, 12);
  p.rect(b, 10, 2, 4, fur.d).rect(b + 3, 10, 2, 4, fur.b);
  p.rect(fr - 3, 10, 2, 4, fur.d).rect(fr, 10, 2, 4, fur.b);
  p.px(b, 13, pale.b).px(b + 3, 13, pale.b).px(fr - 3, 13, pale.b).px(fr, 13, pale.b);
  // the tail: a bushy lump pointing up and back, dark at the tip
  lump(p, 0, 2, 6, 5, fur, 0.3, 211, 0.3);
  p.rect(0, 2, 2, 2, fur.d2);
  lump(p, 2, 4, 13, 7, fur, 0.2, 212, 0.3); // body
  p.rect(5, 9, 7, 2, pale.b).rect(6, 9, 5, 1, pale.l); // pale belly
  lump(p, 11, 2, 7, 7, fur, 0.15, 213, 0.35); // head
  p.rect(12, 0, 2, 3, fur.b).px(12, 0, fur.d2).px(13, 1, '#d8909a'); // ears
  p.rect(15, 0, 2, 3, fur.d).px(15, 0, fur.d2).px(16, 1, '#d8909a');
  lump(p, 16, 5, 4, 3, pale, 0.1, 214, 0.4); // muzzle
  p.px(19, 5, K).px(19, 6, K); // nose
  p.rect(15, 3, 2, 2, '#f0c850').px(16, 3, K).px(15, 3, '#ffffff'); // a golden eye
  p.rect(10, 7, 2, 2, pale.d); // ruff
}

function pet_lynx(p: Px, f: number): void {
  // a young lynx: black-tipped tufted ears, a dark-striped face, white chest, bold spots, a stubby black-tipped tail, big paws
  const fur = pal('#5a3a1c', '#7c5628', '#a87838', '#cc9c58', '#e8c488');
  const white = '#f6ecd8';
  const [b, fr] = stride(f, 3, 11);
  p.rect(b, 8, 3, 5, fur.d).rect(b + 3, 8, 2, 5, fur.b).rect(b - 1, 12, 4, 2, white);
  p.rect(fr - 2, 8, 2, 5, fur.d).rect(fr, 8, 3, 5, fur.b).rect(fr, 12, 4, 2, white);
  lump(p, 1, 3, 12, 6, fur, 0.2, 221, 0.3);
  p.rect(0, 4, 2, 3, fur.b).rect(0, 6, 2, 1, K); // short tail with a black tip
  for (const [x, y] of [[3, 4], [6, 4], [9, 5], [4, 6], [7, 7], [11, 6]] as const) p.rect(x, y, 2, 1, fur.d2);
  p.rect(4, 8, 6, 1, white); // pale belly
  lump(p, 10, 1, 8, 8, fur, 0.15, 222, 0.35);
  p.rect(11, 0, 2, 3, fur.b).px(11, 0, K).px(12, 0, K).px(12, 1, '#e8a0a8'); // tufted ears, black tips
  p.rect(15, 0, 2, 3, fur.d).px(15, 0, K).px(16, 0, K);
  p.rect(10, 6, 2, 3, white).rect(16, 6, 2, 3, white); // cheek ruffs
  p.rect(10, 5, 2, 1, fur.d2).rect(10, 7, 1, 1, K); // dark face stripes
  p.rect(14, 5, 3, 3, white).rect(16, 5, 1, 1, '#e87890').px(15, 7, K); // muzzle, nose and mouth
  p.rect(12, 3, 3, 2, '#f0d84a').px(13, 3, K).px(13, 4, K); // a big yellow eye with a slit pupil
}

function pet_goat(p: Px, f: number): void {
  // a goat kid in Thor's spirit: creamy white, small curved horns, a little beard, dark hooves
  const fur = pal('#9a9488', '#c4beb2', '#e4dfd2', '#f4f0e6', '#ffffff');
  const horn = pal('#5a3a1a', '#7a5a2a', '#a8864a', '#c8a868', '#e2c88c');
  const [b, fr] = stride(f, 3, 10);
  p.rect(b, 10, 2, 4, fur.d).rect(b + 3, 10, 2, 4, fur.b);
  p.rect(fr - 2, 10, 2, 4, fur.d).rect(fr, 10, 2, 4, fur.b);
  p.rect(b, 13, 2, 2, '#3a3028').rect(b + 3, 13, 2, 2, '#3a3028').rect(fr - 2, 13, 2, 2, '#3a3028').rect(fr, 13, 2, 2, '#3a3028'); // hooves
  lump(p, 1, 4, 12, 8, fur, 0.2, 231, 0.3);
  p.rect(0, 5, 2, 2, fur.l); // tail tuft
  lump(p, 10, 1, 6, 7, fur, 0.15, 232, 0.35);
  p.line(11, 1, 10, -1, horn.b).line(14, 1, 15, -1, horn.b); // horns (clipped by the canvas when high)
  p.rect(10, 0, 2, 2, horn.l).rect(14, 0, 2, 2, horn.b).px(10, 0, horn.l2);
  p.rect(8, 3, 3, 2, fur.d).px(8, 4, '#d8b4a8'); // a floppy ear
  p.rect(13, 5, 3, 3, fur.l2).px(15, 6, '#c8a0a0');
  p.rect(14, 8, 1, 3, fur.d).px(14, 10, fur.b); // beard
  p.rect(12, 3, 2, 2, '#e8d050').px(13, 3, K).px(12, 4, '#e8d050'); // a goat's pupil eye
}

function pet_fox(p: Px, f: number): void {
  // a fox kit: orange, a white chest and cheeks, black socks and a huge tail with a white tip
  const fur = pal('#7a2a0a', '#b84a16', '#e07a2a', '#f09a52', '#ffc07a');
  const white = '#f8f2e4';
  const [b, fr] = stride(f, 4, 11);
  for (const [x, c] of [[b, fur.d], [b + 3, fur.b], [fr - 3, fur.d], [fr, fur.b]] as const) p.rect(x, 9, 2, 2, c).rect(x, 11, 2, 2, '#2e2018'); // orange legs, black socks
  // the big tail, curling up behind
  lump(p, 0, 2, 7, 6, fur, 0.25, 241, 0.3);
  p.rect(0, 2, 3, 3, white).px(1, 5, white);
  lump(p, 3, 4, 11, 6, fur, 0.2, 242, 0.3);
  p.rect(10, 8, 4, 2, white); // chest
  lump(p, 11, 2, 7, 7, fur, 0.15, 243, 0.35);
  p.rect(11, 0, 2, 3, fur.b).rect(11, 1, 1, 2, K).rect(15, 0, 2, 3, fur.d).rect(15, 1, 1, 2, K); // ears
  p.rect(14, 6, 4, 2, white).px(17, 6, K); // muzzle and nose
  p.rect(12, 7, 3, 2, white); // cheek
  eye(p, 13, 4);
}

export const PET_DRAW: Record<string, Draw> = { pet_korp, pet_bear, pet_wolf, pet_lynx, pet_goat, pet_fox };

export const PET_ANIMAL_SIZE: Record<string, { w: number; h: number }> = {
  pet_korp: { w: 20, h: 15 },
  pet_bear: { w: 22, h: 17 },
  pet_wolf: { w: 20, h: 14 },
  pet_lynx: { w: 18, h: 13 },
  pet_goat: { w: 17, h: 15 },
  pet_fox: { w: 18, h: 13 },
};

/** Where a tomteluva sits at Christmas (head centre x, top y). */
export const PET_HAT_POS: Record<string, [number, number]> = { pet_korp: [14, -1], pet_bear: [17, 1], pet_wolf: [14, 0], pet_lynx: [14, 0], pet_goat: [13, 1], pet_fox: [14, -1] };
