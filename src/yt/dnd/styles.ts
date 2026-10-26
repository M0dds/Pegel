import type { Theme } from '@shared/themes';
import { SELECTORS } from '../selectors';

/** Class names shared by the drag engine (src/yt/dnd/drag.ts) and its CSS. */
export const DND = {
  root: 'pegel-dnd',
  /** On <html> while a drag is running. */
  dragging: 'pegel-dnd-dragging',
  /** On <html> once a track is held (pressed a moment, or moved): the grabbing hand. */
  holding: 'pegel-dnd-holding',
  /** On <html> with "Bewegung reduzieren": fades only. */
  reduced: 'pegel-dnd-reduced',
  /** The row a track was picked up from. */
  source: 'pegel-dnd-source',
  /** Sidebar playlists that take the track. */
  target: 'pegel-dnd-target',
  /** …the one under the pointer. */
  over: 'pegel-dnd-over',
  /** …that already contains the track. */
  has: 'pegel-dnd-has',
  /** The drop target while the card flies in and YT answers. */
  landing: 'pegel-dnd-landing',
  /** Confirmation after a drop: added, or not (duplicate, error). */
  done: 'pegel-dnd-done',
  nope: 'pegel-dnd-nope',
  /** Stagger index of a target, so the sidebar lights up from top to bottom. */
  indexVar: '--pegel-dnd-i',
} as const;

const EASE_OUT = 'cubic-bezier(.2, .8, .2, 1)';
/** Ease with a small overshoot (badge, tick). */
const EASE_BACK = 'cubic-bezier(.34, 1.56, .64, 1)';

/**
 * CSS for dragging tracks into playlists, in every theme (the standard theme
 * gets YT's red accent from its tokens). Everything Pegel draws lives in its
 * own fixed layer with `pointer-events: none`; on YT's elements only colours,
 * opacity and transforms change, never the layout.
 */
export function buildYtDragCss(theme: Theme): string {
  const t = theme.tokens;
  const entry = SELECTORS.guideEntry;
  const item = SELECTORS.guideEntryItem;
  const root = `#${DND.root}`;
  return `
html {
  --pegel-dnd-accent: ${t.accent};
  --pegel-dnd-on-accent: ${t['on-accent']};
  --pegel-dnd-card: ${t['surface-2']};
  --pegel-dnd-chip: ${t['surface-3']};
  --pegel-dnd-border: ${t.border};
  --pegel-dnd-text: ${t.text};
  --pegel-dnd-dim: ${t['text-dim']};
  --pegel-dnd-bg: ${t.bg};
}
/* Hover shows the normal hand, also in the queue (YT: "move"); the grabbing hand
   only appears once a track is actually held. */
${SELECTORS.queueRow} { cursor: pointer !important; }
html.${DND.holding}, html.${DND.holding} *,
html.${DND.dragging}, html.${DND.dragging} * {
  cursor: grabbing !important;
}
html.${DND.dragging}, html.${DND.dragging} * { user-select: none !important; }

${root} {
  position: fixed; inset: 0; z-index: 2147483000;
  pointer-events: none; contain: strict; overflow: hidden;
  font-family: Roboto, "Noto Naskh Arabic UI", Arial, sans-serif;
}
${root} * { box-sizing: border-box; }

/* The card. Its position, tilt and scale are set per frame (transform only);
   the anchor (cover centre) is at 30/30. */
${root} .card {
  position: absolute; left: 0; top: 0; width: 252px; height: 60px;
  transform-origin: 30px 30px; will-change: transform, opacity;
  opacity: 0; transition: opacity .12s ease-out;
}
${root} .card.shown { opacity: 1; }
${root} .card.fading { opacity: 0; transition-duration: .16s; }
${root} .card.flying { transition: none; }
${root} .face {
  position: absolute; inset: 0;
  display: flex; align-items: center; gap: 11px; padding: 8px 14px 8px 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--pegel-dnd-card) 97%, transparent);
  box-shadow:
    0 0 0 1px var(--pegel-dnd-border),
    inset 0 1px 0 #ffffff0f,
    0 22px 44px -14px #000000c0,
    0 8px 18px -6px #00000080;
  transform-origin: 30px 30px;
  transition: opacity .2s ${EASE_OUT}, transform .26s ${EASE_OUT};
}
${root} .cover {
  flex: none; width: 44px; height: 44px; border-radius: 7px; object-fit: cover;
  background: color-mix(in srgb, var(--pegel-dnd-accent) 16%, var(--pegel-dnd-chip));
  display: grid; place-items: center; color: var(--pegel-dnd-accent);
}
${root} .cover svg { width: 20px; height: 20px; }
${root} .text { min-width: 0; display: grid; gap: 3px; }
${root} .title, ${root} .artist {
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 1.2;
}
${root} .title { color: var(--pegel-dnd-text); font-size: 13.5px; font-weight: 600; }
${root} .artist { color: var(--pegel-dnd-dim); font-size: 12px; }

/* Over a playlist the card condenses to its cover, so the playlist's name stays readable. */
${root} .chip {
  position: absolute; left: 4px; top: 4px; width: 52px; height: 52px;
  border-radius: 10px; overflow: hidden;
  background: color-mix(in srgb, var(--pegel-dnd-accent) 16%, var(--pegel-dnd-chip));
  box-shadow: 0 0 0 1px var(--pegel-dnd-border), 0 14px 30px -10px #000000c0, 0 5px 12px -4px #00000080;
  display: grid; place-items: center; color: var(--pegel-dnd-accent);
  opacity: 0; transform: scale(.82);
  transition: opacity .2s ${EASE_OUT}, transform .3s ${EASE_BACK};
}
${root} .chip img { width: 100%; height: 100%; object-fit: cover; display: block; }
${root} .chip svg { width: 22px; height: 22px; }
${root} .card.over .face { opacity: 0; transform: scale(.9); }
${root} .card.over .chip { opacity: 1; transform: none; }

/* "+" (or a tick: already in there) at the chip's corner, like a copy badge. */
${root} .badge {
  position: absolute; left: 42px; top: -6px; width: 22px; height: 22px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--pegel-dnd-accent); color: var(--pegel-dnd-on-accent);
  box-shadow: 0 0 0 2px var(--pegel-dnd-card), 0 3px 8px #0008;
  opacity: 0; transform: scale(.4);
  transition: opacity .16s ease-out, transform .32s ${EASE_BACK};
}
${root} .badge svg { width: 12px; height: 12px; }
${root} .badge .tick { display: none; }
${root} .card.over .badge { opacity: 1; transform: none; }
${root} .card.has .badge { background: var(--pegel-dnd-chip); color: var(--pegel-dnd-dim); }
${root} .card.has .badge .plus { display: none; }
${root} .card.has .badge .tick { display: block; }

/* Confirmation on the playlist: a tick that draws itself, then fades. */
${root} .confirm {
  position: absolute; left: 0; top: 0; width: 22px; height: 22px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--pegel-dnd-accent); color: var(--pegel-dnd-on-accent);
  /* A ring in the page colour sets it apart from the text it may sit on. */
  box-shadow: 0 0 0 2.5px var(--pegel-dnd-bg), 0 2px 8px #0007;
  animation: pegel-dnd-confirm 1.5s ${EASE_OUT} forwards;
}
${root} .confirm svg { width: 12px; height: 12px; }
${root} .confirm path { stroke-dasharray: 20; stroke-dashoffset: 20; animation: pegel-dnd-draw .32s .12s ease-out forwards; }
@keyframes pegel-dnd-confirm {
  0% { opacity: 0; transform: scale(.3); }
  16% { opacity: 1; transform: scale(1.08); }
  26% { transform: scale(1); }
  78% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(.9); }
}
@keyframes pegel-dnd-draw { to { stroke-dashoffset: 0; } }

/* The sidebar during a drag: playlists that take the track come into focus,
   one after another; everything else steps back. */
html.${DND.dragging} ${entry} {
  transition: opacity .34s ease-out;
}
html.${DND.dragging} ${entry}:not(.${DND.target}) { opacity: .4; }
${entry}.${DND.target} > ${item}, ${entry}.${DND.landing} > ${item},
${entry}.${DND.done} > ${item}, ${entry}.${DND.nope} > ${item} {
  border-radius: 8px;
  transition: background-color .22s ease-out, box-shadow .22s ease-out, transform .3s ${EASE_OUT} !important;
  transition-delay: calc(var(${DND.indexVar}, 0) * 16ms) !important;
}
html.${DND.dragging} ${entry}.${DND.target} > ${item} {
  background-color: color-mix(in srgb, var(--pegel-dnd-accent) 7%, transparent) !important;
}
html.${DND.dragging} ${entry}.${DND.target}.${DND.over} > ${item}, ${entry}.${DND.landing} > ${item} {
  transition-delay: 0s !important;
  background-color: color-mix(in srgb, var(--pegel-dnd-accent) 22%, transparent) !important;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--pegel-dnd-accent) 80%, transparent);
  transform: scale(1.025);
}
html.${DND.dragging} ${entry}.${DND.target}.${DND.has}.${DND.over} > ${item} {
  background-color: color-mix(in srgb, var(--pegel-dnd-dim) 12%, transparent) !important;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--pegel-dnd-dim) 55%, transparent);
}
${entry}.${DND.done} > ${item} { animation: pegel-dnd-pulse .9s ease-out; border-radius: 8px; }
${entry}.${DND.nope} > ${item} { animation: pegel-dnd-shake .42s ${EASE_OUT}; }
@keyframes pegel-dnd-pulse {
  0% { background-color: color-mix(in srgb, var(--pegel-dnd-accent) 34%, transparent); }
  100% { background-color: transparent; }
}
@keyframes pegel-dnd-shake {
  0%, 100% { transform: none; }
  20% { transform: translateX(-4px); }
  45% { transform: translateX(3px); }
  70% { transform: translateX(-1.5px); }
}

/* The row the track came from fades a little while it is away. */
.${DND.source} { opacity: .42 !important; transition: opacity .2s ease-out !important; }

/* "Bewegung reduzieren": colours and fades only. */
html.${DND.reduced} ${entry} > ${item} { transform: none !important; animation: none !important; }
html.${DND.reduced} ${entry} { transition-delay: 0s !important; }
html.${DND.reduced} ${root} .chip, html.${DND.reduced} ${root} .face,
html.${DND.reduced} ${root} .badge { transform: none !important; }
html.${DND.reduced} ${root} .confirm { animation: pegel-dnd-fade 1.5s ease-out forwards; }
html.${DND.reduced} ${root} .confirm path { animation: none; stroke-dashoffset: 0; }
@keyframes pegel-dnd-fade { 0%, 100% { opacity: 0; } 15%, 80% { opacity: 1; } }
`;
}
