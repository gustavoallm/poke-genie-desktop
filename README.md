# Poke Genie Desktop

Reads Pokémon GO screen recordings and screenshots locally, then ranks your Pokémon against pvpoke,
builds teams and suggests what to transfer.

## Layout

```
api/                 Node + TypeScript: extraction, ranking, battle sim, teams, HTTP API (port 4000)
  data/              pvpoke gamemaster and rankings
  src/  test/
front/               Vite + React UI (port 5173); front/public holds the ball images
docs/                design specs, plans, and POC learnings
scripts/dev.mjs      starts api + front together
samples/             your videos and screenshots (input, not committed)
out/                 generated (not committed)
  extractions/       one <name>.json per video or screenshot: the inventory is built from these
  overrides.json     forms you picked in the UI (e.g. Galarian Stunfisk)
  cache/<name>/      extracted frames + per-frame OCR; safe to delete, `regroup` needs it
  ranked/  teams/    reports written by `npm run rank` / `npm run teams`
node_modules/        the only dependency folder (npm workspaces install api + front here)
```

## Commands

```
npm install
npm run dev                                   # API + UI
npm run extract -- samples/<video-or-image>   # writes out/extractions/<name>.json
npm run regroup -- <name>                     # rebuild an extraction from out/cache without OCR
npm test
npm run typecheck
npm run format                                # Prettier on everything (format:check to only check)
```
