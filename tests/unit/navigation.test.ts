import { describe, expect, it } from 'vitest';
import { isAllowedInApp, isExternalWebUrl, isPlaylistCreated } from '../../src/main/navigation';

describe('isAllowedInApp', () => {
  it.each([
    'https://music.youtube.com/',
    'https://music.youtube.com/playlist?list=PL123',
    'https://accounts.google.com/ServiceLogin?continue=x',
    'https://accounts.google.de/accounts/SetSID',
    'https://accounts.google.co.uk/accounts/SetSID',
    'https://accounts.youtube.com/accounts/SetSID',
    'https://consent.youtube.com/m?continue=x',
    'https://consent.google.com/ml',
    'https://www.youtube.com/signin?action_handle_signin=true&next=https%3A%2F%2Fmusic.youtube.com%2F',
    'https://www.youtube.com/logout',
  ])('allows %s', (url) => {
    expect(isAllowedInApp(url)).toBe(true);
  });

  it.each([
    'http://music.youtube.com/',
    'https://www.youtube.com/watch?v=abc',
    'https://www.youtube.com/signinfoo',
    'https://youtube.com/',
    'https://myaccount.google.com/',
    'https://www.google.com/search?q=x',
    'https://accounts.google.com.evil.example/',
    'https://music.youtube.com.evil.example/',
    'https://example.com/',
    'file:///C:/Windows/',
    'not a url',
  ])('blocks %s', (url) => {
    expect(isAllowedInApp(url)).toBe(false);
  });
});

describe('isExternalWebUrl', () => {
  it('accepts web links only', () => {
    expect(isExternalWebUrl('https://example.com')).toBe(true);
    expect(isExternalWebUrl('http://example.com')).toBe(true);
    expect(isExternalWebUrl('file:///etc/passwd')).toBe(false);
    expect(isExternalWebUrl('javascript:alert(1)')).toBe(false);
    expect(isExternalWebUrl('ms-settings:privacy')).toBe(false);
  });
});

describe('isPlaylistCreated', () => {
  const url = 'https://music.youtube.com/youtubei/v1/playlist/create?prettyPrint=false';

  it('detects a successful create call', () => {
    expect(isPlaylistCreated(url, 'POST', 200)).toBe(true);
  });

  it('ignores failures, other methods and other endpoints', () => {
    expect(isPlaylistCreated(url, 'POST', 401)).toBe(false);
    expect(isPlaylistCreated(url, 'GET', 200)).toBe(false);
    expect(
      isPlaylistCreated('https://music.youtube.com/youtubei/v1/browse/edit_playlist', 'POST', 200),
    ).toBe(false);
    expect(isPlaylistCreated('https://evil.example/youtubei/v1/playlist/create', 'POST', 200)).toBe(
      false,
    );
    expect(isPlaylistCreated('not a url', 'POST', 200)).toBe(false);
  });
});
