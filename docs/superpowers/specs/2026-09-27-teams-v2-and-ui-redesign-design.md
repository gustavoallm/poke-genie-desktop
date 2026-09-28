# Team generator v2 + UI/UX redesign — Design

**Date:** 2026-09-27
**Status:** Approved

## Why

The user's proven Ultra League team (Empoleon + Swampert + Giratina Altered, winning in real
battles) scored 469 and ranked ~41,600th of ~100k teams in generator v1, while spice picks
(Pangoro, Skeledirge) topped the list. v1 rewards matchup coverage only, ignores proven
consistency, and scores every member on the average of all shield scenarios. The UI also needs
richer filtering and a clearer structure.

## Generator v2 (api)

- **Role-aware ratings.** Scenario weights (order 0-0, 1-1, 2-2):
  lead `[0.2, 0.6, 0.2]`, safe swap `[1/3, 1/3, 1/3]`, closer `[0.6, 0.3, 0.1]`.
  A member's rating vs a threat = Σ weight · rating. Roles per team = the best of the 6 permutations.
- **Coverage score** (per team, per role assignment): Σ_t w_t · (best member rating − 150 · max(0, losers − 1)) / Σ w_t,
  losers = members rated < 500 vs t; `w_t` = pvpoke score of the threat.
- **Strength score:** mean pvpoke score of the members.
- **Blend:** both scores are min-max normalised over all teams evaluated in the request;
  `rating = (1 − k) · coverage + k · strength`, `k = 0.6 · (1 − style)`, `style ∈ [0, 1]`
  (0 = consistent, 1 = spice), default style calibrated so the user's proven team ranks top 10
  without other regressions (reported, not forced). Shown as 0–100.
- **Candidates:** best copy per species, top 60 by pvpoke score (+ locked / analysed copies).
- **Output per team:** members with roles, rating (0–100), coverage score, strength, % meta beaten,
  top threats, and `matchups[member][meta][scenario]` for the heatmap (top 50 meta).
- **Analyze:** `POST /api/teams/analyze { league, members: [key, key, key], style }` → the team report:
  rating, rank among all teams from the box, % beaten, threats, weakest slot (the slot whose best swap
  gains most), up to 3 swap suggestions (`{ slot, from, to, delta, fixes: threat names }`), matchups.
- **Builder:** `POST /api/teams { league, locks (≤ 2 species ids), style }` → top 10 teams as above.

## Front redesign

- **Layout:** left sidebar (brand, league segmented control GL/UL/ML, views My rankings / Team builder /
  My team, then view-specific controls); main content on the right.
- **Style:** Pokémon type colors (chips, type pills), rounded row cards, soft shadows, light default,
  dark via `prefers-color-scheme`; design tokens on `:root`.
- **Shared components:** `Combobox` (searchable select, keyboard accessible), `RangeSlider`,
  `TypeChip`/`TypePill`, `Segmented`, `Heatmap` (member × meta, shield toggle 0/1/2), `Sprite`.
- **My rankings filters:** search; types (multi, type colors, any/all); IV rank ≤; SP% ≥; pvpoke top N;
  CP min/max; best copy per species; readiness (all / ready now / needs candy / needs XL — ready now =
  current level ≥ level at cap, needs XL = level at cap > 40); elite move (any / hide / only);
  confidence (multi). Active-filter chips + Clear all + result count. Rounded rows, sortable headers.
- **Team builder:** sidebar locks (Combobox ×2), style slider, Generate; main = top-10 list (3 sprites +
  rating) and detail (members, roles, moves, power-up, heatmap, threats).
- **My team:** single column — 3 slot Comboboxes (specific copies) → verdict → heatmap → threats → swaps.

## Build order

1. Generator v2 + analyze (api, TDD) and the acceptance check.
2. Front shell, tokens, shared components.
3. My rankings filters.
4. Team builder view.
5. My team view.

## Out of scope

Presets/shareable URLs, column chooser (not selected); shadow detection; asymmetric shield scenarios.

## Calibration result (2026-09-27)

The user's proven team (Empoleon 12/13/14 + Swampert 3/14/9 + Giratina Altered 14/14/10) out of
34,220 possible teams from the box (top 60 species, best copies):

| style         | rank              | top team                         |
| ------------- | ----------------- | -------------------------------- |
| 0.0           | #472 (top 1.4%)   | Skeledirge / Virizion / Empoleon |
| 0.2 (default) | #789 (top 2.3%)   | Skeledirge / Steelix / Virizion  |
| 0.3           | #1,254 (top 3.7%) | Skeledirge / Steelix / Virizion  |
| 1.0           | #13,784           | Skeledirge / Pangoro / Magnezone |

v1 had it around the 41st percentile. Top 10 was **not** reached: against pvpoke's top 50 the
simulator sees the team losing to Walrein, Walrein (Shadow), Corviknight (Shadow),
Feraligatr (Shadow) and Guzzlord. Forcing top 10 would overfit one anecdote; the gap points at
the opposition model (pvpoke's top 50 includes many Shadow Pokémon), which a meta-preset
option could address later. Default style set to 0.2.
