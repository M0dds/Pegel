import { useEffect, useRef } from 'react';
import { createThemeEffectLayer } from '@shared/effects';
import type { ThemeId } from '@shared/types';

/** The theme's effect in Pegel's own UI: title bar, EQ panel and Pegel pages. */
export function ThemeEffectLayer({ theme }: { theme: ThemeId }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = createThemeEffectLayer(document, theme, 'ui');
    if (layer) host.current?.append(layer);
    return () => layer?.remove();
  }, [theme]);

  return <div ref={host} />;
}
