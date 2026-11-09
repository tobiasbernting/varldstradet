import type {
  AnimalState,
  Appearance,
  CropState,
  DropState,
  Facing,
  Outfit,
  PlayerState,
  Quest,
  Season,
  Terrain,
  WeatherState,
  WorldObject,
  WorldState,
} from './types.ts';
import type { DungeonId, SagaBest, SagaZone } from './saga.ts';
import type { SagaSnap } from './sagasim.ts';
import type { IceServer, VoiceState } from './voice.ts';
import type { NodeKind, RunLevel, RunOfferSnap, RunOutcome, RunSnap } from './run.ts';

/** A change to the world that the server broadcasts after applying. `area` marks dungeon changes. */
export type Change =
  | { t: 'terrain'; x: number; y: number; terrain: Terrain; area?: string }
  | { t: 'crop'; k: string; crop: CropState | null; area?: string }
  | { t: 'object'; id: number; obj: WorldObject | null; area?: string }
  | { t: 'animal'; id: number; animal: AnimalState | null; area?: string }
  | { t: 'drop'; id: number; drop: DropState | null; area?: string }
  /** Full player record (inventory, coins, outfit…). Sent to everyone; inventory only matters to the owner. */
  | { t: 'player'; id: string; player: PlayerState | null }
  | { t: 'day'; day: number }
  | { t: 'toast'; to: string | null; text: string }
  | { t: 'open'; to: string; ui: 'chest' | 'catalogue' | 'sell' | 'workbench' | 'wardrobe' | 'nameAnimal' | 'npc' | 'cook' | 'paint' | 'pizzeria' | 'travel' | 'saga' | 'sagaClass' | 'run' | 'seed' | 'houses' | 'kennel'; id?: number; npc?: string }
  | { t: 'quests'; quests: Quest[] }
  | { t: 'fx'; x: number; y: number; kind: 'heart' | 'sparkle' | 'water' | 'chop' | 'poof' | 'coin' | 'hit' | 'arrow' | 'rocket' | 'boom' | 'splash' | 'lasso' | 'honk'; area?: string; from?: { x: number; y: number } }
  /** 2D game: someone said something. `old` marks history sent to a player who just came online. */
  | { t: 'chat'; from: string; name: string; text: string; at: number; old?: boolean }
  /** Sent to one player when they enter another map (full state) or when it is torn down (null). */
  | { t: 'areaData'; to: string; key: string; world: WorldState | null }
  /** The server moved a player within their map (blink, charge, getting up): their client jumps there too. */
  | { t: 'warp'; id: string; x: number; y: number; area?: string }
  /** Dungeons: a spell or a monster's attack, for the picture. `by` is a player id or a monster's animal id. */
  | { t: 'spell'; area: string; by: string | number; spell: string; x: number; y: number; tx?: number; ty?: number; on?: string | number }
  /** Dungeons: a number floating up from a player (id) or a monster (animal id): damage, healing, or a stun or interrupt. */
  | { t: 'hit'; area: string; on: string | number; n: number; kind: 'dmg' | 'heal' | 'crit' | 'block' | 'stun' | 'kick' | 'miss' }
  /** Dungeons: a boss's attack marked on the ground until it lands, or burning ground; null when it is gone. */
  | { t: 'zone'; area: string; id: string; zone: SagaZone | null }
  /** Dungeons: a boss says something to everyone inside. */
  | { t: 'yell'; area: string; name: string; text: string }
  /** Big words across the screen: a dungeon's name, a boss beaten (celebrate!), a new chapter, a rest stone, everyone fallen. */
  | { t: 'banner'; to: string | null; area?: string; text: string; sub?: string; kind?: 'enter' | 'boss' | 'cleared' | 'chapter' | 'reward' | 'rest' | 'wipe' | 'level' }
  /** What a dungeon chest gave you (a loot window in rarity colours). */
  /** A chest's loot for one player; `replay` when it was the smaller replay chest (the full one was taken today). */
  | { t: 'loot'; to: string; from: string; items: { item: string; count: number }[]; coins: number; stars: number; replay?: true }
  /** The family beat its best time through a dungeon (also on the farm WorldState's sagaBest). */
  | { t: 'sagaBest'; dungeon: DungeonId; best: SagaBest }
  /** Hero experience gained (anywhere): the client floats "+n xp" from where the player stood (pixels; area left out on the farm). */
  | { t: 'xp'; to: string; n: number; x: number; y: number; area?: string }
  /**
   * Runs (M5b, GAME.md): the run as it is now (`run` null: none), the three cards being voted on (`offer` null: the vote is
   * over), and how a run ended for one player. `to` null is everyone.
   */
  | { t: 'run'; ev: 'state'; to: string | null; run: RunSnap | null }
  | { t: 'run'; ev: 'offer'; to: string | null; offer: RunOfferSnap | null }
  | { t: 'run'; ev: 'ended'; to: string; outcome: RunOutcome; ms: number; seeds: number; zones: number; runor: string[]; level?: RunLevel; spiritUsed?: number; path?: NodeKind[] }
  /** Runs: one player's sagafrön, the nodes they have planted, and how grown the family's tree is (0..4). */
  | { t: 'seed'; ev: 'tree'; to: string; seeds: number; earned: number; tree: string[]; stage: number }
  /** Runs: the dishes this player has chosen to bring and how many they may bring. */
  | { t: 'fardkost'; to: string; items: string[]; slots: number };

/** A slot in the player's own inventory (chest undefined) or in a chest object. */
export interface SlotRef {
  chest?: number;
  slot: number;
}

export type ClientMsg =
  | { t: 'hello'; playerId: string }
  | { t: 'move'; x: number; y: number; facing: Facing; moving: boolean }
  | { t: 'act'; tx: number; ty: number }
  | { t: 'select'; slot: number }
  | { t: 'swap'; a: SlotRef; b: SlotRef }
  | { t: 'sort'; chest?: number }
  | { t: 'quickStack'; chest: number }
  | { t: 'craft'; recipe: string }
  | { t: 'cook'; recipe: string }
  | { t: 'buy'; item: string; qty: number }
  | { t: 'sell'; slot: number; qty: number }
  | { t: 'equip'; slot: 'hat' | 'shirt' | 'pants' | 'shoes'; item: string | null }
  | { t: 'emote'; id: string }
  | { t: 'honk' }
  | { t: 'drop'; slot: number; qty: number }
  | { t: 'nameAnimal'; id: number; name: string }
  | { t: 'quest'; id: string }
  | { t: 'paint'; pixels: string }
  /** 2D game: tell your pets and horses to stay, or whistle for them. */
  | { t: 'pets'; cmd: 'stay' | 'come' }
  /** The lobby's kennel: take your first pet (free, once): a dog or a cat. */
  | { t: 'pet'; a: 'adopt'; species: string }
  /** The pet in or out (the one button), and which of your pets comes along (not in the middle of a run). */
  | { t: 'pet'; a: 'toggle' }
  | { t: 'pet'; a: 'pick'; id: string }
  /** 2D game: a chat line to everyone. */
  | { t: 'chat'; text: string }
  /** Dungeons: cast a spell at a monster (animal id) or a friend (player id); left out, the server picks. */
  | { t: 'cast'; spell: string; target?: number | string }
  /** Dungeons: drink a healing potion. */
  | { t: 'potion' }
  /** The saga: pick a class at Kämpastenen, hear or hand in Völvan's chapter, take or hand in a villager's quest. */
  | { t: 'saga'; a: 'class'; cls: string }
  | { t: 'saga'; a: 'chapter' }
  | { t: 'saga'; a: 'quest'; id: string }
  /** Gear: put a weapon, an offhand or an amulet from the bag on (null takes it off again, back into the bag). */
  | { t: 'saga'; a: 'equip'; slot: 'weapon' | 'offhand' | 'amulet'; item: string | null }
  /** Smedjan at Smed-Stina: forge a piece one level up, or have her make a piece of the starter set. */
  | { t: 'saga'; a: 'forge'; item: string }
  | { t: 'saga'; a: 'craft'; item: string }
  /** Houses: at the lobby's house door, go into someone's house (`of` a character id, left out: your own); in your own house,
   * pick a piece of furniture up into the bag (and select it, so a tap on the floor puts it down again). */
  | { t: 'house'; a: 'enter'; of?: string }
  | { t: 'house'; a: 'pick'; x: number; y: number }
  /** Röstprat: pick up (want voice) or hang up; make this device the room's speaker; move to a room of your own,
   * back to the automatic room, or into another player's room; a WebRTC signal to another speaker; speaking or not. */
  | { t: 'voice'; a: 'join' }
  | { t: 'voice'; a: 'leave' }
  | { t: 'voice'; a: 'speaker' }
  | { t: 'voice'; a: 'room'; mode: 'auto' | 'alone' | 'with'; with?: string }
  | { t: 'voice'; a: 'signal'; to: string; data: unknown }
  | { t: 'voice'; a: 'talking'; on: boolean }
  /** Development only (the server must run with DEV_TELEPORT=1): straight into a dungeon from wherever you are, as
   * if you had walked through its arch; a player without a class becomes a Krigare first. For the native client,
   * which has no world map yet. The server answers `error` when the switch is off. */
  /**
   * Runs (GAME.md): whoever stands at the färdport starts a run (`replay`: a cleared boss at random instead of the next
   * chapter's; `companion: false` goes without the hired Hirdmannen; `fardkost`: the dishes to bring; `level`: 0 Mycket lätt, 1 Lätt, 2 Medel (which is also what a message without one means), 3 Svår or 4 Extrem), anyone joins or
   * leaves, the party votes on a card of the offer (`card` is its index 0..2) and may ask for a new offer once.
   */
  | { t: 'run'; a: 'start'; replay?: boolean; companion?: boolean; fardkost?: string[]; level?: RunLevel; dungeon?: string }
  | { t: 'run'; a: 'join' }
  | { t: 'run'; a: 'pick'; card: number }
  | { t: 'run'; a: 'reroll' }
  | { t: 'run'; a: 'leave' }
  | { t: 'run'; a: 'state' }
  /** The Yggdrasil shoot: plant a node of the sagaträd with sagafrön, or ask for the tree's state. */
  | { t: 'seed'; a: 'plant'; node: string }
  | { t: 'seed'; a: 'state' }
  /** At the färdport: choose the dishes to bring on the run (item ids from the bag; the server takes them when it starts). */
  | { t: 'fardkost'; items: string[] }
  | { t: 'dev'; a: 'saga'; id: string }
  /** Development only (same switch): the day rolls over now, as the parent page's "skip day" does, so a check can
   * wait for a crop to grow. The server answers `error` when the switch is off. */
  | { t: 'dev'; a: 'nextDay' }
  /** Development only (same switch): win dungeon boss `id`'s trophy at difficulty `level` (0..4), as a run's win would. */
  | { t: 'dev'; a: 'trophy'; id: string; level: number }
  /** Development only (same switch): one of every Norse decor piece, a gear stand and some gear, into the bag. */
  | { t: 'dev'; a: 'decor' }
  /** Development only (same switch): stand on tile (x, y) of the map you are in. */
  | { t: 'dev'; a: 'warp'; x: number; y: number }
  /** Development only (same switch): the starter set Smed-Stina makes (a weapon, a shield, an amulet) for my class, for free. */
  | { t: 'dev'; a: 'starter' }
  /** Development only (same switch): every dungeon before the last counts as cleared, so a check can use a later chapter's arch. */
  | { t: 'dev'; a: 'unlock' }
  /** Development only (same switch): materials and 400 kr for two forge levels and a starter piece, two papers, two buckets of red paint and a run of wall pieces, for a check of the smithy and the paint screen. */
  | { t: 'dev'; a: 'kit' }
  /** Development only (same switch): record this time (ms) as the family's best through dungeon `id`, by me alone, for a check of the journal. */
  | { t: 'dev'; a: 'sagaBest'; id: string; ms: number }
  /** Dev: give pets (`all` or a kind), and put the test gear (a red neckerchief) on the pet or take it off. */
  | { t: 'dev'; a: 'pet'; id: string }
  | { t: 'dev'; a: 'petwear'; item: string | null }
  | { t: 'ping' };

export interface PlayerSnap {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  held: string | null;
  emote?: { id: string; until: number };
  area?: string;
}

export interface NpcSnap {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  area?: string;
}

export interface AnimalSnap {
  id: number;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  area?: string;
}

export type ServerMsg =
  /** `biomes`: the biome of every explored map (for the world map). */
  | { t: 'welcome'; you: string; world: WorldState; season: Season; now: number; tick: number; biomes?: Record<string, string> }
  | { t: 'state'; timeMs: number; day: number; season: Season; players: PlayerSnap[]; animals: AnimalSnap[]; npcs: NpcSnap[]; now: number; weather?: WeatherState; saga?: Record<string, SagaSnap> }
  | { t: 'changes'; changes: Change[] }
  | { t: 'error'; text: string }
  /** Röstprat: the rooms and who speaks for them (to everyone online when it changes), the STUN/TURN servers (to a
   * device that became a speaker), a relayed signal from another speaker, and a room that started or stopped talking. */
  | { t: 'voice'; ev: 'state'; state: VoiceState }
  | { t: 'voice'; ev: 'ice'; servers: IceServer[] }
  | { t: 'voice'; ev: 'signal'; from: string; data: unknown }
  | { t: 'voice'; ev: 'talking'; id: string; on: boolean }
  | { t: 'pong' };

export interface PlayerSummary {
  id: string;
  name: string;
  appearance: Appearance;
  outfit: Outfit;
}
