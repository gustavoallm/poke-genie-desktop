import { useEffect, useState } from 'react';
import { getSprite } from '../pokeapi.ts';

export function Sprite({ speciesId, dex, name }: { speciesId: string | null; dex?: number; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!speciesId) return;
    let alive = true;
    getSprite(speciesId, dex)
      .then(u => {
        if (alive) setUrl(u);
      })
      .catch(() => {
        /* offline: keep the placeholder */
      });
    return () => {
      alive = false;
    };
  }, [speciesId, dex]);
  return url ? (
    <img className="sprite" src={url} alt={name} width={48} height={48} loading="lazy" />
  ) : (
    <span className="sprite sprite--empty" aria-hidden="true" />
  );
}
