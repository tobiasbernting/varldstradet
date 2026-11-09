import { describe, expect, it, vi } from 'vitest';
import { DUNGEONS, DUNGEON_IDS, RUN_MAX_MS, RUN_NUDGE_MS, RUN_T, TICK_HZ, TILE, VILLAGE_KEY, addItem, archFrontOf, areaKey, enterCave, fardportOf, getArea, landmarkOfKind, npcState, objectDef, placeIn, runOf, sagaKey, shootOf, type Change, type ServerMsg } from '../../shared/src/index.ts';
import { Game, type Link } from './game.ts';
import { MemoryStore } from './db/store.ts';

const fakeLink = (): Link & { msgs: ServerMsg[]; closed: boolean } => {
  const l = {
    msgs: [] as ServerMsg[],
    closed: false,
    send(m: ServerMsg) {
      l.msgs.push(m);
    },
    close() {
      l.closed = true;
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

    // Astrid hoes the tile in front of her
    const pa = game.world.players[a.id]!;
    ha({ t: 'select', slot: 0 });
    const tx = Math.floor(pa.x / 16) + 1;
    const ty = Math.floor(pa.y / 16);
    game.world.terrain[ty * 64 + tx] = 'grass';
    ha({ t: 'act', tx, ty });
    expect(game.world.terrain[ty * 64 + tx]).toBe('soil');
    expect(lb.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'terrain' && c.x === tx))).toBe(true);

    // A private toast only reaches its recipient
    lb.msgs.length = 0;
    la.msgs.length = 0;
    ha({ t: 'buy', item: 'animal_cow', qty: 1 });
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

  it('caps the number of characters', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    for (let i = 0; i < 8; i++) expect(game.createPlayer(`P${i}`, { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })).not.toBeNull();
    expect(game.createPlayer('P9', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })).toBeNull();
  });
});

describe('cave and dropped connections', () => {
  it('keeps you in the cave through a short disconnect and carries you out after the grace period', async () => {
    vi.useFakeTimers();
    try {
      const game = new Game(new MemoryStore(), { autoStart: false });
      await game.start();
      const a = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })!;
      const la = fakeLink();
      const ha = game.connect(la);
      ha({ t: 'hello', playerId: a.id });
      const pa = game.world.players[a.id]!;
      addItem(pa.inventory, 'sword', 1);
      enterCave(game.world, a.id);
      expect(pa.area).toBe('dungeon');
      // the tablet drops the socket for a moment
      game.disconnect(la);
      expect(pa.online).toBe(false);
      expect(pa.area).toBe('dungeon');
      // ...and comes back: welcome plus the cave map, still inside
      const lb = fakeLink();
      const hb = game.connect(lb);
      hb({ t: 'hello', playerId: a.id });
      expect(pa.area).toBe('dungeon');
      expect(lb.msgs.some((m) => m.t === 'changes' && m.changes.some((c) => c.t === 'areaData' && c.key === 'dungeon'))).toBe(true);
      vi.advanceTimersByTime(120_000);
      expect(pa.area).toBe('dungeon');
      // gone for good: carried out after the grace period
      game.disconnect(lb);
      vi.advanceTimersByTime(60_000);
      expect(pa.area).toBe('dungeon');
      vi.advanceTimersByTime(60_000);
      expect(pa.area).toBe('farm');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Smedjan: forge and craft messages reach Stina, with a toast for a refusal', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    const a = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })!;
    const la = fakeLink();
    const ha = game.connect(la);
    ha({ t: 'hello', playerId: a.id });
    const p = game.world.players[a.id]!;
    p.saga = { cls: 'krigare', chapter: 1, heard: true, cleared: [], titles: [], quests: {}, done: [], found: [], gear: { weapon: 'runsvard' } };
    const toasts = (): string[] => la.msgs.flatMap((m) => (m.t === 'changes' ? m.changes.filter((c): c is Extract<Change, { t: 'toast' }> => c.t === 'toast').map((c) => c.text) : []));
    // at home, far from Stina
    ha({ t: 'saga', a: 'forge', item: 'runsvard' });
    expect(toasts().some((t) => t.includes('Smed-Stina'))).toBe(true);
    // by her side, with what it costs
    const town = getArea(game.world, VILLAGE_KEY)!;
    const st = npcState(town, 'stina');
    placeIn(game.world, p, VILLAGE_KEY, Math.floor(st.x / TILE), Math.floor(st.y / TILE) + 1, 'up', []);
    p.x = st.x;
    p.y = st.y + TILE;
    addItem(p.inventory, 'stone', 14);
    addItem(p.inventory, 'gold', 7);
    p.coins = 100;
    ha({ t: 'saga', a: 'forge', item: 'runsvard' });
    expect(p.saga.forge).toEqual({ runsvard: 1 });
    ha({ t: 'saga', a: 'craft', item: 'jarnsvard' });
    expect(p.inventory.some((s) => s?.item === 'jarnsvard')).toBe(true);
    expect(p.coins).toBe(0);
  });

  it('notes the landmarks a player out in the world comes close to, once a second', async () => {
    const game = new Game(new MemoryStore(), { autoStart: false });
    await game.start();
    const a = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })!;
    const ha = game.connect(fakeLink());
    ha({ t: 'hello', playerId: a.id });
    const p = game.world.players[a.id]!;
    const k = areaKey(0, -1);
    const forest = getArea(game.world, k)!;
    const lm = Object.values(forest.objects).find((o) => landmarkOfKind(o.kind))!;
    const d = objectDef(lm.kind);
    placeIn(game.world, p, k, lm.x + 1, lm.y + d.h, 'up', []);
    for (let i = 0; i < TICK_HZ; i++) game.tick(1000 / TICK_HZ);
    expect(p.saga?.seen).toContain(`${k}:${landmarkOfKind(lm.kind)}`);
  });

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

  it('rolls the day over with the dev message only when DEV_TELEPORT is on, and a watered crop grows', async () => {
    const appearance = { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' };
    const off = new Game(new MemoryStore(), { autoStart: false });
    await off.start();
    const a = off.createPlayer('Astrid', appearance)!;
    const la = fakeLink();
    const ha = off.connect(la);
    ha({ t: 'hello', playerId: a.id });
    la.msgs.length = 0;
    const day0 = off.world.day;
    ha({ t: 'dev', a: 'nextDay' });
    expect(off.world.day).toBe(day0);
    expect(la.msgs.some((m) => m.t === 'error')).toBe(true);

    const on = new Game(new MemoryStore(), { autoStart: false, devTeleport: true });
    await on.start();
    const b = on.createPlayer('Bo', appearance)!;
    const lb = fakeLink();
    const hb = on.connect(lb);
    hb({ t: 'hello', playerId: b.id });
    on.world.crops['3,3'] = { crop: 'carrot', stage: 0, progress: 0, watered: true };
    lb.msgs.length = 0;
    const day1 = on.world.day;
    hb({ t: 'dev', a: 'nextDay' });
    expect(on.world.day).toBe(day1 + 1);
    const changes = lb.msgs.flatMap((m) => (m.t === 'changes' ? m.changes : []));
    expect(changes.some((c) => c.t === 'day' && c.day === day1 + 1)).toBe(true);
    expect(changes.some((c) => c.t === 'crop' && c.k === '3,3')).toBe(true);
    expect(on.world.crops['3,3']!.watered).toBe(false);
    expect(on.world.crops['3,3']!.stage + on.world.crops['3,3']!.progress).toBeGreaterThan(0);
  });

  it('gives the starter set with the dev message only when DEV_TELEPORT is on, and only to someone with a class', async () => {
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
    off.h({ t: 'saga', a: 'class', cls: 'krigare' });
    off.h({ t: 'dev', a: 'starter' });
    expect(has(off.g, off.p.id, 'jarnyxa')).toBe(false);
    expect(off.link.msgs.some((m) => m.t === 'error')).toBe(true);

    const on = await mk(true);
    // no class: nothing
    on.h({ t: 'dev', a: 'starter' });
    expect(has(on.g, on.p.id, 'jarnyxa')).toBe(false);
    // a Krigare gets the axe, the shield and the amulet, once
    on.g.world.players[on.p.id]!.saga = { chapter: 0, heard: false, cleared: [], titles: [], quests: {}, done: [], found: [], cls: 'krigare' };
    on.h({ t: 'dev', a: 'starter' });
    on.h({ t: 'dev', a: 'starter' });
    const inv = on.g.world.players[on.p.id]!.inventory;
    for (const item of ['jarnyxa', 'traskold', 'stenamulett']) expect(inv.filter((s) => s?.item === item).reduce((n, s) => n + s!.count, 0)).toBe(1);
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
    ha({ t: 'fardkost', items: [] });
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
    // a vote: put the party at the vote, one card each
    const inst = game.world.areas![run.key]!.saga!;
    run.phase = 'pick';
    run.offer = { cards: ['p_hjarta', 'p_kraft', 'p_fro'], votes: {}, order: [], until: run.elapsed + 20_000, from: 0 };
    ha({ t: 'run', a: 'pick', card: 1 });
    expect(run.runor).toEqual([]);
    hb({ t: 'run', a: 'pick', card: 1 });
    expect(run.runor).toEqual(['p_kraft']);
    expect(run.phase).toBe('route');
    expect(changesOf(la).some((c) => c.t === 'banner' && c.text.includes('Sagans kraft'))).toBe(true);
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

  it('a run start carries the level: 0 is Lätt, nothing is Vanlig, and a level that is not 0 or 1 starts nothing', async () => {
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
    h({ t: 'run', a: 'start', level: 0 });
    const run = runOf(game.world)!;
    expect(run.level).toBe(0);
    expect(run.spirit).toBe(3);
    expect(changesOf(l).some((c) => c.t === 'run' && c.ev === 'state' && c.run?.level === 0 && c.run.spirit === 3)).toBe(true);
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
