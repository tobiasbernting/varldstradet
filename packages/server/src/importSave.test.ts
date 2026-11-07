import { describe, expect, it } from 'vitest';
import { REMOVED_ITEMS, REMOVED_KINDS, SPAWN, TILE, scrubPlayer, type PlayerState } from '../../shared/src/index.ts';
import { assertEmpty, formatReport, importInto, isMain, parseArgs, parseDump, sameDatabase, transform, type Sink, type SourceTables, type TableCounts, type TableName, type TargetRows, type Tx } from './importSave.ts';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lillaGardenSave } from './importSave.fixture.ts';
import { resolveSource, runImport } from './importSaveCli.ts';

const esc = (v: unknown): string => {
  if (v === null || v === undefined) return '\\N';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
};
/** Writes rows the way `pg_dump` does: a header, COPY blocks with tab-separated escaped fields, \. at the end. */
function toDump(src: SourceTables, tables: (keyof SourceTables)[]): string {
  const out = ['--', '-- PostgreSQL database dump', '--', '', 'SET statement_timeout = 0;', ''];
  for (const t of tables) {
    const rows = src[t];
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]!);
    out.push(`COPY public.${t} (${cols.join(', ')}) FROM stdin;`);
    for (const r of rows) out.push(cols.map((c) => esc(r[c])).join('\t'));
    out.push('\\.', '');
  }
  out.push('--', '-- PostgreSQL database dump complete', '--');
  return out.join('\n');
}

/** An in-memory target with the real sink's contract: the check and the write are one transaction, a throw rolls back. */
const memSink = (existing: Partial<Record<TableName, number>> = {}, failAfter = Infinity): Sink & { written: TargetRows | null } => {
  const s = {
    written: null as TargetRows | null,
    async preflight() {
      return Object.fromEntries((['world', 'objects', 'crops', 'animals', 'players', 'areas'] as const).map((t) => [t, existing[t] ?? null])) as TableCounts;
    },
    async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      let staged: TargetRows | null = null;
      const out = await fn({
        async count(t) {
          return existing[t] ?? 0;
        },
        async insertAll(r) {
          staged = r;
          if (failAfter < Infinity) throw new Error('forced failure mid-write');
        },
      });
      s.written = staged; // (only reached when fn did not throw: otherwise nothing is kept)
      return out;
    },
  };
  return s;
};

const ALL = ['world', 'objects', 'crops', 'animals', 'players', 'areas', 'devices', 'invites', 'settings'] as const;

describe('import of a lilla-garden save', () => {
  it('reads the COPY blocks of a pg_dump back into the same rows, escapes and nulls included', () => {
    const { src } = lillaGardenSave();
    src.players[0]!.name = 'Tab\there\nand \\ back';
    const parsed = parseDump(toDump(src, [...ALL]), );
    expect(parsed.players.map((p) => p.name)).toEqual(['Tab\there\nand \\ back', 'Bo', 'Cecilia']);
    expect(parsed.world[0]!.saga_best).toBeNull();
    expect(parsed.world[0]!.terrain).toEqual(src.world[0]!.terrain);
    expect(parsed.objects).toHaveLength(src.objects.length);
    expect(parsed.areas.map((a) => a.key)).toEqual(['a:-1,-1', 'arcade:hall', 'saga:draug']);
    expect(parsed.devices).toHaveLength(2);
  });

  it('refuses a custom-format dump, a dump without data and a database without a world', () => {
    expect(() => parseDump('PGDMP\u0001\u0002')).toThrow(/custom-format/);
    expect(() => parseDump('CREATE TABLE players ();\nINSERT INTO players VALUES (1);\n')).toThrow(/No COPY blocks/);
    expect(() => transform(parseDump(toDump({ ...lillaGardenSave().src, world: [] }, ['players'])))).toThrow(/no world row/);
  });

  it('keeps players with their coins, stars, saga, pets and bag, and drops the minigames', () => {
    const { src, ids } = lillaGardenSave();
    const before = JSON.stringify(src);
    const { rows, report } = transform(parseDump(toDump(src, [...ALL])));
    const byId = Object.fromEntries(rows.players.map((p) => [p.id as string, p.data as PlayerState]));

    const astrid = byId[ids.astrid]!;
    expect([astrid.coins, astrid.stars]).toEqual([4210, 37]);
    expect(astrid.saga).toMatchObject({ cls: 'krigare', chapter: 2, cleared: ['draug', 'frost'], titles: ['Draugdräparen'] });
    expect(astrid.stats).toEqual({ harvest: 340, chop: 120 });
    expect(astrid.achievements).toEqual(['harvest_1', 'chop_1']);
    expect(astrid).not.toHaveProperty('arcade');
    expect(astrid).not.toHaveProperty('garage');
    expect(astrid.inventory.some((s) => s?.item === 'cart_rally')).toBe(false);
    expect(astrid.inventory.find((s) => s?.item === 'carrot')?.count).toBe(30);
    expect(astrid.visited).toEqual(['farm', 'a:-1,-1']);

    const bo = byId[ids.bo]!;
    expect(bo.inventory.filter((s) => s && REMOVED_ITEMS.has(s.item))).toEqual([]);
    expect(bo.inventory.find((s) => s?.item === 'wheat')?.count).toBe(5);
    expect(bo.saga).toBeUndefined();

    // Cecilia stood inside Spelhallen: now on the farm at the start
    const cecilia = byId[ids.cecilia]!;
    expect([cecilia.area, cecilia.x, cecilia.y]).toEqual(['farm', SPAWN.x * TILE + TILE / 2, SPAWN.y * TILE + TILE / 2]);
    expect(cecilia.coins).toBe(640);
    expect(report.warnings.join()).toContain('Cecilia');

    // animals: the cow, and the dog and the cat that follow their owners
    expect(rows.animals.map((a) => a.species).sort()).toEqual(['cat', 'cow', 'dog']);
    expect(rows.animals.filter((a) => (a.data as { owner?: string }).owner).map((a) => [a.name, (a.data as { owner: string }).owner])).toEqual([['Fido', ids.astrid], ['Misse', ids.bo]]);
    expect(report.pets).toBe(2);
    expect(rows.crops).toHaveLength(1);

    // the world: the barn and the chest stay, the six pieces of minigame decor go, the chest loses its prize
    const kinds = rows.objects.map((o) => o.kind as string);
    expect(kinds).toContain('barn');
    expect(kinds.filter((k) => REMOVED_KINDS.has(k))).toEqual([]);
    const chest = rows.objects.find((o) => o.kind === 'chest')!;
    expect((chest.data as { items: unknown[] }).items.slice(0, 2)).toEqual([null, { item: 'carrot', count: 12 }]);
    expect(Object.values(rows.world.drops as Record<string, { item: string }>).map((d) => d.item)).toEqual(['wood']);
    expect(rows.world).toMatchObject({ id: 1, day: 41, time_ms: 123456 });

    // areas: the explored map loses the neon sign and the disco ball, Spelhallen and the dungeon are not copied
    expect(rows.areas.map((a) => a.key)).toEqual(['a:-1,-1']);
    const area = rows.areas[0]!.data as { objects: Record<string, { kind: string }>; drops: Record<string, unknown> };
    expect(Object.values(area.objects).some((o) => REMOVED_KINDS.has(o.kind))).toBe(false);
    expect(Object.keys(area.drops)).toEqual([]);

    expect(report.removed).toMatchObject({ objects: 6, areaObjects: 1, drops: 1, areas: 1 });
    expect(report.removed.bagSlots).toBe(3);
    expect(report.removed.playerFields).toBe(1); // Astrid's scores, garage, counters and achievements
    expect(report.skipped).toEqual({ devices: 2, invites: 1, accessSettings: 1, sagaAreas: 1 });
    // the source is never changed
    expect(JSON.stringify(src)).toBe(before);
  });

  it('agrees with what the server would scrub on load: nothing is left for scrubPlayer', () => {
    const { rows } = transform(lillaGardenSave().src);
    for (const p of rows.players) expect(scrubPlayer(p.data as PlayerState)).toBe(false);
  });

  it('prints a dry-run report that names the players and what is not carried over', () => {
    const text = formatReport(transform(lillaGardenSave().src).report, 'dry-run');
    expect(text).toContain('DRY RUN: nothing was written.');
    expect(text).toContain('Astrid: 4210 coins, 37 stars, 1 pets/horses, saga: krigare, chapter 3, 2 dungeons cleared');
    expect(text).toContain('Bo: 85 coins, 6 stars, 1 pets/horses, saga: not started, 2 minigame item(s) leave the bag');
    expect(text).toContain('Not carried over: 2 device(s) and 1 join code(s) and the gate settings');
    expect(text).toContain('new join codes');
    expect(text).toContain('1 player(s) with scores/garage/counters');
  });

  it('writes into an empty target once and refuses a target that already has a world', async () => {
    const { rows } = transform(lillaGardenSave().src);
    const empty = memSink();
    await importInto(empty, rows);
    expect(empty.written).toBe(rows);
    for (const t of ['world', 'players', 'objects', 'areas'] as const) {
      const full = memSink({ [t]: 1 });
      await expect(importInto(full, rows)).rejects.toThrow(new RegExp(`table "${t}" has 1 row`));
      expect(full.written).toBeNull();
    }
  });

  it('keeps nothing when the write fails midway', async () => {
    const { rows } = transform(lillaGardenSave().src);
    const sink = memSink({}, 1);
    await expect(importInto(sink, rows)).rejects.toThrow(/forced failure/);
    expect(sink.written).toBeNull();
  });

  it('lets a table that does not exist yet count as empty, and a filled one not', () => {
    expect(() => assertEmpty({ world: null, objects: null, players: 0 })).not.toThrow();
    expect(() => assertEmpty({ world: null, players: 3 })).toThrow(/"players" has 3/);
  });

  it('needs --target for a real run, takes none for a dry run, and rejects what it does not know', () => {
    expect(() => parseArgs(['dump.sql'])).toThrow(/needs --target/);
    expect(() => parseArgs(['dump.sql', '--target'])).toThrow(/needs a database URL/);
    expect(() => parseArgs(['dump.sql', '--target', 'dump2.sql'])).toThrow(/postgres:\/\/ URL/);
    expect(() => parseArgs(['dump.sql', '--bogus', '--target', 'postgres://h/db'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['a.sql', 'b.sql', '--dry-run'])).toThrow(/one source/);
    expect(() => parseArgs(['--dry-run'])).toThrow(/Give a source/);
    expect(parseArgs(['dump.sql', '--dry-run'])).toMatchObject({ source: 'dump.sql', target: null, dry: true });
    expect(parseArgs(['--target=postgres://h/new', 'dump.sql'])).toMatchObject({ source: 'dump.sql', target: 'postgres://h/new', dry: false });
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('knows the same database by host, port and name, not by the spelling of the URL', () => {
    expect(sameDatabase('postgres://a:b@localhost/garden', 'postgresql://x:y@127.0.0.1:5432/garden?sslmode=disable')).toBe(true);
    expect(sameDatabase('postgres://u@DB.example.se:5432/garden', 'postgres://other@db.example.se/garden')).toBe(true);
    expect(sameDatabase('postgres://u@db/garden', 'postgres://u@db/varldstradet')).toBe(false);
    expect(sameDatabase('postgres://u@db:5432/garden', 'postgres://u@db:5433/garden')).toBe(false);
    expect(sameDatabase('postgres://u@db1/garden', 'postgres://u@db2/garden')).toBe(false);
    expect(() => sameDatabase('postgres://', 'postgres://u@db/x')).toThrow(/valid postgres/);
  });

  it('starts as a script also from a path with spaces or through a symlink, and not when imported', () => {
    const dir = mkdtempSync(join(tmpdir(), 'my games '));
    try {
      const real = join(dir, 'importSaveCli.ts');
      writeFileSync(real, '');
      const link = join(dir, 'link to cli.ts');
      symlinkSync(real, link);
      const url = pathToFileURL(realpathSync(real)).href;
      expect(url).toContain('my%20games');
      expect(isMain(url, real)).toBe(true);
      expect(isMain(url, link)).toBe(true);
      expect(isMain(`file://${real}`, real)).toBe(false); // what the old `file://${argv[1]}` comparison got wrong
      expect(isMain(url, join(dir, 'other.ts'))).toBe(false); // (does not exist)
      expect(isMain(url, undefined)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a dump saved with Windows line ends and does not print NaN for a saga without a chapter', () => {
    const { src } = lillaGardenSave();
    const crlf = toDump(src, [...ALL]).replace(/\n/g, '\r\n');
    const parsed = parseDump(crlf);
    expect(parsed.players.map((p) => p.created_at)).toEqual(src.players.map((p) => p.created_at));
    expect(parsed.settings[0]!.value).toBe(src.settings[0]!.value);
    (src.players[1]!.data as { saga?: unknown }).saga = { cls: 'seare', cleared: [] };
    expect(formatReport(transform(src).report, 'dry-run')).toContain('Bo: 85 coins, 6 stars, 1 pets/horses, saga: seare, chapter 1, 0 dungeons cleared');
  });

  it('a relative dump path is read from where pnpm was run (INIT_CWD), not from packages/server; URLs and absolute paths are untouched', () => {
    expect(resolveSource('lilla-garden.sql', { INIT_CWD: '/home/me/farm' }, '/repo/packages/server')).toBe(resolve('/home/me/farm', 'lilla-garden.sql'));
    expect(resolveSource('../dumps/a.sql', { INIT_CWD: '/home/me/farm' }, '/repo/packages/server')).toBe(resolve('/home/me/dumps/a.sql'));
    expect(resolveSource('lilla-garden.sql', {}, '/somewhere')).toBe(resolve('/somewhere', 'lilla-garden.sql'));
    expect(resolveSource('lilla-garden.sql', { INIT_CWD: '' }, '/somewhere')).toBe(resolve('/somewhere', 'lilla-garden.sql'));
    expect(resolveSource('/abs/dump.sql', { INIT_CWD: '/home/me/farm' }, '/x')).toBe(resolve('/abs/dump.sql'));
    expect(resolveSource('postgres://u@db/garden', { INIT_CWD: '/home/me/farm' }, '/x')).toBe('postgres://u@db/garden');
  });

  it('import-save --dry-run finds a relative dump through INIT_CWD while the process runs somewhere else', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'import-cwd-'));
    const old = process.env.INIT_CWD;
    try {
      writeFileSync(join(dir, 'lilla-garden.sql'), toDump(lillaGardenSave().src, [...ALL]));
      process.env.INIT_CWD = dir; // (the test's cwd is packages/server, which has no such file)
      const out: string[] = [];
      await runImport(['lilla-garden.sql', '--dry-run'], (l) => out.push(l));
      expect(out.join('\n')).toContain('No --target given');
      delete process.env.INIT_CWD;
      await expect(runImport(['lilla-garden.sql', '--dry-run'], () => {})).rejects.toThrow(/ENOENT/);
    } finally {
      if (old === undefined) delete process.env.INIT_CWD;
      else process.env.INIT_CWD = old;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
