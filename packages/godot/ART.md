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
  not in the sheet; a swing is a lunge and a flash of the sprite with the spell's light drawn over it (M3b).
- `icons.png` (M3b): the spells' and the emotes' emoji drawn by Chromium's colour emoji font, the loot items' 16 px
  pictures at ×2, and a few HUD glyphs, in 32 px squares; `atlas.json`'s `icons` says where each sits. The HUD, the
  loot window and the wheels read them; an item without a picture of its own gets its kind's emoji, like the browser.
- `mob_<species>.png`: the dungeon's monsters and bosses as `SAGA_MOBS`/`SAGA_BOSSES` name them, two walk frames
  facing right, at the size `SAGA_ANIMAL_SIZE` gives them, outlined as `drawAnimal` outlines them.
- The farm's people (M4a): `farm_<kind>.png`, one PNG per layer kind with one row of 12 frames (`down0..2 up0..2 left0..2
  right0..2`, 16×32, left = right mirrored) per layer; `atlas.json`'s `farm.layers` maps a layer key (`shirt_shirt_red`,
  `hair_ponytail_3`, `hat_hat_viking`) to `{file, x, y}`, the cell of its frame 0 (frame i is at `x + i*16`). Any
  `appearance` {skin, hair, hairStyle} and `outfit` {hat, shirt, pants, shoes} is put together at runtime with
  alpha blending, and the result is `drawCharacter(lookOf(appearance, outfit), dir, frame)` pixel for pixel (the exporter
  composes 1000 looks the same way and fails if one pixel differs). The order is the browser's drawing order, which is
  not simply "body, then clothes" (hands are drawn over the shirt's hem but under its decoration, the head over the
  shirt, the face shading over the hair), so there are ten layers, `farm.layer_order`:
  `pants, shoes, shirt, hands, shirt_over, head, hair, shirt_shade, head_shade, hat`. Keys, with `<item>` an item id
  (`farm.items` lists the clothing with slot, style and colour; an empty slot, or an item with no clothing, is
  `default`, `lookOf`'s fallback) and `<skin>` the index in `farm.skins`, `<colour>` the index in `farm.hair_colors`:
  `pants_<item>` (not drawn when the shirt is a dress: `farm.layers[shirt_<item>].dress`), `shoes_<item>` (`shoes_<item>_dress`
  under a dress), `shirt_<item>`, `hands_<skin>`, `shirt_over_<item>` (the shirt's style on top; absent for a plain
  shirt), `head_<skin>` (head, neck, face), `hair_<style>_<colour>` (none for `bald`; under a hat with `tucks_hair`
  (the glass helmet) `long` and `ponytail` are drawn as `short`), `shirt_shade_<item>`, `head_shade_<skin>`, `hat_<item>`.
  A hat with an `erase` key first clears the pixels where that layer is opaque from everything below it (the helmet's
  glass clips the hair, the frog and dino hoods hide its top row), then is drawn. Last, the outline: every fully
  transparent pixel with a 4-neighbour of alpha above 0 becomes `farm.outline.color` (`#2a2420`), per frame, on the
  composed image (the outline follows the whole figure, so it is not in the layers). Skin and hair colours outside the
  lists take the nearest entry.
- `animal_<species>[_baby][_jul][_v<variant>].png`: the pets, farm animals, mounts, wild animals and roaming monsters
  (vehicles and dungeon-only monsters excluded), side view facing right, the browser's two walk frames as `right0`
  `right1` (the browser has no other directions; Godot mirrors for left), at the size `ANIMAL_SIZE` gives them, in
  `atlas.json`'s `sheets` like the other sheets. `farm_animals` says per species what it is (`kinds`), its frame size,
  how many `variants` (`_v1`, `_v2`; the game uses `variant % variants`), whether there is a `baby` (species that grow
  up), the winter tomteluva (`_jul`, all of them) and lists the `sheets` (and `ride_lift` for mounts).
- `npc_<id>.png`: the villagers, drawn as the browser draws them (`lookOf(appearance, outfit)`), in the hero layout of
  12 frames; `atlas.json`'s `npcs` maps the id to `{sheet, name, area}`.

Run `pnpm godot:sprites` after changing the art or adding a dungeon; it takes a few seconds and needs a Chromium that
Playwright can start (the build sandbox has one, CI does not, so the sheets are committed).

## Quality presets (PLAN.md section 3)

Everything expensive is a toggle in `scripts/quality.gd`, so a scene is built once and the preset decides what runs:

| | Låg | Mellan (default) | Hög |
| --- | --- | --- | --- |
| 3D resolution | 0.8 of the window, at most 1.3 Mpix (FSR 1) | 1.0, at most 2.1 Mpix (FSR 1 above that) | 1.0, at most 3.7 Mpix |
| Torch shadows | none | none | the 6 nearest the camera |
| SSAO | off | low quality | medium quality |
| Global illumination | off | off | SDFGI: 2 cascades of 25 cm cells, half the height, half resolution |
| Volumetric fog | off | off | on |
| Glow | off | on | on |
| Torch flame particles | none (a flat flame sprite) | 8 per torch | 16 per torch, plus dust motes |

Låg must stay a plain forward render with a handful of unshadowed lights: that is what an Intel integrated GPU does
at 60 fps. The decision Mobile-vs-Forward+ is made with a frame-time capture in M3b, not here.

The 3D resolution is a pixel budget (`Quality.scale_for`): the preset's own scale, held down so the scene is never
shaded at more than its Mpix. A Retina window of 1280×720 points is 2560×1440 pixels = 3.7 Mpix; Mellan renders that
at 0.75 (1932×1087) and the engine upscales it. Lights beyond 20 m of the camera fade out (26 m: gone) and throw no
shadow beyond 16 m. Only the wall blocks cast shadows: the floor and the wall slabs never do, and neither do flames.

### Measured (M3d, performance pass)

Bench: `godot --path packages/godot -- --bench` (bench.gd: 1 s settle, one unmeasured pass of the scripted fight,
then 10 s measured, per preset). Draw calls and the other counters are the engine's own
(`RenderingServer.get_rendering_info`), averaged over the measured window.

**Baseline, before M3d: the owner's MacBook Air M4** (Godot 4.7.2, Metal, Forward+, window 1280×720 points, the demo
scene: 65 objects, 31 lights, 21 actors; the old bench, which did not warm up or restart the fight per preset):

```
bench: Låg:    92 fps · 10.8 ms · 1 % low 81.4 ms (925 frames)
bench: Mellan: 48 fps · 21.0 ms · 1 % low 30.1 ms (477 frames)
bench: Hög:    27 fps · 37.1 ms · 1 % low 74.8 ms (270 frames)
```

followed at exit by "Pages in use exist at exit in PagedAllocator", "RID allocations of type … were leaked at exit",
"16 ObjectDB instances were leaked at exit" and "4 resources still in use at exit".

What the baseline most likely says: "1280×720" is the window in points, and on a Retina display Godot renders
2560×1440 pixels, four times what the line suggests, so Mellan shaded 3.7 Mpix with four omni shadows and SSAO.
The new bench prints the pixels (the "window … pixels, 3D … pixels" line), which settles it; the numbers below are
from the sandbox and are not a prediction of the M4's.

**After M3d, on the MacBook Air M4** (paste the output of `godot --path packages/godot -- --bench` here; the
three "render:" lines and the three "window" lines matter as much as the frame times):

```
(owner: paste here)
```

**The sandbox**, before and after (Godot 4.7.2, Forward+ on Mesa's lavapipe, a software Vulkan, under Xvfb, window
1280×720 on a 4-core Xeon). Frame times are quantised by the software swapchain and mean nothing; the draw, primitive
and light counts are exact and carry over to a real GPU, and the "GPU ms" are lavapipe's own timestamps, i.e. CPU time
spent shading: only the ratios between rows say anything. Compatibility under llvmpipe was not used for the table
(it has no SSAO, SDFGI or FSR). Before = the bench commit alone (`cae4593`), after = the last commit.

| | draw calls | primitives | lights (in reach / shadow) | GPU ms (llvmpipe) |
| --- | --- | --- | --- | --- |
| Låg before | 137 | 20 482 | 31 / 0 | 80 |
| Låg after | 136 | 20 463 | 7 / 0 | 86 |
| Mellan before | 311 | 108 002 | 31 / 4 | 242 |
| Mellan after | 143 | 20 544 | 7 / 0 | 148 |
| Hög before | 376 | 154 930 | 31 / 8 | 443 |
| Hög after | 175 | 26 276 | 7 / 6 | 272 |

The same Mellan in a 2560×1440-pixel window (what a Retina 1280×720 is): before 306 draw calls and 3.69 Mpix shaded
(GPU 579 ms), after 137 draw calls and 2.10 Mpix (GPU 426 ms). Exit: before 16 leaked objects, 4 resources in use and
RIDs leaked (bench), after none; the CI logs are grepped for it. Where the sandbox ablations put the cost (Mellan,
GPU ms, 229 in all): the four torch shadows 83, SSAO 46, 31 lights 64, glow 31; on Hög the GI was 138 of 423.
Script time per frame (all `_process`) is 1–2.5 ms on the sandbox's slow cores, so GDScript was not the cost.

## The farm and the wild maps (M4a)

The same units and camera as the crypt (1 tile = 1 m, 51°, north up). Outdoors the world is lit by the sun
(`scripts/day_night.gd`), not by torches: a `DirectionalLight3D` with the browser's day colours, ambient light and
fog from the clock, lamps and windows at night (OmniLights with the crypt's distance fade, at most a handful in reach).

| Name | Hex | Used for |
| --- | --- | --- |
| Trä ljus | `#a8793f` | fences, benches, the farm's tables, wooden floors |
| Sten | `#7c7d78` | the arch, stone paths, rocks |
| Tak | `#a83a2c` | the shop's awning, the farmhouse roof (the pack's own red) |
| Halm | `#c9a24d` | hay, thatch |
| Lövgrön / Höstlöv | `#64a848` (Gräs) → `#d8841f #b8501c #d8b02a` | foliage by season (spring `#8cc85a`, winter darker with snow) |

**Foliage is recoloured by the shader, not by the mesh**: a vertex with foliage mask 1 takes the season's leaf colour
(three per season, picked per tree) times its own lightness, so a tree is one mesh all year. The Kenney pines are
recoloured once at load to the pine green (`#3f7a45` → `#79b25a`); the packs' rocks are greyed 45 % towards Sten.

**Lighting rules by preset**: Låg has no sun shadow and no cloud shadows (a plain forward render, 150 weather
particles); Mellan one short shadow cascade (26 m, 1024²) and 600 particles; Hög two cascades (38 m, 2048²),
volumetric fog in fog weather and 1500 particles. SSAO, glow and GI are the crypt's.

### Measured (M4a)

`godot --path packages/godot -- --bench --scene=farm` (or `forest`, or `draug` for the crypt's fight), the sandbox's
Forward+ on Mesa's lavapipe under Xvfb, window 1280×720 (counts are exact; GPU ms are software and only compare rows):

| Scene · preset | draw calls | primitives | lights (in reach) | GPU ms |
| --- | --- | --- | --- | --- |
| Farm · Låg | 59 | 27 832 | 5 (0) | 110 |
| Farm · Mellan | 88 | 79 141 | 5 (0) | 179 |
| Farm · Hög | 88 | 132 200 | 5 (0) | 506 |
| Forest · Låg | 52 | 17 014 | 4 (1) | 106 |
| Forest · Mellan | 107 | 66 389 | 4 (1) | 185 |
| Forest · Hög | 141 | 160 250 | 4 (1) | 383 |
| Crypt · Låg (M3d) | 139 | 20 452 | 31 (7) | 130 |
| Crypt · Mellan (M3d) | 141 | 20 496 | 31 (7) | 200 |
| Crypt · Hög (M3d) | 174 | 26 273 | 31 (7, 6 shadows) | 359 |

The farm and the forest stay under the crypt's draw-call budget on every preset; they draw more triangles (a tree is
about a hundred) and fewer lights. **After M4a, on the MacBook Air M4** (owner: paste the three bench lines for
`--scene=farm` here): `(owner: paste here)`.

## The fight on screen (M3b)

- **Telegraphs** are flat shapes 4.5 cm over the floor: a dim red base in the zone's full size, a brighter fill that
  grows from the middle (from the boss, for a cone or a line) until the attack lands, and a blinking edge. Red is danger
  and nothing else is red on the floor; a pull is violet (a whirl with rings sliding in), burning ground pulses orange,
  a mend is not marked (the boss glows green instead). The colours per move are the browser's `MOVE_COLOUR` and
  `BOSS_MOVE_COLOUR`, copied into `fx_view.gd`.
- **Spells and hits** are additive glow quads (a radial gradient texture made in code, billboarded) and flat rings;
  no particles systems, so they cost the same on Låg. Numbers are `Label3D`, white for damage, gold for a crit, green
  for healing, red when it is me.
- **Bodies.** Fallen: the sprite laid flat (billboard off), grey, with a halo of motes. Frozen: a translucent pale blue
  box (Is); webbed: white rings. Health bars are two unshaded quads over the head; the target's and a boss's name over
  them. The monster after you carries the ⚠️ icon, bobbing.
- **Sound** is code-generated into PCM (`sfx.gd`), one recipe per spell, move and HUD event, the browser's.

