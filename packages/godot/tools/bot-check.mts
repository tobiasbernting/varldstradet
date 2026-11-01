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
// A fourth bot (M4b, the farmer) works a second server of its own (it rolls the day over, which would disturb the
// fights): it tills, plants, waters, waits for the carrot to grow, harvests, drops and picks up a carrot, chops trees
// and mines rocks, does Elsa's and Fiskar-Sven's errands (coins, stars, a rod), fills the can at the pond, fishes,
// opens the chest and moves a stack in the bag, and pets a wild animal in the forest. Its report ends with its bag, coins
// and stars as the client shows them, and this script then asks the server (a websocket, as a client would) for its own
// record of that player and compares the two.
//
//   GODOT=~/godot/godot pnpm godot:bot            (GODOT defaults to `godot` on the PATH)
//   BOT_SECONDS=120 BOT_PORT=8097 BOT_PACKS=1     (optional; BOT_FARM_SECONDS=200 for the farmer, BOT_ONLY=farm or walker)
//   BOT_FARM_SHOTS=dir                            (the farmer saves pictures there; needs a window: run under xvfb-run)
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const godotDir = path.resolve(here, '..');
const godot = process.env.GODOT ?? 'godot';
const port = Number(process.env.BOT_PORT ?? 8097);
const seconds = Number(process.env.BOT_SECONDS ?? 120);
const packs = Number(process.env.BOT_PACKS ?? 1);
const names = ['Bot-Ask', 'Bot-Embla'];
const walkerName = 'Bot-Vandrare';
const farmerName = 'Bot-Bonde';
const farmSeconds = Number(process.env.BOT_FARM_SECONDS ?? 200);
const farmShots = process.env.BOT_FARM_SHOTS ?? '';
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
  rises: [number, number, number, number, string][];
  errors: string[];
  packs_beaten: number;
  area: string;
  route: string[];
  arrived_via_arch: boolean;
  dev_sent: boolean;
  summary?: string;
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
}

/** What the server itself keeps of a player: asks over the game socket, as a client does (`hello`, then `welcome`). */
async function serverRecord(url: string, playerId: string): Promise<{ inventory: ({ item: string; count: number } | null)[]; coins: number; stars: number } | null> {
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
      resolve(p ? { inventory: p.inventory, coins: p.coins, stars: p.stars } : null);
    });
    ws.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function run(cmd: string, args: string[], opts: { cwd: string; env?: Record<string, string>; log: string }): ChildProcess {
  const out = fs.openSync(opts.log, 'w');
  const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['ignore', out, out] });
  child.on('exit', () => fs.closeSync(out));
  return child;
}

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
  for (const want of ['till', 'plant', 'water', 'grow', 'harvest', 'drop', 'pick up', 'chop', 'mine', 'Elsas uppdrag', 'Svens uppdrag', 'fill the can', 'fishing', 'open the chest', 'move a stack', 'pet']) {
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
  check(rec.coins > 150 && rec.stars >= 3, `${r.name}: the errands paid (${rec.coins} kr, ${rec.stars} stars)`);
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
    await waitFor(`http://localhost:${port}/api/gate`, 60_000);
    console.log('server: up');
    // BOT_ONLY: nothing (everyone), `walker` (the arch walker alone) or `farm` (the farmer alone)
    const mode = process.env.BOT_ONLY ?? '';
    const only = mode === 'walker';
    const spawnBot = (name: string, extra: string[]) => {
      const report = path.join(tmp, `${name}.json`);
      const log = path.join(tmp, `${name}.log`);
      // 127.0.0.1, not localhost: the server listens on IPv4 and a resolver may try ::1 first
      const args = ['--headless', '--path', godotDir, '--', '--bot', `--server=http://127.0.0.1:${port}`, `--name=${name}`, `--report=${report}`, `--seconds=${seconds}`, ...extra];
      console.log(`${name}: ${godot} ${args.join(' ')}`);
      return { name, report, log, child: run(godot, args, { cwd: godotDir, log }) };
    };
    const bots = mode === '' ? names.map((name) => spawnBot(name, [`--packs=${packs}`])) : [];
    const walker = mode === 'farm' ? [] : [spawnBot(walkerName, ['--route=arch'])];
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
      await waitFor(`http://localhost:${farmPort}/api/gate`, 60_000);
      console.log(`server 2 (the farmer's): port ${farmPort}`);
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
    const all = [...bots, ...walker, ...farmers];
    const codes = await Promise.all(all.map((b) => exited(b.child, ((b.name === farmerName ? farmSeconds : seconds) + 40) * 1000)));
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
      if (rr.name === farmerName) {
        await checkFarmer(rr as FarmReport, farmPort, all.find((b) => b.name === farmerName)?.log);
        continue;
      }
      const r = rr as Report;
      check(r.errors.length === 0, `${r.name}: no errors (${r.errors.join('; ') || 'none'})`);
      const botLog = all.find((b) => b.name === r.name)?.log;
      const exitErrors = (botLog && fs.existsSync(botLog) ? fs.readFileSync(botLog, 'utf8') : '').split('\n').filter((l) => /leaked at exit|still in use at exit|Pages in use exist at exit/.test(l));
      check(exitErrors.length === 0, `${r.name}: exits clean, nothing leaked at exit (${exitErrors[0] ?? 'none'})`);
      check(r.area.startsWith('saga:'), `${r.name}: entered the dungeon (${r.area || 'never'})`);
      if (r.name === walkerName) {
        // the real way in: across the farm, through two forests, through the arch; the dev message never sent
        const want = ['farm', 'a:0,-1', 'a:-1,-1', 'saga:draug'];
        check(JSON.stringify(r.route) === JSON.stringify(want), `${r.name}: walked ${r.route.join(' → ')}`);
        check(r.area === 'saga:draug', `${r.name}: arrived in saga:draug through the arch (${r.area || 'never'}) after ${r.seconds.toFixed(0)} s`);
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
      check(r.rises.length === 0, `${r.name}: no monster's health rose without a server heal (${r.rises.length}${r.rises.length ? ': ' + r.rises.slice(0, 3).map((x) => `${x[4]} monster ${x[1]} ${x[2]}->${x[3]} at ${x[0]}`).join('; ') : ''})`);
      check(r.hearts.length > 0, `${r.name}: saw its own hearts (${r.hearts.length} samples, last ${JSON.stringify(r.hearts.at(-1))})`);
      console.log(`     ${r.name}: zones seen ${r.zones_seen}, stepped out ${r.stepped_out}, fell ${r.fell}`);
    }
    const [a, b] = (only ? [undefined, undefined] : reports.slice(0, 2)) as (Report | undefined)[];
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
