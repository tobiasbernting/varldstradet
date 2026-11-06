# Handoff: Världsträdet, where the work stands

Written 2026-11-06 18:00 UTC by the orchestrating session for a different agent that takes over. `PLAN.md` is the plan
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

- **Open pull requests (the next agent's first job).** Both conflict with main since PR 15 (in the table above) in
  `.github/workflows/godot.yml` only; each needs `origin/main` merged in and its workflow steps moved into the new
  job structure before CI runs again.
  - **PR 13, M5c: runs in the Godot client**, branch `m5c-runs-client`, draft. Everything is built and pushed: the
    färdport arch, the Yggdrasil shoot in five stages, the smithy, herb garden and longhouse drawn; the arch window;
    the zones drawn with the biome looks; the run HUD with the soft clock; the three runor cards and the vote; the end
    summary; the sagaträd window; the hired companion drawn; a run bot and a two-bot CI check; docs (README, DESIGN.md
    heading "Godot client: runs (2026-11-06)", ART.md, LICENSES.md, PLAN.md). An independent review found six issues
    (the run bot quit after one pack, the vote check did not prove the protocol, the exit walk had no re-plan, the run
    pair ran in the default bot mode, the cards rebuilt on every change, per-frame allocation and always-on lights);
    all six were fixed in commits fce9c78, 4c29285 and 99cc09f, and main (PR 12) was merged in (b09cf97). CI then ran
    the run-pair step for the first time and **both run bots stalled** after planning the path to the first pack
    (no walking, no fight, no report for 900 s). The original child was told to stand down; a **fix-up child**
    (`session_01KTh22s4VK2T6Mc1ipSsM5W`, Sonnet, same branch) is reproducing the stall headless in its sandbox
    with Godot installed locally (at 17:45 UTC: "CI stall in fight phase; checking melee reach vs bot stop
    distance"). **18:45 UTC:** the fix-up child reproduced the stall headless and pushed 45c12fc ("Run bot: it no
    longer stalls at 2-3 fps or after a fall, and it closes the arch window after the run": `bot.gd` +20, `run_bot.gd`
    +13, plus the missing `.uid` files of the new scripts). The Godot workflow on 45c12fc has been running since
    18:13 UTC (the `build` job green; `export` in progress, the Xvfb steps next); the child is idle waiting for it.
    Still to do by that child when CI is green: fetch the `m5c-*.png` pictures from the `farm-screenshots` artifact
    into `packages/godot/docs/`, write the real PR body (per deliverable, commands, what to check on the MacBook,
    pictures, unsure), mark the PR ready. **Since PR 15 (18:32 UTC) the branch conflicts with main in
    `.github/workflows/godot.yml`** (the branch added two run-pair steps and reordered steps in the old single job;
    main restructured the file). The child must merge `origin/main` into the branch and move its steps into the new
    structure: the headless run pair (`BOT_ONLY=run BOT_RUN_SECONDS=480 pnpm godot:bot`) into the `export` job after
    the two-bot step, and the Xvfb run pair with the pictures into the `pictures` job. GitHub runs no PR workflow
    while the conflict stands, and the `m5c-*.png` pictures now only come from a manual run of the workflow on the
    branch (Actions -> Godot client -> Run workflow, or `actions_run_trigger` run_workflow with `ref:
    m5c-runs-client`), whose `farm-screenshots` artifact holds them. The child was told this at 18:55 UTC. Do not merge
    until the conflict is resolved, the `export` job is green on the merged head, the manual `pictures` run has
    produced the run pictures and they are committed, and the PR body and ready state are in. Local checks on the branch were green at every
    head so far (297 shared, 47 server tests, `pnpm godot:gen` clean).
  - **PR 14, Röstprat (voice) in the Godot client**, branch `godot-voice`, **ready for review, CI green, no
    conflicts with main at 17:50 UTC**, child `session_01KTh22ouaSJXMfDZvpaPHMt` (done). Design: Godot's
    WebRTC has no media tracks, so sound is 16 kHz mono 8-bit mu-law over an unordered data channel (16 kB/s per
    peer), push-to-talk (key C) default, open mic a setting, no echo cancellation; the `webrtc-native` 1.2.2-stable
    GDExtension is not committed but fetched by `packages/godot/tools/fetch-webrtc.sh` (pinned, sha256-checked) in
    the workflow and by developers; all four exports have a binary; macOS export has the microphone text and
    entitlement and library validation off. **Since PR 15 this branch also conflicts with main in
    `.github/workflows/godot.yml`**: its "Fetch the webrtc-native GDExtension" step belongs in
    `.github/actions/setup-godot` (before the import, so the `pictures` job gets it too) and its voicecheck step in
    the `export` job; the branch must merge `origin/main` and re-place them before GitHub runs its workflow again
    (the green CI on 28eb03a was on the old workflow). Reviewed in the orchestrating session (local checks green, the picture
    `docs/voice.png` fine, an independent review found **no blocker**). Findings to hand to a fix-up child or to
    accept with a backlog note before merging: (a) medium: a push-to-talk tap shorter than 150 ms leaves the server
    stuck on "talking" because the server drops a report within 150 ms of the last one (`voice.gd` ~485-491):
    hold the "off" report until 150 ms have passed; (b) low: on every first offer the answerer throws away the
    peer it already opened in `_sync` (`voice.gd` ~378): drop only when that peer has a remote description;
    (c) low-medium on Låg: the microphone is captured and resampled every frame for any speaker even with no
    peers or the mic off (`_mic_start`, `voice.gd` ~396): clear the buffer and skip the resampling when not
    transmitting; (d) low: the generator buffer accounting assumes 8000 frames but Godot likely rounds to 8192
    (`voice_peer.gd` ~170), costing about 60 ms of latency; (e) the "Röstprat finns inte i den här versionen"
    text is unreachable because the button and menu entry are hidden without the extension, and `voiceNoMicNative`
    is unused (a denied macOS microphone permission is not detected); (f) `_early` is not cleared in `_drop`/`_sync`,
    `open_window` checks null rather than `is_instance_valid`; (g) `fetch-webrtc.sh` uses `"${auth[@]}"` with an
    empty array under `set -u`, which fails on macOS's bash 3.2 (CI is fine); the bot-check voice check exercises the
    server with bare sockets, not the Godot client. Merge order: PR 13 and PR 14 both touch `bot-check.mts`,
    `sv.ts`/`sv.json`, README, DESIGN.md, PLAN.md; whichever merges second must merge main into its branch first
    (GitHub does not run the workflow on a conflicting PR).
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
- **Known CI flake:** the farmer bot's bus step under Xvfb ("the bus: the stop did not open the window" or "could
  not walk to bus_stop") failed twice out of about eight runs today on a slow runner and passed on re-run; nothing in
  the diffs touched it (checked twice). Re-run the failed job once (`actions_run_trigger` rerun_failed_jobs); a third
  failure in a row on the same head is real.
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

1. Finish and merge PR 13 (M5c) and PR 14 (voice): section 1. Then M6 (the other eight dungeons as zone sets and all
   bosses in the Godot client, in chapter order; PLAN.md M6; the dungeons' plans and bosses exist as data, the client
   draws Draugkryptan's look and the biome looks of the run zones). Then M7, M8.
2. Nits from the reviews, for a small PR: the creator's "Inga karaktärer än" hint says to press Ny karaktär even on a
   guest device that may not create characters (`login.gd`, `noCharactersYet`); the creator check sets the look
   indexes directly, so the arrow buttons and the server's 400/403/409 answers are untested; the voice findings (b)–(g)
   in section 1 if not fixed before the merge.
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

- Orchestrating sessions: `session_01KTh22pPGKmMmYJxTLXzyqs` (2026-11-06 09:55–18:00 UTC, paused), before that
  `session_01KTh22nak5ip5cq8vST7H9Q`.
- Children, all Sonnet: M5b `session_01KTh22qkzZkRx6UToLHSTLk`, M5b review fixes `session_01KTh22ovyHfUYGF3frNYrnr`,
  M5b soft clock `session_01KTh22qjEejiGHLyJoPWc7W`, creator `session_01KTh22pn3nY1PwSd9U6Gv3B`, M5c
  `session_01KTh22riKcXRQssJpT6nmes` (stood down), **M5c fix-up `session_01KTh22s4VK2T6Mc1ipSsM5W` (running at
  18:00 UTC)**, voice `session_01KTh22ouaSJXMfDZvpaPHMt` (done).
- One pause-mode check-in pending in the old orchestrating session (19:29 UTC, `trig_016hPae4dtYsGZNgBnbuQWNR`):
  it only records the fix-up child's result here and merges nothing. The owner's other session
  (`session_01KTh22pJ2K85r8267Nim4Fy`, Opus) made PR 15 and also edited section 3 of this file.
- Homelab repo `tobiasbernting/homelab`: `cloud/` (Hetzner + Cloudflare + Tailscale, running), `server/roles/lilla-garden`
  and `lilla-garden-cloud`.
