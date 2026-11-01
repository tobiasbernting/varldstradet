// Runs the fight without a human: starts the game server in memory (no database) with ACCESS=open and
// DEV_TELEPORT=1, starts two headless Godot clients in bot mode (scripts/bot.gd) against it, waits for their
// reports and checks them against each other: every bot's casts were acknowledged by the server, each bot saw
// the other's casts, monsters were beaten, and wherever both bots have a health sample for the same monster at
// the same server tick, the numbers agree. Exit code 0 when all of that holds. `pnpm godot:bot` runs it; the
// Godot workflow runs it on every pull request so a later milestone cannot break the fight quietly.
//
//   GODOT=~/godot/godot pnpm godot:bot            (GODOT defaults to `godot` on the PATH)
//   BOT_SECONDS=120 BOT_PORT=8097 BOT_PACKS=1     (optional)
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const godotDir = path.resolve(here, '..');
const godot = process.env.GODOT ?? 'godot';
const port = Number(process.env.BOT_PORT ?? 8097);
const seconds = Number(process.env.BOT_SECONDS ?? 120);
const packs = Number(process.env.BOT_PACKS ?? 1);
const names = ['Bot-Ask', 'Bot-Embla'];
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
  errors: string[];
  packs_beaten: number;
  area: string;
  summary?: string;
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
const check = (ok: boolean, text: string): void => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
  if (!ok) failures.push(text);
};

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
    const bots = names.map((name, i) => {
      const report = path.join(tmp, `${name}.json`);
      const log = path.join(tmp, `${name}.log`);
      // 127.0.0.1, not localhost: the server listens on IPv4 and a resolver may try ::1 first
      const args = ['--headless', '--path', godotDir, '--', '--bot', `--server=http://127.0.0.1:${port}`, `--name=${name}`, `--report=${report}`, `--seconds=${seconds}`, `--packs=${packs}`];
      console.log(`bot ${i + 1}: ${godot} ${args.join(' ')}`);
      return { name, report, log, child: run(godot, args, { cwd: godotDir, log }) };
    });
    const codes = await Promise.all(bots.map((b) => exited(b.child, (seconds + 40) * 1000)));
    const reports: (Report | null)[] = bots.map((b, i) => {
      console.log(`\n--- ${b.name} (exit ${codes[i] === null ? 'killed' : codes[i]}) ---`);
      const log = fs.existsSync(b.log) ? fs.readFileSync(b.log, 'utf8') : '';
      for (const line of log.split('\n').filter((l) => l.startsWith('bot ') || /SCRIPT ERROR|ERROR/.test(l)).slice(0, 60)) console.log(line);
      if (!fs.existsSync(b.report)) {
        check(false, `${b.name}: no report written (see ${b.log})`);
        return null;
      }
      return JSON.parse(fs.readFileSync(b.report, 'utf8')) as Report;
    });
    console.log('\n--- checks ---');
    for (const r of reports) {
      if (!r) continue;
      check(r.errors.length === 0, `${r.name}: no errors (${r.errors.join('; ') || 'none'})`);
      check(r.area.startsWith('saga:'), `${r.name}: entered the dungeon (${r.area || 'never'})`);
      check(r.casts_sent > 0, `${r.name}: sent casts (${r.casts_sent})`);
      check(r.casts_acked > 0, `${r.name}: the server acknowledged its casts (${r.casts_acked} of ${r.casts_sent}: ${JSON.stringify(r.spells_acked)})`);
      check(Object.keys(r.spells_acked).length >= 4, `${r.name}: all four spells went off at least once (${Object.keys(r.spells_acked).join(', ')})`);
      check(r.monsters_beaten.length > 0, `${r.name}: saw monsters beaten (${r.monsters_beaten.length})`);
      check(r.packs_beaten >= packs, `${r.name}: beat the first pack (${r.packs_beaten} of ${packs}) in ${r.seconds.toFixed(0)} s`);
      check(r.hits_dealt > 0 && r.damage_dealt > 0, `${r.name}: hit numbers came back (${r.hits_dealt} hits, ${r.damage_dealt} damage dealt; took ${r.hits_taken} hits, ${r.damage_taken} damage)`);
      check(r.hearts.length > 0, `${r.name}: saw its own hearts (${r.hearts.length} samples, last ${JSON.stringify(r.hearts.at(-1))})`);
      console.log(`     ${r.name}: zones seen ${r.zones_seen}, stepped out ${r.stepped_out}, fell ${r.fell}`);
    }
    const [a, b] = reports;
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
