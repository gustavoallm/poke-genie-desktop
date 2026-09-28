import { createOcr } from '../extraction/ocr.ts';
import { processFile } from '../extraction/pipeline.ts';
import { createProgress } from '../extraction/progress.ts';
import { loadDex } from '../extraction/solve.ts';
import { fromInvocation } from '../paths.ts';

const args = process.argv.slice(2);
const raw = args.includes('--raw');
const files = args.filter(a => a !== '--raw').map(fromInvocation);
if (!files.length) {
  console.error('usage: npm run extract -- [--raw] <video-or-image>...');
  process.exit(1);
}
const dex = raw ? null : loadDex();
const ocr = await createOcr();
const progress = createProgress();
for (const file of files) {
  const t0 = Date.now();
  console.log(`\n\x1b[1m${file}\x1b[0m`);
  const out = await processFile(file, ocr, dex, progress);
  progress.end();
  console.log(`${out.source}: ${out.pokemon.length} pokemon, ${out.bag.length} bag cells in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const p of out.pokemon) {
    console.log(
      `  CP${p.cp ?? '?'} ${p.nickname ?? '?'} ${p.speciesId ?? p.species ?? '?'} L${p.level ?? '?'} iv=${p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.hp}` : '?'} hp=${p.hp?.max ?? '?'} moves=${p.moves ? [p.moves.fast, ...p.moves.charged].join(',') : '?'} (${p.frameCount}f)`,
    );
  }
}
await ocr.close();
