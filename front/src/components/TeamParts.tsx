import { moveLabel } from '../teams.ts';
import type { RankedPokemon, TeamMember, Threat } from '../types.ts';
import { Sprite } from './Sprite.tsx';
import { Slider, TypePill } from './ui.tsx';
import { useApp } from '../appContext.ts';

export const STYLE_DEFAULT = 0.2;

export function StyleSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Slider
      label="Team style"
      min={0}
      max={1}
      step={0.1}
      value={value}
      onChange={onChange}
      format={v => (v <= 0.2 ? 'Consistent' : v >= 0.7 ? 'Spice' : 'Balanced')}
      hint={
        <span className="slider-ends">
          <span>Proven meta picks</span>
          <span>Best raw matchups</span>
        </span>
      }
    />
  );
}

export function IgnoreIvsToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch" title="Judge each species with pvpoke's standard IVs and level instead of your copy's">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
      <span>Ignore IVs (species only)</span>
    </label>
  );
}

export function MemberCard({ member, pokemon }: { member: TeamMember; pokemon?: RankedPokemon }) {
  const c = member.candidate;
  const { openPokemon } = useApp();
  const needsLevels = c.currentLevel != null && c.level != null && c.level > c.currentLevel;
  return (
    <article
      className="member-card clickable"
      onClick={() => openPokemon(c.evolvesFrom?.key ?? c.key)}
      title="Show how it ranks in every league"
    >
      <div className="member-role">{member.role}</div>
      <div className="member-body">
        <Sprite speciesId={c.speciesId} dex={c.dex} name={c.name} />
        <div className="member-info">
          <div className="name">
            {c.name}
            {c.nickname && c.nickname.toLowerCase() !== c.name.toLowerCase() && <span className="nick">{c.nickname}</span>}
            {c.evolvesFrom && (
              <abbr className="evolve-flag" title={`Evolve your ${c.evolvesFrom.name} with these IVs`}>
                evolve {c.evolvesFrom.name}
              </abbr>
            )}
          </div>
          <div className="pills">
            {(pokemon?.types ?? []).map(t => (
              <TypePill key={t} type={t} />
            ))}
          </div>
          <div className="sub">
            {c.ivsIgnored ? (
              <span className="assumed" title="Simulated with pvpoke's standard IVs and level for this league">
                pvpoke IVs {c.ivs ? `${c.ivs.atk}/${c.ivs.def}/${c.ivs.hp}` : ''} · L{c.level}
              </span>
            ) : (
              <>
                CP {c.cp ?? '?'} · {c.ivs ? `${c.ivs.atk}/${c.ivs.def}/${c.ivs.hp}` : '?'} ·{' '}
                {needsLevels ? (
                  <span className={`power-up ${c.level! > 40 ? 'xl' : 'candy'}`} title="Simulated at its level for the league cap">
                    L{c.currentLevel}
                    <span className="arrow">→</span>
                    {c.level}
                  </span>
                ) : (
                  <span className="ready">L{c.level}</span>
                )}
              </>
            )}
          </div>
          <div className="moves">
            {c.moves.map((id, i) => (
              <span key={id} className="move">
                {i === 1 ? <span className="sep">/</span> : i === 2 ? <span className="sep">·</span> : null}
                {moveLabel(id)}
                {c.assumedElite.includes(id) && (
                  <abbr className="elite" title="Elite/legacy move: needs an Elite TM if it doesn't know it">
                    E
                  </abbr>
                )}
              </span>
            ))}
            {c.assumedMoves && (
              <span className="assumed" title="Moves weren't in the video; pvpoke's recommended moveset is assumed">
                assumed
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ThreatList({ threats }: { threats: Threat[] }) {
  return (
    <ul className="threat-list">
      {threats.map(t => (
        <li
          key={t.speciesId}
          className={t.coverage < 500 ? 'bad' : undefined}
          title={`Best answer rating ${t.coverage}${t.losers.length ? ` · ${t.losers.length} member(s) lose` : ''}`}
        >
          <Sprite speciesId={t.speciesId} dex={t.dex} name={t.name} />
          <span className="name">{t.name}</span>
          <span className="threat-score">{t.coverage}</span>
        </li>
      ))}
    </ul>
  );
}

export function BeatenBar({ value }: { value: number }) {
  return (
    <span className="beaten" title="Share of the weighted meta at least one member beats">
      <span className="bar">
        <i style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      beats {Math.round(value * 100)}% of the meta
    </span>
  );
}
