import { useEffect, useRef } from 'react';
import { createThemeEffectLayer, type EffectLayers } from '@shared/effects';
import type { ThemeId } from '@shared/types';

interface Props {
  theme: ThemeId;
  /** Main window: the background behind everything plus the front over the title bar; panel card: front only. */
  layers: EffectLayers;
}

/** The theme's effect in Pegel's own UI. */
export function ThemeEffectLayer({ theme, layers }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const { back, front } = layers;

  useEffect(() => {
    const layer = createThemeEffectLayer(document, theme, { back, front });
    if (layer) host.current?.append(layer);
    return () => layer?.remove();
  }, [theme, back, front]);

  return <div ref={host} />;
}
