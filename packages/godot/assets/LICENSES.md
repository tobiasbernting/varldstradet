# Licences for everything under `packages/godot/assets`

Every asset that is not drawn or written for this project gets a row here before it is committed (PLAN.md, section 5,
and the owner's decision of 2026-11-01: free CC0 packs only, nothing is bought for M3). Only the files the project
actually uses are committed; `tools/fetch-assets.sh` fetches the whole packs for anyone who wants more of them.

## Packs

| Pack | Author | Licence | Source | Files used |
| --- | --- | --- | --- | --- |
| KayKit Dungeon Remastered 1.0 | Kay Lousberg (kaylousberg.com) | CC0 1.0 Universal (`kaykit/LICENSE.txt`) | https://kaylousberg.itch.io/kaykit-dungeon-remastered (name your price, 0 allowed) and https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered (same files, `addons/kaykit_dungeon_remastered/Assets/gltf`) | `kaykit/wall_half.gltf.glb` (wall faces), `kaykit/floor_tile_small.gltf.glb`, `kaykit/floor_tile_small_broken_A.gltf.glb`, `kaykit/floor_tile_small_weeds_A.gltf.glb` (floor), `kaykit/floor_tile_small_decorated.gltf.glb` (boss floor and `saga_plate`), `kaykit/torch_mounted.gltf.glb` (`saga_torch`), `kaykit/stairs.gltf.glb` (`saga_exit`), `kaykit/chest.glb` and `kaykit/chest_gold.glb` (`saga_chest`), `kaykit/candle_triple.gltf.glb` (`saga_candles`). Each glb embeds the pack's 1024² gradient atlas `dungeon_texture.png`; Godot's importer writes it beside each model as `kaykit/<model>_dungeon_texture.png`, so those files are the pack's texture too. |
| Kenney Graveyard Kit | Kenney (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/graveyard-kit | **None yet.** kenney.nl answered 403 from the build sandbox on 2026-11-01, so the coffin, bones and urn are generated meshes (below). `tools/fetch-assets.sh` downloads the kit; swapping the generated meshes for its gravestones, coffins and urns is listed as a follow-up in ART.md. |
| Kenney Mini Dungeon | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-dungeon | None yet (same reason). |
| Kenney Castle Kit 2.0 | Kenney (kenney.nl) | CC0 1.0 (`kenney_castle/License.txt`) | https://kenney.nl/assets/castle-kit. kenney.nl answered 403 from the build sandbox, so the files are from the GitHub mirror https://github.com/Evolis-Work/kenney-castle-kit (`Models/GLB format`, the pack unchanged). | `kenney_castle/tree-large.glb`, `tree-small.glb` (the pines), `rocks-large.glb`, `rocks-small.glb` (rocks). Also imported, for the wild maps and the dungeons' places: `tree-trunk.glb`, `tree-log.glb`, `wall-narrow-wood-fence.glb`, `wall-narrow-wood.glb`, `wall-doorway.glb`, `gate.glb`, `tower-square-arch.glb`, `flag.glb`, `flag-pennant.glb`, `stairs-stone.glb`, `metal-gate.glb`. Every model uses the pack's palette strip `kenney_castle/Textures/colormap.png`. |
| KayKit Medieval Hexagon Pack 1.0 | Kay Lousberg (kaylousberg.com) | CC0 1.0 (`kaykit_hex/LICENSE.txt`) | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack (`addons/kaykit_medieval_hexagon_pack/Assets/gltf`, the red buildings and the props, unchanged; the same author's Medieval Builder Pack is not on GitHub and itch.io refuses the sandbox). | `kaykit_hex/building_home_A_red` (the farmhouse), `building_well_red`, `building_grain` (the barn), `building_tavern_red` (the stall), and unused so far but imported for the village: `building_home_B_red`, `building_market_red`, `building_windmill_red`, `building_church_red`, `building_blacksmith_red`, `building_lumbermill_red`; `barrel`, `crate_*`, `bucket_*`, `sack`, `wheelbarrow`, `tent`, `resource_*`, `pallet`, `flag_red`, `weaponrack`, `rock_single_A–E`, `tree_single_A_cut`, `tree_single_B_cut`, `waterlily_A`, `waterplant_A`, `fence_wood_straight*`, `fence_stone_straight*` (each a `.gltf` with its `.bin`), all sharing one `hexagons_medieval.png`. |
| Quaternius Stylized Nature MegaKit | Quaternius | CC0 1.0 | https://quaternius.com/packs/stylizednaturemegakit.html | None: the download is behind Patreon/itch with no stable link the sandbox can reach. The oaks, apple trees, bushes, flowers and tufts are generated (below). |
| Kenney Nature Kit | Kenney | CC0 1.0 | https://kenney.nl/assets/nature-kit | None (403 from the sandbox, no mirror found). |

## Generated for this project (no third-party licence)

The farm's generated props (`scripts/farm_assets.gd`, built with `scripts/farm_mesh.gd`, coloured from the palette in `ART.md`) are listed at the end of this section.

Made in code at runtime by `scripts/dungeon_props.gd` (SurfaceTool / primitive meshes, coloured from the palette in
`ART.md`), because no free pack the sandbox could reach had them. They are placeholders in the sense that a pack model
may replace them later; they are complete enough to ship.

| Object kind | What is generated | Why |
| --- | --- | --- |
| `saga_wall` cap | A dark box filling each wall tile behind the KayKit wall faces | KayKit walls are thin panels; the dungeon's walls are whole tiles. |
| `saga_gate` | An iron frame with four bars per tile | KayKit's `wall_gated` is 4 units wide and does not fit a 1-tile gate without squashing. |
| `saga_rest` | A tapered runestone with an emissive rune band (lit when `variant` is 1) | No rest stone in any pack. |
| `saga_coffin` | A tapered stone coffin with a lid | Not in KayKit Dungeon; Kenney Graveyard was unreachable. |
| `saga_bones` | Three bone capsules and a round skull, flat on the floor | Same. |
| `saga_urn` | A revolved clay profile | Same. |
| any other `saga_*` decor | A small box tinted with the dungeon's colour | Other dungeons' decor is not in M3a's scope; the generic path still shows something where the server put an object. |

## Drawn for this project

`sprites/*.png` and `sprites/atlas.json` are rendered by `tools/export-sprites.mts` from the game's own pixel art in
`packages/art/src` (the family's characters and the saga's creatures); they are this project's own work, like
the browser game. `sprites/icons.png` also holds emoji glyphs drawn by the build sandbox's Chromium with Noto Color
Emoji (SIL Open Font License 1.1, Google), the same glyphs the browser game shows through the device's own font. `../icon.svg` is a placeholder drawn for this project.

## Not assets

`sv.json` is generated from `packages/shared/src/sv.ts` (`pnpm godot:strings`), `game.json` from the shared game data
(`pnpm godot:data`), and `fixtures/draug.json` from the shared dungeon generator (`pnpm godot:fixture`).

### The farm and the wild maps (M4a)

Made in code at runtime by `scripts/farm_assets.gd`; flat-shaded low-poly meshes with vertex colours, so they sit next
to the Kenney and KayKit models. Placeholders in the sense that a pack model may replace any of them.

| Object kinds | What is generated |
| --- | --- |
| `tree`, `tree_apple`, `jungle_tree` | An oak: a tapered trunk and four jittered blobs of leaves (the apples red balls); the leaves take the season's colour. |
| `dead_tree`, `saga_deadtree`, `palm`, `cactus` | Bare branches on a trunk, a palm's fronds, a ribbed pillar. |
| `bush`, `blueberry_bush`, `cloudberry`, `iceberry`, `wild_pumpkin`, `grass_tuft`, `flower` (4 colours), `mushroom`, `fern`, `reed`, `shell`, `dig_spot` | Small blobs, blades and petals. |
| crops (7 kinds × seedling, growing, ripe) | Blades with the produce showing when ripe (carrot root, strawberry, tomato, pumpkin, sunflower head, wheat ear). |
| `fence`, `gate` | A post and rails towards each neighbouring fence (16 shapes). |
| `mailbox` (Gårdsbutik), `sellbox`, `wardrobe`, `chest`, `workbench`, `trough`, `bench`, `flowerbox`, `scarecrow`, `bus_stop`, `lamp`, `lantern`, `torch`, `wisp` | Boxes and posts in wood, iron and cloth, with a glow where the object lights up. |
| `coop`, `hutch`, `sheepfold`, `pigsty` | A gabled shed on its footprint. |
| `cave`, `cave_mouth`, `saga_portal` | A rock mouth; the dungeon's arch: two pillars, a lintel with a rune band and a glowing doorway in the dungeon's torch colour. |
| `wall_wood`, `wall_stone`, `door`, `window`, `rug`, `bed`, `table`, `chair`, `sofa`, `bookshelf`, `plant`, `painting`, `clock`, `stove` | The farmhouse's room, in boxes. |
| any other kind | A lilac box on the object's footprint and one warning in the log. |

## M5c additions
No new third-party files. `kaykit_hex/building_blacksmith_red.gltf` (KayKit Medieval Hexagon Pack, CC0, already imported in M4c) is now drawn as the smithy. The färdport,
the Yggdrasil shoot, the herb garden, the longhouse, the smithy's anvil and coals and the 22 zone decor props are generated meshes (`scripts/run_meshes.gd`,
`scripts/zone_props.gd`); they are the project's own.
