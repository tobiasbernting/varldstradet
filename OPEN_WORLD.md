# OPEN_WORLD.md: one open world instead of a grid of maps

Design only, written 2026-11-07 (child session `session_01KTh22qn3ovGnFU1ZFT6n5e`, branch `claude/open-world-design`). No code
changed. It answers the owner's decision of the same day: *the world should be one open world; it does not have to be that big
(the farm, Köpingen and the nearby wild maps as one continuous map, on the order of 3×3 of today's maps) and the world beyond
stays reachable; dungeons, run zones, house interiors and the bath house stay separate places entered through doors.* A second
owner decision arrived while this was being written: **no save is ported** (see section 4: it is a new game, a fresh world).

## 0. The recommendation in ten lines

1. **Midgård**: one continuous map of 3×3 *regions* of 96×96 tiles = **288×288 tiles** (82 944; today's 3×3 is about 57 000).
   The farm is the middle region, Köpingen the one east of it, today's neighbours around them (section 1).
2. **Option A′, "one flat map, chunked at the edges"**: the simulation keeps *one* `WorldState` for Midgård (the sim already
   handles a map of any size; 288² costs about 2 MiB and under 1 ms a tick, measured), but it is **stored, sent and drawn in
   32×32 chunks** (section 2). A fully chunked world (B) is not needed at this size and costs ten times the work.
3. **Interest management** is the real work: a client gets only the chunks and the animals within about 48 tiles of its hero.
   Measured today: four players in four maps cost 80 KB/s each; a naive one-map broadcast would cost 118 KB/s each; A′ costs about 16 KB/s each.
4. **Generation reuses the twelve painters** unchanged in what they paint; only their *edges* change (no ring of trees, no 6-tile
   gap) and a stitching pass joins the seams. The farm's and Köpingen's handmade 64×64 plans are stamped in at an origin.
5. **Area keys survive as names, not as separate maps**: players in Midgård keep `area: 'farm'` (a legacy name for the
   continent), and the 9 regions keep the keys `a:ax,ay` as *region names* for achievements, the world map and fast travel.
6. **The far world** (everything outside the 3×3: ice, desert, volcano, space base, the other six dungeon arches) stays as
   today's grid of separate 96² maps, `a:x,y`, entered through **12 rim gates** or by bus, train and rocket. Unchanged code.
7. **Instanced places stay instanced** (`saga:*`, run zones, caves `g:*`, `bath:*`, the moon); the farmhouse's inside moves out
   of the farm map into one (`house:farm`) so the continent has no walled room hidden in a corner.
8. **Fresh start**: a new schema step, a world-format guard, `db:reset` for developers. About 1 300 lines of compatibility code
   can go in a later cleanup (section 4).
9. **Eight small PRs** (section 5). The owner can walk the whole continent after PR 4 (before streaming exists), and play it
   with streaming after PR 6. **The riskiest step is the interest-managed wire and client streaming (PR 5 and 6)**; it is
   de-risked by a replica oracle test in Node, a flag, and a "load everything" client path that ships first.
10. Fourteen open questions for the owner are in section 6, each with a recommended answer.

## 1. Goal and scope

### 1.1 What becomes continuous

| Today | Open world |
| --- | --- |
| The farm `farm` (64²), Köpingen `a:1,0` (64²) and seven wild maps `a:-1..1,-1..1` (96²), joined by 6-tile openings in the middle of each edge (`EDGE_GAP`, `arrivalTile`, `{t:'travel', dir}`) | **Midgård**: the same nine places as nine regions of one 288×288 map. Walking from the farm to Köpingen, the forest or the swamp is just walking. |
| `biomeAt(ax, ay)` picks a biome per map | `biomeAt(ax, ay)` still picks it per **region**; `biomeOf(world, tx, ty)` (new) looks the region up from a tile. |

Layout, north up, tile coordinates of the map (`x→`, `y↓`); the region keys are today's area keys, so **nothing about what is
next to what changes** (`NEAR_HOME` in `biomes.ts` stays):

```
x→     0           96          192         288
y 0   ┌───────────┬───────────┬───────────┐
      │ a:-1,-1   │ a:0,-1    │ a:1,-1    │   skog / skog / svamp
      │ skog      │ skog      │ svamp     │   Draugkryptan's arch (NW), Alvernas lund's (NE)
  96  ├───────────┼───────────┼───────────┤
      │ a:-1,0    │ 'farm'    │ a:1,0     │   träsk / HEMMA / KÖPINGEN
      │ träsk     │  (0,0)    │ by        │   Helheim's arch (W)
 192  ├───────────┼───────────┼───────────┤
      │ a:-1,1    │ a:0,1     │ a:1,1     │   äng / äng / dino
      │ äng       │ äng       │ dino      │
 288  └───────────┴───────────┴───────────┘
        12 rim gates: 3 on each side, in the middle of each outer region's outward side
```

* **The farm** is the 64×64 handmade plan (`generateWorld`) stamped into the middle of region (0,0) at tile origin
  **(112,112)** (16 tiles of wild all round). `SPAWN` (15,11) becomes (127,123); the cave mouth (57,12) becomes (169,124); the
  farm bus stop (61,29) becomes (173,141). The plan keeps its own ring of trees and its four 6-tile gates: the farm sits in a
  clearing of its own, as today, and the family can chop through.
* **Köpingen** is the 64×64 plan (`buildCity`) stamped into region (1,0) at origin **(208,112)**. Both plans are 64 tall and
  placed on the same rows, so the farm's east gate (about 174,144) and the town's west gate (about 209,144) are on the **same row**: the
  34 tiles between them become the main road (about 8 s on foot at `PLAYER_SPEED` 64 px/s = 4 tiles/s). The Kämpasten
  (47,29) becomes (255,141); the town's bus stop (37,35) becomes (245,147).
* **The seven wild regions** are `generateArea(ax, ay)` as today: same biome, same painter, same per-region seed
  (`hash(ax, ay, worldSeed)`), 96². Their content is the same as today's maps for the same coordinates except at the edges.
* **Crossing times** (computed): the continent is 72 s edge to edge on foot, 40 s on horseback (`RIDE_SPEED_MUL` 1.8); the
  farmhouse to Draugkryptan's arch is about 130 tiles, 33 s. "Does not have to be that big" holds: this is a minute, not an expedition.
* **What the camera sees** (computed from `CAMERA_OFFSET (0,10,8)`, `fov 40` in `world.gd`; 1 tile = 1 Godot unit): about
  27 tiles wide and 14 deep on 16:9 (35 wide on 21:9). This is the number that sizes everything below: a 32-tile chunk is
  already bigger than the whole picture, and there is no horizon to fill, so **no far LOD is needed**.

### 1.2 What stays instanced, and how you get in

| Place | Key | Entered through | Change |
| --- | --- | --- | --- |
| Dungeons (nine) | `saga:<id>` | the stone arch (`saga_portal`) | none; the arch's position becomes a Midgård tile for the three in the core |
| Run zones, the färdport | `saga:run…` | the färdport on the farm | none; `fardportOf(farm)` finds it by kind |
| Caves out in the world | `g:<map>#<id>` | the cave mouth object | `<map>` is `farm` for Midgård's mouths (the continent) or `a:x,y` for the far world |
| The farm's monster cave | `dungeon` | the cave object | none |
| Bath house | `bath:<village>` | the bath house door | none |
| **Farmhouse inside** | `house:farm` (new) | the farmhouse door | moves out of the farm map (see 3.4) |
| The moon | `moon` | the rocket | none (the space base is in the far world) |

### 1.3 How the far world is reached

Everything with `|ax| ≥ 2` or `|ay| ≥ 2` stays exactly as today: separate 96² maps keyed `a:x,y`, generated on demand,
saved in the `areas` table, painted with rings and gaps. Midgård's **rim** is the outward side of its eight border regions;
those sides keep the painters' ring and the existing 6-tile opening in the middle, so there are **12 rim gates** (3 per side)
and they are *today's openings, unchanged*. `travel()` keeps its rule (stand in the gap at the edge, send `{t:'travel', dir}`)
but only at a rim gate, and the arrival maps both ways: leaving through the east gate of region (1,0) lands you in
`a:2,0`'s west opening; walking back east from `a:2,0` lands you at Midgård tile (286,144). Buses, trains and the rocket
work as today. Six of the nine dungeon arches (`frost`, `fenrir` at `a:0,-2`; `dvarg` `a:2,0`; `orm` `a:-2,0`; `surt`
`a:2,2`; `loke` `a:1,3`) are in the far world; the three in the core are `draug` (`a:-1,-1`), `alv` (`a:1,-1`), `hel` (`a:-1,0`).
(Question 3 asks whether to bring all nine into Midgård.)

### 1.4 The world serves the runs

Owner decision (relayed 2026-11-07): *the game's focus is the runs in the dungeons.* Midgård is therefore the **home and hub
between runs**, not the main content, and is kept modest on purpose (288², one minute across, ~2 MiB on the server, ~16 KB/s
per client; no PR asks for more). What in it directly serves a run:

* **Quick to the entrance.** The färdport is on the farm plan (about 30 tiles from the farmhouse door). The three core
  arches are 130 tiles (33 s) or less away, and the world map's fast travel (PR 7) goes to any discovered arch front, so the
  walk is a choice, never a chore. Runs and dungeons stay instanced (`saga:*`); nothing here changes them. The runs v2 design
  (GAME2.md, branch `claude/runs-v2-design`) needs from this document only that the färdport and the arches remain objects with
  a world tile (`fardportOf`, `portalWorld`), which they do.
* **Preparing:** farm, crops, animals, cooking for färdkost, the smithy, herb garden and longhouse, the shop and Smed-Stina all
  stay in one walkable place (farm plan and Köpingen, 34 tiles apart).
* **Gathering** for färdkost and crafting: the seven wild regions around the farm hold the materials (landmark caches, renewable
  berries, ore, fish, dig spots) within 1–2 minutes' walk; the far world is optional.
* **Meeting the family:** one shared map, `jump` to a friend, and nobody is ever in a different "map" than their neighbour.
* **Scope consequence:** the far world (12 rim gates) is the first thing to cut if the runs want the effort elsewhere; it is
  unchanged code and costs nothing to leave alone (Q4).

Growing Midgård later (5×5 regions, say) is a change of two constants (`CONTINENT = {rw, rh}`) and moves the rim, because a flat
map of up to about 512×512 is still small in memory (projected 5–25 MB, section 2.3). That is a reason for the flat design, not an obligation.

## 2. Options compared

Measured on this sandbox (Node 22, one core; `tsx` scripts in the session scratchpad, method at the end of the table), with the
repository at `6163557`. "Projected" is arithmetic from those numbers.

### 2.1 The options

* **(a) One big stored map.** `farm` becomes 288×288 and everything lives in it as one record (terrain row, objects,
  crops, animals); the whole map goes to every client at the welcome and is saved as one thing.
* **(b) A chunked world.** Fixed 32×32 chunks, each stored, loaded, ticked and streamed independently; today's maps become
  chunk *content* (a 96² map is 3×3 chunks). Entities belong to a chunk and move between chunks.
* **(c) A mosaic of today's maps.** Keep every region a separate `WorldState` (`a:x,y`), make their edges open, preload the
  neighbours on the client, and hand a player over when they cross a seam. Every sim query near a seam then asks two to four maps.
* **(d) A fully procedural infinite world** (global noise, objects derived from the seed). Out of scope: the painters, the
  landmark placement and `connect()`'s guarantees all need a finite map to reason about.
* **(A′, recommended) One flat map in memory, chunked on the disk, on the wire and on the client.** The sim sees one
  `WorldState` (as in (a)); a *router* decides who is told what by chunk (as in (b)); the database stores terrain in chunk
  rows; the client builds and frees draw chunks around the camera.

### 2.2 The comparison

| | (a) one big map | (b) chunked world | (c) mosaic | **(A′) flat map, chunked at the edges** |
| --- | --- | --- | --- | --- |
| **Server memory** | ~2 MiB for 288² (measured 0.19 MiB per 96² map, 25 maps = 4.9 MiB heap) | same data, plus per-chunk bookkeeping and loaded/unloaded lifecycle | same as today (9 maps) | same as (a) |
| **Server CPU per tick** (budget 50 ms) | one tick over ~190 wild + farm animals ≈ 0.5 ms (measured 0.44 ms for 179 animals in 7 occupied maps) | ticks only loaded chunks: ≤ (a), but chunk hand-offs cost | ≈ today, 0.4–0.6 ms | ≈ (a), plus the router: O(changes × clients), clients ≤ 8 |
| **Snapshot bandwidth, 4 players far apart** (one `state`, 10 Hz) | **no culling: ~190 animals × 62 B ≈ 12 KB = 118 KB/s per client**, 470 KB/s out | chunk subscription: ~1.6 KB = 16 KB/s per client | today's behaviour: 8.0 KB measured = 80 KB/s per client, 320 KB/s out | **~1.6 KB = 16 KB/s per client**, 64 KB/s out |
| **Join cost** | one `welcome` of ~1.8 MiB (the eight regions measured 1.68 MiB, the farm 0.12); fine under the 8 MiB buffer but 4 s on 4 Mbit/s | 9 chunks ≈ 150–220 KB | today: 130 KB welcome + 110–270 KB per map entered | **welcome ~5 KB + 9 chunks ≈ 150–220 KB**; a chunk border costs 3 chunks ≈ 50 KB |
| **Save format, DB** | one `world` row with a ~660 KiB terrain jsonb rewritten at every dirty flush, or one 1.5–2 MiB `areas` row; **~2 MiB/s while someone hoes** | chunk rows: 1 KiB terrain, objects/crops per row (already) | today: whole-map jsonb per dirty area, avg 210 KiB, every dirty flush; `markMoving` marks every occupied area dirty every 15 s (4 players ≈ 55 KB/s idle) | **chunk rows**: hoeing writes one 1 KiB row; objects and crops already have rows; wild animals are not saved |
| **Client draw cost** (Låg, integrated graphics) | `FarmView.build` of the whole map: ~6.5 ms per 16² chunk (farm 106 ms) ⇒ **~2.1 s freeze** for 288², one node tree for 18 000 objects | streams | streams, but two maps drawn at once near seams | **streams**: one draw chunk per frame, ≤ 25 loaded; draw calls are view-bounded (see 2.3) |
| **Generation, determinism** | painters reused (stitch pass); deterministic per region seed | **painters cannot make one chunk**: each needs its whole 96² region and `connect()` runs on all of it; so per-chunk generation is a rewrite | unchanged (painters as they are) but seams are unpainted or hand-patched | painters reused; the continent is generated **once** and stored; a seed regenerates it identically (test) |
| **Sim complexity** | lowest: `sim.ts` already takes any `mapW`/`mapH` | highest: 3×4 footprints (`landmark`, `house`) cross chunk edges, animals and mobs hand over, pathing and line of sight cross chunks | high and permanent: every spatial rule (lasso, startle, aggro, pets, vehicles, placement, A*) has a seam case | low: like (a); the new code is in the router, the store and the client |
| **Failure mode** | a slow join, a heavy save | desync bugs at every chunk edge | seam bugs forever | a replica that diverges from the server (testable: 5.2) |

**Method.** Sizes: JSON of `generateWorld()` and `generateArea(ax,ay)` for the ring of eight maps. Heap: 25 `generateArea` maps with
`--expose-gc`. Tick: `Game.tick(50)` ×400 with seven players online in seven wild maps. Snapshot: a real `Game` with four
connected fake links and `broadcastState()` (`players 4, animals 98, npcs 3` → 8 006 B). Composition: nine regions glued in a
288² array (548 ms to generate the eight painted regions and stamp the farm; 18 406 objects; a 32² chunk has 9 to 472, median 252
objects). Client: Godot 4.7.2 headless/Xvfb on a 2.1 GHz Xeon with llvmpipe, so **frame times are meaningless, counts are not**:
`--bench=lag` draws 92 / 83 / 80 draw calls and 129 / 122 / 151 objects on the farm, the forest and the village, with 1 506 / 2 321
/ 921 objects in the map: the picture is bounded by the view, not by the map. Not measured: the MacBook (not available to a
cloud session), a Postgres write rate (extrapolated from row sizes), Låg on an Intel iGPU.

### 2.3 Why A′

* **(a) alone is cheap on the server and wrong on the wire and the disk.** The sim does not care about 288² (0.5 ms), but
  broadcasting 190 animals to everyone is 7× the bandwidth of the per-chunk design, and a 2 MiB row rewritten every second
  while farming is a bad habit. Both are fixed by *routing and chunk rows*, which is the part of (b) worth having.
* **(b) buys nothing at this size and costs the most.** Its benefit is unbounded worlds; Midgård is 83 000 tiles. Its cost
  is re-expressing every spatial rule in `sim.ts`, `sagasim.ts`, `runsim.ts` (128 `p.area` sites, 48 `.areas` uses, 22
  `getArea` calls) in chunk terms, and it still cannot generate a chunk alone (the painters need a whole region).
* **(c) is a permanent tax**: lasso, startle, aggro, vehicles, pets, line of sight and placement all need a second map near a seam.
* **A′ keeps (a)'s sim and gets (b)'s runtime properties.** And it leaves the way to (b) open: nothing in the router, the chunk
  rows or the client stream assumes the sim's map is finite, so if the owner ever wants an endless world, only the sim's
  backing store changes.
* **Memory ceiling.** One flat map stays comfortable up to about 512×512 (projected 5–25 MB from the 0.19 MiB per 96² map
  measured, and a tick of about 2 ms with ~800 animals), well past a 5×5 Midgård (480²).

## 3. What changes

### 3.1 Protocol

Every `Change` is already an **absolute record** (`object` carries the whole object or `null`, `terrain` the new terrain, `crop` the
whole crop, `animal` the whole animal). That makes interest management safe: replaying a change after the chunk that already
contains its effect is harmless.

| Today | Open world |
| --- | --- |
| `hello {playerId}` | `hello {playerId, caps?: ['chunks']}`. A client without the capability gets the whole of Midgård in the `welcome` (the load-everything path, used by PR 4 and by old test clients). |
| `welcome {world: whole farm, biomes}` (130 KB) | `world` is **meta only** (day, time, quests, weather, `w/h`, the region table `{ax,ay→biome}`, `sagaBest`, players, the tile `palette`), plus `overview` (72×72 bytes, one per 4×4 tiles, for the minimap and world map, 5 KB) and `explored` (base64 bitmask, 36×36 cells of 8 tiles = 162 B). |
| `areaData {key, world}` on entering a map | still used for the far world, caves, dungeons, `house:*`. **New:** `chunk {cx, cy, terrain (base64 palette bytes, 1 KiB), objects, crops, drops}` and `chunkGone {cx, cy}` for Midgård. |
| `state` lists every player, every animal of every occupied map, every villager | players: **all** (id, x, y, facing, held; ~80 B each, the friends on the map and the voice list need them). `animals` and `npcs`: **only those within 48 tiles** of this client's hero. |
| `changes` go to everyone, filtered client-side by `area` | a **router** (new, `server/src/interest.ts`) sends a spatial change (`terrain`, `crop`, `object`, `animal`, `drop`, `fx`, `spell`, `hit`, …) only to clients whose chunk set contains its chunk; non-spatial ones (`day`, `quests`, `chat`, `toast`, `player`, `banner`, `run`) as today. |
| `animal`/`object` deletions are `{id, obj: null}` | a deletion carries the optional hint `x, y` (set by `removeObject`/the animal remover) so the router knows the chunk. |
| `travel {dir}` between any two maps | valid only at a **rim gate** (or inside a far-world map), as `travel()` already checks `inEdgeGap`. In Midgård there is nothing to ask for: you walk. |
| `teleport {to: areaKey}` to a visited map | `to` is a region key (`a:ax,ay` or `farm`; the server picks the open tile nearest the region's middle, as `openTileNear` does) **or** a waypoint `poi:<id>` (an arch front, a bus stop, the farm, the town square, a discovered landmark). Region keys stay the vocabulary of every map UI. |
| `jump {to: playerId}` | unchanged; the router subscribes you to the new place. |

**The interest set.** A client's *chunk set* is the 3×3 chunks (96×96 tiles, 9 chunks) around the chunk its hero is in, re-evaluated
when the hero moves more than 4 tiles inside a neighbouring chunk (hysteresis, so standing on a border does not flap). On a
change of set the server sends `chunk` for the new chunks (the chunk payload is built from the live world *at send time*, so
it contains every earlier change) and `chunkGone` for the dropped ones. The *entity set* is a circle of 48 tiles: per client the
server keeps `known.animals`; each snapshot it diffs "in range" against `known` and sends a full `animal` record before the
snapshot for new ones and `animal null` for ones that left. Animal ids are unique across Midgård (one `nextId`).

**Projected byte budgets** (tests assert them, section 5): ≤ 2.5 KB per `state` with 4 players spread out and 190 wild animals
(≈ 25 entities in range); ≤ 260 KB for a fresh join; ≤ 80 KB for crossing a chunk border.

### 3.2 Server and sim

| Area | Today | Open world |
| --- | --- | --- |
| **The world record** | `farm` is the root `WorldState` (players, day, quests, weather, `sagaBest`, `areas`, `dungeon`) and one 64² map | the same root, with the map grown to 288² (`w = h = 288`). `p.area === 'farm'` means "somewhere in Midgård" (a legacy name; renaming it to `'world'` is a mechanical last PR, Q12). `farm.areas` keeps the far world, caves, baths, dungeons. |
| **Area helpers** | `areaOf(farm, p)`, `getArea(farm, key)`, `placeIn(...)` | unchanged; `getArea('a:0,-1')` for a *core* region returns the root and `regionRect(key)` (new) gives its 96² rectangle; `placeIn(farm, p, 'a:1,0', tx, ty)` translates region-local to world tiles. |
| **Biome from position** | `world.biome` (40 uses in 17 files) | `biomeOf(world, tx, ty)` = region lookup (`Math.floor(tx / 96)`); the 40 uses become position-based where they mean "here" (spawn, loot `dig_<biome>`, landmarks, weather, sky, sound) and stay as they are for far-world maps. |
| **Plans with absolute coordinates** | `SPAWN`, `PORTALS`, `INTERIOR`/`inInterior` (12 uses), `FARM_BUS_STOP`, `ensureCave`'s (57,12); `city.ts`: `CITY_VX/HY`, `TRAIN_STATION`, `PIZZERIA`, `BATHHOUSE`, `BUS_STOP`, `LOOPS` (traffic corners), `isRoadTile`; `STONE_SPOT`, `VOLVA_SPOT`; the 8 villagers' `x, y` and routines in `NPCS`; each dungeon's `portal {area, x, y}` | one new module, `shared/src/plans.ts`, with `PLAN = { farm: {ox:112, oy:112}, by: {ox:208, oy:112} }` and `at(plan, x, y)`. **PR 2 does this with origin (0,0) first** (no behaviour change, tests unchanged), so the constant churn is reviewable apart from the continent. Köpingen's Viking-look branch changes art and, at most, building positions *inside the plan*; it must keep plan-local coordinates. |
| **Animals** | wild animals have no home; `homeCenter()` returns their *current* position, so a wander target is always near wherever they are (a bounded walk only because the map is closed) | **`AnimalState.anchor {x,y}`** set at spawn; wander targets are around the anchor (`LEASH` 7 tiles), so animals never drift across regions. `haunt` (the startle rule's return point) stays separate and temporary. |
| **Wild spawning and renewals** | `spawnWildAnimals(world, biome, rnd, restock)` for a whole map; `regrowAreas` loops `farm.areas`; `world.renew` per map | take a **rect** (`regionRect`) and the region's biome; `renew` is kept per region in `farm.regions[rk]`; the morning restock loops the 9 regions (cost: dozens of ms inside `newDay`, which already loops all `areas`). Not stored: wild animals are regenerated after a restart. |
| **Safe zones** | wild monsters "never appear in the town, on the farm" (a property of the map) | `safeRects` = the farm plan and the town plan: monsters and predators treat them as walls (`isSolidForAnimal` for `isHostile`), so a taunted monster does not follow you into Köpingen. |
| **Dormancy** | the farm ticks whenever anyone is online; other areas tick only when occupied | the same rule as a distance: animals farther than 64 tiles from every online player do not move (pets, vehicles and farm animals near their owners are exempt). Not for CPU (0.5 ms) but so the world does not drift while nobody looks. Crops and the day rollover are global. |
| **Villagers** | per-map: `npcsIn(world)` filters `NPCS` by `area` | all in Midgård; positions come from `plan` origins; `npcState` is one table; the snapshot includes only those within 48 tiles. Traffic yields to `walkers` in the **town region** only (`world.biome === 'by'` becomes `biomeOf(...)`). |
| **Weather** | one `WeatherState` for the world, translated per map by `localWeather(kind, biome)`; `rainOn(m)` loops every terrain tile of every map every 3 s | **one sky**, translated by the biome *at the player's position* (client: cross-fades particles and grade over 12 tiles at a region border). `rainOn` uses a `soil` index (the set of tilled tiles, kept by `setTerrain`) instead of a loop over 83 000 tiles. Independent weather cells per region are out of scope (Q10). |
| **Seasons, day length** | global (real calendar, `season.ts`); 10-minute days | unchanged |
| **Occupancy** | `Record<"x,y", id>` per map, rebuilt on load | unchanged for now (≈ 30 000 entries). A typed grid (`Int32Array(w*h)`) is a later optimisation (PR 8). |
| **Building and ownership** | anyone may build anywhere; `obj.by` ≠ you ⇒ only the builder may break it (`builtByOther`); farm rules are not map-specific | unchanged, plus **reserved tiles**: the 12 rim gates, the 12 seam roads (3 wide), arch fronts, the town plan and the stamped farm's own gates refuse building (`cantPlaceHere`); you can still break what is already there. Without this, a fence across a rim gate cuts off the far world. |
| **The startle rule** (`tickStartle`, M7b) | animals within `STARTLE_TILES` (4) of a *moving* hero on the same map bolt; they return to `haunt` | **no rule change**: the watchers list is "online players in Midgård", the distance test is the same. New tests: an animal that bolts out of a client's entity range is removed from that client's snapshot and comes back without a ghost; startle across a chunk border. |
| **Pets, mounts** | `movePetsAlong` when changing maps; `tickPet` teleports a pet that is > 7 tiles away | unchanged inside Midgård (nothing to move along); still used at rim gates, arches and `house:*`. |
| **Vehicles** | cart and horse ridable on any outdoor map (`canRideIn`) | now across regions; traffic stays on the town's loops. |
| **Landmarks, discovery** | `noticeLandmarks` scans one map's objects within 12 tiles; `prog.seen` keys are `<areaKey>:<landmarkId>` | scans a `landmarks` index (≤ 18 objects); `seen` keys use the **region key** (`a:-1,-1:<id>`), so two regions with the same biome show separate badges. `prog.discovered` (by kind id) and the achievements at 5/15/26 are unchanged. |
| **Achievements "areas" and "biomes"** | `bump(p,'areas')` on first entering a map; `discoverBiome` from `p.visited` | `visitRegion(p)` runs once a second with `noticeLandmarks`: the first tick a hero is in a new region adds it to `visited` and counts `areas` and the biome. Core regions are 9 (so "areas 5" is reachable from the core; "areas 15" needs the far world, as "biomes 15" does). |
| **Explored areas** | `p.visited: string[]` of area keys | `visited` stays (regions and far maps) and **`explored`**, a bitmask over 36×36 cells of 8 tiles (162 B in the player record), set by `visitRegion`'s sibling `markExplored` (the cell the hero stands in and its eight neighbours). The world map's fog is drawn from it. |
| **Runs, saga entry points** | `portal {area, x, y}` per dungeon, `ensureSagaPlaces(key, map)` per map; `archFront(world, id)` | `portalWorld(id)` returns `{key, tx, ty}` with the core regions translated to Midgård tiles; `ensureSagaPlaces` takes a rect. The färdport and the Yggdrasil shoot are objects of the farm plan; runs use `farmOf(world)` as now. |
| **The bus** (`transportDestinations`, `ride`) | stops in the farm and every city; destinations are visited city keys | stays as an instant ride with the same prices (5 kr/15 kr). Destinations: the farm stop, the town stop, visited far cities, one unknown city by train. Walking farm to Köpingen takes 8 s; the bus remains a convenience and a way to the far world. |
| **The parent page, access control** | no area logic | none; one optional addition in a later PR: show where each player is (region name) in the player list. |
| **Voice** | rooms by IP, not by place | none |
| **Jump to a friend** | `jumpTo` → `placeIn` near them | unchanged (the router subscribes you). |

**Tick order and size.** `tick()` stays the same sequence. `tickOtherAreas` keeps handling the far world; `tickAnimals(world)`
now covers Midgård's animals, filtered by the dormancy rule.

### 3.3 Generation and determinism

`generateContinent(seed)` (new, `shared/src/continent.ts`):

1. **Paint the eight wild/town regions** with today's `generateArea(ax, ay, seed)` but with `Painter.openSides` set for the
   sides that touch another region of Midgård. For an open side, `Painter.edge()` ignores it, `ring()` (painters.ts:17–29) skips it
   and `gap()` is false, so there is **no ring of trees and no 6-tile gate** on a seam; the trails the painters already lay from
   each opening to the hub still start at the middle of each side, so **two neighbouring regions' trails meet on the same
   tile** and the roads are continuous for free. Rim sides keep ring and gap (the 12 gates).
2. **The farm and Köpingen regions**: paint a margin (the farm's: the meadow/forest mix of its neighbours; Köpingen's:
   farmland), then stamp the handmade plan (terrain and objects, ids remapped) at `PLAN.*.o`, and put the färdport and the Yggdrasil shoot on the farm (what `ensureRunPlaces` does for a saved farm today).
3. **Stitch the seams** (a band of 8 tiles either side): the ground is dithered between the two sides with value noise
   (`BASE_GROUND` tiles only); `WALL_TERRAIN` (cliff, water, lava) within 6 tiles of a seam is kept only where a wall within 2
   tiles on the other side matches it, else it becomes the region's pass ground; objects that no longer stand on their own
   ground are dropped; where two regions' hubs are not connected after that, `cheapestPath` + `carve` (already in `worldgen.ts`) lay a road.
4. **Validate** (`checkContinent`, run in tests and when the server builds a fresh world): from the spawn, every region hub,
   every landmark front, every core dungeon arch front, every rim gate and both bus stops are reachable; no cliff
   ends on a seam; the farm and the town plans are byte-identical to `generateWorld()` and `buildCity()`.

Cost (measured pieces): the eight painted regions + the stamped farm took **548 ms** in a throwaway composition; a 96² painter
run is 60–120 ms, the town 9 ms. The continent is built **once**, when the database has no world, and stored; a seed
regenerates it identically (a test generates it twice and compares terrain and object lists). A glued continent with no
stitching has a single large walkable component (62 075 tiles in the largest, 770 pieces, all nine region middles in it)
but only **22 % of seam tiles are open on both sides**, a wall of trees every 96 tiles: precisely the "narrow path" the owner
dislikes, which is what steps 1 and 3 remove.

*Later, optional (PR 8):* give `Painter` a world offset so its noise is sampled in world coordinates, which lets cliffs and
rivers continue over seams instead of fading out. Most painters place blobs at random in-map positions, so this is partial and is not on the critical path.

### 3.4 Client

| File | Change |
| --- | --- |
| `net.gd` | send `caps`; handle `chunk`, `chunkGone`. The 8 MiB inbound buffer stays (a chunk is ≤ 60 KB; the load-everything welcome is ~1.8 MiB). |
| `world_model.gd` | keeps `farm` as the meta record and a `chunks: Dictionary[Vector2i → {terrain, objects, crops, drops}]`; `terrain_at(x,y)`, `object_at`, `world_for(key)` stay for the far world; `animal_snaps` and `npc_snaps` stop filtering by area for Midgård (the server already did); a `regions` table and `explored` for the map UIs; `_welcome` no longer holds the map. |
| `farm_view.gd` | `build(w, k)` stays for the far world and `house:*`. For Midgård a `ChunkStream` (new class, same file or its own) calls the existing `_build_ground_chunk(ck)` and `_rebuild_chunk(ck, c)` (draw chunks are **already 16 tiles**, `CHUNK := 16`) per draw chunk as data chunks arrive, **one per frame**, nearest to the camera first, and frees chunks beyond 3 draw chunks (48 tiles) from the camera. Cliff and liquid tiles read their neighbours across chunk borders, so a chunk is rebuilt once its neighbour arrives. |
| `hero.gd` | client prediction collides against `world` terrain and objects; with chunks it reads `WorldModel.terrain_at/object_at`. It does not move into a tile of an unloaded chunk (the 3×3 window guarantees that never happens while connected; at the very first frame a "Laddar världen" veil holds the hero until the 9 chunks are in, ~200 KB). Edge travel is only at rim gates. |
| `world.gd` | `_rebuild()` for Midgård sets up the stream instead of `farm.build`; `_place_name` follows the hero's region; `sky.setup(self, biome, key)` becomes `sky.set_region(biome)` with a 12-tile cross-fade; `_sync_actors` works on the snapshot as sent. |
| `day_night.gd`, `ambient_view.gd`, `soundscape.gd`, `footsteps.gd` | take the biome from the hero's tile (they read `farm.biome()` today). |
| **Minimap and world map** (in flight, `claude/m9a-map-travel-arches`) | built from `overview` + `explored` + a list of POIs (arch fronts, bus stops, the farm, the town square, discovered landmarks, friends), fast travel by `teleport {to: 'poi:…'}` or region key. **What the owner of that branch should do now:** keep the UI data-driven through three `WorldModel` accessors (`map_regions()`, `waypoints()`, `explored()`) so PR 7 changes the data source and not the screens; region keys stay valid fast-travel targets. |
| **Camera** | unchanged (hero-following rig). At the rim, a `world_edge` backdrop (dark cliff and fog) beyond the last tile; the 12 gates stay visible as the openings they are. |
| **Quality** | Låg: stream radius 2 draw chunks (32 tiles), chunk budget 1/frame, no minimap animation; Mellan/Hög: radius 3. The draw cost is the same as today's single map (view-bounded, 80–92 draw calls measured on Låg); the new cost is the *burst* of building a chunk (6.5 ms measured on the slow CI Xeon; the M4 should be a third of that), spread over frames. Lights: today's maps have 4–21 each; streaming bounds the loaded ones to what the radius holds. |
| **Fixtures and demos** | `export-fixture.mts` records a 3×3-draw-chunk window around the farm and around Köpingen instead of the `farm`, `a:-1,-1`, `a:1,0` maps; the `--demo=farm|forest|village|house` scenes keep their names. `packages/godot/assets/fixtures` is regenerated (CI already diff-checks it). |

### 3.5 What happens to the existing systems, in one place

| System | Fate |
| --- | --- |
| Farm ownership (`obj.by`, `builtByOther`) | unchanged; plus reserved tiles (3.2) |
| The bus and train | unchanged prices; Midgård stops are an instant hop; far cities as before |
| Landmarks, discovery | positions and kinds unchanged; seen keys by region |
| "areas" and "biomes" achievements | counted on entering a region (core 9, then the far world) |
| Explored areas | `visited` (regions) + `explored` bitmask for the fog |
| Runs, the färdport, the Yggdrasil shoot | unchanged (they are objects on the farm plan; zones are `saga:run…`) |
| Dungeon arches | three in the core at translated tiles; six in the far world (Q3) |
| Parent page | unchanged |
| Caves out in the world | unchanged, keyed by the parent map (`farm` for Midgård) and entrance id |
| The monster cave `dungeon`, the moon, the rocket | unchanged |

## 4. Fresh start (replaces the migration section)

**Decision (the owner, via the orchestrator, 2026-11-07): no save is ported.** Världsträdet's v2 server has never been
deployed, the family keeps playing the browser game in lilla-garden, and a new world format is a clean break. There is no
converter, no dry run, no rollback path beyond "delete the dev database".

* **What is wiped:** the tables `world`, `objects`, `crops`, `animals`, `players`, `areas` (in a database that holds an old
  world). Kept: the access tables (`devices`, `invites`, `access_log`, the gate settings), so join codes made for the new server survive.
  Characters are made again in the creator (the new game starts empty).
* **How a developer resets:** the in-memory store (`DATABASE_URL=`) resets on every start. For a Postgres dev database: a new
  script `pnpm db:reset` (drops and recreates the world tables and applies the migrations), and `docker compose down -v` as today.
* **The guard:** migration `0005_open_world` creates `chunks (cx int, cy int, v smallint, data bytea, updated_at timestamptz,
  primary key (cx, cy))`, drops `world.terrain`, and writes `settings('world_format') = 'open1'` on a fresh database. `PgStore.load()`
  refuses to boot a database that has a `world` row and no `world_format = 'open1'` unless the server is started with
  `RESET_WORLD=1` (then it truncates the world tables and builds Midgård). A forgotten old database fails loudly instead of
  loading a grid world into the new code.
* **The far world's saved maps** keep the `areas` table and the `a:x,y` rows as they are; new worlds start with none.
* **Tests:** a fresh store builds Midgård and saves it as chunk rows; reload gives an identical world (terrain, objects, crops);
  a database without `world_format` refuses to boot; `RESET_WORLD=1` wipes and rebuilds; `MemoryStore` and `PgStore` agree
  (the `server.yml` workflow already runs against real Postgres).

**Compatibility code that can go in a later cleanup PR** (PR 8; every item exists only to read an older save):

| Remove | Where | Lines |
| --- | --- | --- |
| `upgradeSavedArea`, `untouchedSinceBuilt`, `untouched`, `OLD_RENEW`, `addCave` (old-save topping up), `settlePlayer`, `REMOVED_KINDS/ITEMS/STATS/ACHIEVEMENTS`, `isRemovedAreaKey`, `scrubPlayer`, `scrubArea` | `shared/src/migrate.ts` (204) and `migrate.test.ts` (67) | ~270 |
| `AREA_GEN` and `WorldState.gen` | `biomes.ts`, `types.ts`, `generateArea` | few |
| The boot repairs in `PgStore.load()`: `ensureCity`, `ensurePizzeria`, `ensureBathhouse`, `ensureTransport`, `ensureTownDress`, `ensureSagaPlaces`, `ensureRoaming`, `ensureLandmarks`, `ensureInterior`, `ensureVillagers`, `ensureCave`, `ensureFarmExits`, `ensureFarmBusStop`, `ensureRunPlaces`, `ensureGear`, `ensureLevelRewards`, the `outOfDungeon`/`outOfRun` fix-ups | `server/src/db/store.ts` (about 120 of 402 lines); the generators keep their own placement | ~120 |
| The importer: `importSave.ts`, `importSaveCli.ts`, `importSave.fixture.ts`, `importSave.test.ts`, `importSave.pg.test.ts`, `pnpm import-save`, README "Moving the family's save from lilla-garden", the `readme.test.ts` checks on it | `packages/server/src/*`, `README.md` | ~1 000 |
| Migration `0004_remove_minigames.sql`'s scrub of old data (keep the migration file; it is history) | | 0 |

About **1 400 lines** in total. The `server.yml` Postgres job stays (the store tests need it).

## 5. Phased plan

Each PR is small enough to review, ships green on the existing CI and bots, and leaves the game playable. CI budget: today
`export` ≈ 4 m 28 s and `bots` ≈ 5 m 26 s (both under ~9.5 min); `server.yml` runs the vitest suites. Estimates below add to these.

**Flag:** `WORLD=grid|open` on the server (default `grid` until PR 8 flips it). The shared code keeps the grid
path alive until the cut-over, so each PR is testable against the old behaviour too.

| PR | What | Tests and bots | CI added | What the owner can do afterwards |
| --- | --- | --- | --- | --- |
| **1. The continent as data** (shared only) | `plans.ts` constants (origins), `continent.ts` (`generateContinent`, stitch, `checkContinent`), `Painter.openSides`, `regionRect`/`biomeOf`/`chunkOf` helpers; a tool `pnpm world:overview` that writes a PNG of the whole continent (terrain colours, objects as dots, plans, gates, arches) | vitest: determinism (same seed twice, three seeds), connectivity of all POIs, seam audit, the plans byte-identical to `generateWorld()`/`buildCity()`, generation time < 1.5 s; no server, no Godot | + ~10 s vitest; Godot jobs unchanged | **Look at the map picture in the PR** and say yes or no to the layout (Q1–Q3) before any sim code moves. |
| **2. Origins refactor** (behaviour-neutral) | the absolute-coordinate constants of 3.2 read through `plans.ts` with origin (0,0); `NpcDef.plan`; `portalWorld(id)`; `house:farm` interior extracted from the farm map (`enterHouse`/`leaveHouse` like the bath) | the whole existing suite, bots unchanged (the farmhouse door now does an instanced move: farmer step "into the farmhouse" must still pass); `inInterior` gone | ± 0 | the game plays as now |
| **3. The server runs Midgård** (`WORLD=open`) | the farm world is `generateContinent`; `biomeOf` replaces `world.biome` for "here" rules; wild `anchor`, region spawning and renewals, `safeRects`, dormancy, local weather + `soil` index, `visitRegion`/`markExplored`, rim gates in `travel()`, three core arches, reserved tiles, `MemoryStore` builds the continent; the chunk store and `0005_open_world` + `world_format` guard + `db:reset`; welcome carries the whole map for clients without `caps` | vitest in both modes; new sim tests (walk farm to Köpingen on foot, animals stay near their anchors over 20 simulated minutes, startle in Midgård, rim gate round trip to `a:2,0`, rain only in wet regions, the achievements); store round trip on Postgres in CI; `walkbot.mts` (Node): a scripted hero walks farm → Köpingen → Draugkryptan's arch → back | + ~25 s vitest, + ~30 s Postgres job | nothing yet in Godot; the Node walk bot is the proof |
| **4. The old client plays Midgård (load everything)** | `Hero` edge travel only at rim gates; `world.gd` builds the continent from the welcome (`FarmView.build` of 288², a 2 s load); the fixture, demos and the walker/farmer bots follow the new coordinates (the farmer's "walk to Köpingen" becomes a walk) | `export` job: `--demo=farm` etc. headless; `bots`: walker, fighters, farmer, run pair against `WORLD=open` (the farmer's walk is ≈ 8 s instead of an edge hop) | + ~20 s on `bots` | **Walk the whole continent** on the MacBook (Mellan/Hög; Låg only to see how bad the 2 s load and the node count are). The first real feel of "one world". |
| **5. Interest management on the wire** | `server/src/interest.ts` (chunk set, hysteresis, entity diff, router), `chunk`/`chunkGone`, filtered `state`, `Change` deletion hints, `caps`; the load-everything path stays for clients without `caps` | **the replica oracle** (below), byte budgets, a fake-client soak (4 simulated heroes random-walking for 10 simulated minutes) | + ~30 s vitest | (no visible change; a faster join once PR 6 lands) |
| **6. Client streaming** | `ChunkStream`, chunk-by-chunk building at 1/frame, unloading, the loading veil, the 3×3 gate, `hero.gd` on `WorldModel.terrain_at`, region-aware sky/sound/footsteps, `world_edge` | a headless stream check in `export`: a scripted fake server feeds chunk messages while the camera moves 400 tiles; assert nodes freed, ≤ 25 chunks loaded, no frame > N ms of build, the node count flat; `--bench --scene=midgard` (pictures job only) | + ~35 s `export` | **Play Midgård properly**: join in 1 s, no freeze, Låg and Hög numbers from the MacBook bench. |
| **7. Maps** (rebases the m9a branch) | minimap from `overview` + `explored`, the world map with fog, POIs and fast travel by `poi:` and region keys; waypoint discovery (arches, bus stops, landmarks) | a headless map check (opens the window, counts POIs, teleports to an arch front) | + ~15 s | find your way around; fast travel to everything discovered |
| **8. Cut-over and clean-up** | `WORLD=open` becomes the only mode; the grid's farm↔village `travel` and `edge` code, the load-everything path and `WORLD=grid` go; compat code of section 4 goes; (optional) the `'farm'` key renamed `'world'`; a typed occupancy grid | the full suite | − net lines, − CI | the same game, simpler code under it |

**The replica oracle** (PR 5, the single most valuable test in the plan): `shared/src/replica.ts` is a client-side model written
in TypeScript that applies `welcome`, `chunk`, `chunkGone`, `changes` and `state` exactly as `world_model.gd` does. A test runs a
real `Game` with four fake clients, scripts them to walk, hoe, plant, build, break, tame, fight and cross rim gates for 10
simulated minutes, and after every 20 ticks compares each replica with the server's world *inside that client's chunk set*:
terrain, objects, crops, drops equal; the animals within range present with the same positions (± one snapshot); nothing outside
the window kept. Any divergence between router and client fails here, in 15 s of vitest, instead of on the MacBook. The GDScript
side is kept in step by a fixture: PR 6 also feeds a recorded chunk-message stream to `world_model.gd` headless and compares its dump with the TS replica's.

### The riskiest step and how it is de-risked

**PR 5 + PR 6 (interest management and streaming)**, because a divergence between what the server thinks a client knows and what
it has produces *invisible* bugs (an animal that is there but not drawn, a wall that is missing after you walk back) that bots
see only by luck. De-risking, in order: (1) PR 1 and PR 2 are neutral or data-only, so a wrong layout is caught in a picture;
(2) PR 3 and PR 4 make Midgård playable **without** the new wire (the welcome carries everything, as a ~1.8 MiB message): the
owner can judge the *design* (size, feel, layout) before the hardest code exists, and the sim work is testable apart from the
network; (3) the replica oracle and the soak test exist **before** the client changes (PR 5 before PR 6); (4) everything sits
behind `WORLD=open` and `caps` until PR 8, with the old path one switch away; (5) the PR 6 client has a developer toggle
(`--no-stream`) that goes back to load-everything for A/B comparison. The second risk is PR 3's breadth (128 `p.area` sites); it is
bounded by doing the constants in PR 2 first and by running every existing sim test in both modes.

Order relative to work in flight: merge Köpingen's Viking look first (it is art and plan-local); then PR 1 can start in parallel
with `claude/sprint` (sprint changes `PLAYER_SPEED` handling in `applyMove`, which chunk subscription tolerates: at 10 tiles/s
on horseback plus sprint, a 32-tile lead is 3 s and a chunk border is 3 chunks ≈ 50 KB); PR 7 rebases `claude/m9a-map-travel-arches`.

## 6. Open questions for the owner

1. **Size and shape:** Midgård as 3×3 regions of 96 = 288×288, a minute edge to edge? *Recommend: yes.* (256² or a bigger 5×5 are easy later: two constants.)
2. **Which maps:** keep today's 3×3 around the farm (two forests, two meadows, swamp, mushroom forest, dinosaur valley, Köpingen) as it is? *Recommend: yes; the layout has meaning (cold north, sea west) and the far world holds the rest. The alternative is to swap the duplicates for mountains and a beach.*
3. **Dungeon arches:** three in Midgård (Draugkryptan, Helheim, Alvernas lund), six in the far world reached by the rim gates and the world map? *Recommend: yes. Bringing all nine inside needs about 5×5 regions.*
4. **The far world:** keep today's separate maps beyond the rim (12 gates), or end the world at the rim and put ice, desert, volcano and the space base elsewhere later? *Recommend: keep, it is free (the code exists), and grow Midgård later if the gates start to annoy.*
5. **Building anywhere** in Midgård (except gates, roads, the town, arch fronts)? *Recommend: yes.*
6. **The farmhouse inside** as its own place (`house:farm`) like the bath house? *Recommend: yes; it removes a walled room from the map and 12 special cases.*
7. **Wild animals are not saved** and come back fresh after a restart (tamed and named ones are saved as today)? *Recommend: yes.*
8. **The bus** stays as an instant ride (also between the farm and Köpingen, 8 s on foot)? *Recommend: yes, cheap; a real driving Diligens can come later.*
9. **A fog of war** on the world map (explored squares only, 8×8 tiles)? *Recommend: yes; 162 bytes per player.*
10. **One sky** for the whole world with each region's own look of it (snow on the ice, mist over the swamp), instead of different weather in different regions at once? *Recommend: one sky.*
11. **A name** for the continent ("Midgård" here) and whether the world map shows the region names? *Recommend: Midgård; names on the map yes.*
12. **The internal key `'farm'`** for "anywhere in Midgård": rename to `'world'` at the very end, or leave? *Recommend: leave until PR 8, then rename in one mechanical commit if you still care.*
13. **Confirm the fresh start:** the v2 server has never been deployed and nobody plays on a local dev database that matters? *Recommend: yes (HANDOFF says nothing is deployed). Join codes survive; characters are made again.*

## Appendix: numbers behind the tables

| Quantity | Value | How |
| --- | --- | --- |
| `generateWorld()` (farm) JSON | 123.9 KiB, 1 497 objects, terrain 32.9 KiB | script |
| `generateArea` JSON, 96² | 110–315 KiB (avg 210 KiB for the eight neighbours; total 1 680 KiB), 217–3 481 objects; the town 91.6 KiB | script |
| Heap per map | 0.19 MiB (25 maps = 4.9 MiB) | `--expose-gc` |
| Tick, 7 wild maps occupied, 179 animals | 0.44 ms avg; 4 players in 4 maps: 0.63 ms | `Game.tick(50)` ×400 |
| `welcome` (farm only) | 130 653 B | real `Game` |
| `areaData` on entering a 96² map | 113 713 / 173 949 / 241 657 / 268 537 B | real `Game` |
| `state` with 4 players in 4 maps | 8 006 B (98 animals, 4 players, 3 villagers); 591 B with all four on the farm | real `Game` |
| An animal in a `state` | 64 B (80 B with an `area` tag) | JSON |
| Midgård, glued | 82 944 tiles, 18 406 objects, terrain JSON 658 KiB, objects JSON 810 KiB with only id, kind, x, y (the real records add up to ≈ 1.8 MiB with the terrain); chunks (32²): 81, objects per chunk min 9, median 252, max 472 | script |
| Glued but unstitched | 770 walkable components, largest 62 075; nine region middles all in it; 22 % of seam tiles open on both sides | script |
| Client, whole-map `FarmView.build` | farm 105.7 ms (1 506 objects), forest 93.7 ms (2 321), village 77.4 ms (921); static memory 103–108 MiB | Xvfb, llvmpipe, Xeon 2.1 GHz; slow, but the ratio is what matters |
| Client, Låg render per frame | 92 / 83 / 80 draw calls; 129 / 122 / 151 objects; 92 k / 61 k / 59 k primitives | `--bench=lag --scene=farm|forest|village` |
| Camera footprint | ≈ 27 × 14 tiles (16:9) | computed from `world.gd` constants |
| CI today | `export` ≈ 4 m 28 s, `bots` ≈ 5 m 26 s | HANDOFF.md, PR 27 |

14. **Keep it modest:** since the runs are the focus, treat Midgård as a hub and defer every PR after 6 (maps, polish, clean-up) until the runs v2 work asks for them? *Recommend: yes; PRs 1–6 give a playable, streamed hub, PR 7 (maps) is the next most useful.*
