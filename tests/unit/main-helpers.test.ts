import { describe, expect, it } from 'vitest';
import { matchShortcut, type KeyInput } from '../../src/main/shortcuts';
import { toChromeUserAgent } from '../../src/main/user-agent';
import { isRectVisible } from '../../src/main/window-state';

describe('toChromeUserAgent', () => {
  it('removes the Electron and app tokens', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) pegel/0.1.0 Chrome/146.0.7680.65 Electron/44.9.0 Safari/537.36';
    expect(toChromeUserAgent(ua, 'pegel')).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.65 Safari/537.36',
    );
  });

  it('matches the app name case-insensitively', () => {
    expect(toChromeUserAgent('A Pegel/1.0 Chrome/1 B', 'pegel')).toBe('A Chrome/1 B');
  });
});

describe('isRectVisible', () => {
  const screen = { x: 0, y: 0, width: 1920, height: 1040 };

  it('accepts a window on screen', () => {
    expect(isRectVisible({ x: 100, y: 100, width: 1280, height: 800 }, [screen])).toBe(true);
  });

  it('rejects a window on a monitor that is gone', () => {
    expect(isRectVisible({ x: 2200, y: 100, width: 1280, height: 800 }, [screen])).toBe(false);
  });

  it('rejects a window that only peeks in by a few pixels', () => {
    expect(isRectVisible({ x: 1900, y: 100, width: 1280, height: 800 }, [screen])).toBe(false);
  });

  it('accepts a window on a second monitor', () => {
    const second = { x: -1600, y: 0, width: 1600, height: 900 };
    expect(isRectVisible({ x: -1500, y: 50, width: 1000, height: 700 }, [screen, second])).toBe(
      true,
    );
  });
});

describe('matchShortcut', () => {
  const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
    type: 'keyDown',
    key: k,
    control: false,
    meta: false,
    alt: false,
    shift: false,
    ...mods,
  });

  it('opens settings with Ctrl+, on Windows and ⌘+, on macOS', () => {
    const settings = { type: 'show', view: 'settings' };
    expect(matchShortcut(key(',', { control: true }), 'win32', 'music', false)).toEqual(settings);
    expect(matchShortcut(key(',', { meta: true }), 'darwin', 'music', false)).toEqual(settings);
    expect(matchShortcut(key(',', { control: true }), 'darwin', 'music', false)).toBeNull();
  });

  it('toggles the equalizer with Ctrl+E / ⌘+E', () => {
    const toggle = { type: 'toggleEq' };
    expect(matchShortcut(key('e', { control: true }), 'win32', 'music', false)).toEqual(toggle);
    expect(matchShortcut(key('E', { meta: true }), 'darwin', 'settings', false)).toEqual(toggle);
    expect(
      matchShortcut(key('e', { control: true, shift: true }), 'win32', 'music', false),
    ).toBeNull();
  });

  it('toggles the mini player with Ctrl+M, on macOS via the menu instead', () => {
    expect(matchShortcut(key('m', { control: true }), 'win32', 'music', false)).toEqual({
      type: 'toggleMini',
    });
    // ⌘M is a menu accelerator on macOS, handled before input reaches the page.
    expect(matchShortcut(key('m', { meta: true }), 'darwin', 'music', false)).toBeNull();
  });

  it('reloads YT with F5 and Ctrl+R / ⌘R', () => {
    const reload = { type: 'reloadYt' };
    expect(matchShortcut(key('F5'), 'win32', 'music', false)).toEqual(reload);
    expect(matchShortcut(key('r', { control: true }), 'win32', 'settings', false)).toEqual(reload);
    expect(matchShortcut(key('r', { meta: true }), 'darwin', 'music', false)).toEqual(reload);
    expect(matchShortcut(key('r'), 'win32', 'music', false)).toBeNull();
  });

  it('leaves Escape to YT on the music view', () => {
    expect(matchShortcut(key('Escape'), 'win32', 'music', false)).toBeNull();
    expect(matchShortcut(key('Escape'), 'win32', 'offline', false)).toBeNull();
    expect(matchShortcut(key('Escape'), 'win32', 'settings', false)).toEqual({
      type: 'show',
      view: 'music',
    });
  });

  it('ignores key up and only offers devtools in development', () => {
    const keyUp = { ...key(',', { control: true }), type: 'keyUp' };
    expect(matchShortcut(keyUp, 'win32', 'music', false)).toBeNull();
    expect(matchShortcut(key('F12'), 'win32', 'music', false)).toBeNull();
    expect(matchShortcut(key('F12'), 'win32', 'music', true)).toEqual({ type: 'devtools' });
  });
});
