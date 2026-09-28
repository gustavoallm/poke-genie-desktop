export interface SpeciesRanking {
  rank: number;
  score: number;
  csvName: string;
  speciesId: string;
  dex: number;
  types: string[];
  moves: { fast: string; charged: [string, string] };
}

/** pvpoke "all overall rankings" CSV: rows are already sorted best-first; names contain no commas. */
export function parseRankingsCsv(csv: string, idByName: Map<string, string>): Map<string, SpeciesRanking> {
  const out = new Map<string, SpeciesRanking>();
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map(l => l.split(','));
  rows.forEach((c, i) => {
    const speciesId = idByName.get(c[0]);
    if (!speciesId) return;
    out.set(speciesId, {
      rank: i + 1,
      score: Number(c[1]),
      csvName: c[0],
      speciesId,
      dex: Number(c[2]),
      types: [c[3], c[4]].filter(t => t && t !== 'none'),
      moves: { fast: c[11], charged: [c[12], c[13]] },
    });
  });
  return out;
}
