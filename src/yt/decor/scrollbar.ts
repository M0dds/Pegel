/** Attribute on <html> while the page has no vertical scrollbar (see yt-theme.ts). */
export const NO_SCROLLBAR_ATTR = 'pegel-no-scrollbar';
const CHECK_MS = 500;

/**
 * YT leaves room for a scrollbar next to the player bar even where none is
 * shown (player page, short pages), which leaves a gap at the right edge.
 * Marks <html> while there is no scrollbar so the CSS can close it.
 */
export function watchScrollbar(): void {
  const start = () => {
    const root = document.documentElement;
    const update = () => {
      const none = window.innerWidth - root.clientWidth <= 0;
      if (root.hasAttribute(NO_SCROLLBAR_ATTR) !== none) {
        root.toggleAttribute(NO_SCROLLBAR_ATTR, none);
      }
    };
    // Usually the root's width changes with the scrollbar, but not always (e.g.
    // when YT locks the page for the player view), so a light check backs it up.
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
