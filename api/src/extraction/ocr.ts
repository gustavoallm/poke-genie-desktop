import { createScheduler, createWorker } from 'tesseract.js';
import { createRequire } from 'node:module';
import path from 'node:path';
import sharp from 'sharp';
import type { OcrLine, OcrPage } from './types.ts';

const require = createRequire(import.meta.url);
const langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0');

export type Ocr = Awaited<ReturnType<typeof createOcr>>;

export async function createOcr(poolSize = 4) {
  const scheduler = createScheduler();
  for (let i = 0; i < poolSize; i++) {
    const worker = await createWorker('eng', 1, { langPath, gzip: true, cacheMethod: 'none' });
    await worker.setParameters({ user_defined_dpi: '300' }); // frames carry no DPI; silences "Invalid resolution" warnings
    scheduler.addWorker(worker);
  }
  return {
    async recognize(png: Buffer): Promise<OcrPage> {
      const img = sharp(png);
      const { width = 0, height = 0 } = await img.metadata();
      const gray = await img.grayscale().png().toBuffer();
      const { data } = await scheduler.addJob('recognize', gray, {}, { blocks: true });
      const lines: OcrLine[] = (data.blocks ?? [])
        .flatMap(b => b.paragraphs.flatMap(p => p.lines))
        .map(l => ({
          text: l.text.trim(),
          conf: l.confidence,
          bbox: l.bbox,
          words: l.words.map(w => ({ text: w.text, conf: w.confidence, bbox: w.bbox })),
        }));
      return { width, height, lines };
    },
    close: () => scheduler.terminate(),
  };
}
