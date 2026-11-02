import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { WebSocket } from 'ws';
import { Access } from './access.ts';
import { MemoryAccessStore } from './db/accessStore.ts';
import { MemoryStore } from './db/store.ts';
import { Game } from './game.ts';
import { createServer, createServers } from './http.ts';
import { ntfyNotifier } from './notify.ts';

const PW = 'correct horse battery';
let server: http.Server;
let base = '';
let host = '';
let game: Game;
let access: Access;

beforeAll(async () => {
  game = new Game(new MemoryStore(), { autoStart: false });
  await game.start();
  access = new Access(new MemoryAccessStore(), { parentPassword: PW });
  await access.load();
  server = createServer(game, { seasonEnv: undefined, access });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  base = `http://${host}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const cookieFrom = (res: Response): string =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ');
const post = (path: string, form: Record<string, string>, cookie = '', origin = base) =>
  fetch(base + path, { method: 'POST', redirect: 'manual', headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
const get = (path: string, cookie = '') => fetch(base + path, { redirect: 'manual', headers: { cookie } });

const openSocket = (cookie: string, origin = base): Promise<{ ws: WebSocket; closed: Promise<number> } | { refused: number }> =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}/ws`, { headers: { cookie, origin } });
    ws.on('unexpected-response', (_req, res) => resolve({ refused: res.statusCode ?? 0 }));
    ws.on('open', () => resolve({ ws, closed: new Promise((r) => ws.on('close', (code) => r(code))) }));
    ws.on('error', () => {});
  });

describe('the gate', () => {
  it('lets strangers see nothing but the gate page', async () => {
    expect((await get('/')).headers.get('location')).toBe('/access');
    expect((await get('/api/players')).status).toBe(403);
    expect((await get('/api/me')).status).toBe(403);
    expect((await get('/admin')).headers.get('location')).toBe('/admin/login');
    expect((await post('/admin/skipday', {})).status).toBe(401);
    expect(await (await get('/health')).json()).toEqual({ ok: true });
    expect(await openSocket('')).toEqual({ refused: 403 });
    const page = await get('/access');
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    // röstprat needs the microphone on our own pages (a `microphone=()` blocks it whatever the player allowed)
    expect(page.headers.get('permissions-policy')).toContain('microphone=(self)');
    expect(page.headers.get('permissions-policy')).toContain('camera=()');
    expect(await page.text()).toContain('privat gård');
  });

  it('runs the whole invite → approval → play flow, and kicks the device when access is taken away', async () => {
    // parent logs in
    expect((await post('/admin/login', { password: 'wrong' })).status).toBe(401);
    const login = await post('/admin/login', { password: PW });
    expect(login.status).toBe(303);
    const parent = cookieFrom(login);
    expect(parent).toMatch(/^lg_parent=/);
    expect((await get('/admin', parent)).status).toBe(200);

    // forms from other sites are refused
    expect((await post('/admin/access/mode', { mode: 'open' }, parent, 'https://evil.example')).status).toBe(403);
    expect((await post('/admin/access/mode', { mode: 'open' }, parent)).status).toBe(303);
    expect(access.settings.mode).toBe('open');

    const fam = game.createPlayer('Astrid', { skin: '#f1c9a5', hair: '#5a3a1e', hairStyle: 'short' })!;

    // a code that needs the parent's approval, shown once on the parent page (with its link)
    await post('/admin/access/invite', { label: 'Kusin Anna', kind: 'guest', hours: '24', newPlayers: '1', approval: 'parent' }, parent);
    const pageWithCode = await (await get('/admin', parent)).text();
    const token = /class="code">([A-Z2-9]{4}-[A-Z2-9]{4})</.exec(pageWithCode)?.[1];
    expect(token).toBeTruthy();
    expect(pageWithCode).toContain(`/join#${token}`);
    expect(await (await get('/admin', parent)).text()).not.toContain(token!);

    // the guest types it and waits for approval
    const joined = await post('/join', { code: token!, name: 'Annas iPad' });
    expect(joined.headers.get('location')).toBe('/access');
    const guest = cookieFrom(joined);
    expect(guest).toMatch(/^lg_device=/);
    expect(await (await get('/access', guest)).text()).toContain('måste godkänna');
    expect((await get('/api/players', guest)).status).toBe(403);
    expect(await openSocket(guest)).toEqual({ refused: 403 });
    // the code does not work twice
    expect((await post('/join', { code: token!, name: 'Någon annan' })).status).toBe(403);

    const pending = access.pending()[0]!;
    expect(await (await get('/admin', parent)).text()).toContain(pending.code.slice(0, 3));
    await post('/admin/access/approve', { id: pending.id }, parent);

    // approved: the guest sees only their own characters and may create one
    expect(await (await get('/api/players', guest)).json()).toEqual([]);
    expect(await (await get('/api/me', guest)).json()).toMatchObject({ gate: 'ok', canCreate: true });
    const created = await fetch(`${base}/api/players`, { method: 'POST', headers: { cookie: guest, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Anna' }) });
    expect(created.status).toBe(201);
    const anna = (await created.json()) as { id: string };
    expect(((await (await get('/api/players', guest)).json()) as { id: string }[]).map((p) => p.id)).toEqual([anna.id]);
    const second = await fetch(`${base}/api/players`, { method: 'POST', headers: { cookie: guest, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Anna 2' }) });
    expect(second.status).toBe(403);

    // sockets: wrong origin refused; someone else's character closes the socket
    expect(await openSocket(guest, 'https://evil.example')).toEqual({ refused: 403 });
    const s1 = await openSocket(guest);
    if (!('ws' in s1)) throw new Error('refused');
    s1.ws.send(JSON.stringify({ t: 'hello', playerId: fam.id }));
    expect(await s1.closed).toBe(4003);

    // playing as their own character works until the parent removes the device
    const s2 = await openSocket(guest);
    if (!('ws' in s2)) throw new Error('refused');
    const welcomed = new Promise<void>((r) => s2.ws.on('message', (d) => String(d).includes('"welcome"') && r()));
    s2.ws.send(JSON.stringify({ t: 'hello', playerId: anna.id }));
    await welcomed;
    expect(game.onlinePlayers()).toEqual(['Anna']);
    await post('/admin/access/remove', { id: pending.id }, parent);
    expect(await s2.closed).toBe(4003);
    expect((await get('/api/players', guest)).status).toBe(403);
  });

  it('makes the parent’s own browser a family device', async () => {
    const parent = cookieFrom(await post('/admin/login', { password: PW }));
    const res = await post('/admin/access/this-device', { name: 'Barnens platta' }, parent);
    const device = cookieFrom(res);
    expect(device).toMatch(/^lg_device=/);
    expect((await get('/api/players', device)).status).toBe(200);
    await post('/admin/logout', {}, parent);
    expect((await get('/admin', parent)).headers.get('location')).toBe('/admin/login');
  });
});

describe('a native client (bearer token)', () => {
  // its own server: the wrong-code test locks code entry for this address
  let g: Game;
  let a: Access;
  let srv: http.Server;
  let h = '';
  let b = '';
  beforeAll(async () => {
    g = new Game(new MemoryStore(), { autoStart: false });
    await g.start();
    a = new Access(new MemoryAccessStore(), { parentPassword: PW });
    await a.load();
    srv = createServer(g, { seasonEnv: undefined, access: a });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    h = `127.0.0.1:${(srv.address() as AddressInfo).port}`;
    b = `http://${h}`;
  });
  afterAll(() => {
    srv.closeAllConnections();
    srv.close();
  });

  const parentCode = async (opts: Record<string, string>): Promise<{ parent: string; code: string }> => {
    const parent = cookieFrom(await fetch(`${b}/admin/login`, { method: 'POST', redirect: 'manual', headers: { origin: b }, body: new URLSearchParams({ password: PW }) }));
    await fetch(`${b}/admin/access/invite`, { method: 'POST', redirect: 'manual', headers: { cookie: parent, origin: b }, body: new URLSearchParams(opts) });
    const page = await (await fetch(`${b}/admin`, { headers: { cookie: parent } })).text();
    return { parent, code: /class="code">([A-Z2-9]{4}-[A-Z2-9]{4})</.exec(page)![1]! };
  };
  const admin = (parent: string, path: string, form: Record<string, string>) =>
    fetch(`${b}/admin/access/${path}`, { method: 'POST', redirect: 'manual', headers: { cookie: parent, origin: b }, body: new URLSearchParams(form) });
  /** Like the Godot client: JSON, a bearer header when it has a token, and never an Origin or a cookie. */
  const api = (path: string, init: { method?: string; token?: string; body?: unknown } = {}) =>
    fetch(`${b}${path}`, {
      method: init.method ?? 'GET',
      redirect: 'manual',
      headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  const socket = (headers: Record<string, string>): Promise<{ ws: WebSocket; closed: Promise<number> } | { refused: number }> =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://${h}/ws`, { headers });
      ws.on('unexpected-response', (_req, res) => resolve({ refused: res.statusCode ?? 0 }));
      ws.on('open', () => resolve({ ws, closed: new Promise((r) => ws.on('close', (code) => r(code))) }));
      ws.on('error', () => {});
    });

  it('joins with an auto code, gets the token in the body and no cookie, and plays over the socket until paused', async () => {
    const { parent, code } = await parentCode({ label: 'Pappas dator', kind: 'family', hours: '24', newPlayers: '0', approval: 'auto' });
    const joined = await api('/api/join', { method: 'POST', body: { code: code.toLowerCase(), name: 'MacBook' } });
    expect(joined.status).toBe(200);
    expect(joined.headers.getSetCookie()).toEqual([]);
    const j = (await joined.json()) as { gate: string; token: string; name: string; kind: string; pending?: string };
    expect(j).toMatchObject({ gate: 'ok', name: 'MacBook', kind: 'family' });
    expect(j.pending).toBeUndefined();
    expect(j.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    // only the hash is stored
    expect(a.approved().some((d) => d.tokenHash === j.token)).toBe(false);
    expect(a.deviceFor(j.token)?.name).toBe('MacBook');

    // the bearer works on the JSON routes, with no Origin header at all
    expect(await (await api('/api/gate', { token: j.token })).json()).toMatchObject({ gate: 'ok', name: 'MacBook', kind: 'family', canCreate: true });
    expect(await (await api('/api/me', { token: j.token })).json()).toMatchObject({ gate: 'ok' });
    expect((await api('/api/players')).status).toBe(403);
    expect((await api('/api/players', { token: 'not-a-token' })).status).toBe(403);
    expect((await api('/api/players', { token: j.token })).status).toBe(200);
    const created = await api('/api/players', { method: 'POST', token: j.token, body: { name: 'Pappa' } });
    expect(created.status).toBe(201);
    const pappa = (await created.json()) as { id: string };
    expect(((await (await api('/api/players', { token: j.token })).json()) as { id: string }[]).map((p) => p.id)).toContain(pappa.id);
    // a browser with the same bearer but from another site is still refused (the browser rules are unchanged)
    expect((await fetch(`${b}/api/players`, { method: 'POST', headers: { authorization: `Bearer ${j.token}`, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{"name":"x"}' })).status).toBe(403);

    // the parent page never takes a bearer: not a device's, not a parent session's
    expect((await api('/admin', { token: j.token })).headers.get('location')).toBe('/admin/login');
    const session = parent.replace(/^lg_parent=/, '');
    expect((await api('/admin', { token: session })).headers.get('location')).toBe('/admin/login');
    expect((await api('/admin/skipday', { method: 'POST', token: session })).status).toBe(401);
    expect((await api('/admin/access/mode', { method: 'POST', token: session, body: { mode: 'closed' } })).status).toBe(401);
    expect(a.settings.mode).toBe('family');

    // the socket: bearer on the upgrade, no Origin; the header wins over a cookie
    expect(await socket({})).toEqual({ refused: 403 });
    expect(await socket({ authorization: 'Bearer nope', cookie: `lg_device=${j.token}` })).toEqual({ refused: 403 });
    expect(await socket({ authorization: `Bearer ${j.token}`, origin: 'https://evil.example' })).toEqual({ refused: 403 });
    const s = await socket({ authorization: `Bearer ${j.token}` });
    if (!('ws' in s)) throw new Error('refused');
    const welcomed = new Promise<void>((r) => s.ws.on('message', (d) => String(d).includes('"welcome"') && r()));
    s.ws.send(JSON.stringify({ t: 'hello', playerId: pappa.id }));
    await welcomed;
    expect(g.onlinePlayers()).toEqual(['Pappa']);
    // the parent pauses the device: the 4003 close reaches the native client too
    await admin(parent, 'pause', { id: a.deviceFor(j.token)!.id, paused: '1' });
    expect(await s.closed).toBe(4003);
    expect(await (await api('/api/gate', { token: j.token })).json()).toMatchObject({ gate: 'paused' });
    expect(await socket({ authorization: `Bearer ${j.token}` })).toEqual({ refused: 403 });
    // outside the play hours the gate says when the farm opens (the client has no gate page to show)
    await admin(parent, 'pause', { id: a.deviceFor(j.token)!.id, paused: '0' });
    await admin(parent, 'hours', { from: '03:00', to: '03:01' });
    expect(await (await api('/api/gate', { token: j.token })).json()).toMatchObject({ gate: 'hours', hours: { from: '03:00', to: '03:01' } });
    await admin(parent, 'hours', { from: '', to: '' });
    expect(await (await api('/api/gate', { token: j.token })).json()).toMatchObject({ gate: 'ok' });
  });

  it('joins with a parent-approval code, shows the 6-digit number and waits on /api/gate', async () => {
    const { parent, code } = await parentCode({ label: 'Kusin Anna', kind: 'guest', hours: '24', newPlayers: '1', approval: 'parent' });
    await admin(parent, 'mode', { mode: 'open' });
    const joined = await api('/api/join', { method: 'POST', body: { code } });
    expect(joined.status).toBe(200);
    expect(joined.headers.getSetCookie()).toEqual([]);
    const j = (await joined.json()) as { gate: string; token: string; name: string; kind: string; pending?: string };
    expect(j).toMatchObject({ gate: 'pending', name: 'Kusin Anna', kind: 'guest' }); // no name given: the code's label
    expect(j.pending).toMatch(/^\d{6}$/);
    expect(a.pending()[0]!.code).toBe(j.pending);

    // while waiting: the gate says so, nothing else opens
    const waiting = await api('/api/gate', { token: j.token });
    expect(waiting.status).toBe(403);
    expect(await waiting.json()).toMatchObject({ gate: 'pending', name: 'Kusin Anna', canCreate: false });
    expect((await api('/api/players', { token: j.token })).status).toBe(403);
    expect(await socket({ authorization: `Bearer ${j.token}` })).toEqual({ refused: 403 });
    // the code is spent
    expect((await api('/api/join', { method: 'POST', body: { code, name: 'Någon annan' } })).status).toBe(403);

    await admin(parent, 'approve', { id: a.pending()[0]!.id });
    const ok = await api('/api/gate', { token: j.token });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ gate: 'ok', kind: 'guest', canCreate: true });
    expect(await (await api('/api/players', { token: j.token })).json()).toEqual([]);
    const s = await socket({ authorization: `Bearer ${j.token}` });
    expect('ws' in s).toBe(true);
    if ('ws' in s) s.ws.close();
  });

  it('answers bad requests with JSON, and locks code entry after too many wrong codes', async () => {
    expect(await (await api('/api/join', { method: 'GET' })).json()).toEqual({ gate: 'unknown' }); // only POST joins; GET is just an unknown device at the gate
    const junk = await fetch(`${b}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
    expect(junk.status).toBe(400);
    expect(await junk.json()).toEqual({ error: 'json' });
    const { code } = await parentCode({ label: 'Sent', kind: 'family', hours: '24', newPlayers: '0', approval: 'auto' });
    // 10 wrong codes per address lock it (the spent code above already counted as one)
    let wrong = 0;
    for (;;) {
      const r = await api('/api/join', { method: 'POST', body: { code: `WRONG-${wrong}` } });
      if (r.status === 429) break;
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ error: 'invalid' });
      expect(++wrong).toBeLessThanOrEqual(10);
    }
    expect(wrong).toBeGreaterThanOrEqual(9);
    const locked = await api('/api/join', { method: 'POST', body: { code } });
    expect(locked.status).toBe(429);
    expect(await locked.json()).toEqual({ error: 'limit' });
    // the same lock holds the browser route (shared limiter)
    expect((await fetch(`${b}/join`, { method: 'POST', redirect: 'manual', headers: { origin: b }, body: new URLSearchParams({ code }) })).status).toBe(429);
  });
});

describe('a separate parent server', () => {
  it('serves the parent page only on its own port, and the game only on the public one', async () => {
    const g = new Game(new MemoryStore(), { autoStart: false });
    await g.start();
    const a = new Access(new MemoryAccessStore(), { parentPassword: PW });
    await a.load();
    const { server: pub, admin } = createServers(g, { seasonEnv: undefined, access: a, separateAdmin: true, publicUrl: 'https://gard.example.se' });
    await new Promise<void>((r) => pub.listen(0, '127.0.0.1', r));
    await new Promise<void>((r) => admin!.listen(0, '127.0.0.1', r));
    const pubBase = `http://127.0.0.1:${(pub.address() as AddressInfo).port}`;
    const admBase = `http://127.0.0.1:${(admin!.address() as AddressInfo).port}`;
    try {
      // the public server has no parent page at all
      expect((await fetch(`${pubBase}/admin`, { redirect: 'manual' })).status).toBe(404);
      expect((await fetch(`${pubBase}/admin/login`, { method: 'POST', redirect: 'manual', headers: { origin: pubBase }, body: new URLSearchParams({ password: PW }) })).status).toBe(404);
      // the parent server has nothing else
      expect((await fetch(`${admBase}/`, { redirect: 'manual' })).headers.get('location')).toBe('/admin');
      expect((await fetch(`${admBase}/join`, { redirect: 'manual' })).headers.get('location')).toBe('/admin');
      // logging in there works over plain http (no Secure cookie), and codes link to the public address
      const login = await fetch(`${admBase}/admin/login`, { method: 'POST', redirect: 'manual', headers: { origin: admBase }, body: new URLSearchParams({ password: PW }) });
      const setCookie = login.headers.getSetCookie()[0]!;
      expect(setCookie).not.toContain('Secure');
      const parent = setCookie.split(';')[0]!;
      await fetch(`${admBase}/admin/access/invite`, { method: 'POST', redirect: 'manual', headers: { cookie: parent, origin: admBase }, body: new URLSearchParams({ label: 'Kalle' }) });
      await fetch(`${admBase}/admin/access/mode`, { method: 'POST', redirect: 'manual', headers: { cookie: parent, origin: admBase }, body: new URLSearchParams({ mode: 'open' }) });
      const page = await (await fetch(`${admBase}/admin`, { headers: { cookie: parent } })).text();
      const code = /class="code">([A-Z2-9]{4}-[A-Z2-9]{4})</.exec(page)![1]!;
      expect(page).toContain(`https://gard.example.se/join#${code}`);
      expect(page).not.toContain('Gör till familjeenhet');
      // an auto code lets the device straight into the game on the public server
      const joined = await fetch(`${pubBase}/join`, { method: 'POST', redirect: 'manual', headers: { origin: pubBase }, body: new URLSearchParams({ code, name: 'Kalles iPad' }) });
      expect(joined.headers.get('location')).toBe('/');
      const device = joined.headers.getSetCookie()[0]!.split(';')[0]!;
      expect((await fetch(`${pubBase}/api/me`, { headers: { cookie: device } })).status).toBe(200);
    } finally {
      pub.closeAllConnections();
      admin!.closeAllConnections();
      pub.close();
      admin!.close();
    }
  });
});

describe('ntfy', () => {
  it('publishes gate events as JSON to the ntfy server', async () => {
    const got: unknown[] = [];
    const ntfy = createHttpServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        got.push({ auth: req.headers.authorization, ...(JSON.parse(body) as object) });
        res.end('{}');
      });
    });
    await new Promise<void>((r) => ntfy.listen(0, '127.0.0.1', r));
    try {
      const notify = ntfyNotifier(`http://127.0.0.1:${(ntfy.address() as AddressInfo).port}/lilla-garden`, 'tk_secret');
      notify({ at: 0, event: 'mode', detail: 'not interesting', ip: 'x' });
      notify({ at: 0, event: 'join', detail: 'Kalles iPad kom in med koden för Kalle', ip: '1.2.3.4' });
      await vi.waitFor(() => expect(got).toHaveLength(1));
      expect(got[0]).toMatchObject({ auth: 'Bearer tk_secret', topic: 'lilla-garden', title: 'Någon kom in på gården', message: 'Kalles iPad kom in med koden för Kalle\n1.2.3.4' });
    } finally {
      ntfy.close();
    }
  });
});
