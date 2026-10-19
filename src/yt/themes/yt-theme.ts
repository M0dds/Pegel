import type { Theme, ThemeToken } from '@shared/themes';

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
    selector: '#progress-bar',
    vars: { '--paper-slider-active-color': 'accent', '--paper-progress-active-color': 'accent' },
  },
];

/**
 * CSS that recolours YT Music for a Pegel theme, or null for the standard
 * theme (YT's own look). Applied with webContents.insertCSS.
 */
export function buildYtThemeCss(theme: Theme): string | null {
  if (theme.id === 'standard') return null;
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
