import { useMemo, useState } from 'react';
import {
  activeFilterChips,
  applyFilters,
  bestCopyPerSpecies,
  clearFilter,
  DEFAULT_FILTERS,
  sortPokemon,
  type Filters,
  type Sort,
  type SortKey,
} from '../filters.ts';
import { pokemonKey } from '../api.ts';
import { useApp } from '../appContext.ts';
import type { RankedFile } from '../types.ts';
import { FilterPanel } from './FilterPanel.tsx';
import { RankedTable } from './RankedTable.tsx';
import { UnrankedList } from './UnrankedList.tsx';

function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RankingsView({ file }: { file: RankedFile }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<Sort>({ key: 'default', reversed: false });
  const [ignoreIvs, setIgnoreIvs] = useState(false);
  const { openPokemon } = useApp();
  const ranked = useMemo(() => file.pokemon.filter(p => p.ranked), [file]);
  const unranked = useMemo(() => file.pokemon.filter(p => !p.ranked), [file]);
  const types = useMemo(() => [...new Set(ranked.flatMap(p => p.types ?? []))].sort(), [ranked]);
  // Ignore IVs: one row per species, ordered by how good the species is (pvpoke rank).
  const visible = useMemo(() => {
    const filtered = applyFilters(ranked, filters);
    return ignoreIvs ? sortPokemon(bestCopyPerSpecies(filtered), { key: 'pvp', reversed: false }) : sortPokemon(filtered, sort);
  }, [ranked, filters, sort, ignoreIvs]);
  const chips = activeFilterChips(filters);
  const onSort = (key: SortKey) => setSort(s => (s.key === key ? { key, reversed: !s.reversed } : { key, reversed: false }));

  return (
    <>
      <aside className="view-controls" aria-label="Filters">
        <FilterPanel filters={filters} types={types} onChange={setFilters} />
      </aside>
      <section className="view-main">
        <header className="view-head">
          <div>
            <h1>My rankings</h1>
            <p className="meta">
              <strong>{visible.length}</strong> of {ranked.length} ranked · CP ≤ {file.cap ?? '∞'} · {file.csv}
            </p>
          </div>
          <div className="head-actions">
            <label className="switch" title="Rank species only: one row per species by pvpoke rank, IV columns hidden">
              <input type="checkbox" checked={ignoreIvs} onChange={e => setIgnoreIvs(e.target.checked)} />
              <span>Ignore IVs</span>
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => download(`ranked-${file.league}-filtered.json`, { ...file, pokemon: visible })}
            >
              Export JSON
            </button>
          </div>
        </header>
        {chips.length > 0 && (
          <div className="active-chips" aria-label="Active filters">
            {chips.map(c => (
              <button
                key={c.id}
                type="button"
                className="active-chip"
                onClick={() => setFilters(clearFilter(filters, c.id))}
                aria-label={`Remove filter ${c.label}`}
              >
                {c.label}
                <span aria-hidden="true">✕</span>
              </button>
            ))}
            <button type="button" className="link" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear all
            </button>
          </div>
        )}
        <RankedTable
          pokemon={visible}
          sort={sort}
          onSort={onSort}
          hideIvs={ignoreIvs}
          onOpen={p => openPokemon(p.evolvesFrom?.key ?? pokemonKey(p))}
        />
        <UnrankedList pokemon={unranked} />
      </section>
    </>
  );
}
