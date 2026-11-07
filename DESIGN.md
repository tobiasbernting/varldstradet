# Lilla Gården — design

Agreed design (2026-10-24). A 2D pixel top-down farm game in Swedish for one parent and two kids (7 and 9), playable on an Android tablet (Chrome) and a computer, co-op over the home network.

## Stack
- pnpm monorepo: `packages/shared` (types, item/crop/recipe data, sim, Swedish strings), `packages/server` (Node, `ws`, authoritative 20 Hz tick, Postgres via Drizzle), `packages/godot` (the native Godot 4 client, the only client: Windows, macOS, Linux; it renders what the server sends and sends intent) and `packages/art` (the pixel art drawn in code, rendered once to the sprite sheets in `packages/godot/assets/sprites`; nothing runs it at play time). The browser clients (`packages/client`, Phaser 3 and later `packages/clientljs`, LittleJS) were retired on 2026-11-02, see "The browser client retired" below; the server's web page `/` is now the download page.
- Code and identifiers in English; every player-facing string in `packages/shared/src/sv.ts`.
- Vitest on `shared` sim logic.
- Dev: `compose.yaml` runs Postgres 17 on port 5435; `pnpm dev` runs server + client; tablet connects to the computer's LAN IP.

## Co-op
- One persistent shared world. Each player on their own device.
- Character picker ("Vem är du?"), no passwords, max 8 characters, device remembers last pick.
- Emote wheel (hjärta, skratt, hej, hjälp, titta, sova); names over heads.
- 2D (2026-10-29): text chat to everyone in the world (80 characters, ready-made phrases, bubble over the head, last 20 lines for whoever logs in; not saved).

## World
- Handmade 64×64 tile map: farmhouse (gårdsbutik = shop stand, garderob, kista, arbetsbänk, säljlåda), open fields, forest edge (trees/rocks/grass regrow after a few days), pond.
- Day = 10 real minutes, auto rollover, no forced sleep, world frozen when nobody is online.
- Gentle rules: nothing dies, no stamina, tools never break, anyone can break anything.

## Farming
- Tools: hacka, vattenkanna (20 charges, refill at pond/brunn), yxa, spett, lie, hammare, borste.
- Crops: morot, potatis, jordgubbe, tomat, pumpa, solros, vete. Watering makes them grow at day rollover; harvest returns seeds.

## Animals
- höna, får, ko, kanin. Named on arrival, 0–5 hearts from feeding (hö), petting, brushing. Products (ägg, ull, mjölk) when happy. Babies grow in 3 days.
- Bought from the Gårdsbutik but require the matching built house (hönshus, kaninbur, fårhus, lada); arrive next morning ("En ny vän har flyttat in!").

## Building & crafting
- trä/sten/fiber from trees/rocks/grass → recipes at arbetsbänk: staket, grind, stigar, väggar, golv, dörr, kista, matho, fackla, fågelskrämma, bänk, bord, blomlåda, brunn, djurhus.
- Free grid placement anywhere except water.

## Economy
- Per-player kr, start 150. Säljlåda sells instantly. Gårdsbutik tabs: Frön, Djur, Foder, Material, Kläder, Säsong.

## Clothes
- Layered tintable character (hair, shirt, pants, shoes, hat). Bought clothes go to the Garderob.

## Seasons (real calendar, Europe/Stockholm)
- Halloween 24 okt–1 nov, Jul 1 dec–6 jan, Påsk palmsöndag–annandag påsk, Midsommar the week up to midsummer day.
- Each: a Säsong tab with clothes + decorations, map dressing, one twist (wild pumpkins; animals in tomteluvor + snow; påskägg; flowers everywhere).
- `SEASON_OVERRIDE` env and `/admin` parent page (force season, online players, save now, skip day).

## Inventory & controls
- 8 hotbar + 24 backpack, stacks of 99, kista 32 slots.
- Ryggsäck/kista (2026-10-31): search field + icon filter chips (verktyg, frön, mat, material, bygg, annat) dim non-matching slots; "Sortera" asks the server to sort backpack slots 8–31 (hotbar never moves) or an open chest; "Lägg i kistan" moves backpack stacks that match items already in the chest. Slot indices stay the protocol; filtering is display-only.
- Shop (2026-10-31): the `mailbox` object kind is kept for saves but is drawn and named as a Gårdsbutik (farm shop stand). Buying stays instant for goods, next-morning for animals; the shop shows every player's pending animal orders ("På väg i morgon"), "Du har N" per item, and search across all tabs. Protocol additions are only new message types (`sort`, `quickStack`); old clients/servers ignore them.
- Touch: virtual joystick + context action button. Desktop: WASD/arrows + E/space, mouse click acts on a tile.

## Art
- Kenney CC0 Roguelike packs (RPG, Characters, Indoors) for terrain, trees, fences, walls, furniture. Code-generated pixel art for characters, animals, crops and item icons.

## Deploy
1. Local play first.
2. Public GitHub repo `tobiasbernting/lilla-garden`, GitHub Actions builds the image → GHCR.
3. Homelab PR (`~/repos/homelab/server`): `roles/postgres` (postgres:17, DB + user per project, vault creds, nightly `pg_dumpall`, 14 days kept) and `roles/lilla-garden` at `garden.moderskepp.lan`, following the meal-planner role pattern.

## Later
NPCs, in-game seasons, processing machines, more areas.

## Ownership (2026-10-30)
Whatever a player places remembers who placed it (`WorldObject.by`). Only that player can take it down: the hammer (or any tool, or a rocket blast) on someone else's build gives "X byggde den – bara X kan riva den." and leaves it standing. Builds whose builder no longer exists on the farm, and everything that grew by itself, can be taken down by anyone. Chests can still be opened by everyone.

## v2: 3D (2026-10-25, retired 2026-10-30)
A Minecraft-looking version of the same game (`packages/client3d`, Three.js, deployed as `lilla-garden-v2` at `gard2`), with a block layer in the shared sim (`WORLD_MODE=voxel`) to dig and build in. Retired on 2026-10-30 to keep one game: the client, the block layer, the dig/place messages and the `WORLD_MODE` switch were removed; the last `lilla-garden-v2` image stays in the registry.

## 2D additions (2026-10-29)
- Pets and horses: "Stanna!" makes your pets and horses on your map potter around where they are (they are left behind when you change map); "Vissla" calls them back, fetching pets from any map (not into the cave). A whistled horse follows you around the farm like a pet until told to stay.
- Villager conversations: a "Prata!" button in the villager window opens a dialogue tree (`shared/src/dialogue.ts`): each villager has their own stories, a question for the player and opinions on the weather; jokes, riddles, "how are you" and the weather are shared. Elsa plays sten, sax, påse. Client-side only.
- Weather (`shared/src/weather.ts`): one sky for the world, not saved. Kinds drift in a weighted random pattern (sun, cloudy, rain, storm, snow, hail, wind, fog), 0.5–7 real minutes each; snow is likely in winter months and rare in summer. Ice areas get snow instead of rain, the desert only wind. Rain waters every field after a few seconds; after 25 s of snow the ground turns white; sun after rain gives a rainbow. Toasts announce changes; `/admin` can pick the weather.

## 2D client: LittleJS (2026-10-29, retired 2026-11-02)
History: this client is gone (see "The browser client retired"); `packages/client/src/art` is now `packages/art/src`.
Started as a side-by-side prototype (image `lilla-garden-ljs`, its own `gard-ljs` farm) and became the default the same day: the main image `lilla-garden` ships it, against the same server and saves, so existing farms carry on unchanged. The Phaser client was kept as `lilla-garden-phaser` for a day; it and the `gard-ljs` trial farm were retired on 2026-10-30.
- Same server, sim, protocol, HUD, menus, sounds and generated pixel art (the 2D client's modules via `@v1/*`); only the view is new. Same prediction, interpolation and edge travel as the Phaser scene.
- The generated canvases are packed into one or two texture sheets at boot (LittleJS starts a new WebGL batch on every texture change), and the y-sorted world is written straight into LittleJS's batch with `glDraw`.
- Drawn at screen resolution with a whole-number zoom, so sprites can turn, lean and squash without losing crisp pixels; the HUD keeps its 320×180 grid, anchored to the window's edges like v2.
- Light: LittleJS's light system multiplies the scene by a light map: the ambient colour follows the time of day, weather and season, and point lights come from lamps, torches, stoves, houses, lanterns carried by players, headlights and explosions. Lit windows (the glass pixels of buildings recoloured), fireflies and lightning are drawn after the light map, so they shine by themselves. Indoors the outside is blacked out, as in the Phaser client.
- Sun shadows are the sprites' silhouettes sheared along the ground away from the sun (falling west in the morning, behind things at noon, east in the evening), drawn in slices since WebGL quads can't shear, under everything that stands.
- Cozy extras, each switchable with `?fx=…` for comparing (all on by default): seasons in the trees by the real calendar (autumn colours and falling leaves, snow on the branches with snow on the ground, blossom in spring); light falling out of lit windows, painted straight into the light map; chimney smoke; indoors a closer camera, sunbeams with dust and a fade in and out; butterflies and sparrows; lily pads, jumping fish and the night sky mirrored in the pond; dawn mist and dew; wet ground and puddles in the rain; a post-process glow, vignette and warm grade, and a tilt-shift blur; and synthesized ambient sounds (crickets, owl, birdsong, fire crackle, rain on the roof indoors).
- Safety nets for screens we haven't tried: without WebGL 2 the player gets a message instead of an empty world, and when the frame rate stays under 45 the glow/tilt-shift pass turns itself off.

## The wider world (2026-10-29)
More biomes, caves with treasure, and the moon; the farm and everything the family built stay as they are.
- 15 kinds of place. `biomeAt` keeps every city exactly where it was; a ring of fixed biomes around the farm (forest north, swamp west, meadow south, mushroom forest north-east, dinosaur valley south-east, mountains past the city, beach, ice, desert, jungle and volcano two maps out, the space base at 1,3) puts something new next door; further out the north is cold, the south hot (desert, jungle to the west, volcanoes to the east), the sea west and the mountains east, with Godislandet rare and at least five maps away.
- Each biome has a painter (`shared/src/painters.ts`) on a shared toolkit (`worldgen.ts`: value noise, blobs, scattering, cave hills): ground, water, cliffs (`rock`, `sandstone`, `basalt` — impassable terrain with faces drawn towards open ground), lava, bog, chocolate rivers, then landmarks, plants and finds. Last, `connect()` clears the four openings, lays trails to the middle where they suit the biome (boardwalks in the swamp, dirt paths in the forest and jungle) and carves the cheapest way (bridges over water, passes through cliffs) to every opening, cave mouth and chest that would otherwise be cut off. Tests walk every biome to check that everything can be reached.
- Caves out in the world (`caves.ts`) are areas keyed `g:<map>#<entrance id>`, generated from their entrance the first time anyone goes in and saved like any other map: a cellular-automaton cavern in the biome's theme (11 themes: roots, ice, crystals, pirates, pyramid, temple, lava, mushrooms, fossils, candy, space), torches in the built ones, crystals, ore and finds by the walls, a pool, a loot chest at the far end and sometimes a secret room behind rubble (break it with the pickaxe). No monsters: the farm's own cave is for fighting.
- Loot tables (`LOOT` in data.ts) for cave chests, the shipwreck and UFO chests, dig spots (an X in the sand, dug with the hoe, loot by biome), fossil rocks and fairy rings (once a day each). A loot chest gives every player something once a week (`openedBy`); clients draw it open for whoever emptied it. Clothes in a chest go to the wardrobe (a gem if you already have them).
- Regrowth: a map remembers how many renewable things it had (`renew`); each morning a quarter of what was picked, mined or dug up grows back (never in openings, in front of entrances, under people or where it would block a passage).
- The space base has a rocket to the moon (`space.ts`): a disc of moon dust floating among the stars with craters, moon rocks, star crystals, moon cheese, aliens, a crashed UFO with a chest, a cave, a Swedish flag and the Earth in the sky. The rocket flies back. The 2D clients play a launch cutscene and let everyone bounce on the moon.
- New wild animals for the new biomes (frog, parrot, monkey, salamander, hedgehog, dino, gummy bear, alien; some in several colours), all tameable with the lasso. A dragon egg (a rare lava-cave find) hatches overnight into a pet dragon for whoever put it down.
- Discovering a new kind of place gives a star; new achievements for biomes, caves, chests, dig spots, fossils, the moon and the dragon; villagers ask for things from the wild; a help page about adventures.
- Saved maps: on load, explored maps from before (no `gen`) that nobody changed (nothing built, farmed, dropped, tamed or dug) are rebuilt with today's generator, and anyone standing in one is moved to open ground; changed ones are kept, get a cave in a still-wild spot and regrowth of their biome's finds. Cities are never touched. The welcome message carries the biome of every explored map, so the world map shows them all.
- 2D clients: caves are drawn like the farm's cave (dark, rock all around); lava, crystals and glowing mushrooms light up the dark; the moon has its own dim, starry light and no weather; each place has a quiet soundscape (frogs, parrots and cicadas, bubbling lava, surf, fairy chimes, a music box, cave drips, the hum of space).

## Minigames (2026-10-30, removed 2026-11-01)
Six minigames (Rallyt, Snöbollskriget, Minigolfen, Hönan Hilda, Dansbanan, Stjärnstorm) in `packages/arcade`, played on the TV at home and on the machines in Spelhallen in every city, with tickets and a prize counter. Removed on 2026-11-01 as milestone M1 of `PLAN.md`: this repository becomes a native Norse roguelite built on the saga and the farm, and the arcade (44k lines, more than the rest of the game together) was outside that game and in the way of the rewrite. `packages/arcade`, `arcade.ts`, `hall.ts`, the `arcade` and `prize` messages, the TV, Spelhallen, the prizes and the cartridge loot went; migration 0004 drops what they left in the saves, and `scrubPlayer`/`scrubArea` clean older saves on load. The web game in `lilla-garden` keeps them.

## Access control (2026-10-29)
Sharing the world beyond the family. Default on; `ACCESS=open` restores the old open LAN behaviour.
- Device-based: an approved device holds a long random token in an `HttpOnly`, `SameSite=Strict` cookie (only its sha256 is stored, in `devices`). Everything but the gate pages (`/access`, `/join`, `/admin/login`, `/health`, the download page `/`) requires an approved device that may play right now.
- Join codes (2026-10-30, replacing one-time links): `invites` rows hold a hashed 8-character code (32-symbol alphabet without 0/O/1/I/L, 40 bits), a label, kind, device limit (1–5), expiry (≤30 days) and approval: `auto` (approved at once, the parent gets a push) or `parent` (a pending device with a 6-digit number for the parent to approve). Typed on `/access`/`/join` or carried in a link's fragment. "Öppna igen" makes a one-device code bound to an existing device that swaps its key instead of creating a device. Wrong codes: 10 per IP per 15 min, 100 per hour overall. Kinds: family (all characters) and guest (only characters it created or was given; creates 0–3).
- `ADMIN_PORT` splits the parent page onto its own listener, meant for a Tailscale address; the public listener 404s `/admin`. `NTFY_URL` pushes gate events (JSON publish to the ntfy server root).
- Rules: mode closed / family only / family + guests, play hours in Europe/Stockholm, pause/remove per device. The server re-checks open sockets on every change and every 15 s and closes them with code 4003; the clients then go to `/access`.
- Parents: `PARENT_PASSWORD` (scrypt-compared), optional TOTP stored in `settings`, in-memory 8 h sessions, per-IP and global rate limits. Gate events go to `access_log`.
- Sharing it publicly is meant to happen through a tunnel/proxy (`PUBLIC_URL`, `TRUST_PROXY=1`), not by opening ports.

## Röstprat (2026-10-31)
**Voice has a native client again (2026-11-06), see "Godot client: Röstprat" below.** The browser side described here went with the browser client in M5a; the server side (`voice.ts`, `ice.ts`, the `voice` messages, the parent's off / family / open setting) is unchanged. The room and speakerphone design below still holds.

Talking to the players who are not in the room: a parent and two kids on the sofa, an uncle at his place. The trap is
the room itself: with a microphone open on every tablet, the uncle's voice would come out of three speakers, be picked
up by three microphones and come back to him three times with a delay (browser echo cancellation only removes a
device's own output), and the kids would hear each other live and again through the speakers. So:
- **Voice is per room, not per player.** Every device is in a room; by default everyone behind the same public
  address (the same home Wi-Fi) shares one, so the uncle's house is a room of its own. You never hear the players in
  your own room. The window lets a device say it is in another room ("Jag sitter i ett annat rum") or in another
  player's room ("Jag sitter hos …", for a phone on mobile data at home).
- **One speakerphone per room.** The first device in a room to pick up (📞, "Ring upp") is the room's speaker: the
  only one that opens its microphone and plays the other rooms' speakers. The other devices in the room never ask for
  a microphone; any of them that has picked up can take over ("Använd den här som högtalare"), and when the speaker
  hangs up or drops off, another device there that picked up takes over, else the room falls silent. A family evening
  is two or three audio streams, not eight.
- **Straight between the browsers.** WebRTC audio between the rooms' speakers (a mesh, at most eight), signaled over
  the game socket (`voice` messages: `join`/`leave`/`speaker`/`room`/`signal`/`talking`; the server relays `signal`
  only between the speakers of different rooms, 40 a second and 16 kB at most). Perfect negotiation with `offers()`
  deciding who is impolite; the polite side waits for the first offer. The server never sees sound and saves nothing.
  `shared/src/voice.ts` has the types and `voicePeers`/`mySpeaker`/`offers`; `server/src/voice.ts` the rooms (keyed
  by address, shown to clients as a hash); `client/src/ui/voice.ts` the window, the microphone and the connections.
- **Servers.** STUN by default (Cloudflare's public server); optional TURN from the environment: a fixed login, a
  coturn with `use-auth-secret` (short-lived HMAC logins made by the server) or Cloudflare's TURN service (logins
  fetched from its API and cached, `server/src/ice.ts`). The public farm has no open inbound ports, so a relay of
  its own is out and Cloudflare's is the fit. Sent to a device when it becomes a speaker.
- **Family rules.** The parent page chooses off / family only (default) / family and guests; guests left out never
  see the button. Open microphone with a mute button rather than push-to-talk (holding a button while steering on a
  tablet is hard for a seven-year-old); echo cancellation, noise suppression and gain control on. The speaker device
  measures its own level and reports `talking` on/off, shown as 🔊 by that player's name for everyone (the game cannot
  know which of the three people around a speakerphone is talking). A new speaker in another room rings: a toast and
  the chat sound. Microphones need a secure context, so LAN dev is tried with `VITE_HTTPS=1` (self-signed). A device
  without a microphone (a desktop, often) stays in the call as a listener (a `recvonly` line); a refused microphone
  says why (not allowed, in use, plain http) and hangs up once.

## Rallyvärlden (2026-10-30, removed 2026-11-01)
The rally minigame grown into a garage on the farm, cars to buy, tune and style, races with the family and a 3D free roam (`rally.ts`, `rallysim.ts`, server `races.ts`, the `garage`, `race` and `roam` messages, `client/src/ui/rally.ts`). Removed on 2026-11-01 with the minigames (milestone M1 of `PLAN.md`): a racing world does not belong in the Norse roguelite, and it was the biggest reach of the arcade into the shared sim, the server and the saves. Garages are dropped from `PlayerState` by migration 0004 and on load. The web game in `lilla-garden` keeps it.

## Sagan om Världsträdet (2026-10-30)
Dungeons for the family in the spirit of the big online adventure games, with everything frightening taken out: nothing bleeds, monsters "poof", bosses are a bit silly, and falling costs nothing. Völvan Sigrun tells the saga by the Kämpastenen on the city square.
- `shared/src/saga.ts` is the data: four classes (`CLASSES`: Väktare tank, Helare healer, Krigare and Magiker damage, each with four `SPELLS` of 14 kinds from melee to blink), the three first dungeons (`DUNGEONS`: Draugkryptan, Frostjättens borg, Surts smedja, each a 64×64 plan of nine rooms with a start, packs, two rest stones, a treasure room, a gated section after the mid-boss and the boss), `SAGA_MOBS`/`SAGA_BOSSES` (bosses mark their big attacks on the ground first and call helpers at each health phase; `interrupt` moves can be stopped by Sköldslag, Stormsteg or Isspjut), the chapters, `SAGA_ITEMS` and the loot tables. `sagamap.ts` builds a dungeon from its plan; `sagasim.ts` is the rules (threat, leash, packs, casts, zones, rest stones, wipes, chests).
- Each dungeon is an area `saga:<id>` that is generated when the first player walks through its arch and thrown away three minutes after the last one leaves (`SAGA_RESET_MS`); it is never saved, so a restart puts everyone in front of the arch. Monsters scale with the party (`mobHpScale`, `bossHpScale`), go for whoever has the most threat (the tank makes sure it is the tank) and give up when dragged 22 tiles from home. Everyone falling is a short pause and then up at the last rest stone, the monsters healed. Loot chests give every player their own once (`found` keeps pets, mounts and clothes from repeating while there is something new); the bosses' chests give coins, stars, weapons, clothes and, rarely, pets and mounts.
- The numbers were tuned by playing every dungeon with bots (one to four players); a family of three did the first act in 45–60 minutes. The client draws all of it (the Godot scenes in `packages/godot`, from the art in `packages/art/src/saga.ts` and `sagaanimals.ts`), with a dungeon as dark as a cave but in its own colour (`DUNGEONS[id].ambient`).

## Sagan om Världsträdet II: Lokes list (2026-10-31)
The family finished the three dungeons in an hour or so and wanted more of it: a longer story, more dungeons, to walk the world as their class with spells and a sword, and a window for the loot. So the saga grows to ten chapters (3–4 evenings), and the game gets a hero switch, gear and levels. Same rules as before: nothing frightening, nothing lost.
- **The story.** After Surt falls, the Yggdrasil shoot the family planted whispers at night. Völvan dreams of laughter: Loke set the three free, and now his servants roam Midgård. Chapters 4–10 of `SAGA_CHAPTERS` each have a *field task* (`field`: kill `count` of a `target` out in the world, counted in `prog.quests['field:<chapter>']`) and, from chapter 5, a dungeon; a chapter is done when all its parts are. Hels port (swamp), Dvärgarnas guld (mountains), Havsormen (beach), Skuggan över Alfheim (mushroom forest), Fenrisulven (ice) and finally Ragnarök on Bifrost by the space base, where Loke conjures illusions of every boss the family has beaten. Loke ends tied up "tills nästa gång", so a part III stays possible. Chapter 4 explains the hero switch. The rewards are decor for home (`hels_lykta`, `dvargstaty`, `ormtand`, `alvlykta`, `fenrislanka`, `bifrostbit`) and titles.
- **Six dungeons** in `DUNGEONS` (`DUNGEON_IDS` order): Helheim, Svartalfheims gruvor, Havsormens tempel, Alvernas lund, Fenrisklyftan, Bifrost; each 9–11 rooms with its own shape (a spiral, a ring with a hub, two wings, a long descent), two or three rest stones, a treasure room and a gated section, 15–20 minutes with two or three players. A new room kind `puzzle` (`sagamap.ts`) puts three `saga_plate` objects on the floor and a `saga_gate` across the corridor that leaves the room; `tickSaga` lights a plate when a fighter stands on it (variant 0 dark, 1 lit) and `openPuzzle` removes the gate when all three glow (gold plates in the mine, rune plates among the mushrooms, a mirror room on Bifrost). New terrain `bifrost` (walkable glass tiles with faint rainbow bands, drawn in `terrain2.ts`).
- **New boss moves** (`BossMove`): `line` is a strip `w` tiles wide and `r` long aimed at the tank (zone shape `line`: step aside); `pull` warps everyone in the circle next to the boss (the client jumps on the `warp` change) and is paired with a `nova` so the lesson is "pulled in, then run out or interrupt"; `mend` makes the boss glow and heal a fraction unless an interrupt lands in the warning; `summon` calls helpers and now shows a cast bar. `BossAbility.block` lets `freeze` use a web (`spindelnat`, in `BLOCK_SPECIES`) instead of an ice block: the webbed friend is "insnärjd", set free by hitting the web. Loke has one move for each boss he copies, unlocked phase by phase (five phases), plus a mend of his own.
- **Gear** (`GearSlot`: weapon, offhand, amulet; `SagaProgress.gear`, item ids taken *out* of the bag while worn). `SagaItemDef.stats` gives `power`, `hp` and `armor`; `classes` marks pieces that "Passar" a class (+5 %). `gearStats(p)` is `RARITY_POWER[weapon] × (1 + Σ power) × class fit × (1 + 0.03·(level−1))`, hp is the sum added to the class's, and armor is capped at 0.4; `hurtFighter` takes the armor off every hit. `equipGear` (`{t:'saga', a:'equip'}`) refuses a piece that does not fit the slot or when the bag is full, and works anywhere but fallen or webbed. Migration: `ensureGear` (run on load) moves the best weapon from the bag into the weapon slot for saves from before gear; `gearOf` computes the same answer for a save not yet touched.
- **Levels** (`XP_LEVELS` = 0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700; `SAGA_XP`: monster 5, helper 2, mid-boss 40, boss 100, villager quest 30, chapter 100, field kill 3). Each level above the first gives 3 % more power and health (`LEVEL_BONUS`); `giveXp` shows a "Nivå n!" banner and a sparkle and counts achievements (`sagaLevel`, `sagaLegendary`, one stat per dungeon).
- **Hero mode** (`{t:'saga', a:'hero'}`, `setHero`): needs a class, never inside a dungeon (there you are always the class). The switch swaps outfits (`farmOutfit`/`heroOutfit`; the hero outfit starts as the class's), and `shownHeld(p)` makes the equipped weapon the held item for everyone's picture while a hero (or in a dungeon). Outdoors (not the farm's cave, indoors or a dungeon) `castFieldSpell` runs the same spell ids with cooldowns in a module-level map (not saved; a restart makes everything ready) and the rules counted in *hearts* like the sword: attack spells hit the nearest hostile animal in range (ranged ones need line of sight) for `max(1, round(power × gearStats / 8))` hits through `attackMob`; whirl and storm hit all in a radius; taunt sets `hunt`/`huntUntil` on hostile animals, which `tickMob` in `sim.ts` prefers over everyone else; heal and potion give hearts back (2 and 3), `wall` is `hurtUntil`, `rage` is `boostUntil` and ×1.5. `heroAction` (from `performAction`) casts the class's attack spell quietly at a monster in reach and otherwise lets the normal farm action happen (doors, talking and petting still work; farm tools are never swung at monsters in hero mode). Lasso does not work on Loke's monsters.
- **Roaming monsters**: seven species with `ANIMALS[..].mob` (hp in hearts, drops) and `wild` (their biome): vandrardraug (forest), mosspoke (swamp), gruvtroll (mountains), sjodraug (beach), skuggalv (mushroom forest), isvarg (ice), eldimp (volcano), and two world bosses, Bergatrollet and Kustjätten (`wildCount` [1,1], `mob.boss`). They sight a player at `ROAM_SIGHT` (4.5 tiles), chase and bite like predators and poof when beaten; `spawnWildAnimals` restocks them each morning and `ensureRoaming` tops up wild maps saved before. The species that are also dungeon monsters (isvarg, eldimp) keep their dungeon behaviour: inside a dungeon `world.saga.mobs[id]` wins. `roamingDown` runs when one falls, by spell or by sword: experience, field tasks and villager quests for everyone close by (`FIELD_SHARE` 10 tiles), and a world boss leaves a `loot_chest` (the `worldboss` loot table) that is refilled for everyone each time it is beaten.
- **Saved and not saved.** Saved with the player: class, chapter, `cleared`, quests, `found`, `gear`, `hero`, both outfits, `xp` and `level` (all optional, so old saves load as they were). Not saved: dungeons and everything in them (plates, gates, mobs), spell cooldowns, buffs and hunts. Roaming monsters are ordinary animals and saved with their map.
- **Balance.** A bot pass (careful bots that step out of telegraphs and interrupt, and clumsy ones that do not; kids are taken to be about 2.5× slower than the careful bots) tuned the monsters: each act is 15–30 % tougher than the one before so gear and levels matter, and Loke takes about 5–6 bot minutes for three players at level 8 with a legendary set. `saga.test.ts` walks every dungeon from the start to the boss with the gate shut until the mini falls, fires and interrupts every boss move, and covers pull, line, mend, the puzzles, equip and stats, the hero switch, outdoor spells, field tasks, levels and loot once per player.
- **Art conventions** (`packages/art/src/saga.ts`, `sagaanimals.ts`): `saga_wall`, `saga_gate`, `saga_torch`, `saga_exit`, `saga_portal` take their dungeon's *look* as `variant` (0 Draugkryptan, 1 Frostjättens borg, 2 Surts smedja, 3 Helheim, 4 gruvorna, 5 templet, 6 lunden, 7 Fenrisklyftan, 8 Bifrost). Each dungeon has four decor kinds (listed in `DUNGEONS[id].decor`), drawn in three variants each; `saga_plate` is variant 0 dark, 1 lit. Loke's illusions are the existing skeleton, ice wolf, fire hound and ghost drawn as `variant: 1` (ghostly and see-through; `illusions: true` on the dungeon). Creatures are spooky-cute with two walk frames, bosses about twice the size; pets and mounts have entries in `SAGA_RIDE_LIFT`.

## The saga world (2026-10-31)
The family finished Sagan II and said the same thing about the rest of the game: the dungeons are Norse, but the city has cars, buses and asphalt, and out in the world there is nothing to hit except a bear. They wanted the world to feel like the saga, monsters to hunt everywhere with experience for each one "like in WoW", and a level system that pays in looks (glowing clothes, legendary things) rather than power, so a parent at the top level can still play with the kids at level one. Spelhallen and Rallyvärlden's garage were kept exactly as they were at the time (both removed on 2026-11-01, see below).
- **The town.** The city is reskinned and renamed, not rebuilt: `buildCity` and every id (`car`, `motorcycle`, `bus`, `train`, `street_lamp`, `traffic_light`, `apartment`, `shop`, `bus_stop`, `train_station`, `parked_car`, `bathhouse`) are unchanged, so traffic loops, bus and train rides, bought vehicles, saves and the tests are untouched. Only `sv.ts` names change: Köpingen (the biome `by`), Hästkärra, Ridhäst, Diligensen (5 kr), Gruvtåget (15 kr), Badstugan, Lykta, Långhus and so on, and "Kärror & hästar" in the farm shop. The honk emote keeps its id and fx and is now a whinny (🐴 Gnägg!). `city.ts` adds banner poles, barrel stacks, a runestone and a hay cart to the square (`TOWN_DRESS`), and `ensureTownDress(world)` does the same for a saved city on load: idempotent, only on free tiles that are not streets, not villagers' spots and not under a player.
- **Art conventions** (`packages/art/src/world.ts`, `landmarks.ts`, `animals.ts`). Terrain `road` is cobblestone, `sidewalk` flagstone, `crossing` pale slabs, `rail` iron on ties as before. Houses and shops are timber with several variants (hanging signs for the smith, baker and weaver). Window panes are drawn in the shared glass colours (`GLASS`/`GLASS_L`, pale blue) so the client's window light finds them and lights them at night; do not paint panes in other colours. Vehicle sprites keep their old footprints so the sim needs no changes: cart (`car`) 32×16, riding horse (`motorcycle`) 24×20, the rider being the player sprite drawn on top, with the seat where the moped's was, and the Diligens and the mine train keep the length of the bus and the train. Headlights are lanterns (amber).
- **Wild monsters per biome.** `roam()` in `data.ts` makes an animal a roaming monster: `wild` biome, `wildCount`, `mob` hearts and drops, optional `aggro` in tiles. Eight easy ones were added, 3–4 hit points (a sword does 2), one per kind of place: Ängsvätte (meadow, `aggro: 3` since it lives next door to the farm), Trollunge (forest and mountains), Snötroll (ice), Sandande (desert), Djungelimp, Benödla (Dinodalen), Sockerspöke (Godislandet) and Rymdkryp (the moon), three to five per map (`WILD_COUNT`). They bite for a heart like the other roamers, never appear in the town, on the farm or indoors, and are restocked each morning by `spawnWildAnimals`; `ensureRoaming` works from `wild`, so saved maps get them without a migration. Four reuse an older creature's painter in new colours, four are new drawings (`sagaanimals.ts`).
- **XP for everyone.** `giveXp` no longer needs a class (the saga record is made on the first gain; spells still need a class). `attackMob` calls `killXp(area, by, mob, out)` (`sagasim.ts`) on every kill, so the sword, the bow, the bazooka and spells all count: the killer and every online player within `FIELD_SHARE` (10 tiles) on the same map get the same amount, at once, with an `xp` change the client floats as "+4 xp". `SAGA_XP` adds `wild` 4, `predator` 6 (bear, wolf, lynx), `cave` 3, `caveBoss` 30 and `worldBoss` 60 to the dungeon values (mob 5, add 2, mini 40, boss 100, quest 30, chapter 100); the old `field` value is gone. `roamingDown` keeps only field tasks, villager quests and the world boss chest. Dungeons count their own kills in `mobDown`, so nothing is paid twice.
- **Levels 1–20.** `XP_LEVELS` is a gentler curve than before (60 for level 2, 7 800 for level 20). `LEVEL_BONUS` is 0.015 a level (was 0.03), +28.5 % power and health at 20. The reasoning for the cap: damage is `RARITY_POWER × (1 + Σ gear) × class fit × level`, and these stack. `POWER_CAP` 1.8 clamps the product, so a level-20 parent in a full legendary set, with a class that fits, does at most 1.8× what a level-1 kid in plain gear does, so the dungeons stay a team effort instead of a stroll. Health grows with the level but gear armor stays capped at 0.4 as before.
- **Rewards are cosmetics.** `LEVEL_REWARDS` maps a level to an item, a title and an aura. The items are `SAGA_ITEMS` entries with `levelReward: n`, which the loot tables skip so a chest never rolls them and the journal can list them: Vandrarmanteln (2), Glödkransen (4), Lyktfén (5), Glödmanteln (6), Stjärnkronan (8), Hjältemärket (9), Stjärnmanteln (10), Norrskenshjälmen (12), Ljushjorten (15), Eldmanteln (16), Solkronan (18), Yggdrasils löv (19), Bifrostmanteln (20); titles Vandrare, Hjälte, Stor hjälte, Legend and Midgårds väktare. Clothes go to the wardrobe, pets, mounts and amulets to the bag (a full bag waits for next time), and the amulets carry a little hp so they are nice but not needed. `ensureLevelRewards(p, out?)` is idempotent (it checks `prog.found`, `prog.titles` and the wardrobe) and is the migration: `giveXp` runs it and `store.ts` runs it on load, so a hero from Sagan II who was already level 8 gets everything up to 8 and a toast for each. Saves keep their xp; the level is recomputed from the new curve.
- **Auras and glow.** Nothing is stored for the aura: `auraOf(level)` is 0 below 10, 1 from 10 (a soft warm light and sparse sparkles) and 2 at 20 (brighter, a slowly cycling rainbow). A worn hat or shirt whose `SagaItemDef.glow` is set lights the player in that colour (`'rainbow'` cycles) and gets a faint halo drawn around the sprite. All of it is drawn by the client (`clientljs`) for every player, and kept gentle by day so it does not swamp the farm at noon; it is at its best at night and in dungeons. The level chip, the "+n xp" floaters, the reward line on the level banner and the "Hjältenivå" list in the journal are client work too.

## Bigger maps, landmarks, Smedjan and replays (2026-10-31)
The family finished the saga and asked for more to do out in the world: bigger maps to wander, things worth walking to, a use for the loot (a Viking smithy), and a reason to play a dungeon a second time. Same rules as ever: nothing is lost, nothing frightening, and a parent at the top must still be able to play with a kid at level one.
- **Per-map size.** `WorldState.w`/`h` are optional and undefined means 64 (`MAP_W`/`MAP_H` stay as the default), so every saved map loads as it was and serialises unchanged (a 64 map never writes a size). Code reads a map's own size through `mapW(m)`/`mapH(m)`, `inBounds(m, x, y)` and `tileIndex(m, x, y)` (rows of `mapW` tiles, never `MAP_W` as a stride on a map that may be big). Generators, movement, line of sight, regrowth, edge travel (`EDGE_GAP`, `arrivalTile`, `inEdgeGap` take the map), the camera, the ground in `clientljs/view.ts`, the minimap and the world map all read it. Terrain is already a jsonb array on the server, which does not mind its length.
- **Which maps are big.** `WILD_MAP = 96` and `areaSizeOf(biome)` is 96 for every wild biome and 64 for Köpingen (`by`) and the space base. The farm, the moon, caves, interiors, the bath house and every saga dungeon keep their handmade 64×64 plans (checked byte-identical to before). Openings are still in the middle of each edge, so a 96 map joins a 64 neighbour in both directions and the arrival tile comes from the map you arrive on.
- **Density.** The painters scale what they scatter with the area (`Painter.density` = area ÷ 64², `span` = width ÷ 64): scatter counts, pools, streams, cave mouths and the wild animals (`wildCount` and `spawnWildAnimals`) grow ×2.25, so a big map is as busy as a small one was, not empty. The map's dungeon arch moves out with it (`placeLandmarks` knows where). `connect()` still guarantees every opening, cave mouth, chest and landmark front can be walked to. A 96 map generates in about 55 ms.
- **Old maps.** `AREA_GEN` goes from 2 to 3. `upgradeSavedArea` rebuilds an explored map with today's generator (so it grows to 96) only if `untouchedSinceBuilt` says nobody changed it: nothing built, planted or dropped, no soil, and no floor or path the painter could not have laid. A map the family has changed keeps its 64×64 and only gets the new `gen`, because rebuilding it would throw their work away and a map can't grow around what is already there. `generateArea(..., size)` can still make a 64 wild map exactly as before (the test and the "untouched?" comparison use that), with `{ landmarks: false }` for maps from before landmarks.
- **Landmarks.** `shared/src/landmarks.ts` is the table: `LANDMARKS` by id, 26 kinds (two for each of the twelve wild biomes, one on the space base, one on the moon) with biome, `name` (definite form, for "Du hittade {name}!"), `lore`, a `cache` of materials, `coins`, an optional footprint width (3×3, a few 4×3) and `light` for the ones that glow at night. Each is the solid object `lm_<id>` with `interact: 'landmark'`; the object table is generated from the landmark table, so a new landmark is one row. `placeLandmarks` runs in the painters before `connect()` with a random stream of its own (so nothing else on a map moves), puts two on a 96 map and one on a 64 map, away from the edges, the crossroads, the dungeon arch and each other, and clears what grew there and the row in front.
- **Finding them.** `discoverLandmark` (`explore.ts`): the first touch per player pushes the id to `prog.discovered`, gives a star, coins and the cache, counts the stat `landmarks` (achievements at 5, 15 and 26) and sends a reward banner with the lore; later touches only toast the lore. `noticeLandmarks` runs once a second and notes every landmark within 12 tiles of an online player in `prog.seen` (`<area>:<id>`, the area key may itself hold colons, so `parseSeenKey` splits at the last one), which is what the world map's "?" badge reads (🧭 once discovered). The cache climbs with distance from home on purpose, so it feeds the forge: stone and gold close by, crystal and obsidian in the ring around, fire crystals, fairy dust and star crystals far out.
- **Old saves.** `ensureLandmarks(area)` runs on load for a changed wild map (and the moon) with none: it tries `placeLandmarks` with an `accept` test that the landmark's front is reachable and every opening still is, and adds as many as fit (a 64 map gets one). Untouched maps simply get them in the AREA_GEN rebuild.
- **Landmark art** (`packages/art/src/sagaplaces.ts`, registered in `world.ts`): a 3×3 footprint is a 48 px wide frame, a 4×3 one 64 px; the picture may rise to about 64 px, so it is registered with an `oy` offset that puts its foot on the footprint's bottom edge. Light comes from the top-left; animated ones (waterfall, fire well, chocolate fountain, satellite) have two frames. The ground a landmark stands in is painted after the outline so it runs into the map.
- **Smedjan.** `prog.forge` maps an item id to its forge level 0–5 (`forgeLevel`, `FORGE_MAX`); it belongs to the player and the piece, so two players with the same sword forge them separately. `forgeStats(itemId, level)` is pure (the forge window shows before and after with it): a weapon gets +0.06 power a level, an offhand +0.02 armor if it has armor and +0.03 power if it has power, an amulet +8 health (and +0.02 power if it has power). `gearStats` reads it for every worn piece. `forgeGear` (`{t:'saga', a:'forge', item}`) asks that the player stands by Stina, owns the piece (worn or in the bag) and can pay, and refuses with a toast otherwise; it counts the stat `forged`.
- **Costs.** `FORGE_COSTS[level]` for the level you reach: +1 6 stone, 3 gold, 40 kr; +2 4 crystal, 2 gold, 80 kr; +3 two pieces of any mix of fire crystal, fairy dust, frostros, alvdagg, obsidian and star crystal, 150 kr; +4 4 monsteressens, 250 kr; +5 2 drakfjäll and 4 monsteressens, 400 kr. They climb with distance on purpose: the first steps are stone and gold from anywhere near home, so a child gets +1 and +2 on the first afternoon, the middle step sends you out to a far biome, and the last two need the dungeons, which a family plays together. The `anyOf` part is paid from the first kinds in its list the player has.
- **The starter set.** `FORGE_CRAFTS` (`{t:'saga', a:'craft', item}`, `craftGear`): Järnsvärd, Järnyxa, Ekstav, Jaktbåge, Träsköld and Stenamulett for 60 kr plus a few materials, uncommon, once per hero each (it goes in `prog.found` like any other once-only gear), so a hero with no loot yet still has something to forge. The materials are `SAGA_ITEMS` of the new kind `material` (stack 99, handled like quest things): Monsteressens and Drakfjäll.
- **The cap.** `POWER_CAP` goes from 1.8 to 2.0 with forging counted inside the product. The reasoning: damage is `RARITY_POWER × (1 + Σ gear, forge included) × class fit × level`. A level-20 parent in a fully forged legendary set with a class that fits would be well over 2× without the cap; with it they do at most twice what a level-1 kid in plain gear does, and the monsters scale with the party (`mobHpScale`, `bossHpScale`) rather than with anyone's gear, so a dungeon stays a team effort and a kid is never a passenger. Health still grows with the amulet and the level, and armor stays capped at 0.4.
- **Replays.** `prog.chestDay` maps a boss species to the game day its chest was last taken in full. A boss or mid-boss chest gives its full loot (and, from a final boss, one Drakfjäll) the first time each game day per player; after that the same day it is the replay chest (`replayChest`): a third of the coins, 2–4 monsteressens, one drakfjäll from a final boss, no stars, the usual XP, and a loot window that says which chest it was (`replay: true` on the `loot` change). Dungeon monsters (not a boss's helpers) drop a Monsteressens with `ESSENS_CHANCE` 15 % into the bag of whoever beat them. Together they are why a family can replay for materials without the same rolls becoming a farm for stars.
- **Best times.** `sagaBest` is on the farm world (`farm.sagaBest[dungeon] = { ms, names, day }`): `bestTime` measures from the first player's entry on a fresh instance (`startedAt`) to the last boss's fall, and keeps the best. A new best sends a `sagaBest` change (the clients store it and the journal's dungeon cards show it) and, when it beats an old one, a toast to everyone. It is saved in the `saga_best` jsonb column on the world table (migration `0003_saga_best`, nullable so existing farms are untouched); the store loads it into the farm record and writes it with the rest.

## Native login (2026-11-01)
Milestone M2 of `PLAN.md`: the Godot client (`packages/godot`) logs in with the same join codes as the browser, but it
has no cookie jar. So the device token (the long random token whose sha256 is the only thing stored in `devices`) can
travel in a header too. Nothing changes for browsers; the parent page is untouched.
- **Routes** (`server/src/http.ts`), all JSON, no cookies set or read:
  - `POST /api/join` with `{ code, name? }`: exactly `/join` (same `Access.redeem`: normalised code, device limit,
    expiry, reopen codes, the wrong-code limits of 10 per address per 15 min and 100 per hour, the 10-device cap on
    waiting devices). Answers `200 { gate, token, name, kind, pending? }`: `gate` is the device's gate right now
    (`ok` for an auto code, `pending` for a parent-approved one), `token` the new device token, `name`/`kind` the
    device's, and `pending` the 6-digit number the parent sees, only while waiting. Errors: `403 { error: 'invalid' }`
    (unknown, used or expired code), `403 { error: 'full' }`, `429 { error: 'limit' }`, `400 { error: 'json' }`.
  - `GET /api/gate`: the same answer as `/api/me` (`{ gate, name?, kind?, canCreate? }`, 200 when `ok`, else 403),
    plus `hours: { from, to }` when the gate is `hours`, so a client can show when the farm opens. The native client
    polls it every 3 s while it waits for approval or while the farm is shut.
  - `GET /api/players` (the "Vem är du?" list) and `POST /api/players` work with a bearer as they do with the cookie.
  - Without access control (`ACCESS=open`) `/api/join` answers `{ gate: 'ok' }` with no token and `/api/gate`
    `{ gate: 'ok', canCreate: true }`, like `/api/me`.
- **The bearer rule.** `bearerToken(header)` in `access.ts` reads `Authorization: Bearer <token>`; `deviceOf` in
  `http.ts` looks there first and at the `lg_device` cookie second, everywhere the cookie was read, including the `/ws`
  upgrade. If both are present the header wins (a wrong header with a right cookie is refused). `/admin` and the parent
  session never take a bearer: a bearer carrying a device token or a parent session token gets the login redirect
  (401 on POST). The token itself is unchanged: `Access.redeem` makes it, only its hash is stored, `deviceFor` finds
  it, and the parent's pause/remove/close reach a bearer socket through the same `enforce()` (close 4003).
- **Origin.** A native client sends no `Origin`. The origin check lets a request through without one when it carries
  a bearer token and is not for `/admin`; a request with an `Origin` that does not match is refused as before, bearer
  or not, and the browser rules (`Origin` must match the host or `PUBLIC_URL`; `"null"` needs same-origin fetch
  metadata) are unchanged. A browser cannot attach a bearer header cross-site without a CORS preflight, which the server
  does not answer, so the carve-out opens nothing for cookies.
- **The client's side** (`packages/godot`): `user://settings.cfg` holds the server address (default
  `https://example.invalid`, typed on the login screen; `http`/`ws` only for `localhost`), the token, the pending
  number and the last character. `Net` (`scripts/net.gd`) opens `WebSocketPeer` to `/ws` with the bearer in
  `handshake_headers`, sends `hello`, pings every 15 s, reconnects with backoff (0.5–8 s) and stops on 4003; a dropped
  socket asks `/api/gate` once, like the browser's `checkAccess`, and goes back to the login screen if the device may
  not play. Strings come from `assets/sv.json`, generated from `sv.ts` by `pnpm godot:strings` (the gate and join
  texts moved into `sv.ts` for that; the server pages use them too).

## Godot client: the dungeon on screen (2026-11-01)
Milestone M3a of `PLAN.md`: Draugkryptan drawn by the native client (`packages/godot`) with the family's characters
walking in it, no combat yet. The server is untouched in shape: the client renders and sends intent, as the browser
does. `packages/godot/ART.md` is the style sheet every later session follows.
- **Data flow.** The socket's messages go through `world_model.gd`, a port of `client/src/state.ts`: `welcome` brings
  the farm with everyone's player records (each with its `area`); the dungeon arrives as the `areaData` change the
  server sends when `placeIn` moves you to `saga:<id>` (the whole WorldState: the 64×64 terrain, the objects with
  their `occupancy`, the animals, the `saga` instance); `changes` keeps it current (`object` for a lit rest stone or
  plate, a gate that opens, a chest; `animal` for a monster that poofs; `player` for records; `warp` for the server
  moving someone; `toast` and `banner` for text); `state` ten times a second gives everyone's position and the
  `SagaSnap` with health and flags. `dungeon_view.gd` builds the scene from the WorldState once and patches it from
  `object` changes: the floor from the terrain grid (KayKit tiles, three variants by a hash of the tile, the boss
  hall's floor decorated), a wall per `saga_wall` object (a dark 1 × 2 × 1 m block with KayKit wall faces on the
  sides that meet a floor tile), and a node per other object kind. Floors and walls are MultiMeshes in 8 × 8 tile
  chunks. The dungeon's `ambient` colour is the environment's ambient light and fog; the look (`wall` index) picks
  the stone tint and the torch colour from tables copied from the browser's `lighting.ts`. The rules the client
  needs (object solidity and footprints, the dungeons, the creatures, the classes, `TILE`, `PLAYER_SPEED`, the
  player's box, `SLOW_MUL`, `WALL_TERRAIN`) are not retyped: `tools/export-data.mts` writes them to
  `assets/game.json` from the shared package, and the Godot workflow fails when it is stale.
- **Movement.** `hero.gd` is `stepPlayer`/`resolveMove`/`isSolidForPlayer` from `sim.ts` in GDScript, for a dungeon
  (no villagers or vehicles there, and the monsters do not block). It predicts locally, sends `move` at most 20
  times a second while walking and once on stopping, snaps to the server's position when a snapshot is more than
  40 px away (the browser's rule in `view.ts`), and jumps on `warp`. The saga snapshot's flags set the speed: fallen
  or frozen stand still, slowed walk at `SLOW_MUL`. Everyone else and the monsters ease towards their latest
  snapshot with the browser's exponential follow and jump when far (64 px for players, 48 for animals).
- **Sprites.** `tools/export-sprites.mts` bundles the drawn-in-code art of `packages/art/src` with Vite (`packages/art/vite.config.ts`) and runs it in
  Playwright's Chromium: the hero in each class's outfit (`CLASSES[cls].outfit`, brown trousers, boots) for each
  of the six skin tones, four directions × three frames (stand, walk, walk) in 16 × 32 px frames (eight rows of
  headroom for tall hats), and the dungeon's creatures as `drawAnimal` draws them (two frames facing right, their
  own size, their outline). The sheets and `atlas.json` are committed under `assets/sprites`. In the scene they
  are `Sprite3D` Y-billboards at 1/16 m a pixel with nearest filtering, lit by the torches, a `Label3D` name over
  the head. Hair is fixed and the weapon in hand is not drawn yet (M4 and M3b).
- **The way in.** The client has no world map, so a dungeon cannot be reached by walking to its arch. The protocol
  gets `{t:'dev', a:'saga', id}`: with `DEV_TELEPORT=1` on the server it puts the player straight into the dungeon
  through the same `goInto` the arch uses (`getArea` → `generateSaga`, a fighter record, the dungeon's banner),
  after making them a Krigare if they have no class; without the switch it answers `error`. Not for the real farm.
  The way out is the normal one: the use key on the stairs runs `leaveSaga`.
- **HUD and presets.** Hearts from the saga snapshot, the dungeon's name, the party (everyone else in the area with
  their hearts), a connection dot, banners and toasts. The pause menu holds the settings: Låg, Mellan and Hög as
  section 3 of the plan defines them (a pixel budget for the 3D scene, shadows from the nearest torches on Hög only, SSAO, SDFGI, volumetric
  fog, glow, particles), saved in `user://settings.cfg` and applied at start.
- **Demo and CI.** `tools/export-fixture.mts` records the messages a hero gets on entering Draugkryptan (through
  the real `placeIn` and `generateSaga`); `--demo` on the command line plays them without a server, with `--at` and
  `--screenshot` for pictures. The Godot workflow runs the login scene and the demo headless after the import.
  The build sandbox could run Godot 4.6.3 this time, headless and through Xvfb with Mesa's software OpenGL, which
  is where `docs/m3a-*.png` come from (the Compatibility renderer; the owner's Mac runs Forward+).

## Godot client: fighting in Draugkryptan (2026-11-01)
Milestone M3b of `PLAN.md`: the Krigare fights in the native client, the dungeon fights back visibly, and two players
can clear it together, one in Godot and one in the browser. The server is untouched: every rule and every message is
the browser's (`client/src/saga.ts`, `clientljs/src/saga.ts`, `ui/saga.ts`, `protocol.ts`), ported to GDScript.
- **The fight from my side** (`scripts/combat.gd`, the browser's `client/src/saga.ts`): the target is an animal id or a
  player id (Tab cycles the monsters near me, ice blocks and monsters already fighting first; a click picks the
  nearest; the monster the server picked for an unaimed cast becomes the target; a monster left 16 tiles behind is
  let go). `cast` goes with the target when there is one and without one otherwise, and the server does the picking
  (nearest hostile in reach, line of sight for bolts and lances, the worst-hurt friend for a heal, myself for a buff).
  Cooldowns start when my own `spell` change comes back (the spell's `cd`, the 400 ms pause after any spell, the
  potion's 15 s); a press while cooling waits up to 1.5 s and goes when ready; nothing goes while fallen, frozen or
  with a cast on its way (350 ms). The use key uses the stairs, a chest, a rest stone or a plate, swings the everyday
  attack at the target when in reach, and otherwise sends `act` on the tile in front, which the server answers with a
  quiet swing at whatever is near.
- **What the server says, on screen** (`scripts/fx_view.gd`, the browser's `clientljs/src/saga.ts`): every `zone` as
  a flat shape on the floor (a disc, a sector or a strip, unit-sized and scaled), a dim red base, a brighter fill that
  grows from the middle, or from the boss for a cone or a line, until `at`, a blinking edge; burning ground (`until`)
  pulses orange; a pull's circle is a violet whirl with rings sliding in; a mend's small circle is not drawn. `spell`
  changes become glows and rings in the browser's colours (the `MOVE_COLOUR` and `BOSS_MOVE_COLOUR` tables are copied),
  `cast_<move>` a swelling glow with sparks rushing in for the move's warning time (a mend: rings breathing out and
  z's), `land_<move>` the landing per move, a `kick` hit ends the wind-up in blue. `hit` changes float as Label3D
  numbers over the body (held while a bolt is in the air, three abreast when they come together, red on me), `xp` as
  "+n xp", and the `fx` poof and sparkle are soft clouds and golden motes. The flags in the saga snapshot draw the
  lasting looks (a shield wall's bubble, rage's flames, the healing ring's leaves, a fallen friend's halo) and the blue
  shield over a boss winding up something stoppable. A small camera shake on the big landings.
- **Bodies** (`scripts/actor.gd`): a fallen hero lies flat on the floor, grey, the billboard turned off; a frozen one
  stands in a translucent ice box, a webbed one in white rings; a hit flashes the sprite and my own swing lunges it;
  a health bar over the head for every friend and for a hurt hostile (the boss has the top bar instead), the name on
  the target, bosses and blocks; a chat or emote bubble; and the warning sign on the monster after me. Monsters face
  where they walk (the sheets have one side view). The server keeps its threat table to itself, so "after me" is read
  off the screen: a fighting monster moving my way, or in reach of me and nearer to me than to anyone else. The
  death "poof" is the server's `fx`, nothing bleeds.
- **The HUD** (`scripts/hud.gd`, the browser's `ui/saga.ts`): the spell bar (icon, name, key, a cooldown sweep that
  empties from the top, the seconds left, dimmed when nothing may go or the potion is out, red-tinted when the target
  is out of reach, a blue border on the spells that can stop the boss's current cast), the frames of me and my target
  with flags, the party with hearts and flags, the boss bar with name, title, phase pips and health, the cast bar
  (⚠️ or 🛡️, the move's name, "Kan avbrytas!"), the boss's shouts, the fallen/frozen/webbed box with the countdown to
  the rest stone or "Alla föll…", the use prompt ("E · Öppna kistan"), banners with the browser's sounds per kind.
- **Chests and chat.** The `loot` message opens the loot window (`scripts/loot_window.gd`): each item's picture, name
  × count, rarity name in the rarity's colour, text; coins and stars; the plainer replay chest. The once-per-player
  rule is the server's (`found`); the window shows what came. `chat` lines (80 characters, the phrases from
  `CHAT_PHRASES`) go to a fading log and a bubble over the head; the emote wheel sends `emote`, and the snapshot's
  `emote` field shows the glyph over the head as the browser does. A boss's `yell` is written into the log too.
- **Pictures** (`tools/export-sprites.mts`): `icons.png` holds the spells' and emotes' emoji (drawn by Chromium's Noto
  Color Emoji) and the loot items' 16 px pictures at ×2 (an item without one gets its kind's emoji, like the browser),
  `atlas.json` says where each sits. `game.json` grew the spells, the bosses' moves, every creature's reach and speed,
  the items, the rarity colours, the chat phrases and the fight's constants (`tools/export-data.mts`).
- **Sound** (`scripts/sfx.gd`): the browser's code-generated sounds (`sagasfx.ts`, `sound.ts`) rendered once per
  recipe into 22 kHz PCM with the same primitives (tone with an exponential fade and a slide, noise, a filtered sweep,
  a swell, notes), kept as `AudioStreamWAV`. No audio files.
- **Gamepads and the kids** (PLAN.md section 7): the Input Map's `spell_1..4` are X, Y, B and RB as in the browser,
  `potion` LB, `target_next` d-pad right, `emote` d-pad up, `chat` Back, `spell_wheel` RB; the setting
  *Trollformler: Knappar / Hjul* (`Settings.spell_input`) decides whether RB is the fourth spell or opens the radial
  wheel (`scripts/wheel.gd`): lean the stick, let go. The emote wheel is the same control. The owner tests both with
  the kids; the keyboard keeps 1–4 either way.
- **Measuring** (`scripts/bench.gd`, F3): the overlay shows fps, the average frame time and the 1 % low (the mean of
  the slowest 1 % of frames); `--bench` runs the demo with the scripted fight (`scripts/demo_fight.gd`: a server-less
  timeline of `state`, `zone`, `spell`, `hit`, `banner` and `loot` messages for the mid-boss) for 10 s per preset and
  prints the same (M3d: steady state, the engine's render counters and the window's pixels too; ART.md "Measured").
  The build sandbox could not run Godot this time (its network policy refused the editor download),
  so no sandbox numbers and no new screenshots; the Godot workflow runs everything headless.
- **The bot** (`scripts/bot.gd`, `tools/bot-check.mts`, `pnpm godot:bot`, a job in the Godot workflow): a headless
  client that logs in through `/api/gate` and `/api/players` (creating its character; `ACCESS=open`, the memory store,
  `DEV_TELEPORT=1`), asks the dev way into Draugkryptan, finds the first pack by a breadth-first walk over the floor
  with `hero.gd`'s own solidity rule, drives the hero along the path, casts the four spells every 200 ms (the big ones
  first, the axe last, so the axe is what waits), steps out of telegraphs with the server's own `inZone`, and writes
  a JSON report. Two bots against one server must each see the other's casts and agree on every monster's health at
  every `state` (keyed by the message's `now`, the same broadcast to both). Nothing new on the server. Its first
  run found a real bug: `WebSocketPeer`'s default 64 KiB inbound buffer dropped the `welcome` (the whole farm) with
  close code 1009 and the client reconnected forever; `net.gd` now gives the socket 8 MiB.


## Godot client: the farm on screen (2026-11-01)
Milestone M4a of `PLAN.md`: the farm drawn by the native client, walkable, with the real way into Draugkryptan. The
server is untouched; everything below renders what it sends and sends what the browser sends.
- **One view for every outdoor map** (`scripts/farm_view.gd`): the `farm` and the wild maps `a:x,y` are the same code.
  The ground is one mesh per 16 × 16 tiles with a colour per tile (tilled soil in four furrow strips, paths, sand,
  snow, road, rail and the rest of `Terrain`), water, bog, chocolate and lava as sunken beds with a surface drawn by
  one shader (ripples, sun glint, a foam line at the bank), cliffs (`WALL_TERRAIN` rock) as raised blocks. Every
  object kind is a mesh: trees, rocks, bushes, tufts, flowers and fences are instances in a `MultiMesh` per chunk and
  kind (a forest of a thousand trees is a few draw calls; a changed object marks its chunk, rebuilt next frame);
  houses, lamps, arches and the cave are nodes with their lights. Crops are three stage meshes per crop (seedling,
  growing, ripe) and not interactive. A kind with no entry gets a lilac box on its footprint and one warning, and the
  landmarks (`lm_*`) are such boxes for now; this is where the village, the beach and the others will plug in.
- **Assets** (`scripts/farm_assets.gd`, `assets/LICENSES.md`): Kenney Castle Kit (pines, rocks) and KayKit Medieval
  Hexagon Pack (farmhouse, well, barn, stall, props), both CC0 from GitHub mirrors, are *baked*: triangles copied with
  the colour of the pack's palette strip at each vertex, centred, scaled, and recoloured to the ART.md palette. The
  rest (oak and apple trees, bushes, flowers, fences, furniture, sheds, lamps, the dungeon's arch) is generated in code
  (`scripts/farm_mesh.gd`). All props share one vertex-colour shader (`assets/shaders/farm_prop.gdshader`), which is
  what lets the season's leaf colours, snow on every upward face, rain and wind act on all of them. Quaternius,
  Kenney's Nature Kit and KayKit's Medieval Builder were not reachable from the sandbox (see LICENSES.md).
- **Sky** (`scripts/day_night.gd`, a port of `sky.ts`): the browser's day colours and weather tints drive the sun
  (angle, colour, strength), the ambient light and the fog from the server's clock (`timeMs`, run on between `state`
  messages), the leaf colours from the calendar (`yearSeason`: spring, summer, autumn, winter; Christmas is always
  winter), the snow cover (Christmas, or snow that has fallen a while), and the weather (`localWeather` per biome):
  rain, hail, snow and wind leaves as GPU particles that follow the hero, fog as density (volumetric on Hög), a flash
  in storms, a rainbow after rain, lamps and windows lit by how dark it is. The camera looks down at 51°, so the sky
  itself is never on screen: the background is the horizon colour. Presets: Låg has no sun shadow, 150 weather
  particles and no cloud shadows; Mellan one short shadow cascade (26 m) and 600; Hög two (38 m) and 1500.
- **People and animals**: `tools/export-sprites.mts` exports the farm's clothes as *layers* (pants, shoes, shirt,
  hands, head, hair, shading, hat), `scripts/look_composer.gd` blends them in the browser's order per player and caches
  the sheet (checked pixel for pixel against `drawCharacter` for 1083 looks), 64 species of animals with baby, winter
  and colour variants, and the villagers. They are `Actor`s like the crypt's monsters; names over heads, emotes and
  chat bubbles work as in the crypt. Animals and villagers walk from the `state` snapshots.
- **Walking and the ways out**: `hero.gd` is the same prediction code with the farm's rules (the map's edge, ground
  nobody walks on, solid objects; the farmhouse door's tile is solid client-side because the room behind it is not
  drawn yet, so the server never sees a step on it). At an edge opening (`EDGE_GAP`, the browser's `inEdgeGap`) a
  push outwards sends `travel` (at most every 1.5 s). The dungeon's arch is the shape the server made it (`saga_portal`,
  3 × 2 tiles, solid): the use key facing it sends `act`, which is what the browser sends. **Draugkryptan's arch is not
  on the farm** but in the forest two maps away (`a:-1,-1`, from `DUNGEONS.draug.portal`): so walking there needs the
  wild maps drawn, which the generic view does (the task's "not drawn yet" notice stays for caves, indoors, the bus,
  the shop and the door). Without a class the server answers "Du behöver välja en väg först" (the class is chosen at a
  stone in the village). The pause menu's dev entries remain for the other eight dungeons.
- **HUD**: clock and day, season, weather, coins, stars and hearts at the top right (`T.day`, `T.coins`,
  `WEATHER_EMOJI`, `BIOME_NAMES` from `sv.ts` through `pnpm godot:strings`), the map's name at the top left.
- **Checks**: `--demo=farm` and `--demo=forest` (fixtures from `tools/export-fixture.mts`, with `--time`, `--weather`,
  `--season`, `--at`), `--bench --scene=farm|forest`, a third bot that walks farm → `a:0,-1` → `a:-1,-1` → the arch →
  `saga:draug` (a breadth-first path with `hero.gd`'s own solidity; the dev message never sent; found that the first
  `saga class` message after the welcome can be lost and sends it again), CI steps for all of it and for pictures under
  Xvfb. Findings of the first run worth keeping: in the Compatibility and Forward+ renderers alike a `MultiMesh`
  without instance colours multiplies vertex colours by black, so every `MultiMesh` here has `use_colors` on (white);
  Godot draws the *clockwise* side of a triangle, so shapes are written counter-clockwise and emitted reversed.

## Godot client: farming (2026-11-01)
Milestone M4b of `PLAN.md`, the second of three farm slices: the farm can be used. The server is unchanged except for one
dev-only message; the client sends the browser's messages (`act`, `select`, `swap`, `sort`, `quickStack`, `drop`, `open`'s
replies, `nameAnimal`, `pets`) and draws what comes back.
- **The use key** (`scripts/farm_play.gd`): E, space, A, or a click on a tile within one step sends `act` on the tile in front
  (`facingTile`), which `performAction` in `sim.ts` resolves: hacka tills grass or dirt, seeds go in soil, a ripe crop is
  harvested whatever you hold, vattenkanna waters and refills at water or at the well, lie cuts tufts and flowers (and
  un-tills soil), yxa chops trees and bushes (a stump stays), spett breaks rocks, a rod casts, hay and the brush and an empty hand
  go to an animal. The client does not decide anything: `farm_target.gd` only *reads* the same rules to outline the tile (green when
  something would happen) and write the action ("E · Hacka marken"), at most ten times a second and only when the tile or the held
  thing changed. Objects whose `interact` needs a window the client does not have yet (the shop, the bench, a bed, the bus, the
  caves) are not asked for; the server's `open` for a villager or the like becomes "…används inte än".
- **Bag and hotbar** (`hotbar.gd`, `bag_window.gd`, `item_slot.gd`): 8 + 24 squares like the browser's, search and the six filter
  chips (display only, as in the browser: slot indices stay the protocol), pick-one-then-another moves (`swap`, which the server
  merges), sort (`sort`; the hotbar never moves), "Lägg i kistan" (`quickStack`), hold (`select`), put down one or all (`drop`), a
  chest beside the bag (closes when you walk more than 3.2 tiles away, as the server would refuse). Every square is a button, so the
  mouse, the keyboard and a pad all work. Tools never break (DESIGN's rule), so the only wear shown is the can's 0–20 charges, on the
  hotbar and in the held name. Keys: 1–8, `LB`/`RB`, `[` `]` and the mouse wheel pick a square; Q or I or `Y` the bag. The emote key
  moves from V to F (as in the browser) because V whistles.
- **Things the server says happened** (`fx_view.gd`, `drops_view.gd`, `pickup_feed.gd`): the tool swings (`Actor.swing`: a lunge and the
  tool's picture along an arc; a billboard cannot be turned), the `fx` kinds water, splash, chop, hit, heart and coin become drops,
  chips, rising hearts and a glint, `drop` changes become bobbing pictures over a soft shadow (the server picks them up when you are
  within 12 px), and anything that came into the bag shows as "+2 Morot" with its picture. Coins and stars come from the player
  record, so they follow `changes` (the HUD refreshes on every change to my record, not only on the next snapshot).
- **Animals and pets**: petting, brushing, feeding and collecting are all `act`; an unnamed animal opens `name_window.gd`; X sends
  `pets stay`, V `pets come`; a mounted hero is lifted and walks at the mount's speed (`mount.speed`, else `RIDE_SPEED_MUL`; the server
  trusts the client's position as always, so the client has to apply it). Animal houses are M4c; animals already living in them are
  simply animals.
- **Fishing** (`fishing_view.gd`): the server does not say where you cast or that you are fishing, only the `fiske`/`napp` emote on
  your snapshot and a splash at the bite; the view remembers the tile of the last `act` and shows the bobber, the line and, at the bite,
  the dip and the ring while that emote is up. The ❗ over the head is the emote itself (`icons.png` now has `fiske`, `napp`, `vissla`,
  `dans`).
- **Data**: `game.json` has every item (name, category, stack, tool), the filters, what an object needs (`breakWith`, `harvest`), pets,
  wild animals, predators and monsters, mounts and the reach, pick-up and ride constants; `sv.json` the farming prompts and the species
  names; `icons.png` a picture for each item (the browser's art, blown up ×2). Run `pnpm godot:gen`.
- **Server**: `{t:'dev', a:'nextDay'}` rolls the day over like the parent page's "skip day"; it needs `DEV_TELEPORT=1` and answers
  `error` otherwise (tested in `game.test.ts`). The farm bot uses it to wait for a carrot.
- **Checks**: `--farmbot` (`farm_bot.gd`) walks the whole farming loop through the same code the keys use, against a second in-memory
  server, and `bot-check.mts` compares its bag, coins and stars (and what the HUD shows) with the server's own record over a websocket;
  CI also takes the pictures under Xvfb. Findings worth keeping: `rod` in hand returns before an animal is considered (the server's
  order in `performAction`), so the bot pets with the hoe; a hero facing up hides his own patch behind his sprite at the camera's angle,
  so the bot faces down for pictures; wild maps have wolves, bears and roaming monsters that make a loitering bot faint, so it keeps
  away from them; the server never says a fishing line is in the water.


## Godot client: home and village (2026-11-01)
Milestone M4c of `PLAN.md`, the last farm slice: the family can play a whole farm evening in the native client. The only
server changes are exports (`FLOOR_ITEMS` in `sim.ts` and the dialogue's tables in `dialogue.ts` are `export`ed so
`pnpm godot:data` can write them to `game.json`) and one development message, `{t:'dev', a:'starter'}` (only with
`DEV_TELEPORT=1`, an error otherwise, tested both ways in `game.test.ts`), which gives a hero with a class the starter weapon,
shield and amulet that Smed-Stina's forge makes for gold, because the new client has no smithy yet and the gear window needs
something to put on in a check; every rule is the browser's, read from `shared/src`, and every window sends
the browser's messages (`craft`, `cook`, `buy`, `sell`, `equip`, `quest`, `ride`, `saga` class/chapter/equip/hero/quest).
- **Windows** (`scripts/game_window.gd` and one file each): a dark panel over a dimmed screen with a title, a purse, tabs, a
  scrolling list of rows (a picture, a name, a line of bbcode, buttons) and OK. Rows are rebuilt from my player record when
  the window opens and whenever the server sends the record again, never per frame; the focused button is remembered across
  the rebuild so a pad does not lose its place. Every control is a `Button`, so the mouse, the keyboard and a pad all work;
  Escape or B closes. `farm_windows.gd` owns them, routes the server's `open` changes (`workbench`, `cook`, `catalogue`,
  `pizzeria`, `sell`, `wardrobe`, `npc`, `saga`, `sagaClass`, `travel`) and closes them all when the map changes.
- **Building**: `farm_target.gd` now reads the placement rules (`addObject` and the floor rules in `performAction`) for what I
  hold: the outline takes the footprint of the thing (`Data.object_def`), green when the server would put it there, red
  (and "Går inte att bygga här") on water, cliffs, objects, crops or someone standing in it. It also reads the ownership rule: an
  object with `by` that is not me, whose builder is still a player of the farm, gives "Pappa byggde Staket" with a grey
  outline (the server refuses and the toast says the same). There is no rotation in the game (the browser has none), so there is
  none here.
- **The farmhouse** is a walled room in the farm map's south-east corner (`INTERIOR` in `map.ts`), not another map. Its door
  is a portal (`PORTALS`): `hero.gd` now lets the door tile be walked on (the server's `isSolidForPlayer` returns false for a
  portal before it looks at objects) and applies `applyPortal` after a step, so the next `move` tells the server, which accepts a
  jump between the two ends of a portal. Snapshots from before the jump would pull me back, so `reconcile` ignores them for
  0.8 s. The camera comes to 62 % of its distance inside the room and eases back out. The room is dark at night (it has no
  roof for the sun, and nothing else lights it), so two lights come with the farm map: a warm one over the room and a cool one
  at the back wall for the window, both on the same switch as the lamps (`set_dark`).
- **Shop, sell box, pizzeria** read the prices, tabs and seasons from `game.json` (`shopItems` keeps the browser's order),
  with a search that looks in every tab, "Du har N", the house an animal needs, and everyone's animals on the way. **The
  wardrobe** shows what I own per slot with a picture of me in what I wear (one frame of the composed sheet); it cannot change hair
  or skin because the browser cannot either. **The gear window** (`gear.gd` is `gearStats`, `forgeStats`, `gearOf` and the level
  table of `saga.ts` ported) shows the numbers the server uses, the three slots, the bag's gear and the hero switch.
- **Cooking** is the same window as the workbench with the stove's recipes; eating is the server's: hold the dish, use the key.
- **Villagers**: `dialogue.gd` is `talkNode` ported line for line, playing the same tree from `game.json`; the window shows the
  day's wishes (`Quest` records from the welcome and the `quests` change), what I carry against what they want, the reward, and
  "Lämna" (`quest`), plus the saga's quests for them and, for Völvan Sigrun, the chapter told line by line (`saga chapter`) and a
  way to the class stone (`saga class`). `J` lists all the day's wishes.
- **Köpingen** is drawn by the same generic view (`a:1,0`, biome `by`): the streets and rails were ground already; the buildings
  were boxes, so `farm_assets.gd` gets the pizzeria, the station, the shop, the apartments, the small houses (KayKit's), the market
  stalls, the bath house, traffic lights, parked cars, banner poles, the square's runestone and the Kämpastenen, with lit windows
  at night. `--demo=village` and `--demo=house` are fixtures (`tools/export-fixture.mts`). **The bus** is the stop's window
  (`ride`): home, and the villages visited (the welcome's `biomes` tells which are villages).
- **Checks**: the farmer (`farm_bot.gd`, `farm_bot_home.gd`) now buys seeds and a hat, plants wheat beside the carrot, sells a
  carrot, hands in Elsa's and Sven's wishes through their windows, crafts fences, tries a fence on the water (red) and on grass
  (green), places it, takes it down, is refused on another player's fence (built by `tools/friend.mts`, a second player that
  joins over the socket), walks through the farmhouse door and out, bakes and eats bread, puts the hat on, talks (a joke, a
  riddle, sten sax påse), walks to Köpingen, picks Krigare at the stone, hears Völvan and takes her reward, equips the weapon,
  switches to hero and back, and rides the bus home and out again. All by pressing the rows' own buttons. Findings worth keeping:
  a breadth-first route that treats the farmhouse door as a floor leads straight through it and back out again forever (the
  walking helper skips portal tiles and the bot steps through the door with the stick); `Strings.object_name` falls back to the
  item's name for things built from an item (a fence is "Staket", not "fence").

## The browser client retired (2026-11-02)
Milestone M5a of `PLAN.md`. The owner decided that the native client covers the farm, so the browser game is gone from
this repository (it lives on in `tobiasbernting/lilla-garden`, which is not touched).
- **What went:** `packages/client` (shared HUD, menus, networking, sounds, client state and its test) and
  `packages/clientljs` (the LittleJS view, Vite and PWA config, the `@v1` alias, the icon script). In the server:
  `findClientDist`, `CLIENT_DIST`, serving a build's files, and the PWA manifest and icon routes. The Dockerfile builds
  only the server; the server starts and tests without any client build.
- **What moved:** the pixel art (`client/src/art`, 13 files) to `packages/art/src`, with its own `package.json`,
  `tsconfig.json` and the `vite.config.ts` that `pnpm godot:sprites` builds the sprite page with. The sheets are
  byte-identical to the ones committed before the move. The art imports only `px.ts` next to it and
  `@lilla-garden/shared`, so nothing else from `packages/client` had to survive.
- **The web page is the download page.** `GET /` on the public listener (pages.ts `downloadPage`, no JavaScript, public
  also for devices without access) shows the name, a line about the game, links to the latest GitHub Release and to the
  four builds by stable names (`releases/latest/download/varldstradet-<os>-<arch>.zip`; the Godot workflow names its
  zips so), the address to type into the game, and the join-code field (`POST /join`, the 6-digit number while a
  parent approves). `/access`, `/join`, `/api/*`, `/ws`, `/health` and the parent page are as before.
- **Voice has no native client.** Röstprat was WebRTC in the browser. The server side (`voice.ts`, `ice.ts`, the
  messages, the parent's setting) stays as is; there is nothing to talk with until a Godot client exists. It is the
  first thing to add after the runs, through the `webrtc` GDExtension.
- **No character creator in Godot.** `POST /api/players` is unchanged, but the browser's creator is gone and the native
  client only picks an existing character; until it has a creator a new character is made with that route (README,
  "Native client"). (Done: see "Godot client: the character creator", 2026-11-06.)

## Runs: Sagan som färd (2026-11-06)
Milestone M5b of `PLAN.md`: the design is `GAME.md` (read it first); this is the record of the rules as built, on the server and
in `packages/shared`, before any client draws them (M5c). Every fight rule is the saga's: a run only hands fighters their buffs.
- **A run** (`runsim.ts`) is about 30 minutes as a soft target (server clock, counted while someone in the party is online; banners at 25:00 and
  30:00 and every 10 minutes after, never a forced end: owner, 2026-11-06): three zones and the chapter's boss. Started with `{t:'run', a:'start'}` at the **färdport**
  (`fardport`, 3 × 2, placed by `ensureRunPlaces` beside the **Yggdrasil shoot** `yggdrasil`, which the family may already have
  planted; the same function puts both back every 20 s of play, on load and at server start). Family members within 6 tiles come
  along; others `join` and appear at the last lit rest stone of the zone. Three players, four with a longhouse; one human with a
  longhouse gets the hired **Hirdmannen** (a `PlayerState` with `bot: true`, created by `createPlayer`, played by `botStep`, never
  saved, listed, or counted against `MAX_PLAYERS`).
- **A zone** is a `saga:run<n>z<i>` area (`isRunKey`) built by `runmap.ts` with `sagamap.ts`'s new `buildDungeon(def, rnd, solid,
  key)` (`generateSaga` calls it, output unchanged): a template per biome (`ZONE_TEMPLATES`, six rooms, 4–6 kept, four flips),
  `run_exit` in the last room behind a `saga_gate` that `tickRuns` opens when the packs on the way are down. Zones are never saved
  and are thrown away when the party leaves them. `SagaInstance.run` (`SagaRunLink`: health, damage and sight multipliers, the
  unlocked boss moves, a `RunBuffs` per fighter, the wipe line, the packs that must fall) is read at the few places a run changes
  a fight in `sagasim.ts`; with no `run` every value is what it was (`saga.test.ts` is unchanged and passes).
- **Buffs** (`RunBuffs`, all fractions from zero): spell power (all and per spell), cooldowns, health, armor, damage taken, healing
  done, potion, regeneration and rest-stone healing, threat, leech, critical chance, time down, revive health and coins from
  chests. Sources added up by `effectFor`: the farm (`farmEffect`: tree, dishes, animals, joy, smithy, herb garden), the party's tree
  (the strongest of each effect among members), and the runor taken (class runor only for the class).
- **Runor**: after a zone's exit a vote on three cards (`offerRunor`): strict majority at once, everyone voted, or 20 s; ties go to
  the card voted first; the node `g3` allows one new offer. **Sagafrön** are paid to every human in the run when earned (`RUN_SEEDS`,
  +15 % per modifier, +runor and tree bonuses; only whole seeds are paid and the fraction is carried per player in `RunState.carry`, never saved) into `PlayerState.run` (`RunSave`, optional; old saves load unchanged; `readRun`/
  `runSaveOf`), planted with `{t:'seed', a:'plant'}` into `SEED_TREE` (18 nodes, 462 in all). The shoot's `variant` is the tree's
  stage from all nodes planted by the family (0, 3, 8, 14, 24).
- **Ending**: the boss falling pays and clears the chapter for everyone in the party, offline members too (`victory` in `runsim.ts`; the
  hired companion takes no loot, essence or sagafrön), and starts 90 s for the chest; the solo mercy is for one human *with* the companion; a wipe (the
  saga's four-second pause, but the zone does not reset) ends the run; so does the last human leaving (never the clock), or a minute with
  nobody online. Everyone is back in front of the arch with everything; sagafrön were paid as earned.
- **Protocol** (additive): client `run` (`start`, `join`, `pick`, `reroll`, `leave`, `state`), `seed` (`plant`, `state`),
  `fardkost`; server `Change`s `run` (`state`, `offer`, `ended`), `seed` (`tree`), `fardkost`, and `open` with `run` and `seed`.
  The store sends anyone saved inside a run home to the arch; the companion never reaches the database.
- **Balance** (bots, level 3, three runs each): 1 player + companion 6–7 / 12–16 min (careful / clumsy), 2 players 11–13 / 22–27,
  3 players 9–12 / 19–26, 4 players 7–9 / 15–19. Tuned: monster health × 1.35 / 1.5 / 1.7 by zone, packs of 3–4, `SOLO_MERCY` 0.75, a healer
  as the companion for everyone but the healer. Two bugs found on the way: a mage's blink (and a warrior's stormsteg) could land
  with the body in a wall so no move was accepted again (a real player could have been trapped; fixed in `sagasim.ts`), and a bot
  with two equally near targets dithered between them forever.

## Godot client: runs (2026-11-06)
Milestone M5c of `PLAN.md`: the client draws the runs of `GAME.md` (the rules are the server's, see "Runs: Sagan som färd"). Nothing here decides anything: it
sends `run`, `seed` and `fardkost` and draws the `run`, `seed` and `fardkost` changes.
- **World model** (`world_model.gd`): `run` (the RunSnap, its clock `elapsed` runs on locally between messages), `offer` (the three cards, `left` counted down
  locally), `ended`, `fardkost_items`/`fardkost_slots` and `tree` (my sagafrön and nodes), each with a signal. At login the view asks `run state` and `seed state`.
- **Farm**: `run_meshes.gd` makes the färdport, the shoot in five stages (picked by the object's `variant`), the herb garden and the longhouse in the farm's
  palette; the smithy is KayKit's blacksmith with generated extras. Only the Världsträd (stage 4) and the arch have a light.
- **Windows**: `run_window.gd` (the arch: class picture, `fardkost` slots, "Starta färden" sends `fardkost` then `run start`, "Följ med" sends `run join`; focus
  lands on the one big button for a pad) and `seed_window.gd` (the tree by branch, planted / plantable / locked, `seed plant`), opened by the server's `open`.
- **Zones** (`dungeon_view.gd`, `zone_props.gd`): a `saga:run<n>z<i>` map is drawn with the look `Data.zone_look` picks from game.json `run.zones` by the RunSnap's
  biome (the boss's map uses the boss's own dungeon): flat biome ground per chunk, the borrowed dungeon's walls, torches and ambient light, 22 decor kinds drawn
  in code, the `run_exit` as a rune disc with a beam (the use key takes the exit you stand on, since it is flat and not solid), and the zone's weather: fog in every
  preset, falling rain, snow, hail or dust on Mellan and Hög only (a third of the preset's weather budget). Prop lights are left out on Låg. A zone drawn before the
  snapshot arrives is redrawn when it does.
- **HUD** (`run_hud.gd`): the clock against `max` (cool, amber from `warnMs`, warm past `max`; the clock never stops), zone dots and the crown, the runor taken. The
  party's hearts are the dungeon HUD's party list (the Hirdmannen included); the server's banners are the usual banner changes.
- **Pick** (`run_pick.gd`): three cards (emoji at 96 px, name, one line), a vote is `run pick` with the index; the card with most votes glows gold; the bar counts down
  `pickMs`; "Omval" when `rerolls` > 0; the hero stands still while it is open so the pad moves the focus. **End** (`run_end.gd`): outcome word, time, sagafrön, zones, runor for eight seconds.
- **Bots**: `run_bot.gd` extends `bot.gd` (new hook `_no_pack_left`); `tools/bot-check.mts` plays a pair on a third in-memory server; `--full` for the boss. The workflow
  runs it headless and under Xvfb for the pictures.
- Strings: the new ones are in `sv.ts` (`pnpm godot:strings`); the run texts come from game.json.

## Godot client: chapters 2–4 (2026-11-06)
Milestone M6a of `PLAN.md`: the client draws any saga dungeon from the server's data, and finishes the first three after Draugkryptan: Frostjättens borg (`frost`), Surts smedja (`surt`) and Helheim (`hel`). Nothing on the server or in `shared` changed: every message was already there, and the three dungeons' bosses needed no new snapshot data.
- **The look table** (`scripts/dungeon_look.gd`, `DungeonLook`): one row per dungeon id (all nine have a stone tint and a torch colour; frost, surt and hel have their own air too, Draugkryptan's is the neutral one) with the stone tint, per-terrain floor multipliers (`ash`, `mud`, `snow`, `ice`, `forge`, `crypt`…), the torch colour, the ambient light's strength, the fog's density and colour, bloom, whether the boss hall's floor is KayKit's decorated tile and whether the floor has weedy tiles, and `motes`: what drifts through the air round the hero (snow in the castle, embers in the smithy, pale wisps in Helheim; Mellan and Hög only, a quarter of the preset's weather budget). The ambient colour itself stays data (`DUNGEONS[id].ambient` in `game.json`). The dungeon view reads only this table: `resolve(id, data)` finds the row by id, falls back to the `wall` index (a run's zones and the boss's map borrow a look that way, with `plain_air` so their own weather rules the fog), and to a neutral grey stone with warm torches for an id it does not know, so a dungeon the client has no row for still draws. Draugkryptan's row holds the values the view had before the table; a picture before and after differs only by torch flicker.
- **Sprites.** `pnpm godot:sprites` takes the dungeon ids (`draug,frost,surt,hel` by default) and exports every creature `speciesOf` lists: the packs, the mid-boss and boss and the helpers they call, and (new) the ice block a freeze leaves. All 21 are the existing pixel art of `packages/art/src/sagaanimals.ts`; nothing was drawn for this. `ART.md` records the table and the sprite arguments; `LICENSES.md` needed no new line (the art is the project's own).
- **Decor** was already there: the zones of M5c already drew the decor kinds of every dungeon in code (`zone_props.gd`), so the three dungeons' ice crystals, frozen pillars, snowdrifts, anvils, braziers, lava cracks, gravestones, skull piles, ghost-lights and dead trees are the same models.
- **Fixtures and demos.** `pnpm godot:fixture` writes `frost.json`, `surt.json` and `hel.json` beside `draug.json` (the draug file is byte for byte unchanged). `--demo=<id>` draws them; `--fight` on any of them plays `DemoBosses` (`scripts/demo_bosses.gd`, a `DemoFight`): each move of the mid-boss and the boss, from `game.json`, the way `sagasim.ts` sends it: the cast (name, warning time, the blue stop-it mark when `interrupt`) and `cast_<move>`, the marks (a cone, a circle, a strip, a circle under the friend and the extra ones for rain and pools, the circle where a charge or an ice prison will land), the landing, and what it leaves: the burning ground (`until`), the ice block with the friend frozen in it and broken again, the summoned helpers, the pull as a `warp`, the boss landing where the charge was marked; and the phase shouts between. `--once` leaves when the show has played (at 3x speed, and it checks that every mark it fed is in the fx view after the cast and gone after the landing, and prints `bosses: ok`), `--boss-move=<species>:<move>[:after]` holds one move 70 % ready (or what it leaves) for a picture. `export-data.mts` adds `count`, `add` and `phase` to the bosses' moves.
- **The mechanics on screen.** Isbjörnen Kall's *Isrusning* and Garm's *Helbett* (`charge`: a circle under one friend, then the boss lands there), Rimtursen's *Frostandedräkt* (a cone), *Istappar* (circles under everyone and three more), *Isfängelse* (`freeze`: a small mark, then a friend in a block of ice with the pale "Du är infrusen!" box until someone hits it), *Snöstorm* (a stoppable `nova`), Smeden's *Städslaget* (`slam`) and *Glödande slagg* (`pools`: circles that stay as burning ground), Surt's *Eldsvärdet*, *Lavapölar* and *Muspels vrede*, Garm's *Yla!* (`summon`: a cast bar and two hounds in a ring of smoke), Hel's *Dödens famn* (`pull`: a violet whirl, then everyone warped in and the *Helskriket* circle that follows) and *Gravkyla*. The fx code of M3b already drew every shape and move generically; M6a added the check that it does, and a pale web bolt for Helheim's bone spider (`mob_benspindel`).
- **Bots and CI.** `bot.gd` already took `--dungeon=<id>`; `bot-check.mts` takes `BOT_ONLY=dungeon BOT_DUNGEON=frost|surt|hel` (just the fighter pair, about 25 s each with `BOT_PACKS=2`), and the `export` job runs it for all three and plays the three bosses' shows headless in parallel (about 40 s; it fails on a script error, a leak, a show that does not end, or a boss move that never casts). The pictures (the start room and the boss hall of each, and each move's marks) are the manual `pictures` job's: `docs/m6a-*.png` and the `farm-screenshots` artifact's `dungeons/`.
- **Not done, on purpose.** The bosses are not fought to the end through the client by a bot (the run bot's `--full` does it for a run's boss, locally); dvarg, orm, alv, fenrir and loke have a look row and no more (no creature sheets, no fixtures, no boss show): M6b and M6c. The first four have no slippery floor (the server has none; the intro text only says so).

## Godot client: chapters 5–7 (2026-11-07)
Milestone M6b of `PLAN.md`: Svartalfheims gruvor (`dvarg`, chapter 6 in the data), Havsormens tempel (`orm`) and Alvernas lund (`alv`), done the way M6a did the first three. Nothing on the server or in `shared` changed; the only data change is in the exporter (`game.json` moves now carry a mend's `heal`).
- **Looks** (`scripts/dungeon_look.gd`): the mine is dark rock under amber lamps with a dusty air (`dust`: small warm-gold motes hanging in the lamplight); the temple has sea-teal stone, pale sand floors, cyan lanterns, a thick teal haze and `bubbles` rising; the grove has violet bark-stone over green moss (and green grass in the Nattmaran's clearing), strong bloom for the glowing mushrooms and `spores` lifting off. The hoard hall and the Nattmaran's clearing have no decorated floor tile (the temple's was too busy to read a telegraph on). The three new airs are particles in `dungeon_view.gd` with the same budget rule as snow, embers and wisps (Mellan and Hög only). Draugkryptan and chapters 2–4 are unchanged.
- **Sprites**: 15 more creature sheets from the existing art, plus the spider's web (16 new sheets: gruvtroll, guldbagge, stengolem, Järnväktaren, Fafner; sjödraug, jättekrabba, manet, Bläckis, Jörmungandr; skuggalv, jättespindel, svampvakt, Spindeldrottningen, Nattmaran; and `spindelnat`, a freeze's block in the grove); `ART.md` has the list. Decor and the puzzle's plates and gates were already drawn by the zone code and the dungeon view.
- **The bosses' moves, shown and checked** (`scripts/demo_bosses.gd`, `--demo=<id> --fight --once`): Järnväktaren's *Ångstråle* (a strip) and *Järnstamp*; Fafner's *Drakeld* (a cone), *Smält guld* (burning ground) and *Guldsömn* (`mend`); Bläckis' *Bläck* and *Tentakelsvep*; Jörmungandr's *Svansslag*, *Malström* (`pull`, then *Gifteld*), *Gifteld* and *Störtvåg*; the Spindeldrottningen's *Spindelnät* (a web round a friend, "Du sitter fast i ett nät!") and *Giftdroppar*; the Nattmaran's *Mardröm*, *Skuggpölar*, *Drömsömn* and *Skuggor!* (`summon`), and every boss's phase helpers. New in the show: a mend has no mark on the floor, so the show checks that the boss glows after the cast and that *that* glow is over a warning time later (a later move replaces the boss's slot, so it keeps the effect itself), then feeds the heal the server sends and floats it; and a friend in a block is checked to be drawn as `web` or `frozen` as the block says. The show's queue now takes late checks out of order. `bosses: ok` counts 24 / 27 / 30 checks for dvarg / orm / alv.
- **CI time.** The `export` job was 10 m 55 s after M6a, and the three new dungeons would have added about 40 s. The step timings showed that the six M6a bot and show steps took 35 s and the two long ones were the Draugkryptan all-bots run (about 4 minutes: fighters, walker, creator and the farmer) and the run pair (4 minutes), one after the other. They have servers and ports of their own, so they now run side by side in one step (`bot.log` and `runbots.log` printed after, either failing fails the step); then the six dungeon pairs run side by side (ports 8100, 8104 … in steps of four), then the six boss shows. Every assert is the same; the show's casts are counted per dungeon (5, 5, 5, 5, 6, 6). Locally on two cores pinned (what a small runner has) the two long runs took 258 s together (run alone: 370 s), the six pairs 35 s and the six shows about 20 s.
- **Pictures** are the manual `pictures` job's: `docs/m6b-<id>.png` (the start room), `-hall.png` and `-bosses.png` (six moves each). The sandbox rendered them (OpenGL, Xvfb); the job's use mesa Vulkan and may differ in small things.
- **Not done, on purpose.** fenrir and loke (M6c), and the puzzle rooms are not played by the bots (the fighter pair stops after its first two packs).

## Godot client: chapters 8–9 (2026-11-07)
Milestone M6c of `PLAN.md`, the last of M6: Fenrisklyftan (`fenrir`, chapter 9 in the data) and Bifrost (`loke`, chapter 10, the end of the saga), done the way M6a and M6b did theirs. Nothing on the server or in `shared` changed apart from a test (the saga's ending, below); everything the two dungeons' bosses need was already in the snapshot.
- **Looks** (`scripts/dungeon_look.gd`): the chasm is dark steel-blue rock with trampled snow (not the castle's clear ice), paler storm lanterns, a misty air and a `gale` of small snow streaks driven sideways; the boss's ledge is bare, brighter stone so the dark wolf reads against it. Bifrost is pearly violet glass under rose-gold lanterns with a lot of bloom, little fog and `stars`: coloured sparkles drifting up that cycle through the rainbow over their life (a colour ramp on the particle, additive). Both airs set their gravity explicitly (`gale` a gentle pull down, `stars` a gentle lift) and the boss show checks it; the seven earlier looks are untouched.
- **Decor.** The two dungeons' eight decor kinds had no models (the dungeon view showed placeholder boxes, which also leaked at exit): `saga_chain`, `saga_icefang`, `saga_wolfstatue`, `saga_bonepile`, `saga_rainbowshard`, `saga_mirror`, `saga_starlamp` and `saga_runepillar` are now made in code in `zone_props.gd` with the farm's mesh builder, the two that shine (shard, lamp) with a light like the other glowing props. (M6a's note that decor "was already there" was true of the run zones' kinds only.)
- **Sprites**: 7 creature sheets from the existing art (ulv, rimtroll, bergsjatte, Sköll, Fenrisulven; Lokes skugga and Loke; the rest of Bifrost's monsters are earlier chapters' skeleton, ice wolf, fire hound and ghost) and 4 ghostly variants. Loke's dungeon is `illusions: true`: the server gives every monster but the bosses `variant: 1` (`spawnSagaMob`, helpers called by a boss too), and the art draws that variant ghostly. `export-sprites` adds a `mob_<species>_v1.png` for each non-boss creature of such a dungeon, `Data.mob_sheet(species, variant)` picks it, and `Actor.sheet_name` says which sheet an actor has been given, so a check can tell. `ART.md` has the list.
- **The bosses' moves, shown and checked** (`demo_bosses.gd`, `--demo=fenrir|loke --fight --once`): Sköll's *Språng* (`charge`) and *Ylande* (a stoppable `nova`), Fenrisulven's *Käftarna* (charge), *Klorna* (a cone), *Flocken!* (`summon` of wolves) and *Vinterylet* (a nova of radius 8), Lokes skugga's *Falska stjärnor* (`rain`) and *Hånskratt* (nova), and Loke's seven: *Kungasvärdet* (cone), *Snöstorm* (nova), *Lavapölar* (pools), *Lokes list* (`mend`: the glow, then the heal), *Dödens famn* (`pull`), *Helskriket* (a second nova) and *Svansslag* (line), each from the phase that unlocks it, with the four phase shouts and the helpers (ulv, skelett, isvarg). Nothing new needed drawing: every shape and move was in the fx code already. New in the show: a boss's helpers on Bifrost are fed with `variant: 1` and checked to be drawn as the ghost sheet; `--boss-move=loke:nova#1` picks a boss's second move of a kind (Loke has two novas). `bosses: ok` counts 21 and 53 checks, 6 and 9 casts.
- **The saga's ending.** Killing Loke is a boss fall like any other: the `cleared` banner ("Loke är besegrad!", "Bifrost är klarad! Öppna kistan, och gå sedan tillbaka till Völvan Sigrun."), the family toast, the chest, the achievement for Bifrost. The saga itself ends in the *village*: handing the last chapter (Ragnarök, index 10) to Völvan sends the achievement toasts (Sparbössa, the title Ragnaröks hjälte, the saga's own achievement `saga_act2`), a level banner when it comes, the `reward` banner ("Ragnarök: klart!", coins, stars, the Bifrost piece) and the player's record with `chapter` past the end; Völvan's window (the story tab) then says `sagaAllDone` ("Sagan är slut, och Världsträdet är räddat. Tack, hjälte!"): it reaches the screen as that bubble in her window, not as a toast, because the window has no button that sends `saga:chapter` after the last chapter, so the server's own `sagaAllDone` toast is never asked for. The banners, the sparkle, the "+100 xp" floater (the village's fx view is the hero's area) and the toasts were all already sent and drawn, with one gap: **the HUD has one toast label, and the three toasts arrive in the same frame, so only the last was ever seen.** `HudLayer.show_toast` now queues toasts that arrive within 0.4 s of the one that opened the burst and shows them one after the other (2.4 s each, the last 3.5 s); a toast that comes while such a queue is still playing joins it (a friend's broadcast does not drop the title; the queue holds eight), the same words twice are shown once, and a toast that comes when nothing waits replaces what is there, as before. `saga.test.ts` has a test for the whole ending (Loke's fall: the banner and toast; the hand-in: banner, toasts, record, the sparkle; then `sagaAllDone`). `export-fixture.mts` runs the same rules to write `fixtures/ending.json` (the village with the hero ready to hand in, the changes of Loke's fall and the changes of the hand-in), and `scripts/demo_ending.gd` plays it headless: `--demo=loke --ending --once` feeds the fall and checks the `cleared` banner is on screen with its second line, and `--demo=ending --once` feeds the hand-in and checks every banner and every toast is shown in order, the sparkle and the xp floater are drawn, the record is past the last chapter and Völvan's window says the saga is over, then tests the HUD's toast queue on its own (printing `ending: ok`). Reverting the toast queue makes it fail ("only the last toast shown"). What is *not* shown, because the server sends nothing: there is no credits scene or "the end" screen. The saga ends in Völvan's words and the reward banner; Loke "tills nästa gång" stays a line of Völvan's chapter text.
- **CI and the clock.** The two dungeon pairs (ports 8124 and 8128) and the two boss shows join the existing parallel steps, so the eight pairs run side by side and the eight shows run beside the two endings (nothing added a new step; the village ending now takes about 25 s, running beside the shows, because a burst of four toasts plays for about 10 s and the queue test another 12). The fighter pair on Bifrost also asserts that every non-boss monster it samples is the ghost sheet. Locally on two cores pinned (a small runner): the Draugkryptan bots and the run pair 258 s together, the eight pairs 43 s (the six of M6b were 35 s), the eight shows and the two endings 20 s; the `export` job was 7 m 58 s after M6b, so M6c adds about 10 s to it.
- **Pictures** (manual `pictures` job: `shots/dungeons/m6c-*`; the keepers in `docs/m6c-<id>.png`, `-hall.png`, `-bosses.png`): the sandbox rendered them (OpenGL under Xvfb). The M6a and M6b pictures in `docs/` were taken again the same way, since they predated the motes-gravity and hotbar-label fixes (the montages are the per-move pictures of the workflow, three to a row).
- **Not done, on purpose.** The puzzle room of Bifrost (the hall of mirrors) and the gate are drawn by the existing plate and gate code but not played by a bot (the fighter pair stops after its first two packs); bosses are not fought to the end through the client; the balance pass `PLAN.md` mentions for M6c is the shared package's (`saga.test.ts` and the sagasim bots), which nothing here changed.

## Godot client: the character creator (2026-11-06)
Closes the "no character creator in Godot" gap that M5a left.
- **The way in.** The login screen's picker ("Vem är du?") has a "Ny karaktär" button under the list, shown once the gate
  says `ok` (and hidden when `/api/gate` says `canCreate: false`; the server checks again). It opens `CreatorWindow`
  (`creator_window.gd`, a `CanvasLayer` like the other windows: dimmed backdrop, dark panel, lit buttons). "Avbryt" and
  Escape close it; the focus goes back to the button.
- **The window.** A name field (up to 16 characters, trimmed, not empty: the rules `POST /api/players` applies) and four
  rows, each a big left arrow, a picture and a big right arrow: skin and hair colour show a swatch, hair style and
  shirt a small picture of that choice drawn by the look composer plus its Swedish name. The choices are the ones the
  browser's creator had: the six skin tones and eight hair colours of the farm atlas, hair styles short, long, curly,
  ponytail and bald, and the four starter shirts (red, blue, green, yellow; `STARTER_WARDROBE`). To the left a
  preview of the whole character (standing, facing the viewer) at 8x with nearest filtering, from `LookComposer`, so it
  is the same pixels the farm will draw. Arrows are ordinary focusable buttons: mouse, touch and pad work, and the
  pad's left and right move between them.
- **Skapa.** `Api.create_player` posts `{name, appearance: {skin, hair, hairStyle}, shirt}` with the device's bearer
  token (the route already took the header: no server change). On 201 the window closes, `Settings.player_id` is set,
  the picker is fetched again and the new character's card is the focused, selected one; the player presses it to play.
  Errors are shown in the window in Swedish (`sv.ts` `creatorErr*`, exported to `sv.json`): an empty name (400, also
  caught before anything is sent), "this device may not make more characters" (403 `create`: a guest used up its
  allowance), "not let in" (403 otherwise), "the farm is full" (409: `MAX_PLAYERS`, 8) and "the server does not answer".
- **No unique names.** The server has never refused a name that is already used (two Annas are allowed, each their own
  character), so there is no "name taken" message; adding one would be a server change the owner has not asked for.
- **The check.** `--creatorcheck` (`creator_check.gd`, run by `tools/bot-check.mts` and so by CI) drives the real login
  screen headless: the gate, the button, the window, an empty name refused, a chosen look, Skapa, the picker listing and
  selecting the new character, and the game welcoming it; the script then reads the character back from the server and
  compares the look. `BOT_ONLY=creator pnpm godot:bot` runs just this. `--creatorcheck --shot=file.png` (with a window,
  under Xvfb) saves the picture `packages/godot/docs/creator.png`.

## Godot client: Röstprat (2026-11-06)
Röstprat in the native client, on the server side exactly as designed under "Röstprat (2026-10-31)" (nothing in `server` or `shared` changed except Swedish strings).
- **Review fixes (2026-11-06).** The `talking` report is held back until 150 ms (`VOICE_TALKING_MIN_MS`, the server drops sooner ones) have passed since the last report: a short tap sends "on", then "off" as soon as the time is up, and `_talking_sent` only changes when a report is really sent. The microphone is open only while this device is the speakerphone, somebody is in another room and the mic setting is on (the OS indicator is off otherwise); sound that is not being sent is thrown away without resampling. Holding to talk for three seconds of digital silence shows `voiceNoMicNative` once. The playback underrun test uses the generator's real capacity (Godot rounds the ring buffer up to a power of two), the answerer keeps the peer it opened before the first offer (it drops one only when it already has a remote description), and `fetch-webrtc.sh` runs on bash 3.2.
- **Audio over a data channel, not a track.** Godot's `WebRTCPeerConnection` has no media tracks, only data channels. So the sound is sent as packets on one negotiated (`id` 1, both sides create it), unordered, `maxRetransmits` 0 data channel: 16 kHz mono, 20 ms (320 samples) a packet, one byte per sample of 8-bit mu-law (G.711 style, half of 16-bit PCM), a 16-bit sequence number in front (late packets are dropped). 16 kB/s a peer, about 110 kB/s out at the mesh's most (seven peers). No Opus, no echo cancellation: the room and speakerphone rules are what keep echo away, and a browser could not talk to this client (there is no browser client any more). `scripts/voice_codec.gd`.
- **The pieces.** `scripts/voice.gd` is an autoload that listens to the game socket and needs nothing from `world.gd`: the rules of `shared/src/voice.ts` ported (`voice_peers`, `my_speaker`, `offers`), `voice join` on login (when voice is available and the setting is on), the ICE servers of `voice ice` (a connection is opened only once they have come: they are sent when the device becomes the speaker), one `VoicePeer` (`voice_peer.gd`: a `WebRTCPeerConnection`, the data channel, an `AudioStreamGenerator` that plays what comes in, a 250 ms cap on what waits to be played) per speaker of another room, perfect negotiation reduced to what `offers()` needs (the offering side offers, the other answers and starts over on a new offer; a failed peer is rebuilt after 3 s), the handshake as `voice signal` {k: sdp|ice}, the microphone (`AudioStreamMicrophone` on a muted bus `VoiceIn` with an `AudioEffectCapture`, resampled to 16 kHz), `talking` on and off (RMS over a threshold, held 0.4 s), and teardown when the device stops being the speaker, hangs up or the socket closes.
- **Push-to-talk by default**, open microphone as a setting (the old browser client was open-microphone with a mute button; holding a key is easier on a keyboard than on a tablet, and the kids are on gamepads and keyboards now). Sound is only sent while the key (C) or the window's button is held; in open mode, while there is speech. The microphone is read only on a device that is its room's speaker.
- **Without the extension** (`GDExtensionManager` lists no webrtc extension; a `WebRTCPeerConnection` made without it only prints errors) `Voice.available` is false: no HUD button, and the pause menu's entry is shown greyed with "Röstprat finns inte i den här versionen" (`voiceUnavailable`) instead of hidden, the device never joins (it would take the room's speakerphone and not be able to use it).
- **The window** (`voice_window.gd`, a `GameWindow`, opened by the pause menu and a HUD button, reached from `Voice` so it needs no world): ring up / hang up, my room and who is its speaker (with "Använd den här som högtalare"), the other rooms with their speaker, the connection state and "pratar" while that room talks, "Jag sitter i ett annat rum" / "Jag sitter hos …" / back, the microphone on or off, push-to-talk or open, volume. The controls that must survive a redraw sit outside the list. It is a child of the running scene so the leak check at exit stays clean; no glyph the default font lacks goes into it (a fallback system font leaks at exit).
- **The extension** is `godotengine/webrtc-native` 1.2.2-stable (all four export targets have a binary: Windows x86_64, Linux x86_64 and arm64, macOS universal), not committed: `tools/fetch-webrtc.sh` fetches the release pinned in the workflow's env into `addons/webrtc/` (git-ignored) for CI and for a developer; the exports pick up the GDExtension's libraries by themselves. The macOS export has the microphone usage description and the audio-input entitlement (and library validation off so the extension's dylib loads).
- **Checks.** `--voicecheck` (codec, rules, and two peers in one process handing each other their handshakes and sending packets; `--require-webrtc` fails when the extension is missing, as it must in CI), `BOT_ONLY=voice pnpm godot:bot` (two bots on the in-memory server: both named as the other's peer, ice servers sent, an offer, an answer and a candidate relayed, a signal inside one room refused, hanging up). Microphones and speakers cannot be checked headless.

## Godot client: the atmosphere pass (2026-11-06)
**Merged with M7a (2026-11-07), which built several of the same things; the rule was that M7a's stay and ours go where both existed.** Dropped as duplicates: ~~fireflies~~, ~~chimney smoke~~, ~~autumn leaves in the trees~~, ~~dawn mist~~, ~~the pond at night~~ (sky colour and star glints; M7a's water takes its `sky_colour` from the clock instead), ~~the window beams~~ (M7a's window-light pool takes our warmer colour and our lamp ramp), our wind sway and our fog banks (fog weather drives M7a's mist at a higher alpha). Kept: the grade, the light, the weather (rain streaks, splash rings, puddles, two kinds of snow, hail, cloud shadows) and dew. The bullets below say what was there; struck-through words are gone.
The owner's favourite thing about the retired browser game was its cosiness; the Godot client had the mechanics (`day_night.gd` is a port of `sky.ts`) but not the mood. This pass is look and feel only: nothing in `server` or `shared` changed, no new gameplay, no new asset files (shaders only; textures are made in code).
- **The grade.** The browser multiplies the picture by the ambient colour; in 3D the ambient light, the sun, the moon and the fog all carry that tint, with a higher ambient share so a sun shadow is a quarter darker, not black, and soft sun shadows. Night is dark blue-teal and readable, dusk a dusty violet, golden hour warm gold with long shadows. A last full-screen pass (`screen_grade`, every preset) adds the browser's warm grade, vignette, a night push toward blue made by desaturating (so reds do not turn pink) with a luma mask that keeps lamps warm, and the lightning's double flash.
- **Light.** Lamps pool light (bigger OmniLights, soft attenuation, a flat additive pool on the ground that is what Låg shows), come on from dusk (`dark` 0.35 to 0.75), and the farmhouse's one real window and the shops' windows ~~throw a beam on the ground~~ get a pool of light on the ground in front of them (M7a's window light, in our colour). The hero carries a lantern outdoors after dark so the wild is readable near them; other players do not (a budget).
- **Weather.** Slanted rain with splash rings, puddles that linger, ~~fog banks and dawn mist~~ (fog weather now drives M7a's mist, a higher alpha than at dawn), two sizes of snowflake, cloud shadows on ground and props, everything easing in and out.
- **Extras.** ~~Fireflies~~, dew, ~~chimney smoke~~, ~~the pond at night~~, ~~autumn leaves~~ (only dew is still ours).
- **Decisions.** Fog (now M7a's mist) is flat patches over the whole view, not only over water and low ground (the map has no height to follow). The lantern is an OmniLight, not a screen-space effect, so it lights sprites and ground alike. Dungeons keep their own look: the grade is hidden there (`ScreenGrade.dungeon_look()`). Indoors in the farmhouse it stays on (warm grade, colour, vignette) but takes no night blue, dusk mauve, weather cast or lightning flash. `--daylapse` and `--weathers` exist for pictures and a video and do nothing when absent. Pictures: `packages/godot/docs/atm-*.png`.

## Godot client: creatures in 3D (2026-11-06)
The owner wants everyone in 3D, not only the people. `--people3d` now means 3D bodies for people and creatures; without it nothing changes, and the billboard stays the fallback for anything not built.
- **Hybrid, on a free CC0 budget.** The 44 mobs and ~100 animals are pixel sprites from `packages/art`; no free pack has bodies for a wolf, a hen, a cow and a slime in the game's style, and the sandbox cannot reach kenney.nl or itch.io. So the creatures are extruded from their own pixel art (voxel bodies, `voxel_body.gd`): one generator covers every kind and every variant (baby, winter, Christmas, tame, colour), keeps the colours the kids know and animates by swapping the sprite's two frames. The undead of the crypt are the exception: KayKit Skeletons (same artist, same rig and style as the Adventurers) are a better fit than any extrusion, so `skelett`, `gravvaktare` (Warriors), `draugkung` (the Rogue in a purple cloak), `vandrardraug`, `sjodraug` and `gengangare` wear them.
- **Every mob has a sheet.** All 44 `mob_<id>` sheets (`pnpm godot:sprites`, `isblock` among them: it is in no dungeon room), with their boss sizes, already exist on main; this branch uses them.
- **Decisions.** The depth profile is rounded in both directions (rows and columns) and capped, because the brief's row-only profile with 0.9 of the half-width made a wolf as thick as it was long and left a stack of ledges where a wide row sat under a narrow one. The outline pixels stay on the front and back faces only. The meshes are cached per sheet and frame and shared, one `MeshInstance3D` per actor, one `ShaderMaterial` per actor for the flash. Facing is a yaw, not a mirror, and the body turns at most 35° toward a walk up or down so a pillow never shows its end. The Skeletons' colours are an albedo multiplied over their texture, since it is not the Adventurers' swatch layout.
- **The people's gaps are closed.** The figures flash (an overlay over the meshes), lunge, play Hit_A, Throw on a swing and Interact on a tool, go blue when frozen, grey and lying (Death_A) when fallen. The Adventurers' basic rigs have no melee swing; the Throw animation stands in.
- **Not done.** Vehicles stay billboards. The pillow is a trial: thin one-row bodies (the wolf) read worse than round ones (cow, bear, slime), and the owner may prefer the billboard for some.
## Godot client: the alive world (visuals) (2026-11-07)
Milestone M7a of `PLAN.md`: the farm, the wild maps and the village get wind, a better water, and the small living things
of the old client's "cozy extras" (see "2D client: LittleJS") that fit 3D. Dungeons are untouched; day and night, the
seasons' colours and the weather's rain, snow, hail, fog and lightning are M4a's (`day_night.gd`) and were not redone.
Wildlife that flees and returns, footsteps and ambient sound are M7b. The server and `shared` are unchanged.
- **Every part is a toggle in `quality.gd` `PRESETS`** (documented in the constant's comment): `wind` (0–3), `water`
  (0–2), and budgets `fireflies`, `butterflies`, `leaves`, `smoke`, `mist` and `window_light`. Låg has all of it off
  except the wind of before (level 1) and the flat water. A budget of 0 builds nothing; a preset change (the bench does it
  mid-scene) rebuilds the budgets and swaps the water's shader, there is no restart. `--quality=lag|mellan|hog`,
  `--alive=all` (every ambient thing on whatever the hour and season) and `--year=spring|summer|autumn|winter` exist for
  pictures and the bench; none is saved.
- **Wind** (`farm_prop.gdshader`, one vertex shader for every prop). Level 1 is the old sway, instruction for instruction
  (Låg is not slower). From level 2 the strength is the weather's (`WEATHER` in `day_night.gd`: calm about 0.35, wind 1.7,
  storm 1.5; eased over a second or two so a front does not snap the trees) and the wind has a *direction* (towards
  south-east) and *gusts*: bands of stronger wind that cross the map along it, quicker the stronger it blows (travelling
  sines, no texture). Trees and baked pines (stiffer) bend from the trunk by height, and plants lean from the foot by the
  square of their height: the sway weight is the mesh's UV y (`FarmMesh.sway`: grass tufts, flowers, ferns, reeds and
  crops 1, bushes 0.5, crowns 0 and baked pines -1, which is how `farm_assets.gd` tells the shader); the displacement is
  turned into each instance's own axes (a tree is yawed at random). Level 3 adds a fast flutter on leaves.
- **Water** (`farm_water.gdshader` Låg, `farm_water_fx.gdshader` Mellan and Hög; `FarmAssets.set_water_level` swaps the
  shader of the same materials, so uniforms and chunks stay). Låg is flat: two colours, the bank's pale line and nothing
  else (no noise, and it reads no screen texture, which the engine would otherwise copy every frame the water is in view:
  that is why the cheap look is a different file and not a branch). The fx shader draws four crossing swells whose
  *slope* tilts the surface's normal (the sun glint, the light and the reflection all ripple together; calmer next to the
  bank, rougher in open water, and stronger in wind weather: `wave`), foam that washes in and out along the bank and, on
  Hög, flecks on the crests, and a **screen-space reflection**: the view ray is mirrored in the surface and marched
  through the depth buffer (16 steps on Mellan, 28 on Hög, 8 m, the ray flattened by about half so the far bank and its trees are found from the camera's steep angle) to find what stands above the water; the pixel it meets
  (a tree on the far bank, a house) is the reflection, otherwise the sky's colour (`sky_colour`, from the horizon colour
  of the clock). Only what stands on the *far* side of a pond mirrors in it, which is how a real
  mirror would look from there, and it is why nothing is mirrored under the hero's feet. Things lower than 25 cm
  (grass, flowers, the ground itself) never count as a hit, which also keeps noise out of the picture. Bog and
  chocolate mirror less, lava not at all. The ray points are tested in view space with helper functions that take the
  matrices as arguments (a Godot shader function cannot see `INV_PROJECTION_MATRIX`), and the depth is rebuilt with
  the Compatibility renderer's own clip range through `CURRENT_RENDERER`, so the same file compiles on Forward+,
  Mobile and Compatibility (the sandbox's Xvfb falls back to Compatibility without a Vulkan driver: both were run). The
  fishing line is unaffected: the surface stays within 1 cm of its old height and the bobber is placed by tile.
- **Ambient things** (`scripts/ambient_view.gd`, `assets/shaders/ambient_*.gdshader`): each is one `MultiMesh` whose
  instances move entirely in a vertex shader from `TIME`, so the CPU sends one `center` (the hero) and a fade per frame and
  nothing per instance; no simulation, no `GPUParticles3D`, and the same shader on every renderer. Quads face the camera by
  the shader's own billboarding (`POSITION` is written), so a MultiMesh's bounds do not matter (`custom_aabb` is huge).
  Fireflies, butterflies and the mist live in a 30 × 24 m box that wraps round the hero. Each fades in and out over about
  two seconds when its moment comes (`day_night.gd` passes the darkness, the season of the *year*, the weather and the
  day's fraction):
  fireflies on summer nights (not in rain, storm, snow or hail; windy nights too; not in the biomes without seasons), butterflies by day in spring and summer in
  sun or cloud, leaves in autumn whenever it is not wet or snowing (they fall from the crowns of the nearest twelve
  deciduous trees, found again when the hero has walked 4 m or the objects changed, and are carried along the wind),
  smoke from the chimneys of the farmhouse, the longhall, the smithy, the pizzeria, the bath house, the small houses and
  the apartments (the `chimney` offset in `SPECS`, found with the meshes' highest vertices; `FarmView.chimneys()`) at
  any hour, bending with the wind, and low patchy mist at dawn (from 0.955 of the day to 0.14, not in rain, storm,
  snow or hail). The mist's flat quads read no depth, so a trunk crossing one shows a hard edge; its alpha is low
  enough (at most about 0.3) that this is not noticed.
- **Window light.** The windows' glow and the lamps were M4a's; what is new is the pool of warm light on the ground in
  front of each lit window (Mellan, steady; Hög, flickering like a fire), on the same switch as the windows (`set_dark`).
  Houses that had no lit windows (the cottages and apartments) still have none: their window positions are in the
  KayKit meshes, not in the specs, and are not marked yet.
- **Checks.** The export job runs `--alive=all` headless on three preset/map pairs (scripts and uniforms; the headless
  renderer draws nothing). The bench (`--bench --scene=farm|village`) prints what is on screen per preset (the `alive
  world:` line) and with `--alive=all --time=0.9 --year=summer` measures everything on at once. Pictures (manual `pictures`
  job; copies in `packages/godot/docs/`): `m7a-farm-windy`, `m7a-pond-dusk`, `m7a-summer-night`, `m7a-autumn-leaves` and
  `m7a-lag-vs-hog`.

## Godot client: the alive world (life and sound) (2026-11-07)
Milestone M7b of `PLAN.md`, the other half of "the alive world" after M7a (visuals): wild animals that run from a hero and
come back, footsteps, and the ambience of the place. The farm, the wild maps and the village; the dungeons keep their own sounds
(`sfx.gd`) and are silent here.
- **Wildlife: a server rule, not a presentation.** The server owns every animal's position (the `state` snapshot carries
  `x`, `y`, `facing`, `moving`; the client only interpolates), so an animal that runs has to run on the server or it would run
  on one screen only and be where it was for everyone else (and for the lasso and the petting). `shared/src/sim.ts`
  `tickStartle` (called in `tickAnimals` before the old lasso flee): a *wild* animal (`ANIMALS[..].wild`, not a predator, a
  monster, a pet, a mount or traffic, not one that has been petted today) that has a **moving** hero within `STARTLE_TILES` (4)
  bolts away from them for `BOLT_MS` (1.8 s) at 2.2 × its speed (`startled`, the same `fleeUntil`/`fleeX` as the lasso scare, which is
  unchanged), after remembering where it stood (`haunt`). When the flight ends it catches its breath (2 s and a little more) and
  walks back to its spot; from then on it potters around `haunt` instead of drifting. A hero who **stands still** startles nothing,
  and an animal that has been startled before and has calmed down creeps up to a hero standing still within `CURIOUS_TILES` (7),
  to 1.1 tiles from them: so the way to pet a shy animal is to walk near, stop and wait (the farmer bot does exactly this, and
  asserts it). No random numbers are used (deterministic; the jitter of the spot it returns to comes from its id), pets, horses,
  traffic, farm animals and monsters are untouched. `startled` and `haunt` are optional fields of the animal and are saved with it
  like the rest of it (`haunt` is a coordinate on *that* map); both are cleared when the animal is tamed with the lasso and when it
  is taken to another map, and a missed throw clears `startled` (the scare then runs at the lasso's 1.5 x, not the bolt's 2.2 x). The
  players the animals watch are collected once per `tickAnimals`, not once per animal; a startled animal that has calmed down also drops its walk back to creep up to a quiet hero). Tests: `sim.test.ts` "vilda djur skräms och kommer tillbaka". There is no toggle in the presets for this: it is the
  same for every player, because it is the world's, not the screen's. The client-only extra is the **sparrows** (below).
- **Footsteps** (`scripts/footsteps.gd`). One sound per stride (0.9 tile) walked, so the rate is the speed (a hero at full speed
  makes about 4.4 a second) and standing makes none; the first step after standing comes half a stride on; a jump of more than
  1.6 tiles in one frame (a teleport, a door) makes none; riding makes none. The ground is `kind_of(terrain, snow)`: grass and
  moss; dirt (soil, paths, mud, gravel, ash); stone (road, pavement, flagstones, cobbles, bare rock); wood (`floor_wood`: the
  farmhouse's room, boardwalks, bridges); sand (sand, red sand, moon dust); snow (snow, ice, and grass or a dirt path while
  the map is white); water (the pools of the bath house, shallows). Three variants of each, picked so the same one does not
  come twice in a row, with a little random pitch and a pitch that follows the speed. They are 3D sounds at the walker's feet
  (the camera is the listener, so someone to your left is heard on the left); the distance is set by us, not the engine (the camera
  hovers 13 m above the hero): the hero's own steps are at full level, anyone else's 3 dB lower and 1.6 dB lower for every tile
  beyond 2 from the hero, none beyond 16 tiles, and none across the farmhouse's walls (a walker on the other side of the door from
  you is not heard); volume 0 makes no steps and no owl at all. The `steps` budget of the preset is how many can sound at once (the voices are
  pooled). Settings: `steps_on`, `world_volume`.
- **Ambience** (`scripts/soundscape.gd`). A mix of eleven looping layers; `Soundscape.targets(ctx)` is the whole rule (a pure
  function: place, hour, weather, season, indoors, nearness of water and fire), `update` eases each layer towards its target with
  a time constant of 1.8 s, which is the crossfade: the layers are not tied to the map, so moving to another map or the day turning
  only moves the targets. By place: `birds` by day (not in rain, strong wind or the cold), `crickets` at night (not in rain,
  wind or winter), `frogs` in the swamp (more at night), `wind_soft` always (more with the weather's wind and in the high and cold
  places) and `wind_hard` in strong wind, `rain` outside and `rain_roof` inside the farmhouse when it rains (storm and hail count),
  `surf` on the beach, `water` near ponds and the pool (within 9 tiles, louder nearer), `fire` near a torch, stove, forge or the
  longhall (within 7 tiles), `murmur` in the village (more by day). Indoors (the farmhouse's room) the wind layers are at 20 % and the others at 15 %. An owl hoots now and then
  (every 22–55 s) on a clear night in the meadows, woods and village. The dungeons: the world calls `silence`, which fades all out.
  Presets: `ambience` 0 off, 1 (Låg) the three loudest layers only and no nearness or owl, 2 everything. Settings: `ambience_on`,
  `world_volume` (shared with the steps).
- **The sounds** are synthesized and committed as WAVs (`assets/audio/`): `tools/make-audio.py` makes noise filtered in the
  frequency domain (which makes it periodic, so a loop has no seam), periodic envelopes and events placed with wrap-around; the
  loops are 16 kHz mono, 8–16 s (4 MB in all), the footsteps 22 kHz and 0.3 s. A loop's stream is a looped copy of the imported
  `AudioStreamWAV` (set up at run time, ending at the stream's real length; the files import as plain 16-bit PCM,
  `compress/mode=0`: ADPCM would make a byte count a wrong sample count). CC0, our own (`assets/LICENSES.md`). The sandbox
  and CI play nothing: headless, `Soundscape` and `Footsteps` run everything but `play()` (a playing stream is still held by the
  audio server when the process exits), `Main.quit_clean` releases the streams.
- **Sparrows** (`ambient_view.gd`, `ambient_sparrow.gdshader`; preset `sparrows` 0 / 6 / 12). Small brown birds on the grass round the
  hero by day in dry weather (not in wind), one `MultiMesh` like the other ambient things: they potter and hop in bursts, and when
  the hero comes within 4.5 m they lift and scatter up to 7 m away, gliding back when the hero goes. The shader is stateless (a
  bird's place follows from its distance to the hero), so there is no simulation; a bird behind the hero by 15 m is put down again
  somewhere else on open grass (tile free of anything built) at the edge of the surroundings.
- **Checks.** Server: `sim.test.ts` (an animal runs from a moving hero and walks back, one that stands still startles nothing,
  a calmed one creeps up to a quiet hero, the exceptions stay as they were, it is deterministic). The farmer bot (headless, in the
  `export` job) now asserts `startle` (it watches a wild animal run from the walking bot and come back next to it, to be petted),
  the soundscape's layers in the forest (`wind_soft`), indoors by the stove (`fire`, and no birds or crickets), in the village
  (`murmur`), footsteps over at least three kinds of ground including grass and wood, layers switching on the way (at least eight
  starts or ends), and no pile-up of sound nodes. (The headless voice pool stays empty, as nothing is played.) The bench (`--bench --scene=farm|village`) prints a `sound:` line per preset (steps
  made, the layers sounding, the number of players) and the `alive world:` line carries the sparrows' count.

## Godot client: settings and accessibility (2026-11-07)
Milestone M8b of `PLAN.md`: a real settings window, a text size, colour-blind palettes and less shaking and flashing. Client only; the
server and `shared` are untouched (the strings are in `sv.ts`, exported by `pnpm godot:gen`).
- **One place for every choice: `Settings`.** Each setting has a setter (`set_ui_scale`, `set_master_volume`, `set_colour_mode`, ...) that keeps
  the value, writes `settings.cfg` and applies it at once, and `_apply_all` runs them at start, so the window (`settings_window.gd`), the keys and
  the headless check all go the same way and nothing needs a restart. Sections of the file: `graphics` (quality, fps, window, res_scale),
  `effects` (one boolean per hand-made switch), `sound` (steps, ambience, volume = the world's, master, effects), `voice`, `input` (spells,
  ptt_key), `access` (ui_scale, colours, pattern, reduce_motion). Command-line forms (`--ui-scale=`, `--colours=`, `--pattern`,
  `--reduce-motion`, `--res-scale=`) are run-only overrides for pictures and checks: the value in use is the flag's, `save()` keeps writing the
  persisted one (`_run_only`), so no later save (F3, the login screen, a setter) ever carries a flag into `settings.cfg`; choosing the same setting in the
  window ends the override. A colour-blind palette's stripes are `Palette.pattern()`'s doing (mode ≠ normal OR the saved switch), never a saved choice,
  so going back to "Vanliga" takes them away; the checkbox shows them on and disabled meanwhile.
- **The window** (`SettingsWindow`, a `GameWindow` on layer 11, opened from the pause menu's "Inställningar" and from a button on the login
  screen) has four pages built once (a redraw would drop a slider that is being dragged): *Bild*, *Ljud*, *Läsa och se*, *Styrning*; `sync`
  reads every control back from `Settings` when it opens or after a click. Escape or `B` closes it (it takes the key before the pause menu below it).
- **Effects over the preset.** `Quality.TOGGLES` maps five switches (wind, water, ambient things, weather, wildlife) to the `PRESETS` keys they
  govern; `Quality.value(key)` / `alive(key)` give the preset's value unless the player switched that effect off (0) or on (Mellan's value when the
  preset has none, so a Låg player can have the gusts). Picking a preset clears the hand-made choices. A switch emits `Quality.changed`, which
  rebuilds what is built at the start (the weather's particles, the torches' sparks) like a preset change; the rest reads `alive` every frame. Steps
  and ambience keep their own booleans (M7b). The 3D picture's sharpness is a multiplier on the preset's scale (`Quality.scale_for`, never below
  0.4). The 3D figures are still the `--people3d` command-line flag (not a setting after PR 23).
- **Sound.** Two buses: `Master` (the master volume) and `Effekter` (created at start; `Sfx`'s players play on it). The world's steps and ambience
  keep their own per-node level from `world_volume`, Röstprat its per-peer volume. There is no music in the game, so no music slider (the bus is
  one line to add when there is).
- **Text size.** `Window.content_scale_factor` (stretch mode `canvas_items`) scales everything on the canvas: the HUD, every window, the chat, the
  hotbar and its labels. The 3D labels (names, bubbles, floating numbers) are `Label3D`s, so they follow through `Settings.scaled_label(label, base)`
  (their pixel size times the scale; a group re-applies it when the setting changes). At 175 % the default 1280 × 720 window is 731 × 411 logical
  points, which broke the layout in three places that are fixed: `HudLayer._layout` moves the boss's bar to the right under the connection dot when
  the screen is narrower than 1050 points (it lay over the hearts), stacks the middle of the screen in one top-anchored column that cannot overlap (a smaller banner, the toast, the "fallen" box; the spell bar steps aside while fallen and the chat feed hides while any of them is up, `centre_busy`), wraps the hint and lifts the spell bar
  and the lines above it a line; `GameWindow._fit` gives a window's scrolling body the height that is left and makes the panel no wider than the screen.
  Windows that are not a `GameWindow` (the bag with a chest open, the creator, the loot, the name box) and `GameWindow`'s panel as a net get `UiFit`: a panel
  bigger than the screen is scaled down about its middle to fit (never below 40 %), chosen so the container's top-left placement of an overflowing panel ends
  up centred; the chat box grows upwards from its bottom edge on a solid panel and the log above it makes room.
  Hotbar labels already shrink to fit ("Bärsärkaraseri"). Pictures: `docs/m8b-hud-175.png`, `m8b-talk-175.png`, `m8b-settings-reading-175.png`.
- **Colour-blind palettes** (`palette.gd`). Three palettes: `normal` (every colour the client had, unchanged), `rg` (deuteranopia and protanopia:
  danger amber with black stripes, safe blue, hearts blue / yellow / purple) and `tritan` (tritanopia: danger pink-red with white stripes, safe green,
  hearts green / orange / red). They were chosen against the Machado et al. (2009) simulations, and `Palette.distance_under` (the same simulation in
  GDScript, CIE76 distance in Lab) is what the settings check holds them to: full, half and low hearts at least 25 apart and danger against a safe
  place at least 60, under each condition the palette is for; the check also asserts the *normal* hearts are *not* enough for red-green blindness,
  so the test can fail. What reads the palette: the marks of coming attacks and the burning ground (`fx_view.gd`), the boss's gathering and landing
  colours (`Palette.move`: for `rg` greens move towards blue and reds towards amber, a mend is the "safe" colour; `tritan` keeps the move colours),
  the hearts and unit frames (`HudLayer.hp_colour`), the bars over heads (enemy, target, block) and the boss's bar.
- **Colour is never the only cue.** With a colour-blind palette, or the "Ränder och tjock kant" switch on its own (`Palette.pattern()`), a mark of an
  attack gets diagonal stripes (`danger_hatch.gdshader`: laid out in world metres, so a small mark and a big one have the same stripes, drifting slowly)
  and a thicker, brighter edge (a line mark, which has no edge by default, gets one); the marks are rebuilt when the switch changes. The warning sign
  over the monster that chases you is a shape, the bars carry numbers, and the length of a bar is the health.
- **Smaller things from the review.** The whirlpool (`pull`) mark has the stripes too; under "less shaking and flashing" the stripes stand still
  (`drift` 0) and the marks' edge stops blinking (steady, it blinked up to 24 times a second); the hearts and the boss's bar repaint at once on a change of
  palette (`HudLayer._repaint`); F3 with the settings window open updates its checkbox; a master volume of 0 is kept from start to start, so the pause menu and
  the sound page say "Allt ljud är avstängt" while it is 0.
- **Less shaking and flashing.** `Settings.calm(v)` is 0 with the switch on: the camera's shake (`world.gd`), the lightning's light spike and white
  screen flash (`day_night.gd`) and a third of the glow when a boss's attack lands (`fx_view.gd`). Hit flashes on bodies are gameplay feedback and stay.
- **Check.** `--settingscheck` (`settings_check.gd`, run by `tools/bot-check.mts` beside the other clients, `BOT_ONLY=settings` alone, about four
  seconds, no server): opens the window from the pause menu, changes every setting through its own controls and asserts that each is kept, in the
  file read back fresh, and applied (the viewport's scale, the audio buses, the content scale, the labels, the input map, the palette, the
  HUD layout at every text size in a 1280 × 720 window), that a restart reads it all back, and that everything is put back. The manual `pictures` job
  takes the window's four pages, the HUD, the farm and a talk window at 175 %, and the same boss telegraph in each palette (`docs/m8b-*.png`).

## Godot client: Smedjan (2026-11-07)

Smed-Stina's forge (the rules are the server's: `forgeGear`, `craftGear`, `forgeStats`, `FORGE_COSTS`, `FORGE_CRAFTS`, `FORGE_MAX` in
`shared/src/saga.ts` and `sagasim.ts`; "Bigger maps, landmarks, Smedjan and replays" above). The client only offers what can be paid and sends the intent.
- **Data.** `export-data.mts` writes `gear.forgeCosts`, `gear.forgeCrafts` and `gear.smith` to `game.json` beside the `forgeMax` it already had, so the window
  reads the same costs as the server. `Gear` (`gear.gd`) has the browser's helpers on them: `owned`, `forge_line` (a weapon's power is its rarity's times what
  the forge and its stats add, as `gearStats` counts it), `forge_cost`, `cost_parts` (the "any of" part counts every kind in its list), `affordable`.
- **Window.** `ForgeWindow` (`forge_window.gd`, a `GameWindow`) is opened by the "🔨 Smedjan" button in Stina's talk window (both its front and its chat page;
  `TalkWindow.forge_asked`), like the browser's `forgeButton`. Two tabs: *Förbättra* (a row per piece I wear or carry: name with "+n", rarity, slot, worn,
  five stars, now → next, the cost as coloured text, the button, off when the cost cannot be paid or at +5) and *Smid* (the six starter pieces, each once). Every
  row's control is a `Button` (keyboard, mouse, d-pad and A work as in every `GameWindow`); the body scrolls and the panel fits the text size. Walking more than five tiles from
  Stina closes it. `shown` keeps the numbers each row says, by item, for the check.
- **Refusals** are the server's toasts (not near her, not owned, short of material or kronor); the window does not repeat them.
- **Gear window.** A forged piece shows "Järnyxa +2" and its stars; the sums (`Gear.stats`) already counted the forge level.
- **Check and `dev kit`.** The farmer bot's new `smed` step (`farm_bot_home.gd`, `smedjan()`) takes `{t:'dev', a:'kit'}` (DEV_TELEPORT only: 20 stone, 10 gold,
  4 crystal, 400 kr, two papers and a bucket of red paint; tested in `saga.test.ts`), opens Stina's window and the forge, asserts the worn weapon's "now" and "next"
  lines against the numbers computed from the item data, forges twice and asserts the server's forge level, the bag and the purse against `FORGE_COSTS`, that the window then
  says the new numbers, that level 3 is out of reach (the button is off), the server's own refusal for a piece I do not own, that a starter piece is smithed
  and the gear window says "+2" with its stars.
