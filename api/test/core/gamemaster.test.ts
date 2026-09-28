import { describe, it, expect } from 'vitest';
import { loadGamemaster } from '../../src/core/gamemaster.ts';

describe('loadGamemaster', () => {
  const gm = loadGamemaster();
  it('maps pvpoke display names to species ids, including forms and shadows', () => {
    expect(gm.idByName.get('Palkia (Origin)')).toBe('palkia_origin');
    expect(gm.idByName.get('Snorlax (Shadow)')).toBe('snorlax_shadow');
  });
  it('maps species ids to base stats', () => {
    expect(gm.statsById.get('salamence')).toEqual({ atk: 277, def: 168, hp: 216 });
  });
});
