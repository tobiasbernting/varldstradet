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
| Kenney Nature Kit | Kenney | CC0 1.0 | https://kenney.nl/assets/nature-kit | None yet: nothing outdoors is drawn in M3a. |
| Quaternius Stylized Nature MegaKit | Quaternius | CC0 1.0 | https://quaternius.com/packs/stylizednaturemegakit.html | None yet: nothing outdoors is drawn in M3a. |

## Generated for this project (no third-party licence)

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
`packages/client/src/art` (the family's characters and the saga's creatures); they are this project's own work, like
the browser game. `sprites/icons.png` also holds emoji glyphs drawn by the build sandbox's Chromium with Noto Color
Emoji (SIL Open Font License 1.1, Google), the same glyphs the browser game shows through the device's own font. `../icon.svg` is a placeholder drawn for this project.

## Not assets

`sv.json` is generated from `packages/shared/src/sv.ts` (`pnpm godot:strings`), `game.json` from the shared game data
(`pnpm godot:data`), and `fixtures/draug.json` from the shared dungeon generator (`pnpm godot:fixture`).
