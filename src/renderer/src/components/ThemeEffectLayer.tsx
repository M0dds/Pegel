import { useEffect, useRef } from 'react';
import { createThemeEffectLayer } from '@shared/effects';
import type { ThemeId } from '@shared/types';

interface Props {
  theme: ThemeId;
  /** Only the parts over the content (the side panels have no background of their own). */
  only?: 'front';
}

/** The theme's effect in Pegel's own UI: title bar, side panels and Pegel pages. */
export function ThemeEffectLayer({ theme, only }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = createThemeEffectLayer(document, theme, 'ui', only);
    if (layer) host.current?.append(layer);
    return () => layer?.remove();
  }, [theme, only]);

  return <div ref={host} />;
}
