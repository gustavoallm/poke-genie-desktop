import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApiServer } from '../src/server.ts';
import { TeamsError } from '../src/core/teams/service.ts';

let server: Server;
let base: string;
const mon = (firstTimeSec: number, cp: number, extra: object = {}) => ({
  cp,
  speciesId: 'empoleon',
  species: 'Empoleon',
  nickname: null,
  ivs: { atk: 5, def: 15, hp: 15 },
  hp: { current: 130, max: 130 },
  level: 20,
  confidence: 'high',
  firstTimeSec,
  ...extra,
});

beforeAll(async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgd-api-'));
  fs.mkdirSync(path.join(outDir, 'extractions'));
  fs.writeFileSync(
    path.join(outDir, 'extractions', 'box.json'),
    JSON.stringify({
      source: 'box.mp4',
      bag: [],
      pokemon: [
        mon(1, 1400),
        mon(2, 1491, {
          speciesId: 'stunfisk',
          species: 'Stunfisk',
          ivs: { atk: 14, def: 14, hp: 12 },
          formAlternatives: ['stunfisk_galarian'],
        }),
      ],
    }),
  );
  server = createApiServer({
    outDir,
    teams: {
      async generate(league, locks) {
        if (locks.includes('missingno')) throw new TeamsError('Unknown lock: missingno', 400);
        return { league, locks, teams: [] };
      },
      async analyze(league, members, style, ignoreIvs) {
        return { league, members, style, ignoreIvs };
      },
    },
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

describe('api server', () => {
  it('reports health', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it('lists leagues with ranked data in great/ultra/master order', async () => {
    expect(await (await fetch(`${base}/api/leagues`)).json()).toEqual(['great', 'ultra', 'master']);
  });
  it('serves the whole inventory with every league evaluated', async () => {
    const inv = await (await fetch(`${base}/api/inventory`)).json();
    expect(inv.pokemon).toHaveLength(2);
    expect(inv.pokemon[0].leagues.great).toMatchObject({ eligible: true, ranked: true });
  });
  it('saves form overrides and validates them', async () => {
    const put = (key: string, speciesId: unknown) =>
      fetch(`${base}/api/overrides/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ speciesId }),
      });
    expect((await put('box.json@2', 'stunfisk_galarian')).status).toBe(200);
    const inv = await (await fetch(`${base}/api/inventory`)).json();
    expect(inv.pokemon.find((p: { key: string }) => p.key === 'box.json@2').speciesId).toBe('stunfisk_galarian');
    expect((await put('box.json@2', 'empoleon')).status).toBe(400);
    expect((await put('nope@1', 'stunfisk_galarian')).status).toBe(404);
    expect((await put('box.json@2', 42)).status).toBe(400);
    expect((await put('box.json@2', null)).status).toBe(200);
  });
  it('serves a league ranking', async () => {
    const res = await fetch(`${base}/api/ranked/ultra`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toMatchObject({ league: 'ultra', cap: 2500, csv: 'pvpoke' });
  });
  it('generates teams for a league with locks', async () => {
    const post = (body: unknown) =>
      fetch(`${base}/api/teams`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ok = await post({ league: 'ultra', locks: ['empoleon'] });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ league: 'ultra', locks: ['empoleon'], teams: [] });
    expect((await post({ league: 'ultra' })).status).toBe(200);
    expect((await post({ league: 'mega' })).status).toBe(400);
    expect((await post({ league: 'ultra', locks: 'empoleon' })).status).toBe(400);
    expect((await post({ league: 'ultra', locks: ['a', 'b', 'c', 'd'] })).status).toBe(400);
    const bad = await post({ league: 'ultra', locks: ['missingno'] });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/missingno/);
    const notJson = await fetch(`${base}/api/teams`, { method: 'POST', body: '{nope' });
    expect(notJson.status).toBe(400);
  });
  it('validates style and analyzes a 3-mon team', async () => {
    const post = (url: string, body: unknown) =>
      fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post('/api/teams', { league: 'ultra', style: 2 })).status).toBe(400);
    expect((await post('/api/teams', { league: 'ultra', style: 'spice' })).status).toBe(400);
    const ok = await post('/api/teams/analyze', { league: 'ultra', members: ['a@1', 'b@2', 'c@3'], style: 0.5, ignoreIvs: true });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ league: 'ultra', members: ['a@1', 'b@2', 'c@3'], style: 0.5, ignoreIvs: true });
    expect((await post('/api/teams', { league: 'ultra', ignoreIvs: 'yes' })).status).toBe(400);
    expect((await post('/api/teams/analyze', { league: 'ultra', members: ['a@1', 'b@2'] })).status).toBe(400);
    expect((await post('/api/teams/analyze', { league: 'ultra', members: [1, 2, 3] })).status).toBe(400);
  });
  it('returns JSON 404s for unknown leagues and routes', async () => {
    const missing = await fetch(`${base}/api/ranked/mega`);
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toMatch(/mega/);
    expect((await fetch(`${base}/api/ranked/..%2F..%2Fsecret`)).status).toBe(404);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
