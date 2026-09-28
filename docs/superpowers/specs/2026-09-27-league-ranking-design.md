# League ranking — Design

**Date:** 2026-09-27
**Status:** Approved

## Goal

Rank the user's extracted Pokémon for a PvP league against pvpoke's rankings CSV:
how good the **species** is (pvpoke rank/score) and how good **this copy's IVs** are
(stat-product rank among all 4096 IV spreads). Output a JSON file the future React UI
reads; the UI will fetch sprites/names from PokeAPI by dex number.

First target: Ultra League (CP ≤ 2500) with `samples/cp2500_all_overall_rankings.csv`
and `out/only-iv-full-hd.json` (223 mons with CP 1500–2500).

## Decisions

| Topic                 | Decision                                                              |
| --------------------- | --------------------------------------------------------------------- |
| Level cap for IV rank | Level 50 primary; level 51 (best buddy) shown as a second rank        |
| Default ordering      | pvpoke species score desc, then IV rank (level 50) asc                |
| Shadows               | Not detected by extraction yet; every mon is matched as non-shadow    |
| Where the code lives  | Pure TS modules in `src/core/` so the React app can import them later |

## Components

| File                   | Responsibility                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/cp.ts`       | CPM table, CP/HP formulas (moved from `poc/src/cp.ts`; POC imports from here)                                                                  |
| `src/core/rankings.ts` | Parse a pvpoke rankings CSV → `Map<speciesId, SpeciesRanking>` (name → speciesId via gamemaster)                                               |
| `src/core/ivrank.ts`   | For a species + league cap + max level: best level under the cap for each IV spread, stat product, rank 1..4096 (cached per species/cap/level) |
| `src/core/rank.ts`     | Combine extraction records + rankings + IV ranks → sorted `RankedPokemon[]`                                                                    |
| `src/rank-cli.ts`      | `npm run rank -- --league ultra --csv <csv> <extraction.json>...` → `out/ranked/<league>.json` + top-N table                                   |

## IV rank

For each IV spread (atk, def, hp ∈ 0..15):

1. Highest level L (1..maxLevel, half steps) with CP ≤ cap. If none (CP at level 1 > cap), the spread is ineligible.
2. Stats at L: atk' = (base.atk + atk)·cpm, def' = (base.def + def)·cpm, hp' = ⌊(base.hp + hp)·cpm⌋.
3. Stat product = atk'·def'·hp'.

Rank = 1 + number of spreads with a strictly greater stat product. `statProductPct` = own / best × 100.
Master League (no cap): every spread uses maxLevel.

Leagues: `great` 1500, `ultra` 2500, `master` no cap.

## Ranked record

```ts
interface RankedPokemon {
  // from extraction
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
  // from pvpoke CSV
  ranked: boolean;
  unrankedReason?: 'no-species' | 'no-ivs' | 'not-in-rankings';
  speciesRank?: number;
  speciesScore?: number;
  csvName?: string;
  dex?: number;
  types?: string[];
  recommendedMoves?: { fast: string; charged: [string, string] }; // '*' = elite/legacy, kept as in CSV
  // IV rank at level 50 and 51
  iv50?: IvRankResult;
  iv51?: IvRankResult;
}
interface IvRankResult {
  rank: number;
  statProduct: number;
  statProductPct: number;
  level: number;
  cp: number;
}
```

Mons with CP above the league cap are excluded (not eligible). Unranked mons are listed
after ranked ones.

Output file: `{ league, cap, generatedAt, sources: string[], csv: string, pokemon: RankedPokemon[] }`.

## Testing

- `ivrank`: reproduce pvpoke CSV rows from gamemaster `defaultIVs.cp2500`:
  Tinkaton 12/15/15 → level 50, CP 2499, stat product ≈ 4 428 816;
  Corviknight 4/14/13 → level 47, CP 2497. Ranks cover 1..4096; the best spread has pct 100.
- Level-capped species: 15/15/15 on a low-stat species reaches maxLevel under the cap.
- `rankings`: CSV parsing, shadow row names map to `_shadow` ids.
- `rank`: ordering, unranked reasons, CP-above-cap exclusion.

## Out of scope

Shadow detection, move matching (appraisal videos have no moves), React UI and PokeAPI
calls (next step), candy/stardust costs.
