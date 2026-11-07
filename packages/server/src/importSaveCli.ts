// pnpm --filter @lilla-garden/server import-save <dump.sql | postgres://source> [--target postgres://…] [--dry-run]
// See README, "Moving the family's save from lilla-garden".
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { PgStore } from './db/store.ts';
import * as s from './db/schema.ts';
import { ACCESS_TABLES, WORLD_TABLES, emptySource, formatReport, importInto, parseDump, transform, type Sink, type SourceTables, type TableName, type TargetRows } from './importSave.ts';

const USAGE = `Usage: import-save <source> [--target <database url>] [--dry-run]
  <source>   a plain pg_dump file of the lilla-garden database, or its postgres:// URL (read only, never written)
  --target   the new, empty Världsträdet database (default: $TARGET_DATABASE_URL, then $DATABASE_URL)
  --dry-run  print what would be imported and what would be dropped; connects to no target`;

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

/** Sink over a Postgres database: the migrations have been applied, and everything goes in one transaction. */
export function pgSink(url: string): Sink & { close(): Promise<void> } {
  const c = postgres(url, { max: 2, onnotice: () => {} });
  const db = drizzle(c);
  const tables = { world: s.world, objects: s.objects, crops: s.crops, animals: s.animals, players: s.players, areas: s.areas, devices: s.devices, invites: s.invites };
  const chunks = <T>(a: T[], n = 200): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  return {
    async count(t: TableName | 'devices' | 'invites') {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(tables[t]);
      return r?.n ?? 0;
    },
    async writeAll(r: TargetRows) {
      await db.transaction(async (tx) => {
        const w = r.world;
        await tx.insert(s.world).values({ id: 1, day: Number(w.day), timeMs: Number(w.time_ms), nextId: Number(w.next_id), seasonOverride: (w.season_override as string | null) ?? null, terrain: w.terrain as never, drops: w.drops as never, sagaBest: (w.saga_best as never) ?? null, updatedAt: at(w.updated_at) });
        for (const b of chunks(r.objects)) await tx.insert(s.objects).values(b.map((o) => ({ id: Number(o.id), kind: String(o.kind), x: Number(o.x), y: Number(o.y), data: o.data as never })));
        for (const b of chunks(r.crops)) await tx.insert(s.crops).values(b.map((o) => ({ k: String(o.k), data: o.data as never })));
        for (const b of chunks(r.animals)) await tx.insert(s.animals).values(b.map((o) => ({ id: Number(o.id), species: String(o.species), name: String(o.name), data: o.data as never })));
        for (const b of chunks(r.players, 50)) await tx.insert(s.players).values(b.map((o) => ({ id: String(o.id), name: String(o.name), data: o.data as never, createdAt: at(o.created_at) })));
        for (const b of chunks(r.areas, 20)) await tx.insert(s.areas).values(b.map((o) => ({ key: String(o.key), biome: String(o.biome), data: o.data as never, updatedAt: at(o.updated_at) })));
      });
    },
    close: () => c.end({ timeout: 5 }),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const ti = args.indexOf('--target');
  const targetUrl = (ti >= 0 ? args[ti + 1] : undefined) ?? process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;
  const source = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--target');
  if (!source || args.includes('--help')) {
    console.log(USAGE);
    process.exit(source ? 0 : 2);
  }
  const src = /^postgres(ql)?:\/\//.test(source) ? await readLive(source) : parseDump(readFileSync(source, 'utf8'));
  const { rows, report } = transform(src);
  if (dry) {
    console.log(formatReport(report, 'dry-run'));
    return;
  }
  if (!targetUrl) throw new Error('No target database: give --target <url> or set TARGET_DATABASE_URL.');
  if (targetUrl === source) throw new Error('The source and the target are the same database.');
  const store = new PgStore(targetUrl);
  try {
    await store.migrate(); // 0000 … 0004, in order, on the fresh database
  } finally {
    await store.close();
  }
  const sink = pgSink(targetUrl);
  try {
    await importInto(sink, rows);
  } finally {
    await sink.close();
  }
  console.log(formatReport(report, 'imported'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
