// Runs the fight without a human: starts the game server in memory (no database) with ACCESS=open and
// DEV_TELEPORT=1, starts two headless Godot clients in bot mode (scripts/bot.gd) against it, waits for their
// reports and checks them against each other: every bot's casts were acknowledged by the server, each bot saw
// the other's casts, monsters were beaten, and wherever both bots have a health sample for the same monster at
// the same server tick, the numbers agree. Exit code 0 when all of that holds. `pnpm godot:bot` runs it; the
// Godot workflow runs it on every pull request so a later milestone cannot break the fight quietly.
//
// A third bot (M4a) takes the real way instead of the dev one: it walks across the farm, the forest and the forest
// beyond to Draugkryptan's arch and uses it, and the check is that it arrives in saga:draug through the server's normal
// path (travel at the edges, `act` on the arch) with the dev message never sent.
//
// A creator check (scripts/creator_check.gd, `--creatorcheck`) takes the login screen's way to a new character: "Ny karaktär",
// a name and a look in the creator window, "Skapa" (POST /api/players through api.gd), the picker lists and selects the new
// character, and the game welcomes it. This script then asks the server for the character and compares the look. BOT_ONLY=creator
// runs only this (it needs no window and takes a minute).
//
// A fourth bot (M4b, the farmer) works a second server of its own (it rolls the day over, which would disturb the
// fights): it tills, plants, waters, waits for the carrot to grow, harvests, drops and picks up a carrot, chops trees
// and mines rocks, does Elsa's and Fiskar-Sven's errands (coins, stars, a rod), fills the can at the pond, fishes,
// opens the chest and moves a stack in the bag, and pets a wild animal in the forest. Its report ends with its bag, coins
// and stars as the client shows them, and this script then asks the server (a websocket, as a client would) for its own
// record of that player and compares the two. Since M4c (the farm evening) the farmer also shops and sells, crafts and builds
// (and is refused on a neighbour's fence: tools/friend.mts is a second player that builds first), goes through the farmhouse
// door and bakes bread, changes its hat, talks to villagers, walks to Köpingen, picks a class at the stone, hears Völvan,
// eats a pizza, equips the starter weapon (the dev message `starter`), switches to hero and back and rides the bus.
//
// A fifth pair (M5c, only with BOT_ONLY=run: three servers and six Godot processes would starve the farmer's timed waits) plays a run through the client on a server of its own: two bots (scripts/run_bot.gd) walk to
// the färdport, the lead presses "Starta färden", the other is taken along (or presses "Följ med"), both fight zone 1, use the
// exit, vote on a runa card and enter zone 2. With `--full` (local use) they play on to the boss and home. The checks: no errors,
// both reached zone 2, both voted, a runa was taken, the sagafrön counted.
// A voice check (Röstprat, no Godot needed): two bots join voice on the in-memory server, one in a room of its own (two
// devices on this machine share an address, so they would be one room that hears nothing), and the check is that the
// server names each as the other's peer, sends the ice servers to the speakers, relays a `signal` from the one that
// offers (`offers()`) to the other and refuses one the other way round when they are in the same room. Audio itself
// (microphone, speakers, the WebRTC data channel) cannot be checked headless: `--voicecheck` (voice_check.gd) covers the
// codec and, with the webrtc-native extension, two peers in one process; the rest is for two real machines.
// BOT_ONLY=voice runs only this.
//
// A settings check (M8b, scripts/settings_check.gd, `--settingscheck`; no server and no window, a few seconds, in its own empty HOME)
// opens the settings window from the pause menu, changes every setting through its controls and asserts each is kept, saved to the
// settings file and applied (the preset's scale, the audio buses, the text size, the palettes, the key map), then puts it all back.
// BOT_ONLY=settings runs only this.
//
//   GODOT=~/godot/godot pnpm godot:bot            (GODOT defaults to `godot` on the PATH)
//   BOT_RUN_MAX_WIPES=0 sets how many wipes the run pair retries (default 2; 0 = a wipe fails the check)
//   BOT_ONLY=run BOT_RUN_SECONDS=480 pnpm godot:bot [-- --full]   (the run pair alone; --full plays to the boss: BOT_RUN_SECONDS=2400)
//   BOT_RUN_SHOTS=dir                             (the run pair saves pictures there; needs a window: run it under xvfb-run)
//   BOT_ONLY=dungeon BOT_DUNGEON=frost BOT_SECONDS=240 pnpm godot:bot   (the fighter pair alone, in Frostjättens borg: draug, frost, surt, hel, dvarg, orm, alv, fenrir or loke; M6a–M6c)
//   BOT_SECONDS=120 BOT_PORT=8097 BOT_PACKS=1     (optional; BOT_FARM_SECONDS=600 for the farmer, BOT_ONLY=farm or walker)
//   BOT_FARM_SHOTS=dir                            (the farmer saves pictures there; needs a window: run under xvfb-run)
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ACHIEVEMENTS } from '../../shared/src/data.ts';
import { LANDMARK_IDS } from '../../shared/src/landmarks.ts';
import { HELP } from '../../shared/src/sv.ts';
import { DUNGEON_IDS } from '../../shared/src/saga.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const godotDir = path.resolve(here, '..');
const godot = process.env.GODOT ?? 'godot';
const port = Number(process.env.BOT_PORT ?? 8097);
const seconds = Number(process.env.BOT_SECONDS ?? 120);
const packs = Number(process.env.BOT_PACKS ?? 1);
/** Which dungeon the fighter pair asks the dev way into (M6a–M6c: draug, frost, surt, hel, dvarg, orm, alv, fenrir or loke; BOT_ONLY=dungeon runs just that pair). */
const dungeon = process.env.BOT_DUNGEON ?? 'draug';
const names = ['Bot-Ask', 'Bot-Embla'];
const walkerName = 'Bot-Vandrare';
const farmerName = 'Bot-Bonde';
const creatorName = 'Bot-Skapare';
const farmSeconds = Number(process.env.BOT_FARM_SECONDS ?? 600);
const farmShots = process.env.BOT_FARM_SHOTS ?? '';
const fullRun = process.argv.includes('--full');
const runSeconds = Number(process.env.BOT_RUN_SECONDS ?? (fullRun ? 2400 : 480));
const runMaxWipes = process.env.BOT_RUN_MAX_WIPES ?? ''; // (unset: the bot's own default of 2; 0 makes a wipe fail the check)
if (runMaxWipes !== '' && !/^\d+$/.test(runMaxWipes)) {
  console.error(`BOT_RUN_MAX_WIPES must be a whole number, 0 or more (got '${runMaxWipes}')`);
  process.exit(2);
}
const runShots = process.env.BOT_RUN_SHOTS ?? '';
const runNames = ['Run-Ask', 'Run-Embla'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'varldstradet-bot-'));

interface Report {
  name: string;
  ok: boolean;
  phase: string;
  seconds: number;
  casts_sent: number;
  casts_acked: number;
  spells_sent: Record<string, number>;
  spells_acked: Record<string, number>;
  others_casts: number;
  others: Record<string, number>;
  monsters_beaten: number[];
  hits_taken: number;
  damage_taken: number;
  hits_dealt: number;
  damage_dealt: number;
  zones_seen: number;
  stepped_out: number;
  fell: number;
  hearts: [number, number, number][];
  mob_hp: [number, number, number, number][];
  bar_samples: number;
  /** Bifrost only: samples of monsters drawn as Loke's ghostly illusions, and of ones drawn solid (there must be none). */
  ghosts: number;
  solid: number;
  rises: [number, number, number, number, string][];
  errors: string[];
  packs_beaten: number;
  area: string;
  route: string[];
  arrived_via_arch: boolean;
  dev_sent: boolean;
  summary?: string;
  run?: { role: string; zones: number[]; exits: number; presses: number; picks: number; runor: string[]; started: boolean; joined: boolean; ended: { outcome: string } | null; boss_down: boolean; seeds: number };
}

interface FarmReport {
  name: string;
  id: string;
  ok: boolean;
  seconds: number;
  steps: { name: string; ok: boolean; detail: string; at: number }[];
  errors: string[];
  toasts: string[];
  inventory: Record<string, number>;
  coins: number;
  stars: number;
  hud_coins: string;
  hud_stars: string;
  day: number;
  route: string[];
  hearts_seen: number;
  /** M9b: what the books, the HUD, the help and the family window showed (farm_bot_books.gd). */
  books?: {
    achievements?: Record<string, { unlocked: boolean; k: number }>;
    journal?: { chapters: number; dungeons: number; levels: number; level: number; chapter: number; has_level_line: boolean; cleared: number };
    finds?: { total: number; found: number; groups: number; unknown: number; all_line: boolean };
    tracker?: { visible: boolean; lines: string[] };
    help?: { topics: number; rows: number; placeholder: boolean; houses: number };
    family?: { members: number; rows: number; mate_online: boolean; place: string };
    jump?: { from: string; to: string; tiles: number };
  };
}

/** What the server itself keeps of a player: asks over the game socket, as a client does (`hello`, then `welcome`). */
type ServerRecord = { inventory: ({ item: string; count: number } | null)[]; coins: number; stars: number; achievements?: string[]; stats?: Record<string, number>; saga?: { chapter?: number; cleared?: string[]; discovered?: string[]; cls?: string; xp?: number }; players: Record<string, { name: string; online: boolean; area: string }> };
async function serverRecord(url: string, playerId: string): Promise<ServerRecord | null> {
  const WebSocket = createRequire(path.join(root, 'packages/server/package.json'))('ws') as typeof import('ws').WebSocket;
  return await new Promise((resolve) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      resolve(null);
    }, 15_000);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', playerId })));
    ws.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      if (msg.t !== 'welcome') return;
      clearTimeout(timer);
      const p = msg.world.players[playerId];
      ws.close();
      resolve(p ? { inventory: p.inventory, coins: p.coins, stars: p.stars, achievements: p.achievements, stats: p.stats, saga: p.saga, players: msg.world.players } : null);
    });
    ws.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

interface CreatorReport {
  name: string;
  ok: boolean;
  id: string;
  choice: { name: string; appearance: { skin: string; hair: string; hairStyle: string }; shirt: string };
  steps: { name: string; ok: boolean; detail: string }[];
  errors: string[];
}

/** Röstprat on the server: two bots join, are named as each other's peers and exchange a signal through the server. */
async function checkVoice(base: string): Promise<void> {
  const WebSocket = createRequire(path.join(root, 'packages/server/package.json'))('ws') as typeof import('ws').WebSocket;
  type Msg = { t: string; ev?: string; state?: { room: string; joined: boolean; rooms: { id: string; speaker: string | null }[] }; from?: string; data?: unknown; servers?: unknown[]; you?: string };
  const player = async (name: string): Promise<string> => {
    const list = (await (await fetch(`${base}/api/players`)).json()) as { id: string; name: string }[];
    const have = list.find((p) => p.name === name);
    if (have) return have.id;
    const made = (await (await fetch(`${base}/api/players`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, appearance: { skin: '#8d5a32', hair: '#2b2119', hairStyle: 'ponytail' } }) })).json()) as { id: string };
    return made.id;
  };
  const open = async (name: string) => {
    const id = await player(name);
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    const msgs: Msg[] = [];
    ws.on('message', (raw: Buffer) => msgs.push(JSON.parse(raw.toString())));
    await new Promise<void>((res, rej) => {
      ws.on('open', () => res());
      ws.on('error', rej);
    });
    ws.send(JSON.stringify({ t: 'hello', playerId: id }));
    const send = (m: unknown): void => ws.send(JSON.stringify(m));
    const state = (): NonNullable<Msg['state']> | undefined => msgs.findLast((m) => m.t === 'voice' && m.ev === 'state')?.state;
    return { id, ws, msgs, send, state };
  };
  const until = async (cond: () => boolean, ms: number): Promise<boolean> => {
    const t = Date.now() + ms;
    while (Date.now() < t) {
      if (cond()) return true;
      await sleep(100);
    }
    return cond();
  };
  const a = await open('Bot-Rost-A');
  const b = await open('Bot-Rost-B');
  try {
    check(await until(() => !!a.state() && !!b.state(), 15_000), 'voice: both bots got the voice state after the welcome');
    b.send({ t: 'voice', a: 'room', mode: 'alone' });
    a.send({ t: 'voice', a: 'join' });
    b.send({ t: 'voice', a: 'join' });
    const named = (x: typeof a, other: typeof a): boolean => !!x.state()?.joined && x.state()!.rooms.some((r) => r.id !== x.state()!.room && r.speaker === other.id);
    check(await until(() => named(a, b) && named(b, a), 10_000), 'voice: each bot has the other as a speaker of another room (its peer)');
    check(await until(() => a.msgs.some((m) => m.ev === 'ice') && b.msgs.some((m) => m.ev === 'ice'), 10_000), 'voice: both speakers were sent the ice servers');
    // the one that makes the offer (offers(): the smaller id) sends; the other receives it, then answers
    const [offerer, answerer] = a.id < b.id ? [a, b] : [b, a];
    offerer.send({ t: 'voice', a: 'signal', to: answerer.id, data: { k: 'sdp', type: 'offer', sdp: 'v=0 test' } });
    check(await until(() => answerer.msgs.some((m) => m.ev === 'signal' && m.from === offerer.id && (m.data as { type?: string })?.type === 'offer'), 5_000), 'voice: the offer reached the other speaker through the server, from the right player');
    answerer.send({ t: 'voice', a: 'signal', to: offerer.id, data: { k: 'sdp', type: 'answer', sdp: 'v=0 test' } });
    answerer.send({ t: 'voice', a: 'signal', to: offerer.id, data: { k: 'ice', media: '0', index: 0, name: 'candidate:1' } });
    check(await until(() => offerer.msgs.filter((m) => m.ev === 'signal' && m.from === answerer.id).length >= 2, 5_000), 'voice: the answer and a candidate came back');
    // the same room hears nothing: put B back with A and a signal must not pass
    b.send({ t: 'voice', a: 'room', mode: 'auto' });
    await sleep(500);
    const before = a.msgs.filter((m) => m.ev === 'signal').length;
    b.send({ t: 'voice', a: 'signal', to: a.id, data: { k: 'ice', media: '0', index: 0, name: 'candidate:2' } });
    await sleep(500);
    check(a.msgs.filter((m) => m.ev === 'signal').length === before, 'voice: a signal between two devices of the same room is not relayed');
    a.send({ t: 'voice', a: 'leave' });
    check(await until(() => !a.state()?.joined, 5_000), 'voice: hanging up takes the bot off the phone');
  } finally {
    a.ws.close();
    b.ws.close();
  }
}

/** The settings check's process (started with the other Godot clients, read after they are done). */
async function checkSettings(proc: { log: string; child: ChildProcess }): Promise<void> {
  // (it was started with the other clients and is long done by now: its exit event has fired, so read the code, don't wait for it)
  const code = proc.child.exitCode !== null ? proc.child.exitCode : await exited(proc.child, 120_000);
  const log = fs.existsSync(proc.log) ? fs.readFileSync(proc.log, 'utf8') : '';
  const lines = log.split('\n').filter((l) => l.startsWith('settingscheck:'));
  const failed = lines.filter((l) => l.includes('FAIL'));
  const bad = log.split('\n').filter((l) => /SCRIPT ERROR|Parse Error|^ERROR:|leaked at exit|still in use at exit|Pages in use exist at exit/.test(l));
  console.log(`\n--- settings check (exit ${code === null ? 'killed' : code}) ---`);
  for (const l of failed.slice(0, 20)) console.log(l);
  console.log(`     ${lines.filter((l) => l.includes(' ok ')).length} steps ok, ${failed.length} failed`);
  check(code === 0, `settings: the check exits 0 (${code})`);
  check(failed.length === 0, `settings: no step failed (${failed[0] ?? 'none'})`);
  check(lines.some((l) => l.startsWith('settingscheck: all ok')), 'settings: the check ends with "all ok"');
  check(lines.filter((l) => l.includes(' ok ')).length >= 60, `settings: it ran its steps (${lines.length} lines)`);
  check(bad.length === 0, `settings: no script errors and nothing leaked at exit (${bad[0] ?? 'none'})`);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function run(cmd: string, args: string[], opts: { cwd: string; env?: Record<string, string>; log: string }): ChildProcess {
  const out = fs.openSync(opts.log, 'w');
  const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['ignore', out, out] });
  child.on('exit', () => fs.closeSync(out));
  return child;
}

// (150 s: it only waits as long as the server needs, but eight pairs boot together on a small runner)
async function waitFor(url: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  throw new Error(`${url} did not answer within ${ms} ms`);
}

function exited(child: ChildProcess, ms: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(null);
    }, ms);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

const failures: string[] = [];
const farmServers: ChildProcess[] = [];
const check = (ok: boolean, text: string): void => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failures.push(text);
};

/** The farmer's report against the rules and against the server's own record of the player. */
async function checkFarmer(r: FarmReport, farmPort: number, botLog?: string): Promise<void> {
  console.log(`\n--- ${r.name} steps ---`);
  for (const st of r.steps) console.log(`${st.ok ? 'ok  ' : 'FAIL'} ${String(st.at).padStart(6)} s  ${st.name}: ${st.detail}`);
  check(r.errors.length === 0, `${r.name}: no errors (${r.errors.join('; ') || 'none'})`);
  const exitErrors = (botLog && fs.existsSync(botLog) ? fs.readFileSync(botLog, 'utf8') : '').split('\n').filter((l) => /leaked at exit|still in use at exit|Pages in use exist at exit|SCRIPT ERROR/.test(l));
  check(exitErrors.length === 0, `${r.name}: no script errors, nothing leaked at exit (${exitErrors[0] ?? 'none'})`);
  const wanted = [
    // the farm (M4b)
    'till', 'plant', 'water', 'grow', 'harvest', 'hotbar keys', 'pets commands', 'drop', 'pick up', 'chop', 'mine', 'fill the can', 'fishing', 'open the chest', 'move a stack', 'startle', 'sound: the forest', 'pet',
    // the shop, the sell box, the wishes and the workbench (M4c)
    'the shop opens', 'buy seeds', 'buy a hat', 'plant wheat', 'harvest wheat', 'sell a crop', 'Lilla Elsas önskning', 'Fiskar-Svens önskning',
    'the workbench opens', 'craft fences', 'preview: no fence on water', 'place a fence', 'take my fence down', "someone else's fence is refused",
    // the house, the stove, the wardrobe, the villagers
    'into the farmhouse', 'the stove opens', 'sound: by the stove indoors', 'cook bread', 'out of the farmhouse', 'change the hat', "a villager's window", 'start a conversation', 'a joke', 'a riddle', 'sten, sax, påse', 'villagers speak',
    // quest marks over the villagers (M9b)
    'mark: Elsa has a wish I can fill', "mark: Elsa's wish is done", 'mark: Völvan has a story', "mark: Völvan's chapter is done", "mark: Völvan's next chapter", 'marks up close',
    // the books, the HUD, the help and the family window (M9b)
    'the Gårdsbok', 'the Gårdsbok closes on B', 'the pause menu opens the books',
    'the journal', "the family's best time", 'the level chip', 'the level chip opens the journal', 'the saga tracker', 'the tracker folds', "Völvan's journal tab",
    'the Upptäcktsbok',
    'the help', 'the help on ?',
    'the family window', 'the family list follows the family', 'the family window names every place', 'jump to the family', 'the family and pet buttons', 'which animals the pet buttons answer for',
    'large text fits',
    // the village: the class, Völvan, the pizzeria, the gear and the hero switch, the bus
    'walk to Köpingen', 'sound: the village', 'pick a class', "Völvan's chapter", 'buy a pizza', 'eat the pizza', 'equip the weapon', 'the hero switch', 'back to the farm outfit', 'the bus home', 'the bus to the village', 'sound: footsteps', 'sound: ambience',
  ];
  for (const want of wanted) {
    const st = r.steps.find((x) => x.name === want);
    check(!!st && st.ok, `${r.name}: ${want}${st ? ` (${st.detail})` : ' (never ran)'}`);
  }
  // my bag, my coins and my stars as the client had them against what the server keeps
  const rec = await serverRecord(`ws://127.0.0.1:${farmPort}/ws`, r.id);
  check(!!rec, `${r.name}: the server answered for ${r.id}`);
  if (!rec) return;
  const serverBag: Record<string, number> = {};
  for (const s of rec.inventory) if (s) serverBag[s.item] = (serverBag[s.item] ?? 0) + s.count;
  const keys = [...new Set([...Object.keys(serverBag), ...Object.keys(r.inventory)])].sort();
  const differ = keys.filter((k) => (serverBag[k] ?? 0) !== (r.inventory[k] ?? 0));
  check(differ.length === 0, `${r.name}: the bag matches the server's (${keys.length} kinds${differ.length ? '; differ: ' + differ.map((k) => `${k} ${r.inventory[k] ?? 0} vs ${serverBag[k] ?? 0}`).join(', ') : ''}): ${JSON.stringify(serverBag)}`);
  check(r.coins === rec.coins, `${r.name}: coins ${r.coins} = the server's ${rec.coins}`);
  check(r.stars === rec.stars, `${r.name}: stars ${r.stars} = the server's ${rec.stars}`);
  check(r.hud_coins.startsWith(String(rec.coins)), `${r.name}: the HUD shows the coins ("${r.hud_coins}" for ${rec.coins})`);
  check(rec.stars === 0 || r.hud_stars.includes(String(rec.stars)), `${r.name}: the HUD shows the stars ("${r.hud_stars}" for ${rec.stars})`);
  check(rec.stars >= 3, `${r.name}: the errands and the chapter paid in stars (${rec.coins} kr left, ${rec.stars} stars)`);
  checkBooks(r, rec);
}

/** The books the client drew (B, K, H, P) against the server's own record of the player and the shared data. */
function checkBooks(r: FarmReport, rec: ServerRecord): void {
  const b = r.books ?? {};
  // the Gårdsbok: all of ACHIEVEMENTS, and each one done exactly when the server says so, its bar as far as the server's counter
  const ach = b.achievements ?? {};
  check(Object.keys(ach).length === ACHIEVEMENTS.length, `${r.name}: the Gårdsbok drew all ${ACHIEVEMENTS.length} achievements (${Object.keys(ach).length})`);
  const wrong = ACHIEVEMENTS.filter((a) => {
    const shown = ach[a.id];
    const have = Math.min(a.goal, rec.stats?.[a.stat] ?? 0);
    return !shown || shown.unlocked !== !!rec.achievements?.includes(a.id) || Math.abs(shown.k - have / a.goal) > 0.001;
  });
  check(wrong.length === 0, `${r.name}: each achievement's medal and bar agree with the server's record (${wrong.map((a) => a.id).slice(0, 5).join(', ') || 'all ' + ACHIEVEMENTS.length}); ${rec.achievements?.length ?? 0} unlocked`);
  check(!!ach['harvest_1']?.unlocked && !!rec.achievements?.includes('harvest_1'), `${r.name}: the first harvest earned a medal, and the book shows it`);
  // the journal: the chapters up to mine, the nine dungeons, the hero level
  const j = b.journal;
  check(!!j && j.chapters === (rec.saga?.chapter ?? 0) + 1 && j.dungeons === DUNGEON_IDS.length, `${r.name}: the journal lists ${j?.chapters} chapters (the server says chapter ${rec.saga?.chapter}) and ${j?.dungeons} of ${DUNGEON_IDS.length} dungeons`);
  check(!!j && j.has_level_line && j.chapter === (rec.saga?.chapter ?? 0), `${r.name}: the journal's hero level line and chapter are the server's (level ${j?.level}, chapter ${j?.chapter})`);
  const f = b.finds;
  check(!!f && f.total === LANDMARK_IDS.length && f.found === (rec.saga?.discovered?.length ?? 0) && f.unknown === f.total - f.found && f.all_line, `${r.name}: the Upptäcktsbok has all ${LANDMARK_IDS.length} places, ${f?.found} found as the server says, the rest ???`);
  check(!!b.tracker?.visible && b.tracker.lines.length >= 1, `${r.name}: the saga tracker was on the HUD (${b.tracker?.lines.join(' | ')})`);
  const h = b.help;
  check(!!h && h.topics === HELP.length && !h.placeholder, `${r.name}: the help has all ${HELP.length} topics of the shared file (${h?.topics}), ${h?.rows} steps, no {placeholders} left`);
  // the family window: everyone in the family listed, the second player online on the farm, the jump landed next to them
  const fam = b.family;
  const everyone = Object.values(rec.players).length;
  check(!!fam && fam.members === everyone && fam.rows === everyone && fam.mate_online, `${r.name}: the family window lists all ${everyone} players of the farm (${fam?.rows}) and Bot-Syskon online at "${fam?.place}"`);
  const mate = Object.values(rec.players).find((p) => p.name === 'Bot-Syskon');
  check(!!b.jump && b.jump.to === mate?.area && b.jump.tiles < 3.5, `${r.name}: the jump from ${b.jump?.from} put it in the mate's map (${mate?.area}) ${b.jump?.tiles} tiles away`);
}

/** One bot of the run pair: it played through the client and its report says how far. */
function checkRunner(r: Report, botLog?: string): void {
  const run = r.run;
  check(r.errors.length === 0, `${r.name}: no errors (${r.errors.join('; ') || 'none'})`);
  const exitErrors = (botLog && fs.existsSync(botLog) ? fs.readFileSync(botLog, 'utf8') : '').split('\n').filter((l) => /leaked at exit|still in use at exit|Pages in use exist at exit|SCRIPT ERROR/.test(l));
  check(exitErrors.length === 0, `${r.name}: no script errors, nothing leaked at exit (${exitErrors[0] ?? 'none'})`);
  check(!!run, `${r.name}: the run report is there`);
  if (!run) return;
  console.log(`     ${r.name} (${run.role}): zones ${JSON.stringify(run.zones)}, exits taken ${run.exits} (${run.presses} presses), votes the server showed ${run.picks}, runor ${JSON.stringify(run.runor)}, sagafrön ${run.seeds}, started ${run.started}, joined ${run.joined}, ended ${JSON.stringify(run.ended)}`);
  if (run.role === 'lead') check(run.started, `${r.name}: pressed "Starta färden" at the arch window`);
  check(run.zones.includes(0), `${r.name}: entered zone 1 (${JSON.stringify(run.zones)})`);
  check(run.zones.includes(1), `${r.name}: cleared zone 1, used the exit, voted and entered zone 2 (${JSON.stringify(run.zones)}) after ${r.seconds.toFixed(0)} s`);
  check(run.exits >= 1, `${r.name}: the server let it through the way on (${run.exits} exits, ${run.presses} presses)`);
  check(run.picks >= 1, `${r.name}: voted on a runa card and the server's offer showed the vote (${run.picks})`);
  check(run.runor.length >= 1, `${r.name}: the pick gave the party a runa (${run.runor.join(', ') || 'none'})`);
  check(run.seeds >= 1, `${r.name}: earned sagafrön in the run (${run.seeds})`);
  if (fullRun) {
    check(run.zones.includes(3), `${r.name}: reached the boss's map (${JSON.stringify(run.zones)})`);
    check(run.boss_down, `${r.name}: the boss fell`);
  }
}

/** The creator check's steps, and the character as the server keeps it against what the creator window sent. */
async function checkCreator(r: CreatorReport, botLog?: string): Promise<void> {
  console.log(`\n--- ${r.name} steps ---`);
  for (const st of r.steps) console.log(`${st.ok ? 'ok  ' : 'FAIL'} ${st.name}: ${st.detail}`);
  check(r.errors.length === 0, `${r.name}: no errors (${r.errors.join('; ') || 'none'})`);
  const exitErrors = (botLog && fs.existsSync(botLog) ? fs.readFileSync(botLog, 'utf8') : '').split('\n').filter((l) => /leaked at exit|still in use at exit|Pages in use exist at exit|SCRIPT ERROR/.test(l));
  check(exitErrors.length === 0, `${r.name}: no script errors, nothing leaked at exit (${exitErrors[0] ?? 'none'})`);
  for (const want of ['the picker shows', 'the creator window opens', 'an empty name is refused', 'Skapa makes the character', 'the picker lists the new character', 'the new character is the selected one', 'the game welcomes the new character']) {
    const st = r.steps.find((x) => x.name.startsWith(want));
    check(!!st && st.ok, `${r.name}: ${want}${st ? '' : ' (never ran)'}`);
  }
  const res = await fetch(`http://127.0.0.1:${port}/api/players`);
  const list = (await res.json()) as { id: string; name: string; appearance: { skin: string; hair: string; hairStyle: string }; outfit: { shirt?: string } }[];
  const mine = list.find((p) => p.id === r.id);
  check(!!mine && mine.name === creatorName, `${r.name}: the server lists the new character as ${mine?.name ?? 'nothing'} (${r.id})`);
  const ap = r.choice.appearance;
  check(mine?.appearance.skin === ap.skin && mine?.appearance.hair === ap.hair && mine?.appearance.hairStyle === ap.hairStyle && mine?.outfit.shirt === r.choice.shirt, `${r.name}: the server kept the look the window sent (${JSON.stringify(mine?.appearance)}, ${mine?.outfit.shirt})`);
}

async function main(): Promise<void> {
  const serverLog = path.join(tmp, 'server.log');
  const tsx = path.join(root, 'packages/server/node_modules/.bin/tsx');
  console.log(`server: port ${port}, memory store, ACCESS=open, DEV_TELEPORT=1 (log ${serverLog})`);
  const server = run(tsx, ['src/main.ts'], {
    cwd: path.join(root, 'packages/server'),
    env: { PORT: String(port), ACCESS: 'open', DEV_TELEPORT: '1', DATABASE_URL: '', SEASON_OVERRIDE: 'summer' },
    log: serverLog,
  });
  try {
    await waitFor(`http://localhost:${port}/api/gate`, 150_000);
    console.log('server: up');
    if ((process.env.BOT_ONLY ?? '') === 'voice' || (process.env.BOT_ONLY ?? '') === '') await checkVoice(`http://127.0.0.1:${port}`);
    if ((process.env.BOT_ONLY ?? '') === 'voice') {
      server.kill('SIGTERM');
      finish();
      return;
    }
    // BOT_ONLY: nothing (everyone), `walker` (the arch walker alone) or `farm` (the farmer alone)
    const mode = process.env.BOT_ONLY ?? '';
    const only = mode === 'walker' || mode === 'creator';
    const spawnBot = (name: string, extra: string[]) => {
      const report = path.join(tmp, `${name}.json`);
      const log = path.join(tmp, `${name}.log`);
      // 127.0.0.1, not localhost: the server listens on IPv4 and a resolver may try ::1 first
      const args = ['--headless', '--path', godotDir, '--', '--bot', `--server=http://127.0.0.1:${port}`, `--name=${name}`, `--report=${report}`, `--seconds=${seconds}`, ...extra];
      console.log(`${name}: ${godot} ${args.join(' ')}`);
      return { name, report, log, child: run(godot, args, { cwd: godotDir, log }) };
    };
    const bots = mode === '' || mode === 'dungeon' ? names.map((name) => spawnBot(name, [`--packs=${packs}`, `--dungeon=${dungeon}`])) : [];
    const walker = mode === '' || mode === 'walker' ? [spawnBot(walkerName, ['--route=arch', `--dungeon=${dungeon}`])] : [];
    // the creator check: the login screen's way to a new character (its own empty HOME: it saves settings there, not in yours)
    const creators: { name: string; report: string; log: string; child: ChildProcess }[] = [];
    if (mode === '' || mode === 'creator') {
      const report = path.join(tmp, `${creatorName}.json`);
      const log = path.join(tmp, `${creatorName}.log`);
      const home = fs.mkdtempSync(path.join(tmp, 'home-'));
      const args = ['--headless', '--path', godotDir, '--', '--creatorcheck', `--server=http://127.0.0.1:${port}`, `--name=${creatorName}`, `--report=${report}`];
      console.log(`${creatorName}: ${godot} ${args.join(' ')}`);
      creators.push({ name: creatorName, report, log, child: run(godot, args, { cwd: godotDir, log, env: { HOME: home, XDG_DATA_HOME: path.join(home, 'data') } }) });
    }
    // the settings check: the settings window, every setting changed and put back (its own empty HOME: it saves settings there)
    let settingsRun: { log: string; child: ChildProcess } | null = null;
    if (mode === '' || mode === 'settings') {
      const log = path.join(tmp, 'settingscheck.log');
      const home = fs.mkdtempSync(path.join(tmp, 'home-settings-'));
      const args = ['--headless', '--path', godotDir, '--', '--settingscheck'];
      console.log(`settingscheck: ${godot} ${args.join(' ')}`);
      settingsRun = { log, child: run(godot, args, { cwd: godotDir, log, env: { HOME: home, XDG_DATA_HOME: path.join(home, 'data') } }) };
    }
    // the farmer gets a server of its own (the day rolls over for everyone on a server)
    const farmPort = port + 1;
    const farmers: { name: string; report: string; log: string; child: ChildProcess }[] = [];
    if (mode === '' || mode === 'farm') {
      const farmServer = run(tsx, ['src/main.ts'], {
        cwd: path.join(root, 'packages/server'),
        env: { PORT: String(farmPort), ACCESS: 'open', DEV_TELEPORT: '1', DATABASE_URL: '', SEASON_OVERRIDE: 'summer' },
        log: path.join(tmp, 'server-farm.log'),
      });
      farmServers.push(farmServer);
      await waitFor(`http://localhost:${farmPort}/api/gate`, 150_000);
      console.log(`server 2 (the farmer's): port ${farmPort}`);
      // a second player builds three fences first: the farmer has to be refused when it tries to take one down
      const friendReport = path.join(tmp, 'friend.json');
      const friend = run(process.execPath, [path.join(here, 'friend.mts'), `http://127.0.0.1:${farmPort}`, friendReport], { cwd: here, log: path.join(tmp, 'friend.log') });
      const friendCode = await exited(friend, 90_000);
      const fr = fs.existsSync(friendReport) ? (JSON.parse(fs.readFileSync(friendReport, 'utf8')) as { ok: boolean; note: string }) : { ok: false, note: 'no report' };
      check(friendCode === 0 && fr.ok, `the neighbour (a second player) put fences on the farm: ${fr.note}`);
      // and a third stays online on the farm for the family window: the farmer finds it in the list and jumps to it from the village
      farmServers.push(run(process.execPath, [path.join(here, 'mate.mts'), `http://127.0.0.1:${farmPort}`, String(farmSeconds + 30)], { cwd: here, log: path.join(tmp, 'mate.log') }));
      const report = path.join(tmp, `${farmerName}.json`);
      const log = path.join(tmp, `${farmerName}.log`);
      const args = ['--headless', '--path', godotDir, '--', '--farmbot', `--server=http://127.0.0.1:${farmPort}`, `--name=${farmerName}`, `--report=${report}`, `--seconds=${farmSeconds}`];
      if (farmShots) {
        args.splice(0, 1); // (pictures need a window: no --headless)
        args.push(`--shots=${farmShots}`);
      }
      console.log(`${farmerName}: ${godot} ${args.join(' ')}`);
      farmers.push({ name: farmerName, report, log, child: run(godot, args, { cwd: godotDir, log }) });
    }
    // the run pair gets a server of its own, too (a run takes the party off the farm for minutes)
    const runBots: { name: string; report: string; log: string; child: ChildProcess }[] = [];
    if (mode === 'run') {
      const runPort = port + 2;
      const runServer = run(tsx, ['src/main.ts'], {
        cwd: path.join(root, 'packages/server'),
        env: { PORT: String(runPort), ACCESS: 'open', DEV_TELEPORT: '1', DATABASE_URL: '', SEASON_OVERRIDE: 'summer' },
        log: path.join(tmp, 'server-run.log'),
      });
      farmServers.push(runServer);
      await waitFor(`http://localhost:${runPort}/api/gate`, 150_000);
      console.log(`server 3 (the run pair's): port ${runPort}`);
      runNames.forEach((name, i) => {
        const report = path.join(tmp, `${name}.json`);
        const log = path.join(tmp, `${name}.log`);
        const args = ['--headless', '--path', godotDir, '--', '--runbot', '--route=run', `--server=http://127.0.0.1:${runPort}`, `--name=${name}`, `--report=${report}`, `--seconds=${runSeconds}`, `--role=${i === 0 ? 'lead' : 'follow'}`];
        if (fullRun) args.push('--full');
        if (runMaxWipes !== '') args.push(`--max-wipes=${runMaxWipes}`);
        if (runShots) {
          args.splice(0, 1); // (pictures need a window: no --headless)
          args.push(`--shots=${runShots}`);
        }
        console.log(`${name}: ${godot} ${args.join(' ')}`);
        runBots.push({ name, report, log, child: run(godot, args, { cwd: godotDir, log }) });
      });
    }
    const all = [...bots, ...walker, ...farmers, ...creators, ...runBots];
    const codes = await Promise.all(all.map((b) => exited(b.child, ((b.name === farmerName ? farmSeconds : runNames.includes(b.name) ? runSeconds : seconds) + 40) * 1000)));
    if (settingsRun) await checkSettings(settingsRun);
    const reports: (Report | FarmReport | null)[] = all.map((b, i) => {
      console.log(`\n--- ${b.name} (exit ${codes[i] === null ? 'killed' : codes[i]}) ---`);
      const log = fs.existsSync(b.log) ? fs.readFileSync(b.log, 'utf8') : '';
      for (const line of log.split('\n').filter((l) => l.startsWith('bot ') || /SCRIPT ERROR|ERROR/.test(l)).slice(0, 60)) console.log(line);
      if (!fs.existsSync(b.report)) {
        check(false, `${b.name}: no report written (see ${b.log})`);
        return null;
      }
      return JSON.parse(fs.readFileSync(b.report, 'utf8')) as Report | FarmReport;
    });
    console.log('\n--- checks ---');
    for (const rr of reports) {
      if (!rr) continue;
      if (rr.name === creatorName) {
        await checkCreator(rr as unknown as CreatorReport, all.find((b) => b.name === creatorName)?.log);
        continue;
      }
      if (rr.name === farmerName) {
        await checkFarmer(rr as FarmReport, farmPort, all.find((b) => b.name === farmerName)?.log);
        continue;
      }
      if (runNames.includes(rr.name)) {
        checkRunner(rr as Report, all.find((b) => b.name === rr.name)?.log);
        continue;
      }
      const r = rr as Report;
      check(r.errors.length === 0, `${r.name}: no errors (${r.errors.join('; ') || 'none'})`);
      const botLog = all.find((b) => b.name === r.name)?.log;
      const exitErrors = (botLog && fs.existsSync(botLog) ? fs.readFileSync(botLog, 'utf8') : '').split('\n').filter((l) => /leaked at exit|still in use at exit|Pages in use exist at exit/.test(l));
      check(exitErrors.length === 0, `${r.name}: exits clean, nothing leaked at exit (${exitErrors[0] ?? 'none'})`);
      check(r.area === `saga:${dungeon}`, `${r.name}: entered the dungeon saga:${dungeon} (${r.area || 'never'})`);
      if (r.name === walkerName) {
        // the real way in: across the farm, through two forests, through the arch; the dev message never sent
        // (Draugkryptan's arch is two forests away; another dungeon's route is whatever the walker found, ending in it)
        if (dungeon === 'draug') {
          const want = ['farm', 'a:0,-1', 'a:-1,-1', 'saga:draug'];
          // (a walker that faints in a forest wakes at home and walks again: the route ends in the way in, it may begin twice)
          check(r.route.length >= want.length && JSON.stringify(r.route.slice(-want.length)) === JSON.stringify(want), `${r.name}: walked ${r.route.join(' → ')}`);
        } else check(r.route.at(-1) === `saga:${dungeon}`, `${r.name}: walked ${r.route.join(' → ')}`);
        check(r.area === `saga:${dungeon}`, `${r.name}: arrived in saga:${dungeon} through the arch (${r.area || 'never'}) after ${r.seconds.toFixed(0)} s`);
        check(r.arrived_via_arch && !r.dev_sent, `${r.name}: the dev way was never used (dev_sent ${r.dev_sent})`);
        continue;
      }
      check(r.casts_sent > 0, `${r.name}: sent casts (${r.casts_sent})`);
      check(r.casts_acked > 0, `${r.name}: the server acknowledged its casts (${r.casts_acked} of ${r.casts_sent}: ${JSON.stringify(r.spells_acked)})`);
      check(Object.keys(r.spells_acked).length >= 4, `${r.name}: all four spells went off at least once (${Object.keys(r.spells_acked).join(', ')})`);
      check(r.monsters_beaten.length > 0, `${r.name}: saw monsters beaten (${r.monsters_beaten.length})`);
      check(r.packs_beaten >= packs, `${r.name}: beat the first pack (${r.packs_beaten} of ${packs}) in ${r.seconds.toFixed(0)} s`);
      check(r.hits_dealt > 0 && r.damage_dealt > 0, `${r.name}: hit numbers came back (${r.hits_dealt} hits, ${r.damage_dealt} damage dealt; took ${r.hits_taken} hits, ${r.damage_taken} damage)`);
      // a monster's health, as its bar shows it, only falls (the server's `mend` heal excepted)
      check(r.bar_samples > 0, `${r.name}: sampled the monsters' health bars (${r.bar_samples} samples)`);
      // Loke's illusions (the server sends `variant: 1`): each monster but the bosses is drawn as the ghostly sheet
      if (dungeon === 'loke') check(r.ghosts > 0 && r.solid === 0, `${r.name}: the illusions are drawn ghostly (${r.ghosts} samples ghostly, ${r.solid} solid)`);
      check(r.rises.length === 0, `${r.name}: no monster's health rose without a server heal (${r.rises.length}${r.rises.length ? ': ' + r.rises.slice(0, 3).map((x) => `${x[4]} monster ${x[1]} ${x[2]}->${x[3]} at ${x[0]}`).join('; ') : ''})`);
      check(r.hearts.length > 0, `${r.name}: saw its own hearts (${r.hearts.length} samples, last ${JSON.stringify(r.hearts.at(-1))})`);
      console.log(`     ${r.name}: zones seen ${r.zones_seen}, stepped out ${r.stepped_out}, fell ${r.fell}`);
    }
    const [a, b] = (bots.length === 2 ? reports.slice(0, 2) : [undefined, undefined]) as (Report | undefined)[];
    if (a && b) {
      check(a.others_casts > 0, `${a.name} saw ${b.name}'s casts (${a.others_casts}: ${JSON.stringify(a.others)})`);
      check(b.others_casts > 0, `${b.name} saw ${a.name}'s casts (${b.others_casts}: ${JSON.stringify(b.others)})`);
      // the same monster at the same server tick must show the same health to both
      const key = (s: [number, number, number, number]) => `${s[0]}:${s[1]}`;
      const seen = new Map<string, [number, number]>();
      for (const s of a.mob_hp) seen.set(key(s), [s[2], s[3]]);
      let shared = 0;
      let differ = 0;
      const examples: string[] = [];
      for (const s of b.mob_hp) {
        const other = seen.get(key(s));
        if (!other) continue;
        shared++;
        if (other[0] !== s[2] || other[1] !== s[3]) {
          differ++;
          if (examples.length < 3) examples.push(`tick ${s[0]} monster ${s[1]}: ${other[0]}/${other[1]} vs ${s[2]}/${s[3]}`);
        }
      }
      check(shared > 0, `both saw the same monsters at the same ticks (${shared} shared samples)`);
      check(differ === 0, `monster health agrees between the bots (${differ} differ${examples.length ? ': ' + examples.join('; ') : ''})`);
      const same = a.monsters_beaten.filter((id) => b.monsters_beaten.includes(id));
      check(same.length > 0, `both saw the same monsters beaten (${same.length} in common)`);
    }
  } finally {
    for (const f of farmServers) f.kill('SIGTERM');
    server.kill('SIGTERM');
    await sleep(500);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  finish();
}

/** The end of a run: where the logs are, the failures with every log, and the exit code. */
function finish(): void {
  console.log(`\nlogs and reports in ${tmp}`);
  if (failures.length) {
    // the whole story, for a failure nobody can reproduce by hand (CI)
    for (const f of fs.readdirSync(tmp).filter((n) => n.endsWith('.log'))) {
      const lines = fs.readFileSync(path.join(tmp, f), 'utf8').split('\n');
      console.log(`\n--- ${f} (last ${Math.min(80, lines.length)} of ${lines.length} lines) ---`);
      console.log(lines.slice(-80).join('\n'));
    }
    console.log(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
