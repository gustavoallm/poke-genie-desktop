import { describe, it, expect } from 'vitest';
import { pokeapiSlug } from './pokeapi.ts';

describe('pokeapiSlug', () => {
  it.each([
    ['palkia_origin', 'palkia-origin'],
    ['darmanitan_galarian_standard', 'darmanitan-galar-standard'],
    ['marowak_alolan', 'marowak-alola'],
    ['typhlosion_hisuian', 'typhlosion-hisui'],
    ['tauros_paldean', 'tauros-paldea'],
    ['snorlax_shadow', 'snorlax'],
    ['ho_oh', 'ho-oh'],
    ['empoleon', 'empoleon'],
  ])('%s -> %s', (id, slug) => {
    expect(pokeapiSlug(id)).toBe(slug);
  });
});
