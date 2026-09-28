import { createContext, useContext } from 'react';
import type { InventoryPokemon } from './types.ts';
import { DEFAULT_RULE, type KeepRule } from './verdict.ts';

export interface AppContextValue {
  /** Opens the 3-league drawer for one owned Pokémon (key = `<source>@<firstTimeSec>`). */
  openPokemon: (key: string) => void;
  byKey: Map<string, InventoryPokemon>;
  rule: KeepRule;
}

export const AppContext = createContext<AppContextValue>({ openPokemon: () => {}, byKey: new Map(), rule: DEFAULT_RULE });
export const useApp = () => useContext(AppContext);
