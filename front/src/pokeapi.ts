const API = 'https://pokeapi.co/api/v2/pokemon';
const CACHE_KEY = 'pokeapi-sprite:v1';
const MAX_CONCURRENT = 6;

/** pvpoke speciesId → PokeAPI pokemon name: palkia_origin → palkia-origin, stunfisk_galarian → stunfisk-galar. */
export function pokeapiSlug(speciesId: string): string {
  return speciesId
    .toLowerCase()
    .replace(/_shadow$/, '')
    .replace(/_/g, '-')
    .replace(/-galarian\b/, '-galar')
    .replace(/-alolan\b/, '-alola')
    .replace(/-hisuian\b/, '-hisui')
    .replace(/-paldean\b/, '-paldea');
}

// PokeAPI asks clients to cache; sprites never change, so results live in localStorage.
function loadCache(): Record<string, string | null> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}
const cache = loadCache();
function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked: keep in memory */
  }
}

let active = 0;
const waiting: Array<() => void> = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>(resolve => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** undefined = no such pokemon (404); null = exists but has no sprite. */
async function fetchSprite(name: string | number): Promise<string | null | undefined> {
  const res = await fetch(`${API}/${name}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`PokeAPI ${res.status} for ${name}`);
  const json = (await res.json()) as { sprites?: { front_default?: string | null } };
  return json.sprites?.front_default ?? null;
}

const inflight = new Map<string, Promise<string | null>>();

/** Sprite URL for a species; forms PokeAPI doesn't have (e.g. mewtwo-armored) fall back to the dex number. */
export function getSprite(speciesId: string, dex?: number): Promise<string | null> {
  const slug = pokeapiSlug(speciesId);
  if (slug in cache) return Promise.resolve(cache[slug]);
  let pending = inflight.get(slug);
  if (!pending) {
    pending = limited(async () => {
      let url = await fetchSprite(slug);
      if (url === undefined && dex) url = await fetchSprite(dex);
      // A 404 with no dex to fall back on isn't final: a later call may carry the dex.
      if (url === undefined && !dex) return null;
      cache[slug] = url ?? null;
      saveCache();
      return url ?? null;
    }).finally(() => inflight.delete(slug));
    inflight.set(slug, pending);
  }
  return pending;
}
