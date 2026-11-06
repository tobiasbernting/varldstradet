# Pack models for the generated props

Every object kind that `scripts/farm_assets.gd` and `scripts/dungeon_props.gd` currently build in code, with the
CC0 pack model that could replace it. Paths are relative to each pack's `Assets/gltf/` folder. All KayKit packs paint
with a gradient palette texture, so they can be baked to vertex colours with `_baked()` exactly like the Hexagon
models already are.

## The packs

| Short | Pack | Licence | Where | In `downloads/`? |
| --- | --- | --- | --- | --- |
| **FOR** | KayKit Forest Nature Pack (free tier; EXTRA $9.99 adds variants and terrain) | CC0 | https://kaylousberg.itch.io/kaykit-forest | No: itch.io only, download by hand |
| **FUR** | KayKit Furniture Bits 1.0 | CC0 | https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0 | Yes (`tools/fetch-assets.sh`) |
| **HAL** | KayKit Halloween Bits 1.0 | CC0 | https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0 | Yes |
| **RES** | KayKit Restaurant Bits 1.0 | CC0 | https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0 | Yes |
| **HEX** | KayKit Medieval Hexagon Pack (already used) | CC0 | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack | Yes |
| **DUN** | KayKit Dungeon Remastered (already used) | CC0 | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered | Yes |
| **KNA** | Kenney Nature Kit | CC0 | https://kenney.nl/assets/nature-kit | No: kenney.nl is blocked from the sandbox |
| **KCS** | Kenney City Kit (Suburban) | CC0 | https://kenney.nl/assets/city-kit-suburban | No: same |
| **KTR** | Kenney Train Kit | CC0 | https://kenney.nl/assets/train-kit | No: same |

The Forest pack's file names aren't listed here because the pack couldn't be downloaded from the sandbox. Choose the
files once you've downloaded it. Rows marked *(check)* name a Kenney model that should be in the kit but wasn't
opened here.

## Farm and wild maps (`farm_assets.gd`)

### Trees, plants and rocks

| Kind(s) | Replace with | Note |
| --- | --- | --- |
| `tree` (`oak_a/b/c`) | FOR: round deciduous trees (3 variants). For now: HEX `tree_single_A`, `tree_single_B` | Tag the leaf vertices as foliage so the season shader still recolours them. |
| `tree_apple` (`apple_a/b`) | FOR deciduous tree + the existing red apple balls | No pack has apple trees. |
| `tree_pine`, `tree_snow`, `xmas_tree` | Keep Kenney `tree-large`/`tree-small`, or FOR pines | HAL `tree_pine_*` are orange or yellow; avoid them. |
| `dead_tree` (`dead_a/b`), `saga_deadtree` | HAL `tree_dead_large`, `tree_dead_medium`, `tree_dead_small`; `tree_dead_large_decorated` for saga | |
| `stump` | Already HEX `tree_single_A_cut`; FOR stumps/logs too | |
| `bush` (`bush_a/b`), `blueberry_bush`, `cloudberry`, `iceberry`, `berry_*` | FOR bushes; keep the generated berries on top | |
| `grass_tuft` (`tuft_a/b/c`), `wild_flower_mid`, `flower`, `jungle_flower` | FOR grass clusters (it ships an unshaded version for wind shaders) | Flowers: FOR if the pack has them, otherwise keep the generated ones. |
| `fern` | FOR, or KNA plants *(check)* | |
| `reed` | HEX `waterplant_A`, `waterplant_B`, `waterplant_C` | |
| `palm`, `jungle_tree`, `cactus` | KNA palm and cactus models *(check)* | FUR `cactus_*` are potted, so only for indoors. |
| `mushroom`, `glowshroom`, `mushroom_lamp` | KNA mushrooms *(check)*; keep the glow | |
| `rock*`, `boulder` | Already Kenney/HEX; FOR rocks for more variety | |
| `pumpkin`, `wild_pumpkin` | HAL `pumpkin_orange`, `pumpkin_orange_small`, `pumpkin_yellow_small` | |
| `pumpkin_lantern` | HAL `pumpkin_orange_jackolantern` | |
| `shell`, `wisp`, `dig`/`dig_spot` | Keep generated; `dig_spot` could be HAL `floor_dirt_small` | |

### Crops (seedling, growing, ripe)

| Kind | Replace with |
| --- | --- |
| `pumpa` (ripe) | HAL `pumpkin_orange` |
| `morot`, `potatis`, `tomat` (ripe produce) | RES `food_ingredient_carrot`, `food_ingredient_potato`, `food_ingredient_tomato` set on the generated leaves |
| `vete`, `solros`, `jordgubbe` | KNA crop models *(check)*; otherwise keep generated |

### Farm objects

| Kind(s) | Replace with |
| --- | --- |
| `fence`, `gate` (16 shapes) | HAL `fence_pillar` at the post + `fence_seperate` per neighbour, `fence_gate`. Or HEX `fence_wood_straight(_gate)` (already in `assets/`) |
| `chest`, `start_chest`, `loot_chest` | DUN `chest`, `chest_gold` (already in `assets/kaykit/`) |
| `barrel_stack` | DUN `barrel_small_stack` |
| `sellbox` | HEX `crate_open` or DUN `box_small_decorated` |
| `sellstall`, `sell_stall` | HEX `building_market_red` (already used for `market`) |
| `wardrobe` | FUR `cabinet_medium_decorated` |
| `workbench` | DUN `table_medium` + RES `cuttingboard` |
| `bench`, `start_bench` | HAL `bench` (`bench_decorated`) |
| `trough` | Keep generated, or HEX `bucket_water` beside it |
| `hay_cart` | HEX `wheelbarrow` |
| `lamp`, `street_lamp` | HAL `post_lantern`, `lantern_standing` |
| `lantern` | HAL `lantern_hanging` |
| `torch` | DUN `torch_lit` / `torch_mounted` |
| `banner_pole` | HEX `flag_red`, DUN `banner_thin_red` |
| `town_well`, `well` | HEX `building_well_red` (already used) |
| `mailbox`, `scarecrow`, `flowerbox`, `maypole`, `snowman`, `crystal_lamp` | No good pack match. Keep generated |
| `coop`, `hutch`, `sheepfold`, `pigsty` | No good KayKit match. Kenney Survival or Farm kits, or keep generated |

### The farmhouse's room

| Kind | Replace with |
| --- | --- |
| `bed` | FUR `bed_single_A` (or `bed_double_A`) |
| `table` | FUR `table_medium` |
| `chair` | FUR `chair_A_wood` |
| `sofa` | FUR `couch_pillows` |
| `bookshelf` | FUR `shelf_B_large_decorated` |
| `plant`, `houseplant` | FUR `cactus_small_A`, `cactus_medium_A` |
| `painting` | FUR `pictureframe_large_A` |
| `rug` | FUR `rug_rectangle_stripes_A` |
| `door_mat` | FUR `rug_oval_A` (scaled down) |
| `stove` | RES `stove_single` or `oven` |
| `wall_wood`, `wall_stone` | RES `wall`, DUN `wall` |
| `door`, `door_out` | RES `wall_doorway` + `door_A` |
| `window` | RES `wall_window_open` / `wall_window_closed` |
| `clock` | No match. Keep generated |

### Caves, arches and town buildings

| Kind(s) | Replace with |
| --- | --- |
| `saga_portal`, `cave_mouth` | HAL `crypt` |
| `arch` | HAL `arch` / `arch_gate` |
| `cave` | HEX `mountain_A` / `mountain_B` + the generated mouth |
| `runestone`, `saga_stone`, `kampasten` | HAL `gravestone`, `shrine`, `plaque` |
| `house_small` | HEX `building_home_B_red` |
| `shop`, `pizzeria`, `apartment`, `bathhouse` | HEX `building_tavern_red`, `building_church_red`; for a modern town, KCS |
| `station`, `train_station` | KTR station *(check)* |
| `bus_stop`, `traffic_light`, `parked_car` | KCS *(check)* |

## The crypt (`dungeon_props.gd`)

| Kind | Replace with |
| --- | --- |
| `saga_coffin` | HAL `coffin`, `coffin_decorated` |
| `saga_bones` | HAL `bone_A`, `bone_B`, `bone_C`, `skull`, `ribcage` |
| `saga_urn` | RES `jar_A_large` (recoloured to clay) |
| `saga_rest` | HAL `shrine_candles` (keep the emissive rune band) |
| `saga_wall` cap | DUN `wall` (a whole tile) instead of `wall_half` + box |
| `saga_gate` | HAL `fence_gate` / `arch_gate` scaled to 1 tile, or keep the bars |
| other `saga_*` decor | DUN `barrel_large`, `crates_stacked`, `column`, `rubble_half`, `banner_*`, `candle_lit`, `skull_candle` (HAL), `post_skull` (HAL) |
