import type { Theme, ThemeToken } from '@shared/themes';
import { SELECTORS } from '../selectors';
import { NO_SCROLLBAR_ATTR, PLAYER_BAR_HEIGHT_VAR } from '../decor/scrollbar';
import { buildYtDragCss } from '../dnd/styles';
import { RESIZING_ATTR } from '../decor/resize';

/**
 * YT Music's own colour variables (defined on `html`), grouped by the Pegel
 * token that replaces them. Only colours: no layout, spacing or sizes.
 * Found via DevTools on music.youtube.com (October 2026). Variables for the
 * light/inverse palette, live chat and brand assets (logo) stay untouched.
 */
export const YT_COLOR_ROLES: Partial<Record<ThemeToken, readonly string[]>> = {
  bg: [
    '--ytmusic-background',
    '--ytmusic-general-background-c',
    '--yt-deprecated-general-background-c',
    '--ytmusic-color-black4',
    '--ytmusic-nav-bar',
    '--ytmusic-detail-header',
    '--ytmusic-player-page-background',
  ],
  surface: ['--yt-sys-color-baseline--base-background', '--yt-deprecated-general-background-b'],
  'surface-2': [
    '--ytmusic-player-bar-background',
    '--ytmusic-color-black1',
    '--ytmusic-search-background',
    '--ytmusic-brand-background-solid',
    '--ytmusic-dropdown-item-hover-background',
    '--ytmusic-general-background-a',
    '--ytmusic-color-black2',
    '--ytmusic-alert-with-actions-background',
    '--ytmusic-multiselect-form-footer-background',
    '--yt-sys-color-baseline--raised-background',
    '--yt-sys-color-baseline--menu-background',
    '--yt-deprecated-general-background-a',
    '--yt-deprecated-black-1',
    '--paper-listbox-background-color',
    '--paper-menu-background-color',
    '--paper-dialog-background-color',
    '--dark-theme-background-color',
  ],
  'surface-3': [
    '--ytmusic-dialog-background-color',
    '--ytmusic-dropdown-background',
    '--ytmusic-search-border',
  ],
  border: ['--ytmusic-divider'],
  text: [
    '--ytmusic-text-primary',
    '--ytmusic-color-white1',
    '--ytmusic-overlay-text-primary',
    '--yt-sys-color-baseline--text-primary',
    '--yt-sys-color-baseline--overlay-text-primary',
    '--yt-primary-text-color',
    '--dark-theme-text-color',
    '--paper-listbox-color',
    '--paper-menu-color',
  ],
  'text-dim': [
    '--ytmusic-text-secondary',
    '--ytmusic-color-grey2',
    '--ytmusic-overlay-text-secondary',
    '--ytmusic-player-bar-ink-color',
    '--yt-sys-color-baseline--text-secondary',
    '--yt-sys-color-baseline--overlay-text-secondary',
    '--yt-deprecated-grey-2',
  ],
  accent: [
    '--ytmusic-playback-progress-color',
    '--ytmusic-brand-link-text',
    '--ytmusic-call-to-action',
    '--ytmusic-focus-active',
    '--ytmusic-setting-item-toggle-active',
    '--yt-sys-color-baseline--call-to-action',
    '--paper-toggle-button-checked-bar-color',
    '--paper-toggle-button-checked-button-color',
    '--paper-checkbox-checked-color',
    '--paper-input-container-focus-color',
  ],
};

/**
 * Colours YT sets directly on single elements instead of via the `html`
 * variables (e.g. the red gradient of the progress bar). Still variables only.
 */
export const YT_ELEMENT_COLORS: readonly {
  selector: string;
  vars: Readonly<Record<string, ThemeToken>>;
}[] = [
  {
    selector: SELECTORS.progressBar,
    vars: {
      '--paper-slider-active-color': 'accent',
      '--paper-progress-active-color': 'accent',
      // The knob shown on hover/focus takes YT's brand red via this variable.
      // Set only here, so YT's red elsewhere (logo, badges) stays.
      '--yt-sys-color-baseline--static-brand-red': 'accent',
    },
  },
];

/**
 * Small visual polish so YT's scrollbars and context menus match Pegel's own
 * dropdown, in every theme. Deliberate, limited exception to "colours only":
 * scrollbar width (15 → 10 px, YT's own scrollbar-color reset so the styling
 * applies), menu corner radius and shadow (box-shadow, no layout change), and
 * no horizontal scrollbar inside menus (it only appears because the vertical
 * one takes width).
 */
/** Width of Pegel's scrollbars on the YT page. */
const SCROLLBAR_PX = 10;

export function buildYtPolishCss(theme: Theme): string {
  const t = theme.tokens;
  return `
/* YT sets scrollbar-color everywhere, which makes Chromium ignore ::-webkit-scrollbar. */
* { scrollbar-color: auto !important; scrollbar-width: auto !important; }
::-webkit-scrollbar { width: ${SCROLLBAR_PX}px !important; height: ${SCROLLBAR_PX}px !important; }
/* YT keeps the player bar this far from the right edge for its 12 px scrollbar:
   match Pegel's scrollbar, and no gap at all where the page has none. */
html { --ytmusic-scrollbar-width: ${SCROLLBAR_PX}px !important; }
html[${NO_SCROLLBAR_ATTR}] { --ytmusic-scrollbar-width: 0px !important; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent !important; }
::-webkit-scrollbar-thumb {
  background: ${t['surface-3']} !important; border: 3px solid transparent !important;
  border-radius: 999px !important; background-clip: padding-box !important;
}
::-webkit-scrollbar-thumb:hover { background-color: ${t['text-dim']} !important; }
::-webkit-scrollbar-button { display: none !important; }

${SELECTORS.menuPopup} {
  background: ${t['surface-3']} !important;
  border-radius: 10px !important;
  box-shadow: 0 0 0 1px ${t.border}, 0 12px 32px #0009 !important;
}
${SELECTORS.menuList} { background: transparent !important; }
/* Height 0 hides only the horizontal bar. Changing the menu's overflow instead would break
   wheel scrolling: YT's iron-dropdown only treats "auto"/"scroll" as scrollable. */
${SELECTORS.menuPopup}::-webkit-scrollbar { width: 8px !important; height: 0 !important; }
${SELECTORS.menuPopup}::-webkit-scrollbar-button { display: none !important; }
/* The menu itself is surface-3, so the thumb needs a lighter tone to be visible. */
${SELECTORS.menuPopup}::-webkit-scrollbar-thumb {
  background-color: ${t['text-dim']}66 !important; border-width: 2px !important;
}
${SELECTORS.menuPopup}::-webkit-scrollbar-thumb:hover { background-color: ${t['text-dim']} !important; }

/* The page scrollbar runs the full height, also beside the player bar (a fixed
   overlay), which looked like a gap. While the bar is shown, its height is set on
   <body> (measured in src/yt/decor/scrollbar.ts): track and thumb stop above it,
   and the scrollbar's own background beside it takes the bar's colour.
   Prefixed selectors (html or body before the pseudo-element) never match the page (viewport)
   scrollbar; only the global pseudo-elements do, and it takes its variables
   from <body>. Every scrollbar inside the page gets the height reset to 0. */
body * { ${PLAYER_BAR_HEIGHT_VAR}: 0px; }
::-webkit-scrollbar-track {
  margin-bottom: var(${PLAYER_BAR_HEIGHT_VAR}, 0px) !important;
}
::-webkit-scrollbar {
  --pegel-bar-top: calc(100% - var(${PLAYER_BAR_HEIGHT_VAR}, 0px));
  background:
    /* the 2 px progress track line along the bar's top edge */
    linear-gradient(
      to bottom,
      transparent var(--pegel-bar-top),
      #ffffff1a var(--pegel-bar-top),
      #ffffff1a calc(var(--pegel-bar-top) + 2px),
      transparent calc(var(--pegel-bar-top) + 2px)
    ),
    linear-gradient(
      to bottom,
      transparent var(--pegel-bar-top),
      var(--ytmusic-player-bar-background) var(--pegel-bar-top)
    ) !important;
}

/* Right after a size change (side panel), the sidebar drawer switches without sliding. */
html[${RESIZING_ATTR}] ${SELECTORS.guideDrawer},
html[${RESIZING_ATTR}] ${SELECTORS.guideDrawer} * { transition: none !important; }

/* YT bug: the gradient is one 287 px tile repeated down the whole page (stripes). */
${SELECTORS.browseGradient} { background-repeat: no-repeat !important; }
`;
}

/**
 * Pegel themes: instead of the cover-art glow at the top of browse pages, a
 * dark gradient with a hint of the accent that fades into the theme
 * background. Translucent over the page colour (looks the same as fading to
 * `bg`), so a theme effect behind the content (aurora, stars) shows through.
 * Hides the art with opacity only, so nothing moves.
 */
export function buildYtBackgroundCss(theme: Theme): string {
  const { accent, bg } = theme.tokens;
  return `
/* YT paints the page itself with a fixed #030303, not via its variables. */
html, body { background-color: ${bg} !important; }
${SELECTORS.browseBackground} { opacity: 0 !important; }
${SELECTORS.browseGradient} {
  background-image: linear-gradient(180deg, color-mix(in srgb, ${accent} 12%, transparent) 0, transparent 420px) !important;
  background-size: 100% 420px !important;
}
`;
}

/** YT colour variables (and element colours) mapped to a theme's tokens. */
export function buildYtColorVarsCss(theme: Theme): string {
  const lines: string[] = [];
  for (const [token, vars] of Object.entries(YT_COLOR_ROLES) as [ThemeToken, string[]][]) {
    for (const name of vars) lines.push(`  ${name}: ${theme.tokens[token]} !important;`);
  }
  // `html[dark]` raises specificity above YT's `html[music-web-color-migration]`.
  let css = `html, html[dark] {\n${lines.join('\n')}\n}\n`;
  for (const { selector, vars } of YT_ELEMENT_COLORS) {
    const decls = Object.entries(vars).map(
      ([name, token]) => `  ${name}: ${theme.tokens[token]} !important;`,
    );
    css += `html ${selector} {\n${decls.join('\n')}\n}\n`;
  }
  return css;
}

/**
 * CSS for the YT view: the polish and the playlist drag & drop for every theme; Pegel themes add their
 * colours and background (the standard theme keeps YT's look). Applied with insertCSS.
 */
export function buildYtThemeCss(theme: Theme): string {
  const polish = buildYtPolishCss(theme) + buildYtDragCss(theme);
  if (theme.id === 'standard') return polish;
  return polish + buildYtColorVarsCss(theme) + buildYtBackgroundCss(theme) + buildYtGlowCss(theme);
}

/**
 * Neon only: the progress bar glows like a neon tube (cyberpunk look). A
 * drop-shadow on the bar, nothing moves and the bar stays fully usable.
 */
export function buildYtGlowCss(theme: Theme): string {
  if (theme.id !== 'neon') return '';
  const { accent } = theme.tokens;
  return `
html ${SELECTORS.progressBar} {
  filter: drop-shadow(0 0 3px color-mix(in srgb, ${accent} 70%, transparent)) !important;
}
`;
}
