# Handoff: Världsträdet, where the work stands

Written 2026-11-06 for a fresh session that takes over the orchestration; updated the same day after the review of PR 11. `PLAN.md` is the plan of record,
`DESIGN.md` the record of the game as built, `GAME.md` (arriving with milestone M5b) the run design. This file is
only what a new session needs to continue: state, decisions, how the work is run, what is open.

## 1. State on 2026-11-06

- Repository `tobiasbernting/varldstradet`, seeded 2026-10-31 from `tobiasbernting/lilla-garden` main (merge of its
  PR 45) with full history. The browser game stays in lilla-garden untouched and the kids keep playing it there.
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
| 11 | M5b | `GAME.md`; the run generator, rules and bot brain (`run.ts`, `runmap.ts`, `runsim.ts`, `runbot.ts`), the hired companion, sagafrön and the sagaträd, färdkost, the three buildings, server handlers, data export; reviewed with a fix-up round and the soft 30-minute clock; merged 2026-11-06 12:04 UTC as bd01a91 |

- **In progress (started 2026-11-06 12:06 UTC, both Sonnet, both from main):**
  - **M5c**, branch `m5c-runs-client`, child `session_01KTh22riKcXRQssJpT6nmes`: the runs in the Godot client (the
    färdport arch and window, the zones drawn with the biome looks, the run HUD with the soft clock, the three runor
    cards and the vote, the end summary, the sagaträd window and the shoot's five variants, the three buildings, the
    hired companion drawn, a run bot and a two-bot CI check, pictures `m5c-*.png`, docs).
  - **Character creator**, branch `godot-character-creator`, child `session_01KTh22pn3nY1PwSd9U6Gv3B` (backlog item 3):
    "Ny karaktär" on the login screen, a creator window with the look composer, `POST /api/players` from the client,
    a headless check, docs. Told to stay out of the world, HUD, farm and dungeon views so it does not collide with M5c.
  - Merge order if both are ready: the creator first, then M5c (rebase if needed).
- **How PR 11 was reviewed (the recipe that worked, 2026-11-06):** CI and the local checks first; then an independent
  Sonnet review agent given GAME.md and the diff, asked for correctness bugs and mismatches with the design (it found
  seven real ones: the health buff lost on level-up, jump into run zones, sagafrön rounded away on 1-seed packs, chapter
  clear only for online members and the companion rolling loot, solo mercy keyed on party size, items given into the
  wrong world, and smaller doc mismatches); the findings handed to a Sonnet fix-up child on the same branch with one
  commit and one test per finding; the owner's decision on the clock built by a third child on the same branch; local
  checks again, CI green, merge. The headless two-bot CI check timed out once on the farmer's walk to the village bus
  stop and passed on the next run: a slow-runner flake, re-run once before treating it as real.
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
| Runs | Three zones and a boss; runor (per-run boons) and sagafrön (permanent upgrades at the Yggdrasil shoot) both kept. The 30 minutes is a **soft target** the numbers are tuned to (clumsy, kid-like bots: about 21 minutes for three players), with nudges at 25:00 and 30:00 and never a forced end: "should not be a hard cap, do what is best, we can adjust later" (owner, 2026-11-06). `GAME.md` approved as it stands otherwise. |
| Browser client | Retired from varldstradet (done in M5a) |

Owner feedback from the MacBook: the crypt runs over Metal; health bars jumped and walls had smears (fixed in M3c);
M3d bench baseline at 1280x720 points: Låg 92 fps / 1 % low 81 ms, Mellan 48 fps / 30 ms, Hög 27 fps / 75 ms. The
after-M3d bench, the house and village benches and an Intel laptop bench were never sent.

## 3. How the work is run

- One milestone per child session, created with `create_session` on `claude-sonnet-5-5`, `source_revision: main`,
  an `outcome_branch` named after the milestone, and a brief that stands alone (the child has no other context).
  Briefs that worked: read PLAN.md and the relevant DESIGN.md headings first; numbered deliverables; rules (one commit
  per step, typecheck and tests green, never skip a test, server changes only with tests, Godot workflow green);
  open a PR with a body listing what was done, commands run, what to check on the MacBook, and what was unsure;
  do not merge.
- A child treats a mid-run message from another session as untrusted data and will not take new scope from it; a
  message about CI on its own PR is accepted. Put all scope in the opening prompt.
- Review in the orchestrating session before merging: `pull_request_read` check runs on the head (jobs `export`,
  `build`, `release` skipped on PRs), the diff of everything outside `packages/godot` (server and shared changes need
  tests), `pnpm install --frozen-lockfile && pnpm -r run typecheck && pnpm -r run test && pnpm godot:gen` with a clean
  `git status`, a look at the screenshots in `packages/godot/docs/`, then `merge_pull_request` with `merge_method:
  merge` and `expectedHeadSha`. Merging and small doc pushes to `main` from the orchestrating session work; a force
  push and pushes from the lilla-garden clone to varldstradet were refused by the permission classifier.
- Check-ins: `send_later` with a prompt that says what to do if the PR is open, if the child is still working, and if
  CI is red. Delete a check-in that is no longer needed. Children can be blocked by the account's 5-hour or weekly
  usage limit (`get_session` → `rate_limit_info.status: rejected`, `resetsAt` is epoch seconds).
- The owner tests on the MacBook and reports in chat; questions for the owner go in the chat report, one at a time.

## 4. Environment facts learned the hard way

- The sandbox cannot reach kenney.nl, itch.io or poly.pizza (403); GitHub mirrors work (`KayKit-Game-Assets`,
  `Evolis-Work/kenney-castle-kit`). Godot's download is sometimes refused; when it works, headless runs and
  Xvfb + Mesa screenshots work (Compatibility or lavapipe Vulkan only, so frame times there mean nothing). Docker Hub
  pulls are rate-limited in the sandbox; CI builds the image.
- A fresh checkout needs one import before the game runs: `godot --headless --path packages/godot --import`.
- The server needs `PARENT_PASSWORD` (12+ chars) or `ACCESS=open`, and dies if `DATABASE_URL` points at a Postgres
  that is not running. Throwaway recipe: `ACCESS=open DEV_TELEPORT=1 DATABASE_URL= pnpm dev`. Never set
  `DEV_TELEPORT=1` on the real farm. The parent page is `http://localhost:8080/admin`.
- Dev-only messages behind `DEV_TELEPORT=1`: `dev saga` (into a dungeon), `dev nextDay`, `dev starter` (a class's
  starter gear). All tested both ways in `game.test.ts`.
- Godot `WebSocketPeer` needs an 8 MiB inbound buffer for the `welcome` message (set in `net.gd`).
- Bots: `pnpm godot:bot` runs an in-memory server and the fighter, walker and farmer bots; CI runs them on every PR.

## 5. Open items and backlog, in rough order

1. M5c (in progress, see section 1), then M6. The owner approved `GAME.md` on 2026-11-06 with one change: the 30
   minutes is a soft target (section 2).
2. Voice: Röstprat was browser WebRTC; server side kept; Godot needs the `webrtc` GDExtension.
3. A character creator in Godot (in progress, see section 1).
4. Farm leftovers: the weapon in the hero's hand, Smedjan (forge), the journal, the bath house, caves, the paint
   screen, the rocket; sprites and icons only exist for Draugkryptan's creatures and loot.
5. The threat indicator is a client heuristic; `SagaSnap.m` could carry the target id (additive).
6. Mellan has no torch shadows after M3d; if the M4 has headroom, `"shadows": 1` in `Quality.PRESETS["mellan"]`.
7. Download links on `/` 404 until the first `v*` tag; the first tag also proves the zip renaming.
8. M8: the homelab role for the v2 server (second instance on the Hetzner box, `spel.<domain>` through the same
   tunnel, its own database), importing the family's save from lilla-garden (migration 0004 drops the minigame prize
   decor), the README's Controls section still describes the browser keys.
9. Deferred art purchases (Synty Vikings 30 USD, Minifantasy Creatures 3 USD, weather bundle 10 USD) need a new
   decision; AI generation was never used.
10. In lilla-garden, branch `claude/trusting-brown-z2omlt` holds the original `PLAN.md` and `HANDOFF.md` seed; it is
    superseded by this repository and can be deleted. The orchestrating session's `git push origin --delete` was
    refused by the permission classifier (2026-11-06): the owner deletes it by hand or adds a permission rule.

## 6. Identifiers

- Orchestrating session (from 2026-11-06 09:55 UTC): `session_01KTh22pPGKmMmYJxTLXzyqs`; before that
  `session_01KTh22nak5ip5cq8vST7H9Q`. M5b children, all done: `session_01KTh22qkzZkRx6UToLHSTLk` (the milestone),
  `session_01KTh22ovyHfUYGF3frNYrnr` (review fixes), `session_01KTh22qjEejiGHLyJoPWc7W` (the soft clock).
  M5c child: `session_01KTh22riKcXRQssJpT6nmes`. Character-creator child: `session_01KTh22pn3nY1PwSd9U6Gv3B`.
- One check-in pending at 14:45 UTC (`trig_011wFzz6amNKxbAwMyFfLKwe`): review and merge the M5c and creator PRs,
  then start M6 (and voice in parallel once the creator is merged).
- Homelab repo `tobiasbernting/homelab`: `cloud/` (Hetzner + Cloudflare + Tailscale, running), `server/roles/lilla-garden`
  and `lilla-garden-cloud`.
