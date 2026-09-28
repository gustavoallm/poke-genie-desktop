export interface ComboOption {
  value: string;
  label: string;
  sub?: string;
  speciesId?: string | null;
  dex?: number;
}

/** Case-insensitive match on label and sub text; labels that start with the query come first. */
export function matchOptions(options: ComboOption[], query: string): ComboOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const hits = options.filter(o => o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q));
  const starts = hits.filter(o => o.label.toLowerCase().startsWith(q));
  return [...starts, ...hits.filter(o => !starts.includes(o))];
}
