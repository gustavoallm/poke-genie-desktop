import { DEFAULT_FILTERS, type Confidence, type Filters } from '../filters.ts';
import { Section, Segmented, Slider, TypeChip } from './ui.tsx';

const IV_OFF = 4096;
const SP_OFF = 80;
const TOP_OFF = 300;
const CONFIDENCE: Confidence[] = ['high', 'medium', 'low'];

export function FilterPanel({ filters, types, onChange }: { filters: Filters; types: string[]; onChange: (f: Filters) => void }) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);
  const numberOrNull = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v)));

  return (
    <div className="filter-panel">
      <Section
        title="Filters"
        action={
          <button type="button" className="link" onClick={() => onChange(DEFAULT_FILTERS)}>
            Reset
          </button>
        }
      >
        <input
          type="search"
          className="input"
          placeholder="Search species or nickname"
          aria-label="Search"
          value={filters.search}
          onChange={e => set({ search: e.target.value })}
        />
      </Section>

      <Section
        title="Type"
        action={
          filters.types.length > 1 ? (
            <Segmented
              label="Type match"
              size="sm"
              value={filters.typeMatch}
              onChange={typeMatch => set({ typeMatch })}
              options={[
                { value: 'any', label: 'Any', title: 'Has at least one selected type' },
                { value: 'all', label: 'All', title: 'Has every selected type' },
              ]}
            />
          ) : undefined
        }
      >
        <div className="chip-grid">
          {types.map(t => (
            <TypeChip key={t} type={t} on={filters.types.includes(t)} onToggle={() => set({ types: toggle(filters.types, t) })} />
          ))}
        </div>
      </Section>

      <Section title="PvP readiness">
        <Segmented
          label="Readiness"
          value={filters.readiness}
          onChange={readiness => set({ readiness })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'ready', label: 'Ready', title: 'Already at its level for the league cap' },
            { value: 'candy', label: 'Candy', title: 'Needs powering up, but not past level 40' },
            { value: 'xl', label: 'XL', title: 'Needs XL candy (past level 40)' },
          ]}
        />
        <div className="field-label spaced">Elite TM move</div>
        <Segmented
          label="Elite move"
          value={filters.elite}
          onChange={elite => set({ elite })}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'hide', label: 'Not needed', title: 'Hide mons whose pvpoke moveset needs an Elite TM' },
            { value: 'only', label: 'Needed', title: 'Only mons whose pvpoke moveset needs an Elite TM' },
          ]}
        />
      </Section>

      <Section title="Strength">
        <Slider
          label="IV rank ≤"
          min={16}
          max={IV_OFF}
          step={16}
          value={filters.ivRankMax ?? IV_OFF}
          format={v => (v >= IV_OFF ? 'any' : `#${v}`)}
          onChange={v => set({ ivRankMax: v >= IV_OFF ? null : v })}
        />
        <Slider
          label="Stat product ≥"
          min={SP_OFF}
          max={100}
          step={0.5}
          value={filters.spMin ?? SP_OFF}
          format={v => (v <= SP_OFF ? 'any' : `${v}%`)}
          onChange={v => set({ spMin: v <= SP_OFF ? null : v })}
        />
        <Slider
          label="pvpoke top"
          min={5}
          max={TOP_OFF}
          step={5}
          value={filters.topN ?? TOP_OFF}
          format={v => (v >= TOP_OFF ? 'any' : `${v}`)}
          onChange={v => set({ topN: v >= TOP_OFF ? null : v })}
        />
        <div className="field">
          <div className="field-label">CP</div>
          <div className="range-inputs">
            <input
              className="input"
              type="number"
              min={0}
              placeholder="min"
              aria-label="Minimum CP"
              value={filters.cpMin ?? ''}
              onChange={e => set({ cpMin: numberOrNull(e.target.value) })}
            />
            <span>–</span>
            <input
              className="input"
              type="number"
              min={0}
              placeholder="max"
              aria-label="Maximum CP"
              value={filters.cpMax ?? ''}
              onChange={e => set({ cpMax: numberOrNull(e.target.value) })}
            />
          </div>
        </div>
      </Section>

      <Section title="Other">
        <div className="chip-grid">
          {CONFIDENCE.map(c => (
            <button
              key={c}
              type="button"
              aria-pressed={filters.confidence.includes(c)}
              className={`toggle-chip conf-${c}${filters.confidence.includes(c) ? ' on' : ''}`}
              onClick={() => set({ confidence: toggle(filters.confidence, c) })}
            >
              {c} confidence
            </button>
          ))}
        </div>
        <label className="switch">
          <input type="checkbox" checked={filters.bestCopy} onChange={e => set({ bestCopy: e.target.checked })} />
          <span>Best copy per species</span>
        </label>
      </Section>
    </div>
  );
}
