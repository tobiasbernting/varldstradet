import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('README', () => {
  it('links only to pictures that exist', () => {
    const text = readFileSync(resolve(root, 'README.md'), 'utf8');
    const missing: string[] = [];
    for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1]!.split('#')[0]!;
      if (/^[a-z]+:/i.test(target) || !/\.(png|webp|jpe?g|gif|svg)$/i.test(target)) continue;
      if (!existsSync(resolve(root, target))) missing.push(target);
    }
    expect(missing).toEqual([]);
  });
});
