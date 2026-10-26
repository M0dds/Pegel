import { createThemeEffectLayer, FX_ROOT_ID } from '@shared/effects';
import type { ThemeId, YtEffects } from '@shared/types';
import type { Visualizer } from '../audio/visualizer';

/** Applies the effects the main process asks for (theme effect, visualizer). */
export class YtDecor {
  private theme: ThemeId | null = null;

  constructor(readonly visualizer: Visualizer) {}

  apply(effects: YtEffects): void {
    this.visualizer.setEnabled(effects.visualizer, effects.accent);
    const wanted = effects.themeEffect;
    if (wanted === this.theme) return;
    document.getElementById(FX_ROOT_ID)?.remove();
    this.theme = wanted;
    if (!wanted) return;
    const mount = () => {
      // The theme may have changed while waiting for the body.
      if (this.theme !== wanted || document.getElementById(FX_ROOT_ID)) return;
      // Only what floats over YT's content: the background behind it is drawn
      // once by the main window, which shows through the see-through YT view.
      const layer = createThemeEffectLayer(document, wanted, { front: 'large' });
      // At the end of <body>, next to (not inside) YT's app element, so YT never
      // re-renders or removes it.
      if (layer) document.body.append(layer);
    };
    // Effects arrive while the page is still loading. An element added to <html>
    // before <body> exists stopped the YT view from producing frames, so wait for it.
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
  }
}
