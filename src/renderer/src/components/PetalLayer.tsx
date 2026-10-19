import { useEffect, useRef } from 'react';
import { createPetalLayer } from '@shared/petals';

/** Petals in Pegel's own UI: visible over the title bar, EQ panel and Pegel pages. */
const UI_PETALS = 8;

export function PetalLayer({ color }: { color: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = createPetalLayer(document, color, UI_PETALS);
    host.current?.append(layer);
    return () => layer.remove();
  }, [color]);

  return <div ref={host} />;
}
