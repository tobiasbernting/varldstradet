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
  castle's pale blue, Surt's fire; see `LOOKS[id]["torch"]` in `dungeon_look.gd`, from the browser's `SAGA_TORCH`),
  range 4 m, a slow flicker. Candles, a lit rest stone and the exit carry smaller lights. Shadows are a quality-preset
  matter (below), never baked.
- **Names and numbers.** `Label3D` billboards over heads, white with a dark outline, 2 px of outline per 16 px of text.
  Text is never drawn into a sprite.

### Rock walls

The wild maps' rock, sandstone and basalt walls (`farm_view.gd`, `_cliff_tile`) keep their flat tops at varying
heights, but every side that faces land is a Kenney cliff face (`cliff_large_rock` or `cliff_rock`, picked per tile)
turned outward and stretched to the wall's height, in one MultiMesh per chunk; about one side in five gets a boulder at
its foot. The faces take the terrain's colour by material (`CLIFF_FACE` in `farm_assets.gd`, recolour `cliff_<terrain>`).
A step down to a lower wall tile is closed, so no sky shows between tiles. Sides over water and lava keep a plain face
down to the bed.

### The landmarks (lm_*)

The 26 landmarks of the wild maps are put together from pack parts in `scripts/landmark_models.gd`: a list per kind of
[model, recolour, scale, position, turn] on the landmark's footprint, each part a baked mesh in the prop material (so
seasons, snow and the night glow act on them). Kenney Nature Kit models take palette colours by material name (recolour
"kenney": stone, dirt, wood, water, leaves); its cliff pieces face -Z and are turned half round. What no pack has is a
small generated mesh (`gen:` eggs, tar pit, pond, embers, ice-cream tower, chocolate fountain, satellite). Lantern parts
get a night glow; the vårdkase and the fire well a flame. A kind missing from the table still shows the old cairn.

### Trial: people in 3D (`--people3d`)

`godot --path packages/godot -- --demo=farm --people3d` draws the players as chibi figures put together from the
KayKit Adventurers parts (`scripts/figure_3d.gd`), dressed in the character creator's look: the head by hair style
(short: Knight, long: Mage, curly and ponytail: Rogue, bald: Barbarian, whose beard takes the hair colour), the body
by the kind of shirt (plain, armour, mantle with cape, fur), skirt or trousers, and the hat by its kind (helmet,
pointed hat, fur hood; other hats are not shown). The pack's textures are one 8 × 4 grid of gradient swatches, so a
look repaints the skin, hair, cloth, trouser and boot swatches with the colours of the creator's palettes and of the
items' pixel layers (`LookComposer.colours_for()`), keeping their shading. In a dungeon the figure wears the class's
hat and shirt. Off by default. The figures show the fight too: a white or red flash laid over their meshes
(`material_overlay`), a lunge, the Throw animation on a swing (the pack's basic rigs have no melee swing) and
Interact on a tool, Hit_A when hit, a blue tint when frozen (inside the ice block), grey when fallen (Death_A), and
the web. Villagers wear figures too; animals and monsters: see "Creatures in 3D".

### Creatures in 3D (`--people3d`)

The flag means 3D bodies for people and creatures. Without it nothing changes; vehicles (`bus`, `car`, `train`,
`motorcycle`) stay billboards. Every other animal and monster has one of two bodies, and the billboard stays the
fallback for a creature with no sheet (the placeholder), so this can grow piece by piece.

- **Voxel bodies** (`scripts/voxel_body.gd`, `assets/shaders/voxel_body.gdshader`) for everything without a figure: each
  frame of the creature's own sheet becomes a mesh of cubes, one per opaque pixel (`pixel` 16 px = 1 m, so a 20 × 14
  wolf is 1.25 × 0.9 m, as big as its billboard; bosses are bigger sprites). The depth is a pillow: on each row the
  opaque span gives a half-depth that follows a circle over the span (`DEPTH_K`), on each column likewise, and the
  body is as deep as the shallower of the two and never deeper than `DEPTH_MAX` pixels, so a wide row under a narrow
  one is not a ledge. Faces between boxes are only emitted where the neighbour is shorter; the colour is the pixel's
  (stored linear; the shader undoes the Compatibility renderer's second sRGB conversion with `vcol_fix` as the props
  do), but the dark outline pixels keep their colour on the front and back only: the faces that stand out (top, sides,
  underside) take the colour of the body behind them, else every creature seen from above wears a black cap. The mesh
  stands on the feet row, centred, facing +x. One mesh per (sheet, frame) is built once and shared by every actor of
  that sheet; each actor has its own `ShaderMaterial` with a flash, a tint and a night-lift uniform. All the sheets of
  the atlas work, so babies, winter hats, tame and colour variants need nothing extra; the 44 mobs have `mob_<id>`
  sheets since `pnpm godot:sprites` exports every entry of `SAGA_MOBS` and `SAGA_BOSSES`.
- **How it behaves** (`Actor.set_voxel`): walking swaps the two frames at the billboard's 6 fps; standing shows frame 0
  with a slow breath (height ±2 %). The sprites face right, so the body yaws to face right or left (a mirror by yaw,
  not by scale) and turns 35° further toward a walk up or down the screen, so a creature walking away still shows its
  side. The hit flash is the material's flash uniform (white, or the spell's colour); the lunge moves the mesh; fallen
  rolls the body onto its flank, grey, feet where it stood; frozen and webbed are the same ice block and threads as the
  billboards'; the night lift is the actor's `night_lift` through the material.
- **The undead** (`scripts/skeleton_figure.gd`, `assets/kaykit_skeletons`, KayKit Skeletons, CC0) are rigged figures
  through `set_figure` with the pack's animations: `skelett` the Warrior (sword and small shield, 1.45 m), `gravvaktare` the Warrior at 2.5 m, `draugkung` the Rogue at 2.75 m (hood and cape tinted purple `#6a3a8a`, green eyes `#9cff8a`), `vandrardraug` and `sjodraug`
  the Minion tinted brown and sea green, `gengangare` the Minion at 40 % opacity. `gravrotta` (a rat) and `draugbage` (a
  beetle) stay voxel. Idle, the pack's Walking_D_Skeletons, an attack animation per weapon on the swing, Hit_A on the
  flash and Death_A when fallen. The Skeletons' texture is not the Adventurers' swatch grid (its swatches are bone,
  cloth, metal and leather), so a creature's colour is the material's albedo over the texture, not a swatch repaint.
  Only the Warrior's file keeps the pack's 95 animations; the Rogue's and the Minion's are stripped with
  `tools/strip_glb_animations.py` (4.8 MB to 0.3 MB) and play the Warrior's.
- **Pictures** (all with `--people3d`): `docs/creatures-farm.png`, `docs/creatures-fight.png`,
  `docs/creatures-forest.png`. Look: a creature that is mostly one thin row (the wolf) reads worse than a body (cow, bear,
  hen, slime); the pillow is a trial, `DEPTH_K`, `DEPTH_MAX` and `COLUMN_K` in `voxel_body.gd` are its knobs.

## Palette

Twelve named colours taken from the existing pixel art (`packages/art/src`). Imported 3D packs are tinted to
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
the crypt's grey-green while the atlas's shading survives. The tint per dungeon look is one row of the `LOOKS` table in
`dungeon_look.gd` (M6a; keyed by the dungeon id, with the `wall` index 0–8 kept for the zones of a run), and the rule for a new pack is the same: never edit the texture, tint the
material, one tint per dungeon look. Emissive parts (flames, runes, glow) take their colour from the palette directly.

## What is generated and why

Where a pack the sandbox could reach had nothing (the Kenney kits answered 403 on 2026-11-01), the prop is made in
code: urn, gate, wall caps (`scripts/dungeon_props.gd`, listed in `LICENSES.md`). They use only palette colours and
simple shapes so they sit next to the KayKit models without clashing. The coffins, bones and rest shrine are KayKit
Halloween Bits (`assets/kaykit_halloween/`), tinted like the Dungeon models; the generated ones are only drawn when
that pack is missing. On the farm, KayKit Halloween Bits and Furniture Bits replace the dead trees, pumpkins, lamps
and lanterns and the farmhouse's bed, table, chairs, sofa, plant and painting, baked like the Hexagon models. KayKit Forest gives the oaks and apple trees (its greens become foliage by colour, mode "forest"); the Kenney Nature
Kit gives the palms, bushes, grass, flowers and mushrooms; its leaf and grass materials become the palette's greens
and carry the foliage mask, so the season and the wind still act on them (recolour mode "leaf" in `_baked()`).
`ASSET_MAP.md` lists a pack model for each prop that is still generated.

## Sprites from the drawn-in-code art (packages/art)

`tools/export-sprites.mts` renders the game's drawn-in-code pixel art (the source is `packages/art/src`; the Vite build
for it is `packages/art/vite.config.ts`) to sheets with Playwright's Chromium, once, and
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
  facing right, at the size `SAGA_ANIMAL_SIZE` gives them, outlined as `drawAnimal` outlines them. M6a: the creatures of
  Draugkryptan, Frostjättens borg, Surts smedja and Helheim (21, with the ice block a freeze leaves); `pnpm godot:sprites`
  takes the dungeon ids as its argument (`draug,frost,surt,hel,dvarg,orm,alv,fenrir,loke` by default) and `speciesOf` in `tools/sprites-page.ts` lists
  what each one needs, so a later dungeon is one more id. No new pixel art was drawn: all of it is in `packages/art/src/sagaanimals.ts`.
  M6b added the 15 creatures (and the web: 16 sheets) of Svartalfheims gruvor (gruvtroll, guldbagge, stengolem, jarnvakten, fafner), Havsormens tempel
  (sjodraug, jattekrabba, manet, blackis, jormungand) and Alvernas lund (skuggalv, jattespindel, svampvakt, spindeldrottning,
  nattmara; plus the web a spider's freeze leaves, `spindelnat`): 37 sheets in all. Again nothing was drawn, and the sheets
  already exported are byte for byte the same (the icon sheet too: the new dungeons' loot has pictures already). The new
  looks (`dungeon_look.gd`) tint KayKit stone as before: amber for the mine, sea-teal for the temple, violet for the grove;
  the three new drifting airs (dust, bubbles, spores) are particles drawn in code with the engine's glow texture.
  M6c added the last two dungeons' creatures: Fenrisklyftan (ulv, rimtroll, bergsjatte, skoll, fenrisulven) and Bifrost
  (lokesskugga and loke; its packs are the skeleton, ice wolf, fire hound and ghost of the earlier chapters), plus four
  `mob_<species>_v1.png` sheets (skelett, isvarg, eldhund, gengangare): Loke's illusions, which the server sends as
  `variant: 1` and which the art draws ghostly and see-through (`ghostify` in `sagaanimals.ts`; `export-sprites` adds a
  `_v1` sheet for every non-boss creature of a dungeon with `illusions: true`, and `Data.mob_sheet(species, variant)`
  picks it). 7 + 4 = 11 new sheets (44 creature sheets in all, the web and the ice block included, and 4 ghost ones). Again
  nothing was drawn and the earlier sheets are byte for byte the same. Looks: steel-blue rock under pale storm lanterns
  for the chasm, pearly violet glass under rose-gold ones for the bridge; the two new airs (`gale`, `stars`) are particles
  like the others.
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
| Weather particles in dungeons (`weather`; a third of it falls, a quarter drifts as motes) | 150 | 600 | 1500 |
| Weather particles outdoors (`sky_weather`: rain, snow, hail; the atmosphere pass) | 150 | 900 | 2000 |
| Screen grade (one full-screen pass, outdoors only: dungeons are not graded) | on | on | on |

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

`godot --path packages/godot -- --bench --scene=farm` (or `forest`, `house`, `village`, or `draug` for the crypt's fight), the sandbox's
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

### Measured (M4c): the farmhouse and Köpingen

`--bench --scene=house` (the farm with the hero walking to and fro inside the farmhouse's room) and `--scene=village` (Köpingen
with the Völvan and the Kämpastenen), both with `--time=0.9` (night, when the lamps and windows are lit), then `--scene=farm` the
same way for comparison. This time the sandbox could only offer the Compatibility renderer on Mesa's llvmpipe under Xvfb (its
Vulkan has no surface extension), so the farm row differs from the M4a table above; the three rows below were measured together
and compare with each other. Counts are exact, GPU ms are software:

| Scene (night) · preset | draw calls | primitives | lights (in reach) | render CPU ms |
| --- | --- | --- | --- | --- |
| Farm · Låg | 88 | 31 723 | 7 (0) | 21.3 |
| Farm · Mellan | 118 | 81 446 | 7 (0) | 50.5 |
| Farm · Hög | 119 | 134 327 | 7 (0) | 63.8 |
| House · Låg | 88 | 31 737 | 7 (3) | 21.0 |
| House · Mellan | 118 | 76 921 | 7 (3) | 50.8 |
| House · Hög | 119 | 129 313 | 7 (3) | 66.4 |
| Village · Låg | 79 | 19 155 | 21 (6) | 22.0 |
| Village · Mellan | 110 | 60 341 | 21 (6) | 55.6 |
| Village · Hög | 130 | 137 524 | 21 (6) | 64.6 |

The room adds two lights to the farm (a warm one over it and a cool one at the back wall for the window, on the lamps' night
switch), 3 of the farm's 7 are in reach from inside. The village has 21 lights in all (fourteen street lamps, the shop, the
pizzeria and the station, the runestone and the Kämpastenen) but the street lamps fade out 12 m (plus 4) from the camera, so at
most 6 are in reach at once, under the crypt's 7, and its draw calls stay under the farm's on Låg and Mellan and under the crypt's
on every preset. The windows are rows of `Button`s built when a window opens or my record changes, so nothing is allocated per
frame; the camera's move into the room is one `Transform3D` a frame while it eases. (owner: paste the M4 Air's three lines for
`--scene=house` and `--scene=village` here: `(owner: paste here)`.)

## The alive world (M7a)

No assets were added (nothing bought, nothing downloaded): the wind, the water and the ambient things are shaders
(`assets/shaders/farm_prop`, `farm_water`, `farm_water_fx`, `ambient_*.gdshader`) and one script (`ambient_view.gd`);
the chimney spots were read from the highest vertices of the KayKit meshes already here. Presets (`quality.gd`):

| | Låg | Mellan | Hög |
| --- | --- | --- | --- |
| Wind | level 1: the old crown sway | 2: gusts, grass, crops, bushes, pines | 3: + leaf flutter |
| Water | flat, no screen read | waves, foam, reflection (16 steps) | + crest foam, reflection (28 steps) |
| Fireflies · butterflies · leaves | 0 · 0 · 0 | 28 · 9 · 36 | 56 · 16 · 80 |
| Smoke (per chimney) · mist · window light | 0 · 0 · 0 | 7 · 9 · pools | 12 · 18 · flickering pools |

The mist is also what fog weather draws (`ambient_view.gd`: the eased fog strength fades it in at three times the dawn's opacity,
in the sky's own colour), so Låg, which builds no mist, has the depth fog only. The window-light pools are the atmosphere pass's
warm colour (1, 0.66, 0.35) and come on with the lamps (`dark` 0.35 to 0.75).

## The living world's sound and wildlife (M7b)

Sounds are the project's own (CC0): `assets/audio/*.wav` made by `tools/make-audio.py` from noise and sines (licence and
file list in `assets/LICENSES.md`). One shader (`ambient_sparrow.gdshader`) draws the sparrows. Presets (`quality.gd`):

| | Låg | Mellan | Hög |
| --- | --- | --- | --- |
| Footsteps sounding at once | 3 | 6 | 10 |
| Ambience | the 3 loudest layers, no water or fire nearness, no owl | all layers, water and fire by nearness, the owl | the same |
| Sparrows | 0 | 6 | 12 |

The wild animals' startling is the server's (`shared/src/sim.ts` `tickStartle`) and the same on every preset.

### Measured (M7a)

Sandbox only (Mesa llvmpipe under Xvfb, 1280×720; frame times are software and mean little, so read them as before/after
ratios). `apt-get update && apt-get install mesa-vulkan-drivers` gives the sandbox a Vulkan driver (lavapipe), so Forward+
runs there; without it Godot falls back to Compatibility (OpenGL), which is what every earlier sandbox bench used. Both are
below. "Before" is main at the start of this work, run interleaved with "after". Average frame ms (1 % low in brackets):

| Compatibility (OpenGL, llvmpipe) | before | after |
| --- | --- | --- |
| Farm Låg (3 runs each) | 19.7 | 20.1 (+1.7 %) |
| Village Låg (2 runs each) | 18.8 | 18.7 |
| Farm Mellan, as a player sees it today (autumn day: leaves, smoke) | 44.8 | 46.0 (+2.7 %) |
| Village Mellan, natural | 41.0 | 41.4 |
| Farm Hög, natural | 55.6 | 57.7 |
| Village Hög, natural | 53.5 | 50.9 (noise) |
| Farm Mellan, everything on (`--alive=all`, night, summer) | 44.7 | 49.5 (+11 %) |
| Village Mellan, everything on | 43.7 | 45.9 (+5 %) |
| Farm Hög, everything on | 53.9 | 63.5 (+18 %) |
| Village Hög, everything on | 54.7 | 60.4 (+10 %) |

Forward+ (lavapipe), where the swapchain quantises Hög to 133 ms so only Låg and Mellan say anything: Farm Låg 52.7 → 51.4,
Village Låg 48.4 → 48.3, Farm Mellan natural 104.8 → 109.1, Village Mellan natural 97.8 → 96.9, Farm Mellan everything on
104.9 → 109.4, Village Mellan everything on 97.5 → 102.8. Draw calls rise by 2–7 (the ambient MultiMeshes, one each), primitives
by under 1 % (an unrelated rise on Hög in the village is the same ±1 %), Låg's draw calls and primitives are unchanged.

### Measured after merging the atmosphere pass, the art pass and creatures in 3D with M7a and M7b

`--bench=<preset> --scene=farm`, 1280×720, sandbox only (software GL under Xvfb: compare rows, not absolute numbers). "main" is
origin/main at M7b (670df30), "merged" is this branch. Average frame ms; Låg is the mean of two runs:

| Farm, Compatibility (OpenGL) | main | merged | primitives main → merged |
| --- | --- | --- | --- |
| Låg | 30.0 | 52.3 | 34 000 → 93 400 |
| Mellan | 67.2 | 102.2 | 86 700 → 244 000 |
| Hög | 81.4 | 120.2 | 141 200 → 304 700 |
| Farm, Forward+ (lavapipe) | main | merged | |
| Låg | 75.8 | 105.3 | 34 100 → 95 000 |
| Mellan | 133.5 | 133.3 | 89 400 → 250 300 |

Draw calls are the same (91 → 92 on Låg). **Låg is slower than main's, and it is the art pass's models, not the atmosphere pass:**
the branch before the merge (5a259fb) already draws 91 000 primitives on Låg and 45.7 ms; the pack trees, bushes and grass
(KayKit Forest, Kenney Nature Kit) have three times the triangles of the generated meshes they replaced. The merge itself adds
about 2 ms on Låg (M7a's wind at level 1 is the old sway; the grade is one pass). On Forward+ the Mellan frame is capped by the
swapchain in lavapipe, so it reads equal. Mellan pays the one full-screen grade pass on top of M7a's budgets.

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


## Atmosphere (2026-11-06)
**Merged with M7a ("The alive world", below).** Where both built the same thing M7a's stays and ours is struck through: ~~fireflies~~, ~~chimney smoke~~, ~~autumn leaves~~, ~~dawn mist and the eight fog banks~~ (fog weather drives M7a's mist with a higher alpha), ~~the pond at night~~, ~~the window beams~~ (M7a's window-light pools, in our warmer colour and on our lamp ramp), our old wind sway (M7a's wind). Kept: the light, the grade, the lamp pools, the lantern, rain/splash/puddles/snow/hail/cloud shadows, dew. The screen grade is on for every preset and is the one full-screen pass; Mellan and Hög pay it on top of M7a's budgets.
The look of the day is the browser's, made in three layers. **The light** (`day_night.gd`): the `DAY` table's colour is the ambient light, the sun, the moon and the fog colour at once, so grass goes dark blue-teal at night and the dusk is a dusty violet; sun shadows are soft (`light_angular_distance`, `shadow_blur`) and about a quarter darker than lit ground. **The grade** (`screen_grade.gd` / `screen_grade.gdshader`, one full-screen pass on every preset, under the HUD): the browser's warm grade, a little more colour than the render (never less, even in fog), a multiply toward saturated navy at night that keeps lamps warm, a vignette that closes in with the dark, and the double flash of lightning. Indoors and in dungeons: warm and vignette, no night tint. **Light you can see**: lamps are 6-9 m OmniLights from the browser's colours with a ground pool (`light_pool.gdshader`, an additive flat quad: this is what shows on Låg), switched on from `dark` 0.35 to 0.75; the farmhouse's gable window, the shops and the station put a pool of warm light on the ground in front of them (M7a's window light, `window_light` in the presets); the hero carries a lantern (OmniLight, 5.5 m, no shadow) outdoors after dark. Glow (Mellan, Hög) opens up with the dark; Låg's haze quads stand in.
- **Weather.** Rain: slanted streaks (the budget in a storm, half of it in rain and hail), splash rings on the ground, puddles in the ground shader (`puddle`, filled in rain, drying over ~40 s, mirror the sky colour), cooler grade. Fog: depth fog plus M7a's mist at a higher alpha (the fog banks are gone). Snow: big soft flakes and small sharp ones that drift sideways. Hail: short, bright, fast. Cloud shadows (`cloud`): faint in sun, big and slow when cloudy, on props as well as the ground.
- **Extras.** ~~Fireflies, chimney smoke, the pond taking the night sky, autumn leaves~~ (M7a's), dew sparkles on the morning grass (ours).
- **Presets.** Låg: the grade, lamps' ground pools, the extras that are quads; no OmniLight shadows, no glow, no cloud shadows, weather particles at 150. Mellan: glow, SSAO, sun shadows (1024), weather 900. Hög: adds torch shadows, SDFGI, volumetric fog, 2048 sun shadows, weather 2000.
- **Pictures.** `--daylapse=<s>` runs a whole day in that many seconds (demo only); `--weathers=sun,rain,fog` with `--weather-every=<s>` steps the weather. `tools/sky-sweep.sh` renders a series of `--time` values.

## Runs (M5c)
All generated in code with the farm's mesh builder (`run_meshes.gd`, `zone_props.gd`), in the palette above; nothing new is imported except one more use of the
KayKit Hexagon blacksmith.
- **Färdport** (3 × 2): two carved pillars with rune bands, a curved lintel of ten blocks, a gold keystone with a leaf, roots, steps, a dark doorway; a teal glow
  quad in the doorway and one light that is on at night only (the farm's lamp rule); the zone's exit rune has its glow on every preset and its light on Mellan and Hög.
- **Yggdrasil shoot**, stage 0-4 by `variant`: mound and stones with two leaves; sapling; young tree; big tree with blossoms; the Världsträd with a gold trunk, cyan runes,
  teal-gold crowns and gold motes, one glow billboard and one night-only light (stage 4 only).
- **Smithy** (KayKit blacksmith, fitted to 3 × 2, an anvil and coals in front, a night-only ember light), **herb garden** (2 × 2: four raised beds, drying rack), **longhouse**
  (4 × 3: timber walls, turf roof, dragon heads, shields, door; windows glow at night).
- **Zone decor** (22 kinds: gravestone, skull pile, ghost light, dead tree, mine cart, gold pile, dwarf statue, mine lamp, coral, anchor, seaweed, pearl, glow mushroom,
  elf statue, ice crystal, frozen pillar, snow drift, anvil, brazier, lava crack, fairy light, cobweb): primitive meshes, one shared vertex-colour material. Lights:
  `ZoneProps.LIGHTS`, none on Låg (the glow billboards stay). The zone floor is flat coloured quads (grass `#5f9a44`, mud, gravel, sand, moss, snow, ash).
- **Zone weather**: fog density by kind in every preset; particles (rain 0.02 × 0.55 m streaks, snow flakes, hail, dust) only on Mellan and Hög, `weather` budget / 3, none on Låg.
- Everything in a window (cards, summary, HUD clock) is Control nodes: no frame cost beyond the HUD's.
