import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_PLAYERS, DUNGEONS, DUNGEON_IDS, RUN_MAX_MS, RUN_NUDGE_MS, RUN_T, TILE, archFrontOf, fardportOf, runOf, sagaKey, shootOf, type Change, type ServerMsg } from '../../shared/src/index.ts';
import { Game, type Link } from './game.ts';
import { MemoryStore } from './db/store.ts';

const fakeLink = (): Link & { msgs: ServerMsg[]; closed: boolean; closeCode?: number } => {
  const l = {
    msgs: [] as ServerMsg[],
    closed: false,
    send(m: ServerMsg) {
      l.msgs.push(m);
    },
    closeCode: undefined as number | undefined,
    close(code?: number) {
      l.closed = true;
      l.closeCode = code;
    },
  };
  return l;
};

describe('Game', () => {
  it('creates players, welcomes them, runs actions and broadcasts', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false, seasonOverride: 'jul' });
    await game.start();
    expect(game.season()).toBe('jul');
    const a = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' }, 'shirt_red')!;
    const b = game.createPlayer('Bo', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'long' })!;
    expect(game.playerSummaries().map((p) => p.name)).toEqual(['Astrid', 'Bo']);

    const la = fakeLink();
    const ha = game.connect(la);
    ha({ t: 'hello', playerId: a.id });
    const welcome = la.msgs.find((m) => m.t === 'welcome');
    expect(welcome && welcome.t === 'welcome' && welcome.you).toBe(a.id);
    expect(game.onlinePlayers()).toEqual(['Astrid']);
    // the voice state comes after the welcome (the client starts its 📞 window over on a welcome)
    const iWelcome = la.msgs.findIndex((m) => m.t === 'welcome');
    const iVoice = la.msgs.findIndex((m) => m.t === 'voice' && m.ev === 'state');
    expect(iVoice).toBeGreaterThan(iWelcome);

    const lb = fakeLink();
    const hb = game.connect(lb);
    hb({ t: 'hello', playerId: b.id });
    // Both see Bo coming online
    expect(la.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'player' && c.id === b.id))).toBe(true);

    // Astrid takes a first pet at the kennel; everyone sees the animal
    const pa = game.world.players[a.id]!;
    const kennel = Object.values(game.world.objects).find((o) => o.kind === 'kennel')!;
    pa.x = (kennel.x + 1) * 16;
    pa.y = (kennel.y + 3) * 16;
    ha({ t: 'pet', a: 'adopt', species: 'dog' });
    expect(Object.values(game.world.animals).map((x) => [x.species, x.owner])).toEqual([['dog', a.id]]);
    expect(lb.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'animal'))).toBe(true);
    // the farm's old messages do nothing any more: nothing is bought
    ha({ t: 'buy' as never, item: 'animal_cow', qty: 1 } as never);
    expect(pa.coins).toBe(150);

    // A private toast only reaches its recipient
    lb.msgs.length = 0;
    la.msgs.length = 0;
    ha({ t: 'pet', a: 'adopt', species: 'cat' });
    expect(la.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'toast'))).toBe(true);
    expect(lb.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'toast'))).toBe(false);

    // Tick and state broadcast
    game.tick(50);
    game.broadcastState();
    const state = lb.msgs.find((m) => m.t === 'state');
    expect(state && state.t === 'state' && state.players.length).toBe(2);

    // Same character from a second device kicks the first
    const la2 = fakeLink();
    const ha2 = game.connect(la2);
    ha2({ t: 'hello', playerId: a.id });
    expect(la.closed).toBe(true);
    game.disconnect(la);
    expect(game.onlinePlayers().length).toBe(2);
    game.disconnect(la2);
    expect(game.onlinePlayers()).toEqual(['Bo']);

    // Admin
    game.setSeasonOverride('pask');
    expect(game.season()).toBe('pask');
    game.setSeasonOverride(null);
    expect(game.season()).toBe('jul');
    const day = game.world.day;
    game.skipDay();
    expect(game.world.day).toBe(day + 1);
    await game.stop();
  });

  it('caps the number of characters at 20 by default', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    expect(game.maxPlayers()).toBe(DEFAULT_MAX_PLAYERS);
    for (let i = 0; i < DEFAULT_MAX_PLAYERS; i++) expect(game.createPlayer(`P${i}`, { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })).not.toBeNull();
    expect(game.full()).toBe(true);
    expect(game.createPlayer('One more', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })).toBeNull();
  });

  it("follows the parent page's limit, read each time a character is made", async () => {
    let max = 2;
    const game = new Game(new MemoryStore(), { autoStart: false, maxPlayers: () => max });
    await game.start();
    const look = { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' };
    expect(game.createPlayer('A', look)).not.toBeNull();
    expect(game.createPlayer('B', look)).not.toBeNull();
    expect(game.createPlayer('C', look)).toBeNull();
    max = 3;
    expect(game.createPlayer('C', look)).not.toBeNull();
    // lowering it below the number of characters removes nobody, it only stops new ones
    max = 1;
    expect(Object.keys(game.world.players)).toHaveLength(3);
    expect(game.full()).toBe(true);
  });
});

describe('the lobby and dropped connections', () => {
  it('puts a player straight into a dungeon with the dev message only when DEV_TELEPORT is on', async () => {
    const appearance = { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' };
    // off (the default): the message is refused with an error and nothing moves
    const off = new Game(new MemoryStore(), { autoStart: false });
    await off.start();
    const a = off.createPlayer('Astrid', appearance)!;
    const la = fakeLink();
    const ha = off.connect(la);
    ha({ t: 'hello', playerId: a.id });
    la.msgs.length = 0;
    ha({ t: 'dev', a: 'saga', id: 'draug' });
    expect(off.world.players[a.id]!.area).toBe('farm');
    expect(la.msgs.some((m) => m.t === 'error')).toBe(true);
    expect(off.world.areas?.[sagaKey('draug')]).toBeUndefined();

    // on: the dungeon is generated the normal way, the player (made a Krigare) stands at its start, and the client
    // gets the map (areaData), the player record and the dungeon's banner
    const on = new Game(new MemoryStore(), { autoStart: false, devTeleport: true });
    await on.start();
    const b = on.createPlayer('Bo', appearance)!;
    const lb = fakeLink();
    const hb = on.connect(lb);
    hb({ t: 'hello', playerId: b.id });
    lb.msgs.length = 0;
    hb({ t: 'dev', a: 'saga', id: 'draug' });
    const key = sagaKey('draug');
    const pb = on.world.players[b.id]!;
    expect(pb.area).toBe(key);
    expect(pb.saga?.cls).toBe('krigare');
    const area = on.world.areas?.[key];
    expect(area?.saga?.id).toBe('draug');
    expect(Math.floor(pb.x / TILE)).toBe(area!.saga!.start.x);
    expect(Math.floor(pb.y / TILE)).toBe(area!.saga!.start.y);
    expect(area!.saga!.fighters[b.id]).toBeDefined();
    expect(Object.keys(area!.saga!.mobs).length).toBeGreaterThan(10);
    const changes = lb.msgs.flatMap((m) => (m.t === 'changes' ? m.changes : []));
    expect(changes.some((c) => c.t === 'areaData' && c.key === key && c.world?.terrain.length === 64 * 64)).toBe(true);
    expect(changes.some((c) => c.t === 'player' && c.id === b.id && c.player?.area === key)).toBe(true);
    expect(changes.some((c) => c.t === 'banner' && c.text === DUNGEONS.draug.name)).toBe(true);
    // the monsters are in the state snapshots for the one inside
    lb.msgs.length = 0;
    on.broadcastState();
    const state = lb.msgs.find((m) => m.t === 'state');
    expect(state && state.t === 'state' && state.animals.filter((an) => an.area === key).length).toBe(Object.keys(area!.animals).length);
    // a bad id does nothing
    hb({ t: 'dev', a: 'saga', id: 'nope' });
    expect(on.world.players[b.id]!.area).toBe(key);
  });

  it('grants looks with the dev message only when DEV_TELEPORT is on, and wears them through the look message', async () => {
    const appearance = { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' };
    const mk = async (devTeleport: boolean) => {
      const g = new Game(new MemoryStore(), { autoStart: false, devTeleport });
      await g.start();
      const p = g.createPlayer('Kåre', appearance)!;
      const link = fakeLink();
      const h = g.connect(link);
      h({ t: 'hello', playerId: p.id });
      link.msgs.length = 0;
      return { g, p, link, h };
    };
    const has = (g: Game, id: string, item: string) => g.world.players[id]!.inventory.some((s) => s?.item === item);
    const off = await mk(false);
    off.h({ t: 'dev', a: 'looks' });
    expect(off.g.world.players[off.p.id]!.saga?.looks).toBeUndefined();
    expect(off.link.msgs.some((m) => m.t === 'error')).toBe(true);

    const on = await mk(true);
    on.h({ t: 'dev', a: 'looks', set: 'bjornbarsark', tier: 3 });
    const prog = on.g.world.players[on.p.id]!.saga!;
    expect(prog.looks?.bjornbarsark_axe ?? prog.looks?.bjornbarsark_weapon).toEqual({ tier: 3 });
    // wearing it goes through the look message and reaches the outfit everyone sees
    on.h({ t: 'saga', a: 'class', cls: 'krigare' });
    on.h({ t: 'look', slot: 'hat', piece: 'bjornbarsark_hat', cls: 'krigare' });
    expect(on.g.world.players[on.p.id]!.outfit.looks?.hat).toBe('bjornbarsark_hat|3|');
  });
});

describe('the dev switch for later chapters', () => {
  const appearance = { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' as const };
  const mk = async (devTeleport: boolean) => {
    const g = new Game(new MemoryStore(), { autoStart: false, devTeleport });
    await g.start();
    const p = g.createPlayer('Kåre', appearance)!;
    const link = fakeLink();
    const h = g.connect(link);
    h({ t: 'hello', playerId: p.id });
    return { g, p, link, h };
  };

  it('`dev unlock` marks the earlier dungeons cleared only with DEV_TELEPORT on and a class chosen', async () => {
    const off = await mk(false);
    off.h({ t: 'saga', a: 'class', cls: 'krigare' });
    off.h({ t: 'dev', a: 'unlock' });
    expect(off.g.world.players[off.p.id]!.saga!.cleared).toEqual([]);
    expect(off.link.msgs.some((m) => m.t === 'error')).toBe(true);

    const on = await mk(true);
    on.h({ t: 'dev', a: 'unlock' }); // no class yet: nothing
    expect(on.g.world.players[on.p.id]!.saga?.cleared ?? []).toEqual([]);
    on.h({ t: 'saga', a: 'class', cls: 'krigare' });
    on.h({ t: 'dev', a: 'unlock' });
    on.h({ t: 'dev', a: 'unlock' });
    expect(on.g.world.players[on.p.id]!.saga!.cleared).toEqual(DUNGEON_IDS.slice(0, -1));
  });
});

describe('runs over the socket', () => {
  const look = { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' as const };
  const changesOf = (l: ReturnType<typeof fakeLink>): Change[] => l.msgs.flatMap((m) => (m.t === 'changes' ? m.changes : []));

  it('puts the färdport and the shoot on a new farm', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    expect(fardportOf(game.world)).toBeTruthy();
    expect(shootOf(game.world)).toBeTruthy();
    game.createPlayer('Astrid', look);
    expect(game.playerSummaries().map((p) => p.name)).toEqual(['Astrid']);
  });

  it('starts, is joined, votes, loses a connection and ends, with the messages going where they belong', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    const a = game.createPlayer('Astrid', look)!;
    const b = game.createPlayer('Bo', look)!;
    const la = fakeLink();
    const lb = fakeLink();
    const ha = game.connect(la);
    const hb = game.connect(lb);
    ha({ t: 'hello', playerId: a.id });
    hb({ t: 'hello', playerId: b.id });
    const pa = game.world.players[a.id]!;
    const pb = game.world.players[b.id]!;
    for (const [p, cls] of [[pa, 'vaktare'], [pb, 'helare']] as const) p.saga = { cls, chapter: 1, heard: true, cleared: [], titles: [], quests: {}, done: [], found: [] };
    const front = archFrontOf(game.world);
    // far from the arch: told to go there
    pa.x = TILE * 3;
    pa.y = TILE * 3;
    ha({ t: 'run', a: 'start' });
    expect(runOf(game.world)).toBeUndefined();
    expect(changesOf(la).some((c) => c.t === 'toast' && c.text.includes('färdporten'))).toBe(true);
    // at the arch: the run starts, Astrid goes in, Bo stays (he is far away)
    pa.x = TILE * front.x + TILE / 2;
    pa.y = TILE * front.y + TILE / 2;
    pb.x = TILE * 3;
    pb.y = TILE * 3;
    la.msgs.length = 0;
    lb.msgs.length = 0;
    ha({ t: 'run', a: 'start' });
    const run = runOf(game.world)!;
    expect(run).toBeTruthy();
    expect(run.party).toEqual([a.id]);
    expect(pa.area).toBe(run.key);
    // everyone hears the state of the run, only Astrid the banner of the zone
    for (const l of [la, lb]) expect(changesOf(l).some((c) => c.t === 'run' && c.ev === 'state' && c.run?.id === run.id)).toBe(true);
    expect(changesOf(la).some((c) => c.t === 'banner' && c.to === a.id)).toBe(true);
    expect(changesOf(lb).some((c) => c.t === 'banner' && c.to === a.id)).toBe(false);
    // Bo walks to the arch and joins
    pb.x = TILE * front.x + TILE / 2;
    pb.y = TILE * front.y + TILE / 2;
    hb({ t: 'run', a: 'join' });
    expect(run.party).toEqual([a.id, b.id]);
    expect(pb.area).toBe(run.key);
    // the world ticks with the run in it; the snapshot carries the fighters of the zone
    for (let i = 0; i < 40; i++) game.tick(50);
    game.broadcastState();
    const state = [...la.msgs].reverse().find((m) => m.t === 'state');
    expect(state && state.t === 'state' && !!state.saga?.[run.key]).toBe(true);
    // the cards: put the party at them, each with their own three; each picks their own and the run goes on
    const inst = game.world.areas![run.key]!.saga!;
    run.phase = 'pick';
    run.offerFrom = 0;
    run.offerUntil = run.elapsed + 20_000;
    run.offers = { [a.id]: { cards: ['v_hugg', 'v_tjock', 'v_hjarta'], source: 'flock' }, [b.id]: { cards: ['h_runa', 'h_ring', 'h_pil'], source: 'flock' } };
    ha({ t: 'run', a: 'pick', card: 1 });
    expect(run.hold[a.id]).toBeUndefined();
    hb({ t: 'run', a: 'pick', card: 2 });
    expect(run.hold[a.id]).toEqual([{ id: 'v_tjock', up: 0 }]);
    expect(run.hold[b.id]).toEqual([{ id: 'h_pil', up: 0 }]);
    expect(run.phase).toBe('route');
    expect(changesOf(la).some((c) => c.t === 'banner' && c.text.includes('Tjock sköld'))).toBe(true);
    void inst;
    // Bo's connection drops: he is still in the run; he comes back into the zone
    game.disconnect(lb);
    expect(pb.online).toBe(false);
    expect(pb.area).toBe(run.key);
    const lb2 = fakeLink();
    const hb2 = game.connect(lb2);
    hb2({ t: 'hello', playerId: b.id });
    expect(pb.area).toBe(run.key);
    expect(changesOf(lb2).some((c) => c.t === 'areaData' && c.key === run.key)).toBe(true);
    // the clock: at 30 minutes the run goes on, everyone gets the nudge once, and the next one comes ten minutes later
    const nudge = (l: typeof la): number => changesOf(l).filter((c) => c.t === 'banner' && c.text === RUN_T.late).length;
    run.elapsed = RUN_MAX_MS - 60;
    la.msgs.length = 0;
    lb2.msgs.length = 0;
    for (let i = 0; i < 4; i++) game.tick(50);
    expect(runOf(game.world)).toBe(run);
    expect(pa.area).toBe(run.key);
    expect(pb.area).toBe(run.key);
    expect(nudge(la)).toBe(1);
    expect(nudge(lb2)).toBe(1);
    expect(changesOf(la).some((c) => c.t === 'run' && c.ev === 'ended')).toBe(false);
    expect(pa.run!.timeouts).toBe(1);
    la.msgs.length = 0;
    for (let i = 0; i < 20; i++) game.tick(50);
    expect(nudge(la)).toBe(0);
    run.elapsed = RUN_MAX_MS + RUN_NUDGE_MS - 60;
    for (let i = 0; i < 4; i++) game.tick(50);
    expect(nudge(la)).toBe(1);
    expect(pa.run!.timeouts).toBe(1);
    // leaving on your own is the way home: Bo walks home, Ada stays; then Ada leaves too and the run is over
    lb2.msgs.length = 0;
    hb2({ t: 'run', a: 'leave' });
    expect(pb.area).toBe('farm');
    expect(runOf(game.world)).toBe(run);
    la.msgs.length = 0;
    ha({ t: 'run', a: 'leave' });
    expect(pa.area).toBe('farm');
    expect(runOf(game.world)).toBeUndefined();
    expect(changesOf(la).some((c) => c.t === 'run' && c.ev === 'offer' && c.offer === null)).toBe(true);
    // the tree: sagafrön are planted over the socket
    game.world.players[a.id]!.run!.seeds = 30;
    la.msgs.length = 0;
    ha({ t: 'seed', a: 'plant', node: 'h1' });
    expect(game.world.players[a.id]!.run!.tree).toEqual(['h1']);
    expect(changesOf(la).some((c) => c.t === 'seed' && c.ev === 'tree' && c.seeds === 20)).toBe(true);
    ha({ t: 'seed', a: 'state' });
    expect(changesOf(la).filter((c) => c.t === 'seed').length).toBeGreaterThanOrEqual(2);
    await game.stop();
  });

  it('a run start carries the level: 1 is Lätt, nothing is Medel, and a level that is not 0 to 4 starts nothing', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    const a = game.createPlayer('Astrid', look)!;
    const l = fakeLink();
    const h = game.connect(l);
    h({ t: 'hello', playerId: a.id });
    const p = game.world.players[a.id]!;
    p.saga = { cls: 'krigare', chapter: 1, heard: true, cleared: [], titles: [], quests: {}, done: [], found: [] };
    const front = archFrontOf(game.world);
    p.x = TILE * front.x + TILE / 2;
    p.y = TILE * front.y + TILE / 2;
    h({ t: 'run', a: 'start', level: 7 as unknown as 0 });
    h({ t: 'run', a: 'start', level: '0' as unknown as 0 });
    expect(runOf(game.world)).toBeUndefined();
    expect(changesOf(l).some((c) => c.t === 'toast' && c.text === RUN_T.badLevel)).toBe(true);
    h({ t: 'run', a: 'start', level: 1 });
    const run = runOf(game.world)!;
    expect(run.level).toBe(1);
    expect(run.spirit).toBe(3);
    expect(changesOf(l).some((c) => c.t === 'run' && c.ev === 'state' && c.run?.level === 1 && c.run.spirit === 3)).toBe(true);
  });

  it('a run with one player (no longhouse needed) has a companion that is no character: not listed, not counted, gone afterwards', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    const a = game.createPlayer('Astrid', look)!;
    const la = fakeLink();
    const ha = game.connect(la);
    ha({ t: 'hello', playerId: a.id });
    const pa = game.world.players[a.id]!;
    pa.saga = { cls: 'krigare', chapter: 1, heard: true, cleared: [], titles: [], quests: {}, done: [], found: [] };
    const front = archFrontOf(game.world);
    expect(Object.values(game.world.objects).some((o) => o.kind === 'longhall')).toBe(false);
    pa.x = TILE * front.x + TILE / 2;
    pa.y = TILE * front.y + TILE / 2;
    ha({ t: 'run', a: 'start' });
    const run = runOf(game.world)!;
    expect(run.companions).toHaveLength(1);
    expect(game.playerSummaries().map((p) => p.name)).toEqual(['Astrid']);
    expect(game.onlinePlayers()).toEqual(['Astrid']);
    for (let i = 0; i < 100; i++) game.tick(50);
    game.broadcastState();
    const state = [...la.msgs].reverse().find((m) => m.t === 'state');
    expect(state && state.t === 'state' && state.players.length).toBe(2);
    ha({ t: 'run', a: 'leave' });
    expect(runOf(game.world)).toBeUndefined();
    expect(Object.values(game.world.players).some((p) => p.bot)).toBe(false);
    expect(pa.area).toBe('farm');
    await game.stop();
  });
});

describe('the parent page: difficulty caps and characters', () => {
  const look = { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' as const };
  const changesOf = (l: ReturnType<typeof fakeLink>): Change[] => l.msgs.flatMap((m) => (m.t === 'changes' ? m.changes : []));
  const toasts = (l: ReturnType<typeof fakeLink>): string[] => changesOf(l).flatMap((c) => (c.t === 'toast' ? [c.text] : []));

  const setup = async (caps: Record<string, number>) => {
    const game = new Game(new MemoryStore(), { autoStart: false, levelCap: (id) => caps[id] ?? 4 });
    await game.start();
    const a = game.createPlayer('Astrid', look)!;
    const b = game.createPlayer('Bo', look)!;
    const la = fakeLink();
    const lb = fakeLink();
    const ha = game.connect(la);
    const hb = game.connect(lb);
    ha({ t: 'hello', playerId: a.id });
    hb({ t: 'hello', playerId: b.id });
    const pa = game.world.players[a.id]!;
    const pb = game.world.players[b.id]!;
    for (const [p, cls] of [[pa, 'vaktare'], [pb, 'helare']] as const) p.saga = { cls, chapter: 1, heard: true, cleared: [], titles: [], quests: {}, done: [], found: [] };
    const front = archFrontOf(game.world);
    for (const p of [pa, pb]) {
      p.x = TILE * front.x + TILE / 2;
      p.y = TILE * front.y + TILE / 2;
    }
    return { game, a, b, la, lb, ha, hb };
  };

  it('refuses to start a run above the cap of the starter, and allows a lower level', async () => {
    const caps: Record<string, number> = {};
    const s = await setup(caps);
    caps[s.a.id] = 1;
    s.ha({ t: 'run', a: 'start', level: 3 });
    expect(runOf(s.game.world)).toBeUndefined();
    expect(toasts(s.la).some((x) => x.includes('Astrid') && x.includes('Svår'))).toBe(true);
    s.la.msgs.length = 0;
    s.ha({ t: 'run', a: 'start', level: 1, companion: false });
    expect(runOf(s.game.world)?.level).toBe(1);
  });

  it('names everyone who is capped in the party, and refuses a capped joiner', async () => {
    const caps: Record<string, number> = {};
    const s = await setup(caps);
    caps[s.a.id] = 2;
    caps[s.b.id] = 0;
    s.ha({ t: 'run', a: 'start', level: 3 });
    expect(runOf(s.game.world)).toBeUndefined();
    const text = toasts(s.la).join(' ');
    expect(text).toContain('Astrid');
    expect(text).toContain('Bo');
    // Astrid starts Medel; Bo (cap 0) may not join it, then the cap is lifted and he may
    s.game.world.players[s.b.id]!.x = 0;
    s.ha({ t: 'run', a: 'start', level: 2, companion: false });
    const run = runOf(s.game.world)!;
    expect(run.party).toEqual([s.a.id]);
    const front = archFrontOf(s.game.world);
    const pb = s.game.world.players[s.b.id]!;
    pb.x = TILE * front.x + TILE / 2;
    pb.y = TILE * front.y + TILE / 2;
    s.hb({ t: 'run', a: 'join' });
    expect(run.party).toEqual([s.a.id]);
    expect(toasts(s.lb).some((x) => x.includes('Lätt') || x.includes('Mycket lätt'))).toBe(true);
    caps[s.b.id] = 2;
    s.hb({ t: 'run', a: 'join' });
    expect(run.party).toEqual([s.a.id, s.b.id]);
  });

  it('lists, renames and deletes characters, and shows the runs', async () => {
    const s = await setup({});
    const info = s.game.characters().find((c) => c.id === s.a.id)!;
    expect(info).toMatchObject({ name: 'Astrid', cls: 'vaktare', level: 1, online: true });
    expect(info.lastPlayed).toBeGreaterThan(0);
    expect(s.game.renamePlayer(s.a.id, '  Astrid   Ek ')).toBe(true);
    expect(s.game.world.players[s.a.id]!.name).toBe('Astrid Ek');
    expect(s.game.renamePlayer(s.a.id, '   ')).toBe(false);
    s.ha({ t: 'run', a: 'start', level: 1, companion: false });
    expect(s.game.runStatus()).toMatchObject([{ level: 1, party: ['Astrid Ek', 'Bo'] }]);
    expect(s.game.deletePlayer(s.a.id)).toBe(true);
    expect(s.la.closed).toBe(true);
    expect(s.la.closeCode).toBe(4003);
    expect(s.game.world.players[s.a.id]).toBeUndefined();
    expect(s.game.characters().map((c) => c.name)).toEqual(['Bo']);
    expect(runOf(s.game.world)?.party).toEqual([s.b.id]);
    expect(s.game.deletePlayer(s.a.id)).toBe(false);
    s.game.tick(50);
  });
});
