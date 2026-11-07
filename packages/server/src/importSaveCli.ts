// pnpm --filter @lilla-garden/server import-save <dump.sql | postgres://source> --target postgres://… [--dry-run]
// See README, "Moving the family's save from lilla-garden".
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { PgStore } from './db/store.ts';
import * as s from './db/schema.ts';
import { ACCESS_TABLES, WORLD_TABLES, assertEmpty, emptySource, formatReport, importInto, isMain, isPgUrl, parseArgs, parseDump, sameDatabase, transform, type Sink, type SourceTables, type TableCounts, type TableName, type TargetRows, type Tx } from './importSave.ts';

const USAGE = `Usage: import-save <source> --target <database url> [--dry-run]
  <source>   a plain pg_dump file of the lilla-garden database, or its postgres:// URL (read only, never written)
  --target   the new, empty Världsträdet database; always explicit (never $DATABASE_URL, which may be the running farm)
  --dry-run  print what would be imported and what would be dropped; with --target it also checks that the target
             is not the source and is empty, and writes nothing`;

/** Reads a live source inside a READ ONLY transaction. Tables or columns an older source lacks come back empty/missing. */
export async function readLive(url: string): Promise<SourceTables> {
  const c = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const out = emptySource();
    await c.begin('read only', async (tx) => {
      for (const t of [...Object.keys(WORLD_TABLES), ...ACCESS_TABLES]) {
        const found = await tx`select to_regclass(${`public.${t}`}) is not null as exists`;
        if (!found[0]?.exists) continue;
        (out as Record<string, unknown[]>)[t] = (await tx.unsafe(`select * from "${t}"`)) as unknown[];
      }
    });
    return out;
  } finally {
    await c.end({ timeout: 5 });
  }
}

const at = (v: unknown): Date => (v instanceof Date ? v : v ? new Date(String(v)) : new Date());

const TABLES = { world: s.world, objects: s.objects, crops: s.crops, animals: s.animals, players: s.players, areas: s.areas };
const chunks = <T>(a: T[], n = 200): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Sink over a Postgres database. */
export function pgSink(url: string): Sink & { close(): Promise<void> } {
  const c = postgres(url, { max: 2, onnotice: () => {} });
  const db = drizzle(c);
  return {
    async preflight() {
      const out = {} as TableCounts;
      for (const t of Object.keys(WORLD_TABLES) as TableName[]) {
        const found = await c`select to_regclass(${`public.${t}`}) is not null as exists`;
        out[t] = found[0]?.exists ? Number((await c.unsafe(`select count(*)::int as n from "${t}"`))[0]?.n ?? 0) : null;
      }
      return out;
    },
    async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => {
        // nobody else writes the world tables until this commits: the emptiness check and the insert are one step
        await tx.execute(sql`lock table world, objects, crops, animals, players, areas in exclusive mode`);
        return fn({
          async count(t: TableName) {
            const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(TABLES[t]);
            return r?.n ?? 0;
          },
          async insertAll(r: TargetRows) {
            const w = r.world;
            await tx.insert(s.world).values({ id: 1, day: Number(w.day), timeMs: Number(w.time_ms), nextId: Number(w.next_id), seasonOverride: (w.season_override as string | null) ?? null, terrain: w.terrain as never, drops: w.drops as never, sagaBest: (w.saga_best as never) ?? null, updatedAt: at(w.updated_at) });
            for (const b of chunks(r.objects)) await tx.insert(s.objects).values(b.map((o) => ({ id: Number(o.id), kind: o.kind as string, x: Number(o.x), y: Number(o.y), data: o.data as never })));
            for (const b of chunks(r.crops)) await tx.insert(s.crops).values(b.map((o) => ({ k: String(o.k), data: o.data as never })));
            for (const b of chunks(r.animals)) await tx.insert(s.animals).values(b.map((o) => ({ id: Number(o.id), species: String(o.species), name: String(o.name), data: o.data as never })));
            for (const b of chunks(r.players, 50)) await tx.insert(s.players).values(b.map((o) => ({ id: String(o.id), name: String(o.name), data: o.data as never, createdAt: at(o.created_at) })));
            for (const b of chunks(r.areas, 20)) await tx.insert(s.areas).values(b.map((o) => ({ key: String(o.key), biome: String(o.biome), data: o.data as never, updatedAt: at(o.updated_at) })));
          },
        });
      });
    },
    close: () => c.end({ timeout: 5 }),
  };
}

/**
 * A relative dump path is the one the user typed where they ran the command. `pnpm --filter … import-save` runs the tool inside
 * packages/server, so pnpm's INIT_CWD (the directory the user ran pnpm from) is what it is relative to; without it, the cwd.
 * A database URL and an absolute path are left as they are.
 */
export function resolveSource(source: string, env: { INIT_CWD?: string } = process.env, cwd: string = process.cwd()): string {
  if (isPgUrl(source)) return source;
  return resolve(env.INIT_CWD || cwd, source);
}

/**
 * The whole run. Order matters: the source is read, the target is looked at (read only) and refused if it is the
 * source or holds a world, and only then is anything migrated or written.
 */
export async function runImport(argv: string[], log: (line: string) => void = console.log): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) return log(USAGE);
  if (args.target && isPgUrl(args.source) && sameDatabase(args.source, args.target)) throw new Error('The source and the target are the same database.');
  const src = isPgUrl(args.source) ? await readLive(args.source) : parseDump(readFileSync(resolveSource(args.source), 'utf8'));
  const { rows, report } = transform(src);
  const checkTarget = async (): Promise<void> => {
    const sink = pgSink(args.target!);
    try {
      assertEmpty(await sink.preflight());
    } finally {
      await sink.close();
    }
  };
  if (args.dry) {
    log(formatReport(report, 'dry-run'));
    if (!args.target) return log('No --target given: the target database was not checked.');
    await checkTarget();
    return log('The target database is a different database and is empty (or not migrated yet): the import would run.');
  }
  await checkTarget(); // before the migrations: a database that holds a world is never touched
  const store = new PgStore(args.target!);
  try {
    await store.migrate(); // 0000 … 0004, in order, on the fresh database
  } finally {
    await store.close();
  }
  const sink = pgSink(args.target!);
  try {
    await importInto(sink, rows);
  } finally {
    await sink.close();
  }
  log(formatReport(report, 'imported'));
}

if (isMain(import.meta.url, process.argv[1])) {
  runImport(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
