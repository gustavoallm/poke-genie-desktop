import type { AnalyzeResult, Inventory, League, RankedFile, TeamsResult } from './types.ts';

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchLeagues = () => getJson<League[]>('/api/leagues');
export const fetchRanked = (league: League) => getJson<RankedFile>(`/api/ranked/${league}`);
export const fetchInventory = () => getJson<Inventory>('/api/inventory');
/** Sets the form of one Pokémon (null restores what the video read). */
export const setForm = (key: string, speciesId: string | null) =>
  getJson<{ ok: true }>(`/api/overrides/${encodeURIComponent(key)}`, send('PUT', { speciesId }));
export const generateTeams = (league: League, locks: string[], style: number, ignoreIvs = false) =>
  getJson<TeamsResult>('/api/teams', send('POST', { league, locks, style, ignoreIvs }));
export const analyzeTeam = (league: League, members: string[], style: number, ignoreIvs = false) =>
  getJson<AnalyzeResult>('/api/teams/analyze', send('POST', { league, members, style, ignoreIvs }));

/** Same key the API uses for one owned Pokémon. */
export const pokemonKey = (p: { source: string; firstTimeSec: number }) => `${p.source}@${p.firstTimeSec}`;
