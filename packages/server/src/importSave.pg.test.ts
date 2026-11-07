// The importer against a real Postgres. Runs when TEST_DATABASE_URL points at a server where the test may create and
// drop databases (CI starts one: .github/workflows/server.yml; locally e.g. postgres://postgres@localhost:5432/postgres).
// Each run makes its own scratch databases and drops them afterwards.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlayerState } from '../../shared/src/index.ts';
import { PgStore } from './db/store.ts';
import { importInto, transform, type SourceTables } from './importSave.ts';
import { pgSink, readLive, runImport } from './importSaveCli.ts';
import { lillaGardenSave } from './importSave.fixture.ts';

const admin = process.env.TEST_DATABASE_URL;
const drizzleDir = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');
const suffix = `${process.pid}_${Date.now()}`;
const urlFor = (db: string): string => {
  const u = new URL(admin!);
  u.pathname = `/${db}`;
  return u.href;
};
const created: string[] = [];
let oldFolder = '';

/** lilla-garden's schema: this repository's migrations without 0004. */
function migrationsUpTo0003(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mig03-'));
  cpSync(drizzleDir, dir, { recursive: true });
  rmSync(join(dir, '0004_remove_minigames.sql'));
  rmSync(join(dir, 'meta/0004_snapshot.json'));
  const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => !e.tag.startsWith('0004'));
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify(journal));
  return dir;
}

async function makeDb(name: string): Promise<string> {
  const db = `vt_${name}_${suffix}`;
  const c = postgres(admin!, { max: 1, onnotice: () => {} });
  await c.unsafe(`create database "${db}"`);
  await c.end();
  created.push(db);
  return urlFor(db);
}

/** A database as the browser game left it (migrations 0000-0003) holding the fixture save. */
async function oldFarm(name: string): Promise<{ url: string; src: SourceTables }> {
  const url = await makeDb(name);
  const c = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(c), { migrationsFolder: oldFolder });
  const { src } = lillaGardenSave();
  const j = (v: unknown): string => JSON.stringify(v);
  const w = src.world[0]!;
  await c`insert into world (id, day, time_ms, next_id, season_override, terrain, drops, saga_best) values (1, ${w.day as number}, ${w.time_ms as number}, ${w.next_id as number}, null, ${j(w.terrain)}::jsonb, ${j(w.drops)}::jsonb, null)`;
  for (const o of src.objects) await c`insert into objects (id, kind, x, y, data) values (${o.id as number}, ${o.kind as string}, ${o.x as number}, ${o.y as number}, ${j(o.data)}::jsonb)`;
  for (const o of src.crops) await c`insert into crops (k, data) values (${o.k as string}, ${j(o.data)}::jsonb)`;
  for (const o of src.animals) await c`insert into animals (id, species, name, data) values (${o.id as number}, ${o.species as string}, ${o.name as string}, ${j(o.data)}::jsonb)`;
  for (const o of src.players) await c`insert into players (id, name, data) values (${o.id as string}, ${o.name as string}, ${j(o.data)}::jsonb)`;
  for (const o of src.areas) await c`insert into areas (key, biome, data) values (${o.key as string}, ${o.biome as string}, ${j(o.data)}::jsonb)`;
  for (const o of src.devices) await c`insert into devices (id, data) values (${o.id as string}, ${j(o.data)}::jsonb)`;
  for (const o of src.invites) await c`insert into invites (id, data) values (${o.id as string}, ${j(o.data)}::jsonb)`;
  await c.end();
  return { url, src };
}

const counts = async (url: string): Promise<Record<string, number>> => {
  const c = postgres(url, { max: 1, onnotice: () => {} });
  const out: Record<string, number> = {};
  for (const t of ['world', 'objects', 'crops', 'animals', 'players', 'areas']) out[t] = Number((await c.unsafe(`select count(*)::int as n from "${t}"`))[0]!.n);
  await c.end();
  return out;
};
const migrationCount = async (url: string): Promise<number> => {
  const c = postgres(url, { max: 1, onnotice: () => {} });
  const n = Number((await c.unsafe('select count(*)::int as n from drizzle.__drizzle_migrations'))[0]!.n);
  await c.end();
  return n;
};
const byKey = (rows: Record<string, unknown>[], key: string) => [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));

describe.runIf(!!admin)('import-save against a real Postgres', () => {
  beforeAll(() => {
    oldFolder = migrationsUpTo0003();
  });
  afterAll(async () => {
    rmSync(oldFolder, { recursive: true, force: true });
    const c = postgres(admin!, { max: 1, onnotice: () => {} });
    for (const db of created) await c.unsafe(`drop database if exists "${db}" with (force)`);
    await c.end();
  });

  it('imports a live source into a fresh target, then the server loads it; a second run is refused', { timeout: 60_000 }, async () => {
    const old = await oldFarm('src1');
    const target = await makeDb('dst1');
    const out: string[] = [];
    await runImport([old.url, '--target', target], (l) => out.push(l));
    expect(out.join('\n')).toContain('Imported.');
    expect(await counts(target)).toMatchObject({ world: 1, players: 3, animals: 3, crops: 1, areas: 1 });
    expect(await migrationCount(target)).toBe(5); // 0000 … 0004
    const c = postgres(target, { max: 1, onnotice: () => {} });
    expect((await c`select count(*)::int as n from objects where kind in ('tv','arcade_hall','prize_counter','rally_garage','plush_cow','lava_lamp')`)[0]!.n).toBe(0);
    expect((await c`select count(*)::int as n from devices`)[0]!.n).toBe(0);
    await c.end();
    // the old database is as it was
    expect((await counts(old.url)).objects).toBe(old.src.objects.length);
    // the real server's loader reads it
    const store = new PgStore(target);
    const world = await store.load();
    expect(Object.values(world.players).map((p) => [p.name, p.coins, p.stars]).sort()).toEqual([['Astrid', 4210, 37], ['Bo', 85, 6], ['Cecilia', 640, 12]]);
    await store.close();
    await expect(runImport([old.url, '--target', target], () => {})).rejects.toThrow(/not empty/);
  });

  it('a failure in the middle of the write leaves the target empty', { timeout: 60_000 }, async () => {
    const old = await oldFarm('src2');
    const target = await makeDb('dst2');
    const store = new PgStore(target);
    await store.migrate();
    await store.close();
    const { rows } = transform(await readLive(old.url));
    rows.areas.push({ key: 'a:9,9', biome: 'skog', data: {}, updated_at: null }, { key: 'a:9,9', biome: 'skog', data: {}, updated_at: null }); // a duplicate key: the last insert fails
    const sink = pgSink(target);
    await expect(importInto(sink, rows)).rejects.toThrow();
    await sink.close();
    expect(await counts(target)).toEqual({ world: 0, objects: 0, crops: 0, animals: 0, players: 0, areas: 0 });
  });

  it('refuses a target that holds a world before it migrates anything', { timeout: 60_000 }, async () => {
    const old = await oldFarm('src3');
    const busy = await oldFarm('busy'); // a database that already has a world, migrated only up to 0003
    expect(await migrationCount(busy.url)).toBe(4);
    await expect(runImport([old.url, '--target', busy.url], () => {})).rejects.toThrow(/not empty/);
    expect(await migrationCount(busy.url)).toBe(4); // 0004 was not applied to it
    await expect(runImport([old.url, '--target', busy.url, '--dry-run'], () => {})).rejects.toThrow(/not empty/);
    await expect(runImport([old.url, '--target', old.url], () => {})).rejects.toThrow(/same database/);
  });

  it('the TS scrub gives the rows migration 0004\'s SQL gives on the same save', { timeout: 60_000 }, async () => {
    const forTs = await oldFarm('src4');
    const forSql = await oldFarm('src5');
    const c = postgres(forSql.url, { max: 1, onnotice: () => {} });
    await migrate(drizzle(c), { migrationsFolder: drizzleDir }); // applies 0004 to the old farm's copy, in place
    await c.end();
    const ts = transform(await readLive(forTs.url)).rows;
    const sql = await readLive(forSql.url);

    expect(byKey(ts.objects, 'id')).toEqual(byKey(sql.objects.map(({ id, kind, x, y, data }) => ({ id, kind, x, y, data })), 'id'));
    expect(ts.world.drops).toEqual(sql.world[0]!.drops);
    expect(byKey(ts.crops, 'k')).toEqual(byKey(sql.crops, 'k'));
    // areas: 0004 deletes Spelhallen's maps; the importer also leaves out saved dungeons (the loader ignores them)
    // (0004's SQL leaves the deleted objects' tiles in a map's `occupancy` index, which the loader rebuilds on every load; the TS scrub removes them, so that index is left out of the comparison)
    const noOccupancy = (a: Record<string, unknown>) => ({ key: a.key, data: { ...(a.data as object), occupancy: undefined } });
    expect(byKey(ts.areas.map(noOccupancy), 'key')).toEqual(byKey(sql.areas.filter((a) => !String(a.key).startsWith('saga:')).map(noOccupancy), 'key'));
    // players: the same, except that the importer also takes someone out of the deleted Spelhallen
    const sqlPlayers = byKey(sql.players.map(({ id, name, data }) => ({ id, name, data: structuredClone(data) as PlayerState })), 'id') as { id: unknown; name: unknown; data: PlayerState }[];
    const tsPlayers = byKey(ts.players.map(({ id, name, data }) => ({ id, name, data: data as PlayerState })), 'id') as { id: unknown; name: unknown; data: PlayerState }[];
    const cecilia = tsPlayers.find((p) => p.name === 'Cecilia')!.data;
    const sqlCecilia = sqlPlayers.find((p) => p.name === 'Cecilia')!.data;
    expect(sqlCecilia.area).toBe('arcade:hall'); // (the SQL leaves her there; the server's loader would not find the map)
    Object.assign(sqlCecilia, { area: cecilia.area, x: cecilia.x, y: cecilia.y });
    for (const p of sqlPlayers) p.data.visited = p.data.visited.filter((k) => !k.startsWith('arcade:'));
    expect(tsPlayers).toEqual(sqlPlayers);
  });
});
