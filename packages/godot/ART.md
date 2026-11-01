# Art rules for the native client (HD-2D)

Written 2026-11-01 with milestone M3a. One style for every later session: a low-poly 3D world lit in real time, with
the game's own pixel sprites standing in it as billboards. PLAN.md section 5 has the budget (free CC0 packs only until
the owner decides otherwise); `assets/LICENSES.md` has every file's origin.

## The world is 3D, the people are pixels

- **Units.** One map tile (`TILE` = 16 px in the shared rules) is **1 metre** in the scene. The 2D map's x axis is the
  scene's +X and its y axis (down the screen, south) is the scene's **+Z**. A tile at (tx, ty) is centred at
  (tx + 0.5, 0, ty + 0.5); the server's pixel positions divide by 16. The scripts call this `WorldView.to_scene()`.
- **Pixel scale.** 1 sprite pixel = 1/16 m (`Sprite3D.pixel_size = 0.0625`), so a 16×24 px character is 1 m wide and
  1.5 m tall, a wall is 2 m, a boss sprite of 44 px stands 2.75 m. Nothing is scaled by hand; a sprite's size in the
  world is its size in pixels, as in the browser game where everything shares the 16 px tile.
- **Billboards.** Characters, animals and monsters are `Sprite3D` with `billboard = BILLBOARD_FIXED_Y`, `shaded = true`
  (torches light them), `alpha_cut = ALPHA_CUT_DISCARD`, `texture_filter = NEAREST`, feet on the floor (the sprite
  sits so its bottom row is at y = 0). Directions: down, up, left, right; left is right mirrored as in the browser.
  Monsters have one side view (facing right), mirrored for left, as in `sagaanimals.ts`. Two walk frames, one stand frame.
- **Camera.** Perspective, FOV 40°, 8 m behind (+Z) and 10 m above the hero, pitched about 51° down, looking north.
  It follows the hero smoothly and never rotates: north is always up on the screen, like the map. The angle shows the
  floor as the main surface (where the telegraphs will be drawn in M3b) with the walls as a frame.
- **Light.** A dungeon is dark in its own colour: `WorldEnvironment.ambient_light_color` is
  `DUNGEONS[id].ambient × 0.6` (the browser's `dungeonAmbient`), the background the same colour darker. Every
  `saga_torch` is an `OmniLight3D` with the dungeon's torch colour (Draugkryptan's is the green `#9cff8a`, the frost
  castle's pale blue, Surt's fire; see `TORCH_COLOURS` in `dungeon_view.gd`, copied from the browser's `SAGA_TORCH`),
  range 4 m, a slow flicker. Candles, a lit rest stone and the exit carry smaller lights. Shadows are a quality-preset
  matter (below), never baked.
- **Names and numbers.** `Label3D` billboards over heads, white with a dark outline, 2 px of outline per 16 px of text.
  Text is never drawn into a sprite.

## Palette

Twelve named colours taken from the existing pixel art (`packages/client/src/art`). Imported 3D packs are tinted to
them; new 2D art uses them directly. The sprites themselves keep their own full colours (they are the family's art).

| Name | Hex | Taken from | Used for |
| --- | --- | --- | --- |
| Kant (outline) | `#2b2419` | `OUTLINE` in `world.ts` | sprite outlines, label outlines, the wall caps' darkest side |
| Kryptsten | `#5a6257` | `CRYPT.b` in `saga.ts` | Draugkryptan's walls and floor tint |
| Mossa | `#4f8231` | `MOSS.b` | moss on the crypt's walls, the forest later |
| Ben | `#e2d6b8` | `BONE.b` | bones, skulls, the generated coffin's lid |
| Järn | `#5e626c` | `IRON.b` | gates, chest bands, torch brackets |
| Trä | `#86582f` | `WOOD.b` | chests, the generated coffin's box, torches' handles |
| Guld | `#e8b830` | `GOLD.b` | the boss chest, treasure |
| Draugsken | `#9cff8a` | `GHOST` in `sagaanimals.ts` | the crypt's torch light and rune glow |
| Glöd | `#d8481a` / `#ffa040` | `EMBER.m` / `EMBER.h` | fire, Surt's smithy, candle flames |
| Is | `#84bae0` | `ICE.b` | the frost castle, ice blocks |
| Runblått | `#38d8f0` | `RUNE.b` | lit rune plates, a lit rest stone |
| Gräs | `#64a848` | `GRASS` in `world.ts` | the farm and the forest later |

## Recolouring imported packs

The KayKit models share one gradient atlas (`dungeon_texture.png`), so they come out in a neutral grey and brown.
When a dungeon is built, `dungeon_view.gd` duplicates each model's material once and multiplies its albedo with the
dungeon's **stone tint**: Kryptsten `#5a6257` lifted to `(0.78, 0.84, 0.76)` for Draugkryptan, so the pack's grey turns
the crypt's grey-green while the atlas's shading survives. The tint per dungeon look (the `wall` index 0–8) is the
`STONE_TINT` table in `dungeon_view.gd`, and the rule for a new pack is the same: never edit the texture, tint the
material, one tint per dungeon look. Emissive parts (flames, runes, glow) take their colour from the palette directly.

## What is generated and why

Where a pack the sandbox could reach had nothing (the Kenney kits answered 403 on 2026-11-01), the prop is made in
code: coffin, bones, urn, rest stone, gate, wall caps (`scripts/dungeon_props.gd`, listed in `LICENSES.md`). They use
only palette colours and simple shapes so they sit next to the KayKit models without clashing. When the Kenney
Graveyard Kit is fetched (`tools/fetch-assets.sh`), the coffin, urn and bones can be swapped for its models in the
`make_prop()` table without touching anything else.

## Sprites from the browser's art

`tools/export-sprites.mts` renders the game's drawn-in-code pixel art to sheets with Playwright's Chromium, once, and
the sheets are committed under `assets/sprites/` with `atlas.json` (frame size, frame names, columns):

- `hero_<class>_<skin>.png`: the hero in the class's outfit (`CLASSES[cls].outfit`: hat and shirt, brown trousers,
  boots) for each of the six skin tones in `SKIN_TONES`, 4 directions × 3 frames (stand, walk 1, walk 2) in one row of
  16×32 px frames (the 8 rows of headroom over the 24-row figure keep the horned helmet and the rune hat inside the
  frame). Hair is the default short dark brown: the class hats hide most of it, and one sheet per hair colour and style
  would be 40 more sheets per class, which is M4's problem when the farm's wardrobe comes over. The weapon in hand is
  not in the sheet either (M3b draws spells and weapons).
- `mob_<species>.png`: the dungeon's monsters and bosses as `SAGA_MOBS`/`SAGA_BOSSES` name them, two walk frames
  facing right, at the size `SAGA_ANIMAL_SIZE` gives them, outlined as `drawAnimal` outlines them.

Run `pnpm godot:sprites` after changing the art or adding a dungeon; it takes a few seconds and needs a Chromium that
Playwright can start (the build sandbox has one, CI does not, so the sheets are committed).

## Quality presets (PLAN.md section 3)

Everything expensive is a toggle in `scripts/quality.gd`, so a scene is built once and the preset decides what runs:

| | Låg | Mellan (default) | Hög |
| --- | --- | --- | --- |
| Resolution scale | 0.8 (FSR 1) | 1.0 | 1.0 |
| Torch shadows | none | the 4 nearest torches | the 8 nearest torches |
| SSAO | off | on | on |
| Global illumination | off | off | SDFGI |
| Volumetric fog | off | off | on |
| Glow | off | on | on |
| Torch flame particles | none (a flat flame sprite) | 8 per torch | 16 per torch, plus dust motes |

Låg must stay a plain forward render with a handful of unshadowed lights: that is what an Intel integrated GPU does
at 60 fps. The decision Mobile-vs-Forward+ is made with a frame-time capture in M3b, not here.
