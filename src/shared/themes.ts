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
  sakura: {
    id: 'sakura',
    name: 'Sakura',
    tokens: {
      bg: '#1a1117',
      surface: '#22171e',
      'surface-2': '#2a1d24',
      'surface-3': '#3a2832',
      border: '#f7c6d91f',
      text: '#fbecf2',
      'text-dim': '#c7a6b5',
      accent: '#f4a6c3',
      'accent-soft': '#f4a6c32b',
      'on-accent': '#2a121d',
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
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.hasOwn(THEMES, value);
}
