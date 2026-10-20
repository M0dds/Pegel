import type { ThemeId } from './types';

/** Token names exactly as in design/mockup.html. */
export const THEME_TOKENS = [
  'bg',
  'surface',
  'surface-2',
  'surface-3',
  'border',
  'text',
  'text-dim',
  'accent',
  'accent-soft',
  'on-accent',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

export interface Theme {
  id: ThemeId;
  /** Display name (German UI). */
  name: string;
  tokens: Record<ThemeToken, string>;
}

export const THEMES: Record<ThemeId, Theme> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    tokens: {
      bg: '#030303',
      surface: '#0f0f0f',
      'surface-2': '#1d1d1d',
      'surface-3': '#2a2a2a',
      border: '#ffffff1a',
      text: '#f1f1f1',
      'text-dim': '#aaaaaa',
      accent: '#ff1f4b',
      'accent-soft': '#ff1f4b26',
      'on-accent': '#ffffff',
    },
  },
  // Strong contrast: near-black plum background, light pink accent.
  sakura: {
    id: 'sakura',
    name: 'Sakura',
    tokens: {
      bg: '#0f080c',
      surface: '#170d13',
      'surface-2': '#21131b',
      'surface-3': '#331d29',
      border: '#ffc2dc26',
      text: '#fff1f7',
      'text-dim': '#d6adc0',
      accent: '#ffb6d3',
      'accent-soft': '#ffb6d330',
      'on-accent': '#3a0c22',
    },
  },
  nordlicht: {
    id: 'nordlicht',
    name: 'Nordlicht',
    tokens: {
      bg: '#070d10',
      surface: '#0d171b',
      'surface-2': '#142328',
      'surface-3': '#1d3137',
      border: '#9ff0de1a',
      text: '#e9f6f3',
      'text-dim': '#8fb0aa',
      accent: '#4fd6b8',
      'accent-soft': '#4fd6b826',
      'on-accent': '#04241d',
    },
  },
  bernstein: {
    id: 'bernstein',
    name: 'Bernstein',
    tokens: {
      bg: '#0f0b07',
      surface: '#17110b',
      'surface-2': '#231a11',
      'surface-3': '#32251a',
      border: '#ffd9a01a',
      text: '#f7eee3',
      'text-dim': '#b9a48c',
      accent: '#f2a93b',
      'accent-soft': '#f2a93b26',
      'on-accent': '#2b1a03',
    },
  },
  // High-contrast pairs: dark tinted background, accent from the opposite side of the wheel.
  mitternacht: {
    id: 'mitternacht',
    name: 'Mitternacht',
    tokens: {
      bg: '#0a0f1e',
      surface: '#10172a',
      'surface-2': '#172036',
      'surface-3': '#212c47',
      border: '#c8d6ff1a',
      text: '#eef2ff',
      'text-dim': '#9ca8c6',
      accent: '#ffc857',
      'accent-soft': '#ffc85726',
      'on-accent': '#2a1d00',
    },
  },
  lagune: {
    id: 'lagune',
    name: 'Lagune',
    tokens: {
      bg: '#061a1c',
      surface: '#0a2326',
      'surface-2': '#0f2d31',
      'surface-3': '#173c41',
      border: '#9fe9ef1a',
      text: '#e8f7f7',
      'text-dim': '#93b9ba',
      accent: '#ff7a5c',
      'accent-soft': '#ff7a5c26',
      'on-accent': '#2b0d05',
    },
  },
  glut: {
    id: 'glut',
    name: 'Glut',
    tokens: {
      bg: '#121110',
      surface: '#1a1817',
      'surface-2': '#23201e',
      'surface-3': '#302c29',
      border: '#ffd8c21a',
      text: '#f6efea',
      'text-dim': '#b5a9a1',
      accent: '#ff6a2b',
      'accent-soft': '#ff6a2b26',
      'on-accent': '#2a0e00',
    },
  },
  wald: {
    id: 'wald',
    name: 'Wald',
    tokens: {
      bg: '#0b1410',
      surface: '#101c16',
      'surface-2': '#16251d',
      'surface-3': '#20332a',
      border: '#c9f2d81a',
      text: '#ecf6ef',
      'text-dim': '#9eb7a7',
      accent: '#ff8fb1',
      'accent-soft': '#ff8fb126',
      'on-accent': '#3a0d1c',
    },
  },
  // Cyberpunk: deep violet night, cyan accent, magenta-tinted lines.
  neon: {
    id: 'neon',
    name: 'Neon',
    tokens: {
      bg: '#08061a',
      surface: '#0e0a24',
      'surface-2': '#160f33',
      'surface-3': '#24174d',
      border: '#ff4fd833',
      text: '#f1edff',
      'text-dim': '#ada3d6',
      accent: '#2ef2ff',
      'accent-soft': '#2ef2ff26',
      'on-accent': '#00262b',
    },
  },
  mono: {
    id: 'mono',
    name: 'Mono',
    tokens: {
      bg: '#0b0b0b',
      surface: '#131313',
      'surface-2': '#1c1c1c',
      'surface-3': '#282828',
      border: '#ffffff1a',
      text: '#f2f2f2',
      'text-dim': '#a8a8a8',
      accent: '#f2f2f2',
      'accent-soft': '#ffffff1f',
      'on-accent': '#111111',
    },
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.hasOwn(THEMES, value);
}
