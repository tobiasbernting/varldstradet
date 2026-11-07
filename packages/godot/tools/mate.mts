// A second player who stays online (M9b, the family window check): joins the farm over the game socket like a client does, stands
// where the game puts a new player and does nothing, for the number of seconds it is given. The farmer then opens the family
// window (P), must find this player in the list as online and on the farm, and jumps to it from the village.
//
//   node packages/godot/tools/mate.mts <server http url> <seconds>
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const [base, secs] = process.argv.slice(2);
if (!base) throw new Error('usage: mate.mts <http url> <seconds>');
const WebSocket = createRequire(path.join(root, 'packages/server/package.json'))('ws') as typeof import('ws').WebSocket;
const NAME = 'Bot-Syskon';
const list = (await (await fetch(`${base}/api/players`)).json()) as { id: string; name: string }[];
let id = list.find((p) => p.name === NAME)?.id;
if (!id) {
  const made = (await (await fetch(`${base}/api/players`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: NAME, appearance: { skin: '#eccdb0', hair: '#c9a24a', hairStyle: 'short' } }) })).json()) as { id: string };
  id = made.id;
}
const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', playerId: id })));
ws.on('message', () => undefined);
ws.on('error', () => process.exit(1));
setTimeout(() => {
  ws.close();
  process.exit(0);
}, Number(secs ?? 300) * 1000);
