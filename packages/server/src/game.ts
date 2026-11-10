// The running game: world state, connected clients, tick + broadcast loops.
import {
  CHAT_COOLDOWN_MS,
  CHAT_HISTORY,
  DAY_LENGTH_MS,
  callPets,
  castSpell,
  chooseClass,
  devEnterSaga,
  devKit,
  devTrophy,
  devDecor,
  devWarp,
  enterHouse,
  homeKey,
  pickUpFurniture,
  setStandLook,
  equipLook,
  devGrantLooks,
  devSagaBest,
  devUnlockChapters,
  equipGear,
  noticeLandmarks,
  shownHeld,
  drinkPotion,
  isSagaKey,
  isRunKey,
  rejoinRun,
  leaveRun,
  runOf,
  rejoinSaga,
  runMessage,
  devClearStop,
  ensureRunPlaces,
  sagaChapter,
  sagaQuestAct,
  sagaSnapshot,
  cleanChat,
  setWeather,
  T,
  DEFAULT_MAX_PLAYERS,
  NPCS,
  TICK_HZ,
  adoptPet,
  devPet,
  pickPet,
  togglePet,
  devPetGear,
  devPetScare,
  equipPetLook,
  stripPet,
  applyMove,
  areaOf,
  createPlayer,
  emote,
  equip,
  getArea,
  isSeason,
  mulberry32,
  nameAnimal,
  newDay,
  npcState,
  performAction,
  seasonForDate,
  selectSlot,
  setOnline,
  swapSlots,
  sortSlots,
  quickStackToChest,
  tagArea,
  tick,
  type AnimalSnap,
  type NpcSnap,
  type Appearance,
  type Change,
  type ClientMsg,
  type PlayerSnap,
  type PlayerSummary,
  type Season,
  type ServerMsg,
  type WeatherKind,
  type SimCtx,
  type WorldState,
  type IceServer,
  type VoicePolicy,
} from '../../shared/src/index.ts';
import type { Store } from './db/store.ts';
import { Voice } from './voice.ts';

export interface Link {
  send(msg: ServerMsg): void;
  close(code?: number): void;
}

/** The socket was closed because this device or character may not play (any more): the client goes to the gate. */
export const CLOSE_NO_ACCESS = 4003;

/** One character on the parent page. */
export interface CharacterInfo {
  id: string;
  name: string;
  cls: string | null;
  level: number;
  lastPlayed: number | null;
  online: boolean;
}

/** What the server knows about a connection before the player says hello (for the voice rooms). */
export interface ConnInfo {
  /** The visitor's address: devices behind the same one are in the same room. */
  ip?: string;
  /** A guest device (the parent may keep guests out of voice). */
  guest?: boolean;
}

interface Client extends ConnInfo {
  link: Link;
  playerId: string | null;
}

export interface GameOptions {
  seasonOverride?: string | undefined;
  /** Replace timers (tests). */
  autoStart?: boolean;
  /** Röstprat: who may use voice (default everyone, as on a home network) and the STUN/TURN servers (default none). */
  voice?: { policy?: () => VoicePolicy; ice?: () => Promise<IceServer[]> };
  /** DEV_TELEPORT=1: the `dev` message may put a player straight into a dungeon (for a client without a world map). */
  devTeleport?: boolean;
  /** How many characters the server holds (the parent page's setting; default DEFAULT_MAX_PLAYERS). */
  maxPlayers?: () => number;
  /** The highest run level (0..4) a character may play (the parent page's setting; default: all levels). */
  levelCap?: (playerId: string) => number;
}

export class Game {
  world!: WorldState;
  private clients = new Set<Client>();
  private pending: Change[] = [];
  private rnd = mulberry32(Date.now() & 0xffffffff);
  private timers: NodeJS.Timeout[] = [];
  private lastTick = Date.now();
  private flushCounter = 0;
  /** Recent chat lines for players who come online (not saved). */
  private chatLog: Extract<Change, { t: 'chat' }>[] = [];
  private lastChat = new Map<string, number>();
  tickCount = 0;
  /** Röstprat: the rooms, their speakers and the handshake between them. */
  readonly voice: Voice;

  constructor(
    private store: Store,
    private opts: GameOptions = {},
  ) {
    this.voice = new Voice({
      send: (id, msg) => this.sendTo(id, msg),
      name: (id) => this.world?.players[id]?.name,
      policy: opts.voice?.policy ?? (() => 'open'),
      ice: opts.voice?.ice ?? (async () => []),
    });
  }

  async start(): Promise<void> {
    this.world = await this.store.load();
    for (const p of Object.values(this.world.players)) p.online = false;
    // the färdport and the Yggdrasil shoot (a fresh farm, or one from before runs)
    ensureRunPlaces(this.world);
    if (this.opts.autoStart !== false) {
      this.lastTick = Date.now();
      this.timers.push(setInterval(() => this.tick(), 1000 / TICK_HZ));
      this.timers.push(setInterval(() => this.broadcastState(), 100));
      this.timers.push(setInterval(() => void this.flush(), 1000));
    }
  }

  async stop(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const c of this.clients) c.link.close();
    this.store.markAllDirty(this.world);
    await this.store.flush(this.world);
    await this.store.close();
  }

  season(): Season {
    if (this.world.seasonOverride) return this.world.seasonOverride;
    const env = this.opts.seasonOverride;
    if (env && isSeason(env)) return env;
    return seasonForDate(new Date());
  }

  ctx(): SimCtx {
    return { season: this.season(), rnd: this.rnd, now: Date.now(), ...(this.opts.levelCap ? { levelCap: this.opts.levelCap } : {}) };
  }

  // ---- loops ----

  tick(dtOverride?: number): void {
    const now = Date.now();
    const dt = dtOverride ?? Math.min(250, now - this.lastTick);
    this.lastTick = now;
    this.tickCount++;
    const changes = tick(this.world, dt, this.ctx());
    // once a second: the landmarks each player out in the world has come within sight of (for the world map)
    if (this.tickCount % TICK_HZ === 0) changes.push(...noticeLandmarks(this.world));
    if (changes.length) this.pending.push(...changes);
    this.dispatchPending();
    if (++this.flushCounter % (TICK_HZ * 15) === 0 && 'markMoving' in this.store) {
      (this.store as unknown as { markMoving(w: WorldState): void }).markMoving(this.world);
    }
  }

  broadcastState(): void {
    if (this.clients.size === 0) return;
    const players: PlayerSnap[] = [];
    for (const p of Object.values(this.world.players)) {
      if (!p.online) continue;
      const snap: PlayerSnap = { id: p.id, x: p.x, y: p.y, facing: p.facing, moving: p.moving, held: shownHeld(p) };
      if (p.emote) snap.emote = p.emote;
      if (p.area !== 'farm') snap.area = p.area;
      players.push(snap);
    }
    const animals: AnimalSnap[] = Object.values(this.world.animals).map((a) => ({ id: a.id, x: a.x, y: a.y, facing: a.facing, moving: a.moving }));
    for (const [k, area] of Object.entries(this.world.areas ?? {})) {
      if (!Object.values(area.players).some((p) => p.online)) continue;
      for (const a of Object.values(area.animals)) animals.push({ id: a.id, x: a.x, y: a.y, facing: a.facing, moving: a.moving, area: k });
    }
    const npcs: NpcSnap[] = [];
    for (const n of Object.values(NPCS)) {
      const k = n.area ?? 'farm';
      const w = k === 'farm' ? this.world : this.world.areas?.[k];
      if (!w) continue;
      if (k !== 'farm' && !Object.values(w.players).some((p) => p.online)) continue;
      const st = npcState(w, n.id);
      npcs.push({ id: n.id, x: st.x, y: st.y, facing: st.facing, moving: st.moving, ...(k !== 'farm' ? { area: k } : {}) });
    }
    const msg: ServerMsg = { t: 'state', timeMs: this.world.timeMs, day: this.world.day, season: this.season(), players, animals, npcs, now: Date.now() };
    if (this.world.weather) msg.weather = this.world.weather;
    const saga = sagaSnapshot(this.world, Date.now());
    if (saga) msg.saga = saga;
    this.broadcast(msg);
  }

  async flush(): Promise<void> {
    try {
      await this.store.flush(this.world);
    } catch (e) {
      console.error('flush failed', e);
    }
  }

  /** Sends queued changes; private ones only to their recipient. */
  private dispatchPending(): void {
    if (this.pending.length === 0) return;
    const changes = this.pending;
    this.pending = [];
    this.store.noteChanges(changes);
    const everyone = changes.filter((c) => !('to' in c) || c.to === null);
    if (everyone.length) this.broadcast({ t: 'changes', changes: everyone });
    const byPlayer = new Map<string, Change[]>();
    for (const c of changes) {
      if ('to' in c && c.to) {
        const list = byPlayer.get(c.to) ?? [];
        list.push(c);
        byPlayer.set(c.to, list);
      }
    }
    for (const [pid, list] of byPlayer) this.sendTo(pid, { t: 'changes', changes: list });
  }

  private broadcast(msg: ServerMsg): void {
    for (const c of this.clients) if (c.playerId) c.link.send(msg);
  }

  private sendTo(playerId: string, msg: ServerMsg): void {
    for (const c of this.clients) if (c.playerId === playerId) c.link.send(msg);
  }

  // ---- players (HTTP) ----

  playerSummaries(): PlayerSummary[] {
    return Object.values(this.world.players)
      .filter((p) => !p.bot)
      .map((p) => ({ id: p.id, name: p.name, appearance: p.appearance, outfit: p.outfit }));
  }

  /** How many characters the server holds. */
  maxPlayers(): number {
    return this.opts.maxPlayers?.() ?? DEFAULT_MAX_PLAYERS;
  }

  /** No room for another character. */
  full(): boolean {
    return Object.values(this.world.players).filter((p) => !p.bot).length >= this.maxPlayers();
  }

  createPlayer(name: string, appearance: Appearance, shirt?: string): PlayerSummary | null {
    if (this.full()) return null;
    const p = createPlayer(this.world, name, appearance, shirt);
    this.pending.push({ t: 'player', id: p.id, player: p });
    this.dispatchPending();
    return { id: p.id, name: p.name, appearance: p.appearance, outfit: p.outfit };
  }

  /** The parent page's list of characters. */
  characters(): CharacterInfo[] {
    return Object.values(this.world.players)
      .filter((p) => !p.bot)
      .map((p) => ({ id: p.id, name: p.name, cls: p.saga?.cls ?? null, level: p.saga?.level ?? 1, lastPlayed: p.lastPlayed ?? null, online: p.online }));
  }

  /** The parent page: a new name for a character (false: no such character or an empty name). */
  renamePlayer(id: string, name: string): boolean {
    const p = this.world.players[id];
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!p || p.bot || !clean) return false;
    p.name = clean;
    this.pending.push({ t: 'player', id, player: p });
    this.dispatchPending();
    return true;
  }

  /** The parent page: removes a character for good. They leave a run they are in, and their connection is closed (4003). */
  deletePlayer(id: string): boolean {
    const p = this.world.players[id];
    if (!p || p.bot) return false;
    this.pending.push(...leaveRun(this.world, id, this.ctx()));
    this.voice.offline(id);
    for (const c of [...this.clients]) {
      if (c.playerId !== id) continue;
      c.playerId = null;
      this.clients.delete(c);
      c.link.close(CLOSE_NO_ACCESS);
    }
    for (const a of Object.values(this.world.areas ?? {})) delete a.players[id];
    if (this.world.dungeon) delete this.world.dungeon.players[id];
    delete this.world.players[id];
    this.chatLog = this.chatLog.filter((c) => c.from !== id);
    this.pending.push({ t: 'player', id, player: null });
    this.dispatchPending();
    return true;
  }

  /** The runs going on (one at a time, for now): which dungeon, which level, who is in it. */
  runStatus(): { boss: string; level: number; phase: string; party: string[] }[] {
    const run = runOf(this.world);
    if (!run || run.phase === 'ended') return [];
    return [{ boss: run.plan.boss, level: run.level, phase: run.phase, party: run.party.map((id) => this.world.players[id]?.name ?? '?') }];
  }

  onlinePlayers(): string[] {
    return Object.values(this.world.players)
      .filter((p) => p.online && !p.bot)
      .map((p) => p.name);
  }

  // ---- admin ----

  setSeasonOverride(season: Season | null): void {
    this.world.seasonOverride = season;
    this.pending.push({ t: 'day', day: this.world.day });
    this.dispatchPending();
    this.broadcastState();
  }

  /** Admin: jump to a time of day (fraction 0..1). */
  setTimeOfDay(fraction: number): void {
    this.world.timeMs = Math.max(0, Math.min(0.99, fraction)) * DAY_LENGTH_MS;
    this.broadcastState();
  }

  /** Admin: change the weather now (it lasts its usual time, then the random pattern goes on). */
  setWeather(kind: WeatherKind): void {
    this.pending.push(...setWeather(this.world, kind, this.ctx(), true));
    this.dispatchPending();
    this.broadcastState();
  }

  skipDay(): void {
    const changes = newDay(this.world, this.ctx());
    this.pending.push(...changes);
    this.dispatchPending();
  }

  // ---- connections ----

  connect(link: Link, info: ConnInfo = {}): (msg: ClientMsg) => void {
    const client: Client = { link, playerId: null, ...info };
    this.clients.add(client);
    return (msg) => this.handle(client, msg);
  }

  disconnect(link: Link): void {
    for (const c of this.clients) {
      if (c.link !== link) continue;
      this.clients.delete(c);
      if (c.playerId && ![...this.clients].some((o) => o.playerId === c.playerId)) {
        const p = this.world.players[c.playerId];
        this.voice.offline(c.playerId);
        if (p) p.lastPlayed = Date.now();
        this.pending.push(...setOnline(this.world, c.playerId, false));
        this.dispatchPending();
      }
    }
  }

  private handle(client: Client, msg: ClientMsg): void {
    if (msg.t === 'ping') {
      client.link.send({ t: 'pong' });
      return;
    }
    if (msg.t === 'hello') {
      const p = this.world.players[msg.playerId];
      if (!p) {
        client.link.send({ t: 'error', text: 'unknown player' });
        return;
      }
      // One device per character: kick the old connection
      for (const other of this.clients) {
        if (other !== client && other.playerId === msg.playerId) {
          other.playerId = null;
          other.link.close();
          this.clients.delete(other);
        }
      }
      client.playerId = msg.playerId;
      const biomes: Record<string, string> = {};
      for (const [k, a] of Object.entries(this.world.areas ?? {})) if (k.startsWith('a:') && a.biome) biomes[k] = a.biome;
      client.link.send({ t: 'welcome', you: p.id, world: { ...this.world, areas: undefined, dungeon: undefined }, season: this.season(), now: Date.now(), tick: this.tickCount, biomes });
      // voice after the welcome: the client starts its voice window over on a welcome, so a state sent before it was lost
      this.voice.online(msg.playerId, client.ip ?? 'local', !!client.guest);
      if (isSagaKey(p.area)) {
        // back in a dungeon: up at its last rest stone (it may have started over meanwhile); in a run: the same, or home if it is over
        this.pending.push(...(isRunKey(p.area) ? rejoinRun(this.world, p.id) : rejoinSaga(this.world, p.id)));
      } else if (p.area !== 'farm') {
        const area = getArea(this.world, p.area);
        if (area) {
          area.players[p.id] = p;
          client.link.send({ t: 'changes', changes: [{ t: 'areaData', to: p.id, key: p.area, world: area }] });
        } else p.area = 'farm';
      }
      p.lastPlayed = Date.now();
      this.pending.push(...setOnline(this.world, p.id, true));
      this.dispatchPending();
      if (this.chatLog.length) client.link.send({ t: 'changes', changes: this.chatLog.map((c) => ({ ...c, old: true })) });
      return;
    }
    const pid = client.playerId;
    if (!pid) return;
    const me = this.world.players[pid];
    if (!me) return;
    const w = areaOf(this.world, me);
    const areaK = me.area;
    let changes: Change[] = [];
    switch (msg.t) {
      case 'move':
        applyMove(w, pid, msg.x, msg.y, msg.facing, msg.moving, Date.now());
        return;
      case 'act':
        changes = tagArea(performAction(w, pid, Math.floor(msg.tx), Math.floor(msg.ty), this.ctx()), areaK);
        break;
      case 'select':
        changes = selectSlot(w, pid, msg.slot);
        break;
      case 'swap':
        changes = swapSlots(w, pid, msg.a, msg.b);
        break;
      case 'sort':
        try {
          changes = sortSlots(w, pid, typeof msg.chest === 'number' && Number.isFinite(msg.chest) ? Math.floor(msg.chest) : undefined);
        } catch (e) {
          console.error('sort failed', e);
          changes = [];
        }
        break;
      case 'quickStack':
        try {
          changes = typeof msg.chest === 'number' && Number.isFinite(msg.chest) ? quickStackToChest(w, pid, Math.floor(msg.chest)) : [];
        } catch (e) {
          console.error('quickStack failed', e);
          changes = [];
        }
        break;
      case 'equip':
        changes = equip(w, pid, msg.slot, msg.item);
        break;
      case 'emote':
        changes = emote(w, pid, msg.id, this.ctx());
        break;
      case 'nameAnimal':
        changes = tagArea(nameAnimal(w, pid, msg.id, String(msg.name ?? '')), areaK);
        break;
      case 'pet':
        if (msg.a === 'adopt') changes = tagArea(adoptPet(this.world, pid, String(msg.species ?? ''), this.ctx()), areaK);
        else if (msg.a === 'toggle') changes = togglePet(this.world, pid);
        else if (msg.a === 'pick') changes = pickPet(this.world, pid, String(msg.id ?? ''));
        else if (msg.a === 'wear') changes = msg.all ? stripPet(this.world, pid, typeof msg.kind === 'string' ? msg.kind : undefined) : equipPetLook(this.world, pid, typeof msg.piece === 'string' ? msg.piece : null, msg.anchor, msg.way, typeof msg.kind === 'string' ? msg.kind : undefined);
        break;
      case 'pets':
        changes = callPets(this.world, pid, msg.cmd, this.ctx());
        break;
      case 'cast':
        changes = castSpell(this.world, pid, String(msg.spell ?? ''), typeof msg.target === 'number' || typeof msg.target === 'string' ? msg.target : undefined, this.ctx());
        break;
      case 'potion':
        changes = drinkPotion(this.world, pid, this.ctx());
        break;
      case 'saga':
        if (msg.a === 'class') changes = chooseClass(this.world, pid, String(msg.cls ?? ''));
        else if (msg.a === 'chapter') changes = sagaChapter(this.world, pid);
        else if (msg.a === 'quest') changes = sagaQuestAct(this.world, pid, String(msg.id ?? ''));
        else if (msg.a === 'equip') changes = equipGear(this.world, pid, String(msg.slot ?? ''), typeof msg.item === 'string' ? msg.item : null);
        break;
      case 'house':
        if (msg.a === 'enter') {
          const of = typeof msg.of === 'string' ? msg.of : pid;
          changes = enterHouse(this.world, pid, of);
          if (changes.length) this.store.noteArea?.(homeKey(of));
        } else if (msg.a === 'pick') changes = tagArea(pickUpFurniture(w, pid, Math.floor(msg.x), Math.floor(msg.y)), areaK);
        break;
      case 'look':
        // Garderoben: a look on or off (free, instant), or one on a gear stand of the player's house
        if (typeof msg.obj === 'number') {
          changes = tagArea(setStandLook(w, pid, msg.obj, typeof msg.piece === 'string' ? msg.piece : null, msg.way), areaK);
          if (changes.length) this.store.noteArea?.(me.area);
        } else changes = equipLook(me, msg.slot, typeof msg.piece === 'string' ? msg.piece : null, msg.way, msg.cls);
        break;
      case 'run':
      case 'seed':
      case 'fardkost':
        changes = runMessage(this.world, pid, msg as unknown as Parameters<typeof runMessage>[2], this.ctx());
        break;
      case 'dev':
        if (!this.opts.devTeleport) {
          client.link.send({ t: 'error', text: T.devTeleportOff });
          return;
        }
        if (msg.a === 'saga') changes = devEnterSaga(this.world, pid, String(msg.id ?? ''));
        else if (msg.a === 'nextDay') this.skipDay();
        else if (msg.a === 'runclear') changes = devClearStop(this.world, pid);
        else if (msg.a === 'unlock') changes = devUnlockChapters(this.world, pid);
        else if (msg.a === 'kit') changes = devKit(this.world, pid);
        else if (msg.a === 'warp') changes = devWarp(this.world, pid, Number(msg.x), Number(msg.y));
        else if (msg.a === 'decor') changes = devDecor(this.world, pid);
        else if (msg.a === 'trophy') changes = devTrophy(this.world, pid, String(msg.id ?? ''), Number(msg.level));
        else if (msg.a === 'pet') changes = devPet(this.world, pid, String(msg.id ?? ''));
        else if (msg.a === 'petscare') changes = devPetScare(this.world, pid, this.ctx().now);
        else if (msg.a === 'petgear') changes = devPetGear(this.world, pid, Number(msg.tier ?? 5), typeof msg.set === 'string' ? msg.set : undefined);
        else if (msg.a === 'looks') changes = devGrantLooks(me, typeof msg.set === 'string' ? msg.set : undefined, Number(msg.tier ?? 5), msg.ways !== false, true, typeof msg.cls === 'string' ? msg.cls : undefined);
        else if (msg.a === 'sagaBest') changes = devSagaBest(this.world, pid, String(msg.id ?? ''), Number(msg.ms));
        break;
      case 'voice':
        this.voice.handle(pid, msg);
        break;
        break;
      case 'chat': {
        const text = cleanChat(msg.text);
        const now = Date.now();
        if (!text || now - (this.lastChat.get(pid) ?? 0) < CHAT_COOLDOWN_MS) return;
        this.lastChat.set(pid, now);
        const line: Extract<Change, { t: 'chat' }> = { t: 'chat', from: pid, name: me.name, text, at: now };
        this.chatLog.push(line);
        if (this.chatLog.length > CHAT_HISTORY) this.chatLog.shift();
        changes = [line];
        break;
      }
    }
    if (changes.length) {
      this.pending.push(...changes);
      this.dispatchPending();
    }
  }
}
