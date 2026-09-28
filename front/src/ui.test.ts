import { describe, it, expect } from 'vitest';
import { readableTextOn, typeColor } from './typeColors.ts';
import { matchOptions } from './components/comboboxMatch.ts';

describe('typeColor', () => {
  it('returns the Pokémon type color and a neutral fallback', () => {
    expect(typeColor('water')).toBe('#6390F0');
    expect(typeColor('WATER')).toBe('#6390F0');
    expect(typeColor('unknown')).toBe('#9aa3b5');
  });
  it('picks dark text on light type colors and white on dark ones', () => {
    expect(readableTextOn(typeColor('electric'))).toBe('#1d2433');
    expect(readableTextOn(typeColor('dragon'))).toBe('#ffffff');
  });
});

describe('matchOptions', () => {
  const options = [
    { value: 'a', label: 'Giratina (Altered)', sub: 'CP 2472 · 14/14/10' },
    { value: 'b', label: 'Empoleon', sub: 'CP 2496 · U72' },
    { value: 'c', label: 'Swampert', sub: 'CP 2494' },
  ];
  it('matches label and sub text, labels starting with the query first', () => {
    expect(matchOptions(options, 'e').map(o => o.value)).toEqual(['b', 'a', 'c']);
    expect(matchOptions(options, 'u72').map(o => o.value)).toEqual(['b']);
    expect(matchOptions(options, '').map(o => o.value)).toEqual(['a', 'b', 'c']);
  });
});
