// Importing the family's save from the browser game (tobiasbernting/lilla-garden) into a Världsträdet database.
//
// Both games keep the world in the same Postgres tables (the schema is the same lineage; this repository only added
// migration 0004, which removes what the minigames left in a save). The source is read, never written: either a
// plain-format `pg_dump` file (the COPY blocks) or a live database over a READ ONLY transaction. What comes out is
// the same rows with 0004's scrub applied, written to a target database that is migrated first and must be empty.
// The access tables (devices, join codes) and the parent's gate settings are not carried over: a browser's device
// token is a cookie the native client cannot read, so the parent makes new join codes (README, "Moving the family's
// save").
import {
  REMOVED_ACHIEVEMENTS,
  REMOVED_ITEMS,
  REMOVED_KINDS,
  REMOVED_STATS,
  SPAWN,
  TILE,
  isRemovedAreaKey,
  isSagaKey,
  scrubArea,
  scrubPlayer,
  type PlayerState,
  type WorldState,
} from '../../shared/src/index.ts';

/** The tables that hold the world, and the columns the importer reads from each (a column the source lacks is left out). */
export const WORLD_TABLES = {
  world: ['id', 'day', 'time_ms', 'next_id', 'season_override', 'terrain', 'drops', 'saga_best', 'updated_at'],
  objects: ['id', 'kind', 'x', 'y', 'data'],
  crops: ['k', 'data'],
  animals: ['id', 'species', 'name', 'data'],
  players: ['id', 'name', 'data', 'created_at'],
  areas: ['key', 'biome', 'data', 'updated_at'],
} as const;
export type TableName = keyof typeof WORLD_TABLES;
/** The access control's tables: read only to count and report what is not carried over. */
export const ACCESS_TABLES = ['devices', 'invites', 'settings'] as const;
type Row = Record<string, unknown>;
export type SourceTables = Record<TableName, Row[]> & { devices: Row[]; invites: Row[]; settings: Row[] };

/** Columns whose text in a dump is JSON (jsonb) and so is parsed on the way in. */
const JSON_COLUMNS = new Set(['terrain', 'drops', 'saga_best', 'data']);

export const emptySource = (): SourceTables => ({ world: [], objects: [], crops: [], animals: [], players: [], areas: [], devices: [], invites: [], settings: [] });

// ---------------------------------------------------------------------------
// Reading a pg_dump
// ---------------------------------------------------------------------------

/** The text-format escapes of COPY: \\ \n \t \r \b \f \v and \N for null (a field that is exactly \N). */
function unescapeCopy(field: string): string | null {
  if (field === '\\N') return null;
  if (!field.includes('\\')) return field;
  return field.replace(/\\(.)/g, (_, c: string) => ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v' })[c] ?? c);
}

/**
 * Reads the COPY blocks of a plain-format `pg_dump` (the default; `pg_dump -Fc` and `--inserts` dumps are refused
 * with a message). Only the tables of the world are kept; anything else in the dump is skipped.
 */
export function parseDump(text: string): SourceTables {
  if (text.startsWith('PGDMP')) throw new Error('This is a custom-format dump (pg_dump -Fc). Make a plain one: pg_dump --no-owner lilla_garden > dump.sql, or restore it into a scratch database and give the tool that database\'s URL.');
  const out = emptySource();
  const wanted = new Set<string>([...Object.keys(WORLD_TABLES), ...ACCESS_TABLES]);
  const lines = text.split('\n');
  let seenCopy = false;
  for (let i = 0; i < lines.length; i++) {
    const m = /^COPY (?:"?public"?\.)?"?(\w+)"? \(([^)]*)\) FROM stdin;\r?$/.exec(lines[i]!);
    if (!m) continue;
    seenCopy = true;
    const table = m[1]!;
    const cols = m[2]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const keep = wanted.has(table);
    for (i++; i < lines.length && lines[i] !== '\\.' && lines[i] !== '\\.\r'; i++) {
      if (!keep) continue;
      const fields = lines[i]!.split('\t');
      if (fields.length !== cols.length) throw new Error(`${table}: a row has ${fields.length} fields, the COPY header names ${cols.length} (line ${i + 1})`);
      const row: Row = {};
      cols.forEach((c, j) => {
        const v = unescapeCopy(fields[j]!);
        row[c] = v !== null && JSON_COLUMNS.has(c) ? JSON.parse(v) : v;
      });
      (out as Record<string, Row[]>)[table]!.push(row);
    }
  }
  if (!seenCopy) throw new Error('No COPY blocks found. Is this a plain-format pg_dump (with data, not --schema-only, not --inserts)?');
  return out;
}

// ---------------------------------------------------------------------------
// Transforming: the scrub of migration 0004, applied to rows
// ---------------------------------------------------------------------------

export interface PlayerLine {
  id: string;
  name: string;
  coins: number;
  stars: number;
  /** Chapter Völvan is on (1-based as the player sees it), dungeons cleared, class if picked. */
  saga: string;
  pets: number;
  removed: number;
}

export interface Report {
  world: { day: number; objects: number; crops: number; animals: number; areas: number };
  players: PlayerLine[];
  /** Animals that follow a player or are ridden by one (pets and horses) and wild/farm animals in total. */
  pets: number;
  /** Things the scrub took out, by table. */
  removed: { objects: number; bagSlots: number; chestSlots: number; drops: number; areas: number; areaObjects: number; playerFields: number };
  /** Rows of the source that are not imported, and why. */
  skipped: { devices: number; invites: number; accessSettings: number; sagaAreas: number };
  warnings: string[];
}

export interface TargetRows {
  world: Row;
  objects: Row[];
  crops: Row[];
  animals: Row[];
  players: Row[];
  areas: Row[];
}

const pets = (rows: Row[]): number => rows.filter((a) => !!(a.data as { owner?: string }).owner).length;

/** True when a stack in a bag or chest is one of the minigames' items. */
const isRemovedStack = (s: unknown): boolean => !!s && REMOVED_ITEMS.has((s as { item: string }).item);

/** Applies migration 0004 (and what the loader would do for a player inside Spelhallen) to a copy of the source rows. */
export function transform(src: SourceTables): { rows: TargetRows; report: Report } {
  const warnings: string[] = [];
  const w = src.world.find((r) => Number(r.id) === 1) ?? src.world[0];
  if (!w) throw new Error('The source has no world row: it is empty, or this is not a lilla-garden database.');
  if (src.world.length > 1) warnings.push(`the source has ${src.world.length} world rows; row id ${String(w.id)} is used`);

  const removed = { objects: 0, bagSlots: 0, chestSlots: 0, drops: 0, areas: 0, areaObjects: 0, playerFields: 0 };

  // the world's own row: the ground items on the farm
  const drops = Object.fromEntries(
    Object.entries((w.drops ?? {}) as Record<string, { item: string }>).filter(([, d]) => {
      if (!REMOVED_ITEMS.has(d.item)) return true;
      removed.drops++;
      return false;
    }),
  );
  const world: Row = { id: 1, day: Number(w.day), time_ms: Number(w.time_ms), next_id: Number(w.next_id), season_override: w.season_override ?? null, terrain: w.terrain, drops, saga_best: w.saga_best ?? null, updated_at: w.updated_at ?? null };

  const objects: Row[] = [];
  for (const o of src.objects) {
    if (REMOVED_KINDS.has(o.kind as string)) {
      removed.objects++;
      continue;
    }
    const data = structuredClone(o.data) as { items?: unknown[] };
    data.items?.forEach((s, i) => {
      if (!isRemovedStack(s)) return;
      data.items![i] = null;
      removed.chestSlots++;
    });
    objects.push({ id: Number(o.id), kind: o.kind, x: Number(o.x), y: Number(o.y), data });
  }

  const players: Row[] = [];
  const lines: PlayerLine[] = [];
  for (const p of src.players) {
    const data = structuredClone(p.data) as PlayerState;
    const bagBefore = (data.inventory ?? []).filter(isRemovedStack).length;
    const bag = data as unknown as Record<string, unknown>;
    const hadFields = 'arcade' in bag || 'garage' in bag || REMOVED_STATS.some((k) => k in (data.stats ?? {})) || !!data.achievements?.some((a) => REMOVED_ACHIEVEMENTS.includes(a));
    scrubPlayer(data);
    removed.bagSlots += bagBefore;
    if (hadFields) removed.playerFields++;
    // inside Spelhallen when the game stopped: its insides are gone, so the player starts on the farm
    if (isRemovedAreaKey(data.area ?? '')) {
      data.area = 'farm';
      data.x = SPAWN.x * TILE + TILE / 2;
      data.y = SPAWN.y * TILE + TILE / 2;
      warnings.push(`${String(p.name)} was inside Spelhallen: starts on the farm`);
    }
    if (data.visited) data.visited = data.visited.filter((k) => !isRemovedAreaKey(k));
    players.push({ id: p.id, name: p.name, data, created_at: p.created_at ?? null });
    const saga = data.saga;
    lines.push({
      id: String(p.id),
      name: String(p.name),
      coins: data.coins ?? 0,
      stars: data.stars ?? 0,
      saga: saga ? `${saga.cls ?? 'no class'}, chapter ${saga.chapter + 1}, ${saga.cleared?.length ?? 0} dungeons cleared` : 'not started',
      pets: src.animals.filter((a) => (a.data as { owner?: string }).owner === p.id).length,
      removed: bagBefore,
    });
  }

  const areas: Row[] = [];
  let sagaAreas = 0;
  for (const a of src.areas) {
    const key = String(a.key);
    if (isRemovedAreaKey(key)) {
      removed.areas++;
      continue;
    }
    if (isSagaKey(key)) {
      // dungeons are generated for each visit and never kept; the loader ignores such rows
      sagaAreas++;
      continue;
    }
    const data = structuredClone(a.data) as WorldState;
    const before = Object.keys(data.objects ?? {}).length;
    scrubArea(data);
    removed.areaObjects += before - Object.keys(data.objects ?? {}).length;
    areas.push({ key, biome: a.biome, data, updated_at: a.updated_at ?? null });
  }

  const rows: TargetRows = {
    world,
    objects,
    crops: src.crops.map((c) => ({ k: c.k, data: c.data })),
    animals: src.animals.map((a) => ({ id: Number(a.id), species: a.species, name: a.name, data: a.data })),
    players,
    areas,
  };
  const report: Report = {
    world: { day: Number(w.day), objects: objects.length, crops: rows.crops.length, animals: rows.animals.length, areas: areas.length },
    players: lines,
    pets: pets(rows.animals),
    removed,
    skipped: { devices: src.devices.length, invites: src.invites.length, accessSettings: src.settings.filter((s) => s.key === 'access').length, sagaAreas },
    warnings,
  };
  return { rows, report };
}

/** The dry run's text (and the summary after a real run): what is in, what went, what was left behind. */
export function formatReport(r: Report, mode: 'dry-run' | 'imported'): string {
  const out: string[] = [];
  out.push(mode === 'dry-run' ? 'DRY RUN: nothing was written.' : 'Imported.');
  out.push(`World: day ${r.world.day}, ${r.world.objects} objects, ${r.world.crops} crops, ${r.world.animals} animals (${r.pets} follow or belong to a player), ${r.world.areas} explored areas.`);
  out.push(`Players (${r.players.length}):`);
  for (const p of r.players) out.push(`  ${p.name}: ${p.coins} coins, ${p.stars} stars, ${p.pets} pets/horses, saga: ${p.saga}${p.removed ? `, ${p.removed} minigame item(s) leave the bag` : ''}`);
  const x = r.removed;
  out.push(`Minigame leftovers dropped (migration 0004): ${x.objects} farm objects, ${x.areaObjects} objects in explored areas, ${x.bagSlots} bag slots, ${x.chestSlots} chest slots, ${x.drops} items on the ground, ${x.areas} Spelhallen map(s), ${x.playerFields} player(s) with scores/garage/counters.`);
  out.push(`Not carried over: ${r.skipped.devices} device(s) and ${r.skipped.invites} join code(s)${r.skipped.accessSettings ? ' and the gate settings' : ''}${r.skipped.sagaAreas ? `; ${r.skipped.sagaAreas} saved dungeon map(s) (dungeons are made fresh)` : ''}. Make new join codes on the parent page (/admin) for every device.`);
  for (const w of r.warnings) out.push(`Warning: ${w}`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Writing the target
// ---------------------------------------------------------------------------

/** What the importer needs of a target database; the Postgres one is in importSaveCli.ts, tests use a plain object. */
export interface Sink {
  /** Rows already in a table of the target (the import refuses to run unless the world tables are all empty). */
  count(table: TableName | 'devices' | 'invites'): Promise<number>;
  /** Writes everything in one transaction: all of it or none. */
  writeAll(rows: TargetRows): Promise<void>;
}

/** Refuses a target that already has a world, players or objects; otherwise writes the rows. Idempotent in effect: a second run is refused. */
export async function importInto(sink: Sink, rows: TargetRows): Promise<void> {
  const tables: TableName[] = ['world', 'objects', 'crops', 'animals', 'players', 'areas'];
  for (const t of tables) {
    const n = await sink.count(t);
    if (n > 0) throw new Error(`The target database is not empty: table "${t}" has ${n} row(s). The import only writes into a fresh database (use a fresh database, and do not start the new server on it before the import: a first start creates a new world).`);
  }
  await sink.writeAll(rows);
}
