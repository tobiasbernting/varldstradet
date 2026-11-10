import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ORDER,
  INVENTORY_FILTERS,
  countItem,
  filterOf,
  item,
  itemMatches,
  itemName,
  makeInventory,
  makeStack,
  normalizeQuery,
  sortInventory,
} from './index.ts';

describe('sortInventory', () => {
  it('consolidates stacks of the same item and empties go last', () => {
    const inv = makeInventory(8);
    inv[1] = { item: 'healing_potion', count: 10 };
    inv[4] = { item: 'healing_potion', count: 5 };
    inv[6] = { item: 'healing_potion', count: 20 };
    sortInventory(inv);
    expect(inv[0]).toEqual({ item: 'healing_potion', count: 20 });
    expect(inv[1]).toEqual({ item: 'healing_potion', count: 15 });
    expect(inv.slice(2).every((s) => s === null)).toBe(true);
    expect(countItem(inv, 'healing_potion')).toBe(35);
  });

  it('orders by category, then Swedish name, then count', () => {
    const inv = makeInventory(8);
    inv[0] = makeStack('styrkedryck', 3);
    inv[1] = makeStack('pet_hugin', 1);
    inv[2] = makeStack('jarnsvard', 1);
    inv[3] = makeStack('healing_potion', 3);
    inv[4] = makeStack('glimmersten', 3);
    sortInventory(inv);
    const ids = inv.filter(Boolean).map((s) => s!.item);
    const rank = (id: string) => CATEGORY_ORDER.indexOf(item(id).category);
    for (let i = 1; i < ids.length; i++) expect(rank(ids[i - 1]!)).toBeLessThanOrEqual(rank(ids[i]!));
    expect(ids[0]).toBe('jarnsvard');
    const materials = ids.filter((id) => item(id).category === 'material').map(itemName);
    expect(materials).toEqual([...materials].sort((a, b) => a.localeCompare(b, 'sv')));
  });

  it('only touches the given range', () => {
    const inv = makeInventory(16);
    inv[0] = makeStack('healing_potion', 1);
    inv[1] = makeStack('jarnsvard', 1);
    inv[9] = makeStack('healing_potion', 2);
    inv[8] = makeStack('jarnsvard', 1);
    inv[12] = makeStack('healing_potion', 4);
    const before = [inv[0], inv[1]];
    sortInventory(inv, 8, 16);
    expect(inv[0]).toBe(before[0]);
    expect(inv[1]).toBe(before[1]);
    expect(inv[8]?.item).toBe('jarnsvard');
    expect(inv[9]).toEqual({ item: 'healing_potion', count: 6 });
    expect(inv[10]).toBeNull();
  });

  it('never drops items when stacks are over the max (corrupt data)', () => {
    const inv = makeInventory(4);
    for (let i = 0; i < 4; i++) inv[i] = { item: 'healing_potion', count: 150 };
    sortInventory(inv);
    expect(countItem(inv, 'healing_potion')).toBe(600);
  });

  it('sorts unknown items last without throwing and keeps them', () => {
    const inv = makeInventory(6);
    inv[0] = { item: 'nope', count: 1 };
    inv[1] = { item: 'nope', count: 2 };
    inv[2] = makeStack('healing_potion', 3);
    expect(() => sortInventory(inv)).not.toThrow();
    expect(inv[0]?.item).toBe('healing_potion');
    expect(inv.filter((s) => s?.item === 'nope').map((s) => s!.count).sort()).toEqual([1, 2]);
  });

  it('never merges stacks with data', () => {
    const inv = makeInventory(8);
    inv[0] = { item: 'trophy_draugkung', count: 1, data: '1' };
    inv[1] = { item: 'trophy_draugkung', count: 1, data: '2' };
    inv[2] = { item: 'healing_potion', count: 2 };
    inv[3] = { item: 'healing_potion', count: 3 };
    sortInventory(inv);
    expect(inv.filter((s) => s?.item === 'trophy_draugkung')).toHaveLength(2);
    expect(inv.filter((s) => s?.item === 'healing_potion')).toEqual([{ item: 'healing_potion', count: 5 }]);
  });
});

describe('filters and search', () => {
  it('normalizes queries', () => {
    expect(normalizeQuery('  Mo   ROT ')).toBe('mo rot');
  });

  it('matches case-insensitively, with åäö, and empty matches all', () => {
    expect(itemMatches('healing_potion', '')).toBe(true);
    expect(itemMatches('healing_potion', '   ')).toBe(true);
    expect(itemMatches('healing_potion', itemName('healing_potion').toUpperCase())).toBe(true);
    expect(itemMatches('healing_potion', itemName('healing_potion').slice(0, 3).toLowerCase())).toBe(true);
    expect(itemMatches('healing_potion', 'zzz')).toBe(false);
  });

  it('matches the Swedish name, not the raw id, and never unknown ids', () => {
    expect(itemMatches('mount_sleipner', 'mount_')).toBe(false);
    expect(itemMatches('mount_sleipner', 'sleip')).toBe(true);
    expect(itemMatches('healing_potion', 'heal')).toBe(false);
    expect(itemMatches('nope', 'nope')).toBe(false);
    expect(filterOf('nope')).toBe('other');
  });

  it('matches names with å, ä, ö', () => {
    expect(itemMatches('jarnsvard', 'järnsvärd')).toBe(true);
    expect(itemMatches('jarnsvard', 'JÄRNSVÄRD')).toBe(true);
    expect(itemMatches('jarnsvard', 'jarnsvard')).toBe(false);
    expect(itemMatches('gem', 'ädel')).toBe(true);
  });

  it('every item belongs to a known filter', () => {
    const ids = INVENTORY_FILTERS.map((f) => f.id);
    expect(filterOf('jarnsvard')).toBe('tools');
    expect(filterOf('healing_potion')).toBe('materials');
    expect(ids).toContain(filterOf('viking_shield'));
  });
});
