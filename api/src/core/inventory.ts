import type { Gamemaster } from './gamemaster.ts';
import { cpOf, hpOf, LEVELS } from './cp.ts';
import { LEAGUE_CAPS, type League } from './ivrank.ts';
import { rankCollection, type ExtractedMon, type RankedPokemon } from './rank.ts';
import type { SpeciesRanking } from './rankings.ts';

export const LEAGUES: League[] = ['great', 'ultra', 'master'];

export type { PvpokeEntry, PvpokeRankings, LeagueEval, InventoryPokemon, EvolutionEval } from './inventory-types.ts';
import type { PvpokeEntry, PvpokeRankings, LeagueEval, InventoryPokemon } from './inventory-types.ts';

/** Final evolutions of a species (all branches), not including itself. */
export function finalEvolutions(gm: Gamemaster, speciesId: string, seen = new Set<string>()): string[] {
  const next = gm.byId.get(speciesId)?.family?.evolutions ?? [];
  return next.flatMap(id => {
    if (seen.has(id) || !gm.byId.has(id)) return [];
    seen.add(id);
    const deeper = finalEvolutions(gm, id, seen);
    return deeper.length ? deeper : [id];
  });
}

/** Source name for an owned Pokémon's evolved version, so its rows get their own keys. */
const evolvedSource = (source: string, speciesId: string) => `${source}>${speciesId}`;

const rarityOf = (tags: string[] = []): InventoryPokemon['rarity'] =>
  tags.includes('mythical')
    ? 'mythical'
    : tags.includes('legendary')
      ? 'legendary'
      : tags.includes('ultrabeast')
        ? 'ultrabeast'
        : undefined;

export type ExtractionInput = { source: string; pokemon: ExtractedMon[] };

const CONFIDENCE_ORDER = { high: 3, medium: 2, low: 1 } as const;
export const monKey = (source: string, firstTimeSec: number) => `${source}@${firstTimeSec}`;

/** pvpoke entries → the per-species ranking the ranker expects; move names get "*" when elite/legacy. */
export function speciesRankings(gm: Gamemaster, entries: PvpokeEntry[]): Map<string, SpeciesRanking> {
  const out = new Map<string, SpeciesRanking>();
  entries.forEach((e, i) => {
    const sp = gm.byId.get(e.speciesId);
    if (!sp) return;
    const name = (id: string | undefined) => {
      if (!id) return '';
      return (gm.moves.get(id)?.name ?? id) + (sp.eliteMoves?.includes(id) ? '*' : '');
    };
    out.set(e.speciesId, {
      rank: i + 1,
      score: e.score ?? 0,
      csvName: sp.speciesName,
      speciesId: e.speciesId,
      dex: sp.dex,
      types: sp.types.filter(t => t !== 'none'),
      moves: { fast: name(e.moveset[0]), charged: [name(e.moveset[1]), name(e.moveset[2])] },
    });
  });
  return out;
}

/** The same Pokémon recorded in several videos (same species, CP and IVs) counts once. */
function dedupe(inputs: ExtractionInput[]): Array<{ source: string; mon: ExtractedMon }> {
  const byIdentity = new Map<string, { source: string; mon: ExtractedMon }>();
  for (const { source, pokemon } of inputs) {
    for (const mon of pokemon) {
      const iv = mon.ivs ? `${mon.ivs.atk}/${mon.ivs.def}/${mon.ivs.hp}` : '?';
      const id = `${mon.speciesId ?? mon.species}|${mon.cp}|${iv}`;
      const current = byIdentity.get(id);
      const rank = (m: ExtractedMon) => CONFIDENCE_ORDER[m.confidence ?? 'low'];
      if (!current || rank(mon) > rank(current.mon)) byIdentity.set(id, { source, mon });
    }
  }
  return [...byIdentity.values()];
}

/** A user-set form wins, but only among the forms the video could not rule out. */
function applyOverride(source: string, mon: ExtractedMon, overrides: Record<string, string>): ExtractedMon & { overridden?: boolean } {
  const wanted = overrides[monKey(source, mon.firstTimeSec)];
  const alternatives = mon.formAlternatives ?? [];
  if (!wanted || !mon.speciesId || wanted === mon.speciesId || !alternatives.includes(wanted)) return mon;
  return { ...mon, speciesId: wanted, formAlternatives: [mon.speciesId, ...alternatives.filter(a => a !== wanted)], overridden: true };
}

export function buildInventory(
  inputs: ExtractionInput[],
  gm: Gamemaster,
  rankings: PvpokeRankings,
  overrides: Record<string, string>,
): InventoryPokemon[] {
  const mons = dedupe(inputs).map(({ source, mon }) => ({ source, mon: applyOverride(source, mon, overrides) }));
  const grouped = new Map<string, ExtractedMon[]>();
  for (const { source, mon } of mons) grouped.set(source, [...(grouped.get(source) ?? []), mon]);
  // Pre-evolutions are also ranked as each final evolution: same IVs and level, CP recomputed.
  const evolvedOf = new Map<string, Array<{ speciesId: string; source: string; cp: number }>>();
  for (const { source, mon } of mons) {
    const cpm = LEVELS.find(l => l.level === mon.level)?.cpm;
    if (!mon.speciesId || !mon.ivs || !cpm) continue;
    for (const evo of finalEvolutions(gm, mon.speciesId)) {
      const stats = gm.statsById.get(evo);
      if (!stats) continue;
      const cp = cpOf(stats, mon.ivs, cpm);
      const hp = hpOf(stats, mon.ivs, cpm);
      const src = evolvedSource(source, evo);
      const evolved: ExtractedMon = {
        ...mon,
        speciesId: evo,
        species: gm.byId.get(evo)!.speciesName,
        cp,
        hp: { current: hp, max: hp },
        moves: null,
        formAlternatives: undefined,
      };
      grouped.set(src, [...(grouped.get(src) ?? []), evolved]);
      const key = monKey(source, mon.firstTimeSec);
      evolvedOf.set(key, [...(evolvedOf.get(key) ?? []), { speciesId: evo, source: src, cp }]);
    }
  }
  const rankerInputs = [...grouped].map(([source, pokemon]) => ({ source, pokemon }));

  const perLeague = new Map<League, Map<string, RankedPokemon>>();
  for (const league of LEAGUES) {
    const ranked = rankCollection(rankerInputs, league, speciesRankings(gm, rankings[league]), gm.statsById);
    perLeague.set(league, new Map(ranked.map(r => [monKey(r.source, r.firstTimeSec), r])));
  }

  const leaguesOf = (key: string) =>
    Object.fromEntries(
      LEAGUES.map(league => {
        const r = perLeague.get(league)!.get(key);
        const evaluation: LeagueEval = !r
          ? { eligible: false, ranked: false }
          : {
              eligible: true,
              ranked: r.ranked,
              unrankedReason: r.unrankedReason,
              speciesRank: r.speciesRank,
              speciesScore: r.speciesScore,
              recommendedMoves: r.recommendedMoves,
              iv50: r.iv50,
              iv51: r.iv51,
            };
        return [league, evaluation];
      }),
    ) as Record<League, LeagueEval>;

  const inventory: InventoryPokemon[] = mons.map(({ source, mon }) => {
    const key = monKey(source, mon.firstTimeSec);
    const species = mon.speciesId ? gm.byId.get(mon.speciesId) : undefined;
    const leagues = leaguesOf(key);
    const evolutions = (evolvedOf.get(key) ?? []).map(e => {
      const sp = gm.byId.get(e.speciesId)!;
      const evoKey = monKey(e.source, mon.firstTimeSec);
      return {
        speciesId: e.speciesId,
        name: sp.speciesName,
        dex: sp.dex,
        types: sp.types.filter(t => t !== 'none'),
        key: evoKey,
        cpNow: e.cp,
        leagues: leaguesOf(evoKey),
      };
    });
    return {
      key,
      source,
      firstTimeSec: mon.firstTimeSec,
      speciesId: mon.speciesId ?? null,
      species: mon.species,
      name: species?.speciesName ?? mon.species ?? '?',
      nickname: mon.nickname,
      cp: mon.cp,
      level: mon.level ?? null,
      ivs: mon.ivs,
      hpMax: mon.hp?.max ?? null,
      confidence: mon.confidence ?? 'low',
      dex: species?.dex,
      types: species?.types.filter(t => t !== 'none'),
      moves: mon.moves ?? null,
      ...(mon.formAlternatives?.length ? { formAlternatives: mon.formAlternatives } : {}),
      ...('overridden' in mon && mon.overridden ? { overridden: true } : {}),
      ...(rarityOf(species?.tags) ? { rarity: rarityOf(species?.tags) } : {}),
      ...(evolutions.length ? { evolutions } : {}),
      leagues,
    };
  });

  // Copy position per league: 1 = the user's best copy of that species for that league,
  // counting pre-evolutions that would evolve into it.
  for (const league of LEAGUES) {
    const bySpecies = new Map<string, LeagueEval[]>();
    const add = (speciesId: string | null, e: LeagueEval) => {
      if (speciesId && e.iv50) bySpecies.set(speciesId, [...(bySpecies.get(speciesId) ?? []), e]);
    };
    for (const p of inventory) {
      add(p.speciesId, p.leagues[league]);
      for (const evo of p.evolutions ?? []) add(evo.speciesId, evo.leagues[league]);
    }
    for (const copies of bySpecies.values()) {
      copies.sort((a, b) => a.iv50!.rank - b.iv50!.rank);
      copies.forEach((e, i) => {
        e.copy = { position: i + 1, of: copies.length };
      });
    }
  }
  return inventory;
}

/** The per-league ranking view of the inventory (eligible Pokémon only), in the RankedFile shape. */
export function rankedForLeague(inventory: InventoryPokemon[], league: League) {
  const cap = LEAGUE_CAPS[league];
  const pokemon: RankedPokemon[] = inventory
    .filter(p => p.leagues[league].eligible)
    .map(p => {
      const l = p.leagues[league];
      return {
        speciesId: p.speciesId,
        species: p.species,
        nickname: p.nickname,
        cp: p.cp,
        level: p.level,
        ivs: p.ivs,
        hpMax: p.hpMax,
        confidence: p.confidence,
        source: p.source,
        firstTimeSec: p.firstTimeSec,
        moves: p.moves,
        ...(p.formAlternatives ? { formAlternatives: p.formAlternatives } : {}),
        ranked: l.ranked,
        unrankedReason: l.unrankedReason,
        speciesRank: l.speciesRank,
        speciesScore: l.speciesScore,
        csvName: p.name,
        dex: p.dex,
        types: p.types,
        recommendedMoves: l.recommendedMoves,
        iv50: l.iv50,
        iv51: l.iv51,
      };
    });
  // Evolution candidates: the owned pre-evolution as the evolved species (only ranked ones are useful here).
  for (const p of inventory) {
    for (const evo of p.evolutions ?? []) {
      const l = evo.leagues[league];
      if (!l.eligible || !l.ranked) continue;
      pokemon.push({
        speciesId: evo.speciesId,
        species: evo.name,
        nickname: p.nickname,
        cp: evo.cpNow,
        level: p.level,
        ivs: p.ivs,
        hpMax: null,
        confidence: p.confidence,
        source: evo.key.slice(0, evo.key.lastIndexOf('@')),
        firstTimeSec: p.firstTimeSec,
        moves: null,
        ranked: true,
        speciesRank: l.speciesRank,
        speciesScore: l.speciesScore,
        csvName: evo.name,
        dex: evo.dex,
        types: evo.types,
        recommendedMoves: l.recommendedMoves,
        iv50: l.iv50,
        iv51: l.iv51,
        evolvesFrom: { key: p.key, name: p.name },
      });
    }
  }
  const ivRank = (p: RankedPokemon) => p.iv50?.rank ?? Infinity;
  pokemon.sort(
    (a, b) =>
      Number(b.ranked) - Number(a.ranked) ||
      (b.speciesScore ?? 0) - (a.speciesScore ?? 0) ||
      ivRank(a) - ivRank(b) ||
      (b.cp ?? 0) - (a.cp ?? 0),
  );
  return {
    league,
    cap: Number.isFinite(cap) ? cap : null,
    generatedAt: new Date().toISOString(),
    sources: [...new Set(pokemon.map(p => p.source))],
    csv: 'pvpoke',
    pokemon,
  };
}
