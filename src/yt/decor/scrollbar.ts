import { SELECTORS } from '../selectors';

/** Attribute on <html> while the page has no vertical scrollbar (see yt-theme.ts). */
export const NO_SCROLLBAR_ATTR = 'pegel-no-scrollbar';
/**
 * Height of the player bar's visible part, set on <body> while it is on screen:
 * the page (viewport) scrollbar takes its styles from <body>.
 */
export const PLAYER_BAR_HEIGHT_VAR = '--pegel-player-bar-height';
const CHECK_MS = 500;

/**
 * Keeps the page scrollbar in line with YT's player bar, which is a fixed
 * overlay at the bottom:
 * - YT leaves room for a scrollbar next to the bar even where none is shown
 *   (player page, short pages), which leaves a gap at the right edge.
 * - The scrollbar runs past the bar to the bottom edge.
 * Marks <html> with what the CSS in yt-theme.ts needs. Measured instead of
 * relying on YT's layout attributes, which are not always set.
 */
export function watchScrollbar(): void {
  const start = () => {
    const root = document.documentElement;
    let barHeight = -1;
    const update = () => {
      const none = window.innerWidth - root.clientWidth <= 0;
      if (root.hasAttribute(NO_SCROLLBAR_ATTR) !== none) {
        root.toggleAttribute(NO_SCROLLBAR_ATTR, none);
      }
      const rect = document.querySelector(SELECTORS.playerBar)?.getBoundingClientRect();
      const visible = Math.round(
        rect && rect.height > 0 ? Math.max(0, window.innerHeight - Math.max(0, rect.top)) : 0,
      );
      const height = rect && rect.top < window.innerHeight ? Math.min(visible, rect.height) : 0;
      if (height === barHeight) return;
      barHeight = height;
      if (height > 0) document.body.style.setProperty(PLAYER_BAR_HEIGHT_VAR, `${height}px`);
      else document.body.style.removeProperty(PLAYER_BAR_HEIGHT_VAR);
    };
    // Usually the root's width changes with the scrollbar, but not always (e.g.
    // when YT locks the page for the player view), and the bar slides in and out
    // without any event here, so a light check backs it up.
    new ResizeObserver(update).observe(root);
    window.addEventListener('resize', update);
    setInterval(update, CHECK_MS);
    update();
  };
  // The preload runs before the document exists.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
