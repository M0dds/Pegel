import { createPetalLayer, PETAL_ROOT_ID } from '@shared/petals';
import type { YtEffects } from '@shared/types';
import type { Visualizer } from '../audio/visualizer';

/** Petals over the YT page: a few, it is decoration and must not distract. */
const YT_PETALS = 14;

/** Applies the effects the main process asks for (petals, visualizer). */
export class YtDecor {
  private petalColor: string | null = null;

  constructor(readonly visualizer: Visualizer) {}

  apply(effects: YtEffects): void {
    this.visualizer.setEnabled(effects.visualizer, effects.accent);
    const wanted = effects.petals ? effects.accent : null;
    if (wanted === this.petalColor) return;
    document.getElementById(PETAL_ROOT_ID)?.remove();
    this.petalColor = wanted;
    if (!wanted) return;
    const mount = () => {
      // The colour may have changed while waiting for the body.
      if (this.petalColor !== wanted || document.getElementById(PETAL_ROOT_ID)) return;
      // At the end of <body>, next to (not inside) YT's app element, so YT never
      // re-renders or removes it.
      document.body.append(createPetalLayer(document, wanted, YT_PETALS));
    };
    // Effects arrive while the page is still loading. An element added to <html>
    // before <body> exists stopped the YT view from producing frames, so wait for it.
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
  }
}
