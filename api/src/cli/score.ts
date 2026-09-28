import fs from 'node:fs';
import path from 'node:path';
import { score, type Truth } from '../extraction/score.ts';
import type { Output } from '../extraction/types.ts';
import { EXTRACTIONS, TRUTH } from '../paths.ts';

const GATE: Record<string, number> = { cp: 95, species: 95, ivs: 95, hp: 90, moves: 90, nickname: 90, bagRecall: 90, bagPrecision: 90 };
const totals: Record<string, { ok: number; total: number }> = {};
for (const file of fs.readdirSync(TRUTH)) {
  const name = path.basename(file, '.json');
  const outFile = path.join(EXTRACTIONS, `${name}.json`);
  if (!fs.existsSync(outFile)) {
    console.log(`${name}: no output, run npm run extract first`);
    continue;
  }
  const r = score(
    JSON.parse(fs.readFileSync(outFile, 'utf8')) as Output,
    JSON.parse(fs.readFileSync(path.join(TRUTH, file), 'utf8')) as Truth,
  );
  console.log(`\n${name}  missed=${JSON.stringify(r.missed)} extra=${JSON.stringify(r.extra)}`);
  for (const [k, v] of Object.entries(r.fields)) {
    console.log(`  ${k.padEnd(13)} ${v.ok}/${v.total}`);
    totals[k] ??= { ok: 0, total: 0 };
    totals[k].ok += v.ok;
    totals[k].total += v.total;
  }
}
console.log('\nTOTAL');
let pass = true;
for (const [k, v] of Object.entries(totals)) {
  const pct = (100 * v.ok) / v.total,
    need = GATE[k] ?? 90,
    ok = pct >= need;
  pass &&= ok;
  console.log(`  ${k.padEnd(13)} ${pct.toFixed(1).padStart(5)}%  (need ${need}%)  ${ok ? 'PASS' : 'FAIL'}`);
}
console.log(`\nGATE: ${pass ? 'PASS' : 'FAIL'}`);
