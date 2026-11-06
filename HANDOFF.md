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

- **No open pull request and no child session (21:50 UTC). The work is paused** at the owner's request after PR 13
  and PR 14 were finished and merged. The next agent starts M6 (section 5). Everything from M4 onward is untested on
  the MacBook; PR 11, 12, 13 and 14 each carry a "what to check on the MacBook" recipe in their bodies.
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
- A fresh checkout needs one import before the game runs: `godot --headless --path packages/godot --import`, and
  since PR 14 also `packages/godot/tools/fetch-webrtc.sh` for voice (the client runs without it, without voice).
- The server needs `PARENT_PASSWORD` (12+ chars) or `ACCESS=open`, and dies if `DATABASE_URL` points at a Postgres
  that is not running. Throwaway recipe: `ACCESS=open DEV_TELEPORT=1 DATABASE_URL= pnpm dev`. Never set
  `DEV_TELEPORT=1` on the real farm. The parent page is `http://localhost:8080/admin`.
- Dev-only messages behind `DEV_TELEPORT=1`: `dev saga` (into a dungeon), `dev nextDay`, `dev starter` (a class's
  starter gear). All tested both ways in `game.test.ts`.
- Godot `WebSocketPeer` needs an 8 MiB inbound buffer for the `welcome` message (set in `net.gd`).
- Bots: `pnpm godot:bot` runs an in-memory server and the fighter, walker, farmer and creator bots (`BOT_ONLY=walker`
  / `farm` / `creator` / `run` / `voice` for one of them); CI runs them on every PR.
- `pnpm -r run test` sometimes prints a vitest `Timeout calling "onTaskUpdate"` during the 24 s generator test; every
  test still passes (the exit code was 0 in the orchestrating session every time).

## 5. Open items and backlog, in rough order

1. **M6 next** (the other eight dungeons as zone sets and all bosses in the Godot client, in chapter order; PLAN.md
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
8. Deferred art purchases (Synty Vikings 30 USD, Minifantasy Creatures 3 USD, weather bundle 10 USD) need a new
   decision; AI generation was never used.
9. In lilla-garden, branch `claude/trusting-brown-z2omlt` holds the original `PLAN.md` and `HANDOFF.md` seed; it is
   superseded by this repository. The orchestrating session's `git push origin --delete` was refused by the
   permission classifier: the owner deletes it by hand.
10. Weather per run zone is carried in the run state but has no gameplay effect; the "seeds of new crops" reward is a
    bag of the seven existing crops' seeds; PgStore loading of a player saved mid-run is written but not tested.

## 6. Identifiers

- Orchestrating sessions: `session_01KTh22pPGKmMmYJxTLXzyqs` (2026-11-06 09:55–21:50 UTC, paused), before that
  `session_01KTh22nak5ip5cq8vST7H9Q`. The owner's other session `session_01KTh22pJ2K85r8267Nim4Fy` (Opus) made PR 15.
- Children, all Sonnet, all done: M5b `session_01KTh22qkzZkRx6UToLHSTLk`, M5b review fixes
  `session_01KTh22ovyHfUYGF3frNYrnr`, M5b soft clock `session_01KTh22qjEejiGHLyJoPWc7W`, creator
  `session_01KTh22pn3nY1PwSd9U6Gv3B`, M5c `session_01KTh22riKcXRQssJpT6nmes` (stood down), M5c fix-up
  `session_01KTh22s4VK2T6Mc1ipSsM5W`, voice `session_01KTh22ouaSJXMfDZvpaPHMt`, voice fix-up
  `session_01KTh22qka2AJW7nyefZu2x5`.
- No check-in is pending.
- Homelab repo `tobiasbernting/homelab`: `cloud/` (Hetzner + Cloudflare + Tailscale, running), `server/roles/lilla-garden`
  and `lilla-garden-cloud`.
