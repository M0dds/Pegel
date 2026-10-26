/** Attribute on <html> for a moment after YT's view changed size (see yt-theme.ts). */
export const RESIZING_ATTR = 'pegel-resizing';
/** Longer than YT's own transitions (its drawer takes 0.2 s). */
const SETTLE_MS = 400;

/**
 * When a side panel opens or closes, YT's view changes size at once. Crossing
 * YT's breakpoint turns its sidebar into a drawer that slides away over the
 * already reflowed content, a few frames of half-shifted layout. While the
 * attribute is set, that drawer skips its transition. The resize event runs
 * before the frame's style update, so the change lands in the same frame.
 */
export function watchResize(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    const root = document.documentElement;
    root.setAttribute(RESIZING_ATTR, '');
    clearTimeout(timer);
    timer = setTimeout(() => root.removeAttribute(RESIZING_ATTR), SETTLE_MS);
  });
}
