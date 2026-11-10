# Sagan om Världsträdet

A co-op Norse-mythology roguelike for a family, played in the browser. Kids (the youngest is 7) and their friends play on
tablets, adults on computers. The UI is in Swedish and the pixel art is drawn in code. Up to three heroes go through a
dungeon together (the Hirdmannen fills in for a missing healer or tank when the party is small), take personal runor
(boons) and spend a shared purse of hacksilver on the way, and bring home sagafrön, cosmetic gear and trophies.

Players meet in the lobby "Gården" (the färdport arch, Völvan Sigrun who tells the saga, the Yggdrasil shoot that grows
into the sagaträd, Smed-Stina, the wardrobe, the kennel, and a door to your own house). A run ("färd") is one of nine
dungeons as a branching route of ten rows, on one of five difficulty levels. Gear gives no power; hero levels give no
power either.

The design is in [DESIGN.md](DESIGN.md). How to add a pet, a set, a runa, an event or a window is in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Run it locally

Needs Node 24 (CI and the image use it), pnpm, and a container runtime (podman or docker) for Postgres.

```bash
pnpm install
pnpm db:up                  # Postgres 17 on localhost:5435 (compose.yaml; podman or docker)
cp .env.example .env        # set PARENT_PASSWORD; ACCESS=open turns the access gate off on a home network
pnpm --filter @lilla-garden/clientljs build   # the browser game -> packages/clientljs/dist
pnpm --filter @lilla-garden/server dev        # the server on :8080, serves the build at /
```

Open `http://localhost:8080`, or `http://<your-computer-ip>:8080` from another device on the same network. The server's
`dev` script reads the `.env` in the repository root.

For client work run the Vite dev server instead, with hot reload. It proxies `/api`, `/admin`, `/access`, `/join`,
`/health` and `/ws` to the server on :8080:

```bash
pnpm --filter @lilla-garden/clientljs dev     # http://localhost:5173 (VITE_HTTPS=1 for https with a self-signed certificate)
```

`pnpm dev` runs the `dev` script of every package in parallel (the server and Vite). Without `DATABASE_URL` the server
keeps everything in memory and saves nothing; that is fine for a quick look.

## Packages

| Package | What it is |
| --- | --- |
| `packages/shared` | The rules, with no I/O: the run (route, stops, levels, runor, events, hacksilver), the fight simulation, classes and paths, looks and pets, houses, the protocol types, all Swedish strings (`sv.ts`), and the bots that play whole runs in the tests. |
| `packages/server` | Node server: authoritative 20 Hz tick, WebSocket at `/ws`, Postgres through Drizzle (migrations in `drizzle/`, run on boot), access control, the parent page at `/admin`, static serving of the built client. |
| `packages/client` | The HUD, windows, input (touch, keyboard, gamepad), networking, sound, voice and the accessibility layer. Plain DOM, imported by `clientljs` as `@v1/...`. Holds the audit scripts in `scripts/`. |
| `packages/clientljs` | The view: LittleJS drawing the lobby, houses, dungeons and effects, built with Vite and served by the server at `/`. Also a PWA. |
| `packages/art` | The pixel art, drawn in code and rendered by the browser at start-up. Imported as `@art/...`. |

## Configuration

Set in the server's environment (`.env.example` shows the local ones).

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Without it the server runs in memory and saves nothing. |
| `PORT` | HTTP and WebSocket port, default 8080. |
| `PARENT_PASSWORD` | At least 12 characters; the login for `/admin`. The server refuses to start without it unless `ACCESS=open`. |
| `ACCESS` | `open` turns access control off entirely (no gate, anyone who reaches the server can play and open `/admin`). Home network only. |
| `PUBLIC_URL` | Public address, e.g. `https://spel.example.se`. Used in join links, makes cookies `Secure`, accepted as origin. |
| `ADMIN_PORT`, `ADMIN_HOST` | Serve the parent page on its own listener (host default `0.0.0.0`); the game port then answers 404 for `/admin`. Keep it off the internet. |
| `TRUST_PROXY` | `1` behind a tunnel or reverse proxy: read the visitor's address from `CF-Connecting-IP` / `X-Forwarded-For`. Set only when the server cannot be reached directly. |
| `NTFY_URL`, `NTFY_TOKEN` | ntfy topic for push notifications to the parent (someone joined, waits for approval, failed logins). |
| `SEASON_OVERRIDE` | `halloween`, `jul`, `pask`, `midsommar` or `none`; otherwise the season follows the calendar. |
| `STUN_URLS` | Röstprat (voice): STUN servers, comma separated; default `stun:stun.cloudflare.com:3478`. |
| `TURN_URLS` with `TURN_USERNAME` + `TURN_CREDENTIAL`, or `TURN_SECRET` | Röstprat: a TURN relay with a fixed login, or coturn's `use-auth-secret` (the server makes short-lived logins). |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` | Röstprat: Cloudflare's TURN service instead of a relay of your own. |
| `CLIENT_DIST` | Folder with the built client; if unset the server looks for `packages/clientljs/dist`. The image sets `/app/client`. |
| `MIGRATIONS_DIR` | Folder with the Drizzle migrations; found automatically in a checkout, set to `/app/drizzle` in the image. |
| `GIT_COMMIT` | Shown in the status box on the parent page; default is `git rev-parse HEAD` of the checkout. |
| `DEV_TELEPORT` | `1` enables the dev messages below. Never on a server people reach over the internet. |

## Access control and the parent page

Unless `ACCESS=open`, nobody plays without an approved device. Strangers see a "private game" page with a code field;
the game, `/api` and the WebSocket refuse browsers without an approved device cookie.

- A parent makes a **join code** (`ABCD-1234`) on `/admin` for a named person or family: guest or family, 1 to 5
  devices, valid 1 hour to 30 days. It is typed on the start page or opened as `/join#CODE`. Each device that joins is
  remembered for 400 days. Only a hash of the code is stored.
- The code either lets devices in at once (the parent gets a push) or makes each device wait with a 6-digit number until
  the parent approves it.
- A guest device plays only the characters it made (0 to 3) or was given; a family device plays everyone.
- The parent can close the game, allow family only, or family and guests; set play hours (Swedish time); pause or remove a
  device. Changes apply at once: open connections are closed and the device lands on the gate page.
- "Öppna igen": a device that lost its cookie gets a one-time code from the device list and keeps its characters.
- **Karaktärer** on the parent page lists every character (class, level, last played, which device made it). A parent can
  rename or delete one, and set a **highest difficulty** per character (default Extrem, all five levels). The server
  refuses to start a run above any member's cap, and a capped player cannot join a running run above it. The cap needs
  access control.
- The character limit is 20 by default (1 to 100, set on the page; lowering it removes nobody). The page also sets the
  voice policy (nobody, family, family and guests).
- Parent login is the password, optionally a code from an authenticator app, rate limited (5 failures per address per 15
  minutes, 30 per hour in total) with 8-hour sessions. Wrong join codes are limited too (10 per address per 15 minutes,
  100 per hour in total) and push a warning.
- Cookies are `HttpOnly` and `SameSite=Strict`, forms and the WebSocket check the origin, the Content-Security-Policy is
  strict, and `/health` reveals nothing when access control is on.

The same device token is accepted as an `Authorization: Bearer` header on `/api/*` and the game socket, for bots and
tests that have no cookie jar. The parent page stays cookie-only.

## Dev helpers

With `DEV_TELEPORT=1` the server accepts `dev` messages over the game socket. From the browser console of a running
client: `lillaGarden.net.send({ t: 'dev', a: 'warp', x: 20, y: 20 })`. Without the variable the server answers with an
`error`. The messages (`packages/shared/src/protocol.ts`, handled in `packages/server/src/game.ts`):

| Message | Effect |
| --- | --- |
| `{ a: 'saga', id }` | Enter dungeon `id` directly (a player without a class becomes a Krigare first). |
| `{ a: 'runclear' }` | Clear the stop your run is in, as if its monsters had fallen (a Mellanboss or boss too). |
| `{ a: 'runnext', kind, purse? }` | Jump the run to the first unwalked stop of a kind (`flock`, `mini`, `rest`, `boss`, `shop`, `event`, `treasure`, `elite`) and set the purse. |
| `{ a: 'unlock' }` | Count every dungeon before the last as cleared, so a later chapter's arch can be used. |
| `{ a: 'warp', x, y }` | Stand on tile (x, y) of the map you are in. |
| `{ a: 'trophy', id, level }` | Win the trophy of boss `id` at difficulty `level` (0 to 4). |
| `{ a: 'looks', set?, tier?, ways?, cls? }` | Every piece of a set (all sets if left out) at shine tier 1 to 5, with colourways, titles and the signature weapons. |
| `{ a: 'decor' }` | One of every Norse decor piece, a gear stand and some gear, into the bag. |
| `{ a: 'pet', id }` | Give a pet kind, or `all`. |
| `{ a: 'petgear', tier?, set? }` | Pet gear at a tier, and put the first piece of each anchor on the active pet. |
| `{ a: 'petscare' }` | Scare your pet now, to see the state and the way back. |
| `{ a: 'sagaBest', id, ms }` | Record `ms` as the family's best time through dungeon `id`. |

## Testing

```bash
pnpm typecheck       # tsc --noEmit in every package
pnpm test            # vitest in every package
```

- **Unit tests** are next to the code (`*.test.ts`). `packages/shared` has the rules: route generation, runor, events,
  looks, pets, paths, houses, the fight sim.
- **Bot tests** play whole runs with bot parties (`run.bots.test.ts`, `run.solo.test.ts`, `run.latt.test.ts`,
  `run.hard.test.ts`, and the stall check that runs all nine dungeons in `run.bots.test.ts`). They are slow, so run one
  file with `pnpm --filter @lilla-garden/shared exec vitest run src/run.hard.test.ts`. The bots are `careful`, `clumsy`
  and `kid7`; DESIGN.md section 8 explains them and the bands the tests hold.
- **Tuning script**: `node --experimental-transform-types packages/shared/src/runtune.ts --level 2 --style clumsy --seeds 20`
  prints wins, wipes, Sagoandar used and minutes per party. Other options are `--dungeon`, `--parties solo|duo|pair|all`,
  `--lane safe|random`, `--limit` (minutes) and `--from` (first seed); the file's header lists them.
- **Server tests** include `readme.test.ts`, which checks that every image the README links to exists. Some tests need a
  real Postgres (`importSave.pg.test.ts`); they run when `TEST_DATABASE_URL` points at a server where scratch databases
  may be created, e.g. `TEST_DATABASE_URL=postgres://postgres@localhost:5435/postgres pnpm test`, and are skipped
  otherwise. CI (`.github/workflows/server.yml`) runs typecheck, tests and the client build against a Postgres service.
- **Accessibility audit** (not part of `pnpm test`; it needs a running server and Playwright, which is not a dependency):
  `node packages/client/scripts/a11y-audit.cjs --url http://localhost:8110/`. It plays to each screen at four viewports
  and measures target size, gaps, font size and contrast against the numbers in DESIGN.md section 9.
  `packages/client/scripts/a11y-fontfloor.mjs` rewrites font sizes in the HUD stylesheets to follow the text-size
  setting and stay at 16 px or more; it is safe to run again after a merge. `icons.mjs` makes the PWA icons and runs
  before `build` and `dev` of `clientljs`.

## Deployment

GitHub Actions (`.github/workflows/docker.yml`) builds the image from `Dockerfile` on every push to `main` and pushes
`ghcr.io/tobiasbernting/varldstradet:latest` and a `:<sha>` tag (pull requests build but do not push). The build runs
typecheck and all tests. The image holds the server and the built client, listens on 8080, needs `DATABASE_URL`, runs
migrations on boot, answers `/health`, and runs as the unprivileged `node` user. A new GHCR package is private by
default: make it public or log the host in to ghcr before another machine can pull it.

Without Docker: `pnpm build` (builds the server bundle and the client), then
`DATABASE_URL=postgres://… node packages/server/dist/server/src/main.js`.

The owner's homelab runs the image as a LAN instance, deployed by an Ansible role that lives in another repository. Keep
the container interface (port, environment variables, `/health`, migrations on boot) compatible with it. The database is
the world: dump it with `pg_dump` for backups.

A save from the older browser game `tobiasbernting/lilla-garden` can be imported into a new, empty database with
`pnpm --filter @lilla-garden/server import-save <dump.sql|postgres://source> --target postgres://… [--dry-run]`; the usage
text is in `packages/server/src/importSaveCli.ts`. Devices and join codes do not come over: make new codes on `/admin`.
