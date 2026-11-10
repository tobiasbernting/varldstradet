# Contributing

For people and agents adding content. How the game works is in [DESIGN.md](DESIGN.md); how to run and test it is in
[README.md](README.md). The section numbers below point into DESIGN.md.

## Ground rules

- `packages/shared` has no I/O. Rules are functions on a `WorldState` that return `Change[]`. Anything random in the sim comes from
  `ctx.rnd` or a seeded `mulberry32` (`rng.ts`), never `Math.random`, so the bots and the tests are reproducible.
- Every player-facing string is Swedish and goes in `packages/shared/src/sv.ts`. Cards have one short sentence with a number in it.
- A change to a number that moves a run (`WING_HP`, a pack table, a level, a runa) is tuned with `runtune.ts` and pinned by the bot tests
  (DESIGN.md section 8). If a band in `run.*.test.ts` moves on purpose, change it in the same commit.
- Run `pnpm typecheck` and the tests of what you touched before committing; CI runs everything.

## Add a runa

1. One line in `RUNOR` (`packages/shared/src/runor.ts`): `rn(id, class | undefined, emoji, rarity, [tags], effect)`. A class runa may only
   reach for that class's own spells (`spell`, `spellCd`, `mods` keys); `undefined` makes it a party runa, which is never offered in a
   personal offer and comes from an event, the Mellanboss or the Köpman. The effect uses the keys of `RunEffect` (`run.ts`).
2. Its name (at most four words) in `RUNA_NAMES` and a sentence of at most 40 characters with a digit in `RUNA_TEXT` (`sv.ts`).
3. `runor.test.ts` checks: unique id, one or two tags, every key is a known effect key, every effect changes something, and that each class
   still has every rarity. A tag needs at least four runor.

A new kind of effect is a new key in `RunEffect`, in `COMBAT_KEYS` or `META_KEYS`, and the code that reads it (`sagasim.ts` for combat).

## Add an event (Händelse)

1. An entry in `EVENTS` (`events.ts`) with two or three choices, each an array of outcomes (`silver`, `party`, `heal`, `potions`, `effect`,
   `sharpen`, `cards`, `spirit`). A choice may cost hacksilver but every event needs a free choice, which the clock takes. **No outcome
   may take health, a held runa or progress.**
2. Words in `sv.ts`: `EVENT_NAMES[id]`, `EVENT_TEXT[id]` and `EVENT_CHOICES[id][choice]` as `[name, what it does]`.
3. `runstops.test.ts` loops over all events: it checks the words and the free choice, and plays every choice of every event. A new outcome
   kind is a new member of `EventOutcome` and a branch in `resolveEvent` (`runsim.ts`); the bots vote through `runplay.ts`.

## Add a look set, a signature weapon or pet gear

A set is a theme of a dungeon (DESIGN.md 7.3); gear gives no power, so none of this changes balance.

1. The set in `LOOK_SETS` (`looks.ts`): id, dungeon, class (`null` for any), a palette, an aura (`ring` or `trail`), the two colourways
   (`svar`, `extrem`; their main colours must differ from the set's and from each other), and four or more pieces
   `piece(set, slot, [effect, effect2], shape)`. Effects come from `FxId`; each piece's first effect shows at shine tier 4 and both at 5.
   A signature weapon is a `sig(...)` entry in `SIGNATURE_WEAPONS` for a dungeon's boss.
2. Words in `LOOK_TEXT` (`sv.ts`): the set (`name`, `svar`, `extrem`) and each piece under `<set>_<slot>` (`name`, `text`).
3. Art in `packages/art/src/looks.ts`: the set's base clothes in `SET_STYLES`, and the drawing of its pieces. A new particle effect is a row
   in `FX_KINDS` (`looks.ts`) or a procedural effect in `packages/clientljs/src/looksfx.ts`.
4. `looks.test.ts` pins the number of sets and the classes they cover; update it if the count changes on purpose.

Pet gear is the same with `petPiece` and `petSet` (`PET_LOOK_SETS`), drawn in `packages/art/src/petlooks.ts`; a test checks that all three
(table, words, drawing) exist.

## Add a pet

Three things, all checked by `pets.test.ts`: an entry in `PETS`, the art, and the species in `ANIMALS` and `SPECIES_NAMES`. The steps are in
DESIGN.md 7.4.

## Add a window

Follow the checklist in DESIGN.md section 9. In practice:

1. A class in `packages/client/src/ui/` that builds a `.modal` with the helpers in `ui/dom.ts` (`h`, `onTap`, `clear`), with `open()`,
   `close()` and `isOpen()`. Its stylesheet is imported by the file and listed in `scripts/a11y-fontfloor.mjs`.
2. Register it where the others are in `packages/clientljs/src/main.ts`, including the `windows` list passed to `initGamepad`, so that the
   gamepad's B closes it and the focus ring works inside it.
3. Mark everything that needs explaining with `cards.info(el, icon, name, text)` (`ui/info.ts`).
4. Add a scene to `scripts/a11y-audit.cjs` and run the audit at the four viewports. The audit is not part of CI; run it before asking for
   review and say so in the pull request.

## Add a dungeon boss, a särdrag or a level

These touch the fight sim and the run together: `saga.ts` (`SAGA_BOSSES`, `DUNGEONS`, `SAGA_MOBS`), `run.ts` (`AFFIXES`, `RUN_LEVELS`),
`runmap.ts` and `sagasim.ts`. Start from the nearest existing one, add its words to `sv.ts`, and run the bot tests: `run.bots.test.ts` plays
every dungeon to the end, so a stall shows up there.
