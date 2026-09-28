import type { RankedPokemon } from '../types.ts';
import { READINESS_LABEL, readiness, type Sort, type SortKey } from '../filters.ts';
import { Sprite } from './Sprite.tsx';
import { moveLabel } from '../teams.ts';
import { TypePill } from './ui.tsx';

interface Props {
  pokemon: RankedPokemon[];
  sort: Sort;
  onSort: (key: SortKey) => void;
  /** Species-only mode: hide the columns that depend on this copy's IVs. */
  hideIvs?: boolean;
  onOpen?: (p: RankedPokemon) => void;
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  title,
  numeric = true,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  title?: string;
  numeric?: boolean;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={numeric ? 'num' : undefined} title={title} aria-sort={active ? (sort.reversed ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className={active ? 'sort active' : 'sort'} onClick={() => onSort(sortKey)}>
        {label}
        <span aria-hidden="true" className="sort-arrow">
          {active ? (sort.reversed ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export function Move({ name }: { name: string }) {
  const elite = name.endsWith('*');
  return (
    <span className="move">
      {name.replace(/\*$/, '')}
      {elite && (
        <abbr className="elite" title="Elite/legacy move: needs an Elite TM if it doesn't know it">
          E
        </abbr>
      )}
    </span>
  );
}

function Level({ p }: { p: RankedPokemon }) {
  const r = readiness(p);
  if (!r || !p.iv50) return <>{p.level ?? '?'}</>;
  if (r === 'ready')
    return (
      <span className="ready" title="Already at its level for the league cap">
        L{p.iv50.level}
      </span>
    );
  return (
    <span className={`power-up ${r}`} title={READINESS_LABEL[r]}>
      L{p.level}
      <span className="arrow">→</span>
      {p.iv50.level}
    </span>
  );
}

export function RankedTable({ pokemon, sort, onSort, hideIvs = false, onOpen }: Props) {
  const header = { sort, onSort };
  return (
    <div className="table-wrap">
      <table className="ranked">
        <thead>
          <tr>
            <SortHeader label="Pokémon" sortKey="default" numeric={false} title="Default order: pvpoke score, then IV rank" {...header} />
            {!hideIvs && (
              <>
                <SortHeader label="CP" sortKey="cp" {...header} />
                <th className="num">IVs</th>
                <SortHeader label="IV rank" sortKey="iv50" title="Stat-product rank among 4096 spreads, max level 50" {...header} />
                <SortHeader label="SP %" sortKey="sp" title="Stat product vs the #1 spread" {...header} />
                <th className="num" title="Current level → level at the league cap">
                  Level
                </th>
                <SortHeader label="L51" sortKey="iv51" title="IV rank with best buddy (max level 51)" {...header} />
              </>
            )}
            <SortHeader label="pvpoke" sortKey="pvp" title="Species rank and score in pvpoke's league rankings" {...header} />
            <th>pvpoke moveset</th>
            <th>Conf.</th>
          </tr>
        </thead>
        <tbody>
          {pokemon.map(p => (
            <tr
              key={`${p.source}-${p.firstTimeSec}`}
              className={onOpen ? 'clickable' : undefined}
              onClick={onOpen ? () => onOpen(p) : undefined}
            >
              <td>
                <div className="mon">
                  <Sprite speciesId={p.speciesId} dex={p.dex} name={p.csvName ?? p.species ?? ''} />
                  <div>
                    <div className="name">
                      {p.csvName ?? p.species}
                      {p.nickname && p.nickname.toLowerCase() !== (p.species ?? '').toLowerCase() && (
                        <span className="nick">{p.nickname}</span>
                      )}
                      {p.evolvesFrom && (
                        <abbr className="evolve-flag" title={`Your ${p.evolvesFrom.name} with these IVs, evolved at its current level`}>
                          evolve {p.evolvesFrom.name}
                        </abbr>
                      )}
                      {p.formAlternatives && (
                        <abbr
                          className="form-flag"
                          title={`Form not confirmed: the video didn't show its types. Could also be ${p.formAlternatives.map(moveLabel).join(', ')}.`}
                        >
                          form?
                        </abbr>
                      )}
                    </div>
                    <div className="pills">
                      {(p.types ?? []).map(t => (
                        <TypePill key={t} type={t} />
                      ))}
                    </div>
                  </div>
                </div>
              </td>
              {!hideIvs && (
                <>
                  <td className="num">{p.cp ?? '?'}</td>
                  <td className="num ivs">
                    {p.ivs
                      ? [p.ivs.atk, p.ivs.def, p.ivs.hp].map((v, i) => (
                          <span key={i} className={v === 15 ? 'iv max' : 'iv'}>
                            {v}
                          </span>
                        ))
                      : '?'}
                  </td>
                  <td className="num">
                    {p.iv50 ? (
                      <>
                        #{p.iv50.rank}
                        <span className="sub"> /4096</span>
                      </>
                    ) : (
                      '?'
                    )}
                  </td>
                  <td className="num">{p.iv50 ? p.iv50.statProductPct.toFixed(1) : '?'}</td>
                  <td className="num">
                    <Level p={p} />
                  </td>
                  <td className="num">{p.iv51 ? `#${p.iv51.rank}` : '?'}</td>
                </>
              )}
              <td className="num">
                <span className="rank-badge">#{p.speciesRank}</span>
                <span className="sub"> {p.speciesScore?.toFixed(1)}</span>
              </td>
              <td className="moves">
                {p.recommendedMoves && (
                  <>
                    <Move name={p.recommendedMoves.fast} />
                    <span className="sep">/</span>
                    <Move name={p.recommendedMoves.charged[0]} />
                    <span className="sep">·</span>
                    <Move name={p.recommendedMoves.charged[1]} />
                  </>
                )}
              </td>
              <td>
                <span className={`badge badge--${p.confidence}`}>{p.confidence}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!pokemon.length && <p className="none">No Pokémon match these filters.</p>}
    </div>
  );
}
