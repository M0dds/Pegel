import type { View } from '@shared/types';

/** The subset of Electron's `Input` that shortcut matching needs. */
export interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

export type ShortcutAction =
  | { type: 'show'; view: View }
  | { type: 'toggleEq' }
  | { type: 'toggleSocial' }
  | { type: 'toggleMini' }
  | { type: 'reloadYt' }
  | { type: 'devtools' };

/**
 * Maps a key press to a Pegel action. Ctrl on Windows/Linux, ⌘ on macOS.
 * Esc only leaves Pegel pages; on the music view it belongs to YT.
 */
export function matchShortcut(
  input: KeyInput,
  platform: string,
  currentView: View,
  isDev: boolean,
): ShortcutAction | null {
  if (input.type !== 'keyDown') return null;
  const mod = platform === 'darwin' ? input.meta : input.control;
  const plainMod = mod && !input.alt && !input.shift;

  if (plainMod && input.key === ',') return { type: 'show', view: 'settings' };
  if (plainMod && input.key.toLowerCase() === 'e') return { type: 'toggleEq' };
  // Ctrl+F is YT's search, so friends & party live on U.
  if (plainMod && input.key.toLowerCase() === 'u') return { type: 'toggleSocial' };
  // YT's sidebar etc. do not always refresh by themselves (e.g. after creating a playlist).
  if ((plainMod && input.key.toLowerCase() === 'r') || (input.key === 'F5' && !mod)) {
    return { type: 'reloadYt' };
  }
  // macOS: ⌘M is a menu accelerator there (see menu.ts), so it never reaches this point.
  if (plainMod && input.key.toLowerCase() === 'm' && platform !== 'darwin') {
    return { type: 'toggleMini' };
  }
  if (input.key === 'Escape' && !mod && (currentView === 'settings' || currentView === 'welcome')) {
    return { type: 'show', view: 'music' };
  }
  if (isDev && input.key === 'F12') return { type: 'devtools' };
  return null;
}
