# Lilla Gården — design

Agreed design (2026-10-24). A 2D pixel top-down farm game in Swedish for one parent and two kids (7 and 9), playable on an Android tablet (Chrome) and a computer, co-op over the home network.

## Stack
- pnpm monorepo: `packages/shared` (types, item/crop/recipe data, sim, Swedish strings), `packages/server` (Node, `ws`, authoritative 20 Hz tick, Postgres via Drizzle), `packages/client` (Phaser 3 + Vite, PWA, 320×180 virtual resolution integer-scaled, landscape only). Since 2026-10-29 the game is drawn by `packages/clientljs` (LittleJS, see below); since 2026-10-30 it is the only client (the Phaser view and the 3D version are gone) and `packages/client` is just the home of the shared HUD, menus, networking and art.
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

## 2D client: LittleJS (2026-10-29)
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
- Device-based: an approved device holds a long random token in an `HttpOnly`, `SameSite=Strict` cookie (only its sha256 is stored, in `devices`). Everything but the gate pages (`/access`, `/join`, `/admin/login`, `/health`, the app manifest and icons) requires an approved device that may play right now.
- Join codes (2026-10-30, replacing one-time links): `invites` rows hold a hashed 8-character code (32-symbol alphabet without 0/O/1/I/L, 40 bits), a label, kind, device limit (1–5), expiry (≤30 days) and approval: `auto` (approved at once, the parent gets a push) or `parent` (a pending device with a 6-digit number for the parent to approve). Typed on `/access`/`/join` or carried in a link's fragment. "Öppna igen" makes a one-device code bound to an existing device that swaps its key instead of creating a device. Wrong codes: 10 per IP per 15 min, 100 per hour overall. Kinds: family (all characters) and guest (only characters it created or was given; creates 0–3).
- `ADMIN_PORT` splits the parent page onto its own listener, meant for a Tailscale address; the public listener 404s `/admin`. `NTFY_URL` pushes gate events (JSON publish to the ntfy server root).
- Rules: mode closed / family only / family + guests, play hours in Europe/Stockholm, pause/remove per device. The server re-checks open sockets on every change and every 15 s and closes them with code 4003; the clients then go to `/access`.
- Parents: `PARENT_PASSWORD` (scrypt-compared), optional TOTP stored in `settings`, in-memory 8 h sessions, per-IP and global rate limits. Gate events go to `access_log`.
- Sharing it publicly is meant to happen through a tunnel/proxy (`PUBLIC_URL`, `TRUST_PROXY=1`), not by opening ports.

## Röstprat (2026-10-31)
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
- The numbers were tuned by playing every dungeon with bots (one to four players); a family of three did the first act in 45–60 minutes. The client draws all of it (`client/src/ui/saga.ts`, `clientljs/src/saga.ts`, `client/src/art/saga.ts` and `sagaanimals.ts`), with a dungeon as dark as a cave but in its own colour (`DUNGEONS[id].ambient`).

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
- **Art conventions** (`client/src/art/saga.ts`, `sagaanimals.ts`): `saga_wall`, `saga_gate`, `saga_torch`, `saga_exit`, `saga_portal` take their dungeon's *look* as `variant` (0 Draugkryptan, 1 Frostjättens borg, 2 Surts smedja, 3 Helheim, 4 gruvorna, 5 templet, 6 lunden, 7 Fenrisklyftan, 8 Bifrost). Each dungeon has four decor kinds (listed in `DUNGEONS[id].decor`), drawn in three variants each; `saga_plate` is variant 0 dark, 1 lit. Loke's illusions are the existing skeleton, ice wolf, fire hound and ghost drawn as `variant: 1` (ghostly and see-through; `illusions: true` on the dungeon). Creatures are spooky-cute with two walk frames, bosses about twice the size; pets and mounts have entries in `SAGA_RIDE_LIFT`.

## The saga world (2026-10-31)
The family finished Sagan II and said the same thing about the rest of the game: the dungeons are Norse, but the city has cars, buses and asphalt, and out in the world there is nothing to hit except a bear. They wanted the world to feel like the saga, monsters to hunt everywhere with experience for each one "like in WoW", and a level system that pays in looks (glowing clothes, legendary things) rather than power, so a parent at the top level can still play with the kids at level one. Spelhallen and Rallyvärlden's garage were kept exactly as they were at the time (both removed on 2026-11-01, see below).
- **The town.** The city is reskinned and renamed, not rebuilt: `buildCity` and every id (`car`, `motorcycle`, `bus`, `train`, `street_lamp`, `traffic_light`, `apartment`, `shop`, `bus_stop`, `train_station`, `parked_car`, `bathhouse`) are unchanged, so traffic loops, bus and train rides, bought vehicles, saves and the tests are untouched. Only `sv.ts` names change: Köpingen (the biome `by`), Hästkärra, Ridhäst, Diligensen (5 kr), Gruvtåget (15 kr), Badstugan, Lykta, Långhus and so on, and "Kärror & hästar" in the farm shop. The honk emote keeps its id and fx and is now a whinny (🐴 Gnägg!). `city.ts` adds banner poles, barrel stacks, a runestone and a hay cart to the square (`TOWN_DRESS`), and `ensureTownDress(world)` does the same for a saved city on load: idempotent, only on free tiles that are not streets, not villagers' spots and not under a player.
- **Art conventions** (`client/src/art/world.ts`, `landmarks.ts`, `animals.ts`). Terrain `road` is cobblestone, `sidewalk` flagstone, `crossing` pale slabs, `rail` iron on ties as before. Houses and shops are timber with several variants (hanging signs for the smith, baker and weaver). Window panes are drawn in the shared glass colours (`GLASS`/`GLASS_L`, pale blue) so the client's window light finds them and lights them at night; do not paint panes in other colours. Vehicle sprites keep their old footprints so the sim needs no changes: cart (`car`) 32×16, riding horse (`motorcycle`) 24×20, the rider being the player sprite drawn on top, with the seat where the moped's was, and the Diligens and the mine train keep the length of the bus and the train. Headlights are lanterns (amber).
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
- **Landmark art** (`client/src/art/sagaplaces.ts`, registered in `world.ts`): a 3×3 footprint is a 48 px wide frame, a 4×3 one 64 px; the picture may rise to about 64 px, so it is registered with an `oy` offset that puts its foot on the footprint's bottom edge. Light comes from the top-left; animated ones (waterfall, fire well, chocolate fountain, satellite) have two frames. The ground a landmark stands in is painted after the outline so it runs into the map.
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
- **Sprites.** `tools/export-sprites.mts` bundles the drawn-in-code art of `client/src/art` with Vite and runs it in
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
  section 3 of the plan defines them (resolution scale, shadows on the nearest torches, SSAO, SDFGI, volumetric
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
  prints the same. The build sandbox could not run Godot this time (its network policy refused the editor download),
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

