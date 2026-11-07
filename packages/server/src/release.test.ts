import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DOWNLOADS, RELEASES_URL, downloadPage } from './pages.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = readFileSync(resolve(root, '.github/workflows/godot.yml'), 'utf8');

/** The text of one job of the workflow: from `  <name>:` at two spaces to the next job (or the end). */
function job(name: string): string {
  const m = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][\\w-]*:\\n|(?![\\s\\S]))`, 'm').exec(workflow);
  if (!m) throw new Error(`no job "${name}" in godot.yml`);
  return m[1]!;
}

/** The zip names the "Zip the exports" step makes: `zip … "../NAME.zip"` and `mv … "NAME.zip"`. */
function producedZips(): string[] {
  const step = /- name: Zip the exports\n([\s\S]*?)(?=\n      - )/.exec(job('export'))?.[1] ?? '';
  return [...step.matchAll(/(?:zip -q -r "\.\.\/|mv \S+ ")([^"]+\.zip)"/g)].map((m) => m[1]!).sort();
}

describe('the release path: what the workflow builds and what the download page links to', () => {
  it('the zips the workflow makes are exactly the ones the download page offers', () => {
    expect(producedZips()).toEqual(DOWNLOADS.map((d) => d.file).sort());
  });

  it('every link the rendered page has to a build is a name the workflow produces', () => {
    const page = downloadPage('n', { origin: 'https://spel.example.se', access: null, parentLink: false });
    const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!).filter((h) => h.startsWith(RELEASES_URL));
    const downloads = hrefs.filter((h) => h.includes('/latest/download/'));
    expect(downloads.map((h) => h.slice(h.lastIndexOf('/') + 1)).sort()).toEqual(producedZips());
    for (const h of downloads) expect(h).toBe(`${RELEASES_URL}/latest/download/${h.slice(h.lastIndexOf('/') + 1)}`);
    expect(hrefs).toContain(`${RELEASES_URL}/latest`);
  });

  it('the release page is this repository\'s, and no zip name carries a version (the links use latest/download)', () => {
    expect(RELEASES_URL).toBe('https://github.com/tobiasbernting/varldstradet/releases');
    for (const z of producedZips()) expect(z).toMatch(/^varldstradet-(windows|macos|linux)-[a-z0-9_]+\.zip$/);
  });

  it('the zips reach the release: the export job uploads build/*.zip as varldstradet-builds, the release job attaches the same', () => {
    expect(job('export')).toMatch(/name: varldstradet-builds\n\s+path: build\/\*\.zip\n\s+if-no-files-found: error/);
    const release = job('release');
    expect(release).toMatch(/needs: \[export, bots\]/); // (a tag release waits for the bots, too)
    expect(release).toMatch(/name: varldstradet-builds\n\s+path: build/);
    expect(release).toMatch(/files: build\/\*\.zip/);
  });

  it('only a v* tag makes a Release; a manual run builds the zips as an artifact and can skip the slow pictures', () => {
    expect(workflow).toMatch(/push:\n\s+tags: \['v\*'\]/);
    expect(job('release')).toMatch(/if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
    expect(job('export')).not.toMatch(/^\s+if:/m); // runs on tags, pull requests and by hand
    expect(workflow).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+pictures:\n\s+description: [^\n]+\n\s+type: boolean\n\s+default: true/);
    expect(job('pictures')).toMatch(/if: github\.event_name == 'workflow_dispatch' && inputs\.pictures/);
  });

  it('the image workflow never pushes to the old farm\'s image (lilla-garden), which the running farm pulls as :latest', () => {
    const docker = readFileSync(resolve(root, '.github/workflows/docker.yml'), 'utf8');
    const image = /IMAGE: (\S+)/.exec(docker)?.[1];
    expect(image).toBe('ghcr.io/tobiasbernting/varldstradet');
    expect(docker).not.toMatch(/lilla-garden/);
    expect(readFileSync(resolve(root, 'README.md'), 'utf8')).not.toMatch(/ghcr\.io\/tobiasbernting\/lilla-garden/);
  });

  it('the Postgres-backed tests run in CI instead of skipping: server.yml has a postgres service and sets TEST_DATABASE_URL', () => {
    const server = readFileSync(resolve(root, '.github/workflows/server.yml'), 'utf8');
    expect(server).toMatch(/services:\n\s+postgres:\n\s+image: postgres:/);
    expect(server).toMatch(/TEST_DATABASE_URL: postgres:\/\/postgres:postgres@localhost:5432\//);
    expect(server).toMatch(/run: pnpm -r run test/);
    expect(readFileSync(resolve(root, 'packages/server/src/importSave.pg.test.ts'), 'utf8')).toContain('process.env.TEST_DATABASE_URL');
  });
});
