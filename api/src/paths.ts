import path from 'node:path';

export const API_ROOT = path.resolve(import.meta.dirname, '..');
export const ROOT = path.resolve(API_ROOT, '..');
export const DATA = path.join(API_ROOT, 'data');
export const OUT = path.join(ROOT, 'out');
/** One result per extracted video or screenshot (`<name>.json`); the inventory is built from these. */
export const EXTRACTIONS = path.join(OUT, 'extractions');
/** Per-input working files: `<name>/frames/*.png` and `<name>/frames.json`. Safe to delete; `regroup` needs them. */
export const CACHE = path.join(OUT, 'cache');
export const SAMPLES = path.join(ROOT, 'samples');
export const TRUTH = path.join(API_ROOT, 'test', 'truth');
export const FIXTURES = path.join(API_ROOT, 'test', 'fixtures');

/** CLI arguments are relative to where npm was invoked (INIT_CWD), not the workspace folder npm runs in. */
export const fromInvocation = (p: string) => path.resolve(process.env.INIT_CWD ?? process.cwd(), p);
