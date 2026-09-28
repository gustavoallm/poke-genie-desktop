# Ranked Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local React page (`npm run ui`) that shows `out/ranked/*.json` as a dense sortable, filterable table with PokeAPI sprites and JSON export.

**Architecture:** Vite app in `web/` that glob-imports the ranked JSON (hot reload on re-rank). Pure logic (`filters.ts`, `pokeapi.ts`) is unit-tested with vitest; components stay thin.

**Tech Stack:** Vite 8, React 19, TypeScript, plain CSS, vitest.

## Global Constraints

- No UI libraries; plain CSS with `:root` tokens and `prefers-color-scheme` dark mode.
- Only new deps: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `vite`, `@vitejs/plugin-react`.
- PokeAPI: `https://pokeapi.co/api/v2/pokemon/{slug}`, 404 → `{dex}`, cache in localStorage key `pokeapi-sprite:v1`, max 6 concurrent requests.
- Spec: `docs/superpowers/specs/2026-09-27-ranked-viewer-design.md`.

## File Structure

| File                                                                     | Responsibility                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`              | Vite app shell and config                                                |
| `web/src/types.ts`                                                       | `RankedFile`, re-exported `RankedPokemon`/`League` types from `src/core` |
| `web/src/data.ts`                                                        | Glob-load `out/ranked/*.json`                                            |
| `web/src/filters.ts` (+ `.test.ts`)                                      | Filtering, best copy per species, sorting                                |
| `web/src/pokeapi.ts` (+ `.test.ts`)                                      | Slug mapping, cached/limited sprite lookup                               |
| `web/src/components/{App,FilterBar,RankedTable,Sprite,UnrankedList}.tsx` | UI                                                                       |
| `web/src/main.tsx`, `web/src/styles.css`                                 | Entry and styles                                                         |

---

### Task 1: Scaffold + pure logic (filters, PokeAPI slugs)

**Produces:**

- `interface Filters { search: string; type: string; confidence: 'all' | 'high' | 'check'; topN: number | null; bestCopy: boolean }`, `DEFAULT_FILTERS`
- `type SortKey = 'default' | 'pvp' | 'iv50' | 'sp' | 'cp' | 'iv51'`, `interface Sort { key: SortKey; reversed: boolean }`
- `applyFilters(list: RankedPokemon[], f: Filters): RankedPokemon[]`, `bestCopyPerSpecies(list)`, `sortPokemon(list, sort)`
- `pokeapiSlug(speciesId: string): string`, `getSprite(speciesId: string, dex?: number): Promise<string | null>`

- [ ] Step 1: install deps: `npm i react react-dom && npm i -D vite @vitejs/plugin-react @types/react @types/react-dom`; add script `"ui": "vite --config web/vite.config.ts"`.
- [ ] Step 2: failing tests `web/src/filters.test.ts` and `web/src/pokeapi.test.ts` (code in repo; cases: search matches nickname/csvName, type filter, confidence 'check' = medium+low, topN, best copy keeps lowest iv50 rank per species, sort by sp desc / cp desc / pvp asc with missing values last, reversed flips, default keeps order; slugs `palkia_origin→palkia-origin`, `darmanitan_galarian_standard→darmanitan-galar-standard`, `marowak_alolan→marowak-alola`, `typhlosion_hisuian→typhlosion-hisui`, `snorlax_shadow→snorlax`, `ho_oh→ho-oh`).
- [ ] Step 3: `npx vitest run web` → FAIL (modules missing).
- [ ] Step 4: implement `web/src/types.ts`, `web/src/filters.ts`, `web/src/pokeapi.ts`.
- [ ] Step 5: `npx vitest run web` → PASS.

### Task 2: Components and page

- [ ] Step 1: `web/index.html`, `web/vite.config.ts` (root = `web/`, `server.fs.allow` project root, `server.open`, build to `out/web`), `web/tsconfig.json` (DOM lib, `jsx: react-jsx`, `types: ["vite/client"]`, `allowImportingTsExtensions`).
- [ ] Step 2: `web/src/data.ts`, `main.tsx`, `components/*.tsx`, `styles.css` per spec (tabs, filter bar, table columns, unranked section, export).
- [ ] Step 3: `npx tsc -p web --noEmit` clean; `npx vite build --config web/vite.config.ts` succeeds.

### Task 3: Verify in the running app

- [ ] Step 1: start `npm run ui` in the background; fetch `/` and the data module to confirm the page serves and the ranked JSON is bundled.
- [ ] Step 2: full `npx vitest run`, root `npx tsc --noEmit`.
