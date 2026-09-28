import fs from 'node:fs';
import path from 'node:path';
import { OUT } from '../paths.ts';
import { LEAGUE_CAPS, type League } from '../core/ivrank.ts';
import { createTeamService, TeamsError } from '../core/teams/service.ts';

const args = process.argv.slice(2);
const league = (args[args.indexOf('--league') + 1] ?? 'ultra') as League;
const locks = args.flatMap((a, i) => (a === '--lock' ? [args[i + 1]] : []));
const styleArg = args.indexOf('--style');
const style = styleArg >= 0 ? Number(args[styleArg + 1]) : undefined;
if (!args.includes('--league') || !(league in LEAGUE_CAPS)) {
  console.error('usage: npm run teams -- --league great|ultra [--lock speciesId] [--lock speciesId] [--style 0..1] [--ignore-ivs]');
  process.exit(1);
}

try {
  const t0 = Date.now();
  const result = await createTeamService().generate(league, locks, style, args.includes('--ignore-ivs'));
  fs.mkdirSync(path.join(OUT, 'teams'), { recursive: true });
  const outFile = path.join(OUT, 'teams', `${league}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  console.log(
    `\n\x1b[1m${league.toUpperCase()} LEAGUE TEAMS\x1b[0m  ${result.candidates} candidates vs pvpoke top ${result.meta.length}` +
      `${locks.length ? `, locked: ${locks.join(', ')}` : ''} · ${((Date.now() - t0) / 1000).toFixed(1)}s → ${outFile}\n`,
  );
  result.teams.forEach((team, i) => {
    const members = team.members.map(m => {
      const c = m.candidate;
      const flags = [c.assumedMoves ? 'assumed moves' : '', ...c.assumedElite.map(e => `needs ${e}`)].filter(Boolean).join(', ');
      return `${m.role.padEnd(9)} ${c.name.padEnd(24)} CP${String(c.cp ?? '?').padEnd(5)} ${`L${c.currentLevel ?? '?'}→${c.level}`.padEnd(11)} ${c.moves.join(' / ')}${flags ? `  \x1b[2m(${flags})\x1b[0m` : ''}`;
    });
    console.log(
      `#${i + 1}  rating ${team.rating}  coverage ${team.coverage}  strength ${team.strength}  beats ${(team.beaten * 100).toFixed(0)}% of the meta`,
    );
    for (const line of members) console.log(`     ${line}`);
    console.log(`     \x1b[2mthreats: ${team.threats.map(t => `${t.name} (${t.coverage})`).join(', ')}\x1b[0m\n`);
  });
} catch (e) {
  console.error(e instanceof TeamsError ? e.message : e);
  process.exit(1);
}
