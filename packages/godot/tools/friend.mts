// A second player for the farmer's checks (M4c): joins the same server over the game socket like a client does, chops a
// tree, crafts fences and puts three of them down on the farm, then leaves. The farmer then tries to take one of them
// down with the hammer and must be refused: only the one who built it can (DESIGN.md, Ownership). The friend stays a
// player of the farm after it has gone, which is what the rule needs ("builds whose builder no longer exists on the
// farm can be taken down by anyone").
//
//   node packages/godot/tools/friend.mts <server http url> <report.json>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const [base, reportPath] = process.argv.slice(2);
if (!base || !reportPath) throw new Error('usage: friend.mts <http url> <report.json>');
const WebSocket = createRequire(path.join(root, 'packages/server/package.json'))('ws') as typeof import('ws').WebSocket;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const NAME = 'Bot-Granne';
const TILE = 16;

const list = (await (await fetch(`${base}/api/players`)).json()) as { id: string; name: string }[];
let id = list.find((p) => p.name === NAME)?.id;
if (!id) {
  const made = (await (await fetch(`${base}/api/players`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: NAME, appearance: { skin: '#8d5a32', hair: '#2b2119', hairStyle: 'ponytail' } }) })).json()) as { id: string };
  id = made.id;
}
const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
type Rec = { x: number; y: number; inventory: ({ item: string; count: number } | null)[] };
let world: { players: Record<string, Rec>; objects: Record<string, { id: number; kind: string; x: number; y: number; by?: string }>; terrain: string[]; w?: number } | null = null;
const send = (m: unknown): void => ws.send(JSON.stringify(m));
ws.on('open', () => send({ t: 'hello', playerId: id }));
ws.on('message', (raw: Buffer) => {
  const msg = JSON.parse(raw.toString());
  if (msg.t === 'welcome') world = msg.world;
  if (msg.t === 'changes' && world)
    for (const c of msg.changes) {
      if (c.t === 'player' && c.id === id) world.players[id!] = c.player;
      if (c.t === 'object') {
        if (c.obj) world.objects[c.id] = c.obj;
        else delete world.objects[c.id];
      }
    }
});
const until = async (cond: () => boolean, ms: number): Promise<boolean> => {
  const t = Date.now() + ms;
  while (Date.now() < t) {
    if (cond()) return true;
    await sleep(100);
  }
  return cond();
};
const report = { ok: false, fences: [] as { x: number; y: number }[], note: '' };
try {
  if (!(await until(() => world !== null, 15_000))) throw new Error('no welcome');
  const me = (): Rec => world!.players[id!]!;
  const count = (item: string): number => me().inventory.reduce((n, s) => n + (s && s.item === item ? s.count : 0), 0);
  const slotOf = (item: string): number => me().inventory.findIndex((s) => s && s.item === item);
  const W = world!.w ?? 64;
  const free = (x: number, y: number): boolean => world!.terrain[y * W + x] === 'grass' && !Object.values(world!.objects).some((o) => o.x === x && o.y === y);
  const start = { x: Math.floor(me().x / TILE), y: Math.floor(me().y / TILE) };
  // a tree to chop (any of the three kinds), nearest to where we start
  const trees = Object.values(world!.objects)
    .filter((o) => o.kind === 'tree' || o.kind === 'tree_pine' || o.kind === 'tree_apple')
    .sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
  send({ t: 'select', slot: slotOf('axe') });
  for (const tree of trees.slice(0, 4)) {
    if (count('wood') >= 2) break;
    const stand = [[-1, 0], [1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: tree.x + dx!, y: tree.y + dy! })).find((s) => free(s.x, s.y));
    if (!stand) continue;
    send({ t: 'move', x: stand.x * TILE + 8, y: stand.y * TILE + 8, facing: 'down', moving: false });
    await sleep(250);
    for (let i = 0; i < 8 && world!.objects[tree.id]; i++) {
      send({ t: 'act', tx: tree.x, ty: tree.y });
      await sleep(300);
    }
  }
  if (count('wood') < 2) throw new Error(`only ${count('wood')} wood`);
  send({ t: 'craft', recipe: 'fence' });
  if (!(await until(() => count('fence') >= 3, 5000))) throw new Error('no fences crafted');
  send({ t: 'select', slot: slotOf('fence') });
  // three fences in a row a few tiles east of where players start, standing south of them
  const row = [];
  for (let dx = 4; dx < 14 && row.length < 3; dx++) if (free(start.x + dx, start.y + 2) && free(start.x + dx, start.y + 3)) row.push({ x: start.x + dx, y: start.y + 2 });
  for (const f of row) {
    send({ t: 'move', x: f.x * TILE + 8, y: (f.y + 1) * TILE + 8, facing: 'up', moving: false });
    await sleep(250);
    send({ t: 'act', tx: f.x, ty: f.y });
    await sleep(300);
  }
  report.fences = Object.values(world!.objects).filter((o) => o.kind === 'fence' && o.by === id).map((o) => ({ x: o.x, y: o.y }));
  report.ok = report.fences.length >= 1;
  report.note = `${report.fences.length} fences placed by ${NAME}`;
} catch (e) {
  report.note = String(e);
}
fs.writeFileSync(reportPath, JSON.stringify(report));
console.log(`friend: ${report.note}`);
ws.close();
process.exit(report.ok ? 0 : 1);
