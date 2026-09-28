import type { OcrPage, ScreenType } from './types.ts';

export function classify(page: OcrPage): ScreenType {
  const text = page.lines
    .map(l => l.text)
    .join('\n')
    .toUpperCase();
  if (/THIS\s+\S.*\s+WAS\b/.test(text)) return 'appraisal';
  // The TAGS / EGGS tab labels are often clipped at the screen edge; POKEMON + the search bar is stable.
  if (/POK[EÉ]MON/.test(text) && /SEARCH/.test(text)) return 'bag';
  if (/STARDUST|WEIGHT|GYMS\s*&?\s*RAIDS/.test(text) && !/APPRAISE/.test(text)) return 'detail';
  return 'other';
}
