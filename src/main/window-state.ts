import type { Rect } from '@shared/types';

/** Minimum part of the window that must be on screen to restore it there. */
const MIN_VISIBLE = { width: 120, height: 60 };

/**
 * True if enough of `rect` overlaps one of the work areas, so a window
 * restored there can still be grabbed (e.g. after a monitor was unplugged).
 */
export function isRectVisible(rect: Rect, workAreas: readonly Rect[]): boolean {
  return workAreas.some((area) => {
    const w = Math.min(rect.x + rect.width, area.x + area.width) - Math.max(rect.x, area.x);
    const h = Math.min(rect.y + rect.height, area.y + area.height) - Math.max(rect.y, area.y);
    return w >= MIN_VISIBLE.width && h >= MIN_VISIBLE.height;
  });
}
