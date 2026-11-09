import { execFileSync } from 'node:child_process';
import { CLASSES, DUNGEONS, RUN_LEVEL_IDS, T, type ClassId, type DungeonId } from '../../shared/src/index.ts';
import type { Access } from './access.ts';
import type { Game } from './game.ts';
import { GAME_NAME, esc, layout } from './pages.ts';

const started = Date.now();

/** Version and commit of the running server (the GIT_COMMIT environment variable wins, else the checkout's HEAD). */
let versionCache: string | null = null;
export function serverVersion(): string {
  if (versionCache !== null) return versionCache;
  let commit = process.env.GIT_COMMIT?.trim().slice(0, 12) ?? '';
  if (!commit) {
    try {
      commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: import.meta.dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim();
    } catch {
      commit = '';
    }
  }
  versionCache = commit ? `commit ${commit}` : 'okänd version';
  return versionCache;
}

const fmt = (ms: number): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return 'nyss';
  if (s < 5400) return `${Math.round(s / 60)} min sedan`;
  if (s < 129600) return `${Math.round(s / 3600)} tim sedan`;
  return `${Math.round(s / 86400)} dygn sedan`;
}

const levelName = (l: number): string => T.runLevelName[l] ?? String(l);

/** Server status: who is playing, the runs going on, version. */
export function statusSection(game: Game): string {
  const online = game.onlinePlayers();
  const runs = game.runStatus();
  const chars = game.characters();
  const up = Math.round((Date.now() - started) / 60000);
  return `<div class="card">
  <h2>📊 Läget just nu</h2>
  <p>Spelar nu (${online.length}): ${online.length ? online.map(esc).join(', ') : '<em>ingen</em>'}</p>
  <p>Färder: ${
    runs.length
      ? runs.map((r) => `<strong>${esc(DUNGEONS[r.boss as DungeonId]?.name ?? r.boss)}</strong>, ${esc(levelName(r.level))}, med ${r.party.map(esc).join(', ')}`).join('; ')
      : '<em>ingen pågår</em>'
  }</p>
  <p class="muted">${chars.length} karaktärer · ${esc(serverVersion())} · igång i ${up < 90 ? `${up} min` : `${Math.round(up / 60)} tim`}</p>
</div>`;
}

/**
 * The characters: class, level, last played, whose they are, a new name, the highest difficulty they may play and
 * removal. `access` is null when access control is off (ACCESS=open): then there is no owner and no difficulty cap.
 */
export function charactersSection(game: Game, access: Access | null): string {
  const chars = game.characters().sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || a.name.localeCompare(b.name, 'sv'));
  const rows = chars
    .map((c) => {
      const cls = c.cls ? CLASSES[c.cls as ClassId] : null;
      const owner = access?.ownerOf(c.id);
      const devices = access
        ? access
            .approved()
            .filter((d) => d.kind === 'guest' && d.players.includes(c.id))
            .map((d) => d.name)
        : [];
      const whose = owner ? `${esc(owner.device)}${owner.invite ? ` (${esc(owner.invite)})` : ''}` : access ? 'okänd enhet' : '';
      const cap = access?.maxLevelFor(c.id) ?? RUN_LEVEL_IDS.length - 1;
      return `<div class="dev"><strong>${esc(c.name)}</strong>${c.online ? ' · <strong>spelar nu</strong>' : ''}<br>
<span class="muted">${cls ? `${cls.emoji} ${esc(cls.name)}` : 'ingen klass än'} · nivå ${c.level} · senast ${c.lastPlayed ? `${fmt(c.lastPlayed)} (${ago(c.lastPlayed)})` : 'aldrig'}${
        access ? ` · gjord på: ${whose}${devices.length ? ` · får spelas av: ${devices.map(esc).join(', ')}` : ''}` : ''
      }</span><br>
<form method="post" action="/admin/access/character-rename"><input type="hidden" name="id" value="${esc(c.id)}"><input name="name" value="${esc(c.name)}" maxlength="16" required aria-label="Nytt namn"> <button class="alt">Byt namn</button></form>
${
  access
    ? `<form method="post" action="/admin/access/character-level"><input type="hidden" name="id" value="${esc(c.id)}"><label>Högsta svårighet <select name="level">${RUN_LEVEL_IDS.map((l) => `<option value="${l}"${l === cap ? ' selected' : ''}>${esc(levelName(l))}</option>`).join('')}</select></label> <button class="alt">Spara</button></form>`
    : ''
}
<form method="post" action="/admin/access/character-delete" data-confirm="Ta bort ${esc(c.name)} för alltid? Det går inte att ångra."><input type="hidden" name="id" value="${esc(c.id)}"><button class="bad">Ta bort</button></form></div>`;
    })
    .join('');
  return `<div class="card">
  <h2>🧙 Karaktärer (${chars.length})</h2>
  <p class="muted">${access ? 'Högsta svårighet gäller när en färd startas eller hängs på: om någon i sällskapet har för låg gräns startar färden inte och spelet säger vem det gäller.' : 'Svårighetsgränser och ägare kräver åtkomstkontroll (ACCESS=open är på).'}</p>
  ${rows || '<p class="muted">Inga karaktärer än.</p>'}
</div>`;
}

/** The parent page. `accessHtml` holds the access control sections (empty when access control is off). */
export function adminPage(game: Game, access: Access | null, flash: string, nonce: string, accessHtml = '', script = ''): string {
  const body = `<h1>🌳 ${GAME_NAME} – ${T.admin}</h1>
${flash ? `<p class="flash">${esc(flash)}</p>` : ''}
${accessHtml ? '' : '<p class="warn">Åtkomstkontrollen är avstängd (ACCESS=open): alla som når servern kan spela och öppna den här sidan. Använd bara så på ett hemmanätverk.</p>'}
${statusSection(game)}
${accessHtml}
${accessHtml ? '' : charactersSection(game, access)}
<p><a href="/">Till spelet</a></p>
${access ? '<form method="post" action="/admin/logout"><button class="alt">Logga ut</button></form>' : ''}`;
  return layout(`${GAME_NAME} – ${T.admin}`, body, nonce, script);
}
