import fs from 'node:fs';
import path from 'node:path';
import { OUT } from '../paths.ts';
import { loadGamemaster, type Gamemaster } from './gamemaster.ts';
import type { League } from './ivrank.ts';
import type { ExtractedMon } from './rank.ts';
import { loadPvpokeRankings } from './battle/pvpoke-check.ts';
import { buildInventory, LEAGUES, rankedForLeague, type ExtractionInput, type InventoryPokemon, type PvpokeRankings } from './inventory.ts';

const OVERRIDES_FILE = 'overrides.json';
const PVPOKE_CAP: Record<League, number> = { great: 1500, ultra: 2500, master: 10000 };

export class InventoryError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type InventoryStore = ReturnType<typeof createInventoryStore>;

/**
 * The user's box: every extraction output in out/extractions/*.json plus form overrides (out/overrides.json),
 * evaluated for all leagues.
 * Rebuilt only when one of those files changes.
 */
export function createInventoryStore({ outDir = OUT, gm }: { outDir?: string; gm?: Gamemaster } = {}) {
  let gamemaster = gm;
  let rankings: PvpokeRankings | null = null;
  let cache: { signature: string; inventory: InventoryPokemon[]; sources: string[] } | null = null;
  const overridesPath = path.join(outDir, OVERRIDES_FILE);
  const extractionsDir = path.join(outDir, 'extractions');

  const extractionFiles = () =>
    (fs.existsSync(extractionsDir) ? fs.readdirSync(extractionsDir) : [])
      .filter(f => f.endsWith('.json'))
      .filter(f => fs.statSync(path.join(extractionsDir, f)).isFile());

  const readOverrides = (): Record<string, string> => {
    try {
      return JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    } catch {
      return {};
    }
  };

  const signature = () =>
    [...extractionFiles().map(f => path.join(extractionsDir, f)), overridesPath]
      .map(p => (fs.existsSync(p) ? `${p}:${fs.statSync(p).mtimeMs}` : p))
      .join('|');

  function load() {
    const sig = signature();
    if (cache && cache.signature === sig) return cache;
    gamemaster ??= loadGamemaster();
    rankings ??= {
      great: loadPvpokeRankings('overall', PVPOKE_CAP.great),
      ultra: loadPvpokeRankings('overall', PVPOKE_CAP.ultra),
      master: loadPvpokeRankings('overall', PVPOKE_CAP.master),
    };
    const inputs: ExtractionInput[] = [];
    for (const f of extractionFiles()) {
      const data = JSON.parse(fs.readFileSync(path.join(extractionsDir, f), 'utf8')) as { pokemon?: unknown };
      if (Array.isArray(data.pokemon)) inputs.push({ source: f, pokemon: data.pokemon as ExtractedMon[] });
    }
    const inventory = buildInventory(inputs, gamemaster, rankings, readOverrides());
    cache = { signature: sig, inventory, sources: inputs.map(i => i.source) };
    return cache;
  }

  return {
    inventory: () => load().inventory,
    sources: () => load().sources,
    /** Leagues with at least one ranked Pokémon. */
    leagues: (): League[] => LEAGUES.filter(l => load().inventory.some(p => p.leagues[l].ranked)),
    ranked: (league: League) => {
      if (!LEAGUES.includes(league)) return null;
      const ranked = rankedForLeague(load().inventory, league);
      return ranked.pokemon.length ? ranked : null;
    },
    /** Sets (or with null clears) the form of one Pokémon; only forms the video could not rule out are allowed. */
    setOverride(key: string, speciesId: string | null) {
      const p = load().inventory.find(x => x.key === key);
      if (!p) throw new InventoryError(`Unknown Pokémon ${key}`, 404);
      const overrides = readOverrides();
      if (speciesId === null) delete overrides[key];
      else {
        const original = p.overridden ? p.formAlternatives?.[0] : p.speciesId;
        const allowed = [p.speciesId, ...(p.formAlternatives ?? [])];
        if (!allowed.includes(speciesId))
          throw new InventoryError(`${speciesId} is not a possible form for this Pokémon (${allowed.join(', ')}).`);
        if (speciesId === original) delete overrides[key];
        else overrides[key] = speciesId;
      }
      fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2));
      cache = null;
    },
  };
}
