import { describe, expect, it } from 'vitest';
import { REMOVED_ITEMS, REMOVED_KINDS, SPAWN, TILE, scrubPlayer, type PlayerState } from '../../shared/src/index.ts';
import { formatReport, importInto, parseDump, transform, type Sink, type SourceTables, type TableName, type TargetRows } from './importSave.ts';
import { lillaGardenSave } from './importSave.fixture.ts';

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

const memSink = (existing: Partial<Record<TableName | 'devices' | 'invites', number>> = {}): Sink & { written: TargetRows | null } => {
  const s = {
    written: null as TargetRows | null,
    async count(t: TableName | 'devices' | 'invites') {
      return existing[t] ?? 0;
    },
    async writeAll(r: TargetRows) {
      s.written = r;
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
});
