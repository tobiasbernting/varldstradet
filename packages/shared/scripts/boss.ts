// Tuning aid: the boss stop of one run, every mark and fall of the first hero with the time and health.
import { RUN_LEVELS, runOf, type ClassId, type RunLevel, type BotStyle } from '../src/index.ts';
import { makeParty, step } from '../src/runplay.ts';
import { startRun } from '../src/runsim.ts';
const [cls, style, level, seed, nd, me2, bh] = process.argv.slice(2);
if (me2) RUN_LEVELS[Number(level) as RunLevel].markEvery = Number(me2);
if (bh) RUN_LEVELS[Number(level) as RunLevel].bossHp = Number(bh);
const party = makeParty([cls as ClassId], { style: style as BotStyle, seed: Number(seed), lane: 'safe' });
if (nd === '1') for (const m of party.minds.values()) m.noDodge = true;
for (const p of party.players) p.saga!.cleared = ['draug', 'frost', 'surt', 'hel', 'dvarg', 'orm', 'alv', 'fenrir', 'loke'];
startRun(party.world, party.players[0]!.id, { seed: Number(seed), level: Number(level) as RunLevel, dungeon: (process.env.DUNGEON ?? 'draug') as 'draug' }, party.ctx());
const run = runOf(party.world)!;
const me = party.players[0]!.id;
let t0 = 0;
for (let t = 0; t < 40 * 60_000 && run.phase !== 'ended' && run.phase !== 'victory'; t += 50) {
  const out: import('../src/protocol.ts').Change[] = [];
  step(party, true, out);
  const inst = party.world.areas![run.key]?.saga;
  const boss = inst ? inst.mobs[process.env.MINI ? inst.mini : inst.boss] : undefined;
  if (run.plan.stops[run.node]!.kind !== (process.env.MINI ? 'mini' : 'boss') || !boss || boss.state !== 'fight') continue;
  t0 ||= run.elapsed;
  const f = inst!.fighters[me]!;
  for (const c of out) {
    const at = ((run.elapsed - t0) / 1000).toFixed(1).padStart(6);
    if (c.t === 'zone' && c.zone && c.zone.by === boss.id) console.log(`${at} zone ${c.zone.shape} r${c.zone.r} d=${(Math.hypot(c.zone.x - party.players[0]!.x, c.zone.y - party.players[0]!.y) / 16).toFixed(1)}`);
    if (c.t === 'hit' && c.on === me && c.mark) console.log(`${at} MARK ${c.n}  hp ${Math.round(f.hp)}/${f.max} boss ${Math.round((100 * boss.hp) / boss.max)}%`);
    if (c.t === 'spell' && c.by === boss.id && c.spell.startsWith('cast_')) console.log(`${at} ${c.spell}`);
    if (c.t === 'spell' && c.by === me && c.spell === 'potion') console.log(`${at} potion`);
    if (c.t === 'toast' && c.to === me && c.text.includes('har fallit')) console.log(`${at} ${c.text}`);
    if (c.t === 'banner' && c.to === me) console.log(`${at} banner ${c.text}`);
  }
}
console.log(run.outcome ?? run.phase, (run.elapsed / 60000).toFixed(1));
