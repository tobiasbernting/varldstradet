# Handoff: Världsträdet, where the work stands

Written 2026-11-06 by the orchestrating session for a different agent that takes over; last updated 21:50 UTC. `PLAN.md` is the plan
of record, `GAME.md` the run design (approved by the owner on 2026-11-06), `DESIGN.md` the record of the game as built.
This file is only what the next agent needs: state, decisions, how the work is run, what is open. The work is
**paused** at the owner's request; the next agent resumes from section 1.

## 1. State on 2026-11-06 18:00 UTC

- Repository `tobiasbernting/varldstradet`, seeded 2026-10-31 from `tobiasbernting/lilla-garden` main with full history.
  The browser game stays in lilla-garden untouched and the kids keep playing it there.
- Merged, in order, each as a pull request against `main`:

| PR | Milestone | What |
| --- | --- | --- |
| 1 | M1 | Minigames removed (52k lines), migration 0004 scrubs their saved data |
| 2 | M2 | Bearer-token login (`POST /api/join`, `GET /api/gate`, `Authorization: Bearer` on `/ws`), `packages/godot` skeleton, Godot CI exporting four targets |
| 3 | M3a | Draugkryptan rendered from server data in HD-2D, sprites exported from the pixel art, movement with prediction, HUD, quality presets, `DEV_TELEPORT=1` dev route |
| 4 | M3b | Krigare's four spells, telegraphs, bosses, falling, loot window, chat, emotes, buttons-or-wheel gamepad setting, F3 overlay, `--bench`, a headless `--bot` and the two-bot CI check |
| 5 | M3c | Fix-up after the owner's first run: health-bar sorting, wall z-fighting, sprite lean, Godot 4.7.2 in CI, README run recipe |
| 6 | M3d | Performance: pixel budget per preset, torch shadows on Hög only, cheaper casters, clean exit, leak checks in CI |
| 7 | M4a | The farm and the wild maps on screen, day/night/seasons/weather, people and animals as sprites, the real arch into Draugkryptan |
| 8 | M4b | Bag and hotbar, tools on tiles, crops, drops, animals and pets, fishing, coins and stars; dev `nextDay` |
| 9 | M4c | Building with ownership, the farmhouse, shop and sell box, wardrobe, gear window and hero switch, cooking, villagers, Köpingen, the bus, Völvan's class pick; dev `starter` |
| 10 | M5a | Browser client retired; pixel art moved to `packages/art`; `/` is the download page; voice and character-creator gaps recorded |
| 11 | M5b | `GAME.md`; the run generator, rules and bot brain (`run.ts`, `runmap.ts`, `runsim.ts`, `runbot.ts`), the hired companion, sagafrön and the sagaträd, färdkost, the three buildings, server handlers, data export; a review fix-up round (seven findings) and the soft 30-minute clock; merged 12:04 UTC as bd01a91 |
| 12 | backlog 3 | The character creator in the Godot client: "Ny karaktär" on the login screen, a creator window with the look composer, `POST /api/players` from the client, a headless creator check, `docs/creator.png`; merged 14:52 UTC as 70dac5a |
| 15 | CI | By the owner's other session (`session_01KTh22pJ2K85r8267Nim4Fy`, Opus): the Godot workflow split into a fast `export` job (headless checks, bots, exports, about 6 minutes, on every PR) and a `pictures` job (Xvfb pictures, benches, the windowed farmer) that runs only on a manual `workflow_dispatch`; shared setup in `.github/actions/setup-godot`; job timeouts; superseded PR runs cancelled; merged 18:32 UTC as 3707985 |
| 14 | backlog 2 | Röstprat in the Godot client: mu-law audio over a WebRTC data channel (`webrtc-native` 1.2.2-stable fetched by `tools/fetch-webrtc.sh`, not committed), `voice.gd`/`voice_peer.gd`/`voice_codec.gd`/`voice_window.gd`, push-to-talk default, a headless voice check and a two-bot signalling check, `docs/voice.png`; reviewed, seven findings fixed by a fix-up child; merged 19:28 UTC as 2873377. Not yet heard by the owner. |
| 13 | M5c | Runs in the Godot client: the färdport arch, the Yggdrasil shoot in five stages, the smithy, herb garden and longhouse, the arch window, zones drawn with the biome looks, the run HUD with the soft clock, the three runor cards and the vote, the end summary, the sagaträd window, the hired companion drawn, a run bot with a headless CI check and an Xvfb picture run, docs and five pictures; six review findings fixed, a run-bot stall at 2–3 fps fixed, wipes retried; merged 21:49 UTC as c874511 |

- **Resumed 2026-11-06 22:36 UTC by orchestrating session `session_01KTh22s6gWj5rerGqj3fNdr`.** Since then:
  PR 16 (tidy-up of the PR 13/14 leftovers below, plus five review fixes) merged 23:46 UTC as ccaa03a; PR 17 (M6a:
  a per-dungeon look table `dungeon_look.gd`, Frostjättens borg, Surts smedja and Helheim with sprites, every boss
  move telegraphed, `demo_bosses.gd` boss shows that assert what they fed, dungeon bot pairs per chapter in CI, a fix of
  a socket teardown race in `net.gd`, eight review fixes) merged 2026-11-07 01:16 UTC as f06f2f6. The export job is at
  10m55s, over budget; M6b's brief makes cutting it the first step.
- PR 18 (M6b: Svartalfheims gruvor, Havsormens tempel, Alvernas lund; export job cut to 7m58s by running the dungeon
  pairs and boss shows in parallel; mote gravity per kind; hotbar labels shrink to fit; five review fixes) merged
  2026-11-07 02:36 UTC as 9cb2d69.
- PR 19 (M6c: Fenrisklyftan and Bifrost with Loke's illusions drawn ghostly, the saga's ending on screen with
  `demo_ending.gd`, a toast queue in `hud.gd` that keeps bursts, the bots' gate request retried on no answer
  (`Api.request_json_retrying`), all M6a/M6b pictures re-taken; review fixes) merged 2026-11-07 04:03 UTC as add8a48.
  **M6 is done**: all nine dungeons and the ending are in the Godot client. Export job 8m16s.
- PR 20 (M7a, the alive world's visuals: wind on foliage, water with waves, shore foam and screen-space reflections on
  Mellan/Hög, fireflies, butterflies, leaves, chimney smoke, dawn mist, window light, each a preset toggle; a real
  Forward+ shader compile under Xvfb/lavapipe in the export job; review fixes) merged 2026-11-07 06:03 UTC as b48ce70.
  Export job 9m51s (M7b's first step cuts it). The screen-texture copy of Mellan/Hög water is the main GPU cost to
  bench on the MacBook.
- **Running now:** M7b (wildlife that flees and returns, footsteps, ambient sound) `session_01KTh22rF2Y4u6N5YDy7c9rJ`
  on `claude/m7b-alive-world-life-sound`. Then M8. The owner tests PR 11–20 on the MacBook on 2026-11-07.
- **Branch `claude/eloquent-rubin-0r5o0h` (sections 1b–1d: the art pass, the atmosphere pass, creatures in 3D) merged `main`
  up to PR 20 and reconciled the overlap with M7a.** M7a's stay (the preset framework, wind, water, fireflies, butterflies,
  leaves, chimney smoke, dawn mist, window light); dropped from the atmosphere pass as duplicates: its fireflies, chimney
  smoke, autumn leaves in the trees, dawn mist, the window beams and the pond at night, plus its old wind sway and its
  fog banks (fog weather now drives M7a's mist at a higher alpha). Kept: the day/night grade, screen grade, lamp pools,
  the hero's lantern, rain/snow/hail/puddles/cloud shadows and dew. Details in `DESIGN.md` and `ART.md`.
- **The leftovers below were fixed in PR 16** except the waypoint tolerance and the voice bot using bare sockets.
- **Small things left over from PR 13 and PR 14, for one tidy-up PR** (none blocks anything): the pick screen shows
  "Välj en runa!" twice, offset (the server's `reward` banner over the pick's own title; `run_pick.gd` / `hud.gd`);
  README's M5c paragraph links `m5c-farm-run.png` and `m5c-smithy.png`, which do not exist (the `pictures` job takes
  `farm-run`, `farm-run-night`, `farm-smithy` and `farm-longhall` into `shots/`; copy two of them in or fix the links);
  the arch window's empty färdkost slot shows a missing-glyph box; the run bots retry a wipe twice (`MAX_WIPES` in
  `run_bot.gd`, set 0 to make a wipe fail the check); the waypoint tolerance is about 1.25 frames of travel and a
  client at a few fps still plays the dungeon by guesswork against telegraphs; the voice bot check exercises the
  server with bare sockets, not the Godot client; the creator's "Inga karaktärer än" hint on a guest device that may
  not create characters, and the creator check not pressing the arrow buttons.
- Not yet done: M6 (the other eight dungeons and chapters as zone sets in the client), M7 (alive world), M8 (polish,
  release tag, homelab deploy of the v2 server, `DESIGN.md` rewrite).

## 1b. Art pass (session `session_01KTh22oagteA1US6DqRwXHt`, 2026-11-06, branch `claude/inspiring-hypatia-txeupy`)

The owner asked for nicer assets than the code-generated placeholders. Pushed to `claude/inspiring-hypatia-txeupy`,
**no pull request opened yet**; `main` merged in at the end (clean). `pnpm godot:bot` passed on every art commit through
the rock walls (dd2cb18); not yet run after `main` was merged in. Pictures were shared in chat
only, none are in `packages/godot/docs/` yet. `packages/godot/ASSET_MAP.md` maps every object kind to a pack model
and says what is wired.

| Commit | What |
| --- | --- |
| a5b86a9 | `ASSET_MAP.md`; `fetch-assets.sh` also clones KayKit Furniture, Halloween and Restaurant Bits |
| 2936848 | KayKit Halloween Bits: the crypt's coffins, bones and rest shrines (generated meshes stay as fallbacks), dead trees, pumpkins, jack-o'-lanterns, lamps and lanterns; KayKit Furniture Bits: bed, table, chairs, sofa, plant, painting. `_baked()` got a pivot, an offset and a "lamp" glow mode; `downloads/` gets a `.gdignore` |
| 0dbd90d, 403e38a | Kenney Nature Kit (uploaded by the owner) for bushes, berry bushes, grass, flowers, mushrooms, fern, palm, cactus; KayKit Forest (uploaded) for the oaks and apple trees (the owner's pick: KayKit trees with Kenney bushes and grass). Recolour modes "leaf" (Kenney, by material name) and "forest" (by colour) keep the season, wind and snow; `_with_fruit()` hangs apples and berries |
| a70b26b, d00df72, 1b388bb | `--people3d` (off by default): players and villagers as chibi KayKit Adventurers figures put together from parts by `figure_3d.gd` and recoloured from the creator's look (`LookComposer.colours_for()`); in a dungeon the class's outfit. `export-data.mts` now exports the villagers' appearance and outfit |
| 369dc85 | All 26 landmarks from pack parts (`landmark_models.gd`), lantern night glows, fires; the cave mouth is the Kenney cave cliff. The baker reads vertex colours (Kenney's real colours); recolour "kenney"/"cliff" by material |
| dd2cb18 | Rock walls: Kenney cliff faces on every side facing land, boulders at the foot, no sky seams between wall tiles |

Owner decisions in this session (do not re-ask):
- Art stays free CC0. Quaternius characters are **not the right style**; KayKit's chibi look is.
- Köpingen is **skipped** for now (it may come back later); the focus is the landmarks and the wild maps.
- The 3D people stay behind `--people3d`; animals and monsters get 3D later. Proposed and not yet chosen: KayKit
  Skeletons and KayKit Character Animations (both free, same rig) for the crypt and combat animations, and either a
  pack or voxel figures extruded from the pixel art for the ~150 animals and monsters.

Open in this line of work:
1. Open a PR for the branch (or hand it to the orchestrating session), with the pictures in `packages/godot/docs/`.
2. Rock-wall tops are still flat squares; small rocks and tufts on top or rounded corners would help.
3. Still generated on the wild maps: reed, shell, dig spot, the white flower, wisps. On the farm: fences, gates,
   mailbox, sell box, chest, workbench, trough, scarecrow, bench, flower box, the animal sheds, torch, snowman,
   Christmas tree, maypole, runestone; the farmhouse's walls, door, window, rug, bookshelf, clock, stove, wardrobe.
   `ASSET_MAP.md` has candidates for most (Kenney Nature fences, Hexagon props, Dungeon and Restaurant pieces).
4. Landmarks that read weakly: Klocktornet (a red church in the sand), Apkungens tron, Den förstenade jätten; the two
   bone landmarks look alike.
5. In the Godot client Köpingen still has asphalt and zebra crossings and modern generated buildings; the street lamps
   (`post_lantern` at ×1.1) are far too big there. Only matters if Köpingen comes back.
6. `--people3d` gaps: no hit flash, lunge, swing, frozen or webbed pose on figures; "bald" uses the barbarian head,
   whose beard takes the hair colour.

## 1c. Atmosphere pass (session `session_01KTh22rMH5UutKMoSA5XCUG`, 2026-11-06, branch `claude/eloquent-rubin-0r5o0h`)

The owner asked for the browser game's cosiness, its changing light and weather, in the Godot client. The branch starts
from the art pass (section 1b merged in at 59a6366) and adds ten commits, all under `packages/godot/` plus `ART.md`
("Atmosphere") and `DESIGN.md` ("Godot client: the atmosphere pass"). **No pull request opened yet**, awaiting the
owner's approval of the pictures (`packages/godot/docs/atm-*.png`) and a time-lapse video shared in chat.
`pnpm godot:bot` green on every commit; nothing in the bots, the workflow, the server or shared was touched.

| Commit | What |
| --- | --- |
| 17049df | The browser's ambient curve carried by ambient, sun, moon and fog; soft sun shadows (angular distance, blur); the moon; the ground and prop shaders undo the Compatibility renderer's second sRGB conversion of vertex colours |
| ea11466 | `screen_grade.gd` + `screen_grade.gdshader`: one full-screen pass under the HUD on every preset (warm grade, saturation, night blue by desaturation, dusk mauve, vignette, lightning double flash); glow threshold and strength from the dark |
| 0aeaf5e | Lamps with bigger OmniLights and a ground pool quad each (`light_pool.gdshader`), ~~a light beam on the ground from the farmhouse window and the village windows~~ (dropped for M7a's window light pools), the hero's lantern outdoors at night |
| 0d41e51 | Rain streaks (slanted, 2x in storm) and splash rings, puddles that dry over ~40 s, ~~fog banks that double as dawn mist~~ (now M7a's mist), two flake sizes, hail, cloud shadows in cloudy weather and on props |
| 6a71e02 | ~~Fireflies, chimney smoke, the pond at night, autumn leaves~~ (dropped for M7a's), dew sparkles in the morning sun |
| 6150bc7 | Demo-only `--daylapse=<s>`, `--weathers=a,b,c`, `--weather-every=<s>` for videos |
| 7f21c3c | ART.md, DESIGN.md, the docs pictures |
| e5ee223 | The owner found the first result washed out: re-tuned rich and warm to measured targets (`scratchpad` script `meas2.py`: mean HSV saturation at or above the pre-pass pictures: noon S 0.75, golden 0.93, night Forward+ S 0.57 V 0.29); no desaturation anywhere, no black lift, contrast 1.06 by day, vignette 0.18/0.32, night as a navy multiply (0.5, 0.66, 1.25) with warm lamps masked, lamps and pools more orange, ambient cooler than the sun, no depth fog in clear weather, ambient 0.2 / sun 0.34 at noon (the higher energies clipped the grass to yellow-white) |
| d4a935f | Dusk violet, not pink: multiply (0.76, 0.74, 1.0) at 0.8, saturation boost only on blues and violets, darker (V 0.23) |
| 441a5b5 | Review fixes: `fog_disabled` on every additive quad shader (the depth fog made them squares on Compatibility in rain and fog), no cloud shadows at night, smaller darker puddles, weather budget mellan 900 / hög 2000 with `preprocess`, thinner day fog, actor sprites lifted at night by emission (`Actor.night_lift`, off indoors and in dungeons), softer pools, fog banks that fade |

How the pictures were judged: the retired browser client (commit 620e395) was built in a worktree and screenshotted
with Playwright against its own server (`POST /admin/time` and `/admin/weather` with `ACCESS=open`), and the Godot
scenes rendered next to them under Xvfb (`--rendering-driver opengl3`, ~15 s each; `vulkan` on Mesa lavapipe shows
Forward+ with glow and SSAO in ~45 s). A time-lapse: `--demo=farm --time=0.3 --daylapse=70
--weathers=sun,cloudy,rain,storm,sun,fog,snow --weather-every=12` recorded with ffmpeg x11grab.

Open in this line of work (not blocking):
1. Day fog is still fairly milky; dusk is more rose than the browser's violet; puddles read as dark ovals.
2. Fog banks and dawn mist lie over the whole view (the map has no height data to keep them to the water and low ground).
3. The chimney smoke's place on the farmhouse is a guess (ridge top); the fireflies follow the real month, so in
   November only `--season=midsommar` shows them.
4. No thunder sound; `sfx.gd` was not extended.
5. Nothing of this has been seen on the MacBook (Forward+, Metal) yet: check the night on the farm, the rain, and that
   Mellan holds its frame rate with 900 weather particles and the extra full-screen pass.

## 1d. Creatures in 3D (session `session_01KTh22rMH5UutKMoSA5XCUG`, 2026-11-06, same branch)

The owner asked for the mobs and villagers in 3D like the players ("if you find a good solution go with it"). Built by
a Sonnet child in a worktree (`creatures-wip`, merged at 4ac4499 and 2d218d3), all behind the existing `--people3d`
flag, the billboard as the fallback; `pnpm godot:bot` green on the merged head. `ART.md` "Creatures in 3D",
`DESIGN.md` "Godot client: creatures in 3D (2026-11-06)", `ASSET_MAP.md`, `LICENSES.md`. Pictures
`packages/godot/docs/creatures-{farm,forest,fight,undead}.png`; `--demo=lineup --set=undead|animals` draws a lineup
without a server (`scenes/lineup.tscn`, `scripts/demo_lineup.gd`).

| Commit | What |
| --- | --- |
| 4032327 | All 44 mobs and bosses exported as `mob_<id>` sheets (39 were missing) |
| 56b9718 | `voxel_body.gd` + `voxel_body.gdshader`: a creature mesh extruded from a sprite frame (pillow depth profile, the shallower of row and column, floor 1.5 px, cap 3.5 px; outline pixels only on the front and back; per-face shading baked into the vertex colours), cached per sheet and frame |
| e827ce2 | `Actor.set_voxel`: frame swapping, yaw facing (at most 35° toward a walk up or down the screen), breathing, hit flash, lunge, lying on its side when fallen, the night lift; `world.gd` gives every animal and monster a voxel body under the flag; vehicles stay billboards |
| 7cf12f7 | KayKit Skeletons (CC0, GitHub `KayKit-Character-Pack-Skeletons-1.0`, 5.5 MB, the Rogue's and Minion's animations stripped by `tools/strip_glb_animations.py`): `skelett` Warrior 1.45 m, `gravvaktare` Warrior 2.5 m, `draugkung` Rogue 2.75 m with a purple cloak and green eyes, `vandrardraug`/`sjodraug` tinted Minions, `gengangare` a 40 % Minion; idle, walk, attack on the swing, Hit_A on the flash, Death_A when fallen (`skeleton_figure.gd`, the `KINDS` table) |
| c9e759b | The people's figures: hit flash and fallen tint (a material overlay), lunge, `Throw`/`Interact` on the swing (the Adventurers rig has no melee swing), blue frozen tint, Death_A |
| 334abbf, 2d218d3 | Review fixes; the figures' night lift a tenth of the sprites', the hero's figure none (it blew out white under Forward+ glow) |
| (this) | The voxel night lift warm-neutral (white animals went electric blue under the navy grade) |

Open: the wolf and other thin side-view sprites are the weakest voxels; `draugkung` reads as a hooded figure rather
than a crowned king; `creatures-fight.png` is a lineup, not a frame of the real fight; nothing seen on the MacBook.

## 2. The owner's decisions (do not re-ask)

| Topic | Decision |
| --- | --- |
| Platform | Godot 4 native client (Windows, macOS, Linux); no consoles, no web wrapper |
| Co-op | Co-op first, invite only, over the internet, adults and kids; solo via scaling and a hired companion |
| The farm | Home base between runs, and farming and animals stay fun in their own right; the farm feeds the run |
| Art | At most 50 EUR total; free CC0 packs first (Kenney, KayKit, Quaternius), generated art where they fall short; nothing bought so far |
| Hardware | Integrated graphics is the baseline with a higher tier for dedicated GPUs; the owner runs a MacBook Air M4, Godot 4.7.2, Metal |
| Server | Reuse the running Hetzner + Cloudflare tunnel setup from the homelab repo (`cloud/`), join codes, parent page over Tailscale |
| Repository | New repo `varldstradet`, seeded with full history; lilla-garden untouched |
| Models | All child sessions on Sonnet (`claude-sonnet-5-5`) to spare the weekly limit; review and merge in the orchestrating session |
| Runs | Three zones and a boss; runor (per-run boons) and sagafrön (permanent upgrades at the Yggdrasil shoot) both kept. The 30 minutes is a **soft target** the numbers are tuned to (clumsy, kid-like bots: about 21 minutes for three players), with nudges at 25:00 and 30:00 and every 10 minutes after, never a forced end: "should not be a hard cap, do what is best, we can adjust later" (owner, 2026-11-06). `GAME.md` approved as it stands otherwise. |
| Voice | Decided by the orchestrating session on 2026-11-06 because Godot's WebRTC has no media tracks: mu-law audio over a data channel, push-to-talk default (section 1, PR 14). The owner has not yet heard it. |
| Browser client | Retired from varldstradet (done in M5a) |

Owner feedback from the MacBook: the crypt runs over Metal; health bars jumped and walls had smears (fixed in M3c);
M3d bench baseline at 1280x720 points: Låg 92 fps / 1 % low 81 ms, Mellan 48 fps / 30 ms, Hög 27 fps / 75 ms. The
after-M3d bench, the house and village benches and an Intel laptop bench were never sent. Nothing from M4 onward has
been tested on the MacBook yet; PR 11, 12, 13 and 14 each carry a "what to check on the MacBook" recipe.

## 3. How the work is run

- One milestone (or one backlog item) per child session, created with `create_session` on `claude-sonnet-5-5`,
  `source_revision: main`, an `outcome_branch` named after the work, and a brief that stands alone (the child has no
  other context). Briefs that worked: read HANDOFF.md sections 2–4, PLAN.md and the relevant DESIGN.md headings first;
  numbered deliverables; rules (one commit per step, typecheck and tests green, never skip a test, server changes only
  with tests, Godot workflow green); open a PR with a body listing what was done, commands run, what to check on the
  MacBook, pictures, and what was unsure; do not merge. Today's briefs are in this session's transcript and in the PR
  bodies; copy their shape.
- **Review before merging** (the recipe that found real bugs in PR 11 and PR 13): `pull_request_read` check runs on
  the head; the diff of everything outside `packages/godot` (server and shared changes need tests); `pnpm install
  --frozen-lockfile && pnpm -r run typecheck && pnpm -r run test && pnpm godot:gen` with a clean `git status`; look
  at the screenshots in `packages/godot/docs/`; then an **independent Sonnet review agent** (the `Agent` tool,
  read-only) given the design document and the diff and asked for correctness bugs and mismatches with the design,
  with the shared code named as the contract; hand its confirmed findings to a **Sonnet fix-up child on the same
  branch** with a standalone brief (one commit and one test per finding), or send them to the original child as a
  message about its own PR (children accept messages about CI or review on their own PR and act on them; they will
  not take new scope from a message). Then `merge_pull_request` with `merge_method: merge` and `expectedHeadSha`.
- **CI time budget:** the Godot workflow's `export` job (headless checks, bots, exports) runs on every PR and should
  stay under ~10 minutes. Anything under Xvfb (pictures, benches, the farmer's or the run pair's windowed runs) goes in
  the `pictures` job, which runs only on a manual `workflow_dispatch` (Actions -> Godot client -> Run workflow on the
  branch) and uploads the `farm-screenshots` artifact. Do not add slow steps to the `export` job.
- **Children go idle while waiting for CI** (Godot workflow runs) and do not reliably wake on their
  own schedule. Check-ins from the orchestrating session (`send_later`, 45–60 minutes) are what keeps the work moving;
  a child that has gone idle before finishing is nudged with a message about CI on its own PR. A child must not use
  CI as its debugger: Godot 4.7.2 can be installed in the sandbox (download the editor zip from the godotengine GitHub
  release into `~/godot`, checksum from the workflow, then `--headless --path packages/godot --import`), so a client
  bug is reproduced headless locally first. If a child is told to stand down, say so explicitly and start the fix-up
  child on the same branch.
- **GitHub does not run the `pull_request` workflow on a PR that conflicts with its base.** After every merge to main,
  check `mergeable_state` of the open PRs and have the child merge `origin/main` into its branch (plain merge, no
  force). Two PRs touching `bot-check.mts`, `sv.ts`, README, DESIGN.md or PLAN.md will conflict with each other.
- **Known CI flake:** the farmer bot's walks in the village under Xvfb (twice "the bus: the stop did not open the
  window" / "could not walk to bus_stop", once "could not walk to saga_stone" after 304 s) failed three times out of
  about ten runs today on slow runners and passed on other runs; nothing in the diffs touched it (checked twice).
  Since PR 15 the windowed farmer only runs in the manual `pictures` job, so it no longer blocks PR checks; re-run
  the job once. Steps that come after it in the `pictures` job are skipped when it fails (the M5c run-pair pictures
  were, 18:59 UTC): keep such steps before it or on `if: always()`. The headless run-pair check in the `export` job
  is also intermittent on contended runners (passed and failed on the same head 7a3884f at the same time); the M5c
  fix-up child is making the bot tolerate slow frames rather than loosening the check.
- Pushes to `main` of `HANDOFF.md` from the orchestrating session work; a force push, a branch deletion and pushes
  from the lilla-garden clone were refused by the permission classifier.
- The owner tests on the MacBook and reports in chat; questions for the owner go in the chat report, one at a time.
  The owner reads status in the app and sees idle children as "nothing running": say in every report what is waiting
  on what.

## 4. Environment facts learned the hard way

- The sandbox cannot reach kenney.nl, itch.io, poly.pizza, or `github.com/godotengine/webrtc-native` and its API
  (403 / no answer); the godotengine Godot release downloads work (sometimes refused: retry); GitHub mirrors of asset
  packs work (`KayKit-Game-Assets`, `Evolis-Work/kenney-castle-kit`). Headless Godot runs and Xvfb + Mesa screenshots
  work (Compatibility or lavapipe Vulkan only, so frame times there mean nothing). Docker Hub pulls are rate-limited;
  CI builds the image.
- The sandbox's Xvfb has no Vulkan driver by default (Godot silently falls back to Compatibility/OpenGL): `apt-get update && apt-get install -y mesa-vulkan-drivers` adds lavapipe and Forward+ renders there (found in M7a).
- A fresh checkout needs one import before the game runs: `godot --headless --path packages/godot --import`, and
  since PR 14 also `packages/godot/tools/fetch-webrtc.sh` for voice (the client runs without it, without voice).
- The server needs `PARENT_PASSWORD` (12+ chars) or `ACCESS=open`, and dies if `DATABASE_URL` points at a Postgres
  that is not running. Throwaway recipe: `ACCESS=open DEV_TELEPORT=1 DATABASE_URL= pnpm dev`. Never set
  `DEV_TELEPORT=1` on the real farm. The parent page is `http://localhost:8080/admin`.
- Dev-only messages behind `DEV_TELEPORT=1`: `dev saga` (into a dungeon), `dev nextDay`, `dev starter` (a class's
  starter gear). All tested both ways in `game.test.ts`.
- Godot `WebSocketPeer` needs an 8 MiB inbound buffer for the `welcome` message (set in `net.gd`).
- Godot 4.7.2 downloads fine in the sandbox from `github.com/godotengine/godot/releases` (check it against
  `GODOT_EDITOR_SHA512` in `.github/workflows/godot.yml`). Xvfb shots: `xvfb-run -a godot --path packages/godot
  --rendering-driver opengl3 -- --demo=forest --at=x,y --time=0.4 --screenshot=f.png`.
- A new `class_name` script is unknown until an editor import (`--import`) registers it. Autoloads (`Data`,
  `Strings`) are not loaded under `--script`; a throwaway `.tscn` run as the main scene has them.
- Packs the owner uploads land in `/root/.claude/uploads/<session>/`; unpack them into `packages/godot/downloads/`
  (gitignored, with a `.gdignore` so Godot does not import them) and commit only the files used under `assets/`. They
  are gone in a new container: KayKit Forest, KayKit Adventurers and the Kenney Nature Kit are not on GitHub, so ask
  the owner again for more of them. Scripting itch.io's download flow is refused by the permission classifier.
- Bots: `pnpm godot:bot` runs an in-memory server and the fighter, walker, farmer and creator bots (`BOT_ONLY=walker`
  / `farm` / `creator` / `run` / `voice` for one of them); CI runs them on every PR.
- `pnpm -r run test` sometimes prints a vitest `Timeout calling "onTaskUpdate"` during the 24 s generator test; every
  test still passes (the exit code was 0 in the orchestrating session every time).

## 5. Open items and backlog, in rough order

1. **M6 done (PR 17–19); M7a done (PR 20); M7b running, then M8** (the other eight dungeons as zone sets and all bosses in the Godot client, in chapter order; PLAN.md
   M6; the dungeons' plans and bosses exist as data, the client draws Draugkryptan's look and the seven biome looks of
   the run zones). Then M7, M8. Before M6, ask the owner for the MacBook results of PR 11–14 if any have come in.
2. The tidy-up PR of section 1's leftovers.
3. Farm leftovers: the weapon in the hero's hand, Smedjan (forge), the journal, the bath house, caves, the paint
   screen, the rocket; sprites and icons only exist for Draugkryptan's creatures and loot.
4. The threat indicator is a client heuristic; `SagaSnap.m` could carry the target id (additive).
5. Mellan has no torch shadows after M3d; if the M4 has headroom, `"shadows": 1` in `Quality.PRESETS["mellan"]`.
6. Download links on `/` 404 until the first `v*` tag; the first tag also proves the zip renaming.
7. M8: the homelab role for the v2 server (second instance on the Hetzner box, `spel.<domain>` through the same
   tunnel, its own database), importing the family's save from lilla-garden (migration 0004 drops the minigame prize
   decor), the README's Controls section still describes the browser keys.
8. Art: the art pass of section 1b (branch `claude/inspiring-hypatia-txeupy`, no PR yet). Deferred purchases (Synty
   Vikings 30 USD, Minifantasy Creatures 3 USD, weather bundle 10 USD) need a new decision; AI generation was never used.
9. In lilla-garden, branch `claude/trusting-brown-z2omlt` holds the original `PLAN.md` and `HANDOFF.md` seed; it is
   superseded by this repository. The orchestrating session's `git push origin --delete` was refused by the
   permission classifier: the owner deletes it by hand.
10. Weather per run zone is carried in the run state but has no gameplay effect; the "seeds of new crops" reward is a
    bag of the seven existing crops' seeds; PgStore loading of a player saved mid-run is written but not tested.

## 6. Identifiers

- Art pass session: `session_01KTh22oagteA1US6DqRwXHt` (section 1b); the atmosphere pass and creatures in 3D (1c, 1d) and the merge of main into that branch: `session_01KTh22rMH5UutKMoSA5XCUG`.
- Orchestrating sessions: `session_01KTh22pPGKmMmYJxTLXzyqs` (2026-11-06 09:55–21:50 UTC, paused), before that
  `session_01KTh22nak5ip5cq8vST7H9Q`. The owner's other session `session_01KTh22pJ2K85r8267Nim4Fy` (Opus) made PR 15.
- Children, all Sonnet, all done: M5b `session_01KTh22qkzZkRx6UToLHSTLk`, M5b review fixes
  `session_01KTh22ovyHfUYGF3frNYrnr`, M5b soft clock `session_01KTh22qjEejiGHLyJoPWc7W`, creator
  `session_01KTh22pn3nY1PwSd9U6Gv3B`, M5c `session_01KTh22riKcXRQssJpT6nmes` (stood down), M5c fix-up
  `session_01KTh22s4VK2T6Mc1ipSsM5W`, voice `session_01KTh22ouaSJXMfDZvpaPHMt`, voice fix-up
  `session_01KTh22qka2AJW7nyefZu2x5`.
- Orchestrator since 2026-11-06 22:36 UTC: `session_01KTh22s6gWj5rerGqj3fNdr`; children (Sonnet): M6a `session_01KTh22qPPYJFNEk4wVjmv5b` (done), tidy-up `session_01KTh22qpJkd4hoGWrPg64yA` (done), M6b `session_01KTh22rTdZexhwmCtMLZuRP` (done), M6c `session_01KTh22s7Dm75532mFbJzr47` (done), M7a `session_01KTh22qWWBKXeP4TboJqexR` (done), M7b `session_01KTh22rF2Y4u6N5YDy7c9rJ` (running); a check-in is pending.
- Homelab repo `tobiasbernting/homelab`: `cloud/` (Hetzner + Cloudflare + Tailscale, running), `server/roles/lilla-garden`
  and `lilla-garden-cloud`.
