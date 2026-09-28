# Ranked viewer (React) — Design

**Date:** 2026-09-27
**Status:** Approved

## Goal

A local React page that shows the user's Pokémon ranked per league from `out/ranked/*.json`
(written by `npm run rank`), as a dense sortable table with filters, PokeAPI sprites and JSON export.
Video upload/processing from the page is v2; v1 is a viewer.

## Stack and layout

- `web/`: Vite 8 + React 19 + TypeScript, plain CSS (tokens on `:root`, dark mode via
  `prefers-color-scheme`). No UI libraries. New deps: `react`, `react-dom`, `@types/react`,
  `@types/react-dom`, `vite`, `@vitejs/plugin-react`.
- `npm run ui` → `vite --config web/vite.config.ts` (opens the browser).
- Data: `import.meta.glob('../../out/ranked/*.json', { eager: true })`; re-running `npm run rank`
  hot-reloads the page. Vite `server.fs.allow` includes the project root.

## Units

| File                       | Responsibility                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `web/src/types.ts`         | `RankedFile`, `RankedPokemon` (mirrors `src/core/rank.ts`, imported as a type)                                                    |
| `web/src/data.ts`          | Load ranked files via glob → `RankedFile[]` sorted great/ultra/master                                                             |
| `web/src/filters.ts`       | Pure: `applyFilters(pokemon, filters)`, `sortPokemon(pokemon, sort)`, `bestCopyPerSpecies`                                        |
| `web/src/pokeapi.ts`       | Pure `pokeapiSlug(speciesId)`; `getSprite(speciesId, dex)` with localStorage cache, 404 → dex fallback, max 6 concurrent requests |
| `web/src/components/*.tsx` | `App` (tabs + state), `FilterBar`, `RankedTable`, `Sprite`, `UnrankedList`                                                        |
| `web/src/styles.css`       | Table styling, badges, dark mode                                                                                                  |

## Filters and sorting

- Search: species name, csvName or nickname (case-insensitive substring).
- Type: any of the record's `types`. Confidence: all / high / medium+low.
- pvpoke top N: `speciesRank ≤ N` (empty = all).
- Best copy per species: keep the record with the lowest `iv50.rank` per `speciesId`.
- Sort keys: `default` (file order: species score, then IV rank), `pvp` (speciesRank),
  `iv50`, `sp` (statProductPct desc), `cp` (desc), `iv51`. Clicking the active header flips direction.

## Table columns

Sprite · Pokémon (csvName + nickname) · CP · IVs (15 highlighted) · IV#50 (rank / 4096) · SP% ·
L@cap · IV#51 · pvp# · score · moves (pvpoke fast / charged 1 / charged 2, `*` shown as "elite") ·
confidence badge (medium and low highlighted).

Unranked records are listed in a collapsible section under the table with their reason.
Export downloads the currently filtered + sorted list as `ranked-<league>-filtered.json`.

## PokeAPI

- `pokeapiSlug`: lowercase, `_` → `-`, `galarian` → `galar`, `alolan` → `alola`,
  `hisuian` → `hisui`, `paldean` → `paldea`; `_shadow` suffix dropped.
- Request `https://pokeapi.co/api/v2/pokemon/{slug}`; on 404 retry with `{dex}`.
  Use `sprites.front_default`. Cache `slug → url | null` in localStorage (`pokeapi-sprite:v1`).
- Verified: palkia-origin, giratina-altered, thundurus-incarnate, ho-oh, darmanitan-galar-standard,
  stunfisk-galar resolve; deoxys, mewtwo-armored, zacian-hero 404 → dex fallback.

## Testing

vitest for `filters.ts` and `pokeapiSlug`; `vite build` must compile; launch the dev server and
confirm the page serves the ranked data.

## Out of scope

Video upload/processing from the UI, shadow detection, editing records, persistence of filters.
