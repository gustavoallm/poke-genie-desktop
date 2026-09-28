import { FIXTURES } from '../../src/paths.ts';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import type { OcrPage } from '../../src/extraction/types.ts';
import { classify } from '../../src/extraction/classify.ts';
import { parseCommon, parseSpecies, parseTypes, parseCandy, parseMoves, parseBag, normalizeName } from '../../src/extraction/parse.ts';

const fx = (n: string): OcrPage => JSON.parse(fs.readFileSync(`${FIXTURES}/${n}.json`, 'utf8'));

describe('classify', () => {
  it('detects each screen type', () => {
    expect(classify(fx('appraisal'))).toBe('appraisal');
    expect(classify(fx('appraisal-shot'))).toBe('appraisal');
    expect(classify(fx('bag'))).toBe('bag');
    expect(classify(fx('moves'))).toBe('detail');
    expect(classify(fx('detail'))).toBe('detail');
    expect(classify(fx('menu'))).toBe('other');
  });
  it('detects the bag when the TAGS/EGGS header is clipped at the screen edge', () => {
    const line = (text: string) => ({ text, conf: 90, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, words: [] });
    const page = {
      width: 768,
      height: 1696,
      lines: [line('AGS POKEMON E'), line('1252/1275 z'), line('Q Search'), line('2898 2875 »2875')],
    };
    expect(classify(page)).toBe('bag');
  });
});

describe('parsers', () => {
  it('reads CP, nickname, HP and species on appraisal (skipping the LUCKY line)', () => {
    const p = fx('appraisal');
    const common = parseCommon(p);
    expect(common.cp).toBe(3204);
    expect(normalizeName(common.nickname!)).toBe('M84');
    expect(common.hp).toEqual({ current: 168, max: 168 });
    expect(parseSpecies(p)).toBe('Salamence');
  });
  it('reads the appraisal screenshot', () => {
    const p = fx('appraisal-shot');
    expect(parseCommon(p)).toEqual({ cp: 2497, nickname: '.U 95', hp: { current: 150, max: 150 } });
    expect(parseSpecies(p)).toBe('Charizard');
  });
  it('reads types, candy and moves on the detail screen', () => {
    const p = fx('moves');
    expect(parseTypes(p)).toEqual(['WATER', 'FLYING']);
    expect(parseCandy(p)).toBe('MAGIKARP');
    expect(parseMoves(p)).toEqual({ fast: 'Waterfall', charged: ['Hydro Pump', 'Crunch'] });
  });
  it('returns nothing for moves when the moves list is not visible', () => {
    expect(parseMoves(fx('appraisal'))).toBeUndefined();
  });
  it('reads bag cells as CP + name pairs', () => {
    const cells = parseBag(fx('bag')).map(c => `${c.cp} ${normalizeName(c.name)}`);
    expect(cells).toEqual(
      expect.arrayContaining([
        '2708 M89',
        '2690 M62',
        '2681 HIPPOWDON',
        '2599 HERACROSS',
        '2590 LUGIA',
        '2584 GARDEVOIR',
        '2580 BUGFIGHT1',
      ]),
    );
  });
  it.each([
    ['cpl797', 1797], // leading 1 read as l (every CP below 2000 in the full-HD video)
    ['cpr1803', 1803],
    ['cpI642 *', 1642],
    ['cp2497 *', 2497],
    ['cr3204.', 3204],
    ['cpl1731', 1731], // a look-alike right before the real 1 is the same glyph read twice
    ['cp?064', undefined], // first digit lost; a CP never starts with 0, so the read is unusable
  ])('reads CP from the OCR line %s', (text, cp) => {
    const line = { text, conf: 80, bbox: { x0: 250, y0: 90, x1: 450, y1: 150 }, words: [] };
    expect(parseCommon({ width: 768, height: 1669, lines: [line] }).cp).toBe(cp);
  });
  it('normalizes names for comparison', () => {
    expect(normalizeName('*.M 89 D')).toBe('M89D');
    expect(normalizeName('Gyarados 87 /')).toBe('GYARADOS87');
  });
});

describe('parseTypes on appraisal frames', () => {
  it('reads type words from the partly covered weight/height row', () => {
    const line = (text: string) => ({ text, conf: 80, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, words: [] });
    const page = {
      width: 768,
      height: 1669,
      lines: ['39.96kg O CG 1.07m', 'WEIGHT', 'FIRE / Gj IGHT', 'This Marowak was caught on 1/1/2020'].map(line),
    };
    expect(parseTypes(page)).toEqual(['FIRE']);
  });
});
