# Sagan om Världsträdet: how the game is built

This is the record of the game **as built today**, organised by topic. It was rewritten on 2026-11-07 (milestone M8 of
[PLAN.md](PLAN.md)) from the code on `main` (commit `ff6fda4`, after PRs 29–40); the old dated diary is in git history (`git log -p DESIGN.md`).
Where a number appears here it was read from the code; the file or constant is named so it can be found again.

What lives elsewhere, and is linked rather than repeated:

| | |
| --- | --- |
| [GAME.md](GAME.md) | The design of a run (färd): zones, runor, sagafrön, the farm feeding the run, co-op and solo rules, what the bots found. |
| [GAME2.md](GAME2.md) | Runs version 2 (approved 2026-11-07): easier solo and duo runs (R1, R2 built), then the route through the zones (R3, in progress on another branch). Replaces the *shape* of the run in GAME.md. |
| [OPEN_WORLD.md](OPEN_WORLD.md) | The approved plan for one open world instead of a grid of maps. Design only; nothing of it is built, so this file describes the grid. |
| [PLAN.md](PLAN.md) | Why the game is a native Norse roguelite, the decisions of the owner, the milestones. |
| [packages/godot/ART.md](packages/godot/ART.md) | The art rules of the client (units, palette, recolouring packs, sprite export), the presets' table and every measurement. |
| [packages/godot/assets/LICENSES.md](packages/godot/assets/LICENSES.md) | Where every asset comes from. |
| [README.md](README.md) | How to run it: server, client, bots, importing the old save, releasing, the controls table. |
| [HANDOFF.md](HANDOFF.md) | The state of the work and how the work is run (not about the game). |

Contents: 1 [Overview](#1-overview-and-stack) · 2 [The world](#2-the-world-and-the-farm) · 3 [The saga](#3-classes-the-saga-gear-and-smedjan) · 4 [Runs](#4-runs-färder) · 5 [The Godot client](#5-the-godot-client) · 6 [Access, deploy, CI](#6-access-control-deploy-ci-and-the-bots) · 7 [Retired](#7-retired)

---

## 1. Overview and stack

A co-op Viking farm and dungeon game in Swedish for a family: parents and two kids (7 and 9), friends and family as guests. One persistent shared
world, up to eight characters (`MAX_PLAYERS` in `shared/src/types.ts`). Nothing dies, nothing is lost, nothing bleeds: monsters "poof", bosses are
a bit silly, falling costs nothing, tools never break, no stamina. The farm is the home base, the saga's dungeons and the runs are what you do from it.

### Packages (pnpm monorepo)

| Package | What it is |
| --- | --- |
| `packages/shared` | Everything that is a rule, with no I/O: types, items, crops, recipes, the world simulation (`sim.ts`), map generators (`painters.ts`, `caves.ts`, `landmarks.ts`, `space.ts`), the saga (`saga.ts` data, `sagamap.ts` plans, `sagasim.ts` rules), runs (`run*.ts`), weather, seasons, dialogue, the protocol (`protocol.ts`) and all Swedish text (`sv.ts`). Vitest covers it (`sim.test.ts`, `saga.test.ts`, `run.test.ts`, `world.test.ts`, ...). |
| `packages/server` | Node: the authoritative game (`game.ts`), the HTTP and WebSocket front (`http.ts`), access control (`access.ts`, `admin.ts`), voice relay (`voice.ts`, `ice.ts`), the pages (`pages.ts`), Postgres through Drizzle (`db/`, migrations `drizzle/0000`–`0004`), the save importer (`importSave.ts`). |
| `packages/godot` | The native client, Godot 4.7 / GDScript, the **only** client: Windows, macOS, Linux x86_64 and arm64. It renders what the server sends and sends intent. `tools/` has the exporters and the bots. |
| `packages/art` | The pixel art (characters, animals, items, terrain, saga creatures), drawn in code. Nothing runs it at play time: `pnpm godot:sprites` renders it once to the sheets in `packages/godot/assets/sprites`, and those are committed. |

The workspace and some identifiers keep the old name (`@lilla-garden/*`). The game's name is
*Sagan om Världsträdet* (`config/name` in `project.godot`); the repository is `varldstradet`. Code and identifiers are English; every player-facing string is
in `packages/shared/src/sv.ts`, exported to `packages/godot/assets/sv.json`.

### Server authority and how the two sides talk

- **The server decides everything.** A 20 Hz tick (`TICK_HZ`), a `state` snapshot (positions, flags) every 100 ms, `changes` deltas for everything else, a
  save of what changed once a second (`game.ts`: `tick`, `broadcastState`, `flush`). Areas with nobody online are not ticked, so the world stands still
  while the family sleeps. A game day is ten real minutes (`DAY_LENGTH_MS`). Without `DATABASE_URL` the server keeps everything in memory.
- **The client predicts only its own hero** (the same movement code as `sim.ts`, in `hero.gd`), sends `move` at most 20 times a second, snaps to the
  server when a snapshot is more than 40 px away, and eases everyone else towards their latest snapshot.
- **Login** (native, bearer token; no cookies in the client): the download page `GET /` shows the join-code field; the game does `POST /api/join`
  `{code, name?}`, which answers `{gate, token, name, kind, pending?}`; the token is stored in `user://settings.cfg` and sent as
  `Authorization: Bearer <token>`. `GET /api/gate` says whether this device may play right now (`ok`, `pending`, `paused`, `closed`, `guests-closed`,
  `hours`, `unknown`; with `hours: {from, to}` when shut for the night); the client polls it every 3 s while it waits. `GET /api/players` is the
  "Vem är du?" list and `POST /api/players` creates a character (`{name, appearance: {skin, hair, hairStyle}, shirt}`, a name of 1–16 characters; the
  server has never required unique names). Then `/ws` is opened with the bearer in the handshake headers (`deviceOf` in `http.ts` reads the header first
  and the cookie second; `/admin` never takes a bearer), the client sends `hello`, and gets `welcome` (the farm and everyone's records), then
  `areaData` whenever it enters another map, `changes`, `state`. Pings every 15 s from the client; reconnect with backoff 0.5–8 s; close code
  **4003** means the device lost its access (parent paused or removed it, the farm closed, play hours ended): no reconnect, back to the login screen. A native client
  sends no `Origin`; the origin check lets a request through without one only when it carries a bearer and is not for `/admin`. With `ACCESS=open`
  `/api/join` answers `{gate: 'ok'}` with no token.
- **The socket's inbound buffer must be 8 MiB** (`net.gd`): the `welcome` is the whole farm and Godot's default 64 KiB drops it with close 1009.
- **Speed is checked by the server.** `applyMove` cuts a move to what the legs allow: walking, the run (`RUN_SPEED_MUL` 1.7), a mount's speed or the speed boost (`BOOST_SPEED_MUL` 1.3, from a pizza or a berserker's rage), with a small saved-up allowance. `{t:'teleport', to}` (the world map) needs a visited map and is refused inside a dungeon, a run zone and the farm's old cave.
- **Protocol changes are additive** (new message types; old ones ignore what they do not know). Messages are in `shared/src/protocol.ts`.
- **Generated files.** `pnpm godot:gen` writes `assets/sv.json` (strings), `assets/game.json` (object footprints and solidity, items, the classes, spells,
  bosses' moves, creatures, rarity colours, chat phrases, run data, constants; `tools/export-data.mts`) and `assets/fixtures/*.json` (recorded dungeons,
  the farm and the village for the demos; `tools/export-fixture.mts`). They are committed and CI fails when they are stale: the client never retypes a rule.
- **Dev-only messages** (`{t:'dev', a:...}`, only with `DEV_TELEPORT=1`, an `error` otherwise, tested both ways in `game.test.ts`): `saga` (into a dungeon, making
  a Krigare of a hero with no class), `nextDay` (roll the day over), `starter` (a class's starter gear), `unlock` (marks every dungeon but the last cleared, so a later chapter's arch can be tested), `kit` (stone, gold, crystal, kr, paper, paint buckets and wall pieces for the Smedjan and paint checks), `sagaBest` (records a best time through the real path). Never set `DEV_TELEPORT=1` or `ACCESS=open` on a real farm.

---

## 2. The world and the farm

### Maps

- **The farm** (`farm`) is a handmade 64×64 map: fields, the forest edge (trees, rocks and grass grow back after a few days), a pond with a well, and the
  **farmhouse**, a walled room in the south-east corner of the same map (`INTERIOR` in `map.ts`), entered through a door portal (`PORTALS`). Bed, stove, wardrobe,
  furniture. Whatever the family builds is saved with the map.
- **The wild world** is an endless grid of maps keyed `a:x,y` with the farm at `0,0`. A map is generated the first time someone walks through an
  opening (`EDGE_GAP`: the openings are in the middle of each edge) and then saved like any other. `biomeAt` (`biomes.ts`) decides the kind of place: the village
  Köpingen (`by`) is always `a:1,0`, and a ring of fixed neighbours puts something new next door (forest `0,-1`, swamp `-1,0`, meadow `0,1`, mushroom forest `1,-1`,
  dinosaur valley `1,1`, mountains `2,0`, beach `-2,0`, ice `0,-2`, desert `0,2`, jungle `-1,2`, volcano `2,2`, the space base `1,3`); further out the north is cold, the south hot, the sea
  to the west, the mountains east, and the candy island Godislandet is rare and at least five maps away. **Fifteen kinds of place** (`Biome`): skog, ang, is, berg, strand,
  oken, by, trask, djungel, vulkan, svamp, dino, godis, rymdbas, mane (the moon).
- **Size.** A map has its own size (`WorldState.w/h`, absent means 64; read through `mapW(m)`, `inBounds`, `tileIndex`). Wild maps are `WILD_MAP` = 96; Köpingen, the space
  base, the farm, the moon, caves, interiors, the bath house and the dungeons are 64. Painters scale what they scatter with the area.
- **Painters** (`painters.ts` on `worldgen.ts`: value noise, blobs, scattering, cave hills) lay ground, water, cliffs (`rock`, `sandstone`, `basalt`), lava, bog, chocolate rivers,
  then landmarks, plants and finds; `connect()` last: it clears the openings, lays trails, and carves the cheapest way (bridges, passes) to every opening, cave mouth, chest and
  landmark so nothing is cut off (the tests walk every biome). `AREA_GEN` = 3: an old saved map that nobody changed (`untouchedSinceBuilt`) is rebuilt with today's generator
  on load; a changed one keeps its work and only gets what fits (`ensureLandmarks`, regrowth, a cave).
- **Caves** (`caves.ts`) are areas `g:<map>#<entrance>` generated from their entrance on first visit and saved: a cellular-automaton cavern in one of 11 themes (`CAVE_THEMES`: rot, is,
  kristall, sjorovare, pyramid, tempel, lava, svamp, fossil, godis, rymd), a pool, ore and finds, a loot chest at the far end, sometimes a secret room behind rubble. No monsters.
  The farm's own cave (`dungeon` area) is for fighting.
- **Finds.** Loot tables (`LOOT` in `data.ts`) for cave chests, shipwreck and UFO chests, dig spots (an X in sand or moon dust, dug with the hoe), fossil rocks and fairy rings. A loot
  chest gives every player something once a week (`openedBy`). Clothes found go to the wardrobe (a gem if you have them). Each morning a quarter of what was picked, mined or dug grows
  back (`renew`), never in openings, in front of entrances, under people or where it would block a passage.
- **Landmarks** (`landmarks.ts`): **26 kinds**, two for each of the twelve wild biomes plus one on the space base and one on the moon (Stencirkeln, Jätteeken, Vårdkasen, ...). Each is a solid object
  `lm_<id>` with `interact: 'landmark'`; a 96 map has two, a 64 map one. The first touch per player gives a star, coins and a cache of forge materials that gets rarer the further from
  home (`discoverLandmark` in `explore.ts`; achievements at 5, 15, 26); `noticeLandmarks` records the ones you have seen (the world map's "?").
- **The space base and the moon** (`space.ts`): a rocket from the space base (`a:1,3`) flies to the moon (area `moon`: moon dust, craters, moon cheese, aliens, a crashed UFO, a flag) and back.
- **Köpingen** is a Norse market town, not a modern city: the city generator (`city.ts`, `buildCity`) kept every id (car, bus, train, ...) so traffic, rides and saves are unchanged and only the
  names and art changed: Hästkärra (a cart), Ridhäst (a riding horse, 800 kr), Diligensen (the bus, 5 kr, to places you have visited), Gruvtåget (15 kr, also to an unknown village), Badstugan,
  banner poles, barrels, a runestone and the Kämpastenen on the square (`TOWN_DRESS`, `ensureTownDress`). Smed-Stina the smith, Völvan Sigrun at the stone, the pizzeria, the shop.
- **Wild animals and monsters.** Each biome has wild animals (frog, parrot, monkey, salamander, hedgehog, dino, gummy bear, alien, ...; the lasso tames them). Roaming monsters are animals with
  `mob` (`roam()` in `data.ts`): vandrardraug (forest), mosspoke (swamp), gruvtroll (mountains), sjodraug (beach), skuggalv (mushroom forest), isvarg (ice), eldimp (volcano), easy ones in every
  other biome (Ängsvätte, Trollunge, Snötroll, Sandande, Djungelimp, Benödla, Sockerspöke, Rymdkryp), and two world bosses (Bergatrollet, Kustjätten). They notice a player at `ROAM_SIGHT` 4.5 tiles
  (Ängsvätte 3), bite for a heart and poof; never in the village, on the farm or indoors; restocked each morning (`spawnWildAnimals`, `ensureRoaming`). Every kill pays experience (section 3).

### Seasons, weather, day and night

- **Holiday seasons follow the real calendar in Europe/Stockholm** (`season.ts`): Halloween 24 Oct–1 Nov, Jul 1 Dec–6 Jan, Påsk Palm Sunday–Easter Monday, Midsommar the week up to
  midsummer day. Each has clothes and decorations in the shop's *Säsong* tab, map dressing and a twist (wild pumpkins, snow and tomtemössor, easter eggs, flowers everywhere). `SEASON_OVERRIDE`
  or the parent page forces one. The client also colours the *year's* seasons (spring, summer, autumn, winter; `yearSeason`) from the same calendar: leaf colours, snow cover.
- **Weather** (`weather.ts`): one sky for the world, not saved. `WeatherKind`: sun, cloudy, rain, storm, snow, hail, wind, fog; each lasts 0.5–7 real minutes (per-kind ranges), the next is a weighted
  pick from the current, with snow common in winter months and rare in summer. `localWeather(kind, biome)`: ice turns rain, storm and hail into snow; desert and the space base turn rain, storm, snow, hail and fog into wind; the dinosaur valley and the volcano turn snow and hail into wind, the jungle into rain; the swamp turns cloud into fog. Rain
  waters every field after a few seconds, the ground turns white after 25 s of snow, sun after rain gives a rainbow. The parent page can pick the weather.
- **Day and night** are the server's clock (`timeMs`); the client derives light, sky, lamps and window glow from it (section 5).

### Farming, animals, pets

- **Tools** (item `tool` ids): hoe (hacka), can (vattenkanna, `WATERING_CAN_CHARGES` = 20, refilled at the pond or the well), axe (yxa), pick (spett), scythe (lie), hammer, brush (borste), rod, and the
  weapons sword, shield, bow, bazooka. **Crops** (`CROPS`): morot, potatis, jordgubbe, tomat, pumpa, solros, vete; watered crops grow at the day rollover, strawberries and tomatoes regrow, harvest gives
  seeds back. Hotbar 8, backpack 24 (`HOTBAR_SIZE`, `BACKPACK_SIZE`), stacks of 99 (`MAX_STACK`), chest 32 (`CHEST_SIZE`). The client's filters and search only dim; slot indices are the protocol.
  `sort` sorts backpack slots 8–31 or an open chest; `quickStack` moves stacks that match the chest.
- **Animals**: hen, rabbit, sheep, cow (products egg, wool, milk; each needs its house: coop, hutch, sheepfold, barn), horse (stall; a mount), dog and cat (pets). Named on arrival, 0–5 hearts from
  feeding, petting, brushing; babies grow in 3 days (`ANIMALS` in `data.ts`). Animals are bought in the Gårdsbutik, need the matching built house, and arrive the next morning.
- **Pets and mounts.** "Stanna!" (`pets stay`) makes your pets and horses on this map potter where they are; "Vissla" (`pets come`) calls them from any map except caves. A ridden horse moves at
  the mount's speed or `RIDE_SPEED_MUL` 1.8.
- **Wild animals startle (M7b), a server rule** (`tickStartle` in `sim.ts`, tested in `sim.test.ts`). A wild animal (not predator, monster, pet, mount, traffic, owned, kept by `stay`, or petted
  today) with a **moving** player within `STARTLE_TILES` (4) bolts away for `BOLT_MS` (1.8 s) at 2.2× speed, remembering its place (`haunt`); after catching its breath (2 s) it walks back and
  potters around `haunt`. A player who **stands still** startles nothing, and an animal that has been startled before and has calmed down creeps up to a quiet player within `CURIOUS_TILES` (7), to the middle of the tile next to theirs on its own side (the longer axis; the other one if that is blocked; never a diagonal tile), and arrives *on* its target rather than a step short; it stays there while they stand still, so it can be petted: the way to pet a shy animal is to walk near, stop and wait. Deterministic (no random numbers); `startled` and `haunt` are saved with the animal and cleared by the lasso and by
  changing map. The server owns animal positions, which is why this is not a client effect.
- **Fishing**: a rod from Fiskar-Sven for five wood; the server sends only the `fiske`/`napp` emote and a splash at the bite.

### Building, ownership, economy, clothes

- **Building.** trä, sten and fiber from trees, rocks and grass; recipes at the arbetsbänk (`RECIPES`: fence, gate, paths, walls, floors, door, chest, torch, scarecrow, bench, table, flower box, well,
  animal houses, ...) and the stove (`COOKING`). Free grid placement except on water, cliffs, objects, crops or someone standing there. There is no rotation.
- **Ownership.** `WorldObject.by` remembers who placed a thing. Only that player can take it down: the hammer, any tool or a rocket blast on someone else's build refuses with "X byggde den – bara X kan riva
  den." Builds whose builder is no longer on the farm, and everything that grew by itself, can be taken down by anyone. Chests can be opened by everyone.
- **Economy.** Per-player kr (`START_COINS` 150) and stars. The säljlåda sells instantly. The **Gårdsbutik** (the object kind `mailbox`, kept under that id for old saves) has tabs Frön, Djur, Foder, Material,
  Möbler, Kläder, Säsong, Stjärnor and Kärror & hästar; goods are instant, animals next morning, and the shop shows everyone's pending animal orders. The pizzeria in Köpingen sells food.
- **Clothes.** A layered, tintable character (hair, shirt, pants, shoes, hat); bought and found clothes go to the Garderob. A new character starts with four shirts (`STARTER_WARDROBE`), six skin tones, eight hair
  colours, five hair styles (short, long, curly, ponytail, bald). Hair and skin are chosen when the character is made.

### Villagers and dialogue

Tant Greta, Fiskar-Sven, Elsa and the other villagers give a new wish each day (a `Quest`: bring items, get kr and stars). "Prata!" opens a dialogue tree (`dialogue.ts`, played client-side by `dialogue.gd`
line for line): each villager has stories, a question and opinions on the weather; jokes and riddles are shared; Elsa plays sten, sax, påse. In the saga, villagers also ask for things from the wild (two quests per dungeon, once Völvan has told its chapter).

---

## 3. Classes, the saga, gear and Smedjan

The saga is *Sagan om Världsträdet*, told by **Völvan Sigrun** at the Kämpastenen in Köpingen. Data in `saga.ts`, the dungeon builder in `sagamap.ts`, the rules in `sagasim.ts`
(threat, leash, packs, casts, zones, rest stones, wipes, chests); `saga.test.ts` walks every dungeon from the start to the boss.

### Classes and spells

Four classes (`CLASSES`), chosen at the stone, each with four spells (`SPELLS`, 14 kinds from melee to blink); health in dungeons in brackets:

| Class | Role | Spells |
| --- | --- | --- |
| Väktare (200) | tank | Svärdshugg, Utmana!, Sköldslag, Sköldmur |
| Helare (120) | healer | Läkerunan, Ljuspil, Läkekrets, Väck upp! |
| Krigare (150) | melee damage | Yxhugg, Stormsteg, Virvelvind, Bärsärkaraseri |
| Magiker (110) | ranged damage | Eldboll, Isspjut, Åskregn, Blink |

Constants: `GCD_MS` 400, `DOWN_MS` 10 s, `WIPE_MS` 4 s (everyone fell: up at the last rest stone, monsters reset), `CALM_MS` 5 s, `LEASH_TILES` 22. Monsters scale with the party
(`mobHpScale`, `bossHpScale`, `mobDmgScale`). Bosses mark their big attacks on the ground before they land (cone, circle, line, pull, pools, charge, rain, summon, mend, freeze/web) and some can
be interrupted (Sköldslag, Stormsteg, Isspjut); `BossMove`/`BossAbility` in `saga.ts` are the vocabulary.

### The ten chapters and nine dungeons

`SAGA_CHAPTERS` has an introduction (choose a class) and ten chapters; a chapter is done when all its parts are (a dungeon, a *field task* of killing `count` of a target out in the world, counted in
`prog.quests['field:<chapter>']`). Chapters 4–10 have field tasks and from chapter 5 on a dungeon; the rewards are decor for home and a title.

| # | Chapter | Dungeon (id) | Mid-boss | Boss |
| --- | --- | --- | --- | --- |
| 1 | Solrunan | Draugkryptan (`draug`) | Gravväktaren | Draugkungen Hrolf |
| 2 | Den eviga vintern | Frostjättens borg (`frost`) | Isbjörnen Kall | Rimtursen |
| 3 | Surts svärd | Surts smedja (`surt`) | Smeden Glöd | Surt |
| 4 | Viskningar i mörkret | (field task only; explains the hero switch) | | |
| 5 | Hels port | Helheim (`hel`) | Garm | Hel |
| 6 | Dvärgarnas guld | Svartalfheims gruvor (`dvarg`) | Järnväktaren | Fafner |
| 7 | Havsormen | Havsormens tempel (`orm`) | Bläckis | Jörmungandr |
| 8 | Skuggan över Alfheim | Alvernas lund (`alv`) | Spindeldrottningen | Nattmaran |
| 9 | Fenrisulven | Fenrisklyftan (`fenrir`) | Sköll | Fenrisulven |
| 10 | Ragnarök | Bifrost (`loke`) | Lokes skugga | Loke |

Each dungeon is a 64×64 plan of 9–11 rooms with its own shape, two or three rest stones, a treasure room and a section gated behind the mid-boss. Rooms of kind `puzzle` (from Helheim on) put three
`saga_plate` objects on the floor and a `saga_gate` across the way out; the gate opens when all three glow. Bifrost is Loke's illusions: every monster but the bosses is `variant: 1` (`illusions: true`),
drawn ghostly. The arches stand in the wild maps (`DUNGEONS[id].portal`, e.g. Draugkryptan in the forest at `a:-1,-1`).

A dungeon is an area `saga:<id>`, generated when the first player walks through the arch and **thrown away three minutes after the last one leaves** (`SAGA_RESET_MS`); it is never saved, so a restart puts
everyone in front of the arch. Loot chests give every player their own once; `found` keeps pets, mounts, clothes and gear from repeating while there is something new. Boss chests give coins, stars,
weapons, clothes and, rarely, pets and mounts.

**The ending.** Killing Loke is a boss fall like any other (banner "Loke är besegrad!", the chest). The saga itself ends in the village: handing the last chapter to Völvan sends the achievements
(`saga_act2`, the title Ragnaröks hjälte), the reward banner and a record with `chapter` past the end; her window then says the saga is over. Loke is "tied up till nästa gång", so a part III stays possible.

### Hero mode and the world

`{t:'saga', a:'hero'}` (`setHero`) switches between farmer and hero (needs a class; never inside a dungeon, where you are always the class). The switch swaps outfits (`farmOutfit`/`heroOutfit`) and makes the
equipped weapon the held item. Outdoors `castFieldSpell` runs the class's spells with cooldowns in memory (not saved), counted in hearts like the sword: attack spells hit the nearest hostile animal, taunt makes
animals prefer you, heal and potion give back 2 and 3 hearts. `heroAction` swings the class's attack spell at a monster in reach and otherwise lets the farm action happen. The lasso does not work on Loke's monsters.

### Experience, levels, gear

- **XP for everyone, class or not.** `killXp` on every kill: the killer and every online player within `FIELD_SHARE` (10 tiles) on the same map get the same amount, whatever weapon. `SAGA_XP`: mob 5, add 2, mini 40,
  boss 100, quest 30, chapter 100, wild 4, predator 6, cave 3, caveBoss 30, worldBoss 60.
- **Levels 1–20** (`XP_LEVELS`: 0, 60, 150, 280, 450, 660, 910, 1200, 1530, 1900, 2310, 2760, 3250, 3780, 4350, 4960, 5610, 6300, 7030, 7800). Each level gives `LEVEL_BONUS` 0.015 more power and health (+28.5 % at 20).
- **Gear**: slots weapon, offhand, amulet (`SagaProgress.gear`, items are taken out of the bag while worn); rarities common, uncommon, rare, epic, legendary (`RARITY_POWER` 1 / 1.05 / 1.1 / 1.2 / 1.3). `gearStats` =
  `RARITY_POWER[weapon] × (1 + Σ gear power, forge included) × class fit (1.05 for a piece marked for your class) × (1 + 0.015·(level−1))`, **capped at `POWER_CAP` 2.0** so a level-20 parent in a fully forged set does at
  most twice what a level-1 kid does and a dungeon stays a team effort; hp is added to the class's; armor is capped at `ARMOR_CAP` 0.4 and taken off every hit.
- **Level rewards are looks, never power** (`LEVEL_REWARDS`): clothes, a pet (Lyktfén, level 5), a mount (Ljushjorten, 15), amulets with a little hp, titles (Vandrare, Hjälte, Stor hjälte, Legend, Midgårds väktare), and an
  aura from level 10 (`auraOf`: 1 a soft warm light with sparkles, 2 from level 20 a cycling rainbow). `ensureLevelRewards` is idempotent and runs on every gain and on load. Worn hats and shirts with `glow` light the player.

### Smedjan, materials and replays

- **Smedjan.** Smed-Stina in Köpingen forges a piece of gear from +1 to +5 (`FORGE_MAX`) per player and piece (`prog.forge`): weapon +0.06 power a level, offhand +0.02 armor (and +0.03 power if it has power), amulet
  +8 hp (and +0.02 power). `FORGE_COSTS`: +1 6 stone, 3 gold, 40 kr; +2 4 crystal, 2 gold, 80 kr; +3 two pieces of any mix of fire crystal, fairy dust, frostros, alvdagg, obsidian and star crystal, 150 kr; +4 4 monsteressens,
  250 kr; +5 2 drakfjäll and 4 monsteressens, 400 kr. The costs climb with distance on purpose. `FORGE_CRAFTS`: a starter set (Järnsvärd, Järnyxa, Ekstav, Jaktbåge, Träsköld, Stenamulett) for 60 kr and a few materials,
  once per hero. Messages `{t:'saga', a:'forge'|'craft', item}`; the player must stand by Stina.
- **Replays.** A boss's full chest comes once per game day per player (`prog.chestDay`); after that the same day it is the replay chest (`replayChest`): a third of the coins, 2–4 Monsteressens, a Drakfjäll from a final boss, no
  stars, the usual XP. Dungeon monsters (not a boss's helpers) drop a Monsteressens with `ESSENS_CHANCE` 15 %. The family's best time through each dungeon is kept (`farm.sagaBest`, column `saga_best`, migration 0003).
- **Saved and not saved.** Saved with the player: class, chapter, `cleared`, quests, `found`, `gear`, `hero`, both outfits, `xp`, `forge`, `discovered`, `seen`, `chestDay`. Not saved: dungeons and what is in them, spell
  cooldowns, buffs, hunts.

---

## 4. Runs (färder)

The design is [GAME.md](GAME.md); read it first. What is built (server and shared: `run.ts`, `runmap.ts`, `runsim.ts`, `runbot.ts`, `runhooks.ts`, `runplay.ts`; client: `run_*.gd`):

- A run is **three zones and the chapter's boss**, about 30 minutes as a *soft* target (`RUN_MAX_MS`; banners at `RUN_WARN_MS` 25:00 and 30:00 and every `RUN_NUDGE_MS` 10 minutes after, never a forced end). It starts at the **färdport** (a 3×2 arch placed
  by `ensureRunPlaces` beside the **Yggdrasil shoot**); family within `RUN_JOIN_RADIUS` 6 tiles come along, others `join` and appear at the last lit rest stone. Three players, four with a longhouse (`RUN_PARTY_MAX` 3 / 4); one or two humans get the hired **Hirdmannen** (no longhouse needed; `companionClass`: a healer, or a tank if the human is the healer; for a pair, whichever of healer and tank they lack, else none; a `bot: true` player, never saved or counted).
- A zone is an area `saga:run<n>z<i>` built by `runmap.ts` with `buildDungeon` from a template per biome (seven biomes, never repeating in a run); `ZONE_HP` 1.35 / 1.5 / 1.7 by zone; the look is borrowed from the dungeon whose arch stands in that biome.
  Zones are never saved. After each zone the party votes on one of three **runor** (`RUN_PICK_MS` 20 s: strict majority at once, otherwise most votes, ties to the first); the effects are `RunBuffs` added up by `effectFor` from the farm, the party's tree and the runor taken.
- **Sagafrön** are paid to every human the moment they are earned (`RUN_SEEDS`) into `PlayerState.run` and planted at the shoot into `SEED_TREE`: **18 nodes, 462 seeds in all**; the shoot's look is the tree's stage (`TREE_STAGES` 0, 3, 8, 14, 24). The farm feeds
  the run through **färdkost** chosen at the arch, the three buildings (smithy, herb garden, longhouse) and animals.
- A boss falling pays and clears the chapter for everyone in the party, offline members included, and opens 90 s for the chest (`RUN_VICTORY_MS`); a wipe ends the run and everyone is back at the arch with everything; so does the last human leaving, or 60 s with nobody online
  (`RUN_OFFLINE_END_MS`). The solo mercy `SOLO_MERCY` 0.75 is for one human with the companion.
- **Levels (GAME2 R2).** `run start` carries a level (`RunLevel`: 0 *Lätt*, 1 *Vanlig*; `parseRunLevel` is the only reader, anything else is refused). Lätt (`LATT`): monster health ×0.6 and damage ×0.5, warnings before big attacks 40 % longer, half the sagafrön, only the boss's first two attacks, and a wipe never ends the run. The **Sagoandan** (`SAGOANDAN`: 3 on Lätt, 1 on Vanlig; on Lätt one more after each zone) is a free "everyone gets up" on a wipe: with one left a star is spent and the party stands up at `SAGOANDAN_HP` 0.5, a Lätt wipe with none left still gets everyone up at full health. The fight rules read only the zone's `SagaRunLink`, never the level. The arch window picks the level; the HUD shows the stars; `runtune.ts` prints the tuning table.
- Protocol: client `run` (`start`, `join`, `pick`, `reroll`, `leave`, `state`), `seed` (`plant`, `state`), `fardkost`; server changes `run` (`state`, `offer`, `ended`), `seed`, `fardkost`, `open` with `run` and `seed`.
- Balance was tuned with bots (GAME.md section 9, GAME2.md section 5). `run.test.ts` and the run bot pair in CI keep it honest.

---

## 5. The Godot client

`packages/godot`, Godot 4.7.2 (pinned in CI; any 4.7.x edits), Forward+ renderer (`config/features`), GDScript only, window 1280×720 with `canvas_items` stretch. Entry: `main.gd` (login first, the world once a
character is picked; the command line after `--` selects demos, bots and checks). `world.gd` is the scene; `world_model.gd` keeps the state the socket delivers; `farm_view.gd`/`dungeon_view.gd` draw it.

### What is drawn, and what is not

Drawn: the farm and its farmhouse, every wild map `a:x,y` including Köpingen, the nine saga dungeons, and the run zones. **Not drawn yet** (the server has them; the HUD says "ritas inte än"): caves (`g:`), the moon, the farm's own cave, the bath house and other indoor maps.
**Not usable from the client yet**: the rocket and the other interactions not in `INTERACT_OK` (`farm_play.gd`), which answer "… används inte än". Everything else a child needs is there, including what the browser game had: the Gårdsbok, the saga journal, the finds book, help, the family window, the minimap and world map, Smedjan and paint (below).

### Rendering: HD-2D

A low-poly 3D world lit in real time with the game's pixel characters as billboards ([ART.md](packages/godot/ART.md) has the rules). One map tile is 1 m; the camera is perspective, FOV 40°, about 10 m above and 8 m behind the hero, pitched about 51° down, never rotating,
north up. A sprite pixel is 1/16 m (`Sprite3D`, `BILLBOARD_FIXED_Y`, nearest filtering, lit); names, bubbles and floating numbers are `Label3D`.

- **The outdoor view** (`farm_view.gd`, one view for the farm and every wild map): ground meshes per 16×16 tiles with a colour per tile, water/bog/chocolate/lava as sunken beds with one surface shader, cliffs as raised blocks with Kenney cliff faces, objects as `MultiMesh`es per chunk and
  kind (a forest is a few draw calls), houses, lamps and arches as nodes with lights. Props share one vertex-colour shader (`farm_prop.gdshader`) so seasons' leaf colours, snow, wind and rain act on all of them. A kind with no model gets a lilac box and one warning.
- **Dungeons** (`dungeon_view.gd`): floors and walls as MultiMeshes in 8×8 chunks (KayKit Dungeon tiles, three variants by a hash of the tile), the boss hall's floor decorated, each wall a dark block with wall faces towards floor, decor in code (`zone_props.gd`). The dungeon's `ambient` colour from the data is the ambient light and fog.
- **The dungeon look table** (`dungeon_look.gd`, `LOOKS`): one row per dungeon id decides stone tint, per-terrain floor multipliers, torch colour, ambient strength, fog, bloom, whether the boss hall has the decorated floor, and `motes`, what drifts through the air round the hero (Mellan and Hög only):

  | Dungeon | Look | Motes |
  | --- | --- | --- |
  | Draugkryptan | neutral stone, green torches | none |
  | Frostjättens borg | pale blue ice-stone | snow |
  | Surts smedja | ash and forge, fire | embers |
  | Helheim | green-grey, pale wisps | wisps |
  | Svartalfheims gruvor | dark rock, amber lamps | dust |
  | Havsormens tempel | sea-teal stone, cyan lanterns, thick haze | bubbles |
  | Alvernas lund | violet bark, green moss, strong bloom | spores |
  | Fenrisklyftan | steel-blue rock, trampled snow, storm lanterns | gale |
  | Bifrost | pearly glass, rose-gold lanterns, lots of bloom | stars (rainbow) |

  `resolve(id, data)` falls back to the `wall` index (run zones and the boss's map borrow a look that way) and to neutral grey for an unknown id, so a new dungeon still draws.
- **Sprites and the art pass.** `tools/export-sprites.mts` bundles `packages/art` with Vite and renders it in Playwright's Chromium: each class's hero (six skins × four directions × three frames, 16×32 px), the farm's clothes as layers that `look_composer.gd` blends (checked pixel for pixel against the art's own
  `drawCharacter`), every animal and villager, every saga creature (`mob_<species>`, plus `_v1` ghostly variants for Bifrost), and `icons.png` (items, spells, emotes). The world around them is free CC0 packs, recoloured to the palette: KayKit Dungeon Remastered, Halloween Bits, Furniture Bits, Forest, Medieval Hexagon,
  Kenney Castle Kit and Nature Kit (the landmarks are assembled from pack parts in `landmark_models.gd`); what no pack had is generated in code (`farm_mesh.gd`). [LICENSES.md](packages/godot/assets/LICENSES.md) is the register; `tools/fetch-assets.sh` downloads the packs.
- **3D figures** are opt-in: `--people3d` on the command line (not a setting) swaps the billboards for chibi KayKit Adventurers figures (`figure_3d.gd`), the crypt's undead for KayKit Skeletons (`skeleton_figure.gd`), and every other creature for a body extruded from its own sprite (`voxel_body.gd`). Billboards are the default and the fallback. Vehicles stay billboards.
- **Köpingen looks Norse in the client too.** The ids are the city generator's (road, crossing, traffic_light, street_lamp, car, motorcycle, bus, train, parked_car); only the drawing changed: cobbled `road`, flagstone `sidewalk`, a continuous band of pale slabs as `crossing`, gravel and iron rails on sleepers as `rail`; half-timbered town houses, turf longhouses, stave houses, the smith's, baker's and weaver's shops with hanging signs,
  Pino's tavern, the sauna, a stone station with its bell, the Vägvisare signpost, iron lantern posts (1.8 m), the Diligens stop and hand carts (`village_meshes.gd`). The traffic (cart, riding horse, Diligensen, Gruvtåget) is exported with the other animals and drawn as voxel bodies **always**, turned along the street, with a lantern at night (not on Låg) and riders lifted by `Data.ride_lift`. `--demo=village --stage=street` lays the street out for pictures.
- **Wild-map props** (`wild_meshes.gd`, generated; `SPECS`): the props of the jungle, mushroom wood, volcano, desert and the like are real meshes. `--placeholdercheck` (`placeholder_check.gd`, in CI) plays every recorded world and fails if an object is drawn as a placeholder box, an actor has no sprite sheet or a vehicle is not a body; the kinds still without a look are listed and may only shrink.
- **The nine arches** (`arch_meshes.gd`): every dungeon's gateway has its own building on the 3×2 footprint (barrow, ice gate, forge door, Hel's gate, mine door, sea temple, the tree, Fenrir's cleft, the rainbow arch), with a glow and light in the dungeon's torch colour. Going in is unchanged: the use key sends `act`, the server answers with the dungeon or the "förseglad" toast.
- **Movement and the fight** live in `hero.gd` (prediction), `combat.gd` (targeting, cooldowns, the potion; everything the server decides it asks for), `fx_view.gd` (every `zone` as a flat shape that fills until it lands, spell and cast effects in the browser-era colours, hit numbers, the lasting looks of shield walls, rage, a fallen friend), `actor.gd` (bodies,
  health bars, the warning sign on the monster after you), `sfx.gd` (the fight's sounds, synthesized at start from recipes, no audio files).

### The alive world

Visuals (M7a, M7b; every part a toggle in `quality.gd`):

- **Sky and grade** (`day_night.gd`, `screen_grade.gd`): sun, moon, ambient light and fog from the server clock; leaf colours from the calendar; snow cover; weather as GPU particles that follow the hero (rain, hail, snow, wind leaves), fog, lightning, a rainbow after rain; lamps and windows lit by darkness. One full-screen grade
  pass (warm grade, vignette, night navy with warm lamps masked, dusk violet) on every preset, off in dungeons; indoors in the farmhouse it keeps the colour but not the night blue. The hero carries a lantern outdoors after dark; lamps cast pools of light on the ground.
- **Wind** (`farm_prop.gdshader`): level 1 a sway; from level 2 the weather's strength with a direction (towards south-east) and gusts that cross the map; level 3 adds leaf flutter.
- **Water** (`farm_water.gdshader` on Låg: flat, no screen texture; `farm_water_fx.gdshader` on Mellan and Hög): four crossing swells that tilt the normal, foam along the bank and a **screen-space reflection** of what stands on the far side (16 steps on Mellan, 28 on Hög). Bog and chocolate mirror less, lava not at all.
- **Ambient things** (`ambient_view.gd`, `assets/shaders/ambient_*.gdshader`): fireflies (summer nights, dry weather), butterflies (spring/summer days), falling leaves (autumn), chimney smoke, dawn mist, sparrows (hop on grass by day, scatter when you come within 4.5 m), pools of light in front of lit windows. Each is one `MultiMesh` animated in a vertex shader.
- **Sound** (`soundscape.gd`, `footsteps.gd`; synthesized by `tools/make-audio.py` and committed as 34 WAVs, CC0, our own): a mix of **eleven loop layers** (wind_soft, wind_hard, rain, rain_roof, birds, crickets, frogs, water, surf, fire, murmur) whose targets are a pure function of place, hour, weather, season, indoors and nearness of water and fire,
  eased with a 1.8 s time constant (so changing map or the day turning is a crossfade); an owl on clear nights in meadows, woods and the village; the dungeons call `silence`. **Footsteps**: one sound per 0.9 tile walked, by ground (grass, dirt, stone, wood, sand, snow, water), three variants each, 3D at the walker's feet, quieter with distance, none
  across the farmhouse wall. Player settings: `steps_on`, `ambience_on`, `world_volume`.
- **Wildlife that runs from you** is the server's rule (section 2), not a client effect.

### HUD, windows, input

- **HUD** (`hud.gd`, `run_hud.gd`): at the top clock, day, season, weather, kr, stars and hearts, the map's name; in a fight the spell bar (icon, key, cooldown sweep, blue border on the spells that can interrupt the boss's cast), frames of you and your target, the party with hearts and flags, the boss bar with phase pips, the cast bar,
  the fallen/frozen/webbed box with its countdown, banners and a **toast queue** (toasts that arrive within 0.4 s of each other are shown one after the other); in a run the clock, zone dots and the runor taken.
- **Windows** (`game_window.gd` and one file each; a dark panel, title, purse, tabs, rows of picture, name, text and buttons; every control is a `Button`, so mouse, keyboard and pad all work; Escape or B closes): bag and chest, workbench and stove, Gårdsbutik, säljlåda, pizzeria, wardrobe, villagers' talk and wishes, the class stone, Völvan's chapters,
  the gear window (class, level, the three slots, the bag's gear, the hero switch), the bus, the loot window, the arch (färdport) window, the sagaträd, the voice window, the settings window, the character creator. `farm_windows.gd` routes the server's `open` changes and closes everything on a map change.
- **Run (sprint).** Hold `Shift`, the left trigger or (outside a fight) `B`: 1.7× speed (`RUN_SPEED_MUL`, no stamina; a mount's own speed counts instead), the walk animation 1.5× faster; the server enforces the same ceiling. A pizza or a berserker's rage adds the boost chip (🍕💨 / 🔥💨, ×1.3).
- **Books and helpers** (`book_window.gd`, `book_pages.gd`, `help_window.gd`, `family_window.gd`, `npc_talk.gd`; data is `game.json`'s `book`): **Gårdsbok** (`B`: the 78 achievements with bars and stars), **Sagans dagbok** and **Upptäcktsboken** (`K`, or the level chip: hero level and all level rewards, the chapters, the nine dungeons with how to beat each boss, today's chest, the family's best time, titles; the 26 landmarks, `???` until found), **Hjälp** (`H`/`?`, 21 topics), **Familjen** (`P`/👪: who is online and where, "Hoppa till"), a quest tracker on the left (hidden in a dungeon), ✋ Stanna! and 🎵 Vissla buttons once you own a pet or horse, and villager marks (yellow `!`/`?` for saga quests, red-orange `❗`/`?` for the day's wish) with idle speech. Every window works with keyboard, mouse and pad; on a pad the pause menu opens them. In a dungeon or a run these keys do nothing.
- **Minimap and world map** (`minimap.gd`, `map_window.gd`): `M` toggles the corner map (the map's terrain, markers for arches in their dungeon's colour, doors, the bus stop, Kämpastenen, landmarks, and dots for players, villagers, animals and monsters; saved as `Settings.minimap_on`); `N`, the pause menu's "Karta" or the controller's `Share`/`Capture` opens a 7×7 grid round the map you are on (visited maps with emoji and name, "?" and "🧭" for landmarks seen and found, "Åk hem", "Månen") and clicking a visited map sends `teleport`. Greyed where the server would refuse.
- **Smedjan** (`forge_window.gd`, opened by "🔨 Smedjan" in Stina's talk window; closes beyond the server's 4-tile radius): tabs *Förbättra* (a row per piece worn or carried: "+n", stars, now → next, the cost in colour, the button, off if it cannot be paid or at +5) and *Smid* (the six starter pieces, once each); costs and stats come from `game.json` (`gear.forgeCosts`, `forgeCrafts`) so the window shows what the server charges; refusals are the server's toasts. The farmer bot holds the client's numbers to the TS `forgeStats`, `gearStats` and `fighterMax`.
- **Paper, paint and buckets** (`paint_window.gd`, `paint_canvas.gd`, `paint_art.gd`): a paper opens a 16×16 canvas (mouse, touchpad, keyboard or pad; fill, erase, 10–20 px cells following the screen height); "Klar" sends `{t:'paint', pixels}`; a painted tavla shows its picture in the bag and in the frame on the wall; a bucket recolours the farmhouse or a run of wall pieces (the server's `variant` 1–6, flood-painted across joined pieces).
- **The use key** (E, Space, A or a click on a tile beside you) sends `act` on the tile in front; the client only *reads* the server's rules to outline the tile (green when something would happen, red and "Går inte att bygga här" when a placement is refused, grey with "X byggde Y" on someone else's build) and write the action ("E · Vattna").
  The full key and pad table is in the README's "Controls".
- **Gamepad.** Spells on `X`/`Y`/`B`/`RB` or, with the setting *Trollformler: Hjul*, one button that opens a radial wheel (`wheel.gd`); the emote wheel is the same control.

### Settings and accessibility (`settings.gd`, `settings_window.gd`)

`Settings` is the one place for choices: each has a setter that keeps the value, writes `user://settings.cfg` and applies it at once. Sections of the file: `server` (url), `device` (token, pending number, last character), `graphics` (quality, fps, window, res_scale), `effects`
(per-effect switches), `sound` (steps, ambience, volume, master, effects), `voice`, `input` (spells, ptt_key), `access` (ui_scale, colours, pattern, reduce_motion). The default server address is a placeholder (`https://example.invalid`), typed on the login screen; plain `http`/`ws` is accepted only for `localhost`.
Command-line forms (`--ui-scale=`, `--colours=`, `--pattern`, `--reduce-motion`, `--res-scale=`, `--quality=`) are run-only and never saved. The window has four pages built once: *Bild*, *Ljud*, *Läsa och se*, *Styrning*.

- **Text size** 100 / 125 / 150 / 175 % (`Window.content_scale_factor`; 3D labels follow through `Settings.scaled_label`; `HudLayer._layout` and `UiFit` keep every window on the screen at 175 %).
- **Colour-blind palettes** (`palette.gd`): `normal`, `rg` (deuteranopia/protanopia: danger amber with black stripes, safe blue) and `tritan` (danger pink-red with white stripes, safe green); chosen against the Machado et al. (2009) simulations and held to numbers by the settings check (hearts at least 25 apart in Lab, danger against safe at least 60).
  With a palette, or the switch *Ränder och tjock kant*, a mark of an attack gets diagonal stripes (`danger_hatch.gdshader`) and a thicker edge, so colour is never the only cue.
- **Less shaking and flashing** (`Settings.calm`): no camera shake, no lightning flash or spike, the stripes stand still and the marks' edge stops blinking, a third of the glow on a boss landing.
- Volume buses `Master` and `Effekter`; there is no music, so no music slider.

### Quality presets and what each costs

`quality.gd` `PRESETS`; **Mellan is the default**; Låg is for an Intel integrated GPU, Hög for a dedicated one. The 3D resolution is a pixel budget (`scale_for`: the preset's scale but never more than its megapixels; the engine upscales with FSR 1), because a Retina 1280×720-point window is 3.7 Mpix.

| | Låg | Mellan | Hög |
| --- | --- | --- | --- |
| 3D resolution | 0.8, at most 1.3 Mpix | 1.0, at most 2.1 Mpix | 1.0, at most 3.7 Mpix |
| Torch shadows (dungeons) | none | none | the 6 nearest |
| Sun shadow (outdoors) | none | one short cascade | two cascades |
| SSAO · SDFGI · volumetric fog · glow | off · off · off · off | on · off · off · on | on · on · on · on |
| Flame particles per torch | flat sprite | 8 | 16 plus motes |
| Dungeon weather / sky weather particles | 150 / 150 | 600 / 900 | 1500 / 2000 |
| Wind · water level | 1 · 0 (flat) | 2 · 1 | 3 · 2 |
| Fireflies · butterflies · leaves · smoke · mist · window light | all 0 | 28 · 9 · 36 · 7 · 9 · 1 | 56 · 16 · 80 · 12 · 18 · 2 |
| Footsteps at once · ambience layers · sparrows | 3 · 1 (three loudest) · 0 | 6 · 2 · 6 | 10 · 2 · 12 |
| Screen grade | on | on | on |

The settings window can switch five effect groups by hand over the preset (`Quality.TOGGLES`: wind, water, ambient, weather, wildlife); picking a preset clears the hand-made choices. *Hur skarp bilden är* (50–100 %) scales the 3D picture and keeps text sharp.
Costs, measured: the owner's MacBook Air M4 (Metal, Forward+) ran the crypt at 92 / 48 / 27 fps on Låg / Mellan / Hög before the pixel budget and the torch-shadow cut (M3d); the sandbox's software-GL ablations put Mellan's cost mainly in torch shadows (since removed from Mellan), SSAO and the number of lights, and Hög's in GI; the screen-texture
copy of Mellan/Hög water is the main GPU cost of M7a; the pack models draw about three times the primitives of the generated meshes they replaced (Låg 34 000 → 93 000 on the farm). Numbers and method are in [ART.md](packages/godot/ART.md) ("Measured"). `--bench[=preset]` prints frame time, the 1 % low, draw calls, lights and window pixels; **F3** shows them live. Nothing from M4 onwards has been benched on the MacBook yet.

### Röstprat (voice)

The server side (`voice.ts`, `ice.ts`, `shared/src/voice.ts`, the `voice` messages, the parent's setting off / family only (default) / family and guests) is unchanged from the browser era and carries the room rules:

- **Voice is per room, not per player.** Every device is in a room, by default everyone behind the same public address; you never hear your own room. A device may say it sits in another room or in a given player's room.
- **One speakerphone per room**: the first device to pick up is the only one that opens its microphone and plays the other rooms; another that has picked up takes over when it hangs up.
- Sound goes **straight between the rooms' speakers** (a mesh, at most eight) and is signalled over the game socket (`join`/`leave`/`speaker`/`room`/`signal`/`talking`; `signal` is relayed only between speakers of different rooms, 40 a second and 16 kB at most). The server never hears sound. STUN by default (`stun:stun.cloudflare.com:3478`); optional TURN (`TURN_*`) or Cloudflare's TURN (`CLOUDFLARE_TURN_*`) from the environment.

The native client (`voice.gd`, `voice_peer.gd`, `voice_codec.gd`, `voice_window.gd`): Godot's `WebRTCPeerConnection` has no media tracks, so the sound is **mu-law audio on one negotiated, unordered, `maxRetransmits` 0 data channel** (id 1): 16 kHz mono, 20 ms (320 samples) a packet, a 16-bit sequence number in front, about 16 kB/s a peer. No Opus and no echo cancellation: the room rules keep echo away.
**Push-to-talk by default** (hold `C` or the window's button; the key can be changed), open microphone as a setting. The `talking` report is held back to 150 ms (`VOICE_TALKING_MIN_MS`). The microphone is open only while this device is the speakerphone, somebody is in another room and the mic setting is on. It needs the **`webrtc-native` 1.2.2-stable GDExtension**, not committed: `tools/fetch-webrtc.sh` fetches it into `addons/webrtc/` (git-ignored) for CI and for a developer, and the exports bundle it; the macOS export carries the microphone usage description and entitlement. Without it `Voice.available` is false, the HUD button is hidden and the pause menu says "Röstprat finns inte i den här versionen".
Checked headless by `--voicecheck --require-webrtc` (codec, rules, two peers in one process) and `BOT_ONLY=voice` (two bots, the server side). Microphones and speakers cannot be checked headless; the owner has not yet heard it.

### The character creator

The login screen's "Ny karaktär" button (shown once the gate says `ok` and not when `/api/gate` says `canCreate: false`) opens `CreatorWindow` (`creator_window.gd`): a name field (16 characters) and four rows with arrows (skin tone, hair colour, hair style, shirt), a live preview from `LookComposer` at 8×, "Skapa" posts to `/api/players`. Errors are shown in Swedish (`creatorErr*` in `sv.ts`): empty name, a guest device out of characters (403), not let in, the farm full (409), the server not answering. Checked by `--creatorcheck` (it reads the character back from the server and compares the look); the picture is `packages/godot/docs/creator.png`.

---

## 6. Access control, deploy, CI and the bots

### Access control and the parent page

Default on; `ACCESS=open` turns it off (home network only, tests, dev). A **device** is approved by a **join code**:

- `invites` rows hold a hashed 8-character code (alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`: 31 symbols, no 0/O/1/I/L, about 40 bits), a label, a kind, a device limit (1–5), an expiry (1 hour–30 days) and an approval mode: `auto` (the device is in at once and the parent gets a push) or `parent` (the device waits with a 6-digit number the parent approves).
  Typed in the game ("Har du en kod?") or on the download page, or carried in a `/join#CODE` link. **Kinds**: family (all characters) and guest (only characters it created, 0–3, or was given). "Öppna igen" makes a one-device code bound to an existing device that swaps its key. Wrong codes: 10 per address per 15 minutes, 100 per hour overall.
- A device's token is long and random; only its sha256 is stored (`devices`). Browsers keep it in an `HttpOnly`, `SameSite=Strict` cookie (`vt_device`, used by the gate and parent pages); the native client sends it as a bearer. Everything but the gate pages (`/access`, `/join`, `/admin/login`, `/health`, the download page `/`) requires an approved device that may play right now.
- **Rules** the parent sets: mode closed / family only / family + guests, play hours (Europe/Stockholm, may wrap midnight), pause or remove per device. The server re-checks open sockets on every change and every 15 s and closes them with **4003**.
- **The parent page** `/admin`: `PARENT_PASSWORD` (12+ characters, scrypt-compared; the server will not start without it unless `ACCESS=open`), optional TOTP, 8-hour in-memory sessions, 5 failed logins per address per 15 minutes and 30 per hour overall. It makes codes, lists and manages devices, shows the gate log (`access_log`), and has game controls: force a season, pick the weather,
  set the time (`/admin/time`, `/admin/evening`, `/admin/morning`), save now, skip a day, show who is online. With `ADMIN_PORT` it lives on its own listener (meant for a Tailscale address; `ADMIN_HOST`) and the public listener answers 404 for `/admin`. `NTFY_URL` pushes gate events. Public use goes through a tunnel (`PUBLIC_URL`, `TRUST_PROXY=1`), not open ports.
- Web hardening: origin checks on forms and the socket, strict CSP, no framing, `noindex`, `/health` reveals nothing. See README "Who may enter" for the parent's view.

### The download page

`GET /` (`pages.ts` `downloadPage`; no JavaScript, public even for devices without access) shows the name, the latest GitHub Release, the four builds by stable names (`releases/latest/download/varldstradet-{windows-x86_64,macos-universal,linux-x86_64,linux-arm64}.zip`), the address to type into the game, and the join-code field. `release.test.ts` keeps the page's links and the workflow's zip names in step. The links work from the first `v*` tag.

### Deploy

- **The image**: `docker.yml` builds the `Dockerfile` (typecheck and tests inside the build, the server bundle, production `node_modules`, `drizzle/` migrations, a `/health` check, user `node`) and pushes `ghcr.io/tobiasbernting/varldstradet:latest` and `:<sha>` on pushes to `main` (pull requests build without pushing). It holds only the server: the game is downloaded from the GitHub Release. The package must be made public (or the server logged in to ghcr) before another machine can pull it. Migrations run on boot.
- **The instance**: one Node process and a Postgres database of its own on the family's Hetzner box, behind the Cloudflare tunnel at `spel.<domain>` (`PUBLIC_URL`, `TRUST_PROXY=1`), parent page over Tailscale (`ADMIN_PORT`). The Ansible role lives in the homelab repository (`tobiasbernting/homelab`), not here; README "Running your own server" says what it sets up. The old browser game's farm and image (`lilla-garden`) are separate and untouched.
- **The save import** (the owner decided on 2026-11-07 that Världsträdet is a new game with a fresh world and no ported save, so the tool is kept but not needed; compatibility code may go in a later cleanup): `pnpm --filter @lilla-garden/server import-save <dump|url> --target <empty database> [--dry-run]` (`importSave.ts`, `importSaveCli.ts`) moves the family's world from the old game: players with coins, stars, bags, clothes, achievements and saga progress; buildings, crops, animals, pets; explored maps; the day count. It reads the source read-only (a dump is just a file; a live source runs in a `READ ONLY` transaction), refuses a target that is the same database or already holds a world, applies the migrations (0004 drops the minigames' leftovers), and writes in one transaction. Devices, join codes and gate settings do not come over. The first start tidies what an old save needs (färdport and shoot, level rewards). Not in the image; run it from a checkout. A relative dump path resolves against `INIT_CWD`.
- **Environment** (`DATABASE_URL`, `PORT`, `SEASON_OVERRIDE`, `PARENT_PASSWORD`, `ACCESS`, `PUBLIC_URL`, `ADMIN_PORT`/`ADMIN_HOST`, `NTFY_URL`/`NTFY_TOKEN`, `TRUST_PROXY`, `STUN_URLS`, `TURN_*`, `CLOUDFLARE_TURN_*`, `DEV_TELEPORT`): the table is in the README.

### CI

Three workflows in `.github/workflows`:

- **`server.yml`**: typecheck and test `shared` and `server` on every pull request and push to `main`, with a real Postgres service so `importSave.pg.test.ts` runs. (Timeout 15 minutes.)
- **`docker.yml`**: the image above, with the same typecheck and tests inside the build.
- **`godot.yml`** ("Godot client", Godot 4.7.2 pinned by URL and SHA-512, cached, set up by `.github/actions/setup-godot`). Concurrency cancels superseded pull-request runs.
  - **`export`** (on every PR, timeout 20 min, target well under 10): the generated files are up to date (`pnpm godot:gen` and `git diff --exit-code`); the main scene, the Draugkryptan demo and the scripted fight headless (a script error, a leak at exit or a parse error fails); the farm, forest, farmhouse and village demos; the alive world on every preset (`--alive=all`);
    a real Forward+ shader compile under Xvfb with lavapipe; `--placeholdercheck`; `--voicecheck --require-webrtc`; **eight fighter-bot pairs side by side** (the eight dungeons after Draugkryptan, the dev way in, two packs each); the **bosses' moves of those eight** played headless with their asserts (`demo_bosses.gd`, `bosses: ok`) beside the saga's ending (`demo_ending.gd`, `ending: ok`);
    and the exports of Windows x86_64, macOS universal, Linux x86_64 and Linux arm64, zipped under the stable names and uploaded as `varldstradet-builds`.
  - **`bots`** (on every PR, own runner, timeout 20 min): `pnpm godot:bot` in memory (fighters, the arch walker, the creator check, the settings check, the voice server check, the farmer) and the run pair, side by side. The release job needs both.
  - **`pictures`** (manual `workflow_dispatch` only, timeout 60 min): everything under Xvfb with software GL, which takes 20+ minutes: pictures of the farm by day, night and rain, each dungeon's start room, hall and bosses' moves, the alive world, the settings window at 175 % and the telegraph palettes, the windowed farmer and run pair; uploads `farm-screenshots`. Keepers are copied by hand into `packages/godot/docs/`.
  - **`release`** (only on a `v*` tag): attaches the zips to a GitHub Release. A manual run never publishes; `gh workflow run godot.yml --ref <branch> -f pictures=false` is the release dry run.
  - **Budgets**: the `export` and `bots` jobs should each stay under about 9.5 minutes (a PR's CI about 5–6 minutes in practice); slow steps go in `pictures`, never in `export`.

### Bots, demos and checks

All headless against a server in memory (`ACCESS=open`, `DEV_TELEPORT=1`, no Postgres), driven by `tools/bot-check.mts` (`pnpm godot:bot`; `BOT_ONLY=` `walker`, `farm`, `creator`, `voice`, `settings`, `run`, `dungeon` with `BOT_DUNGEON=<id>`; `BOT_ARCHES=` picks which arch walkers run):

- **Fighters** (`bot.gd`): two bots log in through `/api/gate` and `/api/players`, take the dev way into a dungeon, find the first pack by breadth-first search with `hero.gd`'s own solidity rule, cast on cooldown, step out of telegraphs with the server's `inZone`; the check is that each sees the other's casts and both agree on every monster's health at every `state`.
- **The arch walkers** walk to Draugkryptan's arch and use it without the dev message (`saga:draug`); a map walker (`--mapcheck`) opens the world map and minimap through the real input path, fast-travels home and back, meets a later chapter's lock, sends `dev unlock` and goes in by the arch; walkers for the other arches run in two lanes (Surts smedja and Bifrost, five maps out, only with `BOT_ARCHES=surt,loke`; a shared test covers all nine arches' place, walkability and entry rules). **The farmer** (`farm_bot.gd`, `farm_bot_home.gd`, with `tools/friend.mts` as a neighbour) plays a whole farm evening through the same buttons a person presses and compares its bag, coins and stars with the server's record; it also asserts the startle rule and the soundscape, and covers Smedjan, paint, the books, marks, help and the family window (`farm_bot_books.gd`, `tools/mate.mts` as a second player).
  **The run pair** (`run_bot.gd`) plays a run to zone 2 (`--full` to the boss locally). **`--creatorcheck`**, **`--settingscheck`** (about 120 steps: every setting changed through its own controls, kept, saved, applied), **`--voicecheck`**.
- **Demos** (no server): `--demo[=farm|forest|village|house|frost|surt|hel|dvarg|orm|alv|fenrir|loke|lineup|ending]` with `--time`, `--weather`, `--season`, `--year`, `--at`, `--screenshot`, `--fight`, `--once`, `--boss-move=<species>:<move>[:after]`, `--quality`, `--alive=all`, `--people3d`; `--bench[=preset] [--scene=farm|village]`. Fixtures come from `tools/export-fixture.mts`.

---

## 7. Retired

One line each; the code is in git history (`git log --stat` on the dates), and `tobiasbernting/lilla-garden` keeps the browser game as it was.

- **2026-10-30 · the 3D version** (`packages/client3d`, Three.js, the voxel block layer, `WORLD_MODE`, image `lilla-garden-v2`): removed to keep one game.
- **2026-10-30 · the Phaser client and the `gard-ljs` trial farm**: retired the day the LittleJS client became the default.
- **2026-11-01 · the minigames** (`packages/arcade`, Rallyt, Snöbollskriget, Minigolfen, Hönan Hilda, Dansbanan, Stjärnstorm, Spelhallen, the stuga TV, tickets and prizes) and **Rallyvärlden** (the garage, `rally.ts`, `rallysim.ts`, `races.ts`, the `garage`, `race`, `roam` messages): M1 of PLAN.md. Migration `0004_remove_minigames` and `scrubPlayer`/`scrubArea` clean older saves.
- **2026-11-02 · the browser clients** (`packages/client`, the LittleJS `packages/clientljs`, the PWA manifest and icon routes, `findClientDist`/`CLIENT_DIST`): M5a. The pixel art moved to `packages/art`; `/` became the download page. The browser's Röstprat and its character creator went with it (both rebuilt natively on 2026-11-06).
- **2026-11-07 · duplicates of the atmosphere pass**: fireflies, chimney smoke, autumn leaves in the trees, dawn mist, the pond at night, the window beams, its wind sway and fog banks were dropped in favour of M7a's versions when the two branches met.
- **2026-11-07 · the modern look of Köpingen in the native client** (asphalt, zebra crossings, traffic lights, a red car, a flat quad for Diligensen): replaced by the Viking look the browser game had.
## Runs R3: the route (2026-11-07)
GAME2.md section 5.6 has the numbers; this is how it hangs together.
- **A run is one dungeon.** `generateRun(seed, {boss, level, …})` (`runmap.ts`) returns a `RunPlan` with `route` (`generateRoute(seed, {dungeon, level})`: a row-major graph, ten rows, up to three lanes, node 0 is row 1 and the last node the Boss) and `stops` (one `StopPlan` for every node: the rooms, packs, gate and numbers; the same seed gives the same plan). `buildStop(plan, node, key)` builds a stop's map with `sagamap.buildDungeon`, so it has the chapter's floor, walls, light and decor, and its monsters (`dungeonMobs`). A Flock is laid out in four rooms of one of the seven biome templates (`ZONE_TEMPLATES`, now only `rooms` and `links`); the Vilosten, Mellanboss and Boss stops have layouts of their own in `run.ts` (`REST_STOP`, `MINI_STOP`, `BOSS_STOP`) with the dungeon's own hall sizes. The kinds are `flock | mini | rest | boss` (`NodeKind`); the others of GAME2 come in R4/R5.
- **The flow.** `RunState.phase` is `stop → pick → route → stop …` (`victory`, `ended`). When a stop is cleared (`watchStop`: a Flock when its gate opens, the Mellanboss when it falls, a Vilosten at once) a Flock or Mellanboss starts the vote on a runa as before (`pick`: `settleVote` now uses `tally`, the one rule of both votes), then `startRoute` puts a `run_exit` object (a väg-runa) on the floor of the exit room for each stop the next row leads to and `inst.run.exits` tells the bots where. `tickRoute` is the vote: a player counts on the rune within `ROUTE_DISC_RADIUS` of its middle, after `ROUTE_DWELL_MS` on the same rune (or at once by using it), all online humans in the stop on a rune ends it, else `ROUTE_VOTE_MS` after the first player stepped on one; the most players win, a tie goes to the Stigfinnare (`finderOf`: humans in party order, `RunState.turn` counts the rows). Followers and offline players never vote. `enterStop` builds the next map, moves everyone in and drops the old one (`RunState.node`, `path`).
- **The wire.** `RunSnap` carries `node`, `row`, `kind`, `path`, the whole `route` (`RouteNodeSnap[]`), `finder` and, while the way is being chosen, `choices` (`RouteChoiceSnap`: node, kind, tile, who stands on it) and `routeLeft`; `RunOfferSnap.zone` is `node`; the `ended` change has `path` (the kinds walked). `run start` takes `dungeon` (an id; `runnableDungeons`: the cleared ones and the next; anything else is refused with `RUN_T.badDungeon`); left out it is the player's current chapter, as `replay` always was.
- **Client.** `RunHud` draws the rail (`_update_rail`), `RouteView` (`route_view.gd`) the rune marks (projected from the tile onto the camera: the picture of the stop, the names on it, my ring), the compass over the Stigfinnare and the map overlay (`route_map` action: R, the pad's misc button), `RunEnd` the route taken, `RunWindow` the dungeon row (◀ ▶; a world arch sets `RunWindow.preset` before it opens the window). `Data.zone_look` is now the chapter's dungeon for every stop. The run pair bot (`run_bot.gd`) takes a lane (`--lane=rest|safe|random`) and stops at `--rows=N` (5: the first wing).
- **Bots.** `BotMind.lane` (`runbot.ts`): the careful bot takes the safe lane (a Vilosten when it or a friend is hurt, else a fight), the clumsy bot a random one; `runtune.ts --dungeon --parties --lane` prints the tables.
