# Licences for everything under `packages/godot/assets`

Every asset that is not drawn or written for this project gets a row here before it is committed (PLAN.md, section 5,
and the owner's decision of 2026-11-01: free CC0 packs only, nothing is bought for M3). Only the files the project
actually uses are committed; `tools/fetch-assets.sh` fetches the whole packs for anyone who wants more of them.

## Packs

| Pack | Author | Licence | Source | Files used |
| --- | --- | --- | --- | --- |
| KayKit Dungeon Remastered 1.0 | Kay Lousberg (kaylousberg.com) | CC0 1.0 Universal (`kaykit/LICENSE.txt`) | https://kaylousberg.itch.io/kaykit-dungeon-remastered (name your price, 0 allowed) and https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered (same files, `addons/kaykit_dungeon_remastered/Assets/gltf`) | `kaykit/wall_half.gltf.glb` (wall faces), `kaykit/floor_tile_small.gltf.glb`, `kaykit/floor_tile_small_broken_A.gltf.glb`, `kaykit/floor_tile_small_weeds_A.gltf.glb` (floor), `kaykit/floor_tile_small_decorated.gltf.glb` (boss floor and `saga_plate`), `kaykit/torch_mounted.gltf.glb` (`saga_torch`), `kaykit/stairs.gltf.glb` (`saga_exit`), `kaykit/chest.glb` and `kaykit/chest_gold.glb` (`saga_chest`), `kaykit/candle_triple.gltf.glb` (`saga_candles`). Each glb embeds the pack's 1024² gradient atlas `dungeon_texture.png`; Godot's importer writes it beside each model as `kaykit/<model>_dungeon_texture.png`, so those files are the pack's texture too. |
| KayKit Halloween Bits 1.0 | Kay Lousberg (kaylousberg.com) | CC0 1.0 (`kaykit_halloween/LICENSE.txt`) | https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0 (`addons/kaykit_halloween_bits/Assets/gltf`, unchanged) | Used: `coffin`, `coffin_decorated` (`saga_coffin`), `skull`, `bone_A–C`, `ribcage` (`saga_bones`), `shrine`, `shrine_candles` (`saga_rest`), `tree_dead_large/medium/small` (`dead_tree`, `saga_deadtree`), `pumpkin_orange` (`wild_pumpkin`), `pumpkin_orange_jackolantern` (`pumpkin_lantern`), `post_lantern` (`lamp`; Köpingen's `street_lamp` is generated, `scripts/village_meshes.gd`), `lantern_standing` (`lantern`), and for the landmarks `arch` (Månporten), `lantern_hanging`, `gravestone`. Each is a `.gltf` with its `.bin`, all sharing `halloweenbits_texture.png`. |
| KayKit Furniture Bits 1.0 | Kay Lousberg (kaylousberg.com) | CC0 1.0 (`kaykit_furniture/LICENSE.txt`) | https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0 (`addons/kaykit_furniture_bits/Assets/gltf`, unchanged) | Used: `bed_single_A` (`bed`), `table_small` (`table`), `chair_A_wood` (`chair`), `couch_pillows` (`sofa`), `cactus_medium_A` (`plant`), `pictureframe_large_A` (`painting`). Each is a `.gltf` with its `.bin`, all sharing `furniturebits_texture.png`. |
| Kenney Graveyard Kit | Kenney (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/graveyard-kit | None: kenney.nl answers 403 from the build sandbox, and KayKit Halloween Bits now covers the coffins and bones. |
| Kenney Mini Dungeon | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-dungeon | None yet (same reason). |
| Kenney Castle Kit 2.0 | Kenney (kenney.nl) | CC0 1.0 (`kenney_castle/License.txt`) | https://kenney.nl/assets/castle-kit. kenney.nl answered 403 from the build sandbox, so the files are from the GitHub mirror https://github.com/Evolis-Work/kenney-castle-kit (`Models/GLB format`, the pack unchanged). | `kenney_castle/tree-large.glb`, `tree-small.glb` (the pines), `rocks-large.glb`, `rocks-small.glb` (rocks). Also imported, for the wild maps and the dungeons' places: `tree-trunk.glb`, `tree-log.glb`, `wall-narrow-wood-fence.glb`, `wall-narrow-wood.glb`, `wall-doorway.glb`, `gate.glb`, `tower-square-arch.glb`, `flag.glb`, `flag-pennant.glb`, `stairs-stone.glb`, `metal-gate.glb`. Every model uses the pack's palette strip `kenney_castle/Textures/colormap.png`. |
| KayKit Medieval Hexagon Pack 1.0 | Kay Lousberg (kaylousberg.com) | CC0 1.0 (`kaykit_hex/LICENSE.txt`) | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack (`addons/kaykit_medieval_hexagon_pack/Assets/gltf`, the red buildings and the props, unchanged; the same author's Medieval Builder Pack is not on GitHub and itch.io refuses the sandbox). | `kaykit_hex/building_home_A_red` (the farmhouse), `building_well_red`, `building_grain` (the barn), `building_tavern_red` (the stall; Köpingen's shops and tavern are generated timber houses now, `scripts/village_meshes.gd`), and unused but imported: `building_home_B_red` (it was Köpingen's cottage), `building_market_red`, `building_windmill_red`, `building_church_red`, `building_blacksmith_red`, `building_lumbermill_red`; `barrel`, `crate_*`, `bucket_*`, `sack`, `wheelbarrow`, `tent`, `resource_*`, `pallet`, `flag_red`, `weaponrack`, `rock_single_A–E`, `tree_single_A_cut`, `tree_single_B_cut`, `waterlily_A`, `waterplant_A`, `fence_wood_straight*`, `fence_stone_straight*` (each a `.gltf` with its `.bin`), all sharing one `hexagons_medieval.png`. |
| Quaternius Stylized Nature MegaKit | Quaternius | CC0 1.0 | https://quaternius.com/packs/stylizednaturemegakit.html | None: the download is behind Patreon/itch with no stable link the sandbox can reach. The Kenney Nature Kit covers the trees, bushes and grass instead. |
| KayKit Forest Nature Pack 1.0 (free tier) | Kay Lousberg (kaylousberg.com) | CC0 1.0 (`kaykit_forest/License.txt`) | https://kaylousberg.itch.io/kaykit-forest (downloaded by the owner and uploaded; `Assets/gltf`, unchanged) | `kaykit_forest/Tree_1_A`, `Tree_2_A`, `Tree_3_A` (`tree`, `jungle_tree`), `Tree_1_B` and `Tree_3_B` with generated apples (`tree_apple`), each `_Color1.gltf` with its `.bin`, sharing `forest_texture.png`. Its greens are marked as foliage by colour (recolour mode "forest"). |
| KayKit Adventurers 2.0 (free tier) | Kay Lousberg (kaylousberg.com) | CC0 1.0 (`kaykit_adventurers/License.txt`) | https://kaylousberg.itch.io/kaykit-adventurers (downloaded by the owner and uploaded; `Characters/gltf` and `Animations/gltf/Rig_Medium`, unchanged) | Only for the `--people3d` trial: `kaykit_adventurers/Barbarian`, `Knight`, `Mage`, `Rogue`, whose parts (heads, bodies, arms, legs, helmet, pointed hat, bear hood, cape) `scripts/figure_3d.gd` puts together and recolours per player; each `.glb` has its texture inside (Godot writes it beside the model as `<Model>_<texture>.png`), and the shared animations `Rig_Medium_General.glb` (idle, death) and `Rig_Medium_MovementBasic.glb` (walk). |
| KayKit Character Pack: Skeletons 1.0 | Kay Lousberg (kaylousberg.com) | CC0 1.0 (`kaykit_skeletons/License.txt`) | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 (`tools/fetch-assets.sh`; `Characters/gltf` and `Assets/gltf`) | Only for the `--people3d` trial: `kaykit_skeletons/Skeleton_Warrior.glb` (unchanged, with the pack's 95 animations), `Skeleton_Rogue.glb` and `Skeleton_Minion.glb` (the same files with the animations removed by `tools/strip_glb_animations.py`, 4.8 MB to 0.3 MB each), `Skeleton_Blade` and `Skeleton_Shield_Small_A` (`.gltf` + `.bin`, unchanged) and `skeleton_texture.png`: the crypt's undead (`scripts/skeleton_figure.gd`). The Mage is not used. |
| Kenney Nature Kit 2.1 | Kenney (kenney.nl) | CC0 1.0 (`kenney_nature/License.txt`) | https://kenney.nl/assets/nature-kit (downloaded by the owner and uploaded, since kenney.nl answers 403 from the sandbox; `Models/GLTF format`, unchanged) | `kenney_nature/tree_palmTall` (`palm`), `plant_bushDetailed`, `plant_bushLarge`, `plant_bush` (`bush`, and with generated berries `blueberry_bush`, `cloudberry`, `iceberry`), `grass`, `grass_large`, `grass_leafs` (`grass_tuft`), `flower_redA`, `flower_yellowA`, `flower_purpleA` (`flower` 0, 1, 3, `wild_flower_mid`, `jungle_flower`), `mushroom_red` (`mushroom`, `glowshroom`, `mushroom_lamp`), `plant_flatTall` (`fern`), `cactus_tall` (`cactus`), `cliff_cave_rock` (`cave`, `cave_mouth`), `cliff_large_rock` and `cliff_rock` (the faces of the rock walls) and `rock_tallB`, `rock_tallE`, `rock_largeC` (boulders at their foot); and for the landmarks (`scripts/landmark_models.gd`): `stone_tallA`, `stone_tallC`, `stone_largeA`, `statue_block`, `statue_column`, `statue_head`, `rock_largeA`, `rock_tallA`, `cliff_large_rock`, `cliff_waterfall_rock`, `bridge_wood`, `log`, `campfire_logs`, `canoe`, `tent_detailedOpen`, `hanging_moss`, `mushroom_redTall`, `mushroom_tanTall`, `lily_large`, `lily_small`. Each `.glb` is coloured by its materials (no texture); the leaves and grass are marked as foliage by material name. |

## Code that is shipped with the game but not committed

| Component | Author | Licence | Source | Use |
| --- | --- | --- | --- | --- |
| webrtc-native 1.2.2-stable (GDExtension, `addons/webrtc/`) | The Godot Foundation and contributors | MIT (`LICENSE.webrtc-native`); it ships libdatachannel and libjuice (MPL-2.0), libsrtp and usrsctp (BSD), mbedtls (Apache-2.0) and plog (MIT), each with its `LICENSE.*` file in the addon folder | https://github.com/godotengine/webrtc-native/releases/tag/1.2.2-stable, asset `godot-extension-webrtc_native.zip` (sha256 `98e9446921740d995bd9ca1be48798dc3c2ceed51e044a25ce18b3cff11f56e5`), fetched by `tools/fetch-webrtc.sh`, not committed | Röstprat (`scripts/voice.gd`): the WebRTC implementation behind Godot's `WebRTCPeerConnection`. The licence files travel inside the addon folder into every export. |

## Generated for this project (no third-party licence)

**Sounds (M7b): `audio/*.wav`, 34 files, 4 MB.** Nothing recorded, nothing downloaded: every sound is synthesized from noise
and sine waves by `tools/make-audio.py` (Python + numpy, fixed seed, so running it again gives the same files; the script is
the source and the files are its output). They are the author's own work for this project and released as **CC0 1.0**,
like the packs above. Loops: `wind_soft`, `wind_hard`, `rain`, `rain_roof`, `birds`, `crickets`, `frogs`, `water`, `surf`,
`fire`, `murmur`; one-shots: `owl_1`, `owl_2`, and three variants of `step_<ground>` for grass, dirt, stone, wood, sand,
snow and water. (The dungeons' own sounds are still the code-made ones of `scripts/sfx.gd`.)

The farm's generated props (`scripts/farm_assets.gd`, built with `scripts/farm_mesh.gd`, coloured from the palette in `ART.md`) are listed at the end of this section.

Made in code at runtime by `scripts/dungeon_props.gd` (SurfaceTool / primitive meshes, coloured from the palette in
`ART.md`), because no free pack the sandbox could reach had them. They are placeholders in the sense that a pack model
may replace them later; they are complete enough to ship.

| Object kind | What is generated | Why |
| --- | --- | --- |
| `saga_wall` cap | A dark box filling each wall tile behind the KayKit wall faces | KayKit walls are thin panels; the dungeon's walls are whole tiles. |
| `saga_gate` | An iron frame with four bars per tile | KayKit's `wall_gated` is 4 units wide and does not fit a 1-tile gate without squashing. |
| `saga_urn` | A revolved clay profile | No urn in any pack the sandbox reached. |
| `saga_rest`, `saga_coffin`, `saga_bones` (fallbacks only) | A runestone, a stone coffin, bone capsules | Drawn only if the KayKit Halloween models are missing. |
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
| `tree_apple`, `blueberry_bush`, `cloudberry`, `iceberry` (the fruit only) | Red apples and coloured berries set on the outside of the Nature Kit crowns and bushes. |
| `flower` variant 2 (white), `reed`, `shell`, `dig_spot` | Small blobs, blades and petals (the kit has no white flower or reed). |
| crops (7 kinds × seedling, growing, ripe) | Blades with the produce showing when ripe (carrot root, strawberry, tomato, pumpkin, sunflower head, wheat ear). |
| `fence`, `gate` | A post and rails towards each neighbouring fence (16 shapes). |
| `mailbox` (Gårdsbutik), `sellbox`, `wardrobe`, `chest`, `workbench`, `trough`, `bench`, `flowerbox`, `scarecrow`, `bus_stop`, `torch`, `wisp` | Boxes and posts in wood, iron and cloth, with a glow where the object lights up. |
| `coop`, `hutch`, `sheepfold`, `pigsty` | A gabled shed on its footprint. |
| `cave`, `cave_mouth`, `saga_portal` | A rock mouth; the dungeon's arch: two pillars, a lintel with a rune band and a glowing doorway in the dungeon's torch colour. |
| `wall_wood`, `wall_stone`, `door`, `window`, `rug`, `bookshelf`, `clock`, `stove` (the bed, table, chairs, sofa, plant and painting are KayKit Furniture Bits) | The farmhouse's room, in boxes. |
| any other kind | A lilac box on the object's footprint and one warning in the log. |

## M5c additions
No new third-party files. `kaykit_hex/building_blacksmith_red.gltf` (KayKit Medieval Hexagon Pack, CC0, already imported in M4c) is now drawn as the smithy. The färdport,
the Yggdrasil shoot, the herb garden, the longhouse, the smithy's anvil and coals and the 22 zone decor props are generated meshes (`scripts/run_meshes.gd`,
`scripts/zone_props.gd`); they are the project's own.


## Köpingen's Viking look (2026-11-07)
No new third-party files. The timber buildings, the Vägvisare, the lantern post, the Diligens stop, the hand carts and the cobbled
ground are generated in code (`scripts/village_meshes.gd`, `scripts/farm_view.gd`), and the cart, the riding horse, Diligensen and
the mine train are the project's own pixel art (`packages/art/src/animals.ts`) exported to `sprites/animal_car*.png`,
`animal_motorcycle*.png`, `animal_bus*.png` and `animal_train*.png` by `pnpm godot:sprites` and extruded into bodies at run time
(`scripts/voxel_body.gd`); they are this project's own work, like the browser game. The Halloween pack's `post_lantern` is no longer
used for the street lamps (it still lights the farm's lamp posts); the Hexagon pack's `building_home_B_red` and `building_tavern_red`,
which Köpingen's houses and shops used, are no longer used there.
