import fs from 'node:fs';
import path from 'node:path';
import { loadGamemaster } from '../core/gamemaster.ts';
import { parseRankingsCsv } from '../core/rankings.ts';
import { LEAGUE_CAPS, type League } from '../core/ivrank.ts';
import { rankCollection, type ExtractedMon } from '../core/rank.ts';
import { fromInvocation, OUT } from '../paths.ts';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const league = (opt('--league') ?? 'ultra') as League;
const csvArg = opt('--csv');
const csvFile = csvArg && fromInvocation(csvArg);
const top = Number(opt('--top') ?? 30);
if (!(league in LEAGUE_CAPS) || !csvFile || !args.length) {
  console.error('usage: npm run rank -- --league great|ultra|master --csv <pvpoke rankings csv> [--top N] <extraction.json>...');
  process.exit(1);
}

const gm = loadGamemaster();
const rankings = parseRankingsCsv(fs.readFileSync(csvFile, 'utf8'), gm.idByName);
const inputs = args
  .map(fromInvocation)
  .map(f => ({ source: path.basename(f), pokemon: (JSON.parse(fs.readFileSync(f, 'utf8')) as { pokemon: ExtractedMon[] }).pokemon }));
const pokemon = rankCollection(inputs, league, rankings, gm.statsById);

fs.mkdirSync(path.join(OUT, 'ranked'), { recursive: true });
const outFile = path.join(OUT, 'ranked', `${league}.json`);
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      league,
      cap: LEAGUE_CAPS[league],
      generatedAt: new Date().toISOString(),
      sources: inputs.map(i => i.source),
      csv: path.basename(csvFile),
      pokemon,
    },
    null,
    2,
  ),
);

const ranked = pokemon.filter(p => p.ranked);
console.log(
  `\n\x1b[1m${league.toUpperCase()} LEAGUE\x1b[0m  ${ranked.length} ranked, ${pokemon.length - ranked.length} unranked → ${outFile}\n`,
);
console.log('  pvp#  species                     score     CP  IVs       IV#50    SP%  L@cap  IV#51  conf');
for (const p of ranked.slice(0, top)) {
  const iv = p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.hp}` : '?';
  console.log(
    `  ${String(p.speciesRank).padStart(4)}  ${(p.csvName ?? '').padEnd(26)}  ${p.speciesScore!.toFixed(1).padStart(5)}  ${String(p.cp ?? '?').padStart(5)}  ${iv.padEnd(8)}  ${String(p.iv50?.rank ?? '?').padStart(5)}  ${(p.iv50?.statProductPct ?? 0).toFixed(1).padStart(5)}  ${String(p.iv50?.level ?? '?').padStart(5)}  ${String(p.iv51?.rank ?? '?').padStart(5)}  ${p.confidence}`,
  );
}
const reasons = pokemon.filter(p => !p.ranked).map(p => `${p.species ?? '?'} (${p.unrankedReason})`);
if (reasons.length) console.log(`\n  unranked: ${reasons.join(', ')}`);
