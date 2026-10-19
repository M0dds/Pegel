import { describe, expect, it } from 'vitest';
import { findPegelLink, isSameContent, parsePegelLink } from '../../src/shared/links';
import { isNewerVersion } from '../../src/shared/update';

const ID = 'aBcDeFgHi_-';

describe('parsePegelLink', () => {
  it('keeps YT Music tracks, playlists, albums and artists', () => {
    expect(parsePegelLink(`https://music.youtube.com/watch?v=${ID}&si=xyz`)).toEqual({
      url: `https://music.youtube.com/watch?v=${ID}`,
      kind: 'track',
    });
    expect(parsePegelLink(`https://music.youtube.com/watch?v=${ID}&list=PL123abc`)?.url).toBe(
      `https://music.youtube.com/watch?v=${ID}&list=PL123abc`,
    );
    expect(parsePegelLink('https://music.youtube.com/playlist?list=PLabc_123&si=1')).toEqual({
      url: 'https://music.youtube.com/playlist?list=PLabc_123',
      kind: 'playlist',
    });
    expect(parsePegelLink('https://music.youtube.com/browse/MPREb_abc123')?.kind).toBe('album');
    expect(parsePegelLink('https://music.youtube.com/channel/UCabc123')?.kind).toBe('artist');
  });

  it('turns YouTube links into YT Music links', () => {
    expect(parsePegelLink(`https://youtu.be/${ID}?si=share`)?.url).toBe(
      `https://music.youtube.com/watch?v=${ID}`,
    );
    expect(parsePegelLink(`https://www.youtube.com/watch?v=${ID}&t=42`)?.url).toBe(
      `https://music.youtube.com/watch?v=${ID}`,
    );
    expect(parsePegelLink(`https://m.youtube.com/watch?v=${ID}`)?.kind).toBe('track');
    expect(parsePegelLink(`https://youtube.com/shorts/${ID}`)?.kind).toBe('track');
    expect(parsePegelLink('https://www.youtube.com/playlist?list=PLxyz')?.url).toBe(
      'https://music.youtube.com/playlist?list=PLxyz',
    );
  });

  it('rejects everything else', () => {
    for (const url of [
      'https://music.youtube.com/',
      'https://music.youtube.com/library',
      'https://music.youtube.com/watch?v=short',
      'https://www.youtube.com/@someone',
      'https://www.youtube.com/watch?v=bad id here',
      `https://evil.example/watch?v=${ID}`,
      `https://music.youtube.com.evil.example/watch?v=${ID}`,
      `javascript:alert(1)`,
      'kein Link',
    ]) {
      expect(parsePegelLink(url), url).toBeNull();
    }
  });
});

describe('findPegelLink', () => {
  it('finds the link in a chat message', () => {
    expect(findPegelLink(`hör mal rein: https://youtu.be/${ID} 🔥`)?.kind).toBe('track');
  });

  it('ignores texts without a YT link and very long texts', () => {
    expect(findPegelLink('https://example.com')).toBeNull();
    expect(findPegelLink('')).toBeNull();
    expect(findPegelLink(`${'x'.repeat(3000)} https://youtu.be/${ID}`)).toBeNull();
  });
});

describe('isSameContent', () => {
  it('compares tracks by video id', () => {
    expect(
      isSameContent(
        `https://youtu.be/${ID}`,
        `https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`,
      ),
    ).toBe(true);
    expect(isSameContent(`https://youtu.be/${ID}`, 'https://music.youtube.com/')).toBe(false);
  });
});

describe('isNewerVersion', () => {
  it('compares release versions', () => {
    expect(isNewerVersion('v1.0.1', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('v1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('0.9.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0-beta.1')).toBe(true);
  });

  it('ignores pre-releases and invalid tags', () => {
    expect(isNewerVersion('v2.0.0-beta.1', '1.0.0')).toBe(false);
    expect(isNewerVersion('latest', '1.0.0')).toBe(false);
  });
});
