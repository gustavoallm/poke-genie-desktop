import type { BaseStats } from './cp.ts';
import type { Ivs } from './types.ts';
import type { SpeciesRanking } from './rankings.ts';
import { createIvRanker, LEAGUE_CAPS, type IvRankResult, type League } from './ivrank.ts';

export interface ExtractedMon {
  cp: number | null;
  speciesId?: string;
  species: string | null;
  nickname: string | null;
  ivs: Ivs | null;
  hp: { current: number; max: number } | null;
  level?: number;
  confidence?: 'high' | 'medium' | 'low';
  firstTimeSec: number;
  /** Move names read from a detail screen, when the video had one. */
  moves?: { fast: string; charged: string[] } | null;
  formAlternatives?: string[];
}

export interface RankedPokemon {
  speciesId: string | null;
  species: string | null;
  nickname: string | null;
  cp: number | null;
  level: number | null;
  ivs: Ivs | null;
  hpMax: number | null;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  firstTimeSec: number;
  moves: { fast: string; charged: string[] } | null;
  /** Forms the video could not rule out (identical base stats); the ranking uses speciesId. */
  formAlternatives?: string[];
  /** Set on evolution candidates: this row is the owned Pokémon `key` as it would be once evolved. */
  evolvesFrom?: { key: string; name: string };
  ranked: boolean;
  unrankedReason?: 'no-species' | 'no-ivs' | 'not-in-rankings';
  speciesRank?: number;
  speciesScore?: number;
  csvName?: string;
  dex?: number;
  types?: string[];
  recommendedMoves?: { fast: string; charged: [string, string] };
  iv50?: IvRankResult;
  iv51?: IvRankResult;
}

export function rankCollection(
  inputs: Array<{ source: string; pokemon: ExtractedMon[] }>,
  league: League,
  rankings: Map<string, SpeciesRanking>,
  statsById: Map<string, BaseStats>,
): RankedPokemon[] {
  const cap = LEAGUE_CAPS[league];
  const rank50 = createIvRanker(cap, 50);
  const rank51 = createIvRanker(cap, 51);
  const out: RankedPokemon[] = [];
  for (const { source, pokemon } of inputs) {
    for (const p of pokemon) {
      if (p.cp !== null && p.cp > cap) continue;
      const base: RankedPokemon = {
        speciesId: p.speciesId ?? null,
        species: p.species,
        nickname: p.nickname,
        cp: p.cp,
        level: p.level ?? null,
        ivs: p.ivs,
        hpMax: p.hp?.max ?? null,
        confidence: p.confidence ?? 'low',
        source,
        firstTimeSec: p.firstTimeSec,
        moves: p.moves ?? null,
        ...(p.formAlternatives?.length ? { formAlternatives: p.formAlternatives } : {}),
        ranked: false,
      };
      const stats = p.speciesId ? statsById.get(p.speciesId) : undefined;
      const r = p.speciesId ? rankings.get(p.speciesId) : undefined;
      if (!p.speciesId || !stats) {
        out.push({ ...base, unrankedReason: 'no-species' });
        continue;
      }
      if (!r) {
        out.push({ ...base, unrankedReason: 'not-in-rankings' });
        continue;
      }
      if (!p.ivs) {
        out.push({ ...base, unrankedReason: 'no-ivs' });
        continue;
      }
      out.push({
        ...base,
        ranked: true,
        speciesRank: r.rank,
        speciesScore: r.score,
        csvName: r.csvName,
        dex: r.dex,
        types: r.types,
        recommendedMoves: r.moves,
        iv50: rank50(p.speciesId, stats, p.ivs) ?? undefined,
        iv51: rank51(p.speciesId, stats, p.ivs) ?? undefined,
      });
    }
  }
  const ivRank = (p: RankedPokemon) => p.iv50?.rank ?? Infinity;
  return out.sort(
    (a, b) =>
      Number(b.ranked) - Number(a.ranked) ||
      (b.speciesScore ?? 0) - (a.speciesScore ?? 0) ||
      ivRank(a) - ivRank(b) ||
      (b.cp ?? 0) - (a.cp ?? 0),
  );
}
