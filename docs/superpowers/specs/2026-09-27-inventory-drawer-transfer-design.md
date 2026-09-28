# Inventory, 3-league drawer, transfer suggestions, ignore-IVs — Design

**Date:** 2026-09-27 · **Status:** Approved

## Goal

The app's purpose: create teams, rank Pokémon, know moves, manage the inventory. This adds a
cross-league inventory, per-Pokémon 3-league details, transfer suggestions, form overrides and an
"ignore IVs" mode.

## API

- **Inventory** (`api/src/core/inventory.ts`): every record from the top-level extraction outputs in
  `out/*.json` (files with a `pokemon` array), deduplicated by (speciesId or species, CP, IVs), keeping the
  higher-confidence record. Keys stay `<source>@<firstTimeSec>`.
- **Overrides** (`out/overrides.json`, `{ [key]: speciesId }`): applied before evaluation; a key may only
  be set to its own form or one of its `formAlternatives`. `PUT /api/overrides/:key { speciesId }`
  (`null` removes it).
- **Per-league evaluation** for great (1500), ultra (2500), master (no cap), from pvpoke
  `overall-<cap>.json` (rank = position, score, moveset ids) — no CSV needed:
  `eligible` (CP ≤ cap), `speciesRank`, `speciesScore`, `moveset`, `iv50`, `iv51`,
  `copy: { position, of }` (position among the user's eligible copies of that species by IV rank).
- **Endpoints:** `GET /api/inventory` → `{ generatedAt, sources, pokemon: InventoryPokemon[] }`;
  `GET /api/leagues` → leagues with eligible Pokémon; `GET /api/ranked/:league` → built from the
  inventory in the existing `RankedFile` shape (so the rankings view is unchanged), `csv: 'pvpoke'`.
- **Teams:** the service reads the league ranking from the inventory. `ignoreIvs: true` (teams and analyze)
  simulates each species with pvpoke's default IVs/level for the league instead of the copy's.

## Front

- **Transfer verdict** (pure, client-side, tested): keep for league L if eligible, `speciesRank ≤ K` and
  `copy.position ≤ N`; transfer if kept for no league. Reason: best-copy position and the best copy's
  IVs, or "not in pvpoke's top K for any league it can play". Defaults N = 2, K = 100.
- **My box** view: sidebar (search, verdict All/Keep/Transfer, keep-for league chips, N and K sliders);
  main: summary, Transfer section grouped by species with reasons, Keep list with league chips;
  a warning that shiny/lucky/costume aren't detected.
- **Drawer** (right side, any row or member card): 3 league cards (eligible or "CP too high"),
  species rank/score, IV rank/SP%, level & CP at cap, copy position, moves (E = elite), verdict,
  form picker when alternatives exist.
- **Ignore IVs** checkbox: rankings → one row per species sorted by pvpoke rank, IV columns hidden;
  team builder and My team → sent as `ignoreIvs`.
- Row click opens the drawer in My rankings and My box; member cards open it in the team views.

## Out of scope

Evolution suggestions, shiny/lucky detection, Master League team building.
