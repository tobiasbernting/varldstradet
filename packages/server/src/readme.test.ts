import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The local image targets of a Markdown text: `[a](x.png)`, `![a](<x.png>)`, `[a](x.png "title")`, percent-encoded paths decoded. */
export function imageLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    let target = m[1]!.split('#')[0]!;
    try {
      target = decodeURIComponent(target);
    } catch {
      // (left as written: it will not resolve, and the test says so)
    }
    if (/^[a-z]+:/i.test(target) || !/\.(png|webp|jpe?g|gif|svg)$/i.test(target)) continue;
    out.push(target);
  }
  return out;
}

describe('README', () => {
  it('finds image links with titles, angle brackets and percent-encoding', () => {
    const text = '![a](img.png "t") [b](<b.png>) [c](dir/a%20b.webp) [d](https://x.se/e.png) [e](notes.md)';
    expect(imageLinks(text)).toEqual(['img.png', 'b.png', 'dir/a b.webp']);
  });

  it('catches a broken link that has a title', () => {
    const missing = imageLinks('![x](docs/no-such-picture.png "A title")').filter((t) => !existsSync(resolve(root, t)));
    expect(missing).toEqual(['docs/no-such-picture.png']);
  });

  it('links only to pictures that exist', () => {
    const text = readFileSync(resolve(root, 'README.md'), 'utf8');
    expect(imageLinks(text).filter((t) => !existsSync(resolve(root, t)))).toEqual([]);
  });
});
