import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { readableTextOn, typeColor } from '../typeColors.ts';
import { matchOptions, type ComboOption } from './comboboxMatch.ts';
import { Sprite } from './Sprite.tsx';
import type { League } from '../types.ts';
import { LEAGUE_ICON } from '../verdict.ts';

/** A row of mutually exclusive buttons (league switch, shield count, readiness…). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={o.value === value ? 'on' : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The league's ball, when there is an image for it. */
export function LeagueIcon({ league }: { league: League }) {
  const src = LEAGUE_ICON[league];
  return src ? <img className="league-icon" src={src} alt="" aria-hidden="true" /> : null;
}

export function TypePill({ type }: { type: string }) {
  const bg = typeColor(type);
  return (
    <span className="type-pill" style={{ background: bg, color: readableTextOn(bg) }}>
      {type}
    </span>
  );
}

/** Toggleable type chip for filters: colored when on, muted when off. */
export function TypeChip({ type, on, onToggle }: { type: string; on: boolean; onToggle: () => void }) {
  const bg = typeColor(type);
  return (
    <button
      type="button"
      aria-pressed={on}
      className={on ? 'type-chip on' : 'type-chip'}
      onClick={onToggle}
      style={on ? { background: bg, color: readableTextOn(bg), borderColor: bg } : { borderColor: bg }}
    >
      {type}
    </button>
  );
}

/** Labelled range slider; `format` renders the current value, `emptyLabel` is shown at the "off" end. */
export function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  format = String,
  hint,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
        <span className="field-value">{format(value)}</span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

/** Searchable select: type to filter, ↑/↓ to move, Enter to pick, Esc to close. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  label,
  disabled,
}: {
  options: ComboOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  label: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find(o => o.value === value) ?? null;
  const shown = useMemo(() => matchOptions(options, query).slice(0, 60), [options, query]);

  const pick = (o: ComboOption) => {
    onChange(o.value);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(a => Math.min(shown.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && open && shown[active]) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div className={`combobox${disabled ? ' disabled' : ''}`}>
      {selected && !open && (
        <span className="combobox-selected">
          <Sprite speciesId={selected.speciesId ?? null} dex={selected.dex} name={selected.label} />
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : selected ? selected.label : ''}
        className={selected && !open ? 'has-value' : undefined}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      {selected && !disabled && (
        <button type="button" className="combobox-clear" aria-label={`Clear ${label}`} onClick={() => onChange(null)}>
          ✕
        </button>
      )}
      {open && (
        <ul id={listId} role="listbox" className="combobox-list">
          {shown.length === 0 && <li className="combobox-empty">No match</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={i === active ? 'active' : undefined}
              onMouseDown={e => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <Sprite speciesId={o.speciesId ?? null} dex={o.dex} name={o.label} />
              <span className="combobox-text">
                <span>{o.label}</span>
                {o.sub && <small>{o.sub}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="side-section">
      <header>
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

const cellClass = (r: number) => (r >= 550 ? 'win' : r <= 450 ? 'loss' : 'close');

/** Team members (rows) × meta Pokémon (columns), colored win/close/loss for one shield scenario. */
export function Heatmap({
  members,
  meta,
  matchups,
}: {
  members: Array<{ label: string; sub?: string }>;
  meta: Array<{ speciesId: string; name: string; dex?: number }>;
  matchups: number[][][];
}) {
  const [shields, setShields] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const cols = showAll ? meta : meta.slice(0, 20);
  return (
    <div className="heatmap">
      <div className="heatmap-bar">
        <Segmented
          label="Shields"
          size="sm"
          value={shields}
          onChange={setShields}
          options={[0, 1, 2].map(s => ({ value: s, label: `${s} shield${s === 1 ? '' : 's'}` }))}
        />
        <span className="legend">
          <i className="win" /> win <i className="close" /> close <i className="loss" /> loss
        </span>
        {meta.length > 20 && (
          <button type="button" className="link" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Top 20 only' : `All ${meta.length} meta`}
          </button>
        )}
      </div>
      <div className="heatmap-scroll">
        <table>
          <thead>
            <tr>
              <th />
              {cols.map(t => (
                <th key={t.speciesId} title={t.name} scope="col">
                  <Sprite speciesId={t.speciesId} dex={t.dex} name={t.name} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m, r) => (
              <tr key={r}>
                <th scope="row">
                  <span>{m.label}</span>
                  {m.sub && <small>{m.sub}</small>}
                </th>
                {cols.map((t, c) => {
                  const rating = matchups[r][c][shields];
                  return (
                    <td key={t.speciesId} className={cellClass(rating)} title={`${m.label} vs ${t.name}: ${rating}`}>
                      {Math.round(rating / 10)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
