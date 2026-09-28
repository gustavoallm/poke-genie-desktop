import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OUT } from './paths.ts';
import { LEAGUE_CAPS, type League } from './core/ivrank.ts';
import { createTeamService, MAX_LOCKS, TeamsError, type TeamService } from './core/teams/service.ts';
import { createInventoryStore, InventoryError, type InventoryStore } from './core/inventoryStore.ts';

const LEAGUE_ORDER = ['great', 'ultra', 'master'];

export interface ApiOptions {
  /** Holds extractions/*.json and overrides.json; defaults to the repo's out/. */
  outDir?: string;
  /** Team generator; defaults to the real one (created on first use). */
  teams?: TeamService;
  store?: InventoryStore;
}

const MAX_BODY_BYTES = 10_000;

function parseLeague(value: unknown): League {
  if (typeof value !== 'string' || !(value in LEAGUE_CAPS)) throw new TeamsError('league must be great, ultra or master.');
  return value as League;
}

function parseIgnoreIvs(body: { ignoreIvs?: unknown }): boolean {
  if (body.ignoreIvs === undefined) return false;
  if (typeof body.ignoreIvs !== 'boolean') throw new TeamsError('ignoreIvs must be true or false.');
  return body.ignoreIvs;
}

/** style: 0 = consistent ... 1 = spice; omitted = the generator's default. */
function parseStyle(body: { style?: unknown }): number | undefined {
  if (body.style === undefined) return undefined;
  if (typeof body.style !== 'number' || body.style < 0 || body.style > 1) throw new TeamsError('style must be a number from 0 to 1.');
  return body.style;
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) throw new TeamsError('Request body too large.', 413);
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new TeamsError('Request body is not valid JSON.');
  }
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** Local API for the front. The inventory is rebuilt when an extraction output or overrides.json changes. */
export function createApiServer({ outDir = OUT, teams, store: givenStore }: ApiOptions = {}): http.Server {
  const store = givenStore ?? createInventoryStore({ outDir });
  let teamService = teams;

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });

      if (req.method === 'GET' && url.pathname === '/api/leagues') return send(res, 200, store.leagues());

      if (req.method === 'GET' && url.pathname === '/api/inventory') {
        return send(res, 200, { generatedAt: new Date().toISOString(), sources: store.sources(), pokemon: store.inventory() });
      }

      const ranked = url.pathname.match(/^\/api\/ranked\/([a-z]+)$/);
      if (req.method === 'GET' && ranked) {
        const file = store.ranked(ranked[1] as League);
        if (!file) return send(res, 404, { error: `No ranked data for league "${ranked[1]}". Extract a video with Pokémon for it first.` });
        return send(res, 200, file);
      }

      const override = url.pathname.match(/^\/api\/overrides\/(.+)$/);
      if (req.method === 'PUT' && override) {
        const body = (await readJson(req)) as { speciesId?: unknown };
        if (body.speciesId !== null && typeof body.speciesId !== 'string') throw new TeamsError('speciesId must be a species id or null.');
        store.setOverride(decodeURIComponent(override[1]), body.speciesId);
        return send(res, 200, { ok: true });
      }

      if (req.method === 'POST' && url.pathname === '/api/teams') {
        const body = (await readJson(req)) as { league?: unknown; locks?: unknown; style?: unknown; ignoreIvs?: unknown };
        const league = parseLeague(body.league);
        const locks = body.locks ?? [];
        if (!Array.isArray(locks) || !locks.every(l => typeof l === 'string') || locks.length > MAX_LOCKS) {
          throw new TeamsError(`locks must be a list of up to ${MAX_LOCKS} species ids.`);
        }
        teamService ??= createTeamService({ store });
        return send(res, 200, await teamService.generate(league, locks, parseStyle(body), parseIgnoreIvs(body)));
      }

      if (req.method === 'POST' && url.pathname === '/api/teams/analyze') {
        const body = (await readJson(req)) as { league?: unknown; members?: unknown; style?: unknown; ignoreIvs?: unknown };
        const league = parseLeague(body.league);
        const members = body.members;
        if (!Array.isArray(members) || members.length !== 3 || !members.every(k => typeof k === 'string')) {
          throw new TeamsError('members must be a list of 3 Pokémon keys.');
        }
        teamService ??= createTeamService({ store });
        return send(res, 200, await teamService.analyze(league, members, parseStyle(body), parseIgnoreIvs(body)));
      }

      send(res, 404, { error: `Not found: ${req.method} ${url.pathname}` });
    } catch (e) {
      if (e instanceof TeamsError || e instanceof InventoryError) return send(res, e.status, { error: e.message });
      send(res, 500, { error: (e as Error).message });
    }
  });
}
