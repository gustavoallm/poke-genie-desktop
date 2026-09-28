import { useMemo, useState } from 'react';
import { useApp } from '../appContext.ts';
import type { Inventory, League } from '../types.ts';
import { LEAGUE_SHORT, transferGroups, verdict, type KeepRule } from '../verdict.ts';
import { Sprite } from './Sprite.tsx';
import { Section, Segmented, Slider, TypePill } from './ui.tsx';

type Kind = 'all' | 'keep' | 'transfer' | 'check';

export function RarityBadge({ rarity }: { rarity: NonNullable<Inventory['pokemon'][number]['rarity']> }) {
  const label = rarity === 'ultrabeast' ? 'Ultra Beast' : rarity === 'mythical' ? 'Mythical' : 'Legendary';
  return (
    <abbr className={`rarity rarity--${rarity}`} title={`${label}: rare, think twice before transferring`}>
      {label}
    </abbr>
  );
}
const LEAGUES: League[] = ['great', 'ultra', 'master'];

export function BoxView({ inventory, rule, onRuleChange }: { inventory: Inventory; rule: KeepRule; onRuleChange: (r: KeepRule) => void }) {
  const { openPokemon } = useApp();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [keepFor, setKeepFor] = useState<League[]>([]);

  const rows = useMemo(() => inventory.pokemon.map(p => ({ p, v: verdict(p, rule) })), [inventory, rule]);
  const counts = useMemo(
    () => ({
      keep: rows.filter(r => r.v.kind === 'keep').length,
      transfer: rows.filter(r => r.v.kind === 'transfer').length,
      check: rows.filter(r => r.v.kind === 'check').length,
    }),
    [rows],
  );
  const q = search.trim().toLowerCase();
  const matches = (name: string, nickname: string | null) =>
    !q || name.toLowerCase().includes(q) || (nickname ?? '').toLowerCase().includes(q);
  const visible = rows
    .filter(r => kind === 'all' || r.v.kind === kind)
    .filter(r => !keepFor.length || keepFor.some(l => r.v.keep.includes(l)))
    .filter(r => matches(r.p.name, r.p.nickname))
    .sort((a, b) => a.p.name.localeCompare(b.p.name) || (b.p.cp ?? 0) - (a.p.cp ?? 0));
  const groups = useMemo(() => transferGroups(inventory.pokemon, rule), [inventory, rule]).filter(g =>
    g.transfer.some(t => matches(t.pokemon.name, t.pokemon.nickname)),
  );
  const toggleLeague = (l: League) => setKeepFor(ls => (ls.includes(l) ? ls.filter(x => x !== l) : [...ls, l]));

  return (
    <>
      <aside className="view-controls" aria-label="Box filters">
        <Section
          title="Filters"
          action={
            <button
              type="button"
              className="link"
              onClick={() => {
                setSearch('');
                setKind('all');
                setKeepFor([]);
              }}
            >
              Reset
            </button>
          }
        >
          <input
            type="search"
            className="input"
            placeholder="Search species or nickname"
            aria-label="Search"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Segmented
            label="Verdict"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'All' },
              { value: 'keep', label: 'Keep' },
              { value: 'transfer', label: 'Transfer' },
              { value: 'check', label: 'Check' },
            ]}
          />
          <div className="field-label spaced">Kept for</div>
          <div className="chip-grid">
            {LEAGUES.map(l => (
              <button
                key={l}
                type="button"
                aria-pressed={keepFor.includes(l)}
                className={`toggle-chip${keepFor.includes(l) ? ' on' : ''}`}
                onClick={() => toggleLeague(l)}
              >
                {LEAGUE_SHORT[l]}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Keep rule">
          <Slider
            label="Keep your best"
            min={1}
            max={5}
            value={rule.keepCopies}
            format={v => `${v} cop${v === 1 ? 'y' : 'ies'}`}
            onChange={keepCopies => onRuleChange({ ...rule, keepCopies })}
            hint="per species, per league"
          />
          <Slider
            label="Species in pvpoke top"
            min={25}
            max={300}
            step={25}
            value={rule.topSpecies}
            format={String}
            onChange={topSpecies => onRuleChange({ ...rule, topSpecies })}
            hint="of a league it can play"
          />
        </Section>
        <p className="field-hint side-note warn-note">
          Shiny, lucky, shadow, costume and event Pokémon aren't detected from the video: check before transferring.
        </p>
      </aside>

      <section className="view-main">
        <header className="view-head">
          <div>
            <h1>My box</h1>
            <p className="meta">
              {inventory.pokemon.length} Pokémon from {inventory.sources.length} videos ·{' '}
              <span className="count keep">{counts.keep} keep</span> · <span className="count transfer">{counts.transfer} transfer</span> ·{' '}
              <span className="count check">{counts.check} check</span>
            </p>
          </div>
        </header>

        {(kind === 'all' || kind === 'transfer') && groups.length > 0 && (
          <>
            <h3 className="block-title">Transfer suggestions</h3>
            <div className="transfer-groups">
              {groups.map(g => (
                <article key={g.speciesId} className="transfer-group">
                  <header>
                    <Sprite speciesId={g.speciesId} dex={g.dex} name={g.name} />
                    <div>
                      <div className="name">
                        {g.name}
                        {g.transfer[0].pokemon.rarity && <RarityBadge rarity={g.transfer[0].pokemon.rarity} />}
                      </div>
                      <div className="sub">
                        transfer {g.transfer.length} of {g.owned}
                      </div>
                    </div>
                  </header>
                  <ul>
                    {g.transfer.map(({ pokemon: p, verdict: v }) => (
                      <li key={p.key}>
                        <button type="button" className="transfer-row" onClick={() => openPokemon(p.key)}>
                          <span className="num">CP {p.cp}</span>
                          <span className="num">{p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.hp}` : '?'}</span>
                          {p.nickname && <span className="nick">{p.nickname}</span>}
                          <span className="sub reason">
                            {p.rarity && <RarityBadge rarity={p.rarity} />}
                            {v.reason}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </>
        )}

        {kind !== 'transfer' && (
          <>
            <h3 className="block-title">{kind === 'all' ? 'All Pokémon' : kind === 'keep' ? 'Keep' : 'Check these yourself'}</h3>
            <div className="table-wrap">
              <table className="ranked box-table">
                <thead>
                  <tr>
                    <th>Pokémon</th>
                    <th className="num">CP</th>
                    <th className="num">IVs</th>
                    <th>Verdict</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ p, v }) => (
                    <tr key={p.key} className="clickable" onClick={() => openPokemon(p.key)}>
                      <td>
                        <div className="mon">
                          <Sprite speciesId={p.speciesId} dex={p.dex} name={p.name} />
                          <div>
                            <div className="name">
                              {p.name}
                              {p.nickname && p.nickname.toLowerCase() !== (p.species ?? '').toLowerCase() && (
                                <span className="nick">{p.nickname}</span>
                              )}
                              {p.rarity && <RarityBadge rarity={p.rarity} />}
                            </div>
                            <div className="pills">
                              {(p.types ?? []).map(t => (
                                <TypePill key={t} type={t} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="num">{p.cp ?? '?'}</td>
                      <td className="num ivs">
                        {p.ivs
                          ? [p.ivs.atk, p.ivs.def, p.ivs.hp].map((x, i) => (
                              <span key={i} className={x === 15 ? 'iv max' : 'iv'}>
                                {x}
                              </span>
                            ))
                          : '?'}
                      </td>
                      <td>
                        <span className={`verdict-chip ${v.kind}`}>
                          {v.kind === 'keep' ? v.keep.map(l => LEAGUE_SHORT[l]).join(' · ') : v.kind}
                        </span>
                      </td>
                      <td className="sub why">{v.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && <p className="none">No Pokémon match.</p>}
            </div>
          </>
        )}
      </section>
    </>
  );
}
